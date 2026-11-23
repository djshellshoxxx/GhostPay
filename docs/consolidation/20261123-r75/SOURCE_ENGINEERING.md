# R75 source engineering

Checked 2026-11-23T22:05:12.983Z; main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`; previous consolidation head `ddb23a8522361ac074a8ebf731158a42ddc02749`.

## Structural donor recovery

Donor `codex/ghostpay-private-scan-lint-20261119@1b010ec910d04df105fd662cc360629cb0a2f5dd` is an ancestor of `repair/ghostpay-native-fee-recovered-20261119@cbc96840c3dc4fede90afff55b4dfd94f66784da`; reverse compare ahead 0, behind 100, merge base donor. Both refs still live. Full recursive trees `51e666f0d111c35dec061218ff7ace0038d3a61d` and `bec093489267b2a7cd1f756120ccfd4cd2eafb2e`: 4,535 and 4,638 non-tree entries, truncated=false, zero donor-only paths. Compared mode/type/blob SHA. Donor tip changes only scanClient.ts; its exact blob `3b5fe3c1a8aafa1c270930b567fd06e2086d7b11` is present unchanged in successor. Other historical code is subsequently modified by successor. Do not assert behavioral equivalence or integration; keep successor as unresolved obligation and retain both refs and older evidence. Main and C1 scanClient blob `043fb19af6e3ccf88224122185192829eed29c92` lacks donor scoped active() wrapper, so do not import the isolated repair without dependencies.

## P0-B owner-held refund qualification (read-only)

Source: `nodata/practical-johnson-e0fbpm@85cc394451313e24104ef7089379e720b4e70526`, settlement-policy.ts blob `f1c84033277a9236843487974e767faee83d96bd`. Replayed actual fetched classifier, validation helper and display bodies with TypeScript-only annotations removed, synthetic WeakSet checker and stub BillingError. No repository Vitest, wallet, RPC, or actual fund operation. Invoice due 1,000,000 units; policy late review, excess refund, expiredPartial refund.

| Case | Output | Assessment |
|---|---|---|
| Expired finalized 300,000 partial, one unresolved observation | provisional true; refund-available 300000 | policy availability despite incomplete evidence |
| Same complete observation set | provisional false; refund-available 300000 | positive control |
| Earlier confirmed 1,000,000, later finalized 1,000,000 | provisional true; later refund-available 1000000 | classification depends on earlier nonfinal observation; input-boundary test, not claim canonical same-chain finality order |
| Earlier observation removed | paid; later refund-unavailable 0 | demonstrates dependency |
| Finalized 1,200,000 payment | overpaid; refund-available 200000 | positive control |

Owner coordination: https://github.com/djshellshoxxx/GhostPay/pull/455#issuecomment-7115291472 . Require deterministic owner regression coverage and freshness/finality before policy-derived availability/authorization; retain explicit merchant decisions and verified refund ceiling. This is a source-level settlement/UI qualification finding, not evidence of a transaction bypass. No owner code changed. Prior R61 reservation-release trusted reconciler issue remains open.

## Qualification

R74 exact-head 28 successful checks; #504 at cdf1510116d84855ef6e579f80e0e05a0fb1a5f1: 32 successful, 3 skipped, 5 failures (typescript, CodeQL, ts-test web, lean and full e2e). #500 at d3bbc9aa555fa9f8eaea31ddc8c6d6e5e7a232ea: four successful checks only. Local Git checkout failed DNS resolving github.com; no full local tests. R74->R75 exact fetched validator functions replay passed: {"total":590,"finalized":322,"unresolved":268,"openPRs":279,"stackedPRs":99,"mainSha":"8ddb344973e80b8e1eda6821e970ee6a2b808b29","globalUnresolved":269,"newBranches":1,"advancedHeads":1,"newlyFinalized":1,"newlyFinalizedRetired":0}. No independent approval; branch-protection detail 403. No production code, main merge, deployment, release, funds, or ref deletion.
