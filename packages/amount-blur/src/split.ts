import { grossForNet } from '@ghostpay/chain-adapters';
import { assertTestnetChain, fail, requireInt } from './errors.js';
import {
  ABS_MIN_PART_BASE,
  HARD_MAX_PARTS,
  assertPlanInvariants,
  feeDelta,
  splitPart,
  totalsOf,
} from './fees.js';
import { denominationSet, gridFor, snapUp } from './grid.js';
import { randomBelow, shuffle, type RandomSource } from './random.js';
import { planSchedule } from './schedule.js';
import type { PlannedPart, SplitPlan } from './types.js';

/** Inputs of {@link planSplit}. */
export interface PlanOptions {
  readonly mode: 'split' | 'denom';
  /** Chain id (testnet guard). */
  readonly chainId: number;
  readonly decimals: number;
  /** Seller must receive at least this (sum of part nets). */
  readonly invoiceNet: bigint;
  /** `2 <= kMin <= kMax <= 8`. */
  readonly kMin: number;
  readonly kMax: number;
  /** `>= 400n` enforced. */
  readonly minPartBase: bigint;
  readonly gapMinSec: number;
  readonly gapMaxSec: number;
  readonly horizonSec: number;
  /** Seconds until the invoice expires, from plan start (caller derives it from its own clock). */
  readonly expiresInSec: number;
  /** Router deadline margin per part in seconds (default 600). */
  readonly deadlineMarginSec?: number;
  /** Start offset of the first part in seconds (default 0). */
  readonly firstOffsetSec?: number;
  /** Maximum rounding increase in bps, 0..500. */
  readonly roundMaxBps: number;
  readonly random: RandomSource;
}

const MAX_WORK = 64;
const MAX_SEC = 30 * 24 * 3600;

interface Draft {
  readonly parts: readonly { readonly gross: bigint; readonly isRemainder: boolean }[];
  readonly slack: bigint;
}

function randomComposition(random: RandomSource, total: bigint, k: number, min: bigint): bigint[] {
  const spare = total - BigInt(k) * min;
  const cuts: bigint[] = [];
  for (let i = 0; i < k - 1; i += 1) cuts.push(randomBelow(random, spare + 1n));
  cuts.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const out: bigint[] = [];
  let prev = 0n;
  for (const c of [...cuts, spare]) {
    out.push(min + (c - prev));
    prev = c;
  }
  return out;
}

function freeDraft(o: PlanOptions, G: bigint, k: number): Draft {
  const grid = gridFor(o.decimals);
  let slack = 0n;
  const parts = randomComposition(o.random, G, k, o.minPartBase).map((g) => {
    const s = snapUp(g, grid, o.roundMaxBps, o.chainId);
    slack += s.value - g;
    return { gross: s.value, isRemainder: false };
  });
  return { parts, slack };
}

function splitOptions(s: bigint, allowed: ReadonlySet<bigint>): bigint[] | undefined {
  const half = s / 2n;
  if (s % 2n === 0n && allowed.has(half)) return [half, half];
  const fifth = s / 5n;
  if (s % 5n === 0n && allowed.has(fifth) && allowed.has(2n * fifth)) return [2n * fifth, 2n * fifth, fifth];
  return undefined;
}

function denomDraft(o: PlanOptions, G: bigint, k: number): Draft | undefined {
  const grid = gridFor(o.decimals);
  const allowed = denominationSet(o.decimals).stepsBase.filter((s) => s >= o.minPartBase);
  if (allowed.length === 0) return undefined;
  const allowedSet = new Set(allowed);
  const roundUp = (x: bigint): bigint | undefined => allowed.find((s) => s >= x);
  const cap = (G * BigInt(o.roundMaxBps)) / 10_000n;

  let rem = G;
  let parts: bigint[] = [];
  for (let i = allowed.length - 1; i >= 0; i -= 1) {
    const s = allowed[i] as bigint;
    const q = rem / s;
    if (q > BigInt(MAX_WORK) || parts.length + Number(q) > MAX_WORK) return undefined;
    for (let j = 0n; j < q; j += 1n) parts.push(s);
    rem -= q * s;
  }
  if (parts.length === 0) return undefined;
  let slack = 0n;

  while (parts.length > k) {
    let bi = -1;
    let bj = -1;
    let bestSlack = -1n;
    let bestSum = 0n;
    for (let i = 0; i < parts.length; i += 1) {
      for (let j = i + 1; j < parts.length; j += 1) {
        const sum = (parts[i] as bigint) + (parts[j] as bigint);
        const up = roundUp(sum);
        if (up === undefined) continue;
        const sl = up - sum;
        if (bestSlack < 0n || sl < bestSlack || (sl === bestSlack && sum < bestSum)) {
          bi = i;
          bj = j;
          bestSlack = sl;
          bestSum = sum;
        }
      }
    }
    if (bi < 0) return undefined;
    slack += bestSlack;
    const merged = bestSum + bestSlack;
    parts = parts.filter((_, idx) => idx !== bi && idx !== bj);
    parts.push(merged);
  }

  while (parts.length < k) {
    const order = parts.map((p, i) => i).sort((a, b) => ((parts[b] as bigint) > (parts[a] as bigint) ? 1 : -1));
    let done = false;
    for (const wantTwo of [true, false]) {
      for (const i of order) {
        const pieces = splitOptions(parts[i] as bigint, allowedSet);
        if (pieces === undefined) continue;
        if (wantTwo ? pieces.length !== 2 : parts.length + 2 > o.kMax) continue;
        parts = [...parts.slice(0, i), ...parts.slice(i + 1), ...pieces];
        done = true;
        break;
      }
      if (done) break;
    }
    if (!done) return undefined;
  }

  const out = parts.map((gross) => ({ gross, isRemainder: false }));
  if (rem > 0n) {
    let li = 0;
    for (let i = 1; i < out.length; i += 1) if ((out[i] as { gross: bigint }).gross > (out[li] as { gross: bigint }).gross) li = i;
    const x = (out[li] as { gross: bigint }).gross + rem;
    const s = snapUp(x, grid, o.roundMaxBps, o.chainId);
    slack += s.value - x;
    out[li] = { gross: s.value, isRemainder: true };
  }
  if (slack > cap) return undefined;
  return { parts: out, slack };
}

