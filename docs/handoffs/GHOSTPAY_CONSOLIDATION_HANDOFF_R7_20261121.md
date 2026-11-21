# GhostPay exact-main branch census and v1/v1.1 integration handoff — 2026-11-21 UTC

## Frozen source and verification

- Repository: `djshellshoxxx/GhostPay`, comparison base `aec179910c39081d820396409ff3139ff2264132` (`main` at discovery).
- Full pre-census-branch inventory: **433 branch names**, GitHub branch pagination pages `100,100,100,100,33,0`, including a terminal empty page. Snapshot: [GHOSTPAY_BRANCH_INVENTORY_20261121_R7.json](GHOSTPAY_BRANCH_INVENTORY_20261121_R7.json).
- **All 433 snapshot branches compared to exactly `aec179910c39081d820396409ff3139ff2264132`** through GitHub compare. Per-branch results, merge bases, ahead/behind counts, file paths, additions/deletions and any truncation are in `BRANCH_COMPARE_R7_*_*.json` (32 disjoint, complete index ranges from 0 through 432).
- Outcomes (mutually exclusive by ahead/compare error): **189** ancestry redundant (0 commits ahead); **243** with ahead commits requiring semantic review; **1** separate-history `gh-pages` (GitHub returns 404 *no common ancestor*, not a missing branch). Do not merge `gh-pages` into source.
- Within the 243 positive-ahead branches: **172** with potential application/package/script paths, **65** docs-only and **6** other non-code/workflow paths, based on changed-path heuristics **not** a determination of semantic uniqueness or merge safety. **51** comparisons returned >=300 paths / GitHub compare truncation and need per-commit/diff traversal.
- Historical work from earlier censuses is retained; this is a new full compare against the *same frozen current main*, not evidence that all 433 features should be added. Snapshot becomes out of date when branches or main move. Re-fetch changed heads before integration.

## Recovered beta code — existing reviewed PR #258 (no duplicate PR)

