# Spec: notify-local: Local notifications (no third parties)
Impact 3/5 | Effort M | Score 1.5 | Build wave 1 | Depends on: local-store

## Problem
Sellers must keep the Scan tab open and press Start to learn of payments; no alert when a payment lands or an invoice is about to expire.

## Exists today (verified in repo) vs missing
- apps/web/src/views/Scan.tsx:45-96 manual scan with checkpoint resume.
- apps/web/src/lib/jitter.ts jitter helpers.
- apps/web/src/App.tsx live region announce().
- Missing: everything described under Design.

## Design
While the app is open: opt-in "watch mode" runs incremental scans on a jittered interval (reuse jitter.ts), raising in-app toasts, a title badge, and optional Notification API alerts (local, no push service). Optional self-hosted webhook: POST {event, count} to a user-entered https URL, with NO amounts, addresses or invoice data, to a host the user controls. Web Push and background sync are excluded (push service and vendor see metadata; SW cannot safely hold the viewing key).

## Privacy and security impact
Watch mode increases RPC query frequency: show cost note and keep jitter. Webhook reveals IP/timing to the user's host; payload minimal and fixed-schema. Notification text shows counts only ("1 new payment") by default so lock-screens do not leak amounts.

## Build ownership
- NEW package: `packages/notify-local` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/notify-local`.
- Public API (exports from `src/index.ts`):
- `nextDelayMs(base: number, jitter: number, rng): number`
- `diffMatches(prev, next): NewMatch[]`
- `buildNotification(events, opts: {showAmounts: boolean}): {title; body}`
- `webhookPayload(events): {event: "payments"; count: number; ts: number}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Scan.tsx (Watch toggle)
- apps/web/src/views/Settings.tsx (webhook URL with https validation)
- apps/web/src/App.tsx (toast region)
- Add `@ghostpay/notify-local` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **NOTIF-1** MUST Watch mode is off by default and stops on lock/wipe of keys.
2. **NOTIF-2** MUST Webhook payload is exactly {event,count,ts}; test rejects any extra field.
3. **NOTIF-3** MUST Webhook URL validated https, no credentials/fragment (like relayer URL).
4. **NOTIF-4** MUST Interval never below 30 s; always jittered.
5. **NOTIF-5** MUST Notification body hides amounts unless user opts in.
6. **NOTIF-6** SHOULD Pause watching when document hidden > N minutes (battery).

## Acceptance tests
1. **T-1** nextDelayMs stays within [base-j, base+j] and >=30000 for 1000 samples.
2. **T-2** diffMatches returns only unseen announcement ids.
3. **T-3** webhookPayload has exactly 3 keys.
4. **T-4** Keys wiped -> watch timer cleared (fake timers).
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
