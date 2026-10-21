# Spec: reminder-bridge (type for ux-schedule)

`ScheduledReminder` is plain JSON: `{v:1,id,dueAtMs,label?,amount?,asset?,address?,priority?,graceMs?}`. ux-schedule owns recurrence and emits one occurrence at a time.
- `validateScheduledReminder(unknown)` strict (exact keys, id `[A-Za-z0-9_-]{1,64}`, params rules identical to the queue).
- `reminderToNotificationInput(r, now)`: null unless `dueAtMs <= now <= dueAtMs+grace(24h default)`; kind `reminder_due`, dedupeKey `reminder:<id>:<dueAtMs>` (re-polls dedupe, next occurrence fires), coalesceKey `reminder_due`, ttl = remaining grace.
- `dueNotificationInputs(list, now)` deterministic order (due time, id).
Acceptance: reminder-bridge.test.ts (validation matrix, window boundaries, double-poll yields one coalesced discreet entry with no leaked details).
