import { describe, expect, it } from 'vitest';
import {
  attemptDigest,
  BillingError,
  createOutcomeAuthority,
  describeRefund,
  operatorAuthorization,
  parseRefundLedger,
  refundAuthorizationDigest,
  refundBalance,
  RefundBook,
  serializeRefundLedger,
  validateRefundLedger,
  MAX_REPLACEMENT_HASHES,
  type RefundLedger,
  type RefundRecord,
} from './index.js';
import { attemptInput, DEST_META, evidence, harness, hashOf, PAY_META, PAYER, preparedLedger, T0, transferObs } from './refund-lifecycle.testutil.js';
import { OTHER_META } from './fixtures.testutil.js';

const req = (over: Record<string, unknown> = {}) => ({ idempotencyKey: 'refund-0001', amount: 400_000n, destinationMeta: DEST_META, reason: 'overpayment', ...over }) as Parameters<RefundBook['request']>[2];
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof BillingError) return e.code;
    throw e;
  }
  return 'NO_THROW';
};

/** Walks a prepared refund to `submitted` with a known hash. */
function submitted(): { ledger: RefundLedger; record: RefundRecord; h: ReturnType<typeof harness> } {
  const p = preparedLedger();
  const asking = p.h.book.beginSignature(p.ledger, p.record.refundId, p.record.attempt!.txDigest, T0 + 10);
  const sent = p.h.book.recordSubmission(asking.ledger, p.record.refundId, hashOf(0xbeef), T0 + 11);
  return { ledger: sent.ledger, record: sent.record, h: p.h };
}

describe('verified outcome boundary', () => {
  it('accepts only outcomes minted by the paired authority', () => {
    const h = harness();
    expect(h.book.request([], h.mint(), req(), T0).record.state).toBe('authorization-required');
    expect(code(() => h.book.request([], evidence() as never, req(), T0))).toBe('EVIDENCE');
    expect(code(() => h.book.request([], { ...h.mint() }, req(), T0))).toBe('EVIDENCE');
    expect(code(() => h.book.request([], h.foreignMint(), req(), T0))).toBe('EVIDENCE');
    expect(code(() => h.book.request([], JSON.parse(JSON.stringify(evidence(), (_k, v: unknown) => typeof v === 'bigint' ? v.toString() : v)) as never, req(), T0))).toBe('EVIDENCE');
  });
  it('mint validates every field and freezes the result', () => {
    const { minter } = createOutcomeAuthority('evm-router-v1');
    const ok = minter.mint(evidence());
    expect(Object.isFrozen(ok)).toBe(true);
    for (const bad of [
      { paymentId: 'evm:1:0xabc' }, { chainId: 0 }, { transactionHash: '0x12' }, { invoiceId: 'has space' }, { assetId: 'NATIVE' },
      { amount: 0n }, { amount: 1n << 256n }, { logIndex: -1 }, { senderAddress: '0xZZ' }, { recipientAddress: '0x12' },
      { recipientAddress: PAYER }, { status: 'pending' }, { blockNumber: -1n }, { blockHash: 'x' }, { blockTimestamp: 1.5 },
      { confirmations: 0n }, { evidenceId: '' }, { verifier: 'Other' }, { verifiedAt: -1 }, { verifier: 'other-v1' },
    ]) expect(code(() => minter.mint(evidence(bad as never))), JSON.stringify(Object.keys(bad))).toBe('EVIDENCE');
    expect(code(() => minter.mint(null as never))).toBe('EVIDENCE');
    expect(code(() => createOutcomeAuthority('Bad Label'))).toBe('EVIDENCE');
    expect(code(() => new RefundBook({} as never))).toBe('EVIDENCE');
  });
  it('a native asset and a null invoice attribution are valid evidence', () => {
    const h = harness();
    expect(h.book.request([], h.mint({ assetId: 'native', invoiceId: null }), req(), T0).record.original.assetId).toBe('native');
  });
});

