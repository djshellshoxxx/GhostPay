# Spec: scheduled / delayed payments (ux-schedule)

## Requirements
- S1 States pending, due, confirmed, cancelled, expired. Transitions: pending->due (now >= dueAt), pending|due->expired (now > dueAt+maxAge), due->confirmed (user), pending|due->cancelled (user). confirmed/cancelled/expired are terminal.
- S2 Never auto-sends. The only output is `DueItem { needsUserConfirm: true, overdueMs, expiresInMs }`. `confirm` is a state change only; the app then runs the normal signing flow.
- S3 Max-age guard (60s..90d, default 7d): expired payments cannot be confirmed, even if never ticked (confirm ticks first).
- S4 Confirm requires `userConfirmed: true` and recipient+amount equal to the frozen snapshot.
- S5 dueAt must be >= now and <= now+5y. Max 500 items; unique ids.
- S6 Recurring schedules materialize deterministic ids `<schedule>@<dueAtMs>` (idempotent), frozen from the template at that moment.

## Acceptance tests (scheduled.test.ts, schedule.test.ts)
Confirm at dueAt+maxAge ok, +1ms refused with `expired`; confirm while pending refused; mismatched amount refused; cancelled cannot be confirmed; backwards clock does not regress `due`; sweep ordering oldest first; re-materialize creates no duplicates.
