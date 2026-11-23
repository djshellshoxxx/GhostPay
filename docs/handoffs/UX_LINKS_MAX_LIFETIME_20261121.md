# GP-BUG-14 — Runtime lifetime bounds for payment-request URI parsing

## Source-pinned scope

- Repository: djshellshoxxx/GhostPay
- Main base at discovery: `eb59d93cffed7848c4aac37d0e9650b87239c6da`
- Branch: `automation/20261121/bug/ux-links-max-lifetime-guard`
- Claim commit: `705470405ac9051f335438b73922225c39627a5a`
- Regression test commit (before source fix): `7ff83bab0afeecd55f200d785d36b11714b2b19f`
- Production fix commit: `375781eaae69c48bbbf51896941850d082488e77`
- Production source before blob: `22291aaab9177ac8c7ca3a3a00edac28c186fce4`
- Production source after blob: `6e2757f219cb62fafaf5e0fef13637acda5031f6`
- PR: #399 (DRAFT; not merged, not independently approved)

## Reproduction

`requestFromUri()`'s former `expiry-now > (opts.maxLifetime ?? MAX_LIFETIME_SECONDS)` comparison treats `NaN` and nonnumeric runtime values as false, and `Infinity` / huge floating-point values as effectively unbounded. This accepts future payment-request expiries beyond a user-specified invalid limit. This violates the documented strict expiry-bound contract in `docs/remote/usability/specs/ux-links-request.md` R5.

Source-equivalent Node 22 reproduction of the exact existing comparison (with a prevalidated synthetic URI and valid injected clock) yielded **8 failed / 4 passed** among 12 invalid-limit assertions. This is not repository Vitest or full URL parsing. New repository Vitest regression `packages/ux-links/src/request.max-lifetime.test.ts` was committed first, covering NaN, positive/negative Infinity, negative and fractional values, huge finite invalid values, and already-expired inputs; controls preserve the default, explicit valid extension and zero-duration override.

## Smallest compatible repair

Reuse existing `isUint()` (nonnegative safe integer) for the optional numeric limit before comparing to expiry. Undefined retains the 365-day default; zero remains valid and strict, and valid explicit extensions retain their prior semantics. Runtime invalid values fail with existing `LinkError('REQUEST', 'maxLifetime')`. No URI format, token amount, wallets, network, signature, recovery, backend, build configuration or dependency was changed.

Source-equivalent local green gate: **12 passed / 0 failed** on the same numeric comparisons after repair. The shell could not resolve github.com, so this local run does **not** establish a real repo checkout, Vitest, lint, typecheck, workspace build, Playwright or browser QA result.

## Ownership and qualification

All **156** open PR changed-file inventories checked: none edits `packages/ux-links/src/request.ts`. Several broad PRs own existing `request.test.ts`, so this branch adds a separate test file. A branch-specific additive claim was committed before modifying sources. Integration lock/other worker ownership not acquired. GitHub PR #399 requested hosted CI; results, independent review, and exact-head merge gates are **pending**. Do not mark qualified or merge until source/head and all relevant checks are independently verified. If main advances, reconcile and rerun on final SHA. No payment/deployment or real-funds tests.
