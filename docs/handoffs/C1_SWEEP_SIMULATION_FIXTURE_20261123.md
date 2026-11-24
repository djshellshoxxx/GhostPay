# C1 Sweep simulation-fixture regression — 2026-11-23 UTC

## Identity, dependencies and scope

- Cycle / worker: `20261123T1637Z`; one coordinator performing sequential audit, fix, and self-review. No native subordinate agent or independent verification occurred.
- Branch: `automation/20261123T1637Z/bug/c1-sweep-simulation-fixture`; base: draft PR [#512](https://github.com/djshellshoxxx/GhostPay/pull/512) exact head `2a6914c2a036856c939f746a88a3b6dc761860d7`, stacked on [#510](https://github.com/djshellshoxxx/GhostPay/pull/510) and [#504](https://github.com/djshellshoxxx/GhostPay/pull/504).
- Default main observed `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Existing unrelated C1 owner branches and PRs were not changed.
- Claim commit: `5d88ff8187b40d069db2ed7902cf1cf4a0a0972e`. Test fixture and regression commit: `25cbb04dc07e9e4123dd73b44497ff3401b8d7e9`, test blob `94ea2335843dc92a2840253fef7496cbf045a8bf`.
- Owned source: **only** `apps/web/src/views/Sweep.test.tsx`; additive `docs/ai/ACTIVE_WORK.md` ownership note and this handoff. No production source, security policy, contracts, key handling, services, workflow, guards or dependency changes.

## Reproduction / root cause

**Finding C1-UNIT-SWEEP-01 — Medium test/merge blocker, high-confidence deterministic source explanation; not a confirmed production vulnerability.**

Hosted exact-head [#512 Core CI 45198050599](https://github.com/djshellshoxxx/GhostPay/actions/runs/45198050599), source `2a6914c2`, failed only `ts-test (web)` (job [137773795613](https://github.com/djshellshoxxx/GhostPay/actions/runs/45198050599/job/137773795613)). Vitest: **2,950 passed, 1 failed, 1 skipped**. The failure was `Sweep.test.tsx:784`: "B-R6: an unknown outcome after a dry run that did run shows no skipped-dry-run warning." The UI correctly displayed the skipped warning, contrary to the test's stated precondition.

Source trace at this exact head: `apps/web/src/views/Sweep.test.tsx` `extra()` handled `eth_call` selectors `balanceOf`, `name`, `nonces`, the oracle and `nonceUsed`, but a successful ERC-20 `transfer` selector (`0xa9059cbb`) fell through to `eip712DomainSeparator`, a nonzero 32-byte hash instead of ABI `bool true`. Actual `apps/web/src/lib/txGuard.ts` `simulateCall()` deliberately treats anything but exact 0/1 as unavailable when `expectBool` is true. `directSweep()` carries this `simulation: 'unavailable'` through `DirectSweepOutcomeUnknownError`; the UI truthfully warns even when `sendFail` is the only intended fault. The mock's success response, not the warning logic, is defective.

Source of truth for the relevant preexisting regression: `apps/web/src/views/Sweep.test.tsx` B-R6; earlier positive path B-R6 (`dryRunBlind: true`) must still show a warning. Altering the warning, accepting malformed token returns, or deleting/loosening the failing assertion is **not** the repair.

## Exact fix

- Import `erc20Abi` alongside existing mocked ABI helpers.
- After the existing explicit `dryRunBlind` error, answer transfer `eth_call` with `encodeFunctionResult({ abi: erc20Abi, functionName: 'transfer', result: true })`; no change to the typed production simulation guard.
- Add a focused fixture regression asserting ABI bool-true word `0x` plus 63 zeros and `1`, and the unsupported `eth_call` still raises `-32601`.
- Preserve the real B-R6 warning/no-warning assertions and additionally verify the uncertain-outcome path actually hands off `eth_sendRawTransaction`.

## Actual verification and limits

- Read source-pinned GitHub blobs for `Sweep.test.tsx`, `Sweep.tsx`, `lib/sweep.ts`, `lib/txGuard.ts`, `abi/erc20.ts`, and relevant workflows; retrieved original hosted failure logs.
- After commit, fetched the new exact test blob `94ea2335843dc92a2840253fef7496cbf045a8bf` from GitHub. Verified the error branch stays ahead of the canonical success branch, and malformed-return simulation guard remains untouched. GitHub comparison to parent before this handoff showed **two commits ahead, zero behind**, exactly the claimed test and tracking files.
- **Not executed locally:** repository Vitest, typecheck, lint, browser suites, build, security tools; environment does not have a checked-out repository and prior local GitHub DNS failures are known. This source review/static check is not a passing repository test, an independent approval, or a released fix. The new PR's exact-head hosted jobs are authoritative once completed.
- At the parent #512 source, full/lean Playwright jobs, Pages artifact/anvil acceptance and Beta acceptance succeeded, but the web-unit failure made Core CI aggregate red. Parent remains draft. The new branch must run all exact-head gates again before integration.

## Lock, consolidation and next work

- Durable integration metadata: `automation/ghostpay-integration-lock` head `082e754f44944ebb4be283f89176b966bf8f7b4f`, `integration-lock.json` generation **12**, status **released**. This cycle did **not** acquire the atomic lock. A released state alone does not authorize a shared branch merge. Never overwrite C1 coordinator source.
- Dependency: #504 → #510 (focus test) → #512 (RPC CSS subgrid) → this isolated child. Do not merge #504 until this child is approved and integrated by its actual coordinator after current-source checks; #504's 93-PR census is not an exhaustive analysis of all historic branches.
- Existing strict Mythril record: 10 outstanding previous findings (3 Medium, 7 Low), not independently resolved here. Do not treat this fixture repair as security clearance. No new confidential security finding was filed.
- Next: inspect this child PR's actual Core CI `ts-test (web)` result, both browser profiles and Pages/Beta runs; repair any new confirmed failures on a separately claimed branch, obtain genuinely independent review, then coordinate atomic integration ownership and deployment-safe triggers. Preserve original CI failures for provenance.
- No release, publication, real funds, key handling changes, deployment, tag, force-push or main/shared integration was performed.
