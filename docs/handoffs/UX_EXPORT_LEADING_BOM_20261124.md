# BUG-ONLY: CSV leading BOM field preservation — 2026-11-24

- Base main: `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`
- Task branch: `automation/20261124T1821Z/bug/ux-export-leading-bom`; claim `60d70020366f79d8f25140f9b612f06aa86437cc`.
- Regression-first commit `b2d0b7dafe46c7384e83efe396520edfbe46e609`; production repair `340fb3bcade98f7f52ad844c7a7e4adcfa67b9e9`.
- Original text.ts blob `8b20059e47f5b04153b367dfcbeefec7fcd439ac`; repaired blob `402bc68671e0b868ff5f3811ff82358e8c394512`; unchanged parser.ts blob `74c35df4a3a9bdeff1004b1ebc369d2ecb36f732`; committed regression blob `13a6851c96a76196d70b57b28138652b8a8a132c`.

## Observed failure and minimal repair

quoteField leaves a leading U+FEFF unquoted. When it occurs at the start of a document (e.g. an allowed custom column header in exportCsv without the optional file BOM), parseCsv consumes that literal character as the file BOM. This destroys the first field's exact text; parseLedgerCsv requires exact header labels. The low-level actual quoteField/parseCsv round trip loses one U+FEFF for each of three valid test cases. No current Pages UI custom-header reachability is asserted. Quote leading U+FEFF in quoteField, keeping the optional file BOM and normal CSV quoting unchanged. No changes to the encoder, parser, import contract or other owners' paths.

## Execution receipts

- Fetched exact source at base and verified Git blob SHA-1 for text.ts and parser.ts. Executed the actual quoteField, parseCsv, indexOfInvalidText and utf8Length bodies in V8, with TypeScript syntax erased and an error-class shim; no network or wallet calls.
- Executed the committed test bodies at the regression commit through a small assertion shim: 5/8 pass, 3/8 fail (leading BOM, BOM-only first field, doubled BOM).
- Repeated at production fix; recomputed all three Git blob hashes (source, parser, tests) and matched connector metadata. 8/8 pass. Generated strings of length 0–3 over eight text atoms (including literal BOM, comma, quote, LF, CR, accented letter and astral character), both explicit BOM modes: 1170/1170 pass.
- Ordinary, interior BOM, delimiter, quote and explicit BOM cases retained. This is **not** native Vitest, repository-wide testing, a full LedgerEncoder/parseLedgerCsv invocation or browser CI. Local Node v22.16.0/tsc 5.8.3 exist; git ls-remote failed to resolve github.com. No local repo tests claimed.

## Ownership and outstanding gates

All 240 open PR inventories checked; no text.ts or new test path conflicts. Encoder files owned by #616/#617 were not touched. Separate reconciliation candidate excluded because #220 owns reconcile.ts. Main and newest PRs rechecked before claim. Generation 20 lock released at `4fe0656517a03cb7a39d4e248187c76ffaa3238a`; not acquired. #390 already merged at `377c0216d451f1576f199ec0223aafadd9243002`, exact head five successful workflows and Snyk success, no recorded review submissions. #623, #626, #627 still draft; returned hosted workflow groups green, no review submissions. No genuine separate verifier available in this run.

Draft publication only. Require exact-head hosted package and workspace checks, applicable native browser verification, independent review, refreshed ownership/dependency census and legitimate integration lease before any merge. No deployment, release, dependency, fund, contract or feature changes.
