# GhostPay R71 — code repair, uncapped source evidence, and exact-head qualification

Checked GitHub at **2026-11-23T18:09:04.253Z** and source follow-up at **2026-11-23T18:09:55.784Z** (UTC). Protected main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Consolidation PR #471 had pre-ledger head `c4201865de02dd350469be063db96d1f18e8b58a`; source/test commits are preserved below.

## Engineering: complete-tree comparison must include Git file modes

The R70 `scripts/consolidation/compare-git-trees.mjs` checked blob/gitlink SHA and type but ignored Git `mode`. A file can retain an *identical Git blob SHA* while changing from mode `100644` to `100755`, or from a regular file to a symlink (`120000`); the R70 tool would incorrectly classify both as identical. It also accepted missing or mismatched modes, and two tracked file paths with an impossible file-as-parent relationship.

This is a defect in consolidation qualification tooling, **not** an assertion of a payment-runtime vulnerability.

- **Regression-first test commit:** `b1a2f9345316e2dcc58e3d601d09b6f3b449d9d5`. Three new tests were RED against the exact R70 source (five pre-existing tests GREEN).
- **Production comparator fix commit:** `c4201865de02dd350469be063db96d1f18e8b58a`. Track mode with SHA/type, classify mode-only changes as changed, reject unknown or mismatched blob/commit/tree modes, duplicate paths, and file-as-parent conflicts. Distinguish regular, executable, symlink, tree and submodule modes. Bump output schema to `ghostpay-complete-git-tree-delta/2`.
- **Exact Git blob proofs:** new source `e66b763aef52883f49fa9df9fe4c59304bf1e5ef`, test `23e76af4ce44c73f45e1300f9117f3ed31f38109`. Both committed GitHub blob SHAs were independently reproduced using `git hash-object` on the locally executed files.
- **Executed tests:** `node --test scripts/tests/compare-git-trees.test.mjs` on Node v22.16.0: **8 passed, 0 failed, 0 skipped** after repair. Before repair, **5 passed, 3 failed** as expected. One test still verifies 701 changed source paths beyond the 300-file REST compare cap. These tests ran against source/test bytes identical to the committed blobs, but not from a native remote checkout.
- **Not claimed:** full GhostPay tests, local app build, TypeScript, browser/E2E, independent review, merge approval, payment/fund safety or deployment. Native `git ls-remote` failed resolving github.com; connected GitHub API read/write succeeded.

## Full source reconciliation

All **584** live branch names/heads were returned in pages `100/100/100/100/100/84/0/0`. All **273** open PRs were returned in `100/100/73/0/0`, including **98** stacked PRs. Independent `git/matching-refs/heads/` had **584/584** exact name/SHA matches, zero missing or mismatched refs. Protected main remained unchanged.

The single newly discovered branch is BUG-only owner-held PR **#518**, `automation/20261123T1719Z/bug/nfc-nan-limit-r11@26d10a1f1e74d28408ea4c81d627afd227b7a48b`. Main comparison is 5 ahead/0 behind, four changed files with an isolated `nfc.ts` NaN limit repair and new test. It remains **unmerged/owner-held**; inspect its current exact-head acceptance and owner approval before any integration. Review of the actual PR diff found the fix guards `Number.isNaN(max)` after `Math.min`, but did not constitute independent production approval.

**Accounting:** 318 finalized live; 266 unresolved live; two retained deleted-but-unmerged histories. **268 global unresolved.** No historical branch was newly finalized and no app code was integrated into main.

## Untruncated historical tree investigations

1. `chatgpt/ghostpay-idle-lifecycle-20261119@7e6089e2e40a2a7daf93961eddef17d3fe8501fd` vs `evidence/ghostpay-idle-session-r2-20261120@ebc3fea4640e2a82585a6cfb73a97fbf0b907949`. Trees `64ae98aa2616d52ee213d040f33c6a8d896fc83b` (4,169 tracked objects) and `399a7fe21dc2f1b051a09ca1733bb23655a64bfc` (4,111); `truncated=false` on both. **818 differing tracked paths** by exact SHA (including additions/removals). GitHub compare returned only 300 paths (194 ahead, 83 behind). Neither donor is finalized; the differences include executable code and tests.
2. `evidence/ghostpay-continuation-r2-20261120@c2b575e945b71563e30a9bef162cf3fdc92181f0` vs `evidence/ghostpay-continuation-20261121-539818@c7d0e589cca0bb1bbb6c93620808ec2b6aa1b22c`. Trees `a79c63db639af66aac042cadc14f611bea8318e3` (4,077) and `791811b24491496f5346cc40564fe7b987f51734` (5,430), both untruncated. **2,104 different paths**; capped compare returned 300 (464 ahead, 102 behind). No equivalence or safe import established.
3. Additional last-commit review: `evidence/ghostpay-remediation-20261120@6fe35de42587e8da06e2590983b584ffde93d40f` adds five docs to parent `9b070476a6e4f514385767aed9989f504d4904cf`, but its overall divergence from main is 444 ahead/132 behind. `repair/ghostpay-final-lint-20261119@73d7ccda4fd448dec1682082d633c90de9fa0d7a` adds 13 docs/evidence paths in its final commit, but its whole history is 338 ahead/137 behind. Neither can be classified audit-only solely because its last commit is documentation.
4. `snapshot/ghostpay-privacy-8be15289-20261120@d6819796a9542acc488b896786faffe83b913d9b` has a final commit touching 75 paths including live browser privacy code and tests; remains unresolved/owner-sensitive.

## Hosted checks and safeguards

- R70 PR #471 exact HEAD `9d9f82375326df70645bc5b1991db49386e69ca9`: CI and PR workflow both completed **successfully** (runs 45226671497 and 45226656998). This does not qualify R71's later SHA.
- R71 source head `c4201865de02dd350469be063db96d1f18e8b58a`: PR workflow **success**, full CI **in progress** at inspection (runs 45234765805 / 45234773993). Subsequent R71 ledger/handoff commits change the head; exact final-head CI must be rechecked.
- BUG-only PR #518 `26d10a1f1e74d28408ea4c81d627afd227b7a48b`: five queried workflow groups reported successful; formal independent review and merge validation remain separate.
- Composite C1 owner PR #504 `cdf1510116d84855ef6e579f80e0e05a0fb1a5f1` still has a failed full CI group in the queried run. No owner-held code was edited.
- Integration lock `refs/heads/automation/ghostpay-integration-lock@082e754f44944ebb4be283f89176b966bf8f7b4f`: `integration-lock.json` explicitly says **generation 12, released**. No acquisition, new lease, or main integration was attempted.
- Protected-main branch-protection REST read returned **403 Resource not accessible by integration**. Do not equate this with an absent rule. Independent formal approval and all exact-head security/browser gates remain required.

**No product payment-code commit, protected-main merge, deployment, release, contract change, real-funds test, secret handling, force-push or branch deletion occurred in R71.**
