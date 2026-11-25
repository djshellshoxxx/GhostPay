# Spec: private refunds

Package: `@ghostpay/merchant-billing` (`refunds.ts`, `address.ts`). Status: implemented (plan builder only; broadcasting is out of scope, see audit).

## Requirements

1. A refund plan links to the original payment (paymentId, invoice nonce, chain, token).
2. Cumulative non-failed refunds for a payment never exceed the paid amount.
3. Destination must be a payer-provided stealth meta-address (valid curve points). Plain addresses, including the original sender, are refused. Meta-addresses in a caller-supplied `linkedMetas` list (for example the one used to pay) are refused.
4. Idempotency key (8..128 safe chars): same key and same parameters returns the existing plan (`replayed`); same key with different amount or destination is rejected. `refundId = sha256("ghostpay-refund-v1\n"+paymentId+"\n"+key)`.
5. Status machine planned -> submitted -> confirmed, with failed allowed only from planned. Terminal states are final. A failed never-submitted plan frees its cap; submitted and confirmed plans continue to count toward it.
6. Status transitions record caller assertions and perform no chain verification. A timeout or uncertain submission cannot release a submitted plan's reservation through this API. Evidence-based failure resolution and broadcasting are outside its scope.

## Acceptance tests (`refunds.test.ts`, `refunds.uncertain.test.ts`)

- Paid 5_304_000: refund 5_000_000 then 304_000 ok (remaining 0); then 1 rejected; 304_001 rejected.
- Retry with same key: replayed, remaining unchanged (4_304_000 after a 1_000_000 refund).
- Sender address and uppercase variant refused.
- A submitted full-refund plan cannot transition to failed; a second full refund remains over the cap.
- A never-submitted plan can transition to failed and free its reservation for another plan.
