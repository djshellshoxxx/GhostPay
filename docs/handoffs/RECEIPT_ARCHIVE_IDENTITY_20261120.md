# GP-BUG-01 / COMP-OPEN-01 — Receipt archive identity correction

Date: 2026-11-20 UTC. Cycle: `20261120T1840Z`. One assistant executed sequential discovery, bug implementation and source self-review; there were no native subordinate workers and no independent verification.

## Exact source / claim
- Base: `main` at `aa3df1cb37274fae73af0ca957183c15c51b62d3`; current main must be reread next run.
- Isolated branch: `automation/20261120T1840Z/bug/receipt-archive-identity`.
- Claim before edits: `98d157d1a9144a9a9fb2af3c99c89e9bcfa3e8cd`, in `docs/ai/ACTIVE_WORK.md`.
- Initial regression file: `8a37cf864f920eb2f7b4ecf4c4ec07123886e491`.
- Test hardening: `4e5ac927fc89f85bd6928f986c34f4a7d6414ed8`.
- Production fix: `8e8dbedec71106b4417eada0579aee1d342fa449`.
- Test: `apps/web/src/components/ReceiptPanel.archive.regeneration.test.tsx` (new; two deterministic cases).
- Runtime: `apps/web/src/components/ReceiptPanel.tsx` (existing; one-file narrow correction).

## Finding and behavior
Audit PR [#312](https://github.com/djshellshoxxx/GhostPay/pull/312), `docs/notes/bugcheck-2026-11-19/details/components.md`, independently recorded GP-BUG-01: after receipt A is archived, invalidating its invoice binding and signing a new receipt B leaves the archive button disabled and labeled `Receipt archived`, even though only A was written. A late completion for A can also mark B archived. Audit used a real signed invoice/receipt and a mocked vault writer; that baseline reproduction was not rerun in this isolated invocation.

The new tests use the existing repository's signed receipt and session helpers plus a mocked encrypted reconciliation vault. They assert that A/B have distinct valid signatures, B can be archived after a completed A write, the writer sees A and B separately, and a pending A write blocks B's archival until A settles. A's delayed completion cannot mark B archived. Tests were committed before runtime code.

The implementation resets per-receipt archive status and advances the completion generation when invoice binding is invalidated or reloaded and after a new receipt is signed. It preserves any already-issued vault write and the original error-handling paths. A synchronous in-flight ref and pending state prevent overlapping vault writes *within the same mounted panel*; after an old write settles, the new receipt becomes archivable. The implementation does not claim to serialize across unmounted panel instances or tabs. It changes no signature, receipt JSON, archive record, vault format or custody flow.

## Verification (not a release approval)
- Read live `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, `SECURITY.md`, ownership registry, audit #312, main `ReceiptPanel.tsx`, existing archive/invoice tests, current PRs and integration lock.
- Reviewed code/test source and GitHub connector update responses. The two new Vitest tests are **committed but unexecuted**; no Vitest, web typecheck, ESLint, full build, browser E2E, security analyzer or native verifier was run here.
- Local `git ls-remote` failed: `Could not resolve host: github.com`; no repository checkout or full dependency graph was available in the container. Hosted checks should verify the exact PR head.
- Current integration lock was `released` at generation 8, on metadata branch `automation/ghostpay-integration-lock`, commit `849b20733e6fd396a1ed354b284335019500946b`. This task did not acquire or modify it. No integration or main merge occurred.
- Pages workflow `.github/workflows/pages.yml` was inspected: PRs validate without publishing; deployment requires an explicit main-only workflow_dispatch with `deploy=true`.

## Dependencies and handoff
- The broader active [#307](https://github.com/djshellshoxxx/GhostPay/pull/307) has a different `ReceiptPanel.tsx` containing newer print-target behavior. **Do not overwrite #307** with this older base file. Coordinator must transplant only the receipt archive generation/serialization fix and its tests into the current candidate with a fresh diff and exact-head checks.
- Earlier [#278](https://github.com/djshellshoxxx/GhostPay/pull/278) still has strict Mythril and beta release gates outstanding; this focused patch does not clear any of them.
- Next independent reviewer: run `npm run build:libs`; `npm exec vitest run --workspace @ghostpay/web apps/web/src/components/ReceiptPanel.archive.regeneration.test.tsx apps/web/src/components/ReceiptPanel.archive.test.tsx` with the repository's supported Vitest invocation (adjust the workspace filter based on actual CLI), plus full `npm run typecheck -w @ghostpay/web`, `npm run lint -w @ghostpay/web`, and required web unit/browser/Pages workflows. Record exact exit codes and source hashes. Verify stale A completion, B enabling, secure vault write locking, match and seller change, and errors with a fresh reviewer. If a test/contract gate fails, repair without relaxing assertions or security controls.
- Do not label GP-BUG-01 resolved until independently verified and merged; current state is **implemented on isolated PR candidate, not verified, not merged**.
- No release, deployment, paid API, contract modification, production setting change, force-push, security waiver, real-funds operation, or source-branch deletion occurred.
