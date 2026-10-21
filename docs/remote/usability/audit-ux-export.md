# Audit: ux-export

## Scope and threat model
Assets: user's payment history privacy; integrity of exported numbers; safety of the user's spreadsheet/host when opening exports; safety of the app when importing files.
Adversaries: (a) counterparty or chain data supplying hostile memo/labels/ids (formula injection, control chars); (b) malicious or malformed CSV chosen for import (resource exhaustion, parser differentials, value smuggling); (c) buggy callers passing out-of-range values.
Out of scope: UI rendering, file saving, storage, encryption of exports at rest.

## Findings
| # | Sev | Finding | Evidence | Status |
|---|-----|---------|----------|--------|
| 1 | High (mitigated) | Formula injection through text cells and custom headers | `neutralizeFormula` applied to every text cell/header; tests in text.test.ts, export.test.ts | Fixed by design |
| 2 | Medium (mitigated) | Naive neutralisation is not reversible (`'=x` vs `=x` collide on import) | Bijective guard; fast-check inverse + round-trip property | Fixed |
| 3 | Medium (mitigated) | Float math would corrupt amounts | bigint-only; 2^256-1 vectors; sums > 2^53 test | Fixed |
| 4 | Medium (mitigated) | Resource exhaustion on import (size, rows, fields, long fields, quote-heavy input) | Limits enforced before/while scanning; 400k-char quote test < 2 s | Fixed |
| 5 | Medium (mitigated) | Unbounded export | maxRows/maxBytes checked per row, source not over-consumed | Fixed |
| 6 | Low | Control chars / lone surrogates in text (terminal escapes, broken UTF-8) | Rejected by default on export and parse; optional replace | Fixed |
| 7 | Low | Mixed decimals for one asset silently mis-summed | `SUMMARY_MISMATCH` | Fixed |
| 8 | Low | Error messages leaking cell contents | Static messages + positions; asserted in tests | Fixed |
| 9 | Info | Numeric columns are not guarded, so a negative `signed_amount` stays numeric | Values only from bigint formatting; documented | Accepted |
| 10 | Info | Leading-apostrophe display: some tools show the `'` | Inherent to OWASP mitigation | Accepted |

## Unverified / residual
- Not opened in real Excel, LibreOffice or Google Sheets; guard effectiveness rests on the OWASP-documented behaviour. Leading-space or Unicode look-alike (e.g. fullwidth `=`) triggers are not guarded; believed non-executable but unverified.
- DDE-style payloads that do not start with a trigger char are not a concern for CSV but were not tested in an app.
- `date`/`unix` formats are lossy (documented). Zero-amount direction is not recoverable from `signed_amount` alone.
- Parser holds the whole text in memory (bounded by maxBytes); true streaming parse is not implemented.
- Export byte accounting counts lone surrogates as 3 bytes; with default policy they are rejected anyway.
- Branch coverage gaps are defensive branches only.
