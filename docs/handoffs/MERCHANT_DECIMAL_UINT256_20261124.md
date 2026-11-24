# Merchant billing decimal uint256 round-trip — BUG ONLY

UTC 2026-11-24 (Nov 23 Pacific). Base main `e0cb4681e453af77bb10be45ba61b4d19579f41b`. One sequential author/test operator; independent reviewer absent.

## Evidence

The full source `packages/merchant-billing/src/money.ts` has Git blob `8b4350daf1b28ae87414c2bf31713ad6ddb711ea` and actual dependency `errors.ts` blob `06c4c4f93347762d9888b2a7d7ac09d4f8a4e8a8`. Both matched local git hash-object. The decimal parser allows only 41 integer digits even though parseAmount accepts the uint256 range (78 digits). For example, parseDecimal(formatDecimal(MAX_AMOUNT,36),36) throws BillingError AMOUNT; zero-decimal 10**41 also throws. No funds or network used. The smallest repair changes the bounded integer regex from {0,40} to {0,77}; existing parseAmount still rejects overflow and bounds conversion. Repaired source blob `3a341108a8a7bff152f195366a8bc918668e9276` matches the compiled local candidate.

## Commit and test evidence

- Ownership: `21ec984648fe664a0f654070f18e9910456178af`
- Failing regression first: `c0f75a71f3c4054a338387df91ce790bdda5ab9d`
- Production repair: `75a63d7efb24af44aaa7f2c3284dca8efc80d117`
- Compile both full modules in separate directories: tsc --target es2022 --module commonjs --strict --outDir out money.ts errors.ts (TypeScript 5.8.3). Node 22.16.0 assertion harness: 16 round trips (0, 1, 10**41, MAX_AMOUNT crossed with decimals 0/6/18/36), four overflow cases, six malformed/precision/invalid-decimals cases. Baseline 21/26 passed, 5 failed (42-digit integer at 0 and MAX_AMOUNT at all four precisions). Candidate 26/26 passed. No doubles. Regression Vitest file mirrors vectors; actual repository Vitest, lint, build and browser tests not run locally: git ls-remote failed DNS resolving github.com.
- No independent verifier exists in this run; sequential self-review only.

## Ownership and gates

Read live AGENTS/WORKFLOW/HANDOFF/ACTIVE_WORK. Inspected open changed-file inventories for all accessible PR numbers in snapshots through #555; no money.ts or money-prefixed regression collision. One inconsistent listing, #414, returned 404 twice and was absent from one refreshed snapshot but present in another; ownership census is not fully certified (308 of 309 most recent listed PRs inspected). Recheck #414 and all current heads before integration. #390 exact head b655bc273a6704c9c140287b8adcdf4085b91882: 36 successful and three skipped check runs, Snyk success, zero reviews, dirty merge state. It is not draft according to metadata; owner untouched. Lease generation 13 released at 48330313f2cea71f28b8198b73929a0061bbe5ff; not acquired. Remain draft until full exact-head required CI, applicable native browser, genuine independent review, ownership clearance and legitimate integration authorization. No deployment, release, dependencies, contract or fund interactions.