describe('request and accounting', () => {
  it('replays the same idempotency key and rejects changed parameters', () => {
    const h = harness();
    const first = h.book.request([], h.mint(), req(), T0);
    const again = h.book.request(first.ledger, h.mint(), req(), T0 + 5);
    expect(again.unchanged).toBe(true);
    expect(again.record).toBe(first.record);
    expect(code(() => h.book.request(first.ledger, h.mint(), req({ reason: 'late-payment' }), T0))).toBe('IDEMPOTENCY');
    expect(code(() => h.book.request(first.ledger, h.mint(), req({ amount: 400_001n }), T0))).toBe('IDEMPOTENCY');
  });
  it('caps concurrent reservations at the verified amount, including uncertain broadcasts', () => {
    const h = harness();
    let ledger: RefundLedger = h.book.request([], h.mint(), req({ amount: 600_000n }), T0).ledger;
    ledger = h.book.request(ledger, h.mint(), req({ idempotencyKey: 'refund-0002' }), T0).ledger;
    expect(refundBalance(ledger, evidence())).toMatchObject({ reserved: 1_000_000n, remaining: 0n, finalized: 0n, pending: 1_000_000n });
    expect(code(() => h.book.request(ledger, h.mint(), req({ idempotencyKey: 'refund-0003', amount: 1n }), T0))).toBe('REFUND');
  });
  it('enforces a per-reason limit and the fresh-destination rules of the plan builder', () => {
    const h = harness();
    expect(code(() => h.book.request([], h.mint(), req({ limit: 399_999n }), T0))).toBe('REFUND');
    expect(h.book.request([], h.mint(), req({ limit: 400_000n }), T0).record.amount).toBe(400_000n);
    expect(code(() => h.book.request([], h.mint(), req({ destinationMeta: PAYER }), T0))).toBe('META_ADDRESS');
    expect(code(() => h.book.request([], h.mint(), req({ destinationMeta: PAY_META, linkedMetas: [PAY_META] }), T0))).toBe('META_ADDRESS');
    expect(code(() => h.book.request([], h.mint(), req({ reason: 'gift' }), T0))).toBe('REFUND');
    expect(code(() => h.book.request([], h.mint(), req({ amount: 0n }), T0))).toBe('REFUND');
    expect(code(() => h.book.request([], h.mint(), req(), -1))).toBe('REFUND');
  });
  it('refuses a request whose verified evidence contradicts recorded refunds of the same payment', () => {
    const h = harness();
    const first = h.book.request([], h.mint(), req(), T0);
    expect(code(() => h.book.request(first.ledger, h.mint({ amount: 2_000_000n }), req({ idempotencyKey: 'refund-0002' }), T0))).toBe('EVIDENCE');
    // Re-inclusion in another block keeps the payment identity and its cap.
    const moved = (amount: bigint) => h.book.request(first.ledger, h.mint({ blockNumber: 101n, blockHash: hashOf(101), logIndex: 0 }), req({ idempotencyKey: 'refund-0002', amount }), T0);
    expect(code(() => moved(600_001n))).toBe('REFUND');
    expect(moved(600_000n).record.state).toBe('authorization-required');
  });
});

describe('authorization', () => {
  it('binds one refund, expires and is idempotent', () => {
    const h = harness();
    const a = h.book.request([], h.mint(), req(), T0);
    const b = h.book.request(a.ledger, h.mint(), req({ idempotencyKey: 'refund-0002', destinationMeta: OTHER_META }), T0);
    const authA = operatorAuthorization(a.record, 'operator-1', T0, 600);
    expect(code(() => h.book.authorize(b.ledger, b.record.refundId, authA, T0))).toBe('AUTHORIZATION');
    const done = h.book.authorize(b.ledger, a.record.refundId, authA, T0);
    expect(done.record.state).toBe('authorized');
    expect(h.book.authorize(done.ledger, a.record.refundId, authA, T0 + 1).unchanged).toBe(true);
    const other = operatorAuthorization(a.record, 'operator-2', T0 + 1, 600);
    expect(code(() => h.book.authorize(done.ledger, a.record.refundId, other, T0 + 1))).toBe('REFUND');
    expect(code(() => h.book.authorize(b.ledger, a.record.refundId, authA, T0 + 600))).toBe('AUTHORIZATION');
    expect(code(() => h.book.authorize(b.ledger, a.record.refundId, { ...authA, authorizedAt: T0 + 10_000, expiresAt: T0 + 10_600 }, T0))).toBe('AUTHORIZATION');
  });
  it('rejects malformed authorizations', () => {
    const h = harness();
    const a = h.book.request([], h.mint(), req(), T0);
    const good = operatorAuthorization(a.record, 'operator-1', T0, 600);
    for (const bad of [{ method: 'magic' }, { digest: 'x' }, { approvers: [] }, { approvers: ['a', 'a'] }, { approvers: ['bad who'] }, { expiresAt: T0 }, { expiresAt: T0 + 8 * 86_400 }])
      expect(code(() => h.book.authorize(a.ledger, a.record.refundId, { ...good, ...bad } as never, T0))).toBe('AUTHORIZATION');
    expect(code(() => h.book.authorize(a.ledger, a.record.refundId, null as never, T0))).toBe('AUTHORIZATION');
    expect(code(() => operatorAuthorization(a.record, 'operator-1', T0, 0))).toBe('AUTHORIZATION');
    expect(code(() => h.book.authorize(a.ledger, 'f'.repeat(64), good, T0))).toBe('REFUND');
    const multisig = { ...good, method: 'multisig' as const, approvers: ['02aa', '03bb'] };
    expect(h.book.authorize(a.ledger, a.record.refundId, multisig, T0).record.authorization?.method).toBe('multisig');
    expect(refundAuthorizationDigest(a.record)).toBe(good.digest);
  });
});

