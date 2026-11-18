# @ghostpay/ux-schedule

Pure logic (no DOM, network, timers or globals; clock and timezone are injected) for
payment templates, recurring schedules and delayed payments.

- `template.ts`: strict create/update/import of payment templates.
- `recurrence.ts`: daily/weekly/monthly rules, month-end clamping, DST-safe next-occurrence, missed/skipped handling.
- `scheduled.ts`: state machine pending/due/confirmed/cancelled/expired with max-age guard.
- `schedule.ts`: binds a template + rule, produces unconfirmed `due` payments.

Nothing here ever sends funds. Every due item carries `needsUserConfirm: true`; `confirm()`
needs an explicit acknowledgement echoing recipient and amount.

Specs: docs/remote/usability/specs/schedule-*.md. Wiring: docs/remote/usability/wiring/ux-schedule.md.

Runtime counts reject NaN/infinity; catch-up limits and last-handled instants must be
safe integers. Finite integer catch-up counts retain the existing 1..20 clamp.
Calendar tests cover month-end/leap-day behavior, DST gaps/folds and an explicit change
of injected zone. Hosts should pin a schedule's zone: changing the resolver recalculates
UTC occurrences and can produce another confirmation prompt for the same civil date.
The monotonic `lastHandledMs` boundary remains respected and no prompt sends funds.
