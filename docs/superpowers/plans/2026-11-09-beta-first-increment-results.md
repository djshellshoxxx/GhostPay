# GhostPay beta first increment: execution record

Plan: [first increment](2026-11-09-beta-first-increment.md).
Specification: [accelerated beta](../specs/2026-11-09-accelerated-beta-design.md).
Date: 2026-11-09 owner-local session; final verification after 2026-11-10 01:00 UTC.

## Delivered

- Committed the full staged completion specification, including GP-B01 through GP-B15, beta scope, acceptance journeys, parallel ownership, dependency order and later feature milestones.
- Reproduced an existing release-verifier defect: a valid empty `.tar.gz` whose digest matches both SHA256SUMS and the manifest exits successfully because the archive-sanity block is skipped for an empty listing.
- Added the missing failure branch in `scripts/verify-release.sh`: `bad "archive is empty"`.
- Extended the existing suite from four to seven tests. Empty, corrupt and missing-index fixtures have matching outer hashes, so the tests exercise archive checks rather than accidental checksum failures.

The focused repair advances GP-B12 only. It does not establish artifact authenticity, successful public deployment or beta readiness.

## Source and ownership

Base: PR #93, `3cd1e5544391bad61c943ffab9e5c432d80ea1ee`.
Branch: `gpt/ghostpay-beta-spec-20261109`.
Implementation head before this documentation: `701cd73d821c42b233a198ebb382f65795ffc597`.

Tested file identities (Git blob SHA-1, for source correspondence, not an authenticity claim):

| File | Original | Tested/published |
| --- | --- | --- |
| `scripts/verify-release.sh` | `2d159c21b961f50391e7514e619f9f3899af3f46` | `a12da4fdbfa8cc3cce6fe3237839a2766d1d602b` |
| `scripts/tests/verify-release.test.mjs` | `eaf6ad0f32a4c9e3125af36daf1b3d18780c0e88` | `02a347598a99e6ce99e95e0eda614b7be76cc9af` |

The existing CLI/merchant/payment branches remain untouched. No package manifest, lockfile, dependency, contract, workflow, deployment manifest or trust-root change was made.

## Executed verification

Environment: Linux, Node 22.16.0, Bash 5.2.37, GNU tar 1.35. The execution container could not clone/download GitHub. Exact retrieved source files were reconstructed in an isolated source-subset workspace, and Git blob identities were compared with the connector's source/published metadata. This is not a complete repository checkout.

| Check | Actual result |
| --- | --- |
| Original `node --test scripts/tests/verify-release.test.mjs` | 4 passed, 0 failed, 0 skipped |
| Expanded suite against original verifier | 6 passed, 1 failed: empty archive incorrectly returned exit 0 |
| Expanded suite after repair, final repeat | 7 passed, 0 failed, 0 skipped |
| `bash -n scripts/verify-release.sh` | Passed |
| `node --check scripts/tests/verify-release.test.mjs` | Passed |
| `git diff --check` in source-subset workspace | Passed |
| `npm test` attempt | Could not execute project suites: `No workspaces found!` in the source subset |

Retained session log SHA256 values:
- Baseline: `3bc5a92bc1d5ae05560d4343bee20dea5c0bec7f6127ac1d538411ef3b828a75`.
- RED: `dd969ee37e6c3fd3caff335607551a530ee6ea697569722965e53ae8a5ad9f0e`.
- Final GREEN: `95b8ff9fe291601a230093b98161266724187bf4f891043f4b50aa52077c6128`.

These identify locally retained logs, not an external execution attestation. The npm workspace failure is an environment/source-availability limitation, not a demonstrated application regression.

## Plan status and remaining gates

Task 1 source change, baseline, RED/GREEN, syntax checks and publication of tested files are complete. Draft PR creation is the next publication step. Task 2 remains open: full repository build/typecheck/lint/workspace/contract/browser/reproducibility qualification on the resulting candidate, plus independent review. The plan's initial unchecked boxes are superseded by this explicit execution record for completed steps only.

Self-review covered the narrow diff and retained valid/corrupt/missing-index/wrong-commit/no-reader behavior. No independent reviewer was available or dispatched. Do not mark this PR ready or merge it based only on this report.

The parent #84 Sonar blocker and #91/#92/#93 integration requirements remain unchanged. No main merge, release, hosting update, deployment, funded transaction or paid development-agent workflow was performed. Next product milestone remains a consolidated and independently qualified EVM invoice -> payment -> scan -> sweep journey under the specification.
