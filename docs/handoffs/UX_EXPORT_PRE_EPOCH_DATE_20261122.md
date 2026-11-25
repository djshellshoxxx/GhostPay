# BUG-ONLY: ux-export rejects pre-epoch ISO/date timestamps

Date: 2026-11-22
Repository: https://github.com/djshellshoxxx/GhostPay
Live main at selection: `eb59d93cffed7848c4aac37d0e9650b87239c6da`
Owned branch: `automation/20261122T2123Z/bug/export-pre-epoch-date-guard`
Scope: `packages/ux-export/src/time.ts`, new `packages/ux-export/src/time.pre-epoch.test.ts`; additive ownership claim and this handoff only.

## Confirmed behavior and root cause

The exported `parseTimestamp` accepts pre-1970 ISO or `date` strings, even though `assertTimestamp` defines the supported time domain as 0 through `MAX_TIMESTAMP_MS` and the companion `formatTimestamp` rejects negative milliseconds. The shared `utc` calendar conversion validates normalized components but never invokes the existing timestamp-range assertion. This also creates an inconsistent error boundary for CSV imports: `parseLedgerCsv` wraps `parseTimestamp` per-cell and later calls `validateRow`.

Original `time.ts` blob: `85006680a6011b05685c04df504d56fb078c065b`, verified by `git hash-object` against the locally executed copy from live GitHub main.

Before repair (actual local Node 22.16.0 execution of that exact source compiled with TypeScript 5.8.3, using an API-equivalent local `ExportError` module):

| Input | Format | Observed result |
| --- | --- | --- |
| `1969-12-31` | date | `-86400000` |
| `1969-12-31T23:59:59.999Z` | iso | `-1` |
| `1900-01-01` | date | `-2208988800000` |
| `1970-01-01T00:00:00Z` | iso | `0` |

The isolated source-matched regression replay had **six failed negative-date checks, twelve passes, total eighteen** before repair.

## Test-first changes

1. Ownership claim commit: `e64f45e3c8b493c88b4b0de5bdb94e1e8aab316a`.
2. Regression-only commit: `7e477613f17b3a470d4471663151c35fff7b6d95`. New `time.pre-epoch.test.ts` asserts six pre-epoch failures must raise typed `ExportError('INVALID_DATE')`, validates epoch and positive timestamps and nearby invalid dates.
3. Production repair commit: `b897aeedf19daba922b781b9d099408b207dfb67`. A single `assertTimestamp(t)` line in `utc` after its existing calendar checks.
4. Repaired `time.ts` Git blob: `e81138c14b8702be8fcaf933554fc37f0185e1fe`, independently matched by local `git hash-object`.

After repair, the same standalone TypeScript/Node replay passed **18/18** checks. An additional **3,600/3,600** source-equivalent ISO/date/unix valid-range checks passed with a deterministic 1,200-instant sweep.

These checks compile and exercise source-matched `time.ts` and a compatible `errors.ts` shim, **not a full checkout**, and **do not constitute repository Vitest, full lint, typecheck, build or native browser tests**. The local git remote remains inaccessible (`Could not resolve host: github.com`). Hosted GitHub Actions are the authoritative qualification path and must be checked against the final PR head after publication.

## Ownership and required integration gates

Before claiming the branch, checked the paginated live inventory: **241 open PRs** (100/100/41), with direct changed-file checks for each PR. No PR modified the selected `packages/ux-export/src/time.ts` or any `time.*` file. Other feature, consolidated and security branches remain untouched.

PR #390 rendered display-text bound: exact head `b655bc273a6704c9c140287b8adcdf4085b91882` is open and not draft. Five pull-request hosted workflow runs completed successfully (CI, Pages, Beta acceptance, Hosting kit, CLI operator qualification); 39 exact-head check-runs include successful web tests and native browser jobs, with release/deployment jobs skipped by design. Zero submitted independent GitHub reviews. No change to that owner-controlled branch is justified by observed CI.

Integration metadata branch `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, file `integration-lock.json` still records `status: held`, generation 11 and different owner `994a0d214fb9-root-r3` (expired timestamp alone does **not** authorize takeover). No protected ref change, merge, contract interaction, release, deployment or traffic attack was done.

## Pending actions

- Confirm newly opened draft PR exact head, its changed-file inventory, and all required hosted GitHub checks (CI, Pages/browser, Beta, Hosting kit, CLI and repository security).
- Obtain a **genuinely separate qualified review**; sequential self-audit is not independent approval.
- Recheck all active owners/PR heads and externally held lease before integration. Leave draft/unmerged until all gates clear.
- For the next isolated bug-only cycle, rotate to a different existing Pages runtime function/package; do not change this branch without an actual qualification defect.
