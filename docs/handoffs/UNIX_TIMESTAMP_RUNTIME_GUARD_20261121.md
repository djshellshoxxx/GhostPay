# GP-UTC-01 — fail-closed Unix timestamp rendering (2026-11-21 UTC)

## Exact source and scope
- Cycle/worker: `20261121T1238Z/bug/unix-timestamp-runtime-guard`, one assistant executing sequential audit, test-first repair, and self-check. No independent native reviewer was available. Caveman was not invoked.
- Branch: `automation/20261121T1238Z/bug/unix-timestamp-runtime-guard`, stacked on existing PR #384 source `f3e5540777491559e79565cafe0978f5e8e30003` (parent main `eb59d93cffed7848c4aac37d0e9650b87239c6da`). Do not merge separately into main until #384 or an equivalent is incorporated.
- Initial ownership commit: `9e3f64250d51d9dd419c6df73d6d5183c577947c` at `docs/ai/ACTIVE_WORK.md`.
- Red regression commit: `ac93d1f188f6251f21c791ccf40b61bcd345b194`; production correction: `2da96e64f060f5f8735bcc7e2410f53393e819fc`.
- Owned product paths: `apps/web/src/lib/format.ts` function `formatUnix` only, and new test cases in `apps/web/src/lib/format.test.ts`. Parent PR #384's `parseUnits` fix/tests are preserved. No new dependencies, contract edits, or deployment changes.

## Source-pinned finding and correction
- **ID GP-UTC-01**, low, defensive browser correctness. Original parent code: `formatUnix(seconds: number)` performs `new Date(seconds * 1000)` without runtime input validation. It renders `null` as Unix epoch, interprets string timestamps after numeric coercion, and throws for BigInt, Symbol, or object conversion hooks. Such a value may crash a render if an upstream validator regresses. Direct reachability from validated signed invoices and exploitability were not demonstrated.
- New guard rejects all nonnumber values and nonfinite numbers before arithmetic. Legitimate finite Unix-second values still format with the existing UTC logic and original Date-range fallback.
- Regression-first Vitest cases: reject ten nonnumber runtime values, avoid user-supplied `Symbol.toPrimitive` execution, preserve epoch, fractional, negative, and out-of-Date-range formatting.
- Existing `formatUnix` guard for out-of-range timestamps and all `parseUnits` behavior remain unchanged.

## Execution evidence and limitations
- Node `v22.16.0`, source-equivalent manually transcribed helper: **8 failing cases with original helper**, **22/22 assertions with corrected helper passed** (13 invalid values, seven valid/date-boundary cases, two hostile-hook assertions). This is **not repository Vitest**, and the scenarios were not executed against a checked-out repository module.
- Local `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` failed with `Could not resolve host: github.com`. Repository Vitest, TypeScript, lint, build, browser and contract tests were **not** executed locally. No external security audit was performed.
- Parent PR #384 exact-head GitHub CI, Pages, Beta acceptance, CLI, Hosting workflows all reported `completed/success` at source `f3e5540777491559e79565cafe0978f5e8e30003`. Those runs do **not** qualify this branch. Before this handoff the new branch's production-source commit had no associated PR workflow runs; re-query after PR opening and re-check the final head.
- Integration lock at `automation/ghostpay-integration-lock`, commit `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`: `held`, generation `11`, owner `994a0d214fb9-root-r3`. Expiry does not authorize takeover; no coordinator shared integration or main merge. The lock history records a restored prior held lease after an unsupported expiry-only takeover.
- `.github/workflows/pages.yml` inspected: PR triggers validation only; actual publishing is conditional on a main-only manual `workflow_dispatch` with deploy=true. No publishing dispatch was invoked.

## Next invocation
1. Re-read this branch and parent PR #384's exact heads, current main, all newer dependent PRs and the ownership lock; do not infer merge eligibility from old green CI.
2. Inspect exact-head CI jobs for this PR; run all three committed Vitest cases, typecheck, lint and Pages/browser qualification where available. Repair genuine failures on an owned branch with regressions.
3. Obtain genuinely independent source and test-quality verification; self-check is not independent approval.
4. Coordinate with PR #384's owner and existing integration coordinator. Merge only through authorized lock, reviewed exact-source required gates and verified no-deployment conditions. Preserve branch if blocked.

No release, deployment, funds operation, force-push, protected ref update, or security waiver.
