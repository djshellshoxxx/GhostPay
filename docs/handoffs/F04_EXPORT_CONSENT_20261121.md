# F04 private merchant exports — isolated implementation and handoff (2026-11-21)

## Exact inputs and ownership

- This branch extends dormant module consolidation PR #371 at `1de6e0247e0f76afe6f1615b43e55007ece25d9b` without modifying the earlier F04 projection, F05 or F10 implementations.
- Baseline main at discovery: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned files: new `apps/web/src/features/future/merchant-dashboard/export.ts`, `export.test.ts`, and an additive export from that directory's `index.ts`.
- The main-integration lock documented on PR #371 is held by the prior generation-11 owner. This branch must not acquire it or merge into main merely because a deadline expires.

## Implemented slice

`DashboardExportCoordinator` provides local, session-scoped export preparation and one-shot approval for a pre-existing, immutable `DashboardProjection`. The component creates no file, network request, signed transaction, address or automatic transfer.

- Preview exposes only selected column names, output format, selected row count, unverified scan-coverage designation and a disclosure warning. It does not reveal invoice aliases or amounts.
- Approval accepts only the exact preview object in the same coordinator instance and consumes the approval before doing serialization, including on failure.
- Abort, session epoch, operation ID, profile and canonical revision checks guard both preview and release. A locked UI **must** call `cancel()` and discard any previously returned bytes; this module cannot revoke bytes previously handed to a caller.
- Selection rejects unknown invoices, duplicate invoice IDs, unsupported columns, duplicate columns, malformed/sparse arrays, accessor-backed frozen row arrays (without invoking their getters) and unexpected root fields.
- CSV protects formula-leading cells even after common leading whitespace/invisible characters; quoting retains double quotes and CRLF. Isolated UTF-16 surrogates are rejected rather than silently changed during UTF-8 export; valid pairs survive. JSON exports use an explicit version, `atomic` unit marker and `not-evaluated` scan-coverage marker.
- Exportable amount columns require explicit `chainId`, `assetId` and `state` columns in the same user-selected output; separate asset amounts are never summed or converted. Monetary strings are not converted to JavaScript numbers.
- Maximum output is 20 MiB measured by UTF-8 byte length. No new dependencies, browser imports or route activation.

The coordinator assumes a trusted, locally built projection and a trusted `DashboardContext`; it does not verify blockchain transactions, authenticate imported files or enforce a human click without the eventual UI. The UI must call `approve()` solely following an explicit merchant action. In particular, the preview-object identity is an in-process replay guard, **not** a cryptographic signature.

## Verification and limitations

- Before source implementation, a local Node test failed because the export module was absent (RED).
- Local Node 22.16.0, TypeScript 5.8.3, isolated stub of the existing F04 context helper, and the new actual `export.ts` implementation: standalone strict TS compilation exited 0; **eight local Node tests passed, zero failed** after repair. Local harness exercised exact string amounts, malformed selections, formulas/CSV quoting, preview replay, cancellation/session drift and byte cap.
- Two additional regressions failed before the second repair (accessor invocation and lossy UTF-16) and passed after it. The local tests used a stand-in `model.ts` and type-only projection scaffolding, not the real repository installation. They **do not** establish a full GhostPay test pass.
- The committed `export.test.ts` contains eight Vitest cases, including one that creates a real unverified projection with `buildDashboardProjection`. These Vitest cases, repository lint, whole-web typecheck, coverage, build, CodeQL, browser, mobile and hosted CI are **not locally executed or claimed as passing** here.
- A second, separate security review remains required; this same coordinator's review is not independent.
- No payment, private key, merchant journal or live-network behavior was exercised. No deployment occurred.

## Remaining F04 milestones

1. Integrate approved P03 canonical chain evidence and P05 encrypted, transactional storage with revision/coordinated cross-tab invalidation.
2. Build a private responsive dashboard, invoice/payment history, accessible filters, explicit export-column preview and user-controlled download callback.
3. Complete encryption, backup/recovery, crash consistency, reorg/finality behavior, chain-specific reporting and localization.
4. Run real-browser lock/export/repair/restore tests and mobile/Safari accessibility checks; verify the exact source head's CI, review and ownership gates.
5. Merge only through the qualified integration owner after explicit release of the held lock. This PR is a dormant partial implementation, not a complete F04 or approved beta activation.
