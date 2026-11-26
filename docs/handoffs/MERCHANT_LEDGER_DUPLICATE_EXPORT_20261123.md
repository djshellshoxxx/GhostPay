# GP-BUG — Duplicate invoice IDs separated by creation dates (2026-11-23)

## Scope and reproduction

Base main: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Task branch: `automation/20261123T2018Z/bug/merchant-ledger-duplicate-invoice-export`. Only existing merchant ledger export correctness, no feature/interface/dependency/payment behavior/deploy/release changes. One coordinator; no independent reviewer available.

`resolveAll` documents that duplicate IDs are rejected. It sorts primarily by createdAt, then ID, but checks only adjacent IDs. Valid synthetic rows with IDs dup, other, dup at times 1700000000, 1700000001, 1700000002 pass the baseline. Each row has one item, quantity 1, unitMinor 100 USD, taxRateBps 500. CSV, JSON, Xero, IIF and yearly tax aggregation all consume resolveAll and accept the duplicate. The latter can count the same logical invoice twice. No real merchant data or funds used.

## Regression-first history

- Ownership claim: `779727c9887dd27a07585a71a492ab74cee64fc2`.
- Regression-first test: `8b185b15b4d58e13990d8eef2e196dd041ec2de5`.
- Minimal fix: `39f730937a5505a6b7733b9ef49868815b3201e6`: replace adjacent-ID comparison with a Set across resolved rows. Keep date/ID sorting, typed LedgerError('duplicate-invoice'), and calculation/formatting paths unchanged.

## Executed evidence

Local Git checkout failed: Could not resolve host github.com. Instead copied the complete four production modules, independently verified `git hash-object` against GitHub content blob IDs, transpiled with TypeScript 5.8.3 transpileModule (ES2022/CommonJS), and ran Node 22.16.0 assert/strict checks against the resulting real modules; no runtime dependency stubs. Type-only invoice-schema import is erased by transpilation. This is not full workspace typechecking or Vitest.

| File | Baseline blob | Repaired blob |
| --- | --- | --- |
| export.ts | 00217cc059a213a9b6dc34f8aca29aed81a109ca | 28bfee80fecad995dcbe4db1c9426e08a39044b6 |
| decimal.ts | 658367df36a8207c891626a87df91573ab8ef570 | unchanged |
| csv.ts | 1508ab1d2af0faaac0b9f84828e35eac0f38396a | unchanged |
| errors.ts | 99075e980e8075f90950d70158dcd8513995832b | unchanged |

Baseline: 6/13 passed, 7 failed (separated duplicates in both input orders, CSV, JSON, Xero, IIF and tax summary). Fixed: 13/13 passed, including same-date and adjacent different-date rejection, valid sort, valid summary amounts, deterministic export and empty list. Dedicated regression file committed before source fix covers those behaviors. Full repository Vitest/lint/typecheck/build/native browser not run locally.

## Coordination and pending gates

Live open PR inventory: 276 across pages 100/100/76, through #521. All 276 PR changed-file inventories individually checked; no claim on export.ts or new export.duplicate-invoice.test.ts. #504 owns other merchant ledger paths (csv.ts, decimal.ts, ledger.test.ts, its new CSV test), untouched. Main ACTIVE_WORK had no matching source claim. Refresh PR and branch heads before integration. PR #390: exact head b655bc273a6704c9c140287b8adcdf4085b91882, 5 successful workflow groups, 36 successful and 3 skipped checks, Snyk success, zero review submissions, mergeable=false, draft=false; no branch/PR changes. Durable integration lock generation 12 released, not acquired (integration-lock.json blob 5004209200c97ae989d721c9ee6a8266aeed2329).

Leave draft until full exact-head required hosted CI, applicable browser evidence, genuine independent review, refreshed ownership/dependency clearance and legitimate lock ownership. No deployment, main merge, release or interaction with funds. Continue selecting a different unowned existing-functionality defect in the next round.
