# Cloud Pages beta qualification of main fd5e5911 — 2026-11-27

Source: main `fd5e591151765b2dafe6345501ca40393e0f176a` (#758). Read-only cloud clone, 2 CPU cores, Node v22.23.5,
Chrome at `/usr/bin/google-chrome`, Foundry v1.8.5 (release tarball SHA-256 matched
`infra/integration/Dockerfile.runner`), solc 0.8.28 installed by `forge build`. No push, no integration lock, no
public-testnet or deployed-system traffic. This is local qualification evidence, not a deployment, audit or
real-wallet result.

## Results

| Step | Command | Result |
| --- | --- | --- |
| Install, libraries | `npm ci --ignore-scripts && npm run build:libs` | rc=0 |
| Web typecheck | `npm run typecheck -w @ghostpay/web` | rc=0 |
| Web lint | `npm run lint -w @ghostpay/web` | rc=0 |
| Locale catalogs | `node scripts/i18n/check.mjs` | rc=0 |
| Build profile guard | `node --test apps/web/scripts/localBuildProfile.test.mjs` | rc=0 |
| Web unit tests (coverage + nocov) | `npm test` in `apps/web` | rc=0: 356 files passed, 2 skipped; 4742 tests passed, 49 skipped (anvil-gated, run below) |
| Anvil-backed web tests | `ANVIL_BIN=… SOLC_BIN=… REQUIRE_ANVIL=1 npx vitest run --coverage=false` on the 7 `*.anvil.test.ts` files | rc=0: 7 files, 54 tests passed, none skipped |
| Pages build and site verification | `bash scripts/pages/build-pages.sh <out>` | rc=0: 17 site files; 382 rendered modules and 17 files contain no F01, F02, F04, F08, F09, F11, F12, F13, F14, P07 or FUTURE module; DEMO (no deployment manifest) |
| Script tests | `node --test scripts/pages/*.test.mjs scripts/tests/*.test.mjs scripts/agent/*.test.mjs` | rc=0 |
| Lean e2e, desktop | `GHOSTPAY_LOCAL_BUILD_PROFILE=lean npx playwright test --project=desktop` | rc=0: 162 passed, 6 skipped |
| Lean e2e, devices | same, `--project=pixel-7-chromium --project=iphone-se-chromium --project=ipad-mini-chromium` | rc=0: 30 passed |

The six desktop skips are profile-gated by design: three Bitcoin specs (deferred chain), the stopped GhostID offline
reviewer, the full-profile backup panel case (its lean exclusion case ran) and the full-profile tag-archive retry.

## Source review of the day's merges (3dba277e..fd5e5911)

Two independent read-only reviews covered the non-test source changes in Pay, Settings, AppShell, Sweep, the relayer
client, the v2 embed, deep links, scan-source, scan client and privacy adapter, registry, portable vault formats and
tx-review. Neither confirmed a defect. The candidate items checked by hand and rejected:

- Sweep destination equality is case-consistent: `parseStrictAddress`, the deployment manifest (`addr()` →
  `getAddress`) and stealth derivation (`stealth.ts` → `getAddress`) all return checksummed addresses.
- `parseDeepLink` route order before `#gpi=` has no caller in the web app; callers pass their own route policy.
- A `0x` reply to the permit `nonces` call throws a non-user-facing error, but fails closed before any signature.

## Documentation corrections in this branch

- `PAGES_INTERRUPTED_PAYMENT_VERIFICATION.md` said the attempt journal was same-tab. It is the durable `localStorage`
  journal behind one Web Lock (`duplicateAttemptJournal.ts`): it survives a reload, other tabs and a browser restart,
  and is lost with a closed private window, cleared site data or another browser or device.
- `PRIVACY_THREAT_MODEL.md` summarised wallet-attempt entries as tab-scoped, contradicting its own storage table. The
  summary now says they are durable and lists what they hold.

## Not covered

A public-testnet payment, real wallet extensions, physical devices and Safari/Firefox engines. Earlier open items A1
(post-reorg done-screen wording) and F1 (refused-retry warning wording) need owner wording decisions and were not
re-qualified here.