describe('prepare', () => {
  it('requires a finalized re-verification of the same transfer and a bounded deadline', () => {
    const h = harness();
    const a = h.book.request([], h.mint(), req(), T0);
    const ok = h.book.authorize(a.ledger, a.record.refundId, operatorAuthorization(a.record, 'operator-1', T0, 3600), T0);
    const id = a.record.refundId;
    expect(code(() => h.book.prepare(a.ledger, id, h.mint(), attemptInput(), T0))).toBe('REFUND');
    expect(code(() => h.book.prepare(ok.ledger, id, h.mint({ status: 'confirmed' }), attemptInput(), T0))).toBe('EVIDENCE');
    expect(code(() => h.book.prepare(ok.ledger, id, h.mint({ amount: 999_999n }), attemptInput(), T0))).toBe('EVIDENCE');
    expect(code(() => h.book.prepare(ok.ledger, id, evidence() as never, attemptInput(), T0))).toBe('EVIDENCE');
    expect(code(() => h.book.prepare(ok.ledger, id, h.mint(), attemptInput({ chainId: 1 }), T0))).toBe('REFUND');
    expect(code(() => h.book.prepare(ok.ledger, id, h.mint(), attemptInput({ assetId: 'native', value: 1_002_506n }), T0))).toBe('REFUND');
    expect(code(() => h.book.prepare(ok.ledger, id, h.mint(), attemptInput({ netAmount: 400_001n }), T0))).toBe('REFUND');
    expect(code(() => h.book.prepare(ok.ledger, id, h.mint(), attemptInput({ stealthAddress: PAYER }), T0))).toBe('REFUND');
    expect(code(() => h.book.prepare(ok.ledger, id, h.mint(), attemptInput({ deadline: T0 + 60 }), T0))).toBe('REFUND');
    expect(code(() => h.book.prepare(ok.ledger, id, h.mint(), attemptInput({ deadline: T0 + 3601 }), T0))).toBe('REFUND');
    expect(code(() => h.book.prepare(ok.ledger, id, h.mint(), attemptInput(), T0 + 3600))).toBe('AUTHORIZATION');
    for (const bad of [{ from: '0x12' }, { from: attemptInput().to }, { data: '0x12' }, { data: '0xZZ' }, { value: 5n }, { gross: 1n },
      { ephemeralPublicKey: '0x04' + '00'.repeat(32) }, { deadline: 1.5 }, { startBlock: -1n }, { chainId: 0 }, { netAmount: -1n }])
      expect(code(() => h.book.prepare(ok.ledger, id, h.mint(), attemptInput(bad as never), T0)), JSON.stringify(bad, (_k, v: unknown) => typeof v === 'bigint' ? v.toString() : v)).toBe('REFUND');
    expect(code(() => h.book.prepare(ok.ledger, id, h.mint(), null as never, T0))).toBe('REFUND');
    const prepared = h.book.prepare(ok.ledger, id, h.mint({ blockNumber: 105n, blockHash: hashOf(105), confirmations: 30n }), attemptInput(), T0);
    expect(prepared.record.attempt?.txDigest).toBe(attemptDigest(id, attemptInput()));
    // Re-preparing before any wallet request replaces the reviewed transaction.
    const again = h.book.prepare(prepared.ledger, id, h.mint(), attemptInput({ deadline: T0 + 1200 }, 2), T0 + 5);
    expect(again.record.attempt?.deadline).toBe(T0 + 1200);
  });
  it('native refunds must carry the gross as value', () => {
    const h = harness();
    const a = h.book.request([], h.mint({ assetId: 'native' }), req(), T0);
    const ok = h.book.authorize(a.ledger, a.record.refundId, operatorAuthorization(a.record, 'operator-1', T0, 3600), T0);
    expect(code(() => h.book.prepare(ok.ledger, a.record.refundId, h.mint({ assetId: 'native' }), attemptInput({ assetId: 'native', value: 0n }), T0))).toBe('REFUND');
    expect(h.book.prepare(ok.ledger, a.record.refundId, h.mint({ assetId: 'native' }), attemptInput({ assetId: 'native', value: 1_002_506n }), T0).record.state).toBe('prepared');
  });
});

