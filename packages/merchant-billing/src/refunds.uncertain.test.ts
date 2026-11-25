import { describe, expect, it } from 'vitest';
import { BillingError, planRefund, transitionRefund, type OriginalPayment } from './index.js';
import { REFUND_META } from './fixtures.testutil.js';

// Regression (P0 Worker B, REC-P1-05): a refund that reached `submitted` may already be on chain. Marking it
// `failed` without chain evidence released its reservation, so a second full refund could be planned for the
// same payment and the merchant could refund twice. Only a never-submitted plan may fail in the plan-only API;
// a submitted refund's definitive failure needs evidence that this plan-only API does not verify.
const orig: OriginalPayment = {
  paymentId: '0xabc123:4', invoiceNonce: '00112233445566778899aabbccddeeff', chainId: 8453,
  token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', paidAmount: 5_304_000n,
  senderAddress: '0x1111111111111111111111111111111111111111',
};

describe('plan-only refunds never release an uncertain submission', () => {
  it('refuses submitted -> failed, so a timed-out refund keeps its reservation', () => {
    const first = transitionRefund(planRefund(orig, [], { idempotencyKey: 'refund-full-1', amount: 5_304_000n, destinationMeta: REFUND_META }).plan, 'submitted');
    expect(() => transitionRefund(first, 'failed')).toThrow(BillingError);
    expect(() => planRefund(orig, [first], { idempotencyKey: 'refund-full-2', amount: 5_304_000n, destinationMeta: REFUND_META })).toThrow(/exceeds paid amount/);
  });
  it('still lets an unsubmitted plan fail and free its reservation', () => {
    const plan = planRefund(orig, [], { idempotencyKey: 'refund-full-1', amount: 5_304_000n, destinationMeta: REFUND_META }).plan;
    const failed = transitionRefund(plan, 'failed');
    expect(planRefund(orig, [failed], { idempotencyKey: 'refund-full-2', amount: 5_304_000n, destinationMeta: REFUND_META }).remainingRefundable).toBe(0n);
  });
});
