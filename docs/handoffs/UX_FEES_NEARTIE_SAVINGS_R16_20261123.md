# BUG-ONLY R16 — near-tie fee savings must not be negative

Date: 2026-11-23 UTC. Repository: djshellshoxxx/GhostPay. Target: static Pages package behavior, no deployment.

## Exact source and ownership
- Live `main` observed: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
- Task branch: `automation/20261123-r16/bug/ux-fees-neartie-savings` (created from that SHA).
- Production path: `packages/ux-fees/src/cheapest.ts`, baseline Git blob `9dd403efacc56aefc935f57d4a9b487d1aefd422`, repaired Git blob `4cbb678712fdc85605394510c498d29db5a879b3`.
- Dedicated new regression: `packages/ux-fees/src/cheapest.tie-savings.test.ts`. This handoff and an append-only active-work claim are the other owned paths.
- Claim commit: `e6f314f24242ed4b7713c2cf9045997149ddbb4d`.
- Regression-FIRST commit: `5b90a192cbeb558a6ebda77d9474729ef6c50631`.
- Small production fix: `c8c80dd990cd4754c0b8ffa9cd9242495d356281`.
- Follow-up presentation/one-evaluation adjustment: `d2a066432ad06154c9aa420c649d8085d9481e9e`.

## Confirmed defect, reproduction, root cause
`suggestCheapestChain` selects all candidates within `tieToleranceBps` (default 100 bps) of the cheapest. The preferred chain or faster-finality chain may legitimately win the tie despite being slightly more expensive. The function then picks the next candidate from cost-sorted `rest` and computes `savingsVsNext = metric(next) - metric(winner)` without the nonnegative guard used for `savingsVsCurrent`. In that legitimate near-tie case, the "savings" value is a **negative bigint**.

Deterministic case with the same native ETH asset, 120,000 gas units each, gas price 100,000,000 versus 100,500,000 wei and 1% tolerance: preferred higher-priced chain #2 wins but old `savingsVsNext.amount = -60_000_000_000n`. The same occurs when #2 wins on faster finality. Correct behavior is a zero saving (not a negative "saving"). Real cheapest winner continues to report `+60_000_000_000n`; identical costs report zero. Four dedicated Vitest regression cases committed before source fix.

## Test execution and limitations
- Node v22.16.0 isolated source-line-equivalent V8 probe (fee sort/tie selection and exact savings calculation): **before 2/4 expected outcomes; after 4/4**. This isolated probe reproduces the relevant algorithm with synthetic data; it is **not** execution of the full imported production module or committed Vitest suite.
- GitHub native checkout in the provided local runtime failed `Could not resolve host: github.com`. Do not claim local Vitest, lint, typecheck, build, integration, browser or security tests were run.
- The new Vitest file is committed and must be executed by hosted CI against this exact branch head. Observe job results before changing draft status.

## Review and ownership gates
- Rechecked #390 (rendered-display-text): exact head `b655bc273a6704c9c140287b8adcdf4085b91882`; five workflow groups succeeded, 39 checks at exact head (36 success, 3 skipped); zero submitted independent GitHub reviews. GitHub reports `mergeable=false` and `draft=false`; its owner branch is unchanged. No confirmed failing CI at that SHA to repair.
- Open PRs enumerated by creation-day snapshots: 8 before Nov 18, 56 on Nov 18–19, 44 Nov 20, 78 Nov 21, 82 on/after Nov 22 = **268** current open PRs. File-list preflight of current broad PRs #238/#246/#262/#264/#278/#504 and adjacent fee PRs #421/#423/#425/#462 found no claim on `cheapest.ts` or new regression path. Last BUG-ONLY round recorded a 267-PR inventory before the latest PR; a fresh full 268-PR changed-file audit was attempted but not completed because the connector enforced per-call limits. A coordinator must recheck all potentially competing file ownership before any integration.
- Last source-pinned integration-lock file at commit `082e754f44944ebb4be283f89176b966bf8f7b4f`: generation 12, status `released`, previous owner another coordinator. This is not authority to acquire, edit lock metadata or merge. Recheck live integration ref and obtain legitimate ownership before any merge.
- No independent separate verifier or submitted approval occurred in this round. Separate review required.

## Pending
1. GitHub Actions: full exact-head required CI, package Vitest/typecheck/lint/build, Pages native browser qualification and security checks where applicable.
2. Independently verify actual production behavior and regression without relying on an author's isolated probe; revisit any CI failures on this task branch only.
3. Recheck main head, PR file claims, parent dependencies, applicable native browser artifacts, and integration-lock owner; remain draft if any gate remains unresolved.

Excluded: new features, UX redesign, refactoring, dependencies, fee policy changes, signing, contracts, payments/funds, external traffic, deployment and release.
