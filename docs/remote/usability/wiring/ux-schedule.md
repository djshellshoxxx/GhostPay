# Wiring plan: ux-schedule -> apps/web

Package is logic only. Host supplies `clock = () => Date.now()` and `tz` built from `Intl.DateTimeFormat(...).resolvedOptions().timeZone` (compute offset minutes for a UTC instant in the web layer; pass as `TzOffset`).

## Files
- `apps/web/src/features/schedule/store.ts`: local-only persisted state (templates, schedules, scheduled[]) in encrypted local storage via existing vault/secret-box; on load run `parseTemplates` and re-validate rules with `validateRule`.
- `apps/web/src/features/schedule/useDueItems.ts`: on app focus and every 60s (timer lives here, not in package) call `sweep()` and `evaluateSchedule()` + `materializeDue()`; persist results.
- Components: `TemplateList`, `TemplateForm`, `ScheduleEditor` (shows `listUpcoming(…,5)` preview), `DueInbox` (banner + list), `ConfirmDueDialog`.
- `ConfirmDueDialog` shows recipient (full, monospace) and amount, requires a deliberate tap, calls `confirm(p, {userConfirmed:true, recipient, amount}, clock)` with the values rendered, then hands off to the existing send/sign flow. On `markHandled` after confirm or dismiss.

## State
templates[], schedules[] (RecurringSchedule), scheduled[] (ScheduledPayment). Dismiss = `cancel` for one-offs, `markHandled` for recurring.

## i18n keys
schedule.template.{title,new,name,amount,recipient,memo,duplicateName,limit}; schedule.recurrence.{daily,weekly,monthly,every,at,nextRuns,endsOn,maxCount,missedSkipped}; schedule.due.{title,needsConfirm,overdue,expiresIn,confirm,dismiss,expired}; schedule.error.{bad_amount,bad_recipient,in_past,too_far,mismatch,expired}.

## e2e ideas
Create monthly-31 schedule with mocked clock, assert Feb 28 prompt; close app 10 days, reopen, assert one prompt + "N skipped"; DST day clock; expired item cannot be confirmed; no network request fired at due time before the user taps confirm.
