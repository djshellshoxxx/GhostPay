# GhostPay Pages multipart QR Unicode-integrity repair — 2026-11-19

## Identity and source pins
- Cycle: `20261119T124337Z`; one ChatGPT assistant, sequential discovery/implementation/source-audit/documentation. **No independent concurrent worker, external security auditor, or verifier participated**.
- Base main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`, after merged audit PR #266. Source blob on main: `apps/web/src/lib/qrMultipart.ts` = `48032d32ea18fa660ac72c342263d741ceb7cc0d`.
- Branch: `automation/20261119T124337Z/bug/qr-utf8-surrogate-guard`; ownership recorded in `docs/ai/ACTIVE_WORK.md` at claim commit `fd898e789edad627b2b3cd79b479195193da55a6`.
- Test-first commit: `7aa413efc8c164d0e55912e2904ed5a34c4b3b41`.
- Implementation commit: `223e7eb9544bf297b1926f3be1cc41c25c7d7094`; source blob `d8c9a8cc2d6eb90f1a6a45fe463a6f8e7ab1abb3`.
- Test error-type assertion refinement: `f58a30e3d7a28a0198c9a640b7159af2693a4f1c`; test blob `45992f537d1f226dd20e57d96a246c6f18419395`.
- No changes to payment, cryptographic keys, transaction construction, signature formats, QR wire encoding for valid strings, APIs, dependencies, workflows, contracts, network policy, main or release settings.

## Reproduced defect and fix
`toMultipart` previously passed arbitrary JS text directly to `TextEncoder`. An unpaired UTF-16 surrogate is replaced by U+FFFD: for `\\uD800` the bytes become `efbfbd`, and decoding the QR returns changed text. `makeQr` already rejects malformed surrogate code points, so single and multipart paths had inconsistent integrity. The fix rejects `/\\p{Cs}/u` with fixed-message `QrExchangeError('BAD_INPUT')` before encoding. `multipartIfNeeded` inherits that fail-closed path. Valid surrogate pairs remain accepted and unchanged.

Added regression cases for lone high/low surrogates and strings containing them, both public helpers, a `QrExchangeError` type assertion, and a valid astral-pair transfer control. The test was added before the production fix; its failure on the repository baseline is inferred from source and the standalone encoding reproduction, **not** claimed as an executed baseline Vitest run.

## Executed validation (do not overstate)
Ran Node v22.16.0 standalone checks in the local container: four malformed strings each confirmed to change under baseline `TextEncoder` and match the new codepoint guard, and four normal strings each confirmed to bypass the guard and round-trip unchanged: **16/16 standalone assertions passed** (0 failures). This validates JavaScript Unicode semantics, not the imported package, React page, or the committed Vitest suite.

The repository cannot be cloned in this container: `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` exited with `Could not resolve host: github.com`. Repository Vitest, TypeScript workspace typecheck, ESLint, browser E2E, static build and full GitHub Actions CI **were not executed locally**. Require GitHub-hosted exact-head CI and an independent verifier before integration.

## Sequential audit phase (not independent)
Source-pinned coverage selection: FNV-1a32 hash of `c977b5d6723f6822c3b5d86cd6b231712c53c395|bdd43ff933f2e458e121575e64cbf24c06204d68|rotation209|apps/web/src/lib/displayText.ts,apps/web/src/lib/fragment.ts,apps/web/src/lib/qrKinds.ts,apps/web/src/lib/qrPayload.ts,apps/web/src/lib/transactionOutcome.ts` yielded **1853723019**, index **4/5**, choosing `apps/web/src/lib/transactionOutcome.ts`, blob `375636b65ab3f9548dd06cce0dde98a94bf4b447`. Inspected structured phase/reference output, error-message descriptors, approval hash vs broadcast ambiguity, wallet RPC code sanitization, callers `payExec.ts`/`wallet.ts`, and `transactionOutcome.test.ts`. **No new reproducible defect established. Tests inspected, not executed.** Existing strict Mythril findings from PR #255 remain open; this is not security clearance. Coordinator should rotate this audit into the shared ledger after acquiring integration ownership.

## Consolidation, CI, lock and Wiki
- Bounded changed-path checks of approximately 30 active PRs including #238, #246, #262, #264, #270, #274, #278 found no ownership overlap for `qrMultipart.ts` or `qrMultipart.test.ts`. This is not a complete 67-PR ancestry or file-equivalence audit. Preserve all other authors' branches.
- Latest observed main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`; metadata lock ref `6408563f55081ee941c2036086c025ebf63d2c96`, released generation 3, owned previously by another coordinator. No shared lock acquired, no integration or main merge attempted.
- Existing PR #258's four hosted validation workflow runs all completed successfully at its head, but draft/current-main/deployment/review gates remain; PR #261 CI queued; #265 and #268 CI queued; #274 has no reported exact-head hosted run; broad #278 workflows mostly queued. Do not equate scoped passes with release approval.
- On current main, version-controlled `docs/wiki/Home.md` and `docs/wiki/_Sidebar.md` link separate User Guide and Developer Guide. Live Wiki publication was not checked or changed.
- `.github/workflows/pages.yml` identifies `workflow_dispatch` with `deploy=true` for the deployment job; no merge or deploy was undertaken. Recheck complete workflows and settings before any future main integration.

## Next actions
1. Publish a draft PR from this branch; inspect its exact-head workflows and relevant failed job logs.
2. Run `apps/web/src/lib/qrMultipart.test.ts` in a real repository checkout, then typed lint, web typecheck and Pages/browser gates; independently verify malformed-input fail-closed behavior and valid UTF-8 QR compatibility.
3. Coordinator to reconcile release and security gates, update existing `docs/automation/` PR #261 ledger only under valid lock ownership, and integrate only when target SHA/CI/review/deployment restrictions are all satisfied.
4. Preserve incomplete queues #261/#265/#268/#274 and broad ownership. No releases, deployment, real funds, force pushes, paid APIs, Codex, or separate coding agents occurred.
