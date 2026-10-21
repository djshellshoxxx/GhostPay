# Spec: deposits and partial payments

Package: `@ghostpay/merchant-billing` (`installments.ts`). Status: implemented.

## Requirements
1. Ledger with total, a deposit (floor of `depositBps`), and N equal installments; remainder units go to the earliest installments so the schedule sums to total exactly.
2. Payments applied by idempotency id (tx hash + log index from the verified event). Replay with the same amount is a no-op; replay with a different amount is rejected.
3. Allocation is oldest-installment-first; states paid/partial/unpaid/overdue derived from `now`.
4. Tolerance: underpay = max(abs, bps of total) counts as settled; overpay within tolerance is settled; above tolerance status is `overpaid` and `refundableExcess` feeds the refund flow.
5. bigint only; amounts up to 2^256-1; tolerance must be below total.

## Acceptance tests (`installments.test.ts`)
- total 1_000_001, 25% deposit, 3 installments -> 250000, 250001, 250000, 250000 (sum exact).
- 0.1% underpay tolerance: paid 999_001 settled (short 1000); 999_000 partial.
- Overpay tolerance 500: paid 1_000_501 settled; 1_000_502 overpaid, excess 501.
- Duplicate `tx1:0` ignored; same id with another amount throws.
