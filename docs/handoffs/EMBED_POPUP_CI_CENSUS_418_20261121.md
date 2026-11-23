# GhostPay continuation — Embed popup CI repair and 418-branch census

Captured: 2026-11-21 UTC. Repository: `djshellshoxxx/GhostPay`. No deploy, release, main merge, contract/fee/key changes or live transactions.

## Checkpoint and narrowly scoped repair

- Frozen `main`: `aec179910c39081d820396409ff3139ff2264132`.
- Parent: [draft PR #337](https://github.com/djshellshoxxx/GhostPay/pull/337) at `c9e7a21bf6353207fbddb6123ed1ef0379bdb00b`. It intentionally stops treating a `null` return from `window.open(..., 'popup,noopener,noreferrer')` as proof of a blocked popup.
- Its exact-head [CI run 44808355765](https://github.com/djshellshoxxx/GhostPay/actions/runs/44808355765) failed one stale assumption in `apps/web/src/embedV2.test.ts:259`: the iframe timeout fallback test still expected the removed `Popup blocked` title. The web shard completed **2,816 passing / 1 failing / 1 skipped** tests; the dependent TypeScript CI job also failed. The other four parent workflows succeeded.
- Child fix commit `40fbca0811dc135c3b9bdfaa385b6ab52d8be0db` updates the existing iframe fallback test to assert no misleading title and strengthens default popup mode with the same assertion. Only `apps/web/src/embedV2.test.ts` changed in that commit. The actual checkout URL, `noopener,noreferrer`, iframe postMessage origin checks, nonce, and production SDK remain unchanged.
- Qualification status: GitHub child CI not yet observed; independent review not yet recorded. The local environment cannot resolve `github.com`, so repository tests were not run locally. Do not claim the correction is green until exact-head CI completes.
- Avoid editing or merging the parent while its test repair is being qualified. Child branch `fix/ghostpay-embed-popup-legacy-test-20261120-r1` is based exactly on the parent; open a draft PR against the parent. Integrate child first only after independent review + required CI, then requalify the parent against current `main`.

## Branch discovery and ownership

- Live branch inventory fully paginated: `100 / 100 / 100 / 100 / 18 / 0` = **418 unique branch names**; no names from the historical 392-name baseline have disappeared.
- The historical frozen baseline is `docs/consolidation/current-census-20261120/CENSUS.json` (blob `b77a4a0f7ad997f502df47eaf6fe2318ceb41d26`, `main aa3df1cb`). **All 26 additions** were independently resolved to exact head SHA and compared to current `aec179910...`. See `BRANCH_DELTA_418_EMBED_CI_20261121.json`.
- **Redundant by ancestry:** the former #334 Bitcoin fee-floor branch is `ahead_by=0`; do not reapply.
- **Focused open code:** #328 vault rekey, #337 popup, #338 Bitcoin network, #339 evidence-boundary, #340/#342 TRON genesis, #345 policy review, and #350 duplicate router callback; qualify separately.
- **Stacked or overlapping:** receipt identity #332/#335, idle/backup #331/#333, transfer evidence #339/#347, privacy/wallet acceptance #348, recovery tests #346, request-file #344. Compare parent-vs-child commits rather than trusting huge main-relative changed-file lists.
- Six of the 26 comparisons returned exactly 300 files and may be truncated. Do not infer that missing files are absent.
- **Unfinished baseline review:** the original 392 branches were not all re-compared in this run; their older snapshot is not a current semantic uniqueness proof. Recheck exact heads before any selective merge.

## Handoff

1. Read new PR's exact head, compare its one-code-file change against parent #337 and verify popup + iframe fallback tests along with full web CI.
2. Re-run/qualify #337's entire integration head after incorporating the child, with independent source review and current-main conflict review.
3. Inspect other failing exact-head jobs (particularly #340's parent old tests; #342 repairs these; #338 may be structurally nonmergeable); keep draft unless all gates pass.
4. Refresh the live branch cursor and reconcile only new head changes against this exact JSON ledger. Do not duplicate overlapping security/privacy/custody implementations. Preserve static browser-only noncustodial scope and release prohibition.

No main merge, deployment, release or external provider interaction was performed by this work.
