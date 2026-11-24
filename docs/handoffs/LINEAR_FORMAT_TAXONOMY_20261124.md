# Linear amount formatting and wallet taxonomy qualification — 2026-11-24

## Source and ownership

- Base: `84e5128dbe86d2061106e5e167e3272b5dee8958`.
- Isolated branch: `fix/linear-format-taxonomy-20261124`.
- Ownership claim committed before source edits: `18617cb8`.
- Tested application/test source commit: `0d8e9cc57404409d676b1705282b0be8e785ec1b`.
- Tested source tree: `df03d2ebd9023d7c63cc614314f4d9e7d22a6e8a`.
- The final handoff commit changes documentation only and normalizes the appended claim EOF. All base claim content is retained.
- Coordinator requested this separate child while retaining C1 #504 ownership. No owner branch or remote ref was changed. Independent combined review remains with the root coordinator.

## Exact scope and preserved behavior

Replaced the six flagged formatter suffix regular expressions with backward scans limited to their fractional substrings. Integer digits cannot be trimmed, including when decimals is zero. Existing value/precision guards and error returns remain unchanged. Allowed negative values in ux-connect, ux-export and ux-fiat retain their signs and exact magnitude; ux-export retains both fixed-width and optional-trim output. Maximum decimal places remain 77 (payment-uri and ux-connect), 38 (ux-export), and 36 (ux-fees, ux-fiat and ux-privacy).

Replaced the wallet app-not-open expression with a fixed substring check for `open the` and per-line searches for `not` or `closed` after the first `app`. Lines split exactly at LF, CR, U+2028 and U+2029, preserving JavaScript dot semantics. VT, FF and U+0085 remain part of a line. Matching remains substring based, case normalization remains at the original boundary, and the complete error-taxonomy priority is unchanged. The scan visits each line a fixed number of times.

Production paths: `packages/payment-uri/src/decimal.ts`; `packages/ux-connect/src/hex.ts`; `packages/ux-connect/src/hwsigner.ts`; `packages/ux-export/src/amount.ts`; `packages/ux-fees/src/amount.ts`; `packages/ux-fiat/src/decimal.ts`; `packages/ux-privacy/src/policy.ts`.

Added 24 ordinary wallet-message compatibility cases in `packages/ux-connect/src/hwsigner.message-lines.test.ts` covering line boundaries, ordinary control separators, substring matching, fixed phrase behavior and taxonomy precedence. Existing formatter and property suites already exercise zero decimals, fractional zeros, permitted negative values, trim mode and error boundaries. No stress inputs or vulnerability reproduction were added or run.

## Qualification

Runtime: Node `v24.22.3`. All 68 `@ghostpay` workspace links resolve inside this isolated worktree. External dependencies are reused without installation or manifest changes; 66 existing build-output directories were copied locally and all six affected packages were rebuilt before qualification.

For each affected package, executed:

```sh
npm run build --workspace @ghostpay/PACKAGE
npm run typecheck --workspace @ghostpay/PACKAGE
npm run lint --workspace @ghostpay/PACKAGE
npm run test --workspace @ghostpay/PACKAGE -- --maxWorkers=1
```

**All 24 final package gates passed. All 660 tests in 27 files passed with unchanged coverage thresholds.**

| Package | Tests | Files | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|---:|---:|
| payment-uri | 226 | 7 | 97.56 | 97.11 | 100 | 99.11 |
| ux-connect | 153 | 5 | 99.62 | 99.33 | 100 | 100 |
| ux-export | 139 | 7 | 99.8 | 98.25 | 100 | 100 |
| ux-fees | 54 | 4 | 98.57 | 98.38 | 98.07 | 99.75 |
| ux-fiat | 55 | 2 | 100 | 99.32 | 100 | 100 |
| ux-privacy | 33 | 2 | 100 | 99.14 | 100 | 100 |

The initial test CLI attempt also supplied `--minWorkers=1`; the installed Vitest rejected this unsupported flag before running tests. That invocation was corrected to `--maxWorkers=1`, with the original CLI-error logs retained. No source, test expectation, threshold or package configuration changed to obtain the passing results.

`npm run ci:scan-secrets` passed: no committed environment files or key material found. Base registry preservation, local workspace resolution and base-to-final `git diff --check` passed.

Detailed results and command/log hashes are in the task scratch directory `linear-format-taxonomy-logs/qualification-summary.json`. The successful coverage log hashes are:

| Package | Coverage log SHA-256 |
|---|---|
| payment-uri | `5ff350b1e982baca7233629f665c31c054ed84fbaa2e821a586cb575b7ebe9cb` |
| ux-connect | `d23797bd704e3f79bc5cc64b40888276d59be2cdb7bbd0c4aeacf23df4f1ba7e` |
| ux-export | `e39de8ca7f8fc6116193d156d4d50cfdab74908fc81f793a9a4a8691e4257d55` |
| ux-fees | `bd2d9109b34d312cf78aa2257f02e58b7b73c91920812b1cf9f6796bc986fe43` |
| ux-fiat | `04f724065a281d9f86fb4e87f7f92bbd6d8942f1c829f9cb809759083afa0e12` |
| ux-privacy | `93c8990ddd9817f8c41984384edd5ccc4c83c1cc6269e8c81329de9d5c502462` |

## CodeQL status and integration limits

The coordinator retrieved seven polynomial-regex annotations from the public unauthenticated REST endpoint for C1 check `138228881370`, head `1a7447d58c08363209b6b9b67e9a6afad07d87f3`. The six formatter expressions already had bounded fractional inputs; this repair removes the flagged operations without changing those bounds. The wallet-message expression is replaced with linear processing. The old report of connector endpoint rejection described unsupported connector routing, not a public access denial.

This task does not claim confirmed exploitability, dismiss any alert, or claim a new CodeQL pass. No CodeQL suppressions, workflows, policy, dependencies, hosted/native features or broader payment lifecycle were changed. Root must independently review the patch, compose it with the selected C1/completion branches, run the applicable combined qualification, and require the final exact-head hosted checks before main promotion.
