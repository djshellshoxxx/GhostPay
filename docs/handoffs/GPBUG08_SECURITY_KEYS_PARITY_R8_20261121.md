# GhostPay GP-BUG-08 — policy import status i18n parity / branch census R8

## Source-pinned context
- Frozen main: `aec179910c39081d820396409ff3139ff2264132`; GitHub compare confirmed identical to current `main` at discovery.
- Existing GP-BUG-08 seller-identity parent: [PR #357](https://github.com/djshellshoxxx/GhostPay/pull/357), head `e871eccc1238b7145cd1d0a667afb393c373cf83`.
- Existing targeted child: [PR #362](https://github.com/djshellshoxxx/GhostPay/pull/362), head `67542c09ba180eec95004fb9b7a6d52d1a8dd809`; THIS branch is stacked on #362, not independently on main.
- CI failure reproduced from [#362 CI 44868582442](https://github.com/djshellshoxxx/GhostPay/actions/runs/44868582442), web test job `136738120339`: `securityKeys.test.ts:21` exhaustive classification fails because the added English key `policy.create.alreadySaved` is not in either explicit key category. Web suite: 2,824 passed, 1 failed, 1 skipped. TypeScript aggregator fails only because a prerequisite job failed.
- #362 already adds all three machine-drafted locale strings and exercises distinct recovery exports. Do NOT duplicate translations or relax tests.
- Fix commits: `4b6d0a7a331da39456839160657515e5cebb7510` classifies status in `SECURITY_KEY_GROUPS`; `908c2fd2e0a81cf7225848be96025703d402aac8` explicitly requires that key in the IN-3 security coverage regression.
- Census snapshot commit `394237ebdc19f43d9629f93b6c46fe9cafd81a04` saves `GHOSTPAY_BRANCH_R8_INCREMENTAL_20261121.json`.

## Change rationale / guardrails
An "already loaded" recovery record is a claim about imported seller-state identity. Treat it as security-sensitive source-English text until independently native-reviewed translations are authorized, consistent with `policy.create.imported`, `policy.create.otherKeys` and the existing explicit-allowlist safety model. Never weaken the exhaustive classification test or expose draft security copy as trusted. No payment transaction, wallet consent, keys, custody, server, Tor/HTTPS, dependencies, or production payment logic changed.

## Verification achieved / not achieved
- GitHub named-ref comparison of this patch against its exact #362 head originally returned ahead 2 / behind 0, changing only `securityKeys.ts` and `securityKeys.test.ts`.
- Source `en`, draft `es`, `ar`, `ja`, classification and explicit regression each contain `policy.create.alreadySaved` exactly once (connector-read inspection). Existing IN-3 test loops over all critical keys to enforce draft-English fallback.
- Full Vitest, TypeScript, static checks and browser E2E NOT executed locally. **Do not qualify this new head based on the old #362 CI or static inspection.** Trigger hosted exact-head checks through a draft child PR, obtain independent reviewer approval, integrate child into #362, then #362 into #357 and requalify the aggregate before any mainline merge.

## Exhaustive, nonduplicate branch checkpoint
- Full current branch pagination completed with terminal empty page: `100,100,100,100,37,0` = 437 unique names, none removed from R7; see `GHOSTPAY_BRANCH_R8_INCREMENTAL_20261121.json`.
- R7 at `0d8437c1097fad30d505c343ce4da356350ea4c3` had already compared **all 433** source-pinned names to the **same** frozen main (189 ancestry-redundant, 243 positive-ahead needing semantic review, 1 unrelated gh-pages history; 51 300-file-capped compares). Do not redundantly re-run those unchanged comparisons; revalidate any moving head before integration.
- Four named refs new to R7 snapshot: R7 census itself (documentation only); this repair branch (intentional GP-BUG-08 stack); `integrate/ghostpay-idle-main-scan-20261121-539818` (119 ahead); and `integration/ghostpay-idle-scan-candidate-20261121-fc3db` (121 ahead). The latter two both hit the 300-file GitHub comparison cap and overlap camera-import #258 and other active beta work. **No safe bulk merge** from either without per-commit, source-and-test review.
- Direct cross-compare of the two large integration candidates: 6 ahead/4 behind in one direction and 4 ahead/6 behind in the other, with >160 changed paths including idle-lock, receipts, wallet and recovery. They are divergent, not an interchangeable fast-forward.

## Other active beta gates / handoff
- [#258](https://github.com/djshellshoxxx/GhostPay/pull/258) camera visibility cancellation: refreshed head `d073414b718242eefdd22c0debc56901045d5f7a`; beta, Pages, Hosting kit passed, main CI queued at inspection; independent review absent. No merge yet.
- [#359](https://github.com/djshellshoxxx/GhostPay/pull/359) GP-BUG-07 test lint correction head `23f55bfea1068a5791b8e8e29409e4a13d0b28a3`: all four hosted workflows passed; parent [#345](https://github.com/djshellshoxxx/GhostPay/pull/345) still has failing old CI; integrate with lease/coordinator review, then rerun combined-head qualification.
- [#342](https://github.com/djshellshoxxx/GhostPay/pull/342) TRON selected-genesis test correction is green at `06fd87c3e90000118ffa94048529db36f0a67d41` but stacked on [#340](https://github.com/djshellshoxxx/GhostPay/pull/340), which is red. Reconcile and test, not direct independent main merge.
- [#352](https://github.com/djshellshoxxx/GhostPay/pull/352) wallet journal consent: Pages/Beta green, CI red (Pay.signer test expected `Continue` button). Keep hash concealed after reload until matching wallet account/chain authorization; do not weaken privacy assertions.
- No mainline merge, deployment, release, private-key handling or transaction occurred in this continuation. Integration remains qualified-and-reviewed-PR only.
