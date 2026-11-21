# GP-BUG-13 — TRON scan abort boundary repair (2026-11-20)

## Source, task and ownership

- Repository: `djshellshoxxx/GhostPay`
- Base: main `aa3df1cb37274fae73af0ca957183c15c51b62d3`
- Branch: `automation/20261120T1635Z/bug/tron-scan-abort`
- Claimed paths: `packages/tron-adapter/src/scan.ts`, `packages/tron-adapter/src/scan.cancellation.test.ts`, this handoff, and additive `docs/ai/ACTIVE_WORK.md`.
- Ownership claim: `a5c936e0ec18c624f93e2e3a092cf222efd24f68`
- Tests committed before source: `b7f9d6440cb83c11792b343197c4f223db03f34a`
- Production fix: `c31525fce87eba819c380a8aef0c45555fbb5d9e`
- Finding: GP-BUG-13 / MC-01 in draft audit #312. The original bugcheck reproduced a second buffered native payment after abort on both pinned main and integration. No testnet wallet or network was involved.

## Change

`scanTron` now checks abort state after the optional head read, after each page request, at each block and buffered transaction boundary, after awaited TRC-20 receipt confirmation, before each payment yield, and at normal termination. It throws the established typed `ABORTED` code instead of emitting buffered payments after cancellation. Existing candidate parsing, transfer-log verification, trust flags, pagination, and key operations are unchanged.

Three new deterministic Vitest cases use a local mock RPC and synthetic transactions from the real payment builder to assert:
1. Two native matching payments in one buffered block; abort after first yield prevents the second.
2. A delayed page read resolved after cancellation cannot yield data.
3. A delayed TRC-20 receipt read resolved after cancellation cannot yield a confirmed payment.

## Validation and constraints

- Previous audit #312 executed an ordinary red reproduction on the original implementation; this cycle did **not** rerun that original worktree.
- The connector fetched live main, source, tests, instructions, active claims and relevant PRs; no local repository checkout was possible because `git ls-remote` failed with `Could not resolve host: github.com`. The local system has Node 22 but no full installed repository dependency graph. The newly committed Vitest tests, lint, typecheck, full build and browser suites are **not yet executed by this cycle**.
- GitHub Pages workflow `.github/workflows/pages.yml` was inspected: `pull_request` is validation-only; deployment requires a separate explicit main-only manual dispatch with `deploy=true`. No deployment is requested.
- No independent verifier was available in this invocation; self-review is not independent approval.
- Current integration metadata lock was held at generation 8 by another coordinator; this task did not modify or acquire it. PR #307's source file inventory did not contain this production module. #278/#262/#264 own the pre-existing `scan.test.ts` while this repair adds a separate test file.
- No contract, fee, fee policy, account custody, dependency, RPC endpoint, production workflow, or release setting was changed.

## Follow-up

Inspect exact PR-head hosted CI, fix any **reproducible** test/lint/typecheck errors without weakening assertions, obtain independent source and test review, reconcile relevant newer `scan.test.ts` tests from #278 without overwriting their owners, and let the integration coordinator handle any main merge after lock, review, CI and deployment gates pass. Preserve original source branches and the open conditional Mythril findings. The separate current main at the next invocation must be refreshed; this record is source-pinned, not a live-status claim.
