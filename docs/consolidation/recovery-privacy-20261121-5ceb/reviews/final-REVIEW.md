# Independent remaining-path review — completed scoped handoff

Reviewer: `/root/recovery_remaining_review`. Implementation owner: `/root/recovery_integration`.

**No confirmed blocker remains in this assigned review scope.** Two reproduced integration issues were corrected by the implementation owner and independently retested. This conclusion does not authorize bypassing repository coordination, CI or required approvals.

| Snapshot | Exact commit |
| --- | --- |
| Review comparison base | `50ccf5c8b396247b524e5115ebe51575ca79d318` |
| Initial reviewed and tested candidate | `b85e8160fbc1bc4b69b8652595a8adfd2defd927` |
| Corrected candidate independently reviewed and tested | `89c9b8035afa29fc291944a00a23667c12bd2ecc` |
| Corrected candidate tree | `eaeee1879b43474cccbb13e334224eeb88d468b3` |

## Scope

All **65 assigned runtime, configuration and tooling paths** were reviewed: **27 full-file reads and 38 changed-section reads with relevant context**. None remains uninspected in this assignment. `REVIEW.json` records exact Git blob IDs and per-file notes. After correction, **63 of 65 blobs remained identical**; the two changed runtime paths were re-reviewed.

Additional review covers the vault rekey lock guard/test and hygiene event-evidence/testnet-reuse boundaries, plus narrower network-authorization and AppShell context. Three added correction test files were read completely. Earlier workers' 451 and 216 tests and the residual reviewer's 20 tests are separately attributed and excluded from this reviewer's executions.

The reviewer wrote only this evidence directory. No source, dependency, ref or remote edit was made by this reviewer.

## Findings corrected

### SETTINGS-PARTIAL-DRAFTS

At b85, both original #356 cases (`82ab06f1bb6fc4b9df2b4ac87679a4029987a284`) failed: a preferences-only import erased an unsaved RPC URL; an RPC-only import changed an unsaved `light` theme to saved `system`. The saved-settings effect reset every form section after the import callback deliberately updated only selected sections.

At 89, individual saved values are compared. Only changed saved fields reconcile, preserving unrelated drafts and endpoint retention choices. Pending RPC tests are still canceled and invalidated on every settings update. Explicit selected-section `onApplied` updates remain, including imports equal to previously saved values.

The adopted donor file is **byte-identical** to #356, SHA-256 `4af431b9b592e979cd7074cbd5a851612ca27ef20bcba3af2c07ceb70a6ec24c`. Both original cases pass. Two additional cases verify session-only retention, stale RPC-test cancellation, selected slot isolation and equal-to-saved preferences.

Baseline evidence: `partial-import-baseline-result.json` and `partial-import-baseline.log`. Corrected evidence: `correction-test-result.json` and `corrected-settings-btc-boundaries.log`.

### BTC-OPTIONAL-CONSENT-RESET

At b85, the original #244 unit file (`981cc2f4395d2d76c499a5cd46387daaaa3a6b1f`) confirmed that changing the provider URL left optional per-output lookup permission selected. At 89, `changeSource` clears the optional flag while preserving cancellation, old result/signature invalidation and mandatory-light behavior.

The recovered endpoint-change test body is identical to the donor and passes independently. Existing Bitcoin spentness, oracle and header-ownership tests also pass. This affects the full-profile Bitcoin test interface; lean Pages still excludes Bitcoin. Tests used synthetic fixtures, no Bitcoin node or real transaction.

Baseline evidence: `btc-consent-baseline-result.json` and `btc-consent-baseline.log`. Corrected evidence: `correction-test-result.json`.

## Historical light-mode disposition

A second old #244 assertion expects a separate light-mode consent checkbox. That differs from the current documented UI. The candidate starts with no oracle and light mode off. Selecting light mode displays the explanation that starting it authorizes matching-transaction proof and per-output spent-status requests. The scan action follows that disclosure, consistent with Spec 12 and `docs/user/bitcoin-spent-status.md`.

