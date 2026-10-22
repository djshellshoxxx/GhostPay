# Spec: subscriptions (recurring billing)

Package: `@ghostpay/merchant-billing` (`schedule.ts`, `subscription.ts`). Status: implemented.

## Constraint
GhostPay is non-custodial. A merchant cannot pull funds, and no payer-approved allowance pull exists. A subscription is therefore a deterministic schedule of merchant-issued invoices plus reminders and dunning states. The payer pays each invoice voluntarily.

## Requirements
1. Plan: id, ASCII name, currency, price in minor units, tax bps, schedule (anchor, weekly/monthly with `every` 1..24, or custom seconds 3600s..366d). All UTC.
2. Period start is computed from the anchor, never the previous period: Jan 31 monthly gives Feb 28 (29 in leap years), Mar 31, Apr 30. Horizon 100000 periods.
3. `advance(sub, now, template, policy, rng)` is pure and idempotent. It issues the invoice via `createInvoice` (fiat total = price + floor tax, one line item, expiry = due + grace + lapse), at most `maxIssuePerAdvance` per call, from `leadSeconds` before period start. No back-billing of history.
4. States: active, past_due (unpaid past due + grace; new issuance blocked), lapsed (past grace + lapse; terminal until explicit action), paused (no issuance, no reminders), canceled.
5. Reminders at configured offsets from due; at most one per invoice per call; skipped offsets collapse.
6. Pause/resume: periods starting during a pause are skipped. Cancel: immediate (voids unpaid) or at period end.
7. Proration: half-up `amount * remaining / length`; plan change returns separate credit and charge, never silently netted.
8. `markPaid` idempotent; only called after on-chain verification by the caller.

## Acceptance tests (real numbers; all in `subscription.test.ts`, `schedule.test.ts`)
- Price 4900, tax 825 bps -> tax 404, invoice fiat total 5304.
- Monthly Jan 31 2026 -> 2026-01-31, 02-28, 03-31, 04-30, 05-31. Jan 31 2028 -> 2028-02-29.
- Invoice not issued at start-4d with 3d lead; issued at start-3d; second call same time issues 0.
- Due Jan 31, grace 3d, lapse 14d: past_due at +3d, lapsed at +17d, no further issuance.
- Prorate 1000 with 10/30 days left = 667. Upgrade 3000 to 6000 with 10 days left = charge 1000.
- Pause then resume on Mar 5 -> next billed period is Mar 31.
