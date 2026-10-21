# Spec: search-filter: Search, filter and multi-tag for payments
Impact 3/5 | Effort S | Score 3 | Build wave 1 | Depends on: local-store

## Problem
Payments are an unsorted memory list; tags are one free-text label (Scan.tsx:205-227) with no search.

## Exists today (verified in repo) vs missing
- apps/web/src/views/Scan.tsx:154-238 Matches list; 240-324 Tags list.
- apps/web/src/lib/tags.ts TagPayload single clientLabel/notes.
- Missing: everything described under Design.

## Design
Pure query engine over ledger rows: free-text (case/NFC-folded) on label/note/tags, filters (chain, token, status, amount range, date range, swept/unswept), sort, tag set (<=10 tags each <=32 chars). Query is a typed object (no string DSL eval). Text search runs in memory after unlock (no index stored in plaintext).

## Privacy and security impact
No plaintext index persisted; searching decrypted rows in memory only.

## Build ownership
- NEW package: `packages/ledger-query` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/ledger-query`.
- Public API (exports from `src/index.ts`):
- `query(rows: LedgerRow[], q: Query): LedgerRow[]`
- `normalizeTag(s): string`
- `facets(rows): {tags; tokens; chains}`
- `compareBy(field, dir)`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Scan.tsx (filter bar above Matches)
- Add `@ghostpay/ledger-query` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **SEARC-1** MUST Filtering never mutates rows.
2. **SEARC-2** MUST NFC + case-fold search (é matches e + combining accent).
3. **SEARC-3** MUST Amount range uses bigint compare.
4. **SEARC-4** MUST Query object validated; unknown fields ignored safely.
5. **SEARC-5** SHOULD Debounced input; result count announced in live region.

## Acceptance tests
1. **T-1** Tag "Café" found by "cafe\u0301".
2. **T-2** Range [1,10) excludes 10.
3. **T-3** Stable sort preserves input order for ties.
4. **T-4** 10k rows query < 50 ms.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