describe('signature and submission', () => {
  it('requests a signature only for the confirmed digest, before the deadline margin', () => {
    const p = preparedLedger();
    const id = p.record.refundId;
    expect(code(() => p.h.book.beginSignature(p.ledger, id, 'f'.repeat(64), T0))).toBe('REFUND');
    expect(code(() => p.h.book.beginSignature(p.ledger, id, p.record.attempt!.txDigest, T0 + 1800 - 60))).toBe('REFUND');
    const asking = p.h.book.beginSignature(p.ledger, id, p.record.attempt!.txDigest, T0 + 1);
    expect(asking.record.state).toBe('awaiting-signature');
    expect(code(() => p.h.book.beginSignature(asking.ledger, id, p.record.attempt!.txDigest, T0 + 2))).toBe('REFUND');
    expect(code(() => p.h.book.cancel(asking.ledger, id, T0 + 2))).toBe('REFUND');
    expect(code(() => p.h.book.prepare(asking.ledger, id, p.h.mint(), attemptInput({}, 3), T0 + 2))).toBe('REFUND');
  });
  it('keeps the first hash forever and records bounded replacements', () => {
    const s = submitted();
    const id = s.record.refundId;
    expect(s.record.state).toBe('submitted');
    expect(s.h.book.recordSubmission(s.ledger, id, hashOf(0xbeef).toUpperCase().replace('0X', '0x'), T0 + 12).unchanged).toBe(true);
    let ledger = s.ledger;
    for (let i = 1; i <= MAX_REPLACEMENT_HASHES; i++) ledger = s.h.book.recordSubmission(ledger, id, hashOf(0xc000 + i), T0 + 12).ledger;
    const rec = ledger.find((r) => r.refundId === id)!;
    expect(rec.attempt?.transactionHash).toBe(hashOf(0xbeef));
    expect(rec.attempt?.replacementHashes).toHaveLength(MAX_REPLACEMENT_HASHES);
    expect(s.h.book.recordSubmission(ledger, id, hashOf(0xc001), T0 + 13).unchanged).toBe(true);
    expect(code(() => s.h.book.recordSubmission(ledger, id, hashOf(0xd000), T0 + 13))).toBe('REFUND');
    expect(code(() => s.h.book.recordSubmission(ledger, id, 42 as never, T0 + 13))).toBe('EVIDENCE');
    expect(code(() => s.h.book.recordSubmission(ledger, id, '0x1234', T0 + 13))).toBe('EVIDENCE');
  });
  it('refuses hashes before a wallet request and marks wallet errors uncertain without allowing a resend', () => {
    const p = preparedLedger();
    const id = p.record.refundId;
    expect(code(() => p.h.book.recordSubmission(p.ledger, id, hashOf(1), T0))).toBe('REFUND');
    expect(code(() => p.h.book.recordSubmissionUncertain(p.ledger, id, T0))).toBe('REFUND');
    const asking = p.h.book.beginSignature(p.ledger, id, p.record.attempt!.txDigest, T0 + 1);
    const unsure = p.h.book.recordSubmissionUncertain(asking.ledger, id, T0 + 2);
    expect(unsure.record).toMatchObject({ state: 'submission-uncertain', note: 'wallet-outcome-unknown' });
    expect(p.h.book.recordSubmissionUncertain(unsure.ledger, id, T0 + 3).unchanged).toBe(true);
    expect(describeRefund(unsure.record, T0 + 3)).toMatchObject({ category: 'pending', guidance: 'wallet-outcome-unknown-do-not-resend', canCancel: false, reservesFunds: true });
    expect(code(() => p.h.book.beginSignature(unsure.ledger, id, p.record.attempt!.txDigest, T0 + 3))).toBe('REFUND');
    // A late hash from the wallet still resolves the uncertainty.
    expect(p.h.book.recordSubmission(unsure.ledger, id, hashOf(7), T0 + 4).record.state).toBe('submitted');
  });
});

