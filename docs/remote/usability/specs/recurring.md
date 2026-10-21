# Spec: recurring: Recurring invoices (local reminders, manual issue)
Impact 3/5 | Effort M | Score 1.5 | Build wave 2 | Depends on: templates, local-store

## Problem
Subscriptions and rent need monthly re-issue; there is no server to send them.

## Exists today (verified in repo) vs missing
- No schedule code. Server-less constraint (MASTER_BLUEPRINT zero-server) forbids background issuing.
- Missing: everything described under Design.

## Design
Schedule rule {templateId, cadence (weekly|monthly|custom days), anchorDate, timezone-free UTC rule, lastIssued}. On app open the package computes due items; user clicks Issue (one at a time) producing a normal invoice from the template. Missed periods are listed, not auto-created. Link delivery stays manual (share-safe).

## Privacy and security impact
No background execution, no push, no server; therefore no third party learns the schedule. Schedules are encrypted in local-store.

## Build ownership
- NEW package: `packages/recurring-invoices` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/recurring-invoices`.
- Public API (exports from `src/index.ts`):
- `dueItems(rules: Rule[], nowSec: number): Due[]`
- `nextDue(rule, afterSec): number`
- `advance(rule, issuedAtSec): Rule`
- `validateRule(r): RuleProblem[]`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/CreateInvoice.tsx or new Schedule view (Due list)
- Add `@ghostpay/recurring-invoices` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **RECUR-1** MUST Month arithmetic is calendar-correct in UTC (31 Jan + 1 month = 28/29 Feb).
2. **RECUR-2** MUST Never issues without a user action.
3. **RECUR-3** MUST Missed periods collapse into one list entry per period, capped at 12.
4. **RECUR-4** MUST Rule parse is bounds-checked.
5. **RECUR-5** SHOULD Show next 3 due dates.

## Acceptance tests
1. **T-1** Monthly anchor Jan 31: Feb 28, Mar 31 sequence.
2. **T-2** Leap-year Feb 29 handling.
3. **T-3** Due list capped at 12 after 5 years offline.
4. **T-4** advance() is idempotent for the same issuedAt.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
