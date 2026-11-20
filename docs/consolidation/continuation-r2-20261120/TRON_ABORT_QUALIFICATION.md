# TRON cancellation: independent source review and local qualification

## Qualified source

- PR: [#321](https://github.com/djshellshoxxx/GhostPay/pull/321).
- Exact source: `87c3bf5a59f4d443c9e5cf81368162554a5315c3`.
- Exact tree: `a77ea829e449c412911ac67c9d1395179a079055`.
- Main base: `aa3df1cb37274fae73af0ca957183c15c51b62d3`.
- Independent source reviewer: `/root/ci_triage_r2`; coordinator ran the tests separately.

The donor now stops buffered native payments and delayed page/receipt results after cancellation. It preserves the existing typed `ABORTED` error, parsing, receipt verification, trust classification, pagination and yielded fields. The reviewer found no blocking source or test issue. This evidence supplements the original donor handoff's accurate statement that its invocation could not execute repository tests. It does not move the donor PR head.

## Reproduced failure and corrected result

The original three new cases ran against tests-only commit `b7f9d6440cb83c11792b343197c4f223db03f34a`: all three failed because results were yielded instead of rejecting after cancellation. The full original package coverage suite then passed on the unchanged final source: **106 passed, zero failed, zero skipped**. No retries or assertion changes were used.

| Original package gate | Outcome |
| --- | --- |
| Coverage suite (`npm run test --workspace @ghostpay/tron-adapter`) | Passed, 106 cases |
| TypeScript (`npm run typecheck --workspace @ghostpay/tron-adapter`) | Passed |
| Typed lint (`npm run lint --workspace @ghostpay/tron-adapter`) | Passed |
| Build (`npm run build --workspace @ghostpay/tron-adapter`) | Passed, including original core-crypto prerequisite |

Coverage: **97.04% statements / 93.30% branches / 98.93% functions / 99.11% lines**. Original 95/90/95/95 thresholds were retained. The test command added only one worker and JSON reporting. Commands, durations, exact results and log hashes are in the adjacent JSON file.

## Dependency and execution provenance

The completed combined-candidate dependency installation was reused through the existing Sweep checkout, source `1788f1e0a0fe1fb22bb887427c47bdd62db78c1a`. Root/package manifests, lockfile, TypeScript and lint configuration, package test configuration and the entire core-crypto source were checked identical before reuse. External dependency directories were linked into the qualification checkout; `@ghostpay` workspace links point to that checkout's own source and builds. The original core-crypto and TRON builds ran there. This is not a fresh-install claim. Node 24.22.3/npm 11.19.1 were used locally; hosted Node 22 qualification remains separate.

The qualification checkout stayed clean. All tests used deterministic synthetic transactions and local mock RPCs. No wallet, live RPC, blockchain transaction or browser execution was performed.

## Integration boundary

At the latest inspected hosted snapshot, #321 still had queued/running jobs and no failed conclusion. No source gate was disabled or replaced. Merge remains conditional on fresh heads, applicable hosted checks, independent review and integration-lease ownership. The original branch and all broader TRON/privacy donor branches are preserved. No release or deployment is claimed.
