# Mythril disposition checker process-failure review

## Scope and source

- Reviewed and repaired PR #212 at `4894d0d8d94333dffa8ae3937a4d8314f27c686f`.
- Task branch: `chatgpt/ghostpay-mythril-checker-failclosed-20261118`.
- Changed only the unwired checker, its tests, the work claim and this handoff.
- The production Mythril runner, workflows, contract sources and release policy remain unchanged.

## Finding: GP-MYTH-CHECK-01

Severity: medium if the proposed helper were used as a release gate; latent while it remains unwired.

The checker parsed JSON analysis documents but ignored the production runner's error annotations. A clean-looking
`success: true, error: null, issues: []` document followed by an explicit `(rc=137)` failure returned `ok: true` when
the disposition file's other inputs matched. A source-matched finding disposition cannot justify an analyzer crash.
The existing production runner correctly rejects that input; the defect was confined to the proposed helper.

The correction permits a runner error annotation only for Mythril's ordinary exit 1 after a valid, nonempty issue
report. Other exits, failure after an empty report, malformed errors, unassociated errors and duplicate annotations
fail with `RUNNER_ERROR`. The helper stays disconnected from CI and release gates.

## Verification

Environment: Linux, Node.js v24.22.1. Synthetic analysis fixtures only; these are checker/runner control-flow tests,
not a new Mythril symbolic-analysis run.

1. Standalone reproduction of a clean-looking document followed by `(rc=137)` returned `ok: true`; the rejection
   assertion failed with exit 1.
2. Added regressions before the fix:
   `node --test scripts/tests/mythril-disposition-check.test.mjs` — 11 passed, 2 failed, 0 skipped.
3. After the fix:
   `node --test scripts/tests/mythril-disposition-check.test.mjs scripts/tests/mythril-runner.test.mjs scripts/tests/contract-analysis-workflow.test.mjs`
   — 39 passed, 0 failed, 0 skipped.
4. `git diff --check` passed.

The expanded regression cases cover runner exits 0, 2, 126, 127, 137 and 143 associated with an error annotation;
exit 1 after an empty report; malformed/unassociated/duplicate error annotations; and the existing valid disposition
control. The unchanged runner suite also rejects malformed, missing, duplicated and failed analyzer outputs.

## Remaining gate prerequisite: analysis identity and provenance

The current raw runner output does not label clean documents with their target contract. Two correctly analyzed
contracts can return identical clean JSON. Document count therefore cannot establish that each intended target ran
once: substituting one clean result for a missing target is indistinguishable from valid output to this helper.

No coverage claim is made. Before any future gate integration, bind each expected target, compiler input, process
outcome and complete report to source-matched retained evidence. Reject absent, duplicated and out-of-scope targets,
truncated evidence and provenance mismatches. Keep the ordinary runner failure in force until that evidence format
and finding-specific owner approvals have been reviewed. This task does not approve or enable dispositions.

## Other independent review results

- PR #206 at `c487f0fe649e24a1e89f1f8fd0d82e90a3441c62`: no blocking source finding. Its only CI change appends the
  agent tooling tests to the existing script-test command. `node --test scripts/agent/*.test.mjs` passed 12/12 with
  zero skips. Local affected-check selection is expressly not a replacement for full CI.
- PR #127 source and regression-test blobs exactly match main `5467c158069c5bab264b6a653ac56e89e13f3e13`:
  `b6a18547cd19ec2c4a624e4d08cc55393fd359e3` and `ab67eea47a034bc7d4e3cd95f5864b75b8bafc4f`.
- PR #42's two handoff blobs also exactly match that main:
  `702a4b0618ea0e9fc8f281d1b22cc73f9ffae375` and `338f05ab0131d696a0209e5be0978badec3cad8f`.
- PR #220 at `16c48521f99903ccd2e584df5d00a9dec5ef754c` retains the red Mythril gate. The exact-head hosted
  [Mythril job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44267960327/job/134677092580) ran Mythril 0.24.8
  and exited 1. The production contracts are unchanged; the PR's archived 10/11 historical-record reproduction is
  prior-run evidence, not a rerun performed by this reviewer.
- PR #217 at `9e5cc3789b7b8a3c550ed2680304ab6245ec6676` adds a fee-token acknowledgement to deployment tooling.
  It does not remove the immutable factory's fee-token freeze risk. Its exact-head
  [Mythril job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44262336982/job/134658439275) also exited 1.

No external mutations, deployments, releases, real-funds transactions or release-qualification claims were made
by this review worker. Integration and current-head CI verification belong to the coordinator.
