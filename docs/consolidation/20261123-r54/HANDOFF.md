# GhostPay R54 — actual engineering checkpoint and durable handoff

Source census **2026-11-23T03:06:31.418Z UTC**. Repository `djshellshoxxx/GhostPay`. Protected-target main `eb59d93cffed7848c4aac37d0e9650b87239c6da`, unchanged. Existing **draft** [PR #471](https://github.com/djshellshoxxx/GhostPay/pull/471) is the owned isolated consolidation branch. R54 [complete source-pinned ledger](SEMANTIC_DISPOSITIONS.json) committed at `29c562132452fc7f9fba0bd75723dd687f214852`; [uncapped donor triage](SOURCE_TRIAGE.md) committed at `b57089818f4e4136cefa73f415bdb96a4a8ee15c`. This handoff itself advances the branch; always re-fetch live HEAD.

## Exhaustive live reconciliation

- Branch pages `100/100/100/100/100/58/0`: **558** branches. The separate immutable Git `matching-refs/heads/` returned **558**, exact names and SHA matched **558/558**, zero mismatches.
- Open PR pages `100/100/50/0`: **250** open PRs, of which **95** are stacked. Newly created, existing-owner BUG-only PRs **#490** `cf642259db1e9cfe63937dd2728d4d2336fa7bb0` and **#491** `8dd2dee49994f872aa9788206afa5878a2b49258` inventoried and left untouched. Existing PR #471 changed from R53's source-pinned census SHA to `10535d69e3badef4789c5902dd659e44f5ba3bdf` before R54 ledger publication.
- **309 finalized / 249 unresolved**. There were **zero newly finalized dispositions**; finalized does not mean merged into main. All historical branch identities and previously recorded evidence preserved.

## Implemented and confirmed vs pending

- Test-first source commits `a10d3171e1fb2b76148b6729ad2aa3ed1fa9f227` and `c1a08fef7079ec0798f648cceb44343c6c7e7788` add regressions for a finalized donor changing HEAD without renewed source proof, and inconsistent `main` SHA provenance.
- Fix `10535d69e3badef4789c5902dd659e44f5ba3bdf` changes `scripts/consolidation/validate-ledger.mjs` to require exact old/new SHA proof for advanced finalized non-main donors, while accepting legitimate main advancement and requiring `main` record SHA to equal `provenance.mainSha`. These are consolidation-tooling changes **only**.
- Prior R53 exact-head [CI 45098177216](https://github.com/djshellshoxxx/GhostPay/actions/runs/45098177216) completed **24/24 successful jobs**. R54 changes are **not** covered by that run. The initial fix-head [CI 45103888487](https://github.com/djshellshoxxx/GhostPay/actions/runs/45103888487) was in progress, and ledger [CI 45103995710](https://github.com/djshellshoxxx/GhostPay/actions/runs/45103995710) was pending during inspection. No native Node test run in this container: GitHub clone DNS unavailable. Check exact resulting HEAD before claiming qualification.
- Four historical donor branches received nontruncated recursive Git-tree comparisons against main, with path/blob evidence in SOURCE_TRIAGE.md. BTC spent-consent donor has **26 donor-only paths**, F03 browser qualification **96**, idle evidence **180**, QR older donor **757**; these counts do **not** establish unique safe implementation. All four histories remain unresolved pending owner/source/semantic review.

## Ownership and next executable actions

Integration lock ref `refs/heads/automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` remains **held**, generation **11**, owner `994a0d214fb9-root-r3`. Expiration by clock alone is not authorization to take over. Detailed branch protection returned **403**; API branch metadata `protected:false` does not override repo coordination policy. Recovery #372, scanner #466, QR #290, F10 #456 and browser/security acceptance remain unresolved. No independent approval or merging authorization has been established.

Next: verify exact-head R54 tests and CI; compare the BTC `BtcView.spentConsent.test.tsx` / `scan.spends.test.ts` paths against main and relevant owner PRs before recovering any narrow regression-only source. Continue the historical 59 capped donors and the 249 unresolved semantic histories using untruncated trees and content proof. Refresh ALL branches and PRs before any subsequent classification or merge; preserve existing owners. Do not conflate queued/skipped checks with passes.

**No protected-main merge, production app-code commit, deployment, release, real-funds test, deletion, force push or security-gate bypass occurred in R54. Consolidation remains incomplete.**

## R54 supplemental source qualification (after initial census)

- **One historical disposition finalized with complete untruncated source proof:** `chatgpt/btc-spent-qualification-20261119` at `7954f1e5a29988fb9239225d1f829c6c3dc71e08` has zero unique application/test blobs versus still-open draft PR #244 at `981cc2f4395d2d76c499a5cd46387daaaa3a6b1f`. Its sole donor-only file and all 14 shared blob differences are documentation or historical evidence. See [DONOR_EQUIVALENCE.md](DONOR_EQUIVALENCE.md).
- The R54 ledger was updated in commit `5b09d1c97f83769e7ea78e289e8e509952828ae7` to **310 finalized / 248 unresolved**, `newlyFinalized=1`, preserving `mainIntegrated=false` and an exact parent-head lease. The **558 branches / 250 PRs / 95 stacked** census and its checked-at time did not change. No source was merged into main and #244 still requires independent review and gates.
- F03 qualification donor vs owned PR #310 retains **13 shared-path differing app/test blobs** despite identical payment request files. It remains unresolved and should not be called redundant. See the exact blob comparison in DONOR_EQUIVALENCE.md.
- The earlier 309/249 figures above describe the **initial** R54 census, not the final R54 supplemental disposition. Only a source-proven reclassification changed these totals, not branch count.
