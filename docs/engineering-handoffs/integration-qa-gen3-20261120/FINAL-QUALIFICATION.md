# Combined web qualification — generation 3

## Source and outcome boundary

Independent worker: `/root/integration_qa_gen3`. This continuation qualifies the frozen product/test source `53f4253bd9afc33bea43a7bdfe95ae287e035bf7` on branch `review/ghostpay-integration-final-qa-gen3-20261120`. The earlier source-specific report and QR/Pages evidence remain intact.

The full web run has established a qualification gap in legacy policy receipt fixtures. The candidate cannot be described as fully qualified while these original tests fail. The coordinator assigned a fresh worker to the fixture correction and deferred further lint/build qualification until the corrected source is frozen. No production or test source is changed in this review worktree during the baseline run.

## Exact input preservation

`final-source-manifest.json` independently verifies all 15 selected input blobs and all eight baseline control scopes. The only non-documentation changes after initial candidate `9e062b7150e74d1b20e34b0f120add660d9ef02e` are `wallet.ts`, `wallet.test.ts`, and `payExec.test.ts`. All three match the independently reviewed transaction repair `c344334d757db9ca51e107000b918fd23cc7397d`. The complete non-documentation tree also matches that repair's tree.

The frozen source includes the unsupported receipt-status repair and primitive transaction hash/call-data validation. The initial report's finding that the status defect remained open applies only to its earlier `9e062b71` source. Hash-correlation validation and the nullable receipt-destination compatibility boundary remain preserved.

## Completed execution before the full suite

All checks use the original repository configurations, assertions, thresholds, timeouts and exclusions. Heap limits and one-worker execution bound resources only. This worker retains its private, matching-lock dependency tree and the independently verified declaration reuse described in `dependency-provenance.json`.

| Check | Actual result at `53f4253b` |
|---|---|
| Original web QR classification/frame tests | **87 passed**, zero skipped; heap 768 MiB |
| Full original web TypeScript | **Pass**, exit 0; heap 1024 MiB |
| Full original typed web ESLint | **Incomplete due to resource failure**, exit 134; explicit JavaScript heap exhaustion at 1024 MiB |

The lint failure is not reported as a clean lint run or as a product lint defect. The coordinator authorized one later serialized retry at 1536 MiB, justified by the explicit heap-limit diagnosis. That retry is deferred until the corrected final source. Exact commands, timings and compressed raw logs are in `final-checks-phase1.json` and `logs/`.

## Confirmed policy fixture gap

`apps/web/src/features/policy/fixtures.testutil.ts` defines the shared `walletMirror` helper. Its transaction response includes the same `0x9…9` hash returned by `MockWallet` when broadcasting. Its receipt response omits `transactionHash`, so the strengthened original receipt validator rejects it before policy approval, deadline, session and repeat-payment assertions reach their intended conditions.

The affected fixture source is the receipt object at line 236; the transaction hash is at line 232. The originating `MockWallet` hash is returned at `apps/web/src/test/mockWallet.ts:57`. These are source-pinned locations at `53f4253b`, not a runtime diagnosis of an external provider.

The repair belongs in the test fixture and must preserve all existing production validation, test assertions, timeouts, exclusions and coverage thresholds. The baseline source remained unchanged throughout execution. The fresh fixture worker owns implementation and focused checks in a separate worktree. The observed failure set is retained in full; because the overall command cap was reached, it is not claimed to be the complete suite's failure set.

## Full-suite outcome

| Original pass | Actual outcome at `53f4253b` |
|---|---|
| Full configured coverage | **Incomplete**, exit 124 after the recorded 900-second external command cap; 1,467 passing test lines and 19 failing test lines were reported before termination |
| Existing separate no-coverage pass | **4 tests passed in 4 files**, exit 0, 42.416 seconds |

The 19 observed failures are 12 cases in `src/features/policy/send.test.ts` and seven in `src/features/policy/PolicyView.guard.test.tsx`. Their names and reported reasons are preserved in `full-web-baseline-outcome.json`; the original complete captured output is retained losslessly in `logs/final-web-coverage.log.gz`. All observed failures correspond to the missing receipt hash before the intended policy behavior is reached.

The coverage process did not emit a completed suite summary or aggregate coverage before termination. The passing-line count is partial progress, not a whole-suite pass, and coverage thresholds were not established as satisfied. The external 900-second cap did not change the project's original 60-second individual test timeout. The original no-coverage configuration was then run separately, despite the preceding coverage failure, to preserve its independent result. `final-checks-phase2.json` records commands, timestamps, terminations and raw/compressed-log hashes for both passes.

The sole execution window was released to the fixture-repair worker after the no-coverage pass completed. Further lint/build commands were deferred at the coordinator's request, avoiding qualification of a candidate already known to need corrected fixtures.

## Remaining qualification

After the fixture repair is independently reviewed, verify its exact diff and freeze the new source. The coordinator requested the single justified full-lint retry and development Pages artifact build next, using the repaired source. Root will use exact-head hosted original full-coverage and browser gates for complete qualification. Do not automatically repeat the incomplete local coverage command with the same cap; a later local full pass requires a justified larger overall budget and runnable conditions while retaining original per-test timeouts and gates. Do not relabel this baseline as a result for the repaired candidate. The separate quick-hide feature retains its own source and qualification boundary.
