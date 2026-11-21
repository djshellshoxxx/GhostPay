# Independent source review: receipt archive identity recovery

**Decision: approve the bounded recovery. No blocking findings in the reviewed source.**

This report records independent read-only source and test inspection. The reviewer ran no tests, typecheck, lint, build or browser journeys. Author/coordinator execution evidence remains separate.

## Exact source

- Repository: `djshellshoxxx/GhostPay`.
- Reviewer: `/root/backup_independent_review_r2`.
- Reviewed at UTC: `2026-11-20T19:04:33.165611+00:00`.
- Current candidate base: PR #333, `3172a93ceb8fce5a4343a93b453dcc0e68f09d87`, tree `2b91fe95c2eec65c0359dc627af400b7d1756b44`.
- Recovered donor: PR #332, `71632fa389ae93824b2f42d265278a9bd0f6de59`.
- Tests-only checkpoint: `0bbe400ec804f250f21f056117e31aca77191367`, tree `778df982e98dcd45f17885d87da1610b9b33d36d`.
- Reviewed runtime: `06c17144d3839f5a093dec3ed9041374fb2de79e`, tree `7ae1d27c8d1f70df765763165a215e06fcf1acf9`.
- Runtime blob: `e056b485f4dbaab5ac9fdc1af78349a8e633b516`.
- Runtime parent is the tests-only checkpoint; worktree was clean.

## Findings and rationale

### Receipt identity owns presentation status

The component now advances its archive-completion generation and resets per-receipt status when invoice binding is invalidated, when a new invoice load is accepted, and after a new receipt is successfully signed. Both the existing success and rejection handlers already compare their captured generation. After A is replaced by B, A's late success therefore cannot mark B archived, and A's late rejection cannot show an archive error for B.

A completed A write no longer leaves a newly signed B with the old disabled `Receipt archived` button. The signed receipt passed to the asynchronous archive path is still the original lexical receipt value; a later render cannot substitute B into A's write. Receipt signatures, JSON, binding checks, consent, lean-profile restrictions and archive-record formats are unchanged.

### Pending writes keep their own lifetime

The synchronous `archiveWriteInFlight` ref is acquired before vault creation is awaited. It prevents another archive handler from starting even before React renders disabled controls. The separate `archivePending` state reflects that lifetime in the UI. Neither is reset when receipt presentation state is invalidated or match/signer props change. A new receipt can be displayed while A is still pending, but its archive control remains unavailable until A settles.

The outer `finally` releases the pending ref on success or rejection, including when the generation has become stale. It updates pending UI only while mounted. Because that ref prohibits a second write until this finalizer runs, an old finalizer cannot release a concurrently acquired write from the same instance. Current-generation failures retain their existing retry and localized error behavior. The existing inner `finally` still locks every successfully created vault, including on archive failure.

This is explicitly serialization within a mounted panel. It does not introduce a cross-panel or cross-tab queue. An unmounted panel's generation is advanced by the existing cleanup; its late completion cannot publish UI status, and a remounted component has separate refs. An already-issued immutable archive operation may settle; the patch does not promise to roll it back.

### Existing authority and print behavior are preserved

The recovery changes only `ReceiptPanel.tsx` at runtime: 21 insertions and two deletions. Independent in-memory comparison confirms that removing the four current print-target adaptations and normalizing the scope-clarifying comment yields the donor component byte-for-byte. The current `usePrintTarget` import, hook call, article ref and print handler all remain intact.

I inspected the existing reconciliation factory's captured session guard, the portable vault's guarded state and compare-and-swap write path, and Scan's session-change subscriber that clears matches. None are changed. Existing idle/session revocation, receipt creation authority, storage conflict checks, and the vault-locking path continue to own their original responsibilities. The patch does not derive authority from a stale receipt or from an archive success label.

Independent blob comparisons also confirm that original receipt/archive/invoice/profile/locale tests, print hook/tests/styles, PrintableBill, session helpers, reconciliation helpers, Scan, Sweep, SellerKeys, AppShell, dependency metadata and web configuration match the base.

## Tests and RED evidence inspected

The exact donor regeneration file is retained at blob `a43a5e9e5e5c073ce96b58d001aaea6237ad879f`. Its two cases use real receipt signing and verify that A and B have valid, distinct signatures; they check the writer receives A and B separately, B becomes archivable after completed A, a held A write prevents B from starting, and A's late success cannot mark B archived.

The supplemental rejected-A/B regression was committed before runtime changes at blob `d6ba6e2be79ca95560bf4f394fd57e0fda48ba03`. It checks the corresponding error branch: while A is held, B cannot start; after A rejects, the old vault is locked, B has neither a stale error nor archived status, and a subsequent B write succeeds. This adds direct failure-path coverage while preserving the donor tests unchanged.

I inspected the author's completed RED report on `0bbe400ec804f250f21f056117e31aca77191367`: **13 tests, ten passing existing controls, three expected behavioral failures, zero skips**. The failures are completed-A status retained on B, delayed-A success falsely marking B archived, and delayed-A rejection leaving an error on B. Existing archive controls (four cases) and ReceiptPanel controls (six cases, including selected-receipt printing) all passed. No assertion weakening or test exclusion is part of this recovery.

The vault writer is deliberately mocked in these component regressions so completion order is deterministic. Receipt signatures are real; cryptographic persistence and browser execution are not inferred from the component tests. GREEN qualification must be recorded separately for the reviewed source.

## Static checks and remaining evidence

`git diff --check 3172a93ceb8fce5a4343a93b453dcc0e68f09d87 06c17144d3839f5a093dec3ed9041374fb2de79e` exited 0. The runtime commit changes exactly one path, and the source-integrity proof was independently recomputed rather than accepted from the author report alone. Exact protected blobs, RED artifact hashes and the comparison proof are recorded in the adjacent JSON.

This source approval supports running the unchanged focused and web gates. It is not a browser, full-web, hosted-CI, release or merge approval. Those outcomes require their own exact-source execution evidence.
