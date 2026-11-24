# GhostPay beta first-increment implementation plan

> For agentic workers: use the available native implementation workflow or `superpowers:executing-plans`; execute test-first and retain command evidence. Do not assume a subagent was dispatched.

**Goal:** advance GP-B12 by making a checksum-consistent empty release archive fail verification.

**Architecture:** repair the existing Bash verifier and extend its existing Node built-in regression suite. No new verifier, dependency, workflow, runtime/payment code or release authority.

**Tech stack:** repository Node >=22, node:test, Bash, tar and existing hash tools.

**Spec:** [accelerated beta design](../specs/2026-11-09-accelerated-beta-design.md).

## Global constraints

- Base: #93 at `3cd1e5544391bad61c943ffab9e5c432d80ea1ee`; isolated branch `gpt/ghostpay-beta-spec-20261109`.
- Preserve #91/#92 sibling work and the #84 Sonar gate. No merge, deployment, funded transaction, paid agent dispatch or network/trust enablement.
- Do not change package manifests/lockfiles, contracts, shared QR/CLI libraries or workflow files.
- Hash consistency is not artifact authenticity or beta approval.

## Review focus

- Empty but correctly hashed `.tar.gz`: nonzero verification result, never success.
- Ordinary valid archive: existing commit/hash checks still pass.
- Corrupt archive with matching outer checksum: archive-read failure remains nonzero.
- Nonempty archive without `index.html`: remains nonzero.
- Missing manifest reader / wrong commit: existing negative controls remain effective.

## Task 1: reject the empty-archive bypass

Files: modify `scripts/verify-release.sh` and `scripts/tests/verify-release.test.mjs`.

Interface: the existing four-argument shell command and exit codes remain unchanged. The empty-listing branch must call `bad "archive is empty"`; no extra dependency or automatic extraction.

- [ ] Run `node --test scripts/tests/verify-release.test.mjs` on the unchanged source and record the baseline.
- [ ] Add an empty tar fixture, recompute both SHA256SUMS and manifest digest, invoke the real verifier and assert exit 1 plus no `RESULT: hash checks passed`.
- [ ] Add corrupt-archive and nonempty/missing-index controls with corresponding hashes; preserve all existing tests.
- [ ] Run the expanded suite before the patch. The empty-archive assertion must fail because the original verifier exits 0, not because a tool or fixture is missing.
- [ ] Add only the missing empty-listing failure branch to the existing archive-sanity block.
- [ ] Run the expanded suite, `bash -n scripts/verify-release.sh`, `node --check scripts/tests/verify-release.test.mjs` and `git diff --check`.
- [ ] Review the diff and publish the patch as a draft stacked on #93, preserving other branch owners.

## Task 2: integration qualification and handoff

- [ ] In a full checkout with the repository toolchain, run library build, typecheck, lint, workspace/contract/browser suites and release/reproducibility checks as required by the spec. The focused script suite is not a substitute.
- [ ] Record exact source/test provenance, environment, commands, counts, unrun checks and parent blockers in the PR. Refresh CI at the resulting commit.
- [ ] Keep the PR draft until independent review and required candidate checks pass. A merge is a separate authorized action.

## Execution record

At plan creation: source files were fetched from the pinned GitHub commit and their Git blob hashes matched the remote blobs. The existing four verifier tests pass locally. This environment has Node 22.16.0, Bash 5.2.37 and GNU tar 1.35. Direct GitHub clone/download is unavailable from the execution container; a source subset is not a full checkout. Full application/contract/browser qualification remains unrun here. Subsequent executed results belong in the PR, not inferred from these unchecked steps.
