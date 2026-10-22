# Spec: recurring schedules (ux-schedule)

## Requirements
- R1 Rule: frequency daily|weekly|monthly, interval (1-365; months 1-120), local startDate (2000-2200, real date), timeOfDayMinutes 0-1439, weekly weekdays (default weekday of start), monthly dayOfMonth (default start day), optional endMs (inclusive), maxOccurrences (1-10000). Unknown keys rejected.
- R2 Times are local wall-clock; conversion uses an injected `TzOffset(utcMs) -> minutes`. 09:00 stays 09:00 across DST. Gap times shift forward once; ambiguous times use first occurrence. Exactly one occurrence per scheduled local day.
- R3 Monthly clamps to month length from the anchor day every time (Jan 31 -> Feb 28/29 -> Mar 31 -> Apr 30), no drift.
- R4 `nextOccurrence`, `listUpcoming` (<=100), lazy `occurrences` generator; strictly increasing; terminates (year cap 2200).
- R5 `evaluateRecurrence(now, lastHandled)`: unhandled past occurrences older than maxAge (default 7d) are skipped. Policy `latest-only` (default) prompts for the newest only; `catch-up` for up to maxCatchUp (default 5, max 20). Others reported as skipped (count + last 100).
- R6 Never auto-sends: every due item has `needsUserConfirm: true`.

## Acceptance tests (recurrence.test.ts)
Jan 31 monthly -> 2026-02-28, 03-31, 04-30; 2028-02-29 leap; NY 2026 daily 09:00 -> 14:00Z before 03-08, 13:00Z from 03-08; 02:30 on 2026-03-08 -> 07:30Z; 01:30 on 2026-11-01 -> 05:30Z once; Mon/Wed weekly starting Thursday; skipped counts (9 of 10 days with latest-only); max-age skip; lastHandled respected.
