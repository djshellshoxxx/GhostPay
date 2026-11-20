# Full local qualification of the recovered idle-session source

## Result and immutable source

The complete original web test gate and original lean production build/postbuild scan passed for [PR #331](https://github.com/djshellshoxxx/GhostPay/pull/331). The final result is **3,155 tests passed, zero failed and 13 existing tests skipped**. All four original coverage thresholds passed. This evidence branch adds documentation only and leaves the source PR and tested checkout fixed.

| Identity | Exact value |
| --- | --- |
| Locally tested final source | `7417881ac7f243b50f7b5c1682c66a4e3f87c736` |
| Published source and lean build commit | `f5e04a30bd538b5dba6202885c8e1c3cceb31fa3` |
| Shared source tree | `9cf5006b14404c3d96ea0d040a42b5feab8d87ca` |
| Reviewed runtime checkpoint | Local `1ca7105e050f7d76aee18fe3efee3cd02cd72cb4`; published `86d41bf7eeb6aa5a46ba199df442fa99e7db1c63` |
| Integration base | PR #325, `1788f1e0a0fe1fb22bb887427c47bdd62db78c1a` |
| Retained narrow idle donor | PR #256, `e2ebb4902e53e2249c6585a1d72be6e1e416c36c` |
| Evidence branch base | Published source `f5e04a30bd538b5dba6202885c8e1c3cceb31fa3` |

A fresh fetch verified all five published first-parent trees against their local counterparts, the mapped parent relationships and the runtime merge's retained donor parent. The final public/local tree equality and donor ancestry were also checked in the test worktree. `EVIDENCE.json` includes the full mapping. The documentation children after the runtime review do not change application, test, dependency or configuration bytes.

## Complete original web gate

The original package script is:

```text
vitest run --coverage && vitest run --config vitest.nocov.config.ts
```

Both stages ran in that order from `apps/web` using the installed Vitest entry point, with the original configurations, test selection and coverage thresholds. Only `NODE_OPTIONS=--max-old-space-size=512`, `--maxWorkers=1` and additional JSON reporting were supplied. Coverage succeeded before the no-coverage stage started.

| Stage | Passing tests | Skipped tests | Failed tests | Passing / skipped files | Process exit | Elapsed |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Original coverage | 3,152 | 13 | 0 | 211 / 2 | 0 | 1,480.189 seconds |
| Original no-coverage | 3 | 0 | 0 | 3 / 0 | 0 | 29.528 seconds |
| **Complete gate** | **3,155** | **13** | **0** | **214 / 2** | **Both 0** | **1,509.717 seconds** |

The complete gate contains 3,168 test cases across 216 files. The 13 skipped case IDs, file paths and statuses exactly match the earlier complete baseline at `2876b7db580e47a880d5951ce9e62941bcf76fdf`; their detailed comparison is retained. No skip or assertion was added for qualification. Source HEAD/tree and a clean Git status were verified before and after both stages, and the original configuration hashes were checked afterward.

The previous **575 passing focused tests in 26 files** are recorded in [the focused recovery report](../idle-session-r2-20261120/REPORT.md). They overlap the complete suite and are not added to the 3,155 count. That earlier checkpoint also passed the original full web typecheck and typed ESLint after independent source review. The reviewed source, final local source and published source relationships remain explicit in the evidence.

## Coverage

| Metric | Covered / total | Actual | Original threshold |
| --- | ---: | ---: | ---: |
| Statements | 13,543 / 14,503 | 93.38% | 90% |
| Branches | 9,525 / 10,611 | 89.76% | 85% |
| Functions | 2,696 / 2,838 | 94.99% | 90% |
| Lines | 10,928 / 11,257 | 97.07% | 90% |

These counters come from the complete JSON coverage map. Each percentage was checked against the unchanged Vitest text reporter, and the coverage process exited zero. The direct counter extraction used standard-library code; no reporting dependency was installed.

## Runtime interruption and complete second attempt

The first invocation began at 18:31:19 UTC. Its tool execution session later became unavailable, its log stopped changing at 18:36:47, and it produced no final JSON report or exit status. The partial log contains 12 completed passing files, but this attempt has **no completed test verdict** and contributes no counts to the result above.

Before the second invocation, the available process inventory contained no matching runner or Vitest process, and the old recorded PID was absent. The inventory's visibility is explicitly limited to the execution tool's PID namespace. The coordinator authorized a complete new attempt for the observed runtime interruption. The original manifest, partial log, supervisor script and a snapshot of the pre-existing coverage directory were preserved byte-for-byte.

The second invocation began at 18:46:06 UTC and completed both original stages at 19:11:16 UTC. It used separate output paths, unchanged source/configuration and a supervisor that recorded real child-process polling and `/proc` liveness every ten seconds, plus durable stage exit statuses. There was no individual stage or test retry within this completed attempt. No incomplete counts were carried forward. Original attempt-one artifact hashes were checked after completion and again while packaging this evidence.

## Lean production build and postbuild scan

After the shared heavy-check slot was released, the original build ran with:

```text
NODE_OPTIONS=--max-old-space-size=1536
GHOSTPAY_LOCAL_BUILD_PROFILE=lean
GP_COMMIT=f5e04a30bd538b5dba6202885c8e1c3cceb31fa3
npm run build --workspace @ghostpay/web
```

The package's original build runs TypeScript and Vite, followed by the original `node scripts/scan-bundle.mjs` postbuild. It passed in **19.628 seconds**, exiting zero, and the tested source remained clean and unchanged. The output contains **17 files totaling 2,492,248 bytes**. The build metadata records the exact published source commit, and every output file has a SHA-256 entry in the evidence.

The postbuild reported all 17 files passing its source/bundle and bundled-deployment checks. Vite emitted one chunk-size advisory for the unchanged 1,200 kB warning threshold. The complete build log preserves that advisory; no limit was raised. This is a local production build result and does not claim deployment or release.

## Evidence integrity and remaining promotion checks

`EVIDENCE.json` contains source identities, exact commands, configuration hashes, runtimes, stage timestamps, results, skip identities, coverage counters, build metadata, output hashes and the publication mapping. The raw outputs under `outputs/` use JSON wrappers containing deterministic gzip/base64 bytes. The original length/hash and wrapper hash are recorded, and every artifact was decoded and compared byte-for-byte before commit. This keeps the large JSON coverage map and the incomplete-attempt snapshot recoverable without altering their bytes.

The existing dependency installation was reused; no dependencies were installed, copied or removed. The recorded runtime is Node 24.22.3 and npm 11.19.1. The original source checkout and PR #331 head remain unchanged; subsequent application changes require their own qualification.

No browser assertion ran locally. The earlier full/lean collection-only check is kept separate. Hosted Node 22, full/lean browser, Pages and analyzer/security qualification remain governed by the coordinator's current exact-source checks; these local artifacts do not assert their results. This worker did not deploy, release, merge main or perform a live-wallet transaction.