The client, worker, engine and request bridge independently enforce the selected permissions. The obsolete checkbox assertion is a **compatibility difference**, not evidence of undisclosed light-mode requests. No old checkbox model or weaker spend-authority implementation was imported. The distinct provider-edit reset was recovered.

## Tests executed independently

| Run | Source before/after | Actual result |
| --- | --- | --- |
| Original #356 donor regression, import redirects only | b85e8160 | **2 failed / 2**, confirming defect |
| Original #244 donor unit file, import redirects only | b85e8160 | **2 passed, 2 failed / 4**: missing reset and historical UI difference |
| Web boundary selection, original Vite config | b85e8160 | **12 files / 274 passed**, 0 failed, 0 skipped |
| Policy-scheme boundary selection, original package config | b85e8160 | **4 files / 102 passed**, 0 failed, 0 skipped |
| Pages smoke URL/walk/render-error helpers, Node runner | b85e8160 | **3 files / 22 passed**, 0 failed, 0 skipped |
| Corrected Settings/BTC selection, original Vite config | 89c9b803 | **15 files / 109 passed**, 0 failed, 0 skipped |

Clean runs contain **507 successful test executions** (398 initial plus 109 corrected), not necessarily distinct tests. Donor diagnostic results include every failure and are separate. A driver's successful exit is never substituted for its test process result. Vitest selections used one worker, no file parallelism, no cache, no coverage.

The corrected selection contains all seven Settings component files, BTC spentness/oracle/header-ownership/endpoint tests, and settings UI-privacy/privacy/execution/exchange library tests. The initial selection covers bundle/CSP, frame/manifest trust, signer pins, policy calldata/currentness, BTC worker/spend/transport boundaries and Pages origin/walk/error helpers.

Exact argument arrays, cwd, environment, UTC starts, duration, heads and log hashes are in `boundary-test-results.json` and `correction-test-result.json`. HEAD was unchanged before/after every run. Corrected Vitest duration: **44.53 seconds** (44.923 driver wall time), exit 0. Corrected log SHA-256: `db12161d3be6c867c111070faac36a23acbc0e9113e3892c57628570b50108e9`.

## Primary reviewed paths

