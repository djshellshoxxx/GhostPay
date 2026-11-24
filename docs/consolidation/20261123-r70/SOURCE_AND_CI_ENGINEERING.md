# GhostPay R70 — uncapped donor evidence and CI engineering

Checked source at **2026-11-23T17:19:05.211Z** (repository local dates not inferred). Main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`; draft PR #471 prepublication `1923472e0343a842efbe9edbb86e4590e88b7571`.

## Actual tool engineering

Added `scripts/consolidation/compare-git-trees.mjs` and `scripts/tests/compare-git-trees.test.mjs` to **existing draft PR #471**, without modifying application source or claiming an independent reviewer. Tool consumes *complete*, nontruncated GitHub recursive-tree JSON responses, reports exact blob identity/added/removed/changed/gitlink paths, and refuses truncated responses, duplicate paths and invalid entries. It is deliberately not a patch-equivalence, runtime-safety or merge classifier.

- CLI and test Git blob identities: `0f5a8057d2fd742a1d4c0c10a7b606b15a916de9`, `f97d250e66bbdce4ff060382a45790a9085376f2`.
- Local bounded command: `node --test /mnt/data/ghostpay-r70/scripts/tests/compare-git-trees.test.mjs` — **five pass, zero fail, zero skip** on Node v22.16.0. This was a focused run of the new source/test files, not a repository checkout, full app suite, independent security approval, hosted CI pass or payment integration.
- Seven-hundred-one changed source paths were reproduced in a regression test, deliberately exceeding GitHub's 300-file compare cap. Repeatedly reading capped compare histories alone is insufficient.

## Full source census

All **583 live branches** enumerated over `100/100/100/100/100/83/0`, all **272 open PRs** over `100/100/72/0`, including **98 stacked**. Independent `/git/matching-refs/heads/` returned 583/583 exact name/SHA matches. Two newly created, already owner-held branch/PR pairs: BUG-only **#516** `c86d5a32e02efbee14d935548c821b27e287f507` and C1 fixture **#517** `fbd450936b2495026ff88a2eae08bfee02e92db6`. PR #471 advanced by the R69 publication only. Main unchanged. No deleted branch.

**318 finalized live / 265 unresolved live / 2 retained deleted-unmerged = 267 globally unresolved.** Previously finalized classifications are preserved verbatim, and neither new branch is marked finalized.

## Untruncated historical donor investigations

1. `repair/ghostpay-qr-surrogates-20261119@ac7b7a11f00896d105fa7a06e44e218046bdc56c`, tree `b4fd64db80b36549e3db81a89ca79e42f7e20a26`: 4675 blobs, `truncated=false`. Against protected-main tree `e24909bd48515b76bd4110cea90f3a5ac95b239d` (3987 blobs): **757 donor-only, 391 differing shared, 69 main-only paths**. Against merged PR #279 head `b5fc0991eb7cc12fcdfaea514f1fee5be1eca2a0`: 767 donor-only and 384 differing shared. Thus the PR279 merge alone does **not** prove the whole later historical donor safe/integrated. Preserve unresolved; many unrelated old snapshot paths need focused provenance.
2. `chatgpt/ghostpay-viem-alignment-20261118@defdaa308a2d05ab407af7e42f8dc457cf52d103` vs immediate parent `4d19655a2e5d93ad9378803cd4163245168aca24`: untruncated 3872 vs 3871 blobs, **one docs-only added path and three changed common paths** (ownership, root package manifest, root lockfile). Donor root override changes `@0xbow/privacy-pools-core-sdk.viem` from main's `2.57.13` to `2.57.19`. PR #210 closed **unmerged**. Unique dependency intent exists; absent lockfile regeneration, tests and security approval this is **not merge-qualified**.
3. `codex/ghostpay-private-scan-lint-20261119@1b010ec910d04df105fd662cc360629cb0a2f5dd`: last commit changes `apps/web/src/lib/scanClient.ts` to normalize malformed rejection causes in the `active()` wrapper. This wrapper **does not exist on current main**, so isolated cherry-pick is dependency-incomplete. Do not overwrite owner's scan files.
4. `nodata/practical-johnson-e0fbpm@85cc394451313e24104ef7089379e720b4e70526`: complete refund lifecycle/settlement policy is **P0 Worker B owned**, with explicit authorization and reservation state. Existing safety question: an `absent-after-deadline` observation needs independent proof from a trusted canonical, finalized, complete reconciler before reserved funds are released. No repair attempted on owner code.

## Hosted CI, actual observed checks

- Consolidation R69 PR #471 pre-publication `1923472e0343a842efbe9edbb86e4590e88b7571`: **28/28 check runs successful**.
- PR #515 `f2b262c2afe5d51c258e466d9be1d22798817135`: **32 success / 3 skipped / 0 failed**. This is a stacked invoice-expiry *test-only* draft on owner PR #274, not a main integration.
- Composite PR #504 `cdf1510116d84855ef6e579f80e0e05a0fb1a5f1`: **32 success / 3 skipped / 5 failed**. Hosted web unit job has 2950 passed, 1 failed, 1 skipped: `src/views/Sweep.test.tsx` **B-R6 unknown broadcast after dry-run**, expected null but DOM contains empty `<div>`. TypeScript *summary* job failed because a dependent job failed; do not misrepresent it as a compiler diagnostic. Other failed checks include CodeQL and both lean/full E2E. Existing C1 owner and stacked fix PR #517 remain active.

## Constraints

Branch-protection endpoint HTTP 403 due integration permissions. Integration-lock ref `082e754f44944ebb4be283f89176b966bf8f7b4f`: generation12 **released**, but no lock acquired and no independent approval. P0 invoice/refund finality and key-export privacy authorization remain owner-held/incomplete. No app change, main merge, deploy, fund movement, branch deletion or force push.

## Next actions

Complete untruncated per-donor file/commit and independent acceptance on remaining historical donors; identify an **unowned** minimal ready source/test change before broad integration. Verify R70 exact-head hosted CI, new CLI Node regression checks and ledger validator transition; seek source-owner review. Coordinate PR #274 ready/expired behavior, P0-B canonical complete absence evidence and PR #504 failing browser/security checks. Only merge an approved, exact-head green, dependency-correct PR when the protected-main rules and integration lease allow it.