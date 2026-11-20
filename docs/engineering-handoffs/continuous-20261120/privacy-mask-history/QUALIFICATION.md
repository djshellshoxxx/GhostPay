# Masking/history qualification receipt

**Implementation checkpoint:** `bc0b14aaafcd10dc63029d9940cc95cb14824797` on `feat/ghostpay-privacy-mask-history-20261120`.
**Last production edit:** `87db086ab98e22ba1f6e0cfac399fa0faa223595`; subsequent changes correct owned test typing/scheduling and the clipboard owner's nullable-storage assertion.
**Base:** `417f7c71daf8645e1432f2ec8f070110879b80bd`.

The final selected local checks pass. **The two new browser scenarios have not executed any assertion locally**, and this receipt does not complete issue #286 or qualify a beta release. Root owns the combined account lifecycle, retained-outcome fallback, independent integration and hosted gates.

## Observed results

| Check | Exact observed result | Receipt |
| --- | --- | --- |
| Initial masking/history regressions, source from the unchanged candidate | 3 failed, 0 passed, across 2 files. Missing global control, ignored privacy mode and visible unlocked history. | [BASELINE_RED.log](BASELINE_RED.log), test commit `22c9bcad` |
| Wallet-attempt history baseline | 3 failed; the original explicit-clear control passed. | [WALLET_HISTORY_RED.log](WALLET_HISTORY_RED.log), test commit `d11ee12e` |
| Promoted independent Settings/invoice probes after Settings integration | Settings and existing controls pass; same-route replacement invoice still fails: 3 passed, 1 failed. | [INDEPENDENT_PROBES_RED.log](INDEPENDENT_PROBES_RED.log), test commit `52d4feea` |
| Scope repair plus Settings/clipboard controls | 38 passed across 6 files. | [INDEPENDENT_PROBES_GREEN.log](INDEPENDENT_PROBES_GREEN.log), production `528bb8b1` |
| Actual manual tag-lock boundary | Selected new case fails before repair; all 5 AppShell privacy cases pass after repair. Encrypted tag snapshot and seller identity are unchanged, and the tag can be recovered after unlock. | [TAG_LOCK_RED.log](TAG_LOCK_RED.log), [TAG_LOCK_GREEN.log](TAG_LOCK_GREEN.log), repair `d838a881` |
| Privacy persistence/authority baseline | 2 selected failures: execution-settings bytes change and persistence failure is not reported. | [PRIVACY_STORAGE_RED.log](PRIVACY_STORAGE_RED.log), test commit `115b54de` |
| Final original-config selection | **19 files, 196 passed, 0 failed, 0 skipped.** Includes shell, model, ledger, wallet history, settings storage, clipboard integration and seller lock/recovery/completion controls. | [FINAL_INTEGRATION.log](FINAL_INTEGRATION.log), checkpoint `bc0b14aa` |
| Full web typecheck | Pass at production `87db086a`; the final ordinary build repeats the full typecheck at `bc0b14aa`. | [FINAL_TYPECHECK.log](FINAL_TYPECHECK.log), [FINAL_BUILD.log](FINAL_BUILD.log) |
| Typed ESLint on the 15 owned source/test/browser paths | Pass, with no lint rule or threshold change. | [FINAL_SCOPED_LINT_GREEN.log](FINAL_SCOPED_LINT_GREEN.log) |
| Ordinary web build and postbuild checks | Pass: TypeScript, Vite, CSP application and bundle scan. The scan validates 19 files. The build reports chunk-size, dynamic-import and unconfigured `GHOSTPAY_CONNECT_ORIGINS` warnings; no warning-free or deployment-profile claim is made. | [FINAL_BUILD.log](FINAL_BUILD.log) |
| CSP/bundle/egress tests | **85 passed, 0 failed, 0 skipped.** | [FINAL_SECURITY_CHECKS.log](FINAL_SECURITY_CHECKS.log) |
| Original browser configuration | 2 launch failures; configured Playwright executable absent; 0 scenario assertions executed. | [BROWSER.log](BROWSER.log) |
| Project-supported system Chromium selection | 2 launch failures before assertions: `socket() failed: Operation not permitted (1)` and SIGABRT. No new flags or configuration bypass. Local retries stopped. | [FINAL_BROWSER_SYSTEM_CHROMIUM.log](FINAL_BROWSER_SYSTEM_CHROMIUM.log) |

The selected Vitest command uses the repository's original configuration and timeouts, with one worker. It does not run coverage or represent the complete web test suite. Existing coverage thresholds and the Mythril gate remain unchanged. Earlier intermediate logs, including genuine failures and a nullable-test assertion error, are retained instead of overwritten by a generic “all green” claim.

## Reproduction commands

Runtime: Node `v22.23.4`, npm `10.9.11`. Installed dependencies and compiled prerequisites were supplied by the coordinator's existing workspace; this lane did not change dependencies or perform a clean hosted installation.

```sh
npm exec --workspace @ghostpay/web -- vitest run \
  src/AppShell src/lib/privacyMode.test.tsx src/lib/executionSettings.test.ts \
  src/lib/settings.uiPrivacy.test.ts src/components/ReconciliationLedger \
  src/components/WalletAttempts.test.tsx src/components/Common.clipboardPrivacy.test.tsx \
  src/views/Settings.clipboardPrivacy.test.tsx src/views/SellerKeys.lock.test.tsx \
  src/views/SellerKeys.recovery.test.tsx src/views/SellerKeys.completion.test.tsx \
  --maxWorkers=1
npm run typecheck --workspace @ghostpay/web
npm run build --workspace @ghostpay/web
node --test scripts/tests/privacy-csp.test.mjs \
  scripts/tests/privacy-csp-bundle.test.mjs scripts/tests/network-egress-inventory.test.mjs
npm run test:e2e --workspace @ghostpay/web -- e2e/privacy-mask-history.spec.ts --project=desktop
GHOSTPAY_CHROMIUM=/usr/bin/chromium npm run test:e2e --workspace @ghostpay/web -- \
  e2e/privacy-mask-history.spec.ts --project=desktop
```

The complete lint command and exact source/evidence hashes are recorded in [SOURCE_RECEIPT.json](SOURCE_RECEIPT.json). Local commands selected the coordinator's Node 22 toolchain through `PATH`; no compiler, test, coverage or security configuration was modified.

## Dependency provenance

| Coordinated source | Imported local commit |
| --- | --- |
| Clipboard/settings model `d9fc431d` | `936b222d` |
| Root's common critical labels `14fa752b` | `c58bad5f` |
| Root's neutral wallet-attempt labels `5f847d40` | `e95174cd` |
| Existing PR #293 foundation `6c648770` | Original ancestry retained by merge `c7932f48` |
| Clipboard helper/Common/sync `d84d154b`, typed-test follow-up `0666593f` | `6967b71e`, `8ecb4dcf` |
| Settings boundary/draft preservation and backup clipboard integration `026febb5` | `46d5f5ab` |
| Separate nonsecret UI storage `0069e877` | `d2f7675a` |
| Nullable execution-storage assertion `e6f9cd88` | `e5563ef8` |

No remote branch, main, remote PR or release was modified by this lane. Root's later Pay/Registry/provider and returned-outcome changes are separate inputs. Their behavior must be qualified on the combined candidate rather than inferred from this isolated receipt. Independent reviewer `qa_review_gen3` has the exact production checkpoint and original failure probes; its final receipt is separately owned.
