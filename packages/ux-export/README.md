# @ghostpay/ux-export

Pure, offline CSV export and strict import of payment-history rows. No DOM, network, timers or deps.

```ts
import { exportCsv, csvChunks, parseLedgerCsv, summarize, summaryToCsv } from '@ghostpay/ux-export';

const csv = exportCsv(rows, { bom: true, dateFormat: 'iso', columns: ['id', 'timestamp', 'asset', 'amount'] });
for (const chunk of csvChunks(rows, { maxBytes: 8 << 20 })) sink(chunk); // streaming
const back = parseLedgerCsv(csv, { columns: [...] });                    // strict round trip
const lines = summarize(rows, { period: 'quarter' });                    // bigint totals per asset/period
const report = summaryToCsv(lines);
```

- RFC 4180 quoting, CRLF (or LF), optional UTF-8 BOM (Excel).
- Formula guard: text cells starting with `= + - @ TAB CR` get a leading `'` (reversible on import). Numeric cells come only from bigint/number formatting.
- Amounts: exact decimal from bigint base units (fixed or trimmed fractional digits); import rejects excess precision, signs, exponents, > uint256.
- Dates: UTC only (`iso`, `date`, `unix`); import accepts `Z` timestamps only.
- Limits: `maxRows`, `maxBytes`, `chunkChars` on export; `maxBytes`, `maxRows`, `maxFields`, `maxFieldChars` on parse.
- Control characters / lone surrogates are rejected (or replaced with `invalidText: 'replace'`).

Docs: docs/remote/usability/specs/export.md, wiring/ux-export.md, audit-ux-export.md.
