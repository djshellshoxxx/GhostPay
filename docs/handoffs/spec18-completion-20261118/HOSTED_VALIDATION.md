# Spec 18: source-pinned hosted validation

Reviewer: `recon_recovery`. Read-only GitHub Actions inspection; no workflow was dispatched or rerun by this reviewer.
Dates: 2026-11-18–19 UTC. **The final original web coverage/nocov command and whole-workspace typecheck passed. All nine Spec 18 journeys passed in each browser profile, including the actual BOM refusals. Whole-repository CI retains the inherited failures below.**

R-08 in [SECURITY_REVIEW.md](SECURITY_REVIEW.md) is closed for the reviewed scope: byte-length guards passed
independent source review, mounted-component red/green tests and the final hosted first/narrow-viewport journeys
with actual BOM-prefixed uploads. This fixes the portability mismatch caused by native `File.text()` removing a
leading UTF-8 BOM before authentication. Earlier source results remain separately recorded; they are not used to
qualify the repaired bytes path.

## Exact source identity

The GitHub Git-commit API and local `git rev-parse <commit>^{tree}` independently establish these equalities.
The first published commit has the same complete file tree as the locally reviewed implementation, despite its
different commit identity. The second revision changes four browser-test files; the third corrects one consent
test; the fourth adds the byte-length guards and their regressions plus the narrow test type fix.

| Revision | Published PR head | GitHub synthetic test merge | Equivalent local source | Identical tree |
| --- | --- | --- | --- | --- |
| Initial candidate | `041db448baa7fd094f8b1ad37f3f7377c98bcab1` | `ad0f03acfae81439640f74fce5562d475227197f` | `6cd9c2f0354f97cc7b100608cb868b47ea461b36` | `36dca7e00c263fb9c95fb05582bf2078948448bc` |
| Browser-test correction | `d46b8d8253a8f9c18ff21327ef115c3c748a75ec` | `c93b35b7630bd96e7686573576db8fbad49eb6d7` | `02ccc5e1d341b0d1ff404f66ae6b5fc1005f71b2` | `d99b744185e9dc95caf376563a474146e9a800d8` |
| Saved-wallet consent test correction | `f72c198b2a6a75be889e9810a37721da116deba1` | `5565efdf0b8b64646949520c422c9c908182f931` | `a5b3fd123a86d6f5c52b9311a1707a009d3002b7` | `f0a30cf70ee02856c0c9f5dcb0d04fd7697b33b6` |
| Byte-preservation guard and test type correction | `032c42fc3d5e52d8428a7907775835b5d1ed3704` | `b53f116b825d7cf6e85681fc835aec18ef7add75` | `eb9e244232a6b7002e7dfc7085041cbf4177a566` | `631d9b0765cd2c4a919bb4e6de6ae1cc6574cfd5` |

