# GhostPay R33 — source-pinned consolidation / exact-head CI qualification

Date: 2026-11-22 UTC. Continuation of [R32](https://github.com/djshellshoxxx/GhostPay/pull/445), not a reset. Release boundary: **static browser-only, noncustodial Pages beta**. No hosted signing, relayer activation, contract/deployment change, secrets exposure, release or real-value transactions.

## Ground truth and immutable census

- Live default `main`: [`eb59d93cffed7848c4aac37d0e9650b87239c6da`](https://github.com/djshellshoxxx/GhostPay/commit/eb59d93cffed7848c4aac37d0e9650b87239c6da), unchanged at inspection. Note: GitHub branch API reported `protected:false`; **held integration lock**, not claimed GitHub branch protection, is the coordination gate.
- [BRANCH_HEADS.json](BRANCH_HEADS.json): **515 branches**, REST pages **100/100/100/100/100/15/0** (empty terminal), 515 independent Git matching-ref entries, **zero name/SHA mismatches and zero extraneous refs**. This includes the R33 source branch when it still pointed at `main`, before R33 documentation commits. Compare to exact [R30 504-head snapshot](https://github.com/djshellshoxxx/GhostPay/blob/745004a16dbb712a1085d3e7377d9abe951e9599/docs/consolidation/20261122-r30/BRANCH_HEADS.json): 504 unchanged name/SHA pairs, 11 additions (including this R33 branch), zero moved/deleted.
- [OPEN_PRS.json](OPEN_PRS.json): **206 open PRs** prior to creating the R33 docs PR, paginated **100/100/6/0**, 119 targeting main / 87 stacked, 45 ready / 161 draft after the three review-state promotions below. Against [R30 immutable 196-PR snapshot](https://github.com/djshellshoxxx/GhostPay/blob/745004a16dbb712a1085d3e7377d9abe951e9599/docs/consolidation/20261122-r30/OPEN_PRS.json), all 196 retain heads and base refs; ten additions #438–#447, none missing. **These frozen counts exclude the R33 PR**; later new branches/PRs may alter live totals.

## Branch vs current-main comparisons — all ten new code-bearing/docs donor heads since R30

Every new non-R33 branch below was compared directly using GitHub commit comparison against exact main `eb59d93c...`. All have **behind=0**, returned no 300-file cap, and the listed comparison paths were inspected:

| Source head | Ahead / behind main | Files | Classification / disposition |
|---|---:|---:|---|
| #442 forensic `4bfaffa5d44f` | 2 / 0 | 2 | Isolated fee-log synthetic regression+handoff; **not** a confidentiality remediation or clearance of #414 |
| #438 R30 docs `745004a16dbb` | 4 / 0 | 4 | Documentation/inventory only; do not duplicate |
| #445 R32 docs `bd1bc845bb85` | 4 / 0 | 3 | Documentation/inventory only; do not duplicate |
| #446 schedule UTF-16 `3104e010863a` | 4 / 0 | 4 | Unique `ux-schedule` production guard + dedicated regression, review ready, unmerged |
| #440 wallet hash `2b73dec30338` | 8 / 0 | 6 | **Stacked on #427**; four added child commits only. Preserve wallet-hash ancestry and merge order |
| #444 CSV writer `315941d85420` | 5 / 0 | 4 | Unique `ux-export` production guard + dedicated regression, review ready, unmerged |
| #447 QR classifier `17c638125ff6` | 4 / 0 | 4 | Unique `qrClassify` production guard + regression, review ready, unmerged |
| #439 manifest parser `c7a9f9148cee` | 4 / 0 | 4 | Unique `ux-notify` production guard + regression; already review ready; do not reimplement |
| #443 wallet test `4e1fa09571f9` | 13 / 0 | 8 | **Stacked on #441 → #440 → #427**, not 13 independent new fixes |
| #441 wallet readback `3c21b02194c9` | 10 / 0 | 7 | **Stacked on #440 → #427**, readback regressions; original parent #441 independently fails typecheck without #443 child |

This is a complete **new-head delta comparison**, not a claim that all 515 historical donors have been individually re-compared or fully code-reviewed against main this run. Preserve inherited conservative R30 triage (191 redundant ancestry, 172 code/test-ahead, 81 docs/other, **59 capped/semantically unqualified**, 1 unrelated Pages). Counts are prior provisional categories, not newly certified exhaustive equivalence or proof of mergeability.

## Actual engineering / CI actions

Read `AGENTS.md`, `docs/ai/WORKFLOW.md` and `docs/ai/HANDOFF.md`; reviewed the changed production/test patches, required workflow states, per-job CI and independent review records. All three existing PRs below were **promoted draft → ready for independent review**, with anchored **COMMENT** reviews only (not approval), and left unmerged:

| PR / exact head | Five workflow groups | Exact-head CI | Live action |
|---|---|---|---|
| [#444](https://github.com/djshellshoxxx/GhostPay/pull/444) `315941d854200b8c59b4ffb5565392a8662f9a3d` | all success | [44989323838](https://github.com/djshellshoxxx/GhostPay/actions/runs/44989323838), **24/24 success after failed-job rerun** | COMMENT review [6010943459](https://github.com/djshellshoxxx/GhostPay/pull/444#pullrequestreview-6010943459), promoted |
| [#446](https://github.com/djshellshoxxx/GhostPay/pull/446) `3104e010863a93e2d88911515542f858301f6112` | all success | [44993831441](https://github.com/djshellshoxxx/GhostPay/actions/runs/44993831441), **24/24 success** | COMMENT review [6010943948](https://github.com/djshellshoxxx/GhostPay/pull/446#pullrequestreview-6010943948), promoted |
| [#447](https://github.com/djshellshoxxx/GhostPay/pull/447) `17c638125ff66bde25fbd21fb434bc741b649032` | all success | [44995240009](https://github.com/djshellshoxxx/GhostPay/actions/runs/44995240009), **24/24 success** | COMMENT review [6010944409](https://github.com/djshellshoxxx/GhostPay/pull/447#pullrequestreview-6010944409), promoted |

**#444 rerun nuance:** first attempt failed an untouched 60-second passphrase test; after the previously requested rerun, GitHub now records CI SUCCESS at **attempt 2**. That result qualifies current hosted CI, but does not prove original test failure harmless or resolve possible performance intermittency.

Source: #444 rejects a second `ChunkWriter.header()` before modifying writer state, preserving buffered/chunked rows and BOM. #446 rejects unpaired surrogate code points in schedule names/memos while preserving valid astral pairs. #447 rejects unpaired surrogate code points before QR family detection, preserving valid Unicode. All three have dedicated committed regression cases. Scoped code review found no custody, contract, key-export, backend or deployment changes. No new application-code commit was authored in R33.

Overlap: #444 author previously scanned 202 then-open other PR path inventories (0 exact source collisions), #446 author scanned 204 (0), and this cycle additionally inspected changed-file lists of large/broad PRs #238/#239/#240/#269/#278/#310/#371/#372/#390/#397 (0 overlaps with `qrClassify`, `ux-schedule/src/validate` or `ux-export/src/encoder`). #447 has **not** received an independent full 206-PR path scan; targeted broad-PR checks are not a guarantee of semantic nonoverlap. Recheck head/path ownership at merge time.

**Qualification boundaries:** Hosted checks are real GitHub Actions at named SHAs, not local Vitest/TypeScript/native browser execution by this worker. No genuinely independent PR APPROVE exists for the three promoted PRs at this checkpoint. Do not equate CI green and self-authored COMMENT with merge/release approval.

## Beta feature recovery / carry-forward

- [#372 recovery/privacy](https://github.com/djshellshoxxx/GhostPay/pull/372): existing donor overlap analyzed in [R32 exact-blob handoff](https://github.com/djshellshoxxx/GhostPay/blob/bd1bc845bb855686ca48922baacc057c1c40dee2/docs/consolidation/20261122-r32/DONOR_OVERLAP.md). Four old v1.1 browser file blobs are already identical; `Pay.tsx`, `CreateInvoice.tsx` and localization differences were narrowed to apparent supersession but require native Firefox/WebKit camera/file/QR and proof-retention tests. **Do not overwrite #372 with older v1.1 source**.
- Dormant F04/F05/F10 donor commits are ancestors of F10 M3 preparation `7079eedfc67180c9a0012c7154758e41fe6208c9`. M3 single-use in-memory reference is **not** qualified for v1.1 activation: authenticated P04 issuance, encrypted durable P05 CAS/restart recovery and multi-tab/Firefox/WebKit are missing. Never represent the dormant ancestors as separate standalone fixes.
- Wallet safety stack: #427 → #440 → #441 → #443 requires combined head browser/TypeScript/wallet readback and hash-preservation qualification in integration order. #443 green does not automatically qualify parent #441 alone.
- [Confidentiality issue #414](https://github.com/djshellshoxxx/GhostPay/issues/414) remains unresolved; the #442 diagnostic does not demonstrate safety of real fee values. [#372 Mythril findings](https://github.com/djshellshoxxx/GhostPay/pull/372) (3 medium / 7 low from R30 artifact) are unwaived; browser recovery qualification and independent review outstanding.

## Non-negotiable integration state / next handoff

Re-read [integration lock](https://github.com/djshellshoxxx/GhostPay/blob/automation/ghostpay-integration-lock/integration-lock.json) at Git ref `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`: `status=held`, generation **11**, owner `994a0d214fb9-root-r3`, previous heartbeat 2026-11-20. Do not infer release from expired timestamp. No authorized lock transfer detected; **zero merges into main**.

Next: (1) genuinely independent review of #444/#446/#447 and beta wallet/recovery stacks; (2) verify any additional CI/branch head transitions and run focused native Firefox/WebKit tests; (3) close #372 Mythril/privacy and #414 evidence gates; (4) continue bounded blob/semantic analysis of 59 capped branches; (5) integrate only after lock owner release/transfer and all safety gates. No deploying, new relayers, hidden server component, signing, wallet transactions, force push or release.

R33 operations: exact SHA/PR census, ten new-head comparisons, diff/CI review, three GitHub comment reviews, three draft-to-ready transitions, and isolated documentation commits. **No production application code authored, no independent approval, no mainline merge, no deployment/release, no real funds.**


## New uncapped v1.1 → recovery/main Git-tree audit (R33 post-census)

[Full source-pinned, **uncapped** Git-tree/blob comparison](DONOR_TREE_DIFF.json) independently fetched `git/trees/{commit}?recursive=1` with `truncated=false` for all three exact commits: v1.1 donor `8c196d12fd45dc5a49a6c1d69f9b5d6c532994e9` (**5,299 blobs**), recovery [#372](https://github.com/djshellshoxxx/GhostPay/pull/372) `055d33e042c63edf1d5bbbdd7833d3c1ef93733d` (**5,762 blobs**), and main `eb59d93cffed7848c4aac37d0e9650b87239c6da` (**3,981 blobs**). This avoids the 300-file compare endpoint cap.

Of the **5,299 donor blobs**, **5,138 are byte-identical** in recovery (#372). The **161 different or missing** are exactly partitioned: **42 donor==main** (recovery has newer/different content), **58 recovery==main** (donor-only differences), **34 both donor/recovery independently diverge from main**, **13 both donor/recovery have a different blob for a path absent from main**, **14 donor-only paths absent from recovery**. All 14 missing paths are **non-browser** relayer, CLI, contracts and scripts/tests; do **not** import them into Pages-only beta.

For `apps/web/src/` specifically: **475 identical blobs**, **21 donor==main** (recovery changed), **20 both-divergent-from-main**, **10 new-in-both-but-different**, **zero donor-only missing paths** and **zero donor-new changes for which recovery simply remains main**. Thus no entirely missing browser `src` path was found in this donor, and no obviously unrepresented donor-only browser source change is proved by blob identity. **This does not prove feature parity:** the 30 browser paths with two different custom implementations need per-function behavior, provenance, security review and native browser regression; avoid merging donor versions by filename/size alone. R32 already provided bounded semantic analysis for `Pay.tsx`, `CreateInvoice.tsx`, `securityKeys.ts` and metadata retention differences.

**High-risk classification finding and scope clarification:** The 58 donor-only differences where recovery equals main are all outside `apps/web/src`, **but some live in browser-importable shared packages**, not exclusively relayer/CLI/contract paths. Do **not** assume all 58 are outside Pages scope. The additional [six-path shared-package source audit](DONOR_SHARED_PACKAGE_SEMANTIC.md) confirms current main/recovery retain stricter URI builder limits, BTC fee-cap validation and TRON scan abort checks absent in the old donor; do **not** copy over those older versions. The other 52 require per-path dependency and semantic review if proposed for integration. All 14 fully donor-only *absent* paths remain non-Pages relayer/CLI/contract/tooling tests. This is a safety triage, **not** a proof that recovered Pages code is complete. Continue reviewing the 30 custom-divergent browser paths and native #372/Mythril/Firefox/WebKit gates.
