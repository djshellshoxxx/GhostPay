# Merchant dashboard and accounting completion — 2026-11-25 UTC

Worker: Claude Code session `brave-meitner-974y9e` (merchant dashboard and accounting only).
Branch: `nodata/brave-meitner-974y9e`. Base: main `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`.

## Existing work: disposition

| PR / branch | Head | State | Disposition |
|---|---|---|---|
| #322 `future/f04-merchant-dashboard` | `066731b4` | open draft | Superseded. Projection/select/model blobs carried (copied) into #535; not an ancestor of main or this branch. |
| #371 `consolidate/ghostpay-dormant-modules-1f782-20261121` | `1de6e024` | open draft | Dormant F04/F05/F10 base. Being landed by #621 (another worker); not consumed here to stay in scope. |
| #397 `feat/f04-deliberate-local-export-20261121` | `a9f19eb2` | open draft | Superseded: `export.ts` blob carried into #535. |
| #460 `feat/f04-evidence-analytics-20261122` | `ff60e1e4` | open draft | Superseded: `analytics.ts` blobs carried into #535. |
| #522 merchant-ledger duplicate invoice IDs | `907838ef` | **merged** 2026-11-24 (also `finish/merchant-ledger-completion-20261124`, `qualification/merchant-ledger-522-current-main`) | Done; `packages/merchant-ledger` untouched here. |
| #535 `feat/f04-pages-dashboard-20261123` | `e16bd876` | open draft | Resumed. Ancestor of this branch. |
| #543 `fix/f04-dashboard-refresh-focus` | `3085c87a` | branch | Resumed (refresh focus). Ancestor. |
| #564 `ui/merchant-dashboard-records` | `37a714cf` | branch | Resumed (record filters, empty states). Ancestor. |
| #579 `feat/f04-dashboard-totals-qualification` | `6366767f` | open draft | Resumed (exact per-asset totals). Ancestor. |
| #618 `automation/20261124T1037Z/bug/dashboard-idb-rejection` | `e564360a` | open draft | Resumed tip (fixture lint). Ancestor; merged with `--no-ff` into current main. |
| #621 `claude/nifty-bohr-5ra2ap-dormant-371` | `98065511` | open draft, other worker | Not modified. See dependency note below. |

The chain #535 → #543 → #564 → #579 → #618 was linear and 541 commits behind main. It merged with only additive conflicts
(security key groups, the exhaustive key test, `docs/ai/ACTIVE_WORK.md`), resolved by union.

## Changes on this branch

- **Restricted-file revert.** #535 changed `apps/web/src/lib/reconciliationVault.ts` (+ its IndexedDB test) to add an
  in-transaction export release. That file is reconciliation/vault code owned by other workers, so it is restored to main's
  version. `features/future/merchant-dashboard/release.ts` now rechecks the ledger through the existing
  `createCurrentReconciliationVault().readState()` interface before any file is released.
- **Asset filter** alongside network, date, status, search and sort; included in "Clear filters".
- **Report for this view** (`report.ts`, `MerchantDashboardReport.tsx`): invoice and payment status counts, exact per-asset expected
  totals, verified-at-scan payment totals, the part locally linked to a registered invoice of the same asset, and the count of
  excluded (imported, reorged, conflicting) observations. BigInt only; malformed amounts fail closed with an alert.
- **Payment history CSV export**: explicit disclosure, preview with counts, one approval, formula neutralization, authenticated
  ledger recheck before download; revoked by any filter change, refresh, lock or session change.
- Responsive CSS for the report; long totals wrap at 320px.

## Dependencies on other workers (requests, not implemented here)

1. Reconciliation owner (durable payment recovery and reconciliation, e.g. #635): an atomic read-only release API on
   `reconciliationVault.ts` (IndexedDB transaction that checks the exact ciphertext while invoking a synchronous callback) would let
   both exports close the residual cross-tab window documented in `apps/web/DEVIATIONS.md`.
2. Reconciliation owner: P03 canonical-settlement evidence and independent invoice binding. Until then the dashboard says
   "Verified revenue is unavailable" and totals are labelled verified at scan time.
3. #621 owner: the dashboard imports `features/future/merchant-dashboard/` from production. When #621 lands after this branch it must
   drop `merchant-dashboard` from `scripts/tests/future-module-isolation.test.mjs` and keep main's newer `model.ts`/`index.ts`.
4. Backup/key restoration worker: none. The dashboard only links to the existing Scan and receive backup path.

## Verification

See the PR body for exact commands and outcomes on the final head. Hosted CI is the qualification gate.

## 2026-11-26 update: dormant merge

- Owner decision (AGENTS.md, docs/ai/STOP_WORK_20261125.md): merge F04 dormant. It is wired only into the full-profile
  `src/App.tsx` behind `VITE_MERCHANT_DASHBOARD=1`; `AppShell`/`AppLean` match main and the lean guard still rejects F04.
- Reconciled with main `9d92472a`: one verified live observation per transaction (#716), neutral download names (#286),
  pending/unverified evidence statuses (excluded from totals; see the review below).
- Fuzz, stress, browser QA and the AI-assisted security/bug review with dispositions:
  `docs/audits/F04_MERCHANT_DASHBOARD_REVIEW_20261126.md`.
- Integration hold: a consolidation coordinator asked on #636 to reconcile the owner decision before merge, and holds
  integration lock generation 48. Do not merge over that hold or without the lock.
