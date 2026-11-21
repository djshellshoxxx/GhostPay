# GP-BUG-R5 — exported summary period runtime validation (2026-11-21)

## Exact source and scope

- Repository: `djshellshoxxx/GhostPay`; live main base `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Dedicated branch: `automation/20261121/bug/summary-period-runtime-guard-r5`. No changes to `main` or any other PR branch.
- Owned: `packages/ux-export/src/summary.ts`, new `packages/ux-export/src/summary.period-boundary.test.ts`, append-only `docs/ai/ACTIVE_WORK.md` claim, this handoff.
- Original `summary.ts` blob: `ead81637895107a526bf258c027ac8e1fb7b72c4`; corrected `summary.ts` blob: `9e32d7844ebbc7ce83e89329b2c7d2b8df898e3e`.
- Claim commit: `172e4164eca53faa6c83ffe48eb99010da590db2`.
- Failing-regression-first commit: `2dce1f1b4e2d2d72565591b2d27e4ab1c56e8a57`.
- Production repair commit: `fadedf4a3beeee5577fb803fb4e5aa6042c8dca7`.

## Observed failure and root cause

The exported `periodKey(ms, period)` selected `day` as its unconditional fallback, so unsupported runtime period values such as `'hour'`, `'DAY'`, `''`, `null`, `undefined` and `1` silently produced a day key for 2024-04-02 instead of reporting `INVALID_OPTION`. An empty `summarize([], { period: 'hour' })` also returned `[]` without checking the invalid option. A source-equivalent Node 22.16.0 reproduction copied the original blob's period selection and observed **6 of 6** invalid period values falling through to `2024-04-02`. No external network or financial interactions were involved.

The root cause was missing validation of `SummaryOptions.period` and `periodKey`'s runtime argument, despite the type only naming five accepted periods and adjacent status/date options already using typed validation. The regression file was committed before the source change; it covers six invalid runtime values at both public entry points, including summaries with and without rows, and all five documented period modes.

The production repair adds one `assertPeriod` predicate in `summary.ts`, used at both exported entry points, raising existing `ExportError('INVALID_OPTION', 'unknown summary period')` for unsupported values. There are no schema, format, dependency, CSV, fee, wallet, network, contract, UI, API or release changes. Existing `summary.test.ts` was not edited.

## Verification and limitations

- Original source-equivalent Node 22.16.0 proof: **6/6** malformed period values silently grouped by day (observed RED baseline, not a workspace test).
- Post-fix isolated Node 22.16.0 source-equivalent proof: **23/23** assertions passed (12 invalid period rejects, 10 valid period controls, 1 invalid timestamp control).
- These are manually extracted exact control-flow checks for the cited source blobs; **not** imported workspace source, repository Vitest, typecheck, lint, build or native browser tests. Native checkout attempt: `git ls-remote https://github.com/djshellshoxxx/GhostPay.git refs/heads/main` failed with `Could not resolve host: github.com`.
- Exact-head GitHub Actions / native browser CI and independent external review still need confirmation before any integration decision. Never interpret a queued check as green or a self-review as independent review.

## Ownership, dependencies, gates

- Examined changed-file inventories of **all 173 live open PRs** at discovery and found no changed paths under `packages/ux-export/src/`. Other open PRs and old branches were not mutated; recheck new PRs/heads at integration.
- Draft PR #390 (rendered invoice display bound) remained externally owned at `b655bc273a6704c9c140287b8adcdf4085b91882`: its **39** exact-head checks were complete, **36 success, 3 deployment-only skipped, zero failures**, including full/lean browser tests. Zero submitted reviews or comments. No bug/CI failure warranted editing it.
- Integration metadata ref `automation/ghostpay-integration-lock`, `integration-lock.json` blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`, remained `status: held`, generation **11**, owner `994a0d214fb9-root-r3`. Timestamp alone does not authorize lock takeover; **no merge**, release, deployment, metadata mutation or branch override.
- Next: read the draft PR's exact head and all required check runs; address only genuine failing tests or source defects on this branch; seek genuine independent source review; verify applicable browser gate and fresh file-ownership inventory; merge only if all gates and legitimate integration ownership are satisfied. Otherwise leave this PR draft and resume on a separate unowned bug in a subsequent round.
