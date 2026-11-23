import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BillingError,
  operatorAuthorization,
  parseRefundLedger,
  refundBalance,
  serializeRefundLedger,
  validateRefundLedger,
  walletMayHaveSigned,
  type RefundLedger,
  type RefundObservation,
  type RefundRecord,
} from './index.js';
import { attemptInput, DEST_META, evidence, harness, hashOf, T0 } from './refund-lifecycle.testutil.js';

// Model-based check of the economic invariant against a simulated chain: whatever the operator, wallet, RPC and
// clock do, the amount truly transferred to payers never exceeds the verified payment, a refund is never shown as
// finalized unless its transfer happened, and a refund whose transfer happened is never declared failed.

const AMOUNT = 1_000_000n;
const FINALITY = 30; // seconds of simulated finality

type Op =
  | { t: 'request'; key: number; amount: bigint }
  | { t: 'authorize' | 'prepare' | 'begin' | 'cancel' | 'uncertain' | 'mine' | 'observe' | 'hash'; i: number; x: number }
  | { t: 'wait'; dt: number }
  | { t: 'reload' };

const op: fc.Arbitrary<Op> = fc.oneof(
  { weight: 2, arbitrary: fc.record({ t: fc.constant('request' as const), key: fc.integer({ min: 0, max: 2 }), amount: fc.bigInt({ min: 1n, max: AMOUNT }) }) },
  { weight: 16, arbitrary: fc.record({ t: fc.constantFrom('authorize', 'prepare', 'begin', 'cancel', 'uncertain', 'mine', 'observe', 'hash'), i: fc.integer({ min: 0, max: 1 }), x: fc.integer({ min: 0, max: 9 }) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('wait' as const), dt: fc.integer({ min: 1, max: 1200 }) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('reload' as const) }) },
);

interface Truth { minedAt: number; hash: string }

