# Integration QA continuation

## Current handoff after the frozen combined-source run

The reviewed combined source is `53f4253bd9afc33bea43a7bdfe95ae287e035bf7`. This worker independently verified the 15 source mappings and eight preserved controls, passed 87 original web QR cases, passed full web TypeScript at 1024 MiB, and passed the four original no-coverage cases. Full typed lint reached its explicit 1024 MiB heap cap; one coordinator-authorized 1536 MiB retry remains deferred to the repaired source.

The original full coverage attempt reached its recorded 900-second overall cap after reporting 1,467 passes and 19 actual failures (12 `send.test.ts`, seven `PolicyView.guard.test.tsx`). These are partial counts; no complete coverage summary was produced. `FINAL-QUALIFICATION.md`, `full-web-baseline-outcome.json`, `final-checks-phase1.json`, and `final-checks-phase2.json` preserve exact scope and outcomes. Lossless raw logs remain in `logs/`.

Fresh worker `/root/policy_fixture_gen7` owns the shared policy receipt-fixture repair on its own branch. Its prepared change adds the correct existing broadcast/transaction hash to `walletMirror`'s receipt object in `apps/web/src/features/policy/fixtures.testutil.ts`, preserving every assertion and runtime gate. Independently review its committed change and all seven existing helper-consumer suites before integration. Do not claim the prepared change is tested until that worker provides executed results.

After root freezes the corrected source, recheck the exact diff and execute the single justified full-lint retry and development Pages artifact build where feasible. Root will use exact-head hosted original full-coverage and browser gates for complete qualification. Do not automatically repeat another incomplete local full-coverage command; a later local full pass needs a justified budget and runnable conditions. No project timeout, threshold, exclusion, assertion or security control may be weakened. Root owns execution-window scheduling, hosted CI/browser qualification and publication. The separate quick-hide source still requires its own qualification.

## Initial-source history

The initial frozen source is `9e062b7150e74d1b20e34b0f120add660d9ef02e`. Do not repeat the completed source-preservation and QR/Pages checks unless their input blobs change.

1. Obtain the coordinator's final wallet source after the independently reviewed receipt-status and any separately reproduced transaction-shape repairs. Keep the initial source manifest and results intact; create a distinct final-source receipt.
2. Verify that the new candidate preserves the 15 initially reviewed input paths, allowing only the explicitly reviewed wallet/test follow-ups. Recheck the eight baseline control scopes and dependency/configuration identities.
3. After the coordinator grants the serialized execution window, execute the changed web QR classifier and appropriate frame regression tests. Then run the original full web TypeScript check with a bounded heap and full configured web coverage plus the existing no-coverage pass when resources permit. Do not change project thresholds, timeouts, skips or pool configuration to produce a pass.
4. Preserve process termination/resource failures separately from executed assertions. Previous generation resource failures do not automatically establish a defect in the current source. A focused test pass does not replace the full required gate.
5. Check exact-source hosted CI/security/browser results before promotion. The original #295 full-browser failure is the already-preserved network-observation fixture repair; do not duplicate that fix or transfer an older hosted pass to this candidate.
6. The quick-hide feature has its own source and privacy dependency; it is independently reviewed elsewhere. Do not merge its older dependency tree over newer active privacy work.

Root owns remote publication and shared integration. This worker owns only its additive claim and this evidence directory. No deployment or release authorization is implied by this handoff.