[PR #240](https://github.com/djshellshoxxx/GhostPay/pull/240) is a draft stacked on #238 at
`198aa5baff22272453733a0f3dcfcac0e0994eec`. All four synthetic merges have that base as their first parent.
Completed job logs below show the actual checkout SHA, not merely the workflow's PR-head label.

Git API provenance is retained in the [initial commit trees](evidence/hosted/commit-trees.json),
[browser-test follow-up trees](evidence/hosted/followup-commit-trees.json),
[unit-test follow-up trees](evidence/hosted/unit-followup-commit-trees.json) and
[final byte-guard trees](evidence/hosted/bom-followup-commit-trees.json). Initial results come from
[CI run 44419497914](https://github.com/djshellshoxxx/GhostPay/actions/runs/44419497914), attempt 1.
Browser-test follow-up results come from [CI run 44421229393](https://github.com/djshellshoxxx/GhostPay/actions/runs/44421229393),
attempt 1. The unit-test correction ran in [CI run 44423422185](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423422185),
attempt 1. The byte-guard/type correction runs in [CI run 44425273430](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273430),
attempt 1. No result from the earlier #238 baseline is substituted for these runs.

## Final byte-preservation repair (fourth round): actual results

The final six-file patch adds the two byte-length guards, three actual-BOM component cases, BOM uploads to the
existing first and narrow-viewport browser journeys, and removes the unsupported Testing Library `exact` option.
The independent reviewers inspected all six files after the repair. Local complete tracker plus seller-view tests
passed 17/17, and complete recovery tests passed 18/18: **35 distinct focused tests, zero skips**. Six-file typed
ESLint passed (`/tmp/ghostpay-spec18-bom-lint.log`). The local whole-web compiler attempt was killed with exit 137
before diagnostics (`/tmp/ghostpay-spec18-bom-typecheck.log`); it is not a pass.

Completed logs establish the following results on November 19. The web job finished at **00:22:59 UTC**; its original
coverage invocation and separate nocov invocation both completed successfully. Full and lean each passed all nine
Spec 18 journeys and both sweep reload cases. Every final target log checks out the same exact synthetic source
`b53f116b825d7cf6e85681fc835aec18ef7add75`.

| Final-source job | Recorded result |
| --- | --- |
| [Original web coverage and nocov](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273430/job/135232142934) | **Passed.** Coverage invocation: **2,997 passed, 1 existing skip**; **219 files passed, 1 skipped**. Separate nocov invocation: **3 tests and 3 files passed, no skips**. Aggregate coverage: **93.29% statements, 89.5% branches, 95.02% functions, 97.04% lines**. |
| [Whole-workspace typecheck](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273430/job/135232142766) | **Passed.** The original `npm run typecheck` includes web `tsc -p tsconfig.json --noEmit`; exact source and actual commands are retained in the log extract. |
| [Full Chromium](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273430/job/135232142880) | **86 passed, 1 failed, 1 existing profile skip. All nine Spec 18 cases and both sweep reload cases passed; no Spec 18 skip.** Only failure: inherited hostile-text `about:blank` navigation abort. |
| [Lean Chromium](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273430/job/135232142803) | **74 passed, 1 failed, 3 existing profile skips. All nine Spec 18 cases and both sweep reload cases passed; no Spec 18 skip.** Only failure: inherited hostile-text `about:blank` navigation abort. |
| [Build and guards](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273430/job/135232142788) | Passed. Actual log includes `@ghostpay/web` build: `tsc -p tsconfig.json --noEmit && vite build`, then successful postbuild. |
| [Workspace lint](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273430/job/135232142730) | Failed only at inherited `packages/chain-adapters/src/payments.bulkCancellation.test.ts:21`, `@typescript-eslint/require-await`. No new changed-file diagnostic in the complete log. |
| [Remaining workspaces/scripts shard 0](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273430/job/135232142944) | Final script suite: **246 passed, 3 failed, 0 skipped**. Same inherited stale package map and web/relayer dependency-closure assertions; no new failure signature. |
| [Remaining workspaces shard 2](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273430/job/135232142948) | **Passed**, completed 00:27:24 UTC. Sum of its 21 reported workspace runs: **3,659 tests passed, 5 skipped; 154 files passed, 1 skipped**. The relevant `ux-vault` run passed **353/353 tests, 10/10 files, no skips**, with **97% statements, 94.24% branches, 99.5% functions, 98.89% lines**. |
| [Pages artifact on anvil](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273443/job/135228385513) | **16 passed**, including actual artifact identity, seller keystore verification, process restart and fresh-profile recovery. |
| [Beta acceptance](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273428/job/135228385606) | **3 real-devnet browser cases passed**; the job also reported **124/124 CLI devnet checks**. These are separate existing journeys, not substitutes for the Spec 18 cases. |
| [Pages build and verification](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273443/job/135228385976) | Passed. Its top-level log does not print the original compiler command, so it is not substituted for final `ts-typecheck`. |

### Original web command, coverage and existing skip

The executed command was `vitest run --coverage && vitest run --config vitest.nocov.config.ts` under Node
**22.23.4**, with the original configurations and thresholds. The coverage phase took **464.24 seconds** and printed
its final aggregate before the second Vitest process started at 00:22:45 UTC. The nocov phase took **8.95 seconds**;
`scannerCore.bench.nocov.test.ts`, `tagArchive.fuzz.nocov.test.ts` and `scannerCore.spam.nocov.test.ts` each passed.

The single skipped coverage file is the unchanged `src/features/btc/regtest.e2e.test.ts`: **regtest end to end
(live bitcoind) > detects the silent payment, sweeps it, and sees it spent afterwards**. Its existing `describe.skipIf`
requires `GHOSTPAY_REGTEST_URL`, `GHOSTPAY_REGTEST_SEED` and `GHOSTPAY_REGTEST_DEST` from the separate live
bitcoind/Esplora-shim harness. No changed Spec 18 test was skipped. All mutable-byte, recovery, consent and page-close
tests are included in the original passing web run; no reduced configuration replaces that result.

### Nine final-source Spec 18 journeys

Exact original titles, source locations, timestamps and durations are retained in metadata/extracts for
`job-135232142880` (full) and `job-135232142803` (lean). These are executed desktop Chromium assertions, not build
inferences. The first and fourth cases refuse actual BOM-prefixed files and then continue through valid-file success.

| Journey | Full profile | Lean profile |
| --- | --- | --- |
| Public/encrypted/raw payment export, blocked-download retry, retained-file identity and BOM refusal | Passed, 6.2 s | Passed, 4.9 s |
| No-vault secret export requires matching keystore and passphrase | Passed, 4.4 s | Passed, 3.4 s |
| Fresh empty browser opens keypair; wrong passphrase shows no key | Passed, 949 ms | Passed, 775 ms |
| Narrow-viewport verify-only: malformed/public/BOM refusals, authenticate without installing wallet | Passed, 996 ms | Passed, 783 ms |
| Master restore replaces saved wallet only after fresh consent | Passed, 1.6 s | Passed, 1.3 s |
| Keyboard file chooser, password/tab order and verify-only submit | Passed, 613 ms | Passed, 431 ms |
| Secret-leak guard: requests, console, URL/history, storage, IndexedDB, clipboard | Passed, 8.3 s | Passed, 6.7 s |
| Idle lock during export discards the result and retains sole copy | Passed, 9.1 s | Passed, 8.2 s |
| Wipe during master KDF discards the result | Passed, 23.5 s | Passed, 17.3 s |

Both intentional sweep reloads passed with explicit `beforeunload` type assertions and acceptance: success outcome
**5.6 s full / 4.6 s lean**, unknown outcome **6.4 s full / 4.5 s lean**. The formerly ambiguous core cases at
623 and 667 passed (**4.6 s / 2.8 s full**, **3.6 s / 2.2 s lean**), and the combined backup panel passed in full
(**3.3 s**). The lean backup-panel exclusion case passed (**315 ms**).

All browser skips are the original profile policy: full skips only the lean-only backup-panel case; lean skips
the full combined backup panel, Bitcoin-worker case and tag-archive retry case. All nine Spec 18 cases have zero
skips in both profiles. The narrow viewport is **390 × 844 on desktop Chromium**, not a physical mobile test.

### Whole-candidate status beyond the focused feature

The final source-pinned GitHub snapshot at **2026-11-19 00:33:21 UTC** records 36 checks on the published head, zero
checks attached directly to its synthetic merge, five Actions workflows and one commit status. The compact
[final candidate status](evidence/hosted/final-candidate-status.metadata.json) preserves exact IDs, URLs,
conclusions and timestamps.

- Pages, Hosting kit, Beta acceptance and CLI operator qualification workflows completed successfully. Linux,
  macOS and Windows CLI jobs all report success. The Pages release-gate, attestation, deployment and post-deployment
  smoke jobs were skipped by PR policy; no deployment is claimed.
- Main CI is **completed with failure**, with no pending jobs. Shard 2 passed; its contracts aggregate and all other
  contract jobs, relayer, core-crypto, Bitcoin, confidential-contracts and rest-1 tests reported success. The failed
  jobs are full/lean e2e, workspace lint, shard 0 and the TypeScript aggregate. Inspected failure signatures remain
  the inherited hostile-text browser test, lint error and three shard-0 script assertions; the aggregate adds no
  new executed test failure.
- Neither CodeQL nor Mythril/Echidna appears in the final head/merge check lists or its five workflow runs. This is
  **absence of a candidate result**, not a pass or clearance of the inherited #238 CodeQL concern. Contract analysis
  has a changed-path PR filter in `.github/workflows/contract-analysis.yml`; this patch does not match its contract,
  runner or workflow paths. No analysis was dispatched to broaden the task.
- The separate `security/snyk (djshellshoxxx)` commit status reports success with **“No manifest changes detected in
  1 project”**. That status is recorded as reported and is not represented as a fresh full dependency audit.

## Saved-wallet consent test correction (third round): actual results

The third revision changes only `apps/web/src/views/SellerKeys.stealthExport.test.tsx` (12 additions, 2 deletions).
It replaces the outdated silent-replacement expectation with checks that the old session stays loaded until fresh
consent, Cancel preserves it, reopening asks again, and explicit Replace installs the recovered keys. Product and
browser-test source are unchanged. The crypto reviewer independently cleared this narrow test diff. The complete
four-case file passed locally under Node 22.23.5; that does not replace the original whole-web coverage/nocov gate.

The third run's [typecheck](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423422185/job/135223398438)
failed with exit 2 on `SellerKeys.stealthExport.test.tsx(103,81)`, TS2769: Testing Library's `ByRoleOptions` does not
accept Playwright's `exact` property. Its log checks out `5565efdf0b8b64646949520c422c9c908182f931`.
The narrow correction removes that unsupported property; the string name remains exact. This is a new test-only
compiler defect and is retained as a failed round, not attributed to the baseline. The third
[web job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423422185/job/135223398752) was cancelled when the
byte-guard revision superseded it. Its log has no completed test summary, coverage aggregate or nocov result.
The successful second-round browser assertions below remain valid for their exact source.

The same compiler error appears in [ts-check](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423422185/job/135223398591).
Third-round [full](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423422185/job/135223398721) and
[lean](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423422185/job/135223398716) browser jobs failed during
the `config.webServer` build (`tsc ... && vite build`, exit 2), before any test case started. They report no Spec 18
or sweep results and no suite totals; these are setup failures, not executed application assertions.

## Browser-test follow-up (second round): actual results

As of 23:42:26 UTC, both completed profiles have all nine Spec 18 journeys passing, with zero Spec 18 skips.
Each profile's only failure is the inherited hostile-text navigation error. Whole-workspace typecheck passed.
The original web coverage invocation failed one outdated silent-replacement expectation; nocov did not run.
All completed follow-up logs below check out
`c93b35b7630bd96e7686573576db8fbad49eb6d7`.

| Job | Current recorded result |
| --- | --- |
| [Whole-workspace typecheck](https://github.com/djshellshoxxx/GhostPay/actions/runs/44421229393/job/135215459643) | **Passed.** Original `npm run typecheck`, including web `tsc -p tsconfig.json --noEmit`, completed on the corrected source. |
| [Original web unit/coverage and nocov commands](https://github.com/djshellshoxxx/GhostPay/actions/runs/44421229393/job/135215459722) | **1 failed, 2,993 passed, 1 skipped**; files: 1 failed, 218 passed, 1 skipped. `SellerKeys.stealthExport.test.tsx:100` still expects a different saved wallet to be replaced without confirmation. That expectation conflicts with the intended fresh-consent repair. No final coverage aggregate was printed, and the chained nocov command did not execute. This is a new candidate test incompatibility, not an inherited failure. |
| [Full Chromium suite](https://github.com/djshellshoxxx/GhostPay/actions/runs/44421229393/job/135215459690) | **86 passed, 1 failed, 1 skipped. All nine Spec 18 cases, both sweep reload cases, both repaired core-journey cases and the combined backup panel passed.** Sole failure: inherited hostile-text `about:blank` navigation abort. |
| [Lean Chromium suite](https://github.com/djshellshoxxx/GhostPay/actions/runs/44421229393/job/135215459613) | **74 passed, 1 failed, 3 skipped. All nine Spec 18 cases, both sweep reload cases and both repaired core-journey cases passed.** Sole failure: inherited hostile-text `about:blank` navigation abort. |
| [Workspace lint](https://github.com/djshellshoxxx/GhostPay/actions/runs/44421229393/job/135215459684) | Failed only at inherited `packages/chain-adapters/src/payments.bulkCancellation.test.ts:21`, `@typescript-eslint/require-await`. No new changed-file diagnostic in the complete log. |
| [Remaining workspaces/scripts shard 0](https://github.com/djshellshoxxx/GhostPay/actions/runs/44421229393/job/135215459927) | Final script suite: **246 passed, 3 failed, 0 skipped**. Same inherited package-map and web/relayer dependency-closure failures as the initial run. |
| [Pages artifact on anvil](https://github.com/djshellshoxxx/GhostPay/actions/runs/44421229286/job/135214451767) | **16 passed.** Includes actual built artifact, seller keystore verification, browser-process restart and fresh-profile backup restore. Deployment and release jobs were skipped by PR policy; this is browser acceptance, not a deployment. |

The web suite's existing skipped file is `apps/web/src/features/btc/regtest.e2e.test.ts`: **regtest end to end
(live bitcoind) > detects the silent payment, sweeps it, and sees it spent afterwards**. Its unchanged
`describe.skipIf` requires `GHOSTPAY_REGTEST_URL`, `GHOSTPAY_REGTEST_SEED` and `GHOSTPAY_REGTEST_DEST`, supplied by
the separate live bitcoind/Esplora-shim harness. The raw log records one test and one skip for that file. No changed
Spec 18 test was skipped.

The four-file correction repairs the one-shot blocked-download stub and makes legacy **Verify backup** button
selectors exact in `e2e/core-journey.spec.ts`, `e2e/backup-panel.spec.ts` and `e2e/pages-devnet.spec.ts`.
The stub now temporarily overrides the anchor's inherited `click` method and restores either its original own
descriptor or its inheritance. The crypto reviewer independently reviewed this follow-up: no product source,
assertions, timeouts or skips were removed or weakened.

### Nine Spec 18 journeys in the corrected follow-up

Every row below passed in actual hosted desktop Chromium in both profiles. The first row now reaches the blocked-
download retry, retention confirmation and exact saved-file verification assertions that the initial stub prevented.
The exact original titles and source locations are preserved in `job-135215459690.metadata.json` and
`job-135215459613.metadata.json`, alongside line-numbered extracts.

| Journey | Full profile | Lean profile |
| --- | --- | --- |
| Public/encrypted/raw payment export, blocked-download recovery and saved-file verification | Passed, 6.0 s | Passed, 4.8 s |
| No-vault secret export requires the matching keystore and passphrase | Passed, 4.3 s | Passed, 3.6 s |
| Fresh empty browser opens keypair; wrong passphrase shows no key | Passed, 916 ms | Passed, 784 ms |
| Narrow-viewport verification-only flow refuses malformed/public files and installs no wallet | Passed, 827 ms | Passed, 672 ms |
| Master restore replaces an already saved wallet only after fresh consent | Passed, 1.5 s | Passed, 1.3 s |
| Keyboard file chooser, password/tab order and verification-only submit | Passed, 535 ms | Passed, 447 ms |
| Secret-leak guard: requests, console, URL/history, storage, IndexedDB and clipboard | Passed, 8.0 s | Passed, 7.0 s |
| Idle lock during payment export discards the result and retains the sole copy | Passed, 9.0 s | Passed, 8.3 s |
| Wipe during master KDF discards the result | Passed, 20.4 s | Passed, 17.7 s |

### Existing journeys and unchanged profile skips

| Journey | Full profile | Lean profile |
| --- | --- | --- |
| Sweep: successful handoff, observe/accept `beforeunload`, reload, refuse duplicate | Passed, 5.4 s | Passed, 4.4 s |
| Sweep: unknown handoff, observe/accept `beforeunload`, reload, refuse duplicate | Passed, 5.5 s | Passed, 5.4 s |
| Core journey at 623: same-key lock/reimport during pending sweep | Passed, 4.4 s | Passed, 3.7 s |
| Core journey at 667: verified keystore reimport after manual wipe | Passed, 2.8 s | Passed, 2.3 s |
| Combined backup panel at 10: honest status and exact legacy Verify backup selector | Passed, 3.2 s | Existing full-only skip |
| Lean backup-panel case at 60: excluded archive/combined controls | Existing lean-only skip | Passed, 314 ms |

The full suite's one skipped test is the lean-only backup-panel case. The lean suite's three skipped tests are
the full-only combined backup-panel case, `btc-worker.spec.ts:6` (Bitcoin excluded from lean), and
`product-backup-retry.spec.ts:7` (tag archives available only in full). Their existing `test.skip(lean, ...)` /
`test.skip(!lean, ...)` policies are unchanged. Neither profile skips a Spec 18 case. Exact skipped titles appear
in the extracts and `skipped_browser_cases` metadata.

The corrected `pages-devnet.spec.ts` legacy selector is additionally exercised by the separately passing 16-case
Pages artifact suite. Its synthetic source matches the two CI browser profiles; it does not qualify physical
mobile devices or a third-party wallet application.

## Superseded initial run: actual results

| Job | Actual result at `041db448` / merge `ad0f03ac` |
| --- | --- |
| [Whole-workspace typecheck](https://github.com/djshellshoxxx/GhostPay/actions/runs/44419497914/job/135209269085) | **Passed.** Executed `npm run typecheck`, including `@ghostpay/web`'s original `tsc -p tsconfig.json --noEmit`. This closes the initial runtime's local compiler uncertainty. |
| [Web tests](https://github.com/djshellshoxxx/GhostPay/actions/runs/44419497914/job/135209269223) | **Cancelled** when the new PR head superseded this run. The log ends with “The operation was canceled” and has no complete test/coverage summary. It is not a passing whole-web result. |
| [Full Chromium](https://github.com/djshellshoxxx/GhostPay/actions/runs/44419497914/job/135209268991) | **82 passed, 5 failed, 1 skipped.** Eight of nine Spec 18 journeys and both sweep reload journeys passed. |
| [Lean Chromium](https://github.com/djshellshoxxx/GhostPay/actions/runs/44419497914/job/135209268959) | **71 passed, 4 failed, 3 skipped.** Eight of nine Spec 18 journeys and both sweep reload journeys passed. |
| [Workspace lint](https://github.com/djshellshoxxx/GhostPay/actions/runs/44419497914/job/135209268945) | Failed at unchanged `packages/chain-adapters/src/payments.bulkCancellation.test.ts:21`, `@typescript-eslint/require-await`, matching the inherited baseline failure. |
| [Remaining workspaces/scripts shard 0](https://github.com/djshellshoxxx/GhostPay/actions/runs/44419497914/job/135209269325) | The final script suite reported **246 passed, 3 failed, 0 skipped**. The failures are the inherited stale package map and web/relayer dependency-closure expectations. |

The hosted jobs used Node **22.23.4**. This is distinct from local runs recorded in
[SECURITY_REVIEW.md](SECURITY_REVIEW.md). The first workflow's overall conclusion became cancelled under
`.github/workflows/ci.yml`'s PR `cancel-in-progress` policy; already completed job outcomes remain valid for their
exact source.

### Nine Spec 18 journeys in the initial run

These are actual completed desktop Chromium assertions in `e2e/stealth-export.spec.ts`, not jsdom results or
inferences from a successful build. Complete original titles, locations and timestamps are retained in each job's
metadata and extract.

| Journey | Full profile | Lean profile |
| --- | --- | --- |
| Public/encrypted/raw payment export, blocked-download recovery and saved-file verification | **Failed**, 1.6 s: `test-only missing anchor click`, before retention/verification assertions | **Failed**, 1.6 s: same test-stub error |
| No-vault secret export requires the matching keystore and passphrase | Passed, 4.6 s | Passed, 4.4 s |
| Fresh empty browser opens keypair; wrong passphrase shows no key | Passed, 949 ms | Passed, 863 ms |
| Narrow-viewport verification-only flow refuses malformed/public files and installs no wallet | Passed, 930 ms | Passed, 842 ms |
| Master restore replaces an already saved wallet only after fresh consent | Passed, 1.6 s | Passed, 1.5 s |
| Keyboard file chooser, password/tab order and verification-only submit | Passed, 638 ms | Passed, 507 ms |
| Secret-leak guard: requests, console, URL/history, storage, IndexedDB and clipboard | Passed, 8.4 s | Passed, 7.9 s |
| Idle lock during payment export discards the result and retains the sole copy | Passed, 9.2 s | Passed, 9.0 s |
| Wipe during master KDF discards the result | Passed, 21.4 s | Passed, 19.7 s |

The first journey failed with the same error and duration in both profiles; it is deliberately not counted as a
saved-file verification pass. The narrow viewport was **390 × 844 on desktop Chromium**, not a physical phone,
mobile browser engine or Safari.

### Sweep reload consent in the initial run

Both `e2e/sweep.spec.ts:54` parameterized cases passed with the newly explicit `beforeunload` type assertion and
acceptance, followed by all original journal/hash/duplicate-send checks.

| Outcome | Full | Lean |
| --- | --- | --- |
| Successful handoff, then reload | Passed, 5.8 s | Passed, 5.4 s |
| Unknown handoff, then reload | Passed, 6.4 s | Passed, 5.5 s |

### New failures versus inherited failures

| Failure | Classification and evidence |
| --- | --- |
| `stealth-export.spec.ts:98`: `page.evaluate: Error: test-only missing anchor click` | **New test defect, both profiles.** `click` was inherited from `HTMLElement.prototype`; looking for an own descriptor on `HTMLAnchorElement.prototype` failed. Corrected in the follow-up; initial assertions were not relaxed. |
| `core-journey.spec.ts:339`, affecting cases at 623 and 667 | **New selector collision, both profiles.** Playwright's non-exact button-name query matched both legacy **Verify backup** and new **Verify backup without importing**, including the disabled new control. Corrected with an exact legacy name. |
| `backup-panel.spec.ts:37`, combined backup case | **New selector collision, full profile.** Same ambiguity; lean skips the full-profile combined panel by its existing policy. Corrected with an exact legacy name. |
| `app.spec.ts:115`, hostile invoice text case | **Inherited, both profiles.** `page.goto('about:blank')` in `helpers.ts:56` aborted with `net::ERR_ABORTED`; the same test already failed in the baseline. The passing security cases do not clear this failure. |
| Shard-0 package-map and dependency-closure assertions | **Inherited.** `scripts/agent/workspaces.test.mjs:109` reports the stale generated map; `scripts/tests/lean-core-reachability.test.mjs:76` and `:85` report the web and relayer closures. |

## Evidence preservation and remaining boundaries

The [hosted capture manifest](evidence/hosted/CAPTURE_MANIFEST.json) and
[SHA-256 index](evidence/hosted/SHA256SUMS.txt) index the retained extracts, metadata and source/status records in
`evidence/hosted/`. Each job's `.metadata.json` records its source URL, conclusion, checked-out SHA, original UTF-8
byte count and decoded/compressed SHA-256. Matching `.extract.txt` files preserve relevant output with original
line numbers and explicitly remove ANSI formatting only. Raw decoded logs remain compressed under the original
capture directory `/tmp/spec18-hosted-review/job-<id>.log.gz`; the published excerpts are not presented as full raw logs.

The earlier local Chromium launch stopped at socket-creation permission failure before application assertions.
Local whole-web coverage and several compiler/typed-lint attempts were externally killed with exit 137 before a
successful summary. No local pass is inferred from those attempts. The later complete hosted final-source web
coverage/nocov and typecheck logs supply those actual results; they do not retroactively change the local attempts.

Physical mobile file handling, Firefox/WebKit and third-party wallet or hardware-device applications remain
unqualified. The separate pinned Foundry 1.8.5 synthetic spend qualifies the documented independent wallet-tool
path only. These results do not authorize merge, release or deployment, and do not turn this AI-assisted review
into a professional audit.