function runModel(ops: readonly Op[], reached: Set<string>): RefundLedger {
  const h = harness();
  let ledger: RefundLedger = [];
  let now = T0;
  let prepareCount = 0;
  const truth = new Map<string, Truth>(); // stealth address -> mined transfer
  const firstHash = new Map<string, string>();
  const requestedOnce = new Set<string>();
  const pick = (i: number): RefundRecord | undefined => ledger[i % Math.max(1, ledger.length)];
  const attempt = (fn: () => { ledger: RefundLedger }): void => {
    try {
      ledger = fn().ledger;
    } catch (e) {
      if (!(e instanceof BillingError)) throw e;
    }
  };
  for (const o of ops) {
    const r = o.t === 'request' || o.t === 'wait' || o.t === 'reload' ? undefined : pick(o.i);
    switch (o.t) {
      case 'request':
        attempt(() => h.book.request(ledger, h.mint(), { idempotencyKey: `refund-key-${String(o.key)}`, amount: o.amount, destinationMeta: DEST_META, reason: 'merchant-initiated' }, now));
        break;
      case 'authorize':
        if (r) attempt(() => h.book.authorize(ledger, r.refundId, operatorAuthorization(r, 'operator-1', now, 3600 * (1 + o.x)), now));
        break;
      case 'prepare':
        if (r) {
          prepareCount++;
          attempt(() => h.book.prepare(ledger, r.refundId, h.mint(), attemptInput({ netAmount: r.amount, deadline: now + 600 + o.x * 100, startBlock: 0n }, prepareCount), now));
        }
        break;
      case 'begin':
        if (r?.attempt) attempt(() => h.book.beginSignature(ledger, r.refundId, r.attempt!.txDigest, now));
        break;
      case 'cancel':
        if (r) attempt(() => h.book.cancel(ledger, r.refundId, now));
        break;
      case 'uncertain':
        if (r) attempt(() => h.book.recordSubmissionUncertain(ledger, r.refundId, now));
        break;
      case 'hash':
        if (r) attempt(() => h.book.recordSubmission(ledger, r.refundId, hashOf(0x1000 + o.i * 16 + (o.x % 3)), now));
        break;
      case 'mine': {
        // The chain includes a signed transaction only if the wallet was asked and the router deadline holds.
        const a = r?.attempt;
        if (r && a && a.requestedAt !== null && now <= a.deadline && !truth.has(a.stealthAddress)) {
          truth.set(a.stealthAddress, { minedAt: now, hash: a.transactionHash ?? hashOf(0x9000 + o.i) });
        }
        break;
      }
      case 'observe': {
        const a = r?.attempt;
        if (!r || !a || a.requestedAt === null) break;
        const mined = truth.get(a.stealthAddress);
        let obs: RefundObservation;
        if (o.x === 0) obs = { kind: 'unavailable' };
        else if (mined !== undefined) {
          const final = now >= mined.minedAt + FINALITY;
          // Before finality a reorg may hide the transfer.
          obs = !final && o.x === 1 ? { kind: 'not-found' } : {
            kind: 'transfer-verified', transactionHash: mined.hash, from: a.from, stealthAddress: a.stealthAddress,
            ephemeralPublicKey: a.ephemeralPublicKey, assetId: a.assetId, netAmount: a.netAmount, blockNumber: 10n,
            blockHash: hashOf(10), confirmations: final ? 20n : 1n, final,
          };
        } else if (now > a.deadline + FINALITY) {
          obs = { kind: 'absent-after-deadline', scannedFromBlock: 0n, finalizedBlock: 50n, finalizedTimestamp: now - FINALITY };
        } else obs = { kind: 'not-found' };
        attempt(() => h.book.observe(ledger, r.refundId, obs, now));
        break;
      }
      case 'wait':
        now += o.dt;
        break;
      case 'reload':
        ledger = parseRefundLedger(serializeRefundLedger(ledger));
        break;
    }
    validateRefundLedger(ledger);
    for (const rec of ledger) {
      const a = rec.attempt;
      if (walletMayHaveSigned(rec.state)) requestedOnce.add(rec.refundId);
      if (requestedOnce.has(rec.refundId)) expect(rec.state).not.toBe('cancelled');
      if (a?.transactionHash) {
        const seen = firstHash.get(rec.refundId);
        if (seen === undefined) firstHash.set(rec.refundId, a.transactionHash);
        else expect(a.transactionHash).toBe(seen);
      }
      const mined = a ? truth.has(a.stealthAddress) : false;
      if (rec.state === 'finalized' || rec.state === 'confirmed') expect(mined).toBe(true);
      if (mined) expect(rec.state).not.toBe('definitively-failed');
      reached.add(rec.state);
    }
  }
  let transferred = 0n;
  for (const rec of ledger) if (rec.attempt && truth.has(rec.attempt.stealthAddress)) transferred += rec.amount;
  expect(transferred <= AMOUNT).toBe(true);
  expect(refundBalance(ledger, evidence()).remaining >= 0n).toBe(true);
  return ledger;
}

describe('refund lifecycle against a simulated chain', () => {
  it('a scripted happy path reaches finalized in the model', () => {
    const reached = new Set<string>();
    const ledger = runModel([
      { t: 'request', key: 0, amount: 5n }, { t: 'authorize', i: 0, x: 0 }, { t: 'prepare', i: 0, x: 0 }, { t: 'begin', i: 0, x: 0 },
      { t: 'hash', i: 0, x: 0 }, { t: 'mine', i: 0, x: 0 }, { t: 'wait', dt: 31 }, { t: 'observe', i: 0, x: 2 },
    ], reached);
    expect(ledger[0]?.state).toBe('finalized');
  });
  it('never over-refunds, never finalizes an unmined refund, never fails a mined one', () => {
    const reached = new Set<string>();
    fc.assert(fc.property(fc.array(op, { minLength: 20, maxLength: 150, size: 'max' }), (ops) => {
      runModel(ops, reached);
    }), { numRuns: 200, seed: 20261123 });
    // Guard against a vacuous model: the generator must reach the interesting states.
    for (const st of ['finalized', 'confirmed', 'definitively-failed', 'submission-uncertain', 'submitted', 'cancelled']) expect(reached.has(st), st).toBe(true);
  });
});
