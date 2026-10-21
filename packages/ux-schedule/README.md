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