function validate(o: PlanOptions): void {
  if (o.mode !== 'split' && o.mode !== 'denom') fail('INVALID_INPUT', 'mode');
  requireInt(o.decimals, 0, 36, 'decimals');
  if (typeof o.invoiceNet !== 'bigint' || o.invoiceNet < 1n) fail('INVALID_INPUT', 'invoiceNet must be positive');
  requireInt(o.kMin, 2, HARD_MAX_PARTS, 'kMin');
  requireInt(o.kMax, 2, HARD_MAX_PARTS, 'kMax');
  if (o.kMax < o.kMin) fail('INVALID_INPUT', 'kMax below kMin');
  if (typeof o.minPartBase !== 'bigint') fail('INVALID_INPUT', 'minPartBase');
  if (o.minPartBase < ABS_MIN_PART_BASE) fail('PART_BELOW_FLOOR', 'minPartBase must be at least 400');
  requireInt(o.gapMinSec, 0, MAX_SEC, 'gapMinSec');
  requireInt(o.gapMaxSec, 0, MAX_SEC, 'gapMaxSec');
  if (o.gapMaxSec < o.gapMinSec) fail('INVALID_INPUT', 'gapMaxSec below gapMinSec');
  if (o.gapMaxSec < 1) fail('INVALID_INPUT', 'gapMaxSec must be positive');
  requireInt(o.horizonSec, 0, MAX_SEC, 'horizonSec');
  requireInt(o.expiresInSec, 0, 10 * MAX_SEC, 'expiresInSec');
  requireInt(o.roundMaxBps, 0, 500, 'roundMaxBps');
  requireInt(o.firstOffsetSec ?? 0, 0, MAX_SEC, 'firstOffsetSec');
  requireInt(o.deadlineMarginSec ?? 600, 0, MAX_SEC, 'deadlineMarginSec');
}

/**
 * Plans a split or denomination payment: k parts, each its own router call, with random order and delays.
 *
 * @remarks Works on the gross `G = grossForNet(invoiceNet)`; parts sum to `G` plus upward rounding only,
 * so the seller's summed net is `>= invoiceNet` (floor superadditivity) and exceeds it by at most
 * `k + snapSlack` (AB-S1). Every part is `>= minPartBase >= 400` so splitting cannot dodge the router fee.
 * Order and delays come only from the injected CSPRNG. Plans are not persisted and nothing is signed.
 * @security Splitting does NOT make the payer anonymous: payer, token, every part and time stay public and
 * k payments from one wallet are a recognisable fan-out (see `ABCopy`).
 * @param o Options.
 * @returns Immutable plan with per-part fee, net, due and deadline offsets.
 * @throws {AmountBlurError} `INVALID_INPUT`, `PART_BELOW_FLOOR`, `HORIZON_TOO_SHORT`, `CAP_EXCEEDED`, `RANDOM_FAILED`, `CHAIN_NOT_ALLOWED`.
 */
