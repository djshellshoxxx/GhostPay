# Independent review record

20 November 2026 (Pacific). This document records completed read-only reviews.

## Census extension — branch_reconciliation

No discrepancy found. The reviewer checked 423 unique frozen names, 410 exact reused heads, 13 new heads, zero missing old names and unchanged target SHAs. The original names/SHAs match both the prior details and frozen-ref files at commit `3433f7f098b5e61253a102a087dfb7e780dbb730`.

The reviewer independently recomputed the 26 new head/target comparisons using Git primitives: all best merge bases; ahead/behind counts; complete changed-path unions; application/engineering classifications; mode/blob identity; patch-equivalent and unique commit lists; commit trees; and application-tree fingerprints. All matched.

Both summary columns total 423. Every frozen name/SHA matches its corresponding origin-tracking ref; no local-only branch is counted. Original generator and original/extension archive hashes match.

Limits: frozen fetched refs rather than atomic live server state; source differences do not establish distinct missing features or merge qualification; later Settings/evidence publications lie outside the denominator; inline orchestration is not stored as a standalone script.

## Privacy overlap — privacy_change_review

Compared #354 `8ce7f1db452167311876bd0707778c2e9c64f3df` and #355 `f11792f7b9202512f0bf980a03f057e8a15836ae`, common ancestor #352 `28f1e4bd0960a0d57ba2636b6456e7c1b3096e94`.

Runtime contracts are equivalent. #354 runtime blob: `094b9d4cce058b060c13821c7723449bafe0a743`; #355 runtime blob: `00a70efc5f273da55d4ce4a76141a0b92fd5601a`. Both preserve replacement-dialog focus, reject roots/disconnected/hidden/inert/disabled openers, verify successful focus, and otherwise focus the privacy control.

#354 contributes seven fallback cases and two browser fixture corrections. #355 contributes the real quick-hide/sensitive-content composition, checks against focusing hidden/inert elements, and body/root/disabled cases under that composition. Neither is a full superset. Preserve #355 donor `2affd298c364c284d4d74f703fd4a612cc0f16d9`, retain #354 runtime/browser corrections, then add distinct #355 tests in the eventual qualified composition. No combined pass is claimed.

The coordinator also inspected the exact runtime diff and composition-test imports/assertions. No runtime advantage or incompatible focus contract was found.

## Settings — scan_fix_review, followed by coordinator review

The worker executed the original #353 file and retained both failures, changed exactly two expected URL strings, and obtained 21 passing tests across three complete files. Full evidence is published at #356.

The coordinator read the full test file, complete patch, existing relayer normalizer and its existing tests; checked that production source is unchanged; verified all recorded source-blob and output hashes; ran complete diff whitespace and the original repository secret scan; and verified the fetched published tree and sole parent. No further behavioral test execution was added to the worker's 21-case count.

Public commit: `82ab06f1bb6fc4b9df2b4ac87679a4029987a284`.
Local reviewed commit: `4dcd24e11bdd77bf1dbbc44f53daf80e870ce1a0`.
Exact shared tree: `419bf4cd527fca0e3bcfd27f6ff4a97599fa4098`.
Parent: `a8c10a965f726a6c2dc8eb7391f495df833b3e9b`.