describe('chain observations', () => {
  it('confirms, then finalizes only at finality, and reverts to submitted on a reorg', () => {
    const s = submitted();
    const id = s.record.refundId;
    const conf = s.h.book.observe(s.ledger, id, transferObs(s.record), T0 + 20);
    expect(conf.record.state).toBe('confirmed');
    expect(describeRefund(conf.record, T0 + 20)).toMatchObject({ category: 'pending', guidance: 'awaiting-finality' });
    const gone = s.h.book.observe(conf.ledger, id, { kind: 'not-found' }, T0 + 30);
    expect(gone.record).toMatchObject({ state: 'submitted', note: 'reorged-out', settlement: null });
    expect(describeRefund(gone.record, T0 + 30).guidance).toBe('reorged-awaiting-reinclusion');
    const fin = s.h.book.observe(gone.ledger, id, transferObs(s.record, { final: true, confirmations: 20n }), T0 + 40);
    expect(fin.record.state).toBe('finalized');
    expect(refundBalance(fin.ledger, evidence())).toMatchObject({ finalized: 400_000n, pending: 0n, remaining: 600_000n });
    expect(describeRefund(fin.record, T0 + 40)).toMatchObject({ category: 'completed', guidance: 'completed-verified' });
    expect(s.h.book.observe(fin.ledger, id, transferObs(s.record, { final: true }), T0 + 50).unchanged).toBe(true);
    expect(s.h.book.observe(fin.ledger, id, { kind: 'not-found' }, T0 + 50).unchanged).toBe(true);
  });
  it('recovers a refund whose hash was never recorded, using the transfer to its unique one-time address', () => {
    const p = preparedLedger();
    const id = p.record.refundId;
    const asking = p.h.book.beginSignature(p.ledger, id, p.record.attempt!.txDigest, T0 + 1);
    const found = p.h.book.observe(asking.ledger, id, transferObs(asking.record, { transactionHash: hashOf(0x77), final: true }), T0 + 100);
    expect(found.record.state).toBe('finalized');
    expect(found.record.attempt?.transactionHash).toBe(hashOf(0x77));
  });
  it('links a mined speed-up replacement without losing the first hash', () => {
    const s = submitted();
    const conf = s.h.book.observe(s.ledger, s.record.refundId, transferObs(s.record, { transactionHash: hashOf(0x99) }), T0 + 20);
    expect(conf.record.attempt).toMatchObject({ transactionHash: hashOf(0xbeef), replacementHashes: [hashOf(0x99)] });
    expect(conf.record.settlement?.transactionHash).toBe(hashOf(0x99));
  });
  it('treats wrong amount, asset, sender or ephemeral key at our address as recovery-required (still reserved)', () => {
    for (const over of [{ netAmount: 399_999n }, { assetId: 'native' }, { from: PAYER }, { ephemeralPublicKey: `0x03${'11'.repeat(32)}` }]) {
      const s = submitted();
      const bad = s.h.book.observe(s.ledger, s.record.refundId, transferObs(s.record, over), T0 + 20);
      expect(bad.record).toMatchObject({ state: 'recovery-required', note: 'evidence-mismatch' });
      expect(describeRefund(bad.record, T0 + 20)).toMatchObject({ category: 'needs-attention', reservesFunds: true });
      expect(refundBalance(bad.ledger, evidence()).reserved).toBe(400_000n);
      expect(s.h.book.observe(bad.ledger, s.record.refundId, { kind: 'unavailable' }, T0 + 30).unchanged).toBe(true);
    }
  });
  it('rejects observations about another destination or with malformed blocks', () => {
    const s = submitted();
    const id = s.record.refundId;
    expect(code(() => s.h.book.observe(s.ledger, id, transferObs(s.record, { stealthAddress: PAYER }), T0))).toBe('EVIDENCE');
    expect(code(() => s.h.book.observe(s.ledger, id, transferObs(s.record, { confirmations: 0n }), T0))).toBe('EVIDENCE');
    expect(code(() => s.h.book.observe(s.ledger, id, transferObs(s.record, { blockHash: 'x' }), T0))).toBe('EVIDENCE');
    expect(code(() => s.h.book.observe(s.ledger, id, transferObs(s.record, { transactionHash: 5 }), T0))).toBe('EVIDENCE');
    expect(code(() => s.h.book.observe(s.ledger, id, { kind: 'reverted', transactionHash: hashOf(0x1234) }, T0))).toBe('EVIDENCE');
    expect(code(() => s.h.book.observe(s.ledger, id, { kind: 'mystery' } as never, T0))).toBe('EVIDENCE');
    const p = preparedLedger();
    expect(code(() => p.h.book.observe(p.ledger, p.record.refundId, { kind: 'not-found' }, T0))).toBe('REFUND');
  });
  it('a revert is informational; only a finalized block past the deadline without a transfer proves failure', () => {
    const s = submitted();
    const id = s.record.refundId;
    const rev = s.h.book.observe(s.ledger, id, { kind: 'reverted', transactionHash: hashOf(0xbeef) }, T0 + 30);
    expect(rev.record).toMatchObject({ state: 'submitted', note: 'reverted-observed' });
    expect(refundBalance(rev.ledger, evidence()).reserved).toBe(400_000n);
    const absent = (o: Record<string, unknown>) => ({ kind: 'absent-after-deadline', scannedFromBlock: 180n, finalizedBlock: 400n, finalizedTimestamp: T0 + 1801, ...o }) as never;
    expect(code(() => s.h.book.observe(rev.ledger, id, absent({ finalizedTimestamp: T0 + 1800 }), T0))).toBe('EVIDENCE');
    expect(code(() => s.h.book.observe(rev.ledger, id, absent({ scannedFromBlock: 181n }), T0))).toBe('EVIDENCE');
    expect(code(() => s.h.book.observe(rev.ledger, id, absent({ finalizedBlock: 179n }), T0))).toBe('EVIDENCE');
    expect(code(() => s.h.book.observe(rev.ledger, id, absent({ finalizedTimestamp: 'later' }), T0))).toBe('EVIDENCE');
    const failed = s.h.book.observe(rev.ledger, id, absent({}), T0 + 2000);
    expect(failed.record).toMatchObject({ state: 'definitively-failed', note: 'deadline-passed-without-transfer' });
    expect(refundBalance(failed.ledger, evidence()).remaining).toBe(1_000_000n);
    expect(describeRefund(failed.record, T0 + 2000)).toMatchObject({ category: 'failed', guidance: 'not-sent-funds-unchanged', reservesFunds: false, canCancel: false });
    expect(s.h.book.observe(failed.ledger, id, absent({}), T0 + 2001).unchanged).toBe(true);
    expect(s.h.book.observe(failed.ledger, id, { kind: 'reverted', transactionHash: hashOf(0xbeef) }, T0 + 2001).unchanged).toBe(true);
    expect(s.h.book.observe(failed.ledger, id, { kind: 'unavailable' }, T0 + 2001).unchanged).toBe(true);
    // A new refund (new key, new authorization) may now use the released amount.
    expect(s.h.book.request(failed.ledger, s.h.mint(), req({ idempotencyKey: 'refund-0002', amount: 1_000_000n }), T0 + 2002).record.state).toBe('authorization-required');
  });
  it('a reorged-out confirmation that stays absent past the deadline fails as reorged-out', () => {
    const s = submitted();
    const conf = s.h.book.observe(s.ledger, s.record.refundId, transferObs(s.record), T0 + 20);
    const failed = s.h.book.observe(conf.ledger, s.record.refundId, { kind: 'absent-after-deadline', scannedFromBlock: 0n, finalizedBlock: 500n, finalizedTimestamp: T0 + 4000 }, T0 + 4000);
    expect(failed.record).toMatchObject({ state: 'definitively-failed', note: 'reorged-out' });
  });
  it('a transfer seen after proven failure is recorded as a contradiction even past the cap', () => {
    const s = submitted();
    const id = s.record.refundId;
    const failed = s.h.book.observe(s.ledger, id, { kind: 'absent-after-deadline', scannedFromBlock: 180n, finalizedBlock: 400n, finalizedTimestamp: T0 + 1801 }, T0 + 2000);
    const reuse = s.h.book.request(failed.ledger, s.h.mint(), req({ idempotencyKey: 'refund-0002', amount: 1_000_000n }), T0 + 2001);
    const contra = s.h.book.observe(reuse.ledger, id, transferObs(s.record, { final: true }), T0 + 2002);
    expect(contra.record).toMatchObject({ state: 'recovery-required', note: 'contradicts-failure' });
    expect(refundBalance(contra.ledger, evidence()).remaining).toBe(-400_000n);
    expect(code(() => s.h.book.request(contra.ledger, s.h.mint(), req({ idempotencyKey: 'refund-0003', amount: 1n }), T0 + 2003))).toBe('REFUND');
    // A finalized refund later "absent" is also a contradiction, never a silent failure.
    const t = submitted();
    const fin = t.h.book.observe(t.ledger, t.record.refundId, transferObs(t.record, { final: true }), T0 + 20);
    const weird = t.h.book.observe(fin.ledger, t.record.refundId, { kind: 'absent-after-deadline', scannedFromBlock: 0n, finalizedBlock: 500n, finalizedTimestamp: T0 + 4000 }, T0 + 4000);
    expect(weird.record).toMatchObject({ state: 'recovery-required', note: 'contradicts-failure' });
    expect(t.h.book.observe(weird.ledger, t.record.refundId, { kind: 'absent-after-deadline', scannedFromBlock: 0n, finalizedBlock: 500n, finalizedTimestamp: T0 + 4000 }, T0 + 4001).unchanged).toBe(true);
  });
  it('records RPC unavailability once without changing state', () => {
    const s = submitted();
    const u = s.h.book.observe(s.ledger, s.record.refundId, { kind: 'unavailable' }, T0 + 20);
    expect(u.record).toMatchObject({ state: 'submitted', note: 'rpc-unavailable' });
    expect(s.h.book.observe(u.ledger, s.record.refundId, { kind: 'unavailable' }, T0 + 21).unchanged).toBe(true);
    expect(s.h.book.observe(u.ledger, s.record.refundId, { kind: 'not-found' }, T0 + 21).unchanged).toBe(true);
  });
  it('a full replacement list makes an unknown mined hash a recovery case', () => {
    const s = submitted();
    let ledger = s.ledger;
    for (let i = 1; i <= MAX_REPLACEMENT_HASHES; i++) ledger = s.h.book.recordSubmission(ledger, s.record.refundId, hashOf(0xc000 + i), T0 + 12).ledger;
    const out = s.h.book.observe(ledger, s.record.refundId, transferObs(s.record, { transactionHash: hashOf(0xe000) }), T0 + 20);
    expect(out.record).toMatchObject({ state: 'recovery-required', note: 'evidence-mismatch', settlement: null });
  });
});

