# Consolidated integration verification

Date: 2026-10-22. Status: **in progress**. Remote checkpoint `ecc29c1ec998c4f131471967e2691678ca33f0fa` preserves the consolidated work; subsequent fixes are still being verified. This report is evidence for repository integration, not a production-readiness certificate.

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

## Current final gates

- The signed-fixture Playwright run passed 17/17 in 2.1 minutes, including native payment, mutated-calldata refusal, worker scan, passphrase invoices and vault reload/unlock. The later Pay receipt-import and async-flow hardening passed 86 related tests, a 17-test payExec follow-up, web typecheck and scoped lint. Independent security review passed another 86/86 run and closed the stale cross-invoice prepared-payment defect (audit 21); the fresh full browser run passed 17/17 in 2.1 minutes after those changes; full coverage is gated on the final clean-checkout hosted run.
- Root typecheck passed. The full lint sweep completed with only the earlier chain-adapter errors; those were fixed, scoped lint/typecheck and the full 332-test coverage suite passed, and every other workspace completed lint successfully. The final hosted workflow must verify the coherent tree.
- Hosted CI and Integration completed on the checkpoint, with the failures described below. Slither, secret/action checks, main contract tests/static checks, extra contract suites, core and BTC jobs passed. Relayer coverage failure on the checkpoint is addressed locally by the new coverage tests; QR branch coverage shortfall is addressed by the 52-test package run. The devnet signature rejection was fixed and the full local rehearsal passed; browser fixture readback and disclosure assertions were corrected. A fresh coherent candidate still requires green hosted workflows. These partial successes are not a green workflow claim.
- Final source disposition, exact-tree publication, clean-checkout verification, branch consolidation and main promotion remain pending. Source refs are retained.

## Security review

Audits 09, 17 and 20 record exploit mechanisms, fixes, regressions and residual limitations. An independent current-code review of the bundled deployment trust boundary found no actionable defect: production web manifests are embedded in hashed bundles, checked against pinned release keys, and read back on-chain before sensitive operations; relayer and monitor also verify structured signatures and deployments. The fetch-based compatibility helper is not called by production web services. Test keys and fake manifests are scoped to the browser-test build.

Local testing cannot supply trusted setup, real deployment/key custody evidence, a professional independent audit, funded wallet/device qualification or native-speaker review. Experimental chains and policy-account flows must retain their documented gates.
