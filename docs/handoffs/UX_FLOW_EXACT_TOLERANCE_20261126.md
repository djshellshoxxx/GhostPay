# Exact-payment tolerance validation — 2026-11-26

Base main: `601f20955b435eede448c6d82d8315705d7e381d`. Original reconcile.ts blob `4b19e70d03945b6b5bcd33ffbe1e76d4cb683195`; original errors.ts blob `1539db553c5609a85170d8f9d3e75b3d00c5b65a`. Claim commit `1eb88d5fa4cd62bf35c67a9a31cbe5c10dcc7f0b`; test-first commit `ea39d41497e04f69a48b23a27b0f4a07a3fe5377`; repair commit `1d6a5a26324e2e74ea91542446cfc9f2bde08784`, production blob `b0d63dfb4846d61f4c199bc9374932677abbe0e7`.

## Defect and repair

The equal-payment early return skips the existing tolerance validator; malformed absolute and basis-point inputs are rejected on non-exact paths but accepted on exact ones. Previously reported on #220, whose merged claim explicitly excludes the defect. Move the existing toleranceAmount call above the exact return. No changes to amount arithmetic, proof authorization, supported assets, state formats, or excluded products. This is shared reconciliation package correctness, not demonstrated Pages runtime impact.

## Verification

Local full checkout failed with GitHub DNS resolution. Node 22.16.0 and TypeScript 5.8.3 were available. A standalone reproduction used the fetched, verbatim tolerance/classification function bodies from the pinned production blob and the full errors.ts file (git hash-object matched). Strict compilation: `tsc --strict --target es2022 --module commonjs --outDir out errors.ts reconcile.ts`. Synthetic Node assert harness: before fix 13/18 pass, five failures (negative absolute, excessive/fractional/negative/NaN bps on exact payment); after fix 18/18 pass. Non-exact invalid cases, both inclusive tolerance boundaries, partial/over, large exact bigint and BAD_AMOUNT precedence pass. The added repository Vitest test covers the same defect and both non-exact directions; it has not been executed locally. The source-derived harness is not a full package suite or browser verification.

## Coordination and gates

Enumerated 170 open PRs and checked all 170 changed-file inventories for packages/ux-flow/src/reconcile*; no overlaps. Main ACTIVE_WORK explicitly excludes this defect from #220 ownership. The lease was held by claude-newghostpay-7d, generation 48, heartbeat 17:24:01 UTC, not acquired. No other refs changed. All ten stop-work exclusions retained. Keep draft until fresh exact-head required CI, independent review, refreshed ownership/main reconciliation and legitimate integration lease. No deployment, real funds, contract, dependency or workflow changes.
