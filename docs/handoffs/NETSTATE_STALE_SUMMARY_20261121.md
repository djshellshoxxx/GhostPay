# GhostPay — stale network-health summary bug repair (2026-11-21)

## Exact source and ownership
- Repository: `djshellshoxxx/GhostPay`; Pages-only, BUG-ONLY task branch `automation/20261121/bug/netstate-stale-summary-r7`.
- Current baseline main at discovery and branch creation: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Original `packages/ux-core/src/netstate.ts` Git blob: `3082d56ff1ecabf73ab4fb65e69c318053095954`.
- Only product source: `packages/ux-core/src/netstate.ts`; new regression: `packages/ux-core/src/netstate.stale.test.ts`.
- Claim appended without replacing prior sections: `docs/ai/ACTIVE_WORK.md` at `4a885ecfbab49021d106590d4f0c3adcb76a1b54`.
- All 173 open PRs at discovery (through #417) were inspected using their GitHub changed-filename inventories. None changes either owned netstate path. Major broad #238/#262/#264/#278/#372 change other ux-core files; do not mix their source.
- No dependency, wallet, relayer, contract, network request, UI redesign, deployment, release, or shared-branch update.

## Reproduced defect
`effective()` correctly computes `stale` when `nowMs - lastProbeAtMs > staleAfterMs`, but `summarize()` previously ignored this reachability when deciding the final `overall` state. An expired single RPC, one expired RPC mixed with a fresh RPC, or an expired relayer could report `ok`. An old RPC clock-skew reading could even produce `clock-skew` after that reading had become stale.

- Test-first failing regression: `ff4489e8d6f8080a891167ce591fafda733a25c1` (new `netstate.stale.test.ts`, five tests).
- Minimal product correction: `d5fd9f0d6908a7e0d827d2cb946ceb193460b479`; resulting product blob `18a29c06d6a33d4023759a5236bb07cfe85ffee2`.
- Adjacent control: `1be452410082dddb0593b62569f5a2b75b6cd50b`; resulting regression blob `dd0527580862b36aa6682482bc41ba3b799667ee` (six test cases total).
- Root cause: the summary examined `state.reachability` or the stored skew without excluding expired success evidence.
- Smallest behavior change: cache `effective` reachabilities, refuse obsolete skew warnings from stale RPCs, and use the existing `unknown` banner when any configured RPC or relayer's success evidence has expired. Preserve real `rpc-down`, `rpc-degraded`, `relayer-down` and live `clock-skew` priority. Fresh checks still report `ok`.

## Verification evidence and limits
- Node.js `v22.16.0` ran an **isolated source-equivalent reproduction**, not a package checkout: four observed bad baseline states (three false `ok`, one old skew), five normal/priority controls; nine of nine pre/post expected transitions were observed. Included the 300,000 ms boundary and stale threshold. No real RPC or wallet interaction.
- The source excerpt was checked against the GitHub-fetched original `netstate.ts` blob listed above. This does **not** count as a local full-file TypeScript/Vitest run.
- Local `git ls-remote https://github.com/djshellshoxxx/GhostPay.git` failed: `Could not resolve host: github.com`. Repository Vitest, package typecheck/lint, and browser suites were **not run locally**.
- The new Vitest regression is committed before the production correction. Hosted CI must execute it at exact PR head; do not interpret this Node-only evidence as a verified repository pass.
- A genuinely independent reviewer was not available in this worker. Do not claim independent approval.

## PR #390 prerequisite recheck
- Draft #390 head: `b655bc273a6704c9c140287b8adcdf4085b91882`; changes owned by another worker, left untouched.
- Exact-head PR workflow families `CI`, `Pages`, `Hosting kit`, `Beta acceptance`, and `CLI operator qualification` completed **success**; associated jobs had no observed failures (deployment-only jobs skipped). GitHub review list was empty.
- No reproducible CI or source defect justified editing #390. Exact-head CI success does not replace independent review.

## Integration lock and remaining gates
- Separate coordination ref `automation/ghostpay-integration-lock`, JSON blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`, records status `held`, generation **11**, owner `994a0d214fb9-root-r3`. Recorded expiry `2026-11-21T00:16:57.174Z` is in the past, but no release or transfer of ownership was established; do not steal or mutate the lock.
- Keep draft pending exact-head GitHub CI (including targeted Vitest/typecheck/lint), applicable native browser verification, independent review, refreshed overlap/dependency check, and legitimate released/held lock authorization.
- No PR merge, branch consolidation, contract/fund actions, live traffic, deploy or release performed.
