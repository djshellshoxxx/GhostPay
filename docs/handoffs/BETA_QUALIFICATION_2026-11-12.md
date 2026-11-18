# GhostPay beta integration qualification — 2026-11-12

## Source and scope

- Parent: PR #135 (`refs/pull/135/head` at branch creation).
- This branch is a non-destructive continuation of the combined beta candidate.
- The comparison to `main` reported 877 commits ahead and 0 behind. This is not a test result or an approval to merge.
- Source PRs #121, #115, #118, #128–#134 were recorded as integrated in #135's description. Confirm actual merge ancestry and exact head before closing any source PR.
- Do not deploy, enable real funds, or merge into `main` based solely on this document.

## Qualification gates (must be recorded against one exact commit SHA)

- [ ] Record current commit SHA and fresh CI, CLI, hosting and beta-acceptance workflow run URLs and conclusions. Rerun after any production change.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm test`, and relevant Foundry tests; record actual results, not previous branch results.
- [ ] Run `bash scripts/beta/acceptance.sh` for library, CLI and browser stages on a local Anvil chain; verify direct and relayer sweep, recovery, replay refusal, front-run/dust ordering and wrong-chain fail-closed behavior.
- [ ] Run QR camera tests using the full Chromium browser and verify the CI browser executable is available on runners.
- [ ] Check `forge snapshot --check`, `forge fmt --check`, release verifier tests, self-host selftest, proxy headers and pinned actions.
- [ ] Obtain the actual SonarCloud issue inventory for the inherited new-code security rating D (#84), remediate or disposition each issue, and verify the required exact-head gate. Do not treat an unavailable dashboard as a pass.
- [ ] Resolve AUD24-01: scheme-2 `GhostPayPolicyRouter` includes `policyHash` in calldata. Document the ABI/privacy decision, compatibility and regression tests. Scheme 2 is not deployed according to PR #135.
- [ ] Obtain independent security review of the final exact head, including chain contracts, relayer, local key custody, RPC privacy and recovery paths.
- [ ] Review release manifest, signing provenance, deployment documentation and owner acceptance; verify no real-funds deployment is implied by local tests.
- [ ] Review all source PRs for later commits not included in #135, including #122–#127 and documentation branches; record superseded status only after ancestry/diff verification.
- [ ] Require explicit owner approval before merging the consolidated candidate to `main`.

## Evidence currently reported by PR #135 (not re-executed here)

- Local typecheck and lint passed; release verifier 22/22; self-host and proxy checks passed; Foundry snapshot/format/NatSpec passed; camera tests 4/4 with full Chromium.
- Full workspace `npm test` and beta acceptance were described as in progress. Do not mark them passed without newer evidence.
- Previous #121 local acceptance covered library/CLI and browser journeys, but those runs do not qualify the final #135 head.

## Integration decision log

| Item | State | Required action |
| --- | --- | --- |
| #135 combined beta | Candidate | Exact-head tests and independent review |
| #129–#134 ports | Reported included in #135 | Verify ancestry and no subsequent source drift |
| #115 conflict resolution | Reported included in #135 | Recheck verifier, self-host, gas snapshot |
| AUD24-01 | Open | Owner ABI/privacy decision and tests |
| SonarCloud D | Open | Obtain issues and resolve gate |
| Deployment | Not claimed | Do not infer release readiness |

This document records gates and known evidence only; it is not a certification or test execution report.
