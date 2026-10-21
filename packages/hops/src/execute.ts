import { buildPermitTypedData, buildSweepTypedData, signPermit, signSweep } from '@ghostpay/chain-adapters';
import { assertTestnet } from './guard.js';
import { reduce } from './machine.js';
import { randomUint256 } from './rand.js';
import { DIRECT_RELAYER_ID } from './relayerSelect.js';
import { assertNoPresign } from './store.js';
import { DEADLINE_WINDOW_S, HopError, MAX_LEG_FEE_BPS, type HopDeps, type HopPlan, type SweepSubmission } from './types.js';

async function commit(plan: HopPlan, deps: HopDeps): Promise<HopPlan> {
  assertNoPresign(plan);
  await deps.store.save(plan);
  return plan;
}

/**
 * Executes one leg: fresh quote, balance read, persist-before-sign, sign inside the key scope, submit.
 *
 * @remarks Nothing is signed while waiting (Feature 6 rule); this runs only when the leg is `due`
 * and the session gate authorises it. Order: `owner = leg.from`, `destination = leg.to`,
 * `amount = on-chain balance now`, `deadline = now + 900 s`, fresh random nonce. Requests carry no
 * plan id and no reference to other legs (HOP-RLY-2).
 * @security The key exists only inside `addrs.withSecretAt`. Stored state never contains a signature.
 *
 * @param plan Plan.
 * @param legIndex Leg to run.
 * @param deps Ports.
 * @returns Updated plan (`submitted`), or the unchanged plan if the session gate declines.
 * @throws {HopError} `NOT_DUE`, `QUOTE_STALE`, `FEE_CAP`, `AMOUNT_TOO_SMALL`, `ILLEGAL_TRANSITION`, `DIRECT_UNSUPPORTED`.
 */
export async function runHopLeg(plan: HopPlan, legIndex: number, deps: HopDeps): Promise<HopPlan> {
  assertTestnet(plan.chainId);
  const now0 = deps.wallClockMs();
  let cur = reduce(plan, { type: 'tick', nowMs: now0 });
  const leg = cur.legs[legIndex];
  if (leg === undefined) throw new HopError('ILLEGAL_TRANSITION', 'no such leg');
  if (leg.state === 'waiting' || leg.state === 'planned') throw new HopError('NOT_DUE', 'leg is not due');
  if (leg.state !== 'due') throw new HopError('ILLEGAL_TRANSITION', 'leg is not due');
  if (leg.relayerId === DIRECT_RELAYER_ID) throw new HopError('DIRECT_UNSUPPORTED', 'direct submission is not implemented');
  if (!(await deps.signWithSession.authorize(leg))) return cur;

  const balance = await deps.chain.tokenBalance(plan.token, leg.from);
  if (balance <= 0n) throw new HopError('AMOUNT_TOO_SMALL', 'nothing to sweep');
  const quote = await deps.relayer.quote(leg.relayerId, { chainId: plan.chainId, token: plan.token, amount: balance.toString() });
  const now1 = deps.wallClockMs();
  if (quote.expiresAtMs <= now1) throw new HopError('QUOTE_STALE', 'quote expired');
  if (balance <= quote.fee) throw new HopError('AMOUNT_TOO_SMALL', 'balance does not exceed fee');
  if (quote.fee * 10_000n > balance * BigInt(MAX_LEG_FEE_BPS)) throw new HopError('FEE_CAP', 'leg fee above 300 bps');

  const nonce = randomUint256(deps.rng);
  const deadlineS = BigInt(Math.floor(now1 / 1000) + DEADLINE_WINDOW_S);
  // Persist before sign.
  cur = await commit(reduce(cur, { type: 'beginSigning', leg: legIndex, nonce, deadlineS }), deps);

  const order = {
    token: plan.token,
    owner: leg.from,
    destination: leg.to,
    feeTo: quote.feeTo,
    amount: balance,
    fee: quote.fee,
    deadline: deadlineS,
    nonce,
  };
  const submission = await deps.addrs.withSecretAt(leg.fromIndex, async (secret) => {
    const td = buildSweepTypedData(plan.chainId, deps.sweepRelayer, order);
    const permitTd = await buildPermitTypedData({
      chainId: plan.chainId,
      token: plan.token,
      owner: leg.from,
      spender: deps.sweepRelayer,
      value: balance,
      deadline: deadlineS,
      reader: deps.chain.permitReader,
    });
    const sig = await signSweep(td, secret);
    const pSig = await signPermit(permitTd, secret);
    const body: SweepSubmission = {
      chainId: plan.chainId,
      order: {
        token: order.token, owner: order.owner, destination: order.destination, feeTo: order.feeTo,
        amount: balance.toString(), fee: quote.fee.toString(), deadline: deadlineS.toString(), nonce: nonce.toString(),
      },
      signature: sig.signature,
      permit: { value: balance.toString(), deadline: deadlineS.toString(), v: pSig.v, r: pSig.r, s: pSig.s },
    };
    return body;
  });
  const { txHash } = await deps.relayer.submit(leg.relayerId, submission);
  return commit(reduce(cur, { type: 'submitted', leg: legIndex, txHash }), deps);
}

/**
 * Crash recovery for a leg left in `signing` or `submitted`.
 *
 * @remarks Reads `nonceUsed(owner, nonce)` (reveals the address to the RPC; the UI flags this).
 * Used nonce: `confirmed`. Unused and past the order deadline: back to `due`. Unused and still
 * inside the deadline: unchanged (the signed order may still land).
 *
 * @param plan Plan.
 * @param legIndex Leg.
 * @param deps Ports.
 * @returns Updated plan.
 */
export async function resumeLeg(plan: HopPlan, legIndex: number, deps: HopDeps): Promise<HopPlan> {
  assertTestnet(plan.chainId);
  const leg = plan.legs[legIndex];
  if (leg === undefined) throw new HopError('ILLEGAL_TRANSITION', 'no such leg');
  if (leg.state !== 'signing' && leg.state !== 'submitted') return plan;
  if (leg.nonce === undefined || leg.deadlineS === undefined) throw new HopError('ILLEGAL_TRANSITION', 'missing nonce');
  const now = deps.wallClockMs();
  if (await deps.chain.nonceUsed(leg.from, leg.nonce)) {
    return commit(reduce(plan, { type: 'confirmed', leg: legIndex, nowMs: now }), deps);
  }
  if (BigInt(Math.floor(now / 1000)) > leg.deadlineS) {
    return commit(reduce(plan, { type: 'revertToDue', leg: legIndex }), deps);
  }
  return plan;
}

/**
 * Loads a plan and resolves every `signing`/`submitted` leg.
 *
 * @param id Plan id.
 * @param deps Ports.
 * @returns Resumed plan, or null if not stored.
 */
export async function resumePlan(id: string, deps: HopDeps): Promise<HopPlan | null> {
  const loaded = await deps.store.load(id);
  if (loaded === null) return null;
  let plan = loaded;
  for (let i = 0; i < plan.legs.length; i++) plan = await resumeLeg(plan, i, deps);
  return plan;
}
