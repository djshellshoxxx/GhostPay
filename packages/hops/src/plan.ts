import { getAddress, isAddress } from 'viem/utils';
import { assertTestnet } from './guard.js';
import { EXTERNAL_DEST_WARNING, POOL_NOTE, RESUME_NOTE, SINGLE_RELAYER_WARNING, singleSweepLine } from './labels.js';
import { drawDelays } from './rand.js';
import { assignRelayers, DIRECT_RELAYER_ID } from './relayerSelect.js';
import {
  HopError,
  MAX_LEG_FEE_BPS,
  type CryptoLike,
  type HopAddressSource,
  type HopLeg,
  type HopPlan,
  type HopPlanInput,
} from './types.js';

const BPS = 10_000n;

/** Default `hops` for a handoff mode (HOP-POOL-1): 0 with a pool exit, else 2. */
export function defaultHops(handoff: 'none' | 'pool-exit'): 0 | 2 {
  return handoff === 'pool-exit' ? 0 : 2;
}

function newPlanId(rng: CryptoLike): string {
  const b = new Uint8Array(16);
  rng.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Builds a forwarding plan: `k` sweeps `S1 -> S2 -> ... -> S(k+1)`, where `S(k+1)` is the final
 * destination `D` (self-derived or external).
 *
 * @remarks Pure apart from `addrs.next()` and the preview quotes. Nothing is signed. Every hop
 * sweeps the full balance, so `amountIn_j = amountIn_(j-1) - fee_(j-1)` exactly.
 * @security Weak mode: refuses without `ackWeak === true`. Does not add unlinkability (see README).
 *
 * @param input Plan input.
 * @param deps Address source, random source, clock.
 * @returns Plan with leg 1 `waiting` and the rest `planned`.
 * @throws {HopError} See {@link HopErrorCode}.
 */
export async function planHops(
  input: HopPlanInput,
  deps: { readonly addrs: HopAddressSource; readonly rng: CryptoLike; readonly nowMs: () => number },
): Promise<HopPlan> {
  assertTestnet(input.chainId);
  if ((input.ackWeak as unknown) !== true) throw new HopError('NOT_ACKED', 'weak-mode acknowledgement required');
  if (input.stage === 'post-exit') throw new HopError('HANDOFF_REJECTED', 'forwarding after a pool exit is rejected');
  if (!input.tokenSupportsPermit) throw new HopError('NO_PERMIT', 'token has no ERC-2612 permit');
  if (!Number.isInteger(input.hops) || input.hops < 0 || input.hops > 4) throw new HopError('INVALID_INPUT', 'hops must be 0..4');
  if (input.hops === 0 && input.handoff !== 'pool-exit') throw new HopError('INVALID_INPUT', 'zero hops only with pool-exit handoff');
  if (input.handoff === 'pool-exit' && input.hops > 2) throw new HopError('HANDOFF_REJECTED', 'at most 2 hops before a pool');
  if (!isAddress(input.source, { strict: false }) || !isAddress(input.token, { strict: false })) {
    throw new HopError('INVALID_INPUT', 'address');
  }
  if (typeof input.sourceBalance !== 'bigint' || input.sourceBalance <= 0n) throw new HopError('INVALID_INPUT', 'balance');
  if (!Number.isInteger(input.maxTotalFeeBps) || input.maxTotalFeeBps < 0 || input.maxTotalFeeBps > 10_000) {
    throw new HopError('INVALID_INPUT', 'maxTotalFeeBps');
  }
  const d = input.delay;
  if (
    !Number.isSafeInteger(d.minMs) || !Number.isSafeInteger(d.maxMs) || !Number.isSafeInteger(d.maxTotalMs) ||
    d.minMs < 0 || d.maxMs < d.minMs || d.maxTotalMs > 7 * 86_400_000 || input.hops * d.minMs > d.maxTotalMs
  ) {
    throw new HopError('INVALID_INPUT', 'delay bounds');
  }
  const source = getAddress(input.source);
  const token = getAddress(input.token);
  const now = deps.nowMs();
  const k = input.hops;
  const relayerIds = assignRelayers(input.relayers, input.relayerSelection, k, deps.rng);
  const delays = drawDelays(k, d, deps.rng);

  const seen = new Set<string>([source]);
  const dests: { address: ReturnType<typeof getAddress>; index: number | null }[] = [];
  for (let j = 1; j <= k; j++) {
    const last = j === k;
    if (last && input.finalDestination.kind === 'external') {
      if (!isAddress(input.finalDestination.address, { strict: false })) throw new HopError('INVALID_INPUT', 'external address');
      const a = getAddress(input.finalDestination.address);
      if (seen.has(a)) throw new HopError('ADDRESS_REUSE', 'destination repeats an earlier address');
      seen.add(a);
      dests.push({ address: a, index: null });
      continue;
    }
    const n = await deps.addrs.next();
    const a = getAddress(n.address);
    if (seen.has(a) || (deps.addrs.isUsed !== undefined && (await deps.addrs.isUsed(a)))) {
      throw new HopError('ADDRESS_REUSE', 'address already used');
    }
    seen.add(a);
    dests.push({ address: a, index: n.index });
  }

  let amount = input.sourceBalance;
  let cumDelay = 0;
  let from = source;
  let fromIndex = input.sourceIndex;
  const legs: HopLeg[] = [];
  for (let j = 1; j <= k; j++) {
    const q = await input.quotes(j, amount);
    if (typeof q.fee !== 'bigint' || q.fee < 0n) throw new HopError('INVALID_INPUT', 'quote');
    if (amount <= q.fee) throw new HopError('AMOUNT_TOO_SMALL', 'hop amount does not exceed fee');
    if (q.fee * BPS > amount * BigInt(MAX_LEG_FEE_BPS)) throw new HopError('FEE_CAP', 'leg fee above 300 bps');
    const dest = dests[j - 1] as (typeof dests)[number];
    const delayMs = delays[j - 1] as number;
    cumDelay += delayMs;
    legs.push({
      index: j - 1,
      from,
      to: dest.address,
      fromIndex,
      toIndex: dest.index,
      delayMs,
      dueAtMs: now + cumDelay,
      relayerId: relayerIds[j - 1] as string,
      expectedAmountIn: amount,
      expectedFee: q.fee,
      state: j === 1 ? 'waiting' : 'planned',
    });
    amount -= q.fee;
    from = dest.address;
    fromIndex = dest.index ?? -1;
  }
  if (k > 0) {
    const total = ((input.sourceBalance - amount) * BPS) / input.sourceBalance;
    if (total > BigInt(input.maxTotalFeeBps)) throw new HopError('FEE_CAP', 'total modelled fee above limit');
  }
  const plan: HopPlan = {
    id: newPlanId(deps.rng),
    chainId: input.chainId,
    token,
    source,
    sourceIndex: input.sourceIndex,
    legs,
    createdAtMs: now,
    weak: true,
    ackWeakAtMs: now,
    handoff: input.handoff,
    delay: { minMs: d.minMs, maxMs: d.maxMs },
    relayerSelection: input.relayerSelection,
    relayerCount: new Set(input.relayers.map((r) => r.id)).size,
    externalDestination: k > 0 && input.finalDestination.kind === 'external',
  };
  validatePlan(plan);
  return plan;
}

/**
 * Structural validation (HOP-REQ-2, 3, 12). Throws on any violation; returns normally otherwise.
 *
 * @param plan Plan to check.
 * @throws {HopError} `CONSOLIDATION`, `ADDRESS_REUSE`, `ILLEGAL_TRANSITION`, `NOT_ACKED`, `INVALID_INPUT`, `AMOUNT_TOO_SMALL`.
 */
export function validatePlan(plan: HopPlan): void {
  assertTestnet(plan.chainId);
  if ((plan.weak as unknown) !== true || !(plan.ackWeakAtMs > 0)) throw new HopError('NOT_ACKED', 'weak-mode acknowledgement missing');
  const k = plan.legs.length;
  if (k > 4 || (k === 0 && plan.handoff !== 'pool-exit')) throw new HopError('INVALID_INPUT', 'hop count');
  if (plan.relayerSelection === 'direct' && k !== 1) throw new HopError('ILLEGAL_TRANSITION', 'direct requires one hop');
  const seen = new Set<string>([plan.source]);
  let prevTo = plan.source;
  let prevOut: bigint | null = null;
  for (const [i, leg] of plan.legs.entries()) {
    if (leg.index !== i) throw new HopError('INVALID_INPUT', 'leg index');
    if (leg.from !== prevTo) throw new HopError('CONSOLIDATION', 'legs are not a single chain');
    if (seen.has(leg.to)) throw new HopError('ADDRESS_REUSE', 'destination repeats an earlier address');
    seen.add(leg.to);
    if (prevOut !== null && leg.expectedAmountIn !== prevOut) throw new HopError('CONSOLIDATION', 'residue between legs');
    if (leg.expectedAmountIn <= leg.expectedFee) throw new HopError('AMOUNT_TOO_SMALL', 'hop amount does not exceed fee');
    if (leg.expectedFee * BPS > leg.expectedAmountIn * BigInt(MAX_LEG_FEE_BPS)) throw new HopError('FEE_CAP', 'leg fee above 300 bps');
    if (plan.relayerSelection === 'direct' !== (leg.relayerId === DIRECT_RELAYER_ID)) throw new HopError('INVALID_INPUT', 'relayer id');
    prevTo = leg.to;
    prevOut = leg.expectedAmountIn - leg.expectedFee;
  }
}

function bps2(fee: bigint, amount: bigint): number {
  return Number((fee * 1_000_000n) / amount) / 100;
}

/** Cost preview. */
export interface CostPreview {
  readonly perLeg: readonly { readonly feeBps: number; readonly fee: bigint }[];
  readonly totalFeeBps: number;
  readonly singleSweepFeeBps: number;
  readonly delayRangeMs: [number, number];
  readonly text: string[];
}

/**
 * Cost preview (HOP-UX-2): per-leg fee, total vs single sweep, delay range, mandatory lines.
 *
 * @param plan Plan.
 * @returns Preview.
 */
export function previewCost(plan: HopPlan): CostPreview {
  assertTestnet(plan.chainId);
  const perLeg = plan.legs.map((l) => ({ feeBps: bps2(l.expectedFee, l.expectedAmountIn), fee: l.expectedFee }));
  const first = plan.legs[0];
  const last = plan.legs[plan.legs.length - 1];
  const totalFee = first && last ? first.expectedAmountIn - (last.expectedAmountIn - last.expectedFee) : 0n;
  const totalFeeBps = first ? bps2(totalFee, first.expectedAmountIn) : 0;
  const singleSweepFeeBps = perLeg[0]?.feeBps ?? 0;
  const k = plan.legs.length;
  const delayRangeMs: [number, number] = [k * plan.delay.minMs, k * plan.delay.maxMs];
  const text: string[] = [];
  if (first) {
    text.push(`Hops: ${k}. Total fee ${totalFeeBps} bps against ${singleSweepFeeBps} bps for one sweep.`);
    perLeg.forEach((l, i) => text.push(`Leg ${i + 1}: fee ${l.fee} (${l.feeBps} bps), gasless: yes.`));
    text.push(`Expected total delay: ${delayRangeMs[0]} to ${delayRangeMs[1]} ms.`);
    text.push(singleSweepLine(`${first.expectedFee} (${singleSweepFeeBps} bps)`));
    if (plan.relayerCount < 2 || plan.relayerSelection === 'same') text.push(SINGLE_RELAYER_WARNING);
    text.push(RESUME_NOTE);
  } else {
    text.push('No hops planned.');
  }
  if (plan.handoff === 'pool-exit') text.push(POOL_NOTE);
  if (plan.externalDestination) text.push(EXTERNAL_DEST_WARNING);
  return { perLeg, totalFeeBps, singleSweepFeeBps, delayRangeMs, text };
}

/** Amount fingerprint (N3). */
export interface FingerprintReport {
  /** `[A_0, ..., A_k]`, exact. */
  readonly ladder: readonly bigint[];
  /** Origin amounts consistent with `A_k` when each hop fee is anywhere in 0.5 %..3 %. */
  readonly candidateRange: { readonly min: bigint; readonly max: bigint; readonly count: bigint };
  /** Candidate spread relative to the final amount, in percent. */
  readonly spreadPercent: number;
}

/**
 * Exact amount ladder plus the candidate origin range an observer holding only the final amount
 * would consider (fee bounds 0.5 %..3 % per hop). The range is a conservative superset.
 *
 * @param plan Plan.
 * @returns Report.
 */
export function fingerprintReport(plan: HopPlan): FingerprintReport {
  assertTestnet(plan.chainId);
  const first = plan.legs[0];
  if (!first) return { ladder: [], candidateRange: { min: 0n, max: 0n, count: 0n }, spreadPercent: 0 };
  const ladder: bigint[] = [first.expectedAmountIn];
  for (const l of plan.legs) ladder.push(l.expectedAmountIn - l.expectedFee);
  const fin = ladder[ladder.length - 1] as bigint;
  let lo = fin;
  let hi = fin;
  for (let i = 0; i < plan.legs.length; i++) {
    lo = (lo * BPS) / (BPS - 50n) - 1n; // -1: fee is floor-rounded, so it can sit just under 0.5 %
    hi = (hi * BPS) / (BPS - 300n) + 1n;
  }
  return {
    ladder,
    candidateRange: { min: lo, max: hi, count: hi - lo + 1n },
    spreadPercent: Number(((hi - lo) * 10_000n) / fin) / 100,
  };
}
