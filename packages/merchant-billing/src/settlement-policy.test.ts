import { describe, expect, it } from 'vitest';
import {
  BillingError,
  classifySettlement,
  createOutcomeAuthority,
  describeEligibility,
  DEFAULT_SETTLEMENT_POLICY,
  type InvoiceTerms,
  type PaymentEvidence,
} from './index.js';
import { evidence, hashOf, T0, TOKEN } from './refund-lifecycle.testutil.js';

const { minter, checker } = createOutcomeAuthority('evm-router-v1');
const EXP = T0 + 3600;
const terms: InvoiceTerms = { invoiceId: 'inv-0001', chainId: 84532, assetId: TOKEN, amountDue: 1_000_000n, expiresAt: EXP, cancelledAt: null };
let n = 0;
const pay = (over: Partial<PaymentEvidence> = {}) => {
  n++;
  const transactionHash = over.transactionHash ?? hashOf(0x7000 + n);
  return minter.mint(evidence({ transactionHash, paymentId: `evm:${String(over.chainId ?? 84532)}:${transactionHash}`, blockNumber: BigInt(100 + n), blockTimestamp: T0, ...over }));
};
const code = (fn: () => unknown): string => {
  try { fn(); } catch (e) { if (e instanceof BillingError) return e.code; throw e; }
  return 'NO_THROW';
};

