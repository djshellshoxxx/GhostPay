# Spec: Export (CSV export, strict import, tax summary)

Package: `packages/ux-export`. Pure logic; the UI supplies rows and saves the produced text/chunks locally.

## E1. CSV export of ledger rows
Requirements
- R1.1 Output follows RFC 4180: comma delimiter, CRLF records (LF optional), fields containing `,` `"` CR LF are quoted with `""` escaping, one header record.
- R1.2 A record with a single empty field is written `""` so it is never a blank line.
- R1.3 Columns are configurable (subset, order, custom header labels); duplicates/unknown keys rejected. Keys: id, timestamp, direction, chain, asset, decimals, amount, signed_amount, fee, counterparty, tx_hash, memo, status.
- R1.4 Optional UTF-8 BOM (`bom: true`) counted toward `maxBytes`.
- R1.5 Rows are runtime-validated (non-negative bigint <= 2^256-1, decimals 0..38, timestamp 0..9999-12-31, enums).
- R1.6 Control characters (other than TAB/CR/LF) and unpaired surrogates in text are rejected (`INVALID_TEXT`) or replaced by U+FFFD (`invalidText: 'replace'`).

Acceptance tests (export.test.ts): exact byte output for a two-row fixture; quoting of comma/quote/newline memo; single-column empty field; column subset+rename+BOM+LF; validation table; control char reject/replace.

## E2. Formula-injection neutralisation
- R2.1 Any text cell (including custom headers) whose first char is `=`, `+`, `-`, `@`, TAB or CR is prefixed with `'`.
- R2.2 Transform is bijective: a cell starting with apostrophes followed by a trigger char also gets a prefix, and import strips exactly one.
- R2.3 Numeric columns (timestamp, decimals, amount, signed_amount, fee) are generated only from validated numbers and are not prefixed, so negative `signed_amount` stays numeric.
Tests: text.test.ts (table + fast-check inverse + "never starts with trigger"), export.test.ts injection fixture, import.test.ts hostile round trip.

## E3. Exact amounts and dates
- R3.1 `formatUnits(bigint, decimals)` uses bigint arithmetic only; fixed fractional digits by default, `trimZeros` optional.
- R3.2 Dates are UTC: `iso` (`YYYY-MM-DDTHH:mm:ss.sssZ`), `date`, `unix` (seconds; `date`/`unix` are lossy).
- R3.3 `parseUnits`/`parseTimestamp` are strict: no sign/exponent/space/leading zeros/excess precision, no offsets, real calendar dates only.
Tests: amount-time.test.ts (vectors incl. 2^256-1 with 18 decimals, property round trip, rejection tables).

## E4. Tax-report summary
- R4.1 `summarize(rows, {period, statuses?, fromMs?, toMs?})` yields per (UTC period, asset): count, received, sent, fees, net = received - sent - fees, all bigint. Periods: day, month, quarter, year, all.
- R4.2 Default includes only `confirmed`; range is `[fromMs, toMs)`.
- R4.3 Deterministic ordering; independent of input order; same asset with different decimals => `SUMMARY_MISMATCH`.
- R4.4 `totalsPerAsset` collapses periods; `summaryToCsv` renders with the same quoting/guard/limits.
Tests: summary.test.ts (bucket boundaries at 23:59:59.999Z, > 2^53 sums, negative net, filters, mismatch).

## E5. Streaming and limits
- R5.1 `csvChunks` / `csvChunksAsync` yield strings of roughly `chunkChars`; concatenation equals `exportCsv`.
- R5.2 `maxRows` (default 1,000,000) and `maxBytes` (default 64 MiB, UTF-8) abort with `LIMIT_ROWS` / `LIMIT_BYTES`; the source is not consumed past the violating row.
Tests: export.test.ts "limits and streaming".

## E6. Strict parser and import
- R6.1 `parseCsv` accepts BOM, CRLF/LF, optional final newline; rejects bare CR, stray quotes, text after closing quote, unterminated quotes, blank lines, control chars, ragged rows (`assertRectangular`).
- R6.2 Limits: `maxBytes` 16 MiB, `maxRows` 100,001 (incl. header), `maxFields` 64, `maxFieldChars` 8192 (all configurable).
- R6.3 `parseLedgerCsv` requires exact header match with the configured columns; id/timestamp/asset + (amount & direction | signed_amount); decimals from column or `assetDecimals`; duplicate ids rejected; un-neutralises text; amounts must fit decimals exactly.
- R6.4 Errors expose code + 1-based row/column and never echo cell content.
Tests: parser.test.ts, import.test.ts (export -> import equality incl. fast-check over hostile text, header/shape/cell rejection tables, linear-time check).

## Known limits
- `date`/`unix` formats do not round-trip millisecond precision.
- `signed_amount`-only import cannot recover direction of a zero amount (defaults to `in`).
