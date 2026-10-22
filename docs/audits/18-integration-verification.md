# Consolidated integration verification

Date: 2026-10-22. Status: **verified consolidation; main promoted**. Candidate `c206655ebfa747b3dd56b1dc9f4e7f16e641a833` passed the full hosted gates and was promoted by PR #20. This report is evidence for repository integration, not a production-readiness certificate.

## Completed checks

| Area | Result | Scope and limits |
| --- | --- | --- |
| Imported extension packages | 2,253 tests / 128 files passed | All 29 imported package suites and their configured coverage gates; audit 07 |
| Invoice schema | 626 tests passed | Text hygiene and passphrase envelope behavior retained |
| Core crypto | 55 tests passed | Full coverage run: 98.47% statements, 98.11% branches; 1,000-payment differential case retained |
| BTC silent payments | 353 tests passed | 97.41% statements, 96.17% branches; audit 19 |
| Chain adapters | 332 tests / 19 files passed | Required Anvil, 96.17% statements, 94.42% branches, 96.91% functions, 98.27% lines (after final malformed-topic regression); isolated coverage directory |
| Main contracts | 411 tests passed | Latest full default profile, including 10,000-run fuzz and configured invariants; deterministic gas snapshot separately 370/370 |
| Pool contracts | 86 tests passed | Default fuzz/invariant profile; deliberately insecure development ceremony remains an external release blocker |
| Payer-hiding contracts | 108 tests passed | Default profile, formatting, NatSpec and build-size checks |
| Confidential contracts | 37 passed, 9 pending in full suite; separate 9/9 Anvil pass | All 46 cases exercised across both runs; includes 1,000-payment and repeated sequence stress cases; audit 10 |
| Full EVM devnet rehearsal | 12 steps / 14 transactions passed | Fresh local Anvil, deployment + structured test-only manifest signature, payments, scanning, direct/sponsored sweeps and replay 409 rejection; state/artifacts cleaned afterward |
| Required EVM helper integrations | Registry 4/4, router 3/3, policy scheme 7/7 passed | Explicit local Anvil/Solidity 0.8.28; CI now requires the tools/artifacts for web and applicable dynamic shards rather than silently skipping |
| Web Bitcoin live regtest | 1 test passed, no skips | Fresh Core 28.1 with txindex and Esplora shim: found 50,000,000 sats, reviewed/signed/broadcast sweep, rescan confirmed spent, node mined/verified 49,999,802-sat destination and 198-sat fee; processes cleaned |
| Bitcoin PayJoin | 4 real regtest tests passed | Bitcoin Core 28.1, release checksum matched; no public-network claim |
| Privacy profiles | 176 tests passed | Full 1,440-context grid retained; audit 12 |
| Relayer | 248 tests passed | Anvil required; 97.25% statements, 92.35% branches, 96.77% functions, 98.38% lines |
| Relayer guard | 146 tests passed | 98.05% statements, 93.67% branches, 98.40% functions, 98.62% lines |
| Relayer overload | 128 concurrent distinct clients exercised | 20 admitted, 108 rate-limited; health stayed responsive and refill recovery passed |
| QR Exchange | 52 tests passed | Camera permission, abort and malformed-stream edges; 98.39% statements, 91.04% branches, 100% functions, 99.61% lines; lint/typecheck passed |
| Operator scripts | 13 tests passed | Manifest generation/refused unsigned web staging, shell-injection regressions, Esplora shim; now run in CI rest-0 shard; all 60 action references remain pinned |
| Root workspace typecheck | Passed | `npm run typecheck` completed; subsequent feature edits also require scoped checks and final CI |
| Workspace build | Passed | Dependency-ordered build of all workspaces, including imported packages and production web bundle |
| Production dependency audit | Zero reported vulnerabilities | `npm audit --omit=dev --json`; 293 production dependencies; advisory database result, not source-code assurance |

Coverage percentages above are actual configured-gate runs, not focused-test coverage estimates. Expensive suites were not reduced to make them pass. Detailed test mechanisms and exceptions belong to the linked area reports.

## Final validation

Candidate `c206655ebfa747b3dd56b1dc9f4e7f16e641a833` passed uncancelled [CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/39768643775) and [Integration](https://github.com/djshellshoxxx/GhostPay/actions/runs/39768643774) before main merge `5795857d9e366cc9a4304c6afa9b03365e7c1844`. Hosted web coverage passed: 630 tests, 92.29% statements / 87.24% branches / 91.45% functions / 95.46% lines. The sole ordinary-suite live Bitcoin skip was separately exercised against Core 28.1. The full FHE hosted suite passed all 46 cases in one run. Full workspace typecheck/lint/build/audit, browser, all test shards, contracts and static gates passed.

The unused registry duplicate was removed in favor of the tested active view. Required Anvil flags are scoped to configured workspaces; optional external research fixtures retain explicit gates. The exact 2,923-file candidate matched the worktree, and its runtime tree matched promoted main. All authored source tips are main ancestors. See [final completion record](22-consolidation-completion.md) for resolved PRs, complete scope and remaining boundaries.

## Security review

Audits 09, 17 and 20 record exploit mechanisms, fixes, regressions and residual limitations. An independent current-code review of the bundled deployment trust boundary found no actionable defect: production web manifests are embedded in hashed bundles, checked against pinned release keys, and read back on-chain before sensitive operations; relayer and monitor also verify structured signatures and deployments. The fetch-based compatibility helper is not called by production web services. Test keys and fake manifests are scoped to the browser-test build.

Local testing cannot supply trusted setup, real deployment/key custody evidence, a professional independent audit, funded wallet/device qualification or native-speaker review. Experimental chains and policy-account flows must retain their documented gates.
