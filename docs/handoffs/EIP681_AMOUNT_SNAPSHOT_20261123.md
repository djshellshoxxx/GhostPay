# GhostPay — EIP-681 amount validation snapshot (2026-11-23 UTC)

## Scope and exact source
- Coordinator: `20261123T0635Z-root`; one sequential implementation/audit/checkpoint cycle; no native subordinate agent and no independent review claimed.
- Target: static GitHub Pages browser beta only; no external service, custodian, key management, signing, network, contract, workflow, release or deployment changes.
- Exact main base `eb59d93cffed7848c4aac37d0e9650b87239c6da`, rechecked before this handoff.
- Task branch `automation/20261123T0635Z/bug/eip681-amount-snapshot`. Ownership claim commit `645bd1263a9610a951334b02e314a79acc1b370d`. Regression-first commit `bb55bba762d05680e95a29eb1fb44cbbdc4b78cd`. Product correction `54e8ac0f09c7009a6342976e7982db74dec151a4`.
- Product file `packages/payment-uri/src/eip681.ts` baseline blob `b347505b3a581ec4de83eea415f86c3f65a9349d`, verified repaired blob `70e0e08e63779775eb0add1a400ee21a59c10016`. New focused `packages/payment-uri/src/eip681.amount-snapshot.test.ts`. No other production files changed.

## Finding GP-PURI-EIP681-SNAPSHOT-01 — P2 correctness hardening
- Baseline builders `buildEip681Native` and `buildEip681Erc20` call `checkUint(p.value/amount, true)` and then read the same caller-owned property more than once. With a changing accessor, a positive checked bigint can be replaced with zero/negative during URI serialization. The resulting URI conflicts with the parser's nonzero amount contract and can misstate the intended amount. Exploitability is conditional on caller-supplied getter-backed objects; no web input path, live payment, or funds impact was established.
- Repair: capture the optional amount into a local constant exactly once, validate it with unchanged `checkUint`, and serialize only the validated snapshot. No change to unsigned transaction construction, signing, privacy, remote requests, or fee policy.
- Regression added before implementation: two changing-accessor cases, one ordinary/omitted-amount case, and invalid initial value cases for both native/ERC20 builders.

## Executed bounded checks
- Local runtime `node --version`: `v22.16.0`.
- `git ls-remote https://github.com/djshellshoxxx/GhostPay.git refs/heads/main` failed because `github.com` DNS did not resolve. No original-dependency local checkout or Vitest execution took place.
- Executed `node /tmp/ghostpay_eip681_check.cjs` against manually transcribed, source-equivalent builder expressions (not imported repository modules). Both original functions emitted unchecked amounts (`?value=0`, `&uint256=-1`) after initially validating `5n` and `7n` (three getter reads). The corrected expressions used the original checked bigint with one getter read each; four baseline/repaired assertions passed in this standalone harness.
- Connected GitHub retrieved and inspected exact updated product source and blob `70e0e08e63779775eb0add1a400ee21a59c10016`. Actual package Vitest, TypeScript typecheck, strict lint, build, browser and full-profile security qualification must come from exact-head hosted CI. No independent verification completed.

## Bounded integration and security review
- Relevant existing PRs #370, #379, #360, #313 and #496 were inspected by changed-file list. Their payment-uri changes are `query.ts`, `decimal.ts` and `eip3770.ts`, not the owned `eip681.ts` or new test. Broad PRs #278 and #293 also do not edit the owned file; #278 does edit older payment-uri tests. This does not represent full historical branch semantic analysis. Keep all source branches.
- The root lock branch `automation/ghostpay-integration-lock` contains `integration-lock.json` with `status=held`, generation 11, owner `994a0d214fb9-root-r3`; lock file blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`. Expiry is not authority for takeover. No protected integration update or main merge.
- `.github/workflows/pages.yml` limits publication to explicit `workflow_dispatch` with `deploy=true` on main. Pull requests perform validation only; no publish triggered. Security policy requires private reporting of real vulnerabilities and external release audit. Previously reported 10 Mythril findings (3 Medium, 7 Low) retain unresolved disposition; not re-run or cleared here.
- The shared `docs/automation/` folder does not exist on current main. Existing `docs/ai/` and `docs/handoffs/` are preserved. No competing master ledger was created without integration-lock ownership.

## Durable continuation
1. Open a draft PR for the isolated branch; inspect exact head and Core CI, Pages, Beta and applicable other workflows. Repair genuine failures only on an isolated owned follow-up, keeping regression evidence.
2. Independently inspect exact source and regression tests, check that validated amounts match parser round trips, and verify no consumer depends on repeated getter reads. Do not fabricate a reviewer approval.
3. Require current target/source SHAs, protected gate status, independent approval and legitimate integration-lock ownership before any main integration. If unavailable, leave draft unmerged.
4. Continue unclaimed beta work, source-pinned consolidation and prior P0 recovery / key export, expiry and Mythril clearance through their existing owners. No policy selection without owner approval.

No production deployment, release, real-funds operation, force-push, branch deletion, contract edits or bypassed security gates occurred.