describe('cancel and display', () => {
  it('cancels only before a wallet request and releases the reservation', () => {
    const p = preparedLedger();
    const c = p.h.book.cancel(p.ledger, p.record.refundId, T0 + 1);
    expect(c.record).toMatchObject({ state: 'cancelled', attempt: null });
    expect(p.h.book.cancel(c.ledger, p.record.refundId, T0 + 2).unchanged).toBe(true);
    expect(refundBalance(c.ledger, evidence()).reserved).toBe(0n);
    expect(describeRefund(c.record, T0)).toMatchObject({ category: 'cancelled', canCancel: false });
    const h = harness();
    const r = h.book.request([], h.mint(), req(), T0);
    expect(h.book.cancel(r.ledger, r.record.refundId, T0).record.state).toBe('cancelled');
  });
  it('describes every pre-submission state honestly', () => {
    const h = harness();
    const r = h.book.request([], h.mint(), req(), T0);
    expect(describeRefund(r.record, T0)).toMatchObject({ category: 'requires-authorization', guidance: 'approve-refund', canCancel: true });
    const a = h.book.authorize(r.ledger, r.record.refundId, operatorAuthorization(r.record, 'operator-1', T0, 600), T0);
    expect(describeRefund(a.record, T0)).toMatchObject({ category: 'available', guidance: 'review-and-sign' });
    expect(describeRefund(a.record, T0 + 600).guidance).toBe('authorization-expired');
    const p = preparedLedger();
    expect(describeRefund(p.record, T0)).toMatchObject({ category: 'available', guidance: 'review-and-sign', secondsUntilDeadline: 1800 });
    expect(describeRefund(p.record, T0 + 1790).guidance).toBe('prepare-again');
    expect(describeRefund(p.record, T0 + 5000).secondsUntilDeadline).toBe(0);
    const asking = p.h.book.beginSignature(p.ledger, p.record.refundId, p.record.attempt!.txDigest, T0 + 1);
    expect(describeRefund(asking.record, T0 + 1)).toMatchObject({ category: 'pending', guidance: 'confirm-in-wallet-once', canCancel: false });
    expect(describeRefund(submitted().record, T0 + 20).guidance).toBe('awaiting-confirmation');
    expect(code(() => describeRefund(p.record, -1))).toBe('REFUND');
    expect(code(() => describeRefund({ ...p.record, state: 'odd' } as never, T0))).toBe('STATE');
  });
});

