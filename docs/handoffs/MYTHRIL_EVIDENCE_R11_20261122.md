# GhostPay R11 — complete Mythril evidence extraction and fail-closed analyzer summary

Cycle: 2026-11-22 UTC, sequential one-worker coordinator. Source main `eb59d93cffed7848c4aac37d0e9650b87239c6da`. Isolated branch `automation/20261122-r11/audit/mythril-evidence-summary`; integration/production branches untouched. No native subordinate, Caveman runtime, independent security auditor or GitHub approval was used.

## Actual incident analyzed

- Recovery/privacy PR [#372](https://github.com/djshellshoxxx/GhostPay/pull/372), exact head `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`, failed [contract-analysis run 44879663933](https://github.com/djshellshoxxx/GhostPay/actions/runs/44879663933), Mythril job `136771947984`. The runner did **not** fail simply due to an infrastructure timeout: the retained artifact contains complete issue-bearing JSON, and the runner exited nonzero on those reported issues. Actual exploitability and release acceptance remain unverified.
- Downloaded and inspected original GitHub Actions artifact `14699233056` (not committed). Its `metadata.json` pins analyzer `mythril`, requested/checkout commit `055d33e...`, report `254223` bytes, full SHA256 `475b27ec3adae0ccdc2d7fbcd8c30c4a1b819616f65b80f2863de5d7c307cdcb`, `truncated=false`, runner exit 1.
- Five *ordered* target reports, 10 findings: GhostPayRouter 0, GhostPaySweepRelayer 1 Low, GhostPayPolicyRouter 0, PolicyAccount 2 Low, PolicyAccountFactory 3 Medium / 4 Low. Total **3 Medium, 7 Low**, zero High. This is analyzer output **not ten independently confirmed vulnerabilities**. The three Medium reports refer to existing factory external-call/state/order concerns; keep open pending review under SECURITY.md.
- Source safety: no contract, wallet, deployment, signing or runtime payment paths modified. Findings and full traces are not reproduced in this public handoff.

## New engineering

- Ownership claim created **before any source edits**: `d195f63cf8ff4851efbc08601f5ccf7c9fc505fa`.
- Regression-first test commit: `659ee3a53b9416899e32ed24d4318d7628a351a1`, new `scripts/tests/mythril-evidence.test.mjs`.
- Source commit: `63b04430052d762333e414d127222a803b272794`, new `scripts/audit/mythril-evidence.mjs`.
- Script is **read-only**, bounded to 8 MiB, only accepts all five successful ordered target JSON reports, refuses missing/duplicate/malformed reports, unknown severities or malformed issue locations; strips descriptions, raw calldata, transaction traces and arbitrary issue text. It returns exit `0` only if all five reports are complete and no findings are present; `1` with findings; `2` on malformed/incomplete evidence. It does not replace or weaken `scripts/tests/mythril-runner.test.mjs`, the Mythril executable, CI or security-release gates.

## Verification and limits

- **Executed locally**: Node v22.16.0 five targeted `node --test` suites passed (`5/5`), exercising clean/finding/invalid/truncated/oversized cases and CLI exits 0/1/2. These are *standalone Node tests of the new summarizer*, not repository-wide tests or a professional independent audit.
- **Executed locally** against the GitHub artifact's exact `report.log`: `node scripts/audit/mythril-evidence.mjs report.log` reported **5/5 targets, 10 open, 3 Medium / 7 Low**, correctly returned exit `1` (expected gate-safe behavior). Input SHA256 was verified against artifact metadata. No live EVM, Mythril rerun, real wallet, browser, paid agent or fund transaction.
- Actual GitHub checkout/dependency execution restricted; verify **published exact final branch head** through GitHub-hosted CI and a distinct independent reviewer; do not equate local artifact parser testing with Mythril itself or source provenance beyond checked metadata.
- Positional target association assumes the checked-in five-contract Mythril runner order; never use this summary to infer that arbitrary unrelated five reports establish real target coverage. Authenticity and tamper-proofing still depend on source-pinned CI artifact provenance.
- The same unresolved security issues may overlap earlier strict c993 analyzer findings, but a full finding/bytecode equivalence review was **not** performed.

## Consolidation, blockers and handoff

- Repository `main` unchanged at `eb59d93cffed7848c4aac37d0e9650b87239c6da`. Lock `automation/ghostpay-integration-lock` remains HELD, generation 11, owner `994a0d214fb9-root-r3`, ref head `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`; **expiry is not takeover authority**. No shared ledger update, protected ref update, main merge, release, deployment or gate bypass.
- Parent recovery #372 separately failed Tor browser assertion at `scripts/tor/browser-acceptance.mjs:81`; that existing failure has an independently hosted green **stacked child [#436](https://github.com/djshellshoxxx/GhostPay/pull/436)** at `cbf6edbb5471dd085c233fdf0b8c35c6e4fc3362`, Tor run [44979372627](https://github.com/djshellshoxxx/GhostPay/actions/runs/44979372627). Do not duplicate or treat the child as qualification of the separate parent Mythril failure. Harness owner #363 retains review claim.
- Existing #463 OP Stack correction at `149300330d59642e1e97b76231ac1bea3200a973` has five successful exact-head workflow groups, including [CI 45013872920](https://github.com/djshellshoxxx/GhostPay/actions/runs/45013872920), but only COMMENTED feedback, no independent APPROVED review; do not merge solely for CI.
- Existing #466 is independently developing comprehensive branch-tree provenance scanning. Keep this Mythril artifact triage distinct. Existing #455/#372 own P0 fund recovery and expiry, #380 owns authoritative shared consolidation ledger; leave all untouched.
- Next worker: run exact-head focused Node tests and CI for this branch, independently review parsing and positional-source assumptions, then pursue confidential finding-specific Mythril/contract clearance with existing owners. Do not downgrade or suppress any unresolved finding. Reconcile integration lock/deployment gates before any shared merge.
