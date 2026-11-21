# GhostPay — amount parser runtime guard and ISO currency-policy reconciliation (2026-11-21 UTC)

## Exact task and final source
- Executed by one assistant in sequential coordinator, source-audit, implementation, test-first and self-verification phases. No independent worker, Caveman runtime or independent review.
- Isolated branch: `automation/20261121T1033Z/bug/fiat-minor-units`, from `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Claim `a370ae6b61cefc041b3c0aa72cd68e8277e68da9`; scope correction `c6255ef927d7284c1c65299e45e1109558058c85`.
- Initial ISO regression/proposal `caded568cd923249c7bb108c9b11e0800a529c27` / `8d29dd631de66d3b8e72f5d9cd125fe8fffbc6e4` **were explicitly superseded and reverted in the final file diff** after examining the signed protocol in merchant-ledger. Do not cherry-pick those commits alone.
- Final red-regression commit `3dc4811e484599b4ff31bf7d5eafb0687ebb5e76` and production correction `b697f0354cd6c2bfb8a259c005daad8615b7c37f`.
- Final product files: `apps/web/src/lib/format.ts` (runtime `parseUnits` guard) and `apps/web/src/lib/format.test.ts` (3 new Vitest scenarios). The original eight-currency GhostPay 0-decimal list and existing 2-decimal default are preserved.

## Implemented correctness repair
`parseUnits(text, decimals)` previously calls `text.trim()` and `BigInt(decimals)` without runtime type/precision checks. Non-string JS inputs such as `undefined` threw untyped TypeError; `NaN`, `Infinity` and other invalid decimal precision values could throw RangeError or construct unsupported base units. These are particularly undesirable at browser amount-validation boundaries. The helper's documented contract is to return `undefined` for malformed input rather than rounding. The correction rejects nonstring input and noninteger/out-of-range decimals outside 0..36 before conversion. Valid literal integer and fractional amount behavior is unchanged.

Three committed test cases validate seven runtime-invalid input types, eight malformed precisions, exact 2/3/4 decimal amount parsing and no change to the existing GhostPay signed invoice KWD=2 behavior. This is defensive client correctness, not evidence of a demonstrated funds-loss exploit.

## Critical discovery: deliberately defer ISO 4217 policy migration
SIX Group ISO 4217 List One dated 2026-09-17 contains 0-, 3- and 4-decimal exceptions (sources: https://tools.tnaado.ca/international/iso-4217-currency-code-lookup/ and https://mt-mx-parser.zagtrader.com/currencies). A first-stage review of `apps/web/src/lib/format.ts` suggested adding them. Cross-package audit uncovered `packages/merchant-ledger/src/decimal.ts`, which explicitly documents and implements **GhostPay's current 0/2 minor-unit protocol even for KWD**, and notes that shop plugins follow it. `apps/web/src/lib/invoiceCreate.ts`, `merchantTemplate.ts` and `pay.ts` share this model. Changing the exponent table without a versioned migration would reinterpret previously signed invoice integer amounts and create inconsistency with merchant-ledger and shop adapters. **No new currency policy was chosen.** Keep the ISO standards difference as a compatibility/policy finding, deferred for owner decision and coordinated protocol migration if ever adopted. Do not report this as a resolved vulnerability.

## Verification and merge gates
- Container `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` failed with `Could not resolve host: github.com`, so checkout and actual repo Vitest, ESLint, TypeScript, build and browser E2E did not run locally.
- Isolated Node 22 source-equivalent harness (not repository tests) executed **20 assertions**, all passed on the transcribed candidate logic; **11 malformed cases** exposed original exceptions or undesirable outputs. This is limited reproduction evidence only.
- PR checks were created on the earlier source head, then become stale after the revised final commits. Inspect exact final SHA CI; do not infer success from old runs.
- Workflows inspected: `.github/workflows/pages.yml` validates PRs but deploys only via explicit `workflow_dispatch` on main with `deploy=true`; `release.yml` triggers on a signed version tag. No deployment, dispatch, release or tag was performed.
- The durable integration lock `automation/ghostpay-integration-lock` had generation 11, `status=held`, owner `994a0d214fb9-root-r3`. The lease's expiration is not takeover authority; no shared branch update or main merge attempted.
- Final PR is draft until exact-head hosted checks, independent review, current source/target checks, protection/policy and deployment exclusion are completed. Do not silently change user-visible historical invoice amounts.

## Resume
Re-read the exact PR head, compare with latest main, run actual focused `apps/web/src/lib/format.test.ts` with repository Vitest, applicable typecheck/lint/build and Pages browser checks. Independent reviewer should confirm the runtime-fail-closed behavior and compatibility with `packages/merchant-ledger/src/decimal.ts`. Repair CI regressions on this exclusively owned branch; coordinate merge only when the lock and deployment gates permit.

No contracts, custody, tokens, production configuration, paid agents, private keys, real-funds operations, force-pushes or unapproved merges.