| Path | Review depth |
| --- | --- |
| `apps/web/scripts/apply-csp.mjs` | Full file |
| `apps/web/scripts/csp.mjs` | Full file |
| `apps/web/scripts/scan-bundle.mjs` | Changed sections and relevant context |
| `apps/web/scripts/test-reconciliation-idb.mjs` | Changed sections and relevant context |
| `apps/web/scripts/test-seller-vault-idb.mjs` | Changed sections and relevant context |
| `apps/web/scripts/validate-deployments.mjs` | Changed sections and relevant context |
| `apps/web/src/components/Disclosure.tsx` | Full file |
| `apps/web/src/components/InvoiceSignerVerification.tsx` | Full file |
| `apps/web/src/components/MerchantProfilePanel.tsx` | Changed sections and relevant context |
| `apps/web/src/components/MerchantTemplateIssuer.tsx` | Changed sections and relevant context |
| `apps/web/src/components/WalletAttempts.tsx` | Full file |
| `apps/web/src/features/btc/BtcView.tsx` | Changed sections and relevant context |
| `apps/web/src/features/btc/esplora.ts` | Changed sections and relevant context |
| `apps/web/src/features/btc/headers.ts` | Changed sections and relevant context |
| `apps/web/src/features/btc/oracleSource.ts` | Changed sections and relevant context |
| `apps/web/src/features/btc/scan.ts` | Full file |
| `apps/web/src/features/btc/scanWorkerClient.ts` | Full file |
| `apps/web/src/features/btc/scanWorkerMessages.ts` | Full file |
| `apps/web/src/features/btc/scanWorkerProtocol.ts` | Full file |
| `apps/web/src/features/btc/scanWorkerSource.ts` | Full file |
| `apps/web/src/features/btc/verification.ts` | Changed sections and relevant context |
| `apps/web/src/features/policy/PolicyCreate.tsx` | Changed sections and relevant context |
| `apps/web/src/features/policy/PolicyPay.tsx` | Changed sections and relevant context |
| `apps/web/src/features/policy/PolicyReceive.tsx` | Changed sections and relevant context |
| `apps/web/src/features/policy/PolicyView.tsx` | Full file |
| `apps/web/src/features/policy/chain.ts` | Changed sections and relevant context |
| `apps/web/src/features/policy/pay.ts` | Full file |
| `apps/web/src/features/policy/scan2.ts` | Full file |
| `apps/web/src/features/policy/send.ts` | Changed sections and relevant context |
| `apps/web/src/features/registry/RegistryView.tsx` | Changed sections and relevant context |
| `apps/web/src/lib/errors.ts` | Changed sections and relevant context |
| `apps/web/src/lib/frameGuard.ts` | Full file |
| `apps/web/src/lib/invoiceSignerPins.ts` | Full file |
| `apps/web/src/lib/invoiceVerification.ts` | Full file |
| `apps/web/src/lib/manifest.ts` | Full file |
| `apps/web/src/lib/stealthExport.ts` | Full file |
| `apps/web/src/main.tsx` | Full file |
| `apps/web/src/styles/walletDisclosure.css` | Full file |
| `apps/web/src/views/Home.tsx` | Changed sections and relevant context |
| `apps/web/src/views/Settings.tsx` | Changed sections and relevant context |
| `apps/web/src/views/Sweep.tsx` | Full file |
| `deploy/nginx/render-security-headers.mjs` | Full file |
| `packages/btc-silent-payments/src/scan/headersync.ts` | Changed sections and relevant context |
| `packages/btc-silent-payments/src/scan/scanner.ts` | Changed sections and relevant context |
| `packages/btc-silent-payments/src/scan/state.ts` | Full file |
| `packages/i18n/src/format.ts` | Changed sections and relevant context |
| `packages/invoice-schema/src/errors.ts` | Changed sections and relevant context |
| `packages/policy-scheme/src/derive.ts` | Changed sections and relevant context |
| `packages/policy-scheme/src/eip712.ts` | Changed sections and relevant context |
| `packages/policy-scheme/src/limits.ts` | Changed sections and relevant context |
| `packages/policy-scheme/src/router.ts` | Changed sections and relevant context |
| `packages/pool-circuits/scripts/install-circom.sh` | Changed sections and relevant context |
| `packages/scan-source/src/index.ts` | Changed sections and relevant context |
| `packages/ux-core/src/errors.ts` | Changed sections and relevant context |
| `packages/ux-vault/src/keystore-portable.ts` | Changed sections and relevant context |
| `packages/ux-vault/src/portable-errors.ts` | Changed sections and relevant context |
| `packages/ux-vault/src/portable.ts` | Changed sections and relevant context |
| `scripts/devnet/e2e.mjs` | Changed sections and relevant context |
| `scripts/integration/run-in-runner.sh` | Changed sections and relevant context |
| `scripts/pages/lean-exclusions.mjs` | Full file |
| `scripts/pages/smoke-url.mjs` | Full file |
| `scripts/pages/smoke-walk.mjs` | Full file |
| `scripts/pages/smoke.mjs` | Changed sections and relevant context |
| `scripts/pages/verify-pages-site.mjs` | Changed sections and relevant context |
| `test-vectors/generate-stealth-export.mjs` | Full file |

## Remaining work and limits

There is no remaining confirmed issue or unreviewed assigned path in this handoff. `RUNTIME_REMAINING.json` records the empty assigned list. Changed-section review does not establish that every unchanged line received a complete independent audit.

The root/implementation owner must complete separately tracked gates: current required CI, applicable full coverage, native browsers, Pages build/artifact integrity, dependency/secret scans, required approvals and integration-lock resolution. This reviewer did not execute native Chromium/Firefox/WebKit, Tor, live endpoints, contract integration, a complete full-application suite or deployment. Queued, skipped or unexecuted gates are not passes.

No deployment, release, formal external security certification, branch merge or real-funds transaction occurred in this review. These files are scoped evidence for the existing authoritative ledger and do not replace it.
