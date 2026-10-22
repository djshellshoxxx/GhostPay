# Wiring plan: ux-export in apps/web

No UI was added by this package. Proposed integration (names are suggestions; verify against the actual apps/web tree, not inspected here).

## Files
- `apps/web/src/features/export/ExportDialog.tsx`: column checklist, date format, BOM toggle ("Open in Excel"), period selector, Export / Export summary buttons.
- `apps/web/src/features/export/useLedgerExport.ts`: maps stored history to `LedgerRow` (bigint amounts, epoch ms), calls `csvChunks`, collects chunks into `Blob([...chunks], {type:'text/csv;charset=utf-8'})`, triggers download via an anchor with `download` + `URL.createObjectURL` (revoked afterwards). Everything local.
- `apps/web/src/features/export/ImportDialog.tsx`: file picker (`accept=".csv,text/csv"`), reads `file.text()` only after checking `file.size <= 16 MiB`, calls `parseLedgerCsv`, shows a preview (first 20 rows) and a count before committing.
- `apps/web/src/features/export/TaxSummaryTable.tsx`: renders `summarize` output, formats with `formatUnits`.

## State
- Local UI state: selected columns (default `DEFAULT_COLUMNS`), `dateFormat`, `bom`, `period`, status filter (default confirmed), date range, progress (rows emitted), error (`ExportError.code`).
- Persist column/format choice per device (localStorage, non-sensitive).
- Large exports: run in a Worker or iterate `csvChunksAsync` with `await` yields so the UI stays responsive; cancel = stop iterating.

## i18n keys
`export.title`, `export.columns`, `export.dateFormat.{iso,date,unix}`, `export.bom`, `export.bom.hint`, `export.period.{day,month,quarter,year,all}`, `export.action.{csv,summary,import}`, `export.privacy` ("File is created on this device; nothing is uploaded."), `export.warn.formulaGuard` ("Cells starting with = + - @ are prefixed with ' to protect spreadsheets."), `export.err.{LIMIT_ROWS,LIMIT_BYTES,INVALID_TEXT,PARSE_SYNTAX,PARSE_RAGGED,PARSE_HEADER,PARSE_VALUE,PARSE_DUPLICATE,LIMIT_FIELDS,LIMIT_FIELD_LENGTH,SUMMARY_MISMATCH}` with `{row}`/`{column}` placeholders, `export.import.preview`, `export.import.confirm`.

## Rules for the UI
- Never render CSV cells via HTML injection; show as text.
- Show error code + row/column only; do not echo file contents.
- Import must not auto-apply: preview, then explicit confirm; assetDecimals map comes from the wallet's known assets.
- Warn that exported files contain counterparties/memos (privacy) before saving to shared locations.

## E2E ideas
1. Seed 3 rows incl. memo `=HYPERLINK("x")`; export; assert file text has `'=HYPERLINK` and BOM when toggled.
2. Export then import the same file; preview count equals row count.
3. Import a file with `1e6` amount; expect PARSE_VALUE row/column message, nothing committed.
4. 1M-row seed with maxBytes small; expect LIMIT_BYTES message, no download.
5. Tax summary for a quarter equals sum of visible confirmed rows.
