# GhostPay — merchant CSV formula-prefix normalization (2026-11-21)

## Provenance
- Branch: `chatgpt/ghostpay-csv-leading-whitespace-20261121`, initial `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Claim committed before implementation: `fb9a739229d7f73223c597c2923fc4bce8745f21`.
- Regression-first source: `82cfd9960ea6c8f0f8f660a457dce9aef1ee29ca`.
- Production correction: `64471f2df8761c29b64ecde23302c096ebac9452`.
- Changed code: `packages/merchant-ledger/src/csv.ts`; new `packages/merchant-ledger/src/csv.formula-prefix.test.ts`.
- Only one engineering assistant performed sequential implementation and self-review. No independent reviewer, main merge, deployment, or funds operation.

## Defect and mitigation
GhostPay's CSV text normalization recognized formula operators preceded by simple ASCII spaces and recognized leading TAB/CR only at index zero. The exported `sanitizeText` and `textCell` failed to prefix an apostrophe on mixed initial whitespace such as `" \\t=HYPERLINK(...)"`, on `"\\n=1+1"`, and on `"\\uFEFF=2+2"`. Whether any specific external spreadsheet evaluates these particular values was **not** tested, so this is a defensive import-ambiguity hardening, not a claim of a demonstrated exploit.

The new `FORMULA_START_RE` protects `= + - @` operators after any combination of ASCII space/TAB/CR/LF/BOM, and cell values beginning with initial TAB/CR/LF within that run. The existing `quoteCell` RFC 4180 escaping still applies; benign text, embedded tabs after ordinary text, and formula-looking substrings not at the beginning are unchanged.

## Evidence and limits
- Source-equivalent Node v22.16.0 baseline: all five new illustrative assertions failed before the fix (the original helper returned unprefixed input).
- Source-equivalent Node v22.16.0 new implementation: **562/562** independent sanitization/quoting assertions passed. This includes all five original cases, forty explicit operator-prefix variants, existing text expectations, and 500 deterministic 3-character whitespace combinations. These tests transcribed source logic into a standalone harness; they are **not** direct repository Vitest.
- Git checkout via `git ls-remote` in the container still fails on `Could not resolve host: github.com`; actual repo Vitest/typecheck/lint/build not run locally. Hosted exact-commit CI and independent review required.
- New committed Vitest tests cover 5 representative edge cases, 40 operator-prefix variants, benign content and old behavior; they have not yet run in the actual repository.
- No proof of Microsoft Excel, LibreOffice, or other spreadsheet auto-evaluation was attempted; the fix is a conservative text neutralization boundary.

## Ownership and integration
- Verified main `ACTIVE_WORK.md` has no claim on `csv.ts` or new focused test, and broad PRs #278/#307/#372 do not edit `csv.ts`. Recheck all PR/branch owners and source heads before integration.
- Main integration lock `automation/ghostpay-integration-lock` remains held by external coordinator `994a0d214fb9-root-r3` at generation 11, and expiry is not release authority. Keep PR draft until ownership, exact-head checks, independent review, conflict and nondeployment gates are satisfied.
- No invoicing protocol/currency exponent change, backend service, network request, token fees, contract, production release or real funds.
