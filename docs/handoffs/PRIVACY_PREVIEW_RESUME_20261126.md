# Privacy preview retention on page return — 2026-11-26

## Scope and source

- Branch: `finish/privacy-preview-resume-20261126-9d8f`.
- Base: `601f20955b435eede448c6d82d8315705d7e381d`, re-fetched before publication.
- Continues the presentation-only implementation of #287 item 4, previously
  integrated through #676/#681 (`61a5f00c` supplies the retained implementation).
- The original owner records the presentation slice as merged. Current open
  #696/#717/#718/#719/#722 do not change the two runtime paths owned here.
  Their original branches and ongoing work remain untouched.

## Completed behavior

The existing preview hook checked age on a one-second interval, focus and
preference/storage events. A page whose timer was suspended did not check on
`pageshow`, document `visibilitychange` or document `resume`. The control could
also retain a stale saved preference after a missed storage event.

Both runtime paths now handle those events through their existing expiry or
preference-refresh callbacks. Returning does not reset the original preview
timestamp. Each expiry check reads current saved consent for the correct
category; off, invalid, unreadable and revoked policies authorize no automatic
cleanup. Changed consent withdraws an obsolete manual confirmation. All added
listeners are removed on unmount.

Only disposable screen presentation closes. Invoice form inputs, source
receipts, transaction hashes, copy/download actions, vaults, journals, backups
and saved records retain their existing protections. Unconfirmed, reverted and
unknown proof presentations remain unenrolled. Persistent vault timestamp
cleanup and its format migration remain deferred under spec 19.

## Verification evidence

All unit cases use synthetic local fixtures. No live wallet, transaction or
external provider was used.

| Check | Actual result |
|---|---|
| New proof deadline cases before hook repair | 3 failed (`pageshow`, `visibilitychange`, `resume`), 1 passed (`focus`); wall time moved without timer callbacks |
| Expanded controls cases before controls repair | 21 failed, 20 passed; missing lifecycle refresh/listeners |
| `npx vitest run src/components/PaymentProofQr.retention.test.tsx src/views/CreateInvoice.retention.test.tsx --coverage=false` in `apps/web` | 36 passed, 2 files |
| `npx vitest run src/components/MetadataRetentionControls.test.tsx src/lib/metadataRetention.test.ts --coverage=false` in `apps/web` | 54 passed, 2 files |
| `npm ci --ignore-scripts --no-audit --no-fund` and `npm run build:libs` | Exit 0; no dependency or lockfile change |
| `npm run typecheck -w @ghostpay/web` | Exit 0 |
| Typed ESLint on the five changed runtime/unit-test paths and the new browser spec | Exit 0 |
| Full-profile build and postbuild inside Playwright setup | Completed; browser launch subsequently refused by the execution environment |
| `GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build -w @ghostpay/web` | Exit 0; postbuild scan passed for 18 files |
| Playwright collection of `e2e/retention-resume.spec.ts` | 5 cases collected |
| `git diff --check` and `bash scripts/scan-secrets.sh` | Exit 0 |

The 90 focused unit/component cases cover the exact deadline, returning before
expiry, default-off behavior, missed consent revocation, independent categories,
unreadable storage, stale confirmation, source/export preservation, repeated
events, deliberate redisplay and unmount cleanup. Existing assertions remain.

Independent read-only review by `/root/privacy_candidate_review` approved the
runtime, unit tests, browser test and specification with no material finding.
This is an AI-assisted source review, not an independent professional audit.

## Browser and integration gates

`apps/web/e2e/retention-resume.spec.ts` adds five built-app cases with paused
timers, synthetic lifecycle events, unchanged storage/form assertions and zero
external-request attempts. The local full-profile Playwright run could not
execute any test body: `/usr/bin/chromium` lacked its underlying executable;
an existing Chrome for Testing 153 executable then failed at startup because
`socket()` was denied by the execution environment. These are not browser passes.
No configuration, assertion, timeout or gate was weakened to work around them.

Fresh hosted CI must qualify the published head, including the full/lean
Playwright jobs which automatically discover the new spec. Even a passing
synthetic-event browser test does not establish actual BFCache restoration,
physical-device sleep, or first-frame paint ordering. No deployment, release,
merge or broader completion of #287 is asserted by this handoff.
