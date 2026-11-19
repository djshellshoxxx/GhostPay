# Fee-charging Factory safeguards — 2026-11-19 UTC

## Scope and source

This task recovers the existing N1 / SEC-E2-01 deployment-policy requirement from
[PR #217](https://github.com/djshellshoxxx/GhostPay/pull/217), source
`9e5cc3789b7b8a3c550ed2680304ab6245ec6676`, onto PR #238 source
`198aa5baff22272453733a0f3dcfcac0e0994eec`. The source PR remains unchanged.
The worktree branch is `chatgpt/ghostpay-policy-guard-20261119`.

The seven original deployment-policy paths were selectively applied, retaining
the surrounding candidate files. No contract runtime, fee recipient, fee amount
policy, analyzer policy, custody mechanism or deployment authorization changes.
`packages/contracts/src` remains Git tree
`dabfd36a98424a4184ee7e267e12815763d1157f`; the vendored `lib` tree remains
`b10191d543360a5c102e269cca72883b4303d8c7`.

## Recovered behavior and new regression

- `DeployPolicy` rejects nonzero `FLAT_FEE` unless `FEE_TOKEN_FREEZE_ACK` names the
  configured token and passes the existing EIP-55 parser, before `startBroadcast`.
- Zero-fee deployment needs no acknowledgement. Existing token, recipient, chain
  and maximum-fee checks remain enforced.
- The offline helper mirrors the token binding. A confirmed defect in the
  historical helper was corrected: shell command substitution removed a trailing
  newline from the acknowledgement before comparison. The helper now validates
  the exact address shape first, so it cannot report success for that malformed
  input while the Solidity parser rejects it.
- The 22 offline policy tests use an isolated environment without an RPC URL,
  signer, dry-run switch or shell startup file. They exercise nonzero/zero and
  leading-zero fees, values beyond 64 bits, missing/mismatched/malformed
  acknowledgement, a changed token, and invalid token/fee/cap conditions.
- Independent coordinator review found no blocking security issue and identified
  a misleading diagnostic: invalid or missing fees were already rejected but
  additionally printed the new zero-fee message. Three regression cases failed
  before correction and pass after restricting that message to actual all-zero
  numeric fees.

The acknowledgement is an operator statement about the selected token. It does
not prove token immutability, remove the fee-token freeze risk, or approve any
deployment. The N1 owner decision remains open before production scheme 2.

## Verification

Tool versions: Node `24.22.3`; Forge `1.8.5`, commit
`51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`; solc
`0.8.28+commit.7893614a.Linux.g++`. Compiler SHA-256
`9a0fb7e0db2c0641dbae1c5cc645dc686820c83af516226abb1c0a2f76636f25`
matches `.github/actions/setup-forge/action.yml`. The existing compiler and Forge
binaries were used without installing or changing project dependencies.

| Command / source | Actual result |
|---|---|
| `node --test scripts/tests/policy-predeploy.test.mjs`, candidate baseline | 11 passed, 11 failed; missing and malformed acknowledgements were incorrectly accepted |
| Same command after the exact historical #217 patch | 21 passed, 1 failed; trailing-newline acknowledgement was incorrectly accepted |
| Same command after exact address-shape validation | 22 passed, 0 failed, 0 skipped |
| Same command after the independent diagnostic review | RED 19 passed / 3 failed; final GREEN 22 passed / 0 failed / 0 skipped |
| `node --test scripts/tests/policy-predeploy.test.mjs scripts/tests/ghostpay-automation-hardening.test.mjs scripts/tests/mythril-runner.test.mjs scripts/tests/contract-analysis-workflow.test.mjs` | 68 passed, 0 failed, 0 skipped |
| `forge test --offline --match-contract 'DeployPolicyTest\|DeployChecksumTest'` with the pinned compiler | 5 passed, 0 failed, 0 skipped; both updated gas entries match their recorded values |
| `forge test --offline` | Blocked during compilation: solc received SIGKILL; no full-suite pass is claimed |
| `forge snapshot --offline --check --no-match-test 'testFuzz\|invariant'` | Passed: 445 tests, 0 failed, 0 skipped, all recorded gas entries match; this excludes fuzz/invariant cases |
| `forge fmt --check --root packages/contracts` | Passed |
| `bash -n packages/contracts/scripts/pre-deploy-check.sh`; `git diff --check`; `bash scripts/scan-secrets.sh` | Passed |

An initial NatSpec invocation lacked Forge on PATH;
after supplying the pinned PATH, a redundant full build was interrupted while
snapshot compilation was active. Neither attempt is a NatSpec pass.
No test assertion, fuzz budget, coverage threshold or analyzer gate was relaxed.
The coordinator's independent source review found no blocking security issue;
the reported diagnostic was corrected and rechecked. The coordinator owns
combined validation and integration. No repeated full-suite compiler attempt was
made after SIGKILL; the successful snapshot result does not cover those omitted
fuzz/invariant tests.

Runtime/script source hashes before the handoff commit:

| File | SHA-256 |
|---|---|
| `packages/contracts/script/DeployPolicy.s.sol` | `3f9677478e27bf4f9ecb0f3d4b150fda0169ca446b54b29fd45135043804a880` |
| `packages/contracts/scripts/pre-deploy-check.sh` | `4376adcb54742c2e98bb6a4fa18d2235a59f31e006a53de6124e6b21b1e790be` |
| `scripts/tests/policy-predeploy.test.mjs` | `849a6de87949309fd88c74a45fc4c61f4c6934f9a6d922c4b842b5de19dd03c5` |

## Current Mythril evidence and separate blockers

The existing hosted run was freshly downloaded and parsed during this task;
this is not a new local analyzer campaign. [Run 44342340082, Mythril job
134935409285](https://github.com/djshellshoxxx/GhostPay/actions/runs/44342340082/job/134935409285)
analyzed requested/checkout commit `198aa5baff22272453733a0f3dcfcac0e0994eec` with
pinned Mythril `0.24.8` and solc `0.8.28`, and failed with runner exit 1.
[Artifact 14462654594](https://github.com/djshellshoxxx/GhostPay/actions/runs/44342340082/artifacts/14462654594)
contains the full 283,168-byte report, untruncated, with SHA-256
`ce72f158a9d7d3bff3f6a2dafa2fde390cafcb5cf79364d4980f0c7cb3a6de00`.
ZIP SHA-256 is `5db3cf9ffd6feaf74b1e7c50ca96f97591d0731a9ba975614ffcaa7b7474dff3`.

All five JSON reports have `success: true` and `error: null`. There are **11
findings: three medium and eight low**. Router and PolicyRouter report no findings.
The failing gate is finding-based, not an analyzer installation or process error.

| Group | SWC / program counters | Current disposition boundary |
|---|---|---|
| Sweep expiry | 116 / 785 | Existing expiry counterevidence; strict gate remains failed |
| PolicyAccount expiry | 116 / 1876, 5077 | Existing expiry counterevidence; strict gate remains failed |
| Factory/model clone | 110 / 30 | Existing model-artifact counterevidence; strict gate remains failed |
| Factory call/state paths | 107 / 999, 1170, 2887, 2978 | Existing guarded-call and immutable-target counterevidence; strict gate remains failed |
| Factory availability | 113 / 1668, 1781 | Fail-closed token reads; conditional token freeze risk remains |
| Factory fee waiver | 104 / 2978 | Existing checked-return/waiver evidence; strict gate remains failed |

This inventory differs from the prior main report retained in the #238 completion
packet: that report omitted PC1781 and added SWC113 at PC999. Equal totals do not
establish identical findings. Preserve both source-pinned records and review any
future delta. The strict gate and unwired disposition helper remain unchanged;
no suppression or finding-specific approval was introduced.

PR #225's helper and test are already byte-identical in #238 and need no duplicate
implementation. The no-copy confidential-router ETH-forward defense from #220
is absent in #238 and was referred to the coordinator as a separate recovery task.
The latent unsigned payer-proof design (D-1) and breaking policy-signature changes
(A-1/A-2) remain separate design/owner decisions.