describe('persistence and corruption', () => {
  it('round-trips every state through strict JSON', () => {
    const s = submitted();
    const fin = s.h.book.observe(s.ledger, s.record.refundId, transferObs(s.record, { final: true }), T0 + 20);
    const p = preparedLedger(s.h, 'refund-0002', 2, fin.ledger);
    const text = serializeRefundLedger(p.ledger);
    const back = parseRefundLedger(text);
    expect(serializeRefundLedger(back)).toBe(text);
    expect(back.map((r) => r.state)).toEqual(['finalized', 'prepared']);
    expect(Object.isFrozen(back)).toBe(true);
  });
  it('fails closed on tampered, oversized or malformed stores', () => {
    const s = submitted();
    const text = serializeRefundLedger(s.ledger);
    const mutate = (fn: (o: { records: Record<string, unknown>[] }) => void): string => {
      const o = JSON.parse(text) as { records: Record<string, unknown>[] };
      fn(o);
      return JSON.stringify(o);
    };
    const cases: string[] = [
      'not json', '[]', JSON.stringify({ format: 'other', records: [] }), JSON.stringify({ format: 'ghostpay-refund-ledger/1', records: {} }),
      JSON.stringify({ format: 'ghostpay-refund-ledger/1', records: [], extra: 1 }),
      mutate((o) => { (o.records[0] as Record<string, unknown>)['amount'] = '999999999'; }),
      mutate((o) => { (o.records[0] as Record<string, unknown>)['amount'] = '-1'; }),
      mutate((o) => { (o.records[0] as Record<string, unknown>)['amount'] = 400000; }),
      mutate((o) => { (o.records[0] as Record<string, unknown>)['state'] = 'cancelled'; }),
      mutate((o) => { (o.records[0] as Record<string, unknown>)['state'] = 'finalized'; }),
      mutate((o) => { (o.records[0] as Record<string, unknown>)['refundId'] = 'f'.repeat(64); }),
      mutate((o) => { (o.records[0] as Record<string, unknown>)['note'] = 'whatever'; }),
      mutate((o) => { (o.records[0] as Record<string, unknown>)['destinationMeta'] = PAYER; }),
      mutate((o) => { ((o.records[0] as Record<string, Record<string, unknown>>)['attempt'] as Record<string, unknown>)['to'] = PAYER; }),
      mutate((o) => { ((o.records[0] as Record<string, Record<string, unknown>>)['attempt'] as Record<string, unknown>)['transactionHash'] = null; }),
      mutate((o) => { ((o.records[0] as Record<string, Record<string, unknown>>)['attempt'] as Record<string, unknown>)['requestedAt'] = null; }),
      mutate((o) => { ((o.records[0] as Record<string, Record<string, unknown>>)['attempt'] as Record<string, unknown>)['startBlock'] = '0x10'; }),
      mutate((o) => { ((o.records[0] as Record<string, Record<string, unknown>>)['attempt'] as Record<string, unknown>)['extra'] = 1; }),
      mutate((o) => { ((o.records[0] as Record<string, Record<string, unknown>>)['authorization'] as Record<string, unknown>)['digest'] = 'a'.repeat(64); }),
      mutate((o) => { (o.records[0] as Record<string, unknown>)['authorization'] = null; }),
      mutate((o) => { ((o.records[0] as Record<string, Record<string, unknown>>)['original'] as Record<string, unknown>)['amount'] = '2000000'; }),
      mutate((o) => { o.records.push(o.records[0] as Record<string, unknown>); }),
      'x'.repeat(2 * 1024 * 1024 + 1),
    ];
    for (const c of cases) expect(code(() => parseRefundLedger(c)), c.slice(0, 60)).toBe('STATE');
    expect(code(() => validateRefundLedger({} as never))).toBe('STATE');
  });
  it('detects cross-record reuse of destinations, hashes and over-reservation', () => {
    const h = harness();
    const one = preparedLedger(h, 'refund-0001', 1);
    const two = preparedLedger(h, 'refund-0002', 2, one.ledger);
    const [a, b] = two.ledger as [RefundRecord, RefundRecord];
    const sameDest = { ...b, attempt: { ...b.attempt!, stealthAddress: a.attempt!.stealthAddress } };
    expect(code(() => validateRefundLedger([a, { ...sameDest, attempt: { ...sameDest.attempt, txDigest: attemptDigest(b.refundId, sameDest.attempt) } }]))).toBe('STATE');
    const sA = submitted();
    const hashA = sA.record.attempt!.transactionHash!;
    const asking = h.book.beginSignature(two.ledger, b.refundId, b.attempt!.txDigest, T0 + 1);
    expect(code(() => h.book.recordSubmission(h.book.recordSubmission(asking.ledger, b.refundId, hashA, T0 + 2).ledger, a.refundId, hashA, T0 + 2))).toBe('REFUND');
    const askingA = h.book.beginSignature(h.book.recordSubmission(asking.ledger, b.refundId, hashA, T0 + 2).ledger, a.refundId, a.attempt!.txDigest, T0 + 3);
    expect(code(() => h.book.recordSubmission(askingA.ledger, a.refundId, hashA, T0 + 4))).toBe('STATE');
    expect(code(() => validateRefundLedger([{ ...a, amount: 700_000n }, b]))).toBe('STATE');
    expect(code(() => validateRefundLedger([a, { ...b, original: { ...b.original, recipientAddress: '0x' + '9'.repeat(40) } }]))).toBe('STATE');
  });
});
