# Scan-source untrusted record accessor boundary — 2026-11-23

## Exact sources and ownership

- Cycle: `20261123T1840Z`; one sequential coordinator, without a native independent worker or reviewer.
- Isolated branch: `automation/20261123T1840Z/bug/scan-announcement-getters`; main base `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
- Claim: `4d60b23e5c7a31adc07ceff7a3b50b1c0e4bbd4c`.
- Regression-first tests: `af385d26ec616fa26a70247396b4a8b3ab9bc297`.
- Production fix: `769337f759ff09659b0733ea82f9c263ce0f2076`.
- Source blobs: `packages/scan-source/src/validate.ts` original `1c3b1b76495868a0b4f7d2df4e4fa7b48e05ab5d`, corrected `fec87df93694764cc5811ca095d1506daf6ae765`; `validate.test.ts` original `84500028971740c8d42580be599aad4fc49e797e`, revised `d3612fd04ebfbd7340c2f53bdeead8e956a6e762`.

## Bounded finding and repair

The exported `parseAnnouncement(raw: unknown)` promises never to throw for malformed records, but the baseline reads fields directly from an arbitrary object. Getter-backed or revoked Proxy records can throw before validation and interrupt a scan rather than be discarded. This is an untrusted adapter-object robustness issue; no external RPC exploit, key theft, or user-funds impact has been established. Severity: low / correctness, source evidence confidence high.

The fix catches failures within one record's validation and returns `undefined`, preserving the scanner's malformed-record drop path. It changes no cryptography, network calls, valid-record fields, optional malformed-hash semantics, chain contracts, dependencies, build gates, wallet behavior or deployments.

Regression cases cover nine throwing field getters including the optional transaction hash, one throwing Proxy get trap, one revoked Proxy and a one-read field invariant. Existing valid normalization, malformed-field rejection, property fuzz, canonical ID and malformed optional-hash tests remain intact. The test commit precedes the correction; baseline failure is implied by direct throwing field reads but has not been executed in repository Vitest in this environment.

## Work actually executed and outstanding gates

- Authenticated GitHub source, tests, active-claim file, open PRs, C1 changed-file inventory and integration-lock record inspected.
- Exact committed source and test blobs read back successfully after separate GitHub commits.
- Local GitHub checkout blocked by DNS resolution (`Could not resolve host: github.com`); no repository Vitest, TypeScript, lint, build or browser test was executed locally.
- Exact-head hosted checks, any failed-run remediation, independent reviewer acceptance, release behavior and durable integration ownership must be evaluated before any merge.

## Concurrency, dependencies and integration

`docs/ai/ACTIVE_WORK.md` had no existing claim for `packages/scan-source/src/validate.ts` at this main baseline. The 353-file changed list of C1 [#504](https://github.com/djshellshoxxx/GhostPay/pull/504) had no `packages/scan-source/` paths. Active C1 dependencies are #504 → #510 → #512 → #517, independently owned and untouched. #517's [Core CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/45219561332) and Pages/Beta/Hosting jobs were observed completed successfully, but its independent approval and merge remain separate issues.

The durable lock on `automation/ghostpay-integration-lock` was inspected at generation 12, status `released`, ref head `082e754f44944ebb4be283f89176b966bf8f7b4f`. This cycle did not acquire it. Release is not authority to merge without an atomic lock acquisition. No shared target, main, release tag or production environment was modified.

## Next invocation

Fetch this branch and exact PR head, inspect individual hosted jobs and logs; repair any failure on an isolated child branch, preserving the original head. Obtain an independent verifier for changed source and regression intent. Recheck current main, active writer claims, C1 source overlap and lock state. Do not merge into main until ownership, required exact-head checks, review and no-deployment policy are satisfied. Maintain security findings, especially previous unresolved Mythril triage; no finding was closed here.