export function planSplit(o: PlanOptions): SplitPlan {
  assertTestnetChain(o.chainId);
  validate(o);
  const marginSec = o.deadlineMarginSec ?? 600;
  const horizonSec = Math.min(o.horizonSec, o.expiresInSec - marginSec);
  if (horizonSec < 0) fail('HORIZON_TOO_SHORT', 'invoice expires before the first deadline');
  let G: bigint;
  try {
    G = grossForNet(o.invoiceNet);
  } catch {
    return fail('INVALID_INPUT', 'invoiceNet out of router range');
  }
  const firstMs = (o.firstOffsetSec ?? 0) * 1000;
  const meanGap = (Math.max(1, o.gapMinSec * 1000) + o.gapMaxSec * 1000) / 2;
  const sizeOk: number[] = [];
  const feasible: number[] = [];
  for (let k = o.kMin; k <= o.kMax; k += 1) {
    if (BigInt(k) * o.minPartBase > G) continue;
    sizeOk.push(k);
    if (firstMs + (k - 1) * meanGap <= horizonSec * 1000) feasible.push(k);
  }
  if (sizeOk.length === 0) fail('PART_BELOW_FLOOR', 'invoice too small to split above the part floor');
  if (feasible.length === 0) fail('HORIZON_TOO_SHORT', 'schedule does not fit before the invoice deadline');

  let draft: Draft | undefined;
  for (const k of shuffle(o.random, feasible)) {
    draft = o.mode === 'split' ? freeDraft(o, G, k) : denomDraft(o, G, k);
    if (draft !== undefined) break;
  }
  if (draft === undefined) return fail('CAP_EXCEEDED', 'no denomination plan within the rounding cap');

  const shuffled = shuffle(o.random, draft.parts);
  const due = planSchedule({
    chainId: o.chainId,
    k: shuffled.length,
    gapMinSec: o.gapMinSec,
    gapMaxSec: o.gapMaxSec,
    horizonSec,
    ...(o.firstOffsetSec === undefined ? {} : { firstOffsetSec: o.firstOffsetSec }),
    random: o.random,
  });
  const parts: PlannedPart[] = shuffled.map((p, index) => {
    const s = splitPart(p.gross);
    const dueOffsetMs = due[index] as number;
    return Object.freeze({
      index,
      gross: s.gross,
      fee: s.fee,
      net: s.net,
      dueOffsetMs,
      deadlineOffsetMs: dueOffsetMs + marginSec * 1000,
      isRemainder: p.isRemainder,
    });
  });
  assertPlanInvariants(parts, o.invoiceNet, draft.slack, o.minPartBase);
  const t = totalsOf(parts);
  return Object.freeze({
    parts: Object.freeze(parts),
    ...t,
    overpayNet: t.netTotal - o.invoiceNet,
    extraGasParts: parts.length - 1,
    snapSlackGross: draft.slack,
  });
}

/** Review-screen figures (AB-F2). */
export interface PlanReview {
  readonly walletPrompts: number;
  readonly extraGasParts: number;
  readonly grossTotal: bigint;
  readonly feeTotal: bigint;
  readonly netTotal: bigint;
  /** `routerFee(grossTotal) - feeTotal`, 0..k-1. */
  readonly feeDeltaBase: bigint;
  readonly overpayNet: bigint;
}

/**
 * Figures the review screen must show before the first wallet prompt.
 *
 * @param plan A plan from {@link planSplit}.
 * @returns Review numbers.
 */
export function reviewPlan(plan: SplitPlan): PlanReview {
  return {
    walletPrompts: plan.parts.length,
    extraGasParts: plan.extraGasParts,
    grossTotal: plan.grossTotal,
    feeTotal: plan.feeTotal,
    netTotal: plan.netTotal,
    feeDeltaBase: feeDelta(plan.grossTotal, plan.feeTotal),
    overpayNet: plan.overpayNet,
  };
}

/** Progress after a stop (AB-S8). */
export interface PlanProgress {
  readonly paidGross: bigint;
  readonly unpaidGross: bigint;
  readonly unpaidIndexes: readonly number[];
}

/**
 * Paid and unpaid parts after a stop. The UI resumes only from `unpaidIndexes` and never exceeds
 * `grossTotal`; a rejected part is never retried automatically.
 *
 * @param plan Plan.
 * @param paid Indexes already sent.
 * @returns Paid/unpaid totals.
 * @throws {AmountBlurError} `INVALID_INPUT` for an index outside the plan.
 */
export function remainingAfter(plan: SplitPlan, paid: ReadonlySet<number>): PlanProgress {
  for (const i of paid) if (!Number.isInteger(i) || i < 0 || i >= plan.parts.length) fail('INVALID_INPUT', 'paid index outside plan');
  let paidGross = 0n;
  let unpaidGross = 0n;
  const unpaidIndexes: number[] = [];
  for (const p of plan.parts) {
    if (paid.has(p.index)) paidGross += p.gross;
    else {
      unpaidGross += p.gross;
      unpaidIndexes.push(p.index);
    }
  }
  return { paidGross, unpaidGross, unpaidIndexes };
}

/**
 * Checks that every part has its own stealth address and ephemeral public key (AB-S7).
 *
 * @param parts Per-part derived values (hex strings, compared case-insensitively).
 * @throws {AmountBlurError} `INVALID_INPUT` when any address or key repeats.
 */
export function assertDistinctPartKeys(parts: readonly { readonly stealthAddress: string; readonly ephemeralPubKey: string }[]): void {
  const a = new Set<string>();
  const e = new Set<string>();
  for (const p of parts) {
    a.add(p.stealthAddress.toLowerCase());
    e.add(p.ephemeralPubKey.toLowerCase());
  }
  if (a.size !== parts.length || e.size !== parts.length) fail('INVALID_INPUT', 'stealth address or ephemeral key reused across parts');
}
