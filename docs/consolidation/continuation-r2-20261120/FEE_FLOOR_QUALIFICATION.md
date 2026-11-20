# PR #334 fee-floor qualification — continuation R2

## Result

**The unchanged frozen PR #334 source passes the original complete metadata-hardening test/coverage, typecheck, lint and build gates locally.** Independent static source review approves the same source with no blocker and one nonblocking overflow-policy test gap. The tests-only commit produces the expected two behavioral failures while preserving all 19 original BTC controls.

This evidence supplements the donor's earlier unexecuted-qualification handoff. It qualifies the optional testnet helper package, not a web/browser release or live-fee path. The source donor, tests, manifests and configuration remain immutable. Root owns publication and integration.

## Exact source and evidence identities

| Item | Identity |
|---|---|
| Existing donor PR | [#334](https://github.com/djshellshoxxx/GhostPay/pull/334) |
| Donor branch | `automation/20261120/bug/btc-fee-floor-config` |
| Base main | `aa3df1cb37274fae73af0ca957183c15c51b62d3` |
| Tests-only source | `77200f560577294a305132ae5fbe8446f259497e` |
| Tests-only tree | `70a487e3da94ec9ffce2f5dd720b70a733b3d8f0` |
| Runtime repair | `00795f318c7975e5ca5bb98cf30a13e01876eabb` |
| Frozen final source / evidence parent | `9dcd2d88ff32060e519ef18e2d8753691b56abc1` |
| Frozen final tree | `c482d227bbfdf326835d4f7f35a1dfcb86ef6f40` |
| Evidence branch | `evidence/ghostpay-fee-floor-qualification-20261120-r2` |
| Qualification worker | `/root/fee_floor_qualification_r2` |
| Independent static reviewer | `/root/fee_floor_review_r2` |

The tests-only commit changes only the new `btc.fee-policy.test.ts`. Its BTC runtime blob is identical to base (`6f89002a040cd4d35f506a09a42d2d1f50a93982`). The runtime commit changes only `btc.ts`, to blob `88baf602d4dc0f17425509ac6a050b74fd1cae24`; the final donor commit adds only its handoff. The regression blob remains `cd20187e69cb539651de65dc55d1deebd18c3147` throughout. Exact commit parents, trees and all three donor file blobs are retained in the source-provenance artifact.

The evidence branch starts at the public donor head. Its additive ownership claim precedes evidence creation. Only the claim and this qualification package are added; no donor product/test/configuration bytes change.

## Dependency and execution provenance

Execution used `/workspace/scratch/994a0d214fb9/GhostPay-qualification`, verified clean and idle before checkout changes. Node was `v24.22.3`; npm was `11.19.1`. No installation, dependency copy, library rebuild, socket-policy change or browser execution occurred.

Existing third-party links resolve into `GhostPay-sweep/node_modules`, installed from source `1788f1e0a0fe1fb22bb887427c47bdd62db78c1a`. The root manifest/lockfile, shared TypeScript and ESLint configuration, and all metadata-hardening manifest/TypeScript/Vitest configuration files have identical Git blobs at that installation reference, the tests-only commit and the frozen final source. The eight exact blobs are retained.

The package's recursively inspected workspace runtime dependency closure contains only `@ghostpay/core-crypto`. Its link resolves into the qualification checkout's own package, not Sweep's runtime source. Its complete source tree `b3f6aecdb564c6565b39372cf523f34fa86326bd` exactly matches the prior local library build source `bfbbdab5b9de8cd0b8b476dfb4c98b1613f9c272`. All 24 own compiled library files were recorded by byte count and SHA-256 before qualification, then verified unchanged afterward. Existing artifacts were reused; this is not a fresh-install or dependency-reproducibility claim.

Tests used `NODE_OPTIONS=--max-old-space-size=512` and one worker. Typecheck, lint and build used `--max-old-space-size=1536`. The original fork pool, test inclusion, timeout, coverage exclusions and thresholds were retained. Reporter/output arguments only persist the observed results. npm emitted an existing `http-proxy` environment-configuration advisory, retained in the logs; all final gates exited zero.

## Tests-only behavioral RED

At source `77200f560577294a305132ae5fbe8446f259497e`, cwd was the package directory:

```text
NODE_OPTIONS=--max-old-space-size=512
node ../../node_modules/vitest/vitest.mjs run src/btc.fee-policy.test.ts src/btc.test.ts --maxWorkers=1 --reporter=json --outputFile=/workspace/scratch/994a0d214fb9/fee-floor-r2-red.json
```

Started `2026-11-20T19:24:23.071898+00:00`; duration **1.129 s**; process exit **1**. Two complete files produced **22 cases: 20 passed, 2 failed, zero skipped**. Every original `btc.test.ts` case passed (19/19), as did the new valid-policy control.

The two failures were behavioral assertions that expected a rejection but received none: the first impossible-floor case (`rate=0.5`, `minRate=1`, `cap=0.8`), and the first malformed explicit-cap case (`cap=0`). Each failing test stopped at its first assertion; later loop values were not executed in RED. This is not an import/configuration failure. The unmodified full GREEN run below executes every loop value.

No failing assertion was retried, removed, skipped or relaxed. The checkout remained clean at the same tests-only source after RED. These 22 cases overlap the final package suite and are not added to its count.

## Original complete final package gates

At frozen source `9dcd2d88ff32060e519ef18e2d8753691b56abc1`, cwd was the repository root. The original package test script is `vitest run --coverage`; the entire configured `src/**/*.test.ts` selection ran.

```text
NODE_OPTIONS=--max-old-space-size=512
npm run test --workspace @ghostpay/metadata-hardening -- --maxWorkers=1 --reporter=json --outputFile=/workspace/scratch/994a0d214fb9/fee-floor-r2-green.json

NODE_OPTIONS=--max-old-space-size=1536
npm run typecheck --workspace @ghostpay/metadata-hardening
npm run lint --workspace @ghostpay/metadata-hardening
npm run build --workspace @ghostpay/metadata-hardening
```

| Original gate | UTC start | Duration | Exit | Result |
|---|---|---:|---:|---|
| Complete test + coverage | 19:25:06.364027 | 4.764 s | 0 | **118/118 passed; 11/11 files; zero skipped or todo** |
| Typecheck | 19:25:11.128553 | 2.626 s | 0 | `tsc -p tsconfig.json --noEmit` |
| Lint | 19:25:13.755578 | 4.410 s | 0 | Original ESLint config and complete `src` |
| Build | 19:25:18.166868 | 2.444 s | 0 | `tsc -p tsconfig.build.json` |

All starts are on 2026-11-20. No gate or individual test retry occurred. The clean source HEAD was checked before and after these stages. The JSON reporter counts 41 nested suite nodes; the actual number of test files is 11.

| Coverage metric | Covered / total | Actual | Original threshold |
|---|---:|---:|---:|
| Statements | 585 / 588 | **99.48%** | 95% |
| Branches | 431 / 436 | **98.85%** | 90% |
| Functions | 119 / 119 | **100%** | 95% |
| Lines | 485 / 485 | **100%** | 95% |

Counters were independently extracted from the final JSON coverage map and matched against the original text reporter. The raw coverage JSON, log and LCOV are retained. No coverage threshold, exclusion or source configuration changed.

| Complete file | Passed cases |
|---|---:|
| `amounts.test.ts` | 14 |
| `btc.fee-policy.test.ts` | 3 |
| `btc.test.ts` | 19 |
| `catalogue.test.ts` | 10 |
| `derive.test.ts` | 13 |
| `direct.test.ts` | 5 |
| `invoice.test.ts` | 8 |
| `release.test.ts` | 15 |
| `scan.test.ts` | 12 |
| `tags.test.ts` | 11 |
| `web.test.ts` | 8 |
| **Total** | **118** |

## Independent review and retained limitation

The independent reviewer approved the exact frozen donor with **zero blocking findings**. It checked source, test-first ordering, preserved controls, network guard, package/API scope, and main/stack overlap. Its reports are retained losslessly. The reviewer did not execute repository tests or builds; the execution results above belong to the separate qualification worker.

**FF-R2-01 (P3, nonblocking):** the added finite-result check precedes cap fallback. Extremely small finite steps can overflow division even when the supplied rate, minimum and cap are finite and compatible. The reviewer reasoned from source about `rate=1`, `step=Number.MIN_VALUE`, `minRate=1`, `cap=2`: the old implementation reaches a finite cap fallback, while the revised source rejects the nonfinite intermediate. This example was not executed in this qualification and has no direct new regression. Rejection is consistent with the documented fail-closed intent, but compatibility claims are limited to valid defaults and normal finite rounding/cap behavior. A future extension should explicitly test capped and uncapped overflow policy. Malformed-cap regressions check the typed error class rather than its stable code.

The independent comparison found the complete package unchanged between main `aa3df1c…` and stack #335 `e31a090501b3f5e77afcee812323e6f69e1fd565`; both still contain the old implementation. No direct source overlap was identified at those pins. No merge simulation or integration occurred.

## Evidence package and remaining boundaries

[FEE_FLOOR_QUALIFICATION.json](FEE_FLOOR_QUALIFICATION.json) indexes **14 lossless raw-output wrappers** under `fee-floor-outputs/`: RED runner/result/log; original final gate records; complete GREEN JSON; coverage/typecheck/lint/build logs; dependency and source provenance; LCOV; and both independent-review reports. Each wrapper records its original byte count and SHA-256. Small outputs retain UTF-8; larger ones use deterministic gzip plus base64. Every wrapper was decoded and checked byte-for-byte against its original file.

For a wrapper `w`, decode `w.content` as UTF-8 bytes when `w.encoding == "utf-8"`; otherwise base64-decode then gzip-decompress. Verify the decoded length equals `w.original_bytes` and its SHA-256 equals `w.sha256`. This reconstructs the original full outputs, including RED assertion failures and all final coverage data.

Documentation checks are recorded in the JSON index after execution. This report preserves local package execution on Node 24 with matching reused dependencies. It does not establish a fresh install, hosted Node 22/CI success, full web or browser acceptance, main promotion, deployment, wallet execution or live network/fee/funds action. Fresh source/ownership checks and required hosted gates remain coordinator responsibilities before integration.
