# FC-01: F03 signed invoice request-file interchange onto current main

Worker `fc01`. Branch `claude/fc01-f03-request-file-20261125`. Draft PR #650.

## Provenance

- Donor: PR #310, `origin/future/f03-private-payment-links`, head `dad6bc746be13f8a70fcbb4d612a6fe1c01c86ec`
  (base `aa3df1cb`). Merged with `git merge --no-ff`, so the donor SHAs stay in history.
- Base: `origin/main` `f18e8c0c949459f6ecbe8d2c6d71ea208a6d160f`. It had moved on from the assigned
  `c8e131c1` (it adds #638 POS terminal work); #500's journal is included in both.
- Merge commit: `225383a9`. Review-fix commit: `fd5ba475`.

## Conflict resolution (merge commit)

Union of both sides, no key dropped:
- `apps/web/locales/{ar,en,es,ja}.json`: 2407 keys each, valid JSON, no duplicate keys.
- `apps/web/src/i18n/securityKeys.ts`: F03 keys added beside main's `app.checks.*` groups.
- `docs/ai/ACTIVE_WORK.md`: both entries kept, FC-01 claim added at the top.
- `Pay.tsx` auto-merged and was reviewed by hand.

## Pay.tsx and #500 review

- A selected file is decoded locally and handed to the existing `importInvoiceQr`, which calls `openFragment`
  and stages a preview. Opening goes through the existing `openInvoiceQr`, so signature, signer pin,
  passphrase, expiry and review are unchanged.
- The pre-send duplicate-attempt checks (#500) live in the payment path and are not touched.
  File selection cannot reach wallet discovery, RPC or the journal. A test asserts that the journal key is
  absent from localStorage and `readAttempts()` is empty after selecting and previewing a file.
- `subscribeAppLock` and `captureSessionVersionGuard` signatures match main.

## Changes beyond the merge (`fd5ba475`) after independent review

- D1: the file input now reports `onInputChange('select' | 'invalidate')`. Only 'select' remounts the camera
  importer. Hide, lock and disclosure close no longer wipe the QR importer's pasted text and status.
  Tests: hide and lock keep pasted text (red before the fix).
- N1: a newer QR input clears the file input's "ready" status (`supersededEpoch`). Test (red before).
- N2: a refused file shows one alert. The child shows a polite status and the view shows the alert.
- N4: the bearer warning is tied to the download button with `aria-describedby`.
- D2: journal assertion uses `ATTEMPT_JOURNAL_KEY` on localStorage plus `readAttempts()`.
- D3: one full-sentence key `requestFile.summary` replaces `pay.scan.summary` + `requestFile.summarySuffix`;
  `pay.scan.summary`, `pay.scan.clear` and `requestFile.summarySuffix` are retired from all catalogs and the
  classification. The i18n collision guard now compares `requestFile.summary` with `requestFile.clear` and checks
  that the retired keys are gone. Selectors in unit and e2e specs were updated to the new text (no assertion removed).
  Draft locales show the English sentence for the new key, like the other F03 keys.
- D4: `docs/user/payment-request-files.md` status line now says experimental, testnet-only, not audited.
- CI flake: `ts-test (web)` on the merge commit passed 248 files / 3331 tests but failed on one unhandled
  rejection, `window is not defined`, from `WalletAttempts.tsx:104` after teardown in
  `WalletAttempts.status.test.tsx`. That test never unmounted (no vitest globals, so no automatic cleanup), so a late
  migration rejection set state on a still-mounted component. F03 touches neither file. Fix, test-side: `afterEach(cleanup)`.
  This is a pre-existing #500 race. It is non-deterministic and has no red test.

## Local validation (results)

See the PR description for the final table. Heavy commands ran through the machine-wide mutex.

- `git diff --check origin/main...HEAD`: clean. `bash scripts/scan-secrets.sh`: OK.
- `npm ci --ignore-scripts` and `npm run build:libs`: completed.
- `packages/invoice-schema`: typecheck pass, lint pass. `npm test` under load: 820 passed, 9 failed, all
  scrypt tests (`passphrase`, `independent`, `pinnedSigner`) hitting their 60 s and 180 s timeouts because the
  machine was shared. These are environmental. Hosted CI runs them on a dedicated runner.
- `apps/web` vitest, 6 targeted files first run: 268 passed, 4 failed (passphrase flow timed out at 28.8 s;
  three others failed under load). With `--testTimeout=120000` and the review fixes:
  19 files, 277 tests passed (request-file, invoiceQr, i18n, supported, Pay.test and `src/i18n`).
- `apps/web` lint: pass. Typecheck: first run segfaulted (memory pressure, exit 139). After raising the heap, one
  genuine error in my new test (`notifyAppLock()` needs a reason). It was fixed in `fd5ba475`; rerun result is in the PR.

## Known limitations (N3, N5, N7 and others)

- N3, N5 and N7 were noted by the independent review and are not fixed here.
- Full web coverage suite and Playwright were not run locally. Hosted CI is authoritative.
- Request files are bearer documents with the same access as the invoice link. The format adds no encryption.
- Draft locales (es, ja, ar) show the English F03 strings until native review.
- #310 is superseded by this PR only once it merges.