- Branch `automation/20261119T073600Z/bug/camera-visibility`, old exact head `84398a79e18673f3e371a405931bc464e1cca99a`, ancestry merge base `ffd982a7aea2856c186b40ef236a39720a1b81f5`.
- Real privacy/security defect: page-hidden events stopped camera scanning but did not revoke asynchronous pasted/image QR imports. Delayed work could still reach callback. The old patch rejects hidden input, aborts pending work, rechecks visibility after asynchronous operations and adds **nine regressions**.
- Original source `CameraImporter.tsx` blob `f592f573581511d7287608c3da068aae432f5738` is **exactly unchanged** between merge base and frozen `main`; old patch blob `255e318fb120ef769687e0c2dfb38f2bceb9e7d9`.
- Instead of reimplementing or opening a duplicate PR, refreshed [PR #258](https://github.com/djshellshoxxx/GhostPay/pull/258) with safe, non-force two-parent merge commit **`d073414b718242eefdd22c0debc56901045d5f7a`** (parents old head + `aec179910c39081d820396409ff3139ff2264132`). New tree is based on current main and overlays only `CameraImporter.tsx`, new `CameraImporter.visibility.test.tsx` and the original handoff. Old `docs/ai/ACTIVE_WORK.md` changes excluded to preserve other workers' coordination.
- Verified new compare: **ahead 2 / behind 0**, exactly three changed paths against `main`. Previous head passed CI, Pages, Hosting kit, Beta acceptance and independent scoped review. **New merge head has not passed its exact-head CI yet and is still a draft.** Do not merge until complete gates and independent review of merged tree. No deployment or release.

## Source-pinned semantic overlap checks

| Historical branch head | Current-main semantic finding |
| --- | --- |
| `72dde82d9d898f5ed0c3c2b6901870c557a5012a` (onion authority) | Canonical raw `%` rejection is already implemented in `packages/net-transport/src/onion.ts`; source-redundant despite ahead commits |
| `9bdc9cbade90995e3207b72535a7818f909c2684` (negative fiat) | Main's `formatFiat` already separates sign from absolute minor units; redundant |
| `dfed84c18b5f02c568c87f14a4fa4cec20fea80b` (off-filter RPC logs) | Main already rejects wrong token address and block outside the requested interval; redundant |
| `d77956901d95c3eeb8c5c1d67ae7d1647bd069aa` (schedule clock) | Main's `confirm` uses one validated clock sample; redundant |
| `0b213bd9d43409aaa9671945761e51892aa5d69e` (router replay claims) | Main already handles page-scoped one-time replay; require focused semantic test audit before declaring fully redundant |
| `8aed22ad44ee2131b36a9e12ec2dc33fe3501e1b` (TagArchive blocked download) | Already tracked as paused [PR #193](https://github.com/djshellshoxxx/GhostPay/pull/193); cleanup exists in `Common.downloadBlob`, do not duplicate outside accepted Pages lean scope |
| `6b3e689c15ca0a4ca0bc034ef24c3a2a5fb5ea7a` (legacy policy duplicate attempt) | Main already has early wallet-attempt duplicate refusal; retain for further test-by-test comparison, not direct cherry-pick |

## PR dependencies and CI blockers — at investigation time

- [PR #357](https://github.com/djshellshoxxx/GhostPay/pull/357) GP-BUG-08 exact head `e871eccc1238b7145cd1d0a667afb393c373cf83`: Hosting kit/Pages/Beta acceptance green but main CI **failed**. Hosted logs show missing `policy.create.alreadySaved` in three locale catalogs, security-key parity failure, and an old recovery UI assertion. Its child [PR #362](https://github.com/djshellshoxxx/GhostPay/pull/362) at `67542c09ba180eec95004fb9b7a6d52d1a8dd809` already includes translations plus a distinguishing recovery test, so **do not duplicate that fix**. Qualify child, integrate to parent, rerun all parent gates.
- [PR #345](https://github.com/djshellshoxxx/GhostPay/pull/345) reviewed-payment revocation; [child #359](https://github.com/djshellshoxxx/GhostPay/pull/359) exact head `23f55bfea1068a5791b8e8e29409e4a13d0b28a3` fixes lint; child Hosting/Beta/Pages green and CI still queued at inspection. Require combined head requalification.
- [PR #340](https://github.com/djshellshoxxx/GhostPay/pull/340) selected TRON genesis; [child #342](https://github.com/djshellshoxxx/GhostPay/pull/342) at `06fd87c3e90000118ffa94048529db36f0a67d41` passed CI, Pages, Hosting kit and Beta acceptance, and is ready for independent review; integrate and requalify parent before main merge.
- [PR #352](https://github.com/djshellshoxxx/GhostPay/pull/352) wallet journal consent fix is stacked on #348/#336; hashes must remain hidden on reload until matching account/chain reauthorization.
- [PR #363](https://github.com/djshellshoxxx/GhostPay/pull/363) static Tor qualification at `313cea93d727a4ed620a69de6733a2bdff433400`: Hosting kit green; Tor static job running and CI queued. Do not deploy.
- [PR #307](https://github.com/djshellshoxxx/GhostPay/pull/307) broad integration stack was not mergeable and overlaps many smaller candidates; avoid bulk merging.
- [PR #337](https://github.com/djshellshoxxx/GhostPay/pull/337) popup warning fix has child #351; reconcile once and requalify.
- Receipt archive PRs #332/#335 overlap; choose one source of truth, do not import both wholesale.

## Next work (no permission to deploy)

1. Verify exact-head CI and merged source on #258. If green, obtain independent review and only then merge it; the PR currently remains draft.
2. Qualify #362/#357, #359/#345, #342/#340 and resolve any remaining TypeScript/browser failures without relaxing privacy/custody guards.
3. Investigate 51 capped branch comparisons with per-commit manifests and compare changed code semantically. Source-pin mutable heads by `fetch_commit` before individual recoveries.
4. Preserve static browser-only, HTTPS/Tor, noncustodial key handling and explicit wallet consent; no server custody, no deployment or release until full qualification.
5. Resume from the 433-branch inventory and 32 source-pinned comparison ledgers on the current draft consolidation branch. New branches added by this run are outside the frozen snapshot; incrementally compare them against updated main at next checkpoint.

This handoff is an engineering ledger, not a release sign-off. No live wallet transaction, private key, deployment, or released artifact was generated.

## Exact source-head supplement and concurrent overlap

- [BRANCH_HEADS_R7_20261121.json](BRANCH_HEADS_R7_20261121.json) pins **all 433** original snapshot branch names to Git object SHA (0 missing), from GitHub Git matching-refs. The 436 refs at this later observation included this census work branch plus two new integration branches absent from the initial inventory. Ref heads were captured after comparisons, so any head moved during the scan must be re-compared by exact SHA before merging.
- [BRANCH_DELTA_POST_R7_20261121.json](BRANCH_DELTA_POST_R7_20261121.json) compares the two non-census additions exactly: `integrate/ghostpay-idle-main-scan-20261121-539818` at `45ece45defd2a26cfb7f471ea4654ba4d1d2266e` (119 ahead/0 behind), and `integration/ghostpay-idle-scan-candidate-20261121-fc3db` at `418054d5ca041973d31d514406ee4c6157ca919f` (120 ahead/0 behind). Both reached the 300-file API cap and both include `CameraImporter.tsx` / visibility regression test. They overlap reviewed #258; reconcile diff/hashes before any combined integration instead of importing duplicate source.
- #258 refreshed head `d073414b718242eefdd22c0debc56901045d5f7a` was confirmed mergeable with queued CI, Pages, Hosting kit, Beta acceptance. Those checks are not yet green, and #258 remains draft.
- #357 received an explicit coordination comment identifying the exact failed tests and existing child #362 repair; its parent code remains untouched.
