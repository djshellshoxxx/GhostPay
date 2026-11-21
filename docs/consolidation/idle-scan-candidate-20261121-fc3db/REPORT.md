# Isolated idle, scan and current-main candidate

This candidate combines the existing idle/backup/receipt recovery stack with #307, current main and the scan-helper correction. It also adds four tests for the existing final wallet-account check. It is an isolated qualification candidate; combined hosted acceptance and promotion remain separate work.

## Exact source

| Identity | Value |
| --- | --- |
| Public source checkpoint | `418054d5ca041973d31d514406ee4c6157ca919f` |
| Independently reviewed local checkpoint | `8f75770d5b3a935eddfddfb215f86bceb9e874e8` |
| Identical complete source tree | `130f42e633929e5d2c630ac9741f62d7fe9764e4` |
| Owned candidate branch | `integration/ghostpay-idle-scan-candidate-20261121-fc3db` |

The public and local commits have different publication metadata/parent identities but identical complete trees. [PUBLICATION.json](PUBLICATION.json) records the publication sequence; [COMPOSITION.json](COMPOSITION.json) records the source comparison and independent review.

All four original sources remain ancestors of the public checkpoint:

| Source | Pinned commit |
| --- | --- |
| Integration #307 | `5a745d4b5fba69b66a9779f88aefc63c253a4f27` |
| Idle/backup/receipt/request-file stack #344 | `a88157b53d1e0925350d5c8db047eabb4365f4e9` |
| Scan helper #350 | `89b3572f7e60cb6f5e5a0d7830632d1bb5f04dd8` |
| Main, retained through #350 | `aec179910c39081d820396409ff3139ff2264132` |

## What this composition retains

**Idle and recovery work:** #344 retains the idle source and the #333 backup-preflight, #335 receipt-identity and request-file synchronization successors. The idle work had reached #325's source branch only after #325's earlier merge into #307. This candidate carries that existing work forward, including the newer SellerKeys ownership checks, without restoring older donor files. The original evidence and source histories remain available.

**Current-main corrections:** preserve all six TRON/fee source and test files:

- `apps/web/src/features/tron/chain.hardening.test.ts`
- `apps/web/src/features/tron/fixtures.testutil.ts`
- `packages/tron-adapter/src/rpc.ts`
- `packages/tron-adapter/src/scan.test.ts`
- `packages/metadata-hardening/src/btc.ts`
- `packages/metadata-hardening/src/btc.fee-policy.test.ts`

**Scan warning correction:** #350 preserves warnings for distinct router announcements sharing an address while preventing repeated callbacks for one announcement from being counted twice.

**Additional wallet coverage:** the new `wallet.finalAccount.test.ts` uses the actual wallet APIs and existing MockWallet. Two negative cases keep the first account read valid, then silently change the final account answer after the network checks. They require rejection before transaction/signature submission and, for sends, before any attempt-journal access or mutation. Two positive controls verify normal submission/journal recording and signing. No provider event, session mutation or application-revocation callback causes the negative result. These tests cover an existing guard; no new runtime defect or correction is asserted.

Independent object comparison verified **4,202 pre-existing nonregistry entries** against the exact donor union, with zero unexpected blob, mode or type changes. The final source has 4,205 entries. Only the new wallet test, its handoff and additive ownership differ from the reviewed composition. Every parent registry's exact lines remain in order; no conflict markers remain. Existing runtime, tests, dependency/configuration files, workflows, assertions and thresholds retain their reviewed source identities.

## Execution on the combined source

Results below belong to local `8f75770d…` / tree `130f42e6…`, whose public source tree is identical. Commands, environments, exit codes and log hashes are retained in [EXECUTION.json](EXECUTION.json); complete output is retained in [EXECUTION_LOGS.json.gz](EXECUTION_LOGS.json.gz). Donor CI results are separate historical evidence.

| Gate | Recorded state |
| --- | --- |
| New wallet-account file | **Passed: 4/4**, one file, no skips |
| Whole-web typed lint | **Passed**, original workspace command |
| Default full web build | **Passed**, complete TypeScript check, Vite build and bundle scan; 19 scanned files |
| Correctly configured lean build | **Passed**, complete TypeScript check, Vite build and bundle scan; 17 scanned files |
| Original full-web coverage | **Passed: 3,181 tests**, 13 unchanged skips; 215 files passed, two skipped; original coverage thresholds satisfied |
| Separate no-coverage gate | **Failed: two passed, one failed**; existing cryptographic cost comparison assertion |
| Metadata-hardening coverage | **Passed: 118/118** in 11 files, no skips; original coverage thresholds satisfied |
| TRON-adapter coverage | **Passed: 107/107** in 10 files, no skips; original coverage thresholds satisfied |
| Native full browser suite | **Blocked at Chromium startup**; one launch failure, 115 tests not run; no page-assertion pass |
| Hosted combined-source qualification | **Pending** |

The initial dependency-closure build failed because the selected local installation omitted the existing `relayer-guard` test fixture. Installing that workspace from the unchanged lockfile and building it corrected the local dependency setup; the original web builds then passed. No product or dependency-version change was needed.

An earlier command used `GHOSTPAY_PROFILE=lean`, which the build does not consume. That successful build used the default **full** profile and is recorded as full. A separate rerun set the actual `GHOSTPAY_LOCAL_BUILD_PROFILE=lean` input and passed. The initial closure attempt stopped before bundle generation and remains recorded as unsuccessful. The 17-file lean manifest was captured immediately after that build; the later Playwright web server rebuilt the full profile, so the current output directory is not the retained lean artifact.

The web coverage totals were 93.33% statements, 89.73% branches, 94.97% functions and 97.06% lines, above the unchanged 90/85/90/90 thresholds. The no-coverage failure was `scannerCore.bench.nocov.test.ts`: its ECDH estimate was 2,124.061 microseconds per operation, below the derived address-cost estimate of 2,545.853, failing the original `ecdh > derivation` assertion. The measured result is retained; no threshold, assertion, timeout or runtime was changed to obtain a pass. Independent review found the benchmark, measured core-crypto source, build inputs and locked dependencies identical across this candidate and all four original sources. Its match/reject assertions passed; the failed comparison uses subtracted timing estimates. The cause remains unresolved and is not labeled environment-only. The 13 unchanged-rule skips are four policy Anvil cases, eight registry Anvil cases and one Bitcoin regtest case. Hosted CI requires the twelve Anvil cases through `REQUIRE_ANVIL=1`; local execution did not configure those fixtures. Local Node 24.22.3 also differs from hosted Node 22, so local results do not establish hosted parity.

The native browser run failed in Chromium's process-singleton startup with `socket() failed: Operation not permitted (1)`. It exited before page assertions; the remaining 115 cases did not run. This does not establish a browser product failure or browser acceptance. The new test author's handoff preserves its earlier pending state; the coordinator's later receipts supply the actual execution evidence.

## Ownership and next gate

The shared integration lock remains held at generation 11 by `994a0d214fb9-root-r3`, observed at `c196151daf8233f96045fd205b2d899c9e8cc97d`. Expiry does not authorize takeover. This worker owns the isolated candidate and its evidence, not shared integration/main or frozen donor branches.

Require successful qualification of the unresolved no-coverage benchmark and browser gates, plus applicable hosted CI, Pages/Beta and security checks on the published combined candidate. Preserve exact source identities if further corrections are needed. Shared-target integration requires the current owner's coordination and successful applicable gates. This report makes no whole-repository, real-chain, fund-recovery guarantee, release or deployment claim.