describe('classifySettlement', () => {
  it('unpaid before expiry, expired-unpaid at and after expiry', () => {
    expect(classifySettlement(checker, terms, [], { now: EXP - 1 })).toMatchObject({ status: 'unpaid', outstanding: 1_000_000n, provisional: false });
    expect(classifySettlement(checker, terms, [], { now: EXP }).status).toBe('expired-unpaid');
    expect(classifySettlement(checker, terms, [], { now: EXP, unresolvedObservations: 1 })).toMatchObject({ status: 'expired-unpaid', provisional: true, unresolvedObservations: 1 });
  });
  it('exact on-time payment is paid with nothing refundable', () => {
    const r = classifySettlement(checker, terms, [pay({ blockTimestamp: EXP - 1 })], { now: EXP + 10 });
    expect(r).toMatchObject({ status: 'paid', applied: 1_000_000n, unapplied: 0n });
    expect(r.payments[0]).toMatchObject({ disposition: 'applied', timing: 'on-time', eligibility: 'not-eligible', refundableUpTo: 0n, suggestedReason: null });
    expect(describeEligibility(r.payments[0]!)).toBe('refund-unavailable');
  });
  it('a payment mined exactly at expiry is late and preserved, not discarded or auto-refunded', () => {
    const r = classifySettlement(checker, terms, [pay({ blockTimestamp: EXP })], { now: EXP + 10 });
    expect(r).toMatchObject({ status: 'expired-unpaid', applied: 0n, unapplied: 1_000_000n });
    expect(r.payments[0]).toMatchObject({ disposition: 'late', eligibility: 'seller-decision', refundableUpTo: 1_000_000n, suggestedReason: 'late-payment' });
    expect(describeEligibility(r.payments[0]!)).toBe('refund-requires-authorization');
    const accepted = classifySettlement(checker, terms, [pay({ blockTimestamp: EXP + 5 })], { now: EXP + 10, policy: { ...DEFAULT_SETTLEMENT_POLICY, late: 'accept' } });
    expect(accepted).toMatchObject({ status: 'paid' });
    expect(accepted.payments[0]).toMatchObject({ timing: 'late', disposition: 'applied' });
    const refund = classifySettlement(checker, terms, [pay({ blockTimestamp: EXP + 5 })], { now: EXP + 10, policy: { ...DEFAULT_SETTLEMENT_POLICY, late: 'refund' } });
    expect(refund.payments[0]).toMatchObject({ eligibility: 'eligible' });
    expect(describeEligibility(refund.payments[0]!)).toBe('refund-available');
  });
  it('duplicate payment: second exact payment is wholly excess, refundable on decision or by policy', () => {
    const a = pay();
    const b = pay();
    const r = classifySettlement(checker, terms, [b, a], { now: T0 });
    expect(r).toMatchObject({ status: 'overpaid', applied: 1_000_000n, unapplied: 1_000_000n });
    expect(r.payments.map((p) => p.paymentId)).toEqual([a.paymentId, b.paymentId]);
    expect(r.payments[1]).toMatchObject({ disposition: 'duplicate', refundableUpTo: 1_000_000n, suggestedReason: 'duplicate-payment', eligibility: 'seller-decision' });
    expect(classifySettlement(checker, terms, [a, b], { now: T0, policy: { ...DEFAULT_SETTLEMENT_POLICY, excess: 'refund' } }).payments[1]?.eligibility).toBe('eligible');
  });
  it('overpayment: exact excess in base units; later smaller payment is excess, not duplicate', () => {
    const r = classifySettlement(checker, terms, [pay({ amount: 1_000_001n }), pay({ amount: 7n })], { now: T0 });
    expect(r.payments[0]).toMatchObject({ disposition: 'applied', applied: 1_000_000n, excess: 1n, refundableUpTo: 1n, suggestedReason: 'overpayment' });
    expect(r.payments[1]).toMatchObject({ disposition: 'excess', refundableUpTo: 7n });
    expect(r).toMatchObject({ status: 'overpaid', unapplied: 8n });
  });
  it('underpayment keeps partial evidence and outstanding balance; expired partial becomes refundable on decision', () => {
    const p = pay({ amount: 300_000n });
    expect(classifySettlement(checker, terms, [p], { now: T0 })).toMatchObject({ status: 'partial', outstanding: 700_000n, applied: 300_000n });
    const exp = classifySettlement(checker, terms, [p], { now: EXP });
    expect(exp).toMatchObject({ status: 'expired-partial', outstanding: 700_000n });
    expect(exp.payments[0]).toMatchObject({ refundableUpTo: 300_000n, eligibility: 'seller-decision', suggestedReason: 'expired-partial' });
    expect(classifySettlement(checker, terms, [p], { now: EXP, policy: { ...DEFAULT_SETTLEMENT_POLICY, expiredPartial: 'refund' } }).payments[0]?.eligibility).toBe('eligible');
  });
  it('cancellation after broadcast: earlier payments refundable on decision, later ones after-cancellation', () => {
    const before = pay({ blockTimestamp: T0 - 10 });
    const after = pay({ blockTimestamp: T0 + 10 });
    const r = classifySettlement(checker, { ...terms, cancelledAt: T0 }, [before, after], { now: T0 + 20, policy: { late: 'refund', excess: 'refund', expiredPartial: 'refund' } });
    expect(r.status).toBe('cancelled');
    expect(r.payments[0]).toMatchObject({ disposition: 'applied', refundableUpTo: 1_000_000n, eligibility: 'seller-decision', suggestedReason: 'order-cancelled' });
    expect(r.payments[1]).toMatchObject({ disposition: 'after-cancellation', eligibility: 'eligible', suggestedReason: 'order-cancelled' });
  });
  it('non-final payments are provisional and never refund-eligible yet', () => {
    const r = classifySettlement(checker, terms, [pay(), pay({ status: 'confirmed' })], { now: T0 });
    expect(r.provisional).toBe(true);
    expect(r.payments[1]).toMatchObject({ eligibility: 'awaiting-finality', final: false });
    expect(describeEligibility(r.payments[1]!)).toBe('refund-pending-finality');
    const partial = classifySettlement(checker, terms, [pay({ amount: 5n, status: 'confirmed' })], { now: EXP });
    expect(partial.payments[0]?.eligibility).toBe('awaiting-finality');
  });
  it('wrong chain or asset attributed to the invoice is never applied', () => {
    const r = classifySettlement(checker, terms, [pay({ chainId: 1 }), pay({ assetId: 'native' })], { now: T0 });
    expect(r.payments.map((p) => p.disposition)).toEqual(['wrong-chain', 'wrong-asset']);
    expect(r).toMatchObject({ status: 'unpaid', applied: 0n, unapplied: 2_000_000n });
  });
  it('refuses unverified, foreign-invoice and duplicate outcomes and invalid inputs', () => {
    const p = pay();
    expect(code(() => classifySettlement(checker, terms, [evidence() as never], { now: T0 }))).toBe('EVIDENCE');
    expect(code(() => classifySettlement(checker, terms, [createOutcomeAuthority('evm-router-v1').minter.mint(evidence())], { now: T0 }))).toBe('EVIDENCE');
    expect(code(() => classifySettlement(checker, terms, [pay({ invoiceId: 'inv-0002' })], { now: T0 }))).toBe('EVIDENCE');
    expect(code(() => classifySettlement(checker, terms, [p, p], { now: T0 }))).toBe('EVIDENCE');
    for (const t of [{ invoiceId: 'bad id' }, { chainId: 0 }, { assetId: '0xABC' }, { amountDue: 0n }, { expiresAt: -1 }, { cancelledAt: 1.5 }])
      expect(code(() => classifySettlement(checker, { ...terms, ...t }, [], { now: T0 }))).toBe('REFUND');
    expect(code(() => classifySettlement(checker, null as never, [], { now: T0 }))).toBe('REFUND');
    expect(code(() => classifySettlement(checker, terms, [], { now: -1 }))).toBe('REFUND');
    expect(code(() => classifySettlement(checker, terms, [], { now: T0, unresolvedObservations: -1 }))).toBe('REFUND');
    expect(code(() => classifySettlement(checker, terms, [], { now: T0, policy: { late: 'maybe' } as never }))).toBe('REFUND');
    expect(code(() => classifySettlement(checker, terms, {} as never, { now: T0 }))).toBe('REFUND');
  });
});
