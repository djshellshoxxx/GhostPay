import { describe, expect, it } from 'vitest';
import { BillingError, planRefund, transitionRefund, type OriginalPayment, type RefundPlan } from './index.js';
import { META, OTHER_META, REFUND_META } from './fixtures.testutil.js';

const orig: OriginalPayment = {
  paymentId: '0xabc123:4', invoiceNonce: '00112233445566778899aabbccddeeff', chainId: 8453,
  token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', paidAmount: 5_304_000n,
  senderAddress: '0x1111111111111111111111111111111111111111',
};
const req = (over: Record<string, unknown> = {}) => ({ idempotencyKey: 'refund-0001', amount: 1_000_000n, destinationMeta: REFUND_META, ...over }) as Parameters<typeof planRefund>[2];

describe('planRefund', () => {
  it('builds a linked plan', () => {
    const r = planRefund(orig, [], req());
    expect(r.replayed).toBe(false);
    expect(r.plan).toMatchObject({ paymentId: '0xabc123:4', amount: 1_000_000n, status: 'planned', destinationMeta: REFUND_META, chainId: 8453 });
    expect(r.plan.refundId).toMatch(/^[0-9a-f]{64}$/);
    expect(r.remainingRefundable).toBe(4_304_000n);
  });
  it('refundId is deterministic per payment+key and differs by key', () => {
    const a = planRefund(orig, [], req()).plan.refundId;
    expect(planRefund(orig, [], req()).plan.refundId).toBe(a);
    expect(planRefund(orig, [], req({ idempotencyKey: 'refund-0002' })).plan.refundId).not.toBe(a);
  });
  it('replay returns existing plan without double counting', () => {
    const first = planRefund(orig, [], req()).plan;
    const again = planRefund(orig, [first], req());
    expect(again.replayed).toBe(true);
    expect(again.plan).toBe(first);
    expect(again.remainingRefundable).toBe(4_304_000n);
  });
  it('same key with different amount or destination is rejected', () => {
    const first = planRefund(orig, [], req()).plan;
    expect(() => planRefund(orig, [first], req({ amount: 1_000_001n }))).toThrow(BillingError);
    expect(() => planRefund(orig, [first], req({ destinationMeta: META }))).toThrow(BillingError);
  });
  it('caps cumulative refunds at paid; exact full refund allowed, +1 not', () => {
    const a = planRefund(orig, [], req({ amount: 5_000_000n })).plan;
    expect(() => planRefund(orig, [a], req({ idempotencyKey: 'refund-0002', amount: 304_001n }))).toThrow(BillingError);
    const b = planRefund(orig, [a], req({ idempotencyKey: 'refund-0002', amount: 304_000n }));
    expect(b.remainingRefundable).toBe(0n);
    expect(() => planRefund(orig, [a, b.plan], req({ idempotencyKey: 'refund-0003', amount: 1n }))).toThrow(BillingError);
  });
  it('failed refunds do not consume the cap; other payments ignored', () => {
    const a = transitionRefund(planRefund(orig, [], req({ amount: 5_304_000n })).plan, 'failed');
    const other: RefundPlan = { ...a, paymentId: 'other', status: 'planned' };
    expect(planRefund(orig, [a, other], req({ idempotencyKey: 'refund-0009', amount: 5_304_000n })).remainingRefundable).toBe(0n);
  });
  it('never refunds to a plain address, including the sender', () => {
    for (const d of [orig.senderAddress, '0x2222222222222222222222222222222222222222', orig.senderAddress.toUpperCase().replace('0X', '0x')])
      expect(() => planRefund(orig, [], req({ destinationMeta: d }))).toThrow(/plain address|meta-address/);
  });
  it('rejects linked/reused and malformed meta-addresses', () => {
    expect(() => planRefund(orig, [], req({ destinationMeta: META }), [META, OTHER_META])).toThrow(BillingError);
    expect(() => planRefund(orig, [], req({ destinationMeta: 'st:eth:0x' + '02'.repeat(66) }))).toThrow(BillingError);
    expect(() => planRefund(orig, [], req({ destinationMeta: REFUND_META.toUpperCase() }))).toThrow(BillingError);
    expect(() => planRefund(orig, [], req({ destinationMeta: 'st:eth:0x' + '00'.repeat(66) }))).toThrow(BillingError);
    expect(() => planRefund(orig, [], req({ destinationMeta: 5 as unknown as string }))).toThrow(TypeError);
  });
  it('rejects bad amount, key, payment', () => {
    expect(() => planRefund(orig, [], req({ amount: 0n }))).toThrow(BillingError);
    expect(() => planRefund(orig, [], req({ amount: -5n }))).toThrow(BillingError);
    expect(() => planRefund(orig, [], req({ idempotencyKey: 'short' }))).toThrow(BillingError);
    expect(() => planRefund(orig, [], req({ idempotencyKey: 'has space in it' }))).toThrow(BillingError);
    expect(() => planRefund({ ...orig, paidAmount: 0n }, [], req())).toThrow(BillingError);
    expect(() => planRefund({ ...orig, paymentId: 'bad id' }, [], req())).toThrow(BillingError);
  });
});

describe('transitionRefund', () => {
  const p = planRefund(orig, [], req()).plan;
  it('happy path and idempotent same-state', () => {
    const s = transitionRefund(p, 'submitted');
    expect(transitionRefund(s, 'submitted')).toBe(s);
    expect(transitionRefund(s, 'confirmed').status).toBe('confirmed');
  });
  it('terminal states are final; skipping is illegal', () => {
    expect(() => transitionRefund(p, 'confirmed')).toThrow(BillingError);
    expect(() => transitionRefund(transitionRefund(p, 'failed'), 'submitted')).toThrow(BillingError);
    expect(() => transitionRefund(transitionRefund(transitionRefund(p, 'submitted'), 'confirmed'), 'failed')).toThrow(BillingError);
  });
});
