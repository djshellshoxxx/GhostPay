# GhostPay BUG-ONLY: weekly recurrence MAX_YEAR boundary (cycle 8)

Date: 2026-11-21 (UTC). Scope: one existing-functionality defect in the `@ghostpay/ux-schedule` library. This is **not** a payment execution or deployment change.

## Exact source pins and ownership

- Live `main` base: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Isolated branch: `automation/20261121/bug/ux-schedule-weekly-maxyear-r8`.
- Baseline `packages/ux-schedule/src/recurrence.ts` Git blob: `df6d0c8d3ee1918ed79055446b7a80832daca260`.
- Final production source Git blob: `c7a549975ee327f44068ddc619c99e72391b559f`.
- New regression source Git blob: `a00dc18461226bd17452f3b3bf407c7bc6fa58cd`.
- Claim commit: `2f437649a4c86e7d684cc6ef38e4ac4d4d989319`; test-only regression commit: `3e048392a67e9e2351e62c944b4b83891ad1106d`; production fix commit: `0948a8260171e2cdf7bddf758b878fccc142d0c1`.
- Owned paths: `packages/ux-schedule/src/recurrence.ts`, new `packages/ux-schedule/src/recurrence.year-boundary.test.ts`, additive `docs/ai/ACTIVE_WORK.md` claim, and this new handoff. No other files, dependencies, build settings, contracts, RPCs, fees, or shared branches touched.
- Complete changed-filename inventory of all **178** open PRs at selection (100 on page 1; 78 on page 2) found no owner changing either owned source/test path. Large PRs #372/#278/#264/#262/#238/#224 own package manifests and `template.test.ts` nearby, but not this change. Recheck exact heads and ownership before integration.

## Reproduction and root cause

`candidateDays` in `recurrence.ts` declares the maximum supported year as `MAX_YEAR = 2200`, and enforces `maxDays = daysFromCivil(MAX_YEAR + 1, 1, 1)`. The weekly branch checks that the *week's Sunday base* precedes `maxDays` but does not check whether the selected weekday (`base + wd`) precedes it. With a validated weekly rule starting 2200-12-28 and weekdays Thursday/Friday, it emits 2201-01-01 and 2201-01-02, even though every daily/monthly rule stops before 2201. A Sunday/Wednesday rule should still yield 2200-12-28 and 2200-12-31.

The baseline behavior was reproduced using Node v22.16.0 and an isolated JS source-equivalent port of the exact `daysFromCivil`, `weekdayOfDays`, and weekly `candidateDays` loops read from the pinned source blob. Before: weekdays [4,5] -> [2201-01-01, 2201-01-02]; weekdays [3,4] -> [2200-12-31, 2201-01-01]. These are invalid last-year occurrences, not intended new scheduling functionality.

## Regression-first repair

1. Added three focused Vitest regressions (committed independently **before** the fix). Two checks fail on the baseline weekly algorithm: reject 2201 Thursday/Friday and keep Dec 31 while rejecting Jan 1; third verifies last-week valid dates.
2. Changed one conditional in the weekly generator only, from `if (base + wd >= startDays)` to `if (base + wd >= startDays && base + wd < maxDays)`. No changes to recurrence policy, DST handling, other frequency branches or scheduling interfaces.
3. Isolated Node 22 source-equivalent reproduction after the fix passed **133 checks**, covering six boundary/neighbor examples and all 127 nonempty weekday masks in the final week. Existing Mon/Wed and biweekly examples retained expected initial dates. This is not the GhostPay repository Vitest suite.
4. Read branch source/test back through GitHub and confirmed the production source and regression file match the pinned blob SHAs above.

## Other gate evidence and limitations

- Rechecked draft [PR #390](https://github.com/djshellshoxxx/GhostPay/pull/390) at exact head `b655bc273a6704c9c140287b8adcdf4085b91882`: 39 GitHub check runs, **36 success, three skipped, zero pending/failures**; all five listed workflow groups succeeded; Snyk combined status success; **zero** review submissions. Read the current PR diff; no confirmed defect requiring unauthorized changes to its owner branch.
- Native repository checkout cannot resolve `github.com` (`git ls-remote` reports DNS failure). Therefore **no local Vitest, workspace lint/typecheck, full/lean Pages build, or browser E2E was run**. Treat the committed Vitest regression as unqualified until hosted exact-head results arrive.
- GitHub integration metadata ref `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` holds `integration-lock.json` blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`: status `held`, owner `994a0d214fb9-root-r3`, generation 11. Its timestamp is in the past; that is **not** authorization to acquire or merge.
- No separate independent reviewer/verifier was available. Self-checks are not independent review.

## Remaining work / strict stop gates

Publish as draft PR against current main; verify exact-head hosted TypeScript/Vitest, lint, relevant static build and applicable native browser CI, and an independent reviewer if available. Verify no conflict/dependency or owner overlap after other workers' updates. Do **not** promote to main unless all required checks are GREEN, applicable browser gates and independent review are qualified, and the legitimate integration owner releases or explicitly hands off the lease. No real funds, network attacks, external traffic, deployments or release actions.
