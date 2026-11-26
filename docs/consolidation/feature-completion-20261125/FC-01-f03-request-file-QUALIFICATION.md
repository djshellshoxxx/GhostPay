# FC-01: F03 signed invoice request file, independent qualification

Companion to the owner's handoff `FC-01-f03-request-file.md` (worker `fc01`). This file records an independent
worker's local execution evidence and review for the same branch. It does not replace the owner's file.

Status: **qualified locally on FC-01 head `5543c2a3`. Hosted CI is pending. Not merged by this worker**: the owner
was still pushing, so integration stays with `fc01`.
This is the request-file milestone only. It is not all of F03, nor any other privacy feature, a deployment, or an
independent professional audit. GhostPay remains experimental, testnet-only and unaudited (README "Status").

## Source identity

| Item | SHA |
|---|---|
| Base main | `f18e8c0c949459f6ecbe8d2c6d71ea208a6d160f` |
| Donor (PR #310, `future/f03-private-payment-links`) | `dad6bc746be13f8a70fcbb4d612a6fe1c01c86ec` |
| FC-01 donor merge (`--no-ff`, parents main and donor) | `225383a9ad621acd0654e2e22f6fe756c4fff307` |
| FC-01 owner follow-up (`fc01`) | `fd5ba475900147d3f3eb0354e9114928e29e862d` |
| Main after PR #640 | `5dc05bd6b73effef3d6fd3443a2e2fdde1103d3a` |
| FC-01 merge of that main (`fc01`) | `ace2f873be287e8ea8711ca146f405f6d7f2779f` |
| FC-01 test and docs update (`fc01`); qualified source | `5543c2a3670ceffc43fd7751edeab74feac4f3e4` |
| Local full artifact at `5543c2a3` (dist inventory SHA-256, 20 files) | `8b40fae0fd97cd87cf6f647a9e0940a4114149b124ca48af7a25ec3190d1757c` |
| Local lean artifact at `5543c2a3` (dist inventory SHA-256, 18 files, `ghostpay-lean-build.json` profile `lean`) | `6b12bcfcb725f40a8d62b85d4f72052a3537090617bc54784cdedbe7e24d7450` |

The inventory digest is SHA-256 over sorted `path sha256` lines of `apps/web/dist` immediately after the
Playwright run that served it (`reuseExistingServer: false`, so each run built its own artifact).

Ancestry: `dad6bc74`, `f18e8c0c` and `5dc05bd6` are all ancestors of `5543c2a3`. The #310 history is intact and no donor branch
was edited.

## Integration review of the combined source

- `Pay.tsx`, `CreateInvoice.tsx` and `securityKeys.ts`: the `-U0` change from main to `225383a` is identical to the
  donor's own change from its base `aa3df1cb`. The auto-merge therefore kept every main line, including the #500
  journal block (`paymentAttemptRecorded`, `assertNoPaymentAttempt` and its pre-send calls).
- The new F03 files (`requestFile.ts`, `PaymentRequestDownload.tsx`, `PaymentRequestFileInput.tsx`) are untouched
  by main since the common base.
- Locale catalogs at `225383a`: each of ar/en/es/ja has 2407 messages. Main changes lost: 0. Donor changes lost: 0.
  Invented keys: 0. F03 `requestFile.*` keys: 15.
- `fd5ba475` retires `pay.scan.summary`, `pay.scan.clear` and `requestFile.summarySuffix` and adds
  `requestFile.summary`. No source, test or e2e use of the retired keys remains, except the test asserting that
  they are absent. `node scripts/i18n/check.mjs`: 0 errors.

## Acceptance matrix

| Requirement | Evidence (test) | Result |
|---|---|---|
| A. Exact fragment byte-for-byte; wrapper has only format/version/fragment; export never decrypts or re-signs | `invoice-schema` `requestFile.test.ts` (13), `requestFile.interop.test.ts` (4); web `PaymentRequestDownload.test.tsx`; e2e plain and bearer cases compare `parsePaymentRequestFile(download)` to the link hash | pass |
| A. Strict JSON/UTF-8, 24 KiB file cap, 16 KiB decoded cap, declared/actual bytes, fixed diagnostics, MIME/extension as hints | `requestFile.test.ts` limit/escape/error cases; `PaymentRequestFileInput.test.tsx` declared overflow, actual bytes, truncated/malformed UTF-8, no exception details; e2e uploads as `synthetic-request.bin`, `application/octet-stream` | pass |
| B. Selection only stages a preview: no wallet discovery or RPC, no navigation, storage or tx | e2e plain/bearer: URL unchanged, storage snapshot unchanged, zero requests, zero wallet methods before Open; `Pay.requestFile.test.tsx` journal empty (`localStorage`, `sessionStorage`, `readAttempts()`) | pass |
| B. Explicit open uses the canonical opener; signature, trusted signer and payment stay distinct | `Pay.requestFile.test.tsx` "opens only after explicit review"; interop "does not turn a valid embedded signature into a trusted seller"; e2e "corrupted signed amount remains untrusted and cannot enable payment" | pass |
| C. Passphrase, expiry, chain/token, manifest and supported-invoice checks | e2e passphrase case; `Pay.requestFile.test.tsx` passphrase and lean-gate cases; `Pay.invoiceQr.test.tsx` expired, forged and corrupted cases on the shared path | pass |
| C. #500 duplicate-send protection cannot be bypassed through a file | NEW `e2e/payment-request-file-attempt.spec.ts`. A held link payment in tab A, then the same invoice opened from its request file in tab B, is refused with "previous wallet attempt" and zero wallet sends. Mutation check: still green with only the Pay pre-send gate removed (the `beginAttempt` journal layer still refuses); red with both layers removed; sources restored | pass, full and lean |
| D. Invalidation: replacement, invalid replacement, clear, close/reopen, hidden page, unmount, app lock, session, signer policy, build profile | `PaymentRequestFileInput.test.tsx` (14); `Pay.requestFile.test.tsx` clear/close/hidden/session, lock with seller session absent/retained, signer-policy change, lean gate; e2e invalid replacement and retry | pass |
| D. A late file or QR result cannot replace a newer selection; same-file retry; A/B/A | "keeps the latest selected request", "cannot let an older file read replace a newer QR preview", "choosing a file supersedes an older QR parser result"; e2e successive request files | pass |
| E. Generic filename, input-free diagnostics, file/link/QR agreement | `PAYMENT_REQUEST_FILE_NAME` assertions; `requestFileInterop.test.ts` (independent QR image decoder: plain, bearer, passphrase) | pass |
| E. Disclosure wording | `docs/user/payment-request-files.md` says the file grants the same access as the link and adds no encryption, identity assurance, payment proof or single-use guarantee | pass (reviewed) |
| F. Accessible controls; link, QR and paste flows in full and lean | `PaymentRequestDownload` `aria-describedby` test; e2e `app.spec`, `flows.spec`, `qr-invoice-image`, `qr-camera-multipart` on both profiles | pass |

## Commands and results (this worker)

All commands ran in a fresh container with Node 22.23.5 and Playwright 1.64.1, using the pre-installed Chromium.

| Command | Source | Exit / result |
|---|---|---|
| `npm ci --ignore-scripts` | 225383a | 0 |
| `npm run build:libs` | 225383a | 0 |
| `npx vitest run --coverage=false` (apps/web) | 225383a | 0; 247 files, 3319 passed, 13 skipped |
| `npm test` (apps/web, CI script, coverage + nocov) | 225383a | 0; 3319 passed / 13 skipped; nocov 3 passed |
| request-file e2e, full / lean (desktop) | 225383a | 0 / 0; 6/6 each (full rerun with two QR specs: 8/8) |
| `bash scripts/scan-secrets.sh`, `bash scripts/check-actions-pinned.sh`, `git diff --check origin/main...HEAD` | 225383a and fd5ba475 | 0 |
| `node scripts/i18n/check.mjs` | fd5ba475 | 0; 0 errors, 586 warnings (pre-existing untranslated notices) |
| `node scripts/agent/package-map.mjs --check` | fd5ba475 | 0 |
| e2e `payment-request-file`, `qr-invoice-image`, `qr-camera-multipart`, `app`, `flows`, full | fd5ba475 | 0; 30 passed |
| same, lean | fd5ba475 | 0; 29 passed |
| e2e `payment-request-file-attempt` (new), full / lean | fd5ba475 + this test | 0 / 0; 1/1 each |
| `node scripts/agent/affected.mjs --base origin/main --run --checks typecheck,lint,test` (17 workspaces) | fd5ba475 | 0. Web result discounted (below); others, e.g. invoice-schema 829/829, relayer 470 passed / 5 skipped, qr-exchange 270, cli 570 |
| `npm run build:libs` | ace2f873 | 0 |
| apps/web `npm run typecheck` / `npm run lint` (with the new spec) / `npm test` | ace2f873 | 0 / 0 / 0; 3324 passed, 13 skipped, coverage thresholds enforced; nocov 3 passed |
| `npx vitest run src/views/Pay.requestFile.test.tsx` | 5543c2a3 | 0; 21 passed |
| e2e `payment-request-file`, `payment-request-file-attempt`, `qr-invoice-image`, `qr-camera-multipart`, `app`, `flows`, full | 5543c2a3 | 0; 31 passed |
| same, lean | 5543c2a3 | 0; 30 passed |

`5543c2a3` differs from `ace2f873` only in a test file and docs; app source is identical
(`git diff --quiet ace2f873 5543c2a3 -- apps/web/src ':(exclude)apps/web/src/**/*.test.tsx' packages`). #640 changed
no `packages/`, so non-web affected results at `fd5ba475` carry over to the same package sources.

Discounted run: the web tests inside the `fd5ba475` affected run overlapped this worker's two temporary mutation
checks (described below), so that web result is not counted. The clean web rerun is at `ace2f873` above.

Engines: Chromium only. `playwright.config.ts` defines a Chromium desktop project and three Chromium device
emulation projects (Pixel 7, iPhone SE, iPad Mini). Firefox and WebKit are neither configured nor installed, so
they were **not exercised**. Emulation is not physical-device testing.

Superseded attempt: an affected run started on `225383a` was stopped when `fd5ba475` arrived. Its typecheck and lint
finished with no errors, but the run is not counted.

## Hosted CI

- `225383a`, CI run `45557873026`, attempt 1: every job succeeded except `ts-test (web)`. 3331 tests passed, then
  Vitest failed on one unhandled rejection: `ReferenceError: window is not defined` at `WalletAttempts.tsx:104`
  from `WalletAttempts.status.test.tsx`, a post-teardown state update. Main `f18e8c0c` hit the identical failure on
  CI run `45550136003` attempt 1 (job `138990017254`) and passed on rerun, so this is a pre-existing #500-lane flake.
  The rerun requested here was cancelled when `fd5ba475` was pushed. `fd5ba475` adds `afterEach(cleanup)` to that
  test.
- Hosted e2e on `225383a` (merge ref `efb46689`): full 129 passed, 2 skipped; lean 117 passed, 4 skipped. All six
  request-file scenarios are listed as passed in both logs. The skips are other features' profile gates.
- `5543c2a3`: pending when this file was written. Check the PR checks for the exact head before integration.

## Independent review

1. A read-only review of the `225383a` F03 source found no critical or important issues. Its two nits were
   confirmed correct as written. That reviewer had no git access, so this worker did the Pay.tsx, securityKeys and
   catalog checks against both parents mechanically (above).
2. A read-only review of `fd5ba475` (with git) found the following. They still apply at `5543c2a3`, whose app
   source matches `ace2f873` and `fd5ba475` plus main's #640 (`CameraImporter.tsx` still has no `subscribeAppLock`):
   - **Important, for the owner to decide:** an idle app lock no longer stops a running camera scan. At `225383a`
     the file input's lock listener called `beginInvoiceFile`, which remounted `CameraImporter` and stopped its
     stream. `fd5ba475` maps `'invalidate'` to `invalidateInvoiceQr()` only, and `CameraImporter` has no app-lock
     subscription. A camera left open stays live through an idle lock that keeps the session, and a later frame can
     stage a new preview, though opening it still needs an explicit click. Main `f18e8c0c` behaved the same way
     (no camera stop on lock), so this is not a regression against main. It does remove a protection that F03
     briefly provided. Not edited here: `CameraImporter` and the D1 choice belong to the owner.
   - **Nit:** `requestFile.summary` is English in ar, es and ja, where the retired `pay.scan.summary` was translated.
   - Races, single alert, retired keys, assertion strength and privacy: pass.

## Broader F03 work outside this milestone

Reusable request policies, wallet-URI conversion, provider abstractions, F18 privacy modes, P13 confidential
settlement, and other F03 "private payment links" capabilities on `future/f03-private-payment-links` beyond the
request file are not integrated or qualified by this work.
