# Independent security-tooling review — 2026-11-18

Reviewer: `ci_qualification`, independent of the implementation author.

Reviewed committed delta: `dfc75ef2087fa6463ae59e0818abec01796c578d` to
`fce8d96d0e18f79a437f20a801a6dd4aa9a8cfc6` in the `security-tooling` worktree.
The unrelated uncommitted RPC, Unicode and deployment-validator changes were outside this review.
The reviewed implementation/test files matched their committed bytes when the tests ran.

## Result

No introduced blocker found within the standalone Mythril disposition helper, static audit server,
agent workflow input/path hardening and cached compiler integrity check. This result does not authorize
connecting dispositions to an analyzer/release gate or claim any new analyzer or browser execution.

* The Mythril helper rejects abnormal runner errors, unusable reports, unmatched issues, changed source/bytecode
  hashes and changed compiler/analyzer pins. It remains unwired. Its comments explicitly acknowledge that raw
  report counts do not prove per-target coverage/provenance. Owner approval is a reference field, not authenticated
  authorization. A future gate integration needs independently bound target/process evidence and an approval design.
* The static server checks lexical and resolved path containment, refuses escaping file/directory symlinks, and
  returns bounded failure responses for invalid URLs or filesystem failures. It remains a loopback audit helper.
* All three cloud agent path-policy copies deny the additional build/analyzer/trust-root paths consistently.
  Parallel-review inventory now contains same-repository PR numbers and commit hashes without PR free text.
* The added compiler digest matches the official Linux amd64 solc 0.8.28+commit.7893614a release metadata:
  `9a0fb7e0db2c0641dbae1c5cc645dc686820c83af516226abb1c0a2f76636f25`.
  Primary source: https://binaries.soliditylang.org/linux-amd64/list.json, independently retrieved 2026-11-18.
* `.github/workflows/release.yml`, `.github/workflows/contract-analysis.yml` and
  `packages/contracts/scripts/run-mythril.sh` are unchanged from the base. The changed automation files preserve
  action pins, runner versions, trigger conditions, permissions and existing release/analyzer gates.

## Independently executed checks

From the `security-tooling` worktree, using Node v24.22.1:

```sh
node --test --test-concurrency=1 \
  scripts/tests/mythril-disposition-check.test.mjs \
  docs/audits/poc/static-server.test.mjs \
  scripts/tests/ghostpay-automation-hardening.test.mjs \
  scripts/tests/ghostpay-parallel-review-workflow.test.mjs
```

Exit 0: **48 passed, 0 failed, 0 skipped**. Log: `independent-security-tooling-tests.log`.

```sh
node --test --test-concurrency=1 \
  scripts/tests/contract-analysis-workflow.test.mjs \
  scripts/tests/mythril-runner.test.mjs
```

Exit 0: **26 passed, 0 failed, 0 skipped**. Log: `independent-security-gates.log`.

The imported Mythril audit is explicitly labelled historical evidence. Its older scan results have not been
reclassified as current execution. Existing Mythril failures, full dependency-audit high findings and browser
environment limitations retain their separate qualification status.
