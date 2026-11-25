# UX export strict CSV rectangularity — 2026-11-23

## Source-pinned evidence
- Live main (rechecked before branching): 8ddb344973e80b8e1eda6821e970ee6a2b808b29.
- Claim: ff5ca051621a3f8edd7b4d719bd2236c19ee322b.
- Regression-first commit: 930f7b12f671c2a5a867ece98055e974417e0d9a.
- Minimal repair: 2e313ff0f952c07a2ab8a7072ce04a1d2f0fb662.
- Parser blobs before/after: 874058fb76c3fff637a4e210ad6fbd102f245e62 / 74c35df4a3a9bdeff1004b1ebc369d2ecb36f732.
- Actual dependency blobs: errors.ts 6d10133c45cc817fb7c95952f58b2a7b5a6f33cb; text.ts 8b20059e47f5b04153b367dfcbeefec7fcd439ac.
- Source contract: parseCsv is exported from packages/ux-export/src/index.ts and documents rejecting ragged rows. Baseline returns [['a','b'],['c']] for a,b LF c. parseLedgerCsv separately validates rectangularity; no claim that ledger import currently accepts ragged input.
- Root cause: parser never calls the existing assertRectangular helper. Fix calls it only on successful completion, retaining prior syntax and limit precedence, early empty-input return, error type and 1-based offending row. Linear pass; no new dependencies, new feature or financial behavior.

## Executed checks
Git checkout attempt: git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD failed DNS. Locally reconstructed entire parser.ts, errors.ts and text.ts from connector source; git hash-object matched all three before, and all three after the patch. Node v22.16.0, TypeScript 5.8.3. Compiled with tsc --target es2022 --module commonjs --strict --outDir out parser.ts errors.ts text.ts. Executed isolated node:assert/strict check harness (no dependency doubles):
- Baseline 8/12; four missing expected exceptions (short, long, third, quoted-short rows).
- Repaired 12/12: all four typed PARSE_RAGGED + row assertions, plus rectangular CRLF, empty input, single row, quoted empty rows, rectangular empty fields, syntax error with row/column, row limit, and direct assertRectangular.
- New Vitest file commits four failing regression vectors and valid neighbors before production fix. Actual repository Vitest, lint, full typecheck, build and native browser tests not executed locally. Hosted exact-head CI remains required. No independent verifier available.

## Ownership and integration
All 278 open PR changed-file inventories in snapshot through #523 inspected (3 pages of 100/100/78). Zero parser-path collision, including #504, #278, #372, #302, #264, #262, #246, #238. Main and newest ten PR heads rechecked before branch creation. No owner-controlled branch edited. Additive ACTIVE_WORK claim retained existing history.
PR #390 exact head b655bc273a6704c9c140287b8adcdf4085b91882: five normal CI workflow groups succeeded, 36 successful/3 skipped check-runs, Snyk success, zero submitted independent reviews, nonmergeable, draft=false at observation. No demonstrated current CI defect; owner untouched.
Main's Integration, CI, Hosting kit and Push on main runs succeeded; Nightly and API-Funded Cloud Development runs were reported failed. Not attributed to this parser task. Integration lease ref 082e754f44944ebb4be283f89176b966bf8f7b4f, generation 12 released; no acquisition or transfer.
Leave draft pending hosted exact-head CI, applicable browser qualification, independent review, refreshed ownership/dependency census and legitimate integration ownership. No release, deployment, real account/contract interaction or merge. Next round: choose a nonoverlapping existing-functionality defect.
