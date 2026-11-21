# Spec: reconciliation (@ghostpay/merchant-ledger)

## Requirements
- R1 Money is bigint fiat minor units; inputs are decimal strings. No floats.
- R2 Payment -> invoice: by explicit `invoiceId`; else by exact/tolerant amount against OPEN same-currency invoices if exactly one candidate (else unmatched `ambiguous`).
- R3 Tolerance = max(absoluteMinor, floor(amount*bps/10000)). Defaults 0.
- R4 Status precedence per invoice: `over` (sum>amount+tol); `paid` (|sum-amount|<=tol and either amount=0 or sum>0); otherwise `expired` (now>=expiresAt), `unmatched` (sum=0), or `partial`. Here sum includes only counted payments: tolerance alone cannot settle a nonzero invoice, while an invoice with nothing due remains settled.
- R5 Payments observed at/after `expiresAt` do not count; listed as `late`.
- R6 Duplicate payment ids ignored (first wins, ordered deterministically), reported.
- R7 Unknown invoiceId, currency mismatch, bad amount (non-integer/negative/zero) -> unmatched payments with reason; never throws on one bad row.
- R8 Output deterministic: invoices by id, payments by (observedAt,id) codepoint order.
- R9 Delta (`paid - amount`) reported as signed decimal string.

## Acceptance tests
exact paid; within-tolerance paid; partial; over; unmatched; expired w/ and w/o partial; late payment; duplicate id; unknown invoice; ambiguous amount match; unique amount match; currency mismatch; zero/negative/float amount rejected; input order independence; bigint > 2^64 amounts; oversized tolerance with no counted payment stays unmatched/expired; zero-due invoices remain settled before and after expiry.
