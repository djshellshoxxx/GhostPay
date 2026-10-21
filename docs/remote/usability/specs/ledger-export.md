# Spec: ledger-export: CSV / accounting export
Impact 4/5 | Effort S | Score 4 | Build wave 1 | Depends on: local-store

## Problem
Sellers cannot get payments into a spreadsheet or accounting tool; the only exports are the keystore and a payer JSON receipt.

## Exists today (verified in repo) vs missing
- apps/web/src/components/Common.tsx:63-76 downloadText (local Blob download).
- apps/web/src/lib/payExec.ts:142-160 buildReceipt (payer side JSON only).
- No CSV code (grep "csv" in apps/web/src: 0 hits).
- Missing: everything described under Design.

## Design
Pure formatter from ledger rows to CSV (RFC 4180) with presets: generic, Xero-style, QuickBooks-style, plain "date,chain,asset,gross,fee,net,tx/announcement,invoice label,tag,note". Amounts are decimal strings from bigint (formatUnits), never floats; fiat column only when a fiat value was recorded at receipt time (see fiat-display). Formula-injection guard: cells starting with = + - @ tab or CR are prefixed with a single quote.

## Privacy and security impact
Export contains amounts and one-time addresses: confirm dialog + header comment row is NOT added (keeps CSV clean); file is local only. Option "omit addresses" on by default.

## Build ownership
- NEW package: `packages/ledger-export` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/ledger-export`.
- Public API (exports from `src/index.ts`):
- `toCsv(rows: LedgerRow[], opts: {preset; omitAddresses: boolean; locale?: "invariant"}): string`
- `csvEscape(cell: string): string`
- `PRESETS`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Scan.tsx (Export button next to matches) or new Ledger view
- apps/web/src/components/Common.tsx (reuse downloadText)
- Add `@ghostpay/ledger-export` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **LEDGE-1** MUST Cells beginning with = + - @ \t \r are neutralised (OWASP CSV injection).
2. **LEDGE-2** MUST Fields with comma, quote or newline are quoted and quotes doubled.
3. **LEDGE-3** MUST Decimal amounts exact for 18-decimal bigints (no Number conversion).
4. **LEDGE-4** MUST Output uses CRLF and UTF-8 with no BOM unless requested.
5. **LEDGE-5** MUST Empty ledger -> header only.
6. **LEDGE-6** SHOULD Date column ISO-8601 UTC (reuse formatUnix style).
7. **LEDGE-7** SHOULD Deterministic row order (block, logIndex).

## Acceptance tests
1. **T-1** Label "=HYPERLINK(...)" exports as "'=HYPERLINK(...)".
2. **T-2** Amount 123456789012345678901n at 18 dp exports "123.456789012345678901".
3. **T-3** Round trip through a CSV parser preserves commas/quotes/newlines in notes.
4. **T-4** omitAddresses=true -> no 0x40-hex substring.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
