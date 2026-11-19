# GhostPay branch audit

## Later source refresh

The independent later census at **2026-11-19T08:08:41.919437+00:00** observed **269 remote heads** and
**258 PRs** against main [`a36f48da526b818a5940a7a0ed2ae7303ef17056`](https://github.com/djshellshoxxx/GhostPay/commit/a36f48da526b818a5940a7a0ed2ae7303ef17056).
There are **172 ancestor-contained heads including main, 13 patch-equivalent heads, and 84 heads with unique
non-merge patches**. PR states: **54 open, 62 merged, 142 closed unmerged**. This run merged #214; another
coordinator merged #216 at `a36f48da` during execution. The initial snapshot below remains unchanged as history.

Every later head is individually listed in [the refreshed branch inventory](branch-audit-latest.json), with
updated ancestry/rehearsal/classification and original-head comparison. [Refreshed PR inventory](pull-request-audit-latest.json)
includes new #258–#260. The maintenance branch publishing this report is created after this census; it adds one
documentation-only head and is not retroactively counted as an observed source branch.

| New branch | Head at census | PR | Disposition |
| --- | --- | --- | --- |
| `automation/20261119T073600Z/bug/camera-visibility` | `84398a79e18673f3e371a405931bc464e1cca99a` | [#258](https://github.com/djshellshoxxx/GhostPay/pull/258) | ACTIVE_DEVELOPMENT |
| `automation/ghostpay-integration-lock` | `914f8ce742e4282cc318268c088c8f4285556245` | — | RETAIN_FOR_REFERENCE |
| `integration/ghostpay-docs-recovery-20261119` | `4ff80733a3b36019e2f12fc21a8448e7666b6049` | [#259](https://github.com/djshellshoxxx/GhostPay/pull/259) | ACTIVE_DEVELOPMENT |
| `integration/ghostpay-recovery-reconciled-20261119` | `789e63501c1628d602006dbd324a36f8a9c50d71` | [#260](https://github.com/djshellshoxxx/GhostPay/pull/260) | ACTIVE_DEVELOPMENT |

| Moved branch | Initial head | Refreshed head |
| --- | --- | --- |
| `chatgpt/ghostpay-tm-hardening-20261118` | `f0c15de9b381` | `c17e5c387e3c` |
| `dependabot/npm_and_yarn/npm-minor-patch-71cdd1547c` | `7fab4b92f90d` | `3c95b2a00bdc` |
| `integration/ghostpay-idle-session-completion-20261119` | `df0d70de5b29` | `247c3353871b` |
| `main` | `e454de6abfef` | `a36f48da526b` |

PR #260 subsequently received documentation-only commit `f3bb7c662274c4a4394324c405b49517ad2b1461`, preserving
the tested product source `789e6350`. Old-head checks are historical after a branch moves; they do not qualify the new head.

### Active integration coordination

`automation/ghostpay-integration-lock` is a metadata-only tree. At inspection its lease was held by
`20261119T073600Z-root`, acquired/heartbeat `2026-11-19T07:55:03Z`, expiring `2026-11-19T08:55:03Z`.
This task neither acquired nor released it and does not merge or delete that branch. Main promotion must be
coordinated after rechecking that lease and fresh required CI. The branch's apparent removal of application paths
is its deliberately separate metadata tree, not a change to recover into the application.

## Initial snapshot and detailed evidence

## Scope and evidence

Snapshot captured **2026-11-19T07:44:23.498770+00:00**. Baseline: [`e454de6abfefda70d82784fafc1d8949b277c334`](https://github.com/djshellshoxxx/GhostPay/commit/e454de6abfefda70d82784fafc1d8949b277c334).
The full non-shallow clone advertised **265 remote branch heads** (excluding the `origin/HEAD` alias).
The paginated GitHub API returned **255 pull requests**: 53 open, 60 merged and 142 closed without merging
at initial discovery. All 255 advertised pull-request heads were fetched, including historical closed PRs.
There was one accessible regular issue, #38. Deleted/inaccessible issues and unreachable objects cannot be certified by this census.

Mechanical results: **170 ancestor heads (including main), 13 patch-equivalent heads, 82 heads with unique
non-merge patches**. Rehearsals: 47 clean, 47 conflicting, one unrelated publication history. Counts overlap
neither branches nor classifications; commit/feature counts across stacked branches do overlap.

All 265 heads received mechanical inventory and disposition; semantic review was targeted to the documented
workstreams and historical refs. Per-record review-depth and evidence fields distinguish those levels.

This is a source-pinned inventory, not a claim that all 82 histories represent missing features or that all
265 branches are release-qualified. A clean merge, ancestor relationship or patch-ID match does not establish
that later edits retained the behavior. The source reviews and exact-head checks are recorded separately.
No remote branch has been deleted. `main` and generated `gh-pages` are retained.

The machine-readable [branch evidence](branch-audit.json) records every head's purpose, linked PRs, ahead/behind
counts, unique commit SHAs and subjects, changed paths, merge base, rehearsed conflicts, containment relationships,
functional-completeness limit, security implications and decision rationale. [PR evidence](pull-request-audit.json)
covers every discovered open, draft, closed and merged PR, preserving original refs/state/timestamps and newer check observations.
CI on a moved head is explicitly marked against both the branch snapshot and the latest observed head.
Initial check observations without a retained retrieval timestamp are labeled unknown rather than assigned a fabricated time.
New observations carry their actual UTC retrieval time; old-head results remain historical when an owner pushes again.

## Classifications

| Classification | Branches |
| --- | ---: |
| ACTIVE_DEVELOPMENT | 8 |
| DUPLICATE_OR_SUPERSEDED | 25 |
| PARTIALLY_RECOVERABLE | 25 |
| REPAIR_THEN_MERGE | 16 |
| RETAIN_FOR_REFERENCE | 17 |
| SAFE_TO_DELETE_AFTER_VERIFICATION | 169 |
| SECURITY_BLOCKED | 5 |

`SAFE_TO_DELETE_AFTER_VERIFICATION` means ancestry permits a later cleanup review; it does not authorize or
perform deletion. Existing owner claims and repository policy must still be checked. Old automation and
experimental custody/recovery branches remain outside the active Pages release.

## Complete branch inventory

Ahead/behind counts compare the exact branch head to the baseline. Unique counts use patch equivalence for
non-merge commits. Detailed changed files and evidence are in the JSON; generated `gh-pages` output is never a source recovery candidate.

| Branch | Head | PRs | Ahead / behind | Unique patches | Merge rehearsal | Classification |
| --- | --- | --- | ---: | ---: | --- | --- |
| `ai/agent-harness-20261113` | `15dc9c192c60` | [#152](https://github.com/djshellshoxxx/GhostPay/pull/152) | 0 / 1500 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `automation/api-funded-ghostpay-cloud-20261103` | `29ce481d2d4a` | [#48](https://github.com/djshellshoxxx/GhostPay/pull/48) | 0 / 1514 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `automation/ghostpay-parallel-four-agents-20261103` | `68dc5b502f25` | [#52](https://github.com/djshellshoxxx/GhostPay/pull/52) | 6 / 1512 | 6 | clean | RETAIN_FOR_REFERENCE |
| `automation/ghostpay-parallel-review-wave-20261103` | `03a3f5701c89` | [#53](https://github.com/djshellshoxxx/GhostPay/pull/53) | 0 / 1509 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `automation/ghostpay-recurrent-backlog-20261103` | `5835736c1296` | [#51](https://github.com/djshellshoxxx/GhostPay/pull/51) | 3 / 1512 | 3 | conflicts | RETAIN_FOR_REFERENCE |
| `backup/codex-observed-pr37-915d710-20261028` | `915d71053e23` | — | 0 / 1350 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `backup/pr30-before-consolidation-20261025` | `356fe5e44d42` | — | 0 / 1493 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `backup/pr31-before-consolidation-20261025` | `a2217ea1ccdd` | — | 0 / 1515 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/btc-spent-private-scan-20261118` | `2364284a2717` | [#244](https://github.com/djshellshoxxx/GhostPay/pull/244) | 17 / 6 | 15 | clean | PARTIALLY_RECOVERABLE |
| `chatgpt/btc-spentness-private-scan-20261118` | `8c1d87a25872` | [#254](https://github.com/djshellshoxxx/GhostPay/pull/254) | 11 / 6 | 9 | clean | ACTIVE_DEVELOPMENT |
| `chatgpt/consolidation-reconciliation-20261113` | `3cf3437a8d9d` | [#146](https://github.com/djshellshoxxx/GhostPay/pull/146) | 0 / 1504 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-beta-consolidation-20261118` | `df5e4f6990bd` | [#232](https://github.com/djshellshoxxx/GhostPay/pull/232) | 4 / 11 | 4 | conflicts | REPAIR_THEN_MERGE |
| `chatgpt/ghostpay-beta-log-artifact-20261118` | `7109290b7e4f` | [#237](https://github.com/djshellshoxxx/GhostPay/pull/237) | 0 / 10 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-beta-qualification-20261112` | `c11f905b362a` | [#136](https://github.com/djshellshoxxx/GhostPay/pull/136) | 0 / 627 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-billing-horizon-port-20261112` | `eb21d57c8ad1` | [#130](https://github.com/djshellshoxxx/GhostPay/pull/130) | 0 / 748 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-cli-sentinel-port-20261112` | `3fd18ef4011b` | [#129](https://github.com/djshellshoxxx/GhostPay/pull/129) | 0 / 747 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-historical-consolidation-20261115` | `7dc7eccc34af` | — | 7 / 369 | 5 | clean | DUPLICATE_OR_SUPERSEDED |
| `chatgpt/ghostpay-idle-lifecycle-20261119` | `7e6089e2e40a` | — | 84 / 7 | 68 | conflicts | REPAIR_THEN_MERGE |
| `chatgpt/ghostpay-idle-lifecycle-qualified-20261119` | `d5fe06e7a7b3` | — | 2 / 1 | 2 | clean | PARTIALLY_RECOVERABLE |
| `chatgpt/ghostpay-integration-matrix-20261112` | `1a5e815d8446` | [#128](https://github.com/djshellshoxxx/GhostPay/pull/128) | 0 / 748 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-invoice-validation-20261118` | `5e9e7be70399` | [#234](https://github.com/djshellshoxxx/GhostPay/pull/234) | 0 / 10 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-merchant-csv-port-20261112` | `bbc7dda4ce27` | [#131](https://github.com/djshellshoxxx/GhostPay/pull/131) | 0 / 748 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-mythril-checker-failclosed-20261118` | `94ca7d5ba9dc` | [#225](https://github.com/djshellshoxxx/GhostPay/pull/225) | 7 / 15 | 7 | conflicts | SECURITY_BLOCKED |
| `chatgpt/ghostpay-onion-canonical-port-20261112` | `8277879eeaa0` | [#134](https://github.com/djshellshoxxx/GhostPay/pull/134) | 0 / 747 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-own-node-guard-20261118` | `685fe1a39a3f` | [#228](https://github.com/djshellshoxxx/GhostPay/pull/228) | 3 / 15 | 3 | conflicts | PARTIALLY_RECOVERABLE |
| `chatgpt/ghostpay-pages-checkpoint-v4-20261118` | `a5076f4d4e8d` | [#235](https://github.com/djshellshoxxx/GhostPay/pull/235) | 0 / 10 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-pages-client-hardening-20261115` | `f3872e90eb25` | [#166](https://github.com/djshellshoxxx/GhostPay/pull/166) | 0 / 584 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-pages-gp02-gp04-review-20261115` | `9b3a3070499a` | [#165](https://github.com/djshellshoxxx/GhostPay/pull/165) | 0 / 588 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-pages-idle-clock-20261118` | `613667be4eeb` | [#227](https://github.com/djshellshoxxx/GhostPay/pull/227) | 0 / 10 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-pages-second-pass-notes-20261115` | `cf6a8d69620a` | [#167](https://github.com/djshellshoxxx/GhostPay/pull/167) | 0 / 583 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-pinned-signer-completion-20261119` | `276aed60f196` | [#243](https://github.com/djshellshoxxx/GhostPay/pull/243) | 91 / 7 | 75 | conflicts | ACTIVE_DEVELOPMENT |
| `chatgpt/ghostpay-privacy-browser-fixtures-20261118` | `67cf835d0bf5` | [#233](https://github.com/djshellshoxxx/GhostPay/pull/233) | 3 / 15 | 3 | conflicts | PARTIALLY_RECOVERABLE |
| `chatgpt/ghostpay-private-scan-completion-20261119` | `18b367457103` | [#248](https://github.com/djshellshoxxx/GhostPay/pull/248) | 3 / 0 | 1 | clean | ACTIVE_DEVELOPMENT |
| `chatgpt/ghostpay-recovery-review-20261118` | `18110015e99e` | [#229](https://github.com/djshellshoxxx/GhostPay/pull/229) | 7 / 16 | 7 | conflicts | PARTIALLY_RECOVERABLE |
| `chatgpt/ghostpay-remaining-work-20261119` | `28edbcf55093` | [#246](https://github.com/djshellshoxxx/GhostPay/pull/246) | 84 / 3 | 67 | conflicts | REPAIR_THEN_MERGE |
| `chatgpt/ghostpay-rpc-filter-guard-20261114` | `dfed84c18b5f` | — | 2 / 369 | 1 | conflicts | DUPLICATE_OR_SUPERSEDED |
| `chatgpt/ghostpay-rpc-filter-guard-beta-20261114` | `73923350fcda` | — | 5 / 385 | 0 | clean | DUPLICATE_OR_SUPERSEDED |
| `chatgpt/ghostpay-sensitive-surface-audit-20261115` | `90a145740a16` | [#168](https://github.com/djshellshoxxx/GhostPay/pull/168) | 0 / 582 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-sensitive-surface-fourth-pass-20261115` | `97a617b5b95f` | [#169](https://github.com/djshellshoxxx/GhostPay/pull/169) | 0 / 581 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-six-fixes-combined-20261112` | `36dfa8d26d4e` | — | 6 / 749 | 0 | clean | DUPLICATE_OR_SUPERSEDED |
| `chatgpt/ghostpay-sonar-review-20261118` | `3a3b136a326e` | [#226](https://github.com/djshellshoxxx/GhostPay/pull/226) | 6 / 15 | 6 | conflicts | PARTIALLY_RECOVERABLE |
| `chatgpt/ghostpay-sweep-balance-consent-20261118` | `d9ff386807de` | [#231](https://github.com/djshellshoxxx/GhostPay/pull/231) | 1 / 11 | 1 | conflicts | PARTIALLY_RECOVERABLE |
| `chatgpt/ghostpay-sweep-ledger-memory-20261118` | `0b2609c2c831` | [#230](https://github.com/djshellshoxxx/GhostPay/pull/230) | 3 / 15 | 3 | conflicts | PARTIALLY_RECOVERABLE |
| `chatgpt/ghostpay-tm-hardening-20261118` | `f0c15de9b381` | [#249](https://github.com/djshellshoxxx/GhostPay/pull/249) | 85 / 7 | 69 | conflicts | ACTIVE_DEVELOPMENT |
| `chatgpt/ghostpay-top-down-audit-20261115` | `775756931be4` | [#170](https://github.com/djshellshoxxx/GhostPay/pull/170) | 0 / 580 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-ux-clock-port-20261112` | `c3173f849ad6` | [#132](https://github.com/djshellshoxxx/GhostPay/pull/132) | 0 / 747 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-ux-guide-port-20261112` | `f3a9b2389f8b` | [#133](https://github.com/djshellshoxxx/GhostPay/pull/133) | 0 / 747 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/ghostpay-viem-alignment-20261118` | `defdaa308a2d` | [#236](https://github.com/djshellshoxxx/GhostPay/pull/236) | 2 / 15 | 2 | conflicts | REPAIR_THEN_MERGE |
| `chatgpt/pages-browser-fixes-combined-20261114` | `73923350fcda` | [#161](https://github.com/djshellshoxxx/GhostPay/pull/161) | 5 / 385 | 0 | clean | DUPLICATE_OR_SUPERSEDED |
| `chatgpt/pages-release-gate-audit-20261114` | `2221a6117cdc` | [#160](https://github.com/djshellshoxxx/GhostPay/pull/160) | 2 / 385 | 2 | conflicts | REPAIR_THEN_MERGE |
| `chatgpt/spec18-recovery-completion-20261118` | `38d69832ddc5` | [#240](https://github.com/djshellshoxxx/GhostPay/pull/240) | 89 / 7 | 73 | conflicts | REPAIR_THEN_MERGE |
| `chatgpt/spec18-recovery-reviewed-20261118-a264` | `4a1b181c89e0` | [#239](https://github.com/djshellshoxxx/GhostPay/pull/239) | 89 / 7 | 73 | conflicts | REPAIR_THEN_MERGE |
| `chatgpt/zero-codex-continuation-spec-20261109` | `d15921981ecf` | [#101](https://github.com/djshellshoxxx/GhostPay/pull/101) | 0 / 1504 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/audit-main-20261118-r185` | `a238c22dbc8a` | [#214](https://github.com/djshellshoxxx/GhostPay/pull/214) | 14 / 15 | 14 | clean | PARTIALLY_RECOVERABLE |
| `chatgpt/zero-codex/audit-pages-release-20261112` | `364b01f84739` | [#139](https://github.com/djshellshoxxx/GhostPay/pull/139) | 43 / 532 | 43 | clean | REPAIR_THEN_MERGE |
| `chatgpt/zero-codex/audit-secret-box-20261110` | `621ee0af3f47` | [#103](https://github.com/djshellshoxxx/GhostPay/pull/103) | 0 / 897 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/b0-receipt-recovery-20261110` | `0a61e2c7fc54` | [#108](https://github.com/djshellshoxxx/GhostPay/pull/108) | 0 / 924 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/cli-sentinel-value-20261111` | `a6e74591e134` | [#125](https://github.com/djshellshoxxx/GhostPay/pull/125) | 2 / 925 | 0 | clean | DUPLICATE_OR_SUPERSEDED |
| `chatgpt/zero-codex/docs-pages-scope-20261112` | `c5efadab9d9a` | [#140](https://github.com/djshellshoxxx/GhostPay/pull/140) | 110 / 424 | 110 | clean | REPAIR_THEN_MERGE |
| `chatgpt/zero-codex/docs-postmerge-wiki-20261118` | `362dfa999a96` | [#215](https://github.com/djshellshoxxx/GhostPay/pull/215) | 25 / 15 | 25 | clean | REPAIR_THEN_MERGE |
| `chatgpt/zero-codex/docs-wiki-20261110` | `fa375dbc1f24` | [#104](https://github.com/djshellshoxxx/GhostPay/pull/104) | 0 / 864 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/handoff-postmerge-20261118` | `bb193849a568` | [#216](https://github.com/djshellshoxxx/GhostPay/pull/216) | 14 / 15 | 14 | clean | REPAIR_THEN_MERGE |
| `chatgpt/zero-codex/merchant-csv-safety-20261111` | `afaf7ce62d2b` | [#124](https://github.com/djshellshoxxx/GhostPay/pull/124) | 0 / 922 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/merchant-schedule-horizon-20261111` | `7cdc6b32ecaf` | [#123](https://github.com/djshellshoxxx/GhostPay/pull/123) | 1 / 925 | 0 | clean | DUPLICATE_OR_SUPERSEDED |
| `chatgpt/zero-codex/onion-canonical-host-20261111` | `72dde82d9d89` | [#122](https://github.com/djshellshoxxx/GhostPay/pull/122) | 2 / 925 | 0 | clean | DUPLICATE_OR_SUPERSEDED |
| `chatgpt/zero-codex/ops-monitor-bounded-fetch-20261110` | `5280569b7eaa` | [#106](https://github.com/djshellshoxxx/GhostPay/pull/106) | 0 / 922 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-autoclear-enable-retained-hash-20261117` | `9732adb949cc` | [#198](https://github.com/djshellshoxxx/GhostPay/pull/198) | 0 / 558 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-backup-gate-verified-only-20261115` | `433307b869ac` | [#171](https://github.com/djshellshoxxx/GhostPay/pull/171) | 0 / 581 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-bearer-qr-warning-20261114` | `81fd4c032e29` | [#156](https://github.com/djshellshoxxx/GhostPay/pull/156) | 0 / 590 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-combined-qualification-20261113` | `ab427ab81c7b` | [#143](https://github.com/djshellshoxxx/GhostPay/pull/143) | 0 / 605 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-download-cleanup-20261116` | `cf5ad81cab48` | [#178](https://github.com/djshellshoxxx/GhostPay/pull/178) | 0 / 571 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-fragment-history-state-20261117` | `68993c668aa7` | [#197](https://github.com/djshellshoxxx/GhostPay/pull/197) | 0 / 560 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-fragment-shell-gates-20261117` | `120dcd7fc15b` | [#196](https://github.com/djshellshoxxx/GhostPay/pull/196) | 0 / 562 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-hash-navigation-exceptions-20261117` | `b570d4bb748d` | [#199](https://github.com/djshellshoxxx/GhostPay/pull/199) | 0 / 557 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-invoice-stale-submit-20261115` | `dffe072511c3` | [#174](https://github.com/djshellshoxxx/GhostPay/pull/174), [#172](https://github.com/djshellshoxxx/GhostPay/pull/172) | 0 / 579 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-keystore-reimport-control-20261118` | `30cc4560c6a7` | [#202](https://github.com/djshellshoxxx/GhostPay/pull/202) | 0 / 553 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-late-invoice-focus-20261117` | `23cc6db4b924` | [#200](https://github.com/djshellshoxxx/GhostPay/pull/200) | 0 / 556 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-manifest-disclosure-rejection-20261113` | `907e2919e930` | [#144](https://github.com/djshellshoxxx/GhostPay/pull/144) | 0 / 597 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-manifest-gates-20261117` | `12e18931ae99` | [#195](https://github.com/djshellshoxxx/GhostPay/pull/195) | 0 / 563 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-negative-fiat-regression-20261114` | `9bdc9cbade90` | [#154](https://github.com/djshellshoxxx/GhostPay/pull/154) | 1 / 591 | 1 | clean | DUPLICATE_OR_SUPERSEDED |
| `chatgpt/zero-codex/pages-owner-ci-handoff-20261114` | `83fe9b022d2b` | [#153](https://github.com/djshellshoxxx/GhostPay/pull/153) | 42 / 560 | 42 | clean | REPAIR_THEN_MERGE |
| `chatgpt/zero-codex/pages-owner-transfer-filter-20261115` | `cf5e876ce164` | [#163](https://github.com/djshellshoxxx/GhostPay/pull/163) | 3 / 369 | 1 | conflicts | DUPLICATE_OR_SUPERSEDED |
| `chatgpt/zero-codex/pages-pay-rich-tags-20261117` | `c15833bc2aa6` | [#194](https://github.com/djshellshoxxx/GhostPay/pull/194) | 0 / 564 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-qr-combined-20261115` | `26f83ccdda98` | [#162](https://github.com/djshellshoxxx/GhostPay/pull/162) | 7 / 385 | 1 | conflicts | DUPLICATE_OR_SUPERSEDED |
| `chatgpt/zero-codex/pages-reconciliation-e2e-proof-20261116` | `57acf1b06b3b` | [#175](https://github.com/djshellshoxxx/GhostPay/pull/175) | 0 / 575 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-reconciliation-idb-retry-20261113` | `c8d4c42bee72` | [#145](https://github.com/djshellshoxxx/GhostPay/pull/145) | 0 / 592 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-reconciliation-imported-link-20261115` | `97cf5a0cda25` | [#173](https://github.com/djshellshoxxx/GhostPay/pull/173) | 0 / 576 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-relayer-stream-limit-20261114` | `9a84764e7060` | [#158](https://github.com/djshellshoxxx/GhostPay/pull/158) | 0 / 590 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-renderer-own-property-20261116` | `dd4a7eb4dd71` | [#192](https://github.com/djshellshoxxx/GhostPay/pull/192) | 0 / 568 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-rpc-http-status-20261113` | `68aca93bc19e` | [#141](https://github.com/djshellshoxxx/GhostPay/pull/141) | 0 / 608 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-same-view-invoice-focus-20261117` | `2fb89ff5f2dc` | [#201](https://github.com/djshellshoxxx/GhostPay/pull/201) | 0 / 554 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-scan-transfer-filter-20261114` | `7b6c4983e5c0` | [#159](https://github.com/djshellshoxxx/GhostPay/pull/159) | 2 / 385 | 0 | clean | DUPLICATE_OR_SUPERSEDED |
| `chatgpt/zero-codex/pages-smoke-project-boundary-20261113` | `eece5aff5542` | [#142](https://github.com/djshellshoxxx/GhostPay/pull/142) | 0 / 604 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-tag-store-closed-connection-20261116` | `17f681915f25` | [#177](https://github.com/djshellshoxxx/GhostPay/pull/177) | 0 / 573 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/pages-tagarchive-blocked-click-20261117` | `8aed22ad44ee` | [#193](https://github.com/djshellshoxxx/GhostPay/pull/193) | 1 / 568 | 1 | conflicts | DUPLICATE_OR_SUPERSEDED |
| `chatgpt/zero-codex/pages-verifier-comment-attrs-20261112` | `6f59cc2cb7ad` | [#138](https://github.com/djshellshoxxx/GhostPay/pull/138) | 0 / 608 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/qualify-98-20261110` | `a2f4205f900d` | [#102](https://github.com/djshellshoxxx/GhostPay/pull/102) | 0 / 896 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/receipt-boundary-regressions-20261110` | `83d17adb4a07` | [#105](https://github.com/djshellshoxxx/GhostPay/pull/105) | 0 / 924 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/recovery-auth-negative-20261110` | `969d1b270b24` | [#109](https://github.com/djshellshoxxx/GhostPay/pull/109) | 0 / 923 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/rpc-concurrent-byte-budget-20261110` | `b12a20e1d6e2` | [#111](https://github.com/djshellshoxxx/GhostPay/pull/111) | 0 / 922 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/rpc-response-correlation-20261110` | `bbe300b7fb21` | [#110](https://github.com/djshellshoxxx/GhostPay/pull/110) | 0 / 921 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/signed-receipt-no-rpc-proof-20261110` | `0ab175e55248` | [#107](https://github.com/djshellshoxxx/GhostPay/pull/107) | 0 / 924 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `chatgpt/zero-codex/ux-confirm-clock-boundary-20261111` | `d77956901d95` | [#126](https://github.com/djshellshoxxx/GhostPay/pull/126) | 2 / 925 | 0 | clean | DUPLICATE_OR_SUPERSEDED |
| `chatgpt/zero-codex/ux-guide-plain-object-20261111` | `cf3a8b23a199` | [#127](https://github.com/djshellshoxxx/GhostPay/pull/127) | 3 / 925 | 2 | clean | DUPLICATE_OR_SUPERSEDED |
| `checkpoint/ghostpay-recovery-20261102` | `1dffa5a366fc` | [#46](https://github.com/djshellshoxxx/GhostPay/pull/46) | 0 / 1516 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `checkpoint/ghostpay-source-reconciliation-20261101` | `243d98d67c7c` | — | 2 / 1195 | 2 | clean | RETAIN_FOR_REFERENCE |
| `claude/admiring-albattani-6kydor` | `ef610872aa4e` | [#208](https://github.com/djshellshoxxx/GhostPay/pull/208), [#84](https://github.com/djshellshoxxx/GhostPay/pull/84) | 1 / 15 | 1 | clean | RETAIN_FOR_REFERENCE |
| `claude/adoring-wozniak-850ue6` | `a2217ea1ccdd` | [#31](https://github.com/djshellshoxxx/GhostPay/pull/31), [#28](https://github.com/djshellshoxxx/GhostPay/pull/28), [#27](https://github.com/djshellshoxxx/GhostPay/pull/27) | 0 / 1515 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ar-a0-pr47-green` | `4a38efdfa999` | [#59](https://github.com/djshellshoxxx/GhostPay/pull/59) | 0 / 1184 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ar-a4-btc-headersync` | `27d1580c5c53` | [#74](https://github.com/djshellshoxxx/GhostPay/pull/74) | 0 / 1176 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ar-a5-announcer-budget` | `d9fe8b4e9c02` | [#70](https://github.com/djshellshoxxx/GhostPay/pull/70) | 0 / 1181 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ar-a6-combined-backup` | `f5d219851a47` | [#61](https://github.com/djshellshoxxx/GhostPay/pull/61) | 0 / 1175 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ar-a7-policy-send-guard` | `f7b8ee9db981` | [#65](https://github.com/djshellshoxxx/GhostPay/pull/65) | 0 / 1178 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ar-b1-core-journey` | `e0a499bdd95d` | [#62](https://github.com/djshellshoxxx/GhostPay/pull/62) | 0 / 1179 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ar-b2-lean-bound-receipts` | `2bcfd11f9dc5` | [#64](https://github.com/djshellshoxxx/GhostPay/pull/64) | 0 / 1180 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ar-b3-sweep-permit-states` | `9d100956f08d` | [#69](https://github.com/djshellshoxxx/GhostPay/pull/69) | 0 / 1153 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ar-b5-testnet-feeds` | `76199cdac3ee` | [#72](https://github.com/djshellshoxxx/GhostPay/pull/72) | 0 / 1183 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ar-c1-reconciliation-adr` | `1e87109119c1` | [#71](https://github.com/djshellshoxxx/GhostPay/pull/71) | 0 / 1180 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ar-c2-qr-pairing` | `78be1730ad2a` | [#60](https://github.com/djshellshoxxx/GhostPay/pull/60) | 0 / 1178 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ar-c4-i18n-create-b4-buffer-ui` | `4fe95fc0f6f5` | [#68](https://github.com/djshellshoxxx/GhostPay/pull/68) | 0 / 1163 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ar-c4-i18n-pay` | `e02d04c75406` | [#66](https://github.com/djshellshoxxx/GhostPay/pull/66) | 0 / 1181 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ar-c4-i18n-scan` | `7f4702fdd366` | [#67](https://github.com/djshellshoxxx/GhostPay/pull/67) | 0 / 1175 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ar-c5-device-matrix` | `92af349a2e87` | [#73](https://github.com/djshellshoxxx/GhostPay/pull/73) | 0 / 1181 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ar-c7-embed-iframe-e2e` | `2b9db8ab1998` | [#63](https://github.com/djshellshoxxx/GhostPay/pull/63) | 0 / 1180 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/consolidation-2026-11-04` | `a28ca06a83dc` | [#78](https://github.com/djshellshoxxx/GhostPay/pull/78) | 0 / 1051 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/cool-albattani-xopr89` | `7373172db4cf` | [#30](https://github.com/djshellshoxxx/GhostPay/pull/30), [#26](https://github.com/djshellshoxxx/GhostPay/pull/26) | 0 / 1428 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/cw-c2` | `b9cba0978cad` | — | 0 / 1086 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/cw-c4` | `511c23bd9255` | — | 0 / 1092 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/cw-c5` | `99d80dcd0e18` | — | 0 / 1086 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/cw-w1` | `704e268bfa7d` | — | 0 / 1092 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/cw-w10` | `391454b2609b` | — | 0 / 1069 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/cw-w11` | `764020c208c1` | — | 0 / 1070 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/cw-w5` | `f030376a3314` | — | 0 / 1091 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/cw-w6` | `16cddc219317` | — | 0 / 1086 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/cw-w7` | `a4ee36ee4328` | — | 0 / 1070 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/cw-w8` | `f162960457b4` | [#79](https://github.com/djshellshoxxx/GhostPay/pull/79) | 0 / 1507 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/cw-w9` | `8303c8c6a79c` | — | 0 / 1070 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/docs-screenshots` | `0476cb117ff5` | [#112](https://github.com/djshellshoxxx/GhostPay/pull/112) | 0 / 1504 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/docs-snapshot-1` | `dc2340c99825` | [#9](https://github.com/djshellshoxxx/GhostPay/pull/9) | 0 / 2165 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/docs-snapshot-2` | `e1a92c876c44` | [#10](https://github.com/djshellshoxxx/GhostPay/pull/10) | 0 / 2164 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/exciting-brown-7v69cr` | `b1327d4d0e26` | [#218](https://github.com/djshellshoxxx/GhostPay/pull/218), [#119](https://github.com/djshellshoxxx/GhostPay/pull/119) | 34 / 15 | 31 | conflicts | PARTIALLY_RECOVERABLE |
| `claude/friendly-turing-1ui0on` | `f4e79b078514` | — | 2 / 15 | 1 | clean | RETAIN_FOR_REFERENCE |
| `claude/gallant-hamilton-4wzkyn` | `ca358acfa8f4` | [#121](https://github.com/djshellshoxxx/GhostPay/pull/121) | 0 / 749 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ghostpay-autonomous-completion-y4sk2h` | `b6a0871d0618` | [#37](https://github.com/djshellshoxxx/GhostPay/pull/37) | 0 / 1202 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ghostpay-autonomous-prompt-scpgun` | `1db8e967af91` | [#58](https://github.com/djshellshoxxx/GhostPay/pull/58) | 0 / 1507 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ghostpay-completion-audit-ot5jjm` | `b5e2ea3e5030` | [#209](https://github.com/djshellshoxxx/GhostPay/pull/209) | 24 / 15 | 21 | conflicts | PARTIALLY_RECOVERABLE |
| `claude/ghostpay-consolidation-9xhtxg` | `c487f0fe649e` | [#206](https://github.com/djshellshoxxx/GhostPay/pull/206) | 0 / 13 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ghostpay-consolidation-9xhtxg-feeguard` | `9e5cc3789b7b` | [#217](https://github.com/djshellshoxxx/GhostPay/pull/217) | 1 / 15 | 1 | clean | SECURITY_BLOCKED |
| `claude/ghostpay-consolidation-9xhtxg-security` | `4894d0d8d943` | [#212](https://github.com/djshellshoxxx/GhostPay/pull/212) | 6 / 15 | 6 | clean | PARTIALLY_RECOVERABLE |
| `claude/ghostpay-consolidation-9xhtxg-spec18` | `ebf7c92c3be1` | [#213](https://github.com/djshellshoxxx/GhostPay/pull/213) | 6 / 16 | 6 | conflicts | PARTIALLY_RECOVERABLE |
| `claude/ghostpay-github-pages-up6cj6` | `ac08062ec540` | [#137](https://github.com/djshellshoxxx/GhostPay/pull/137) | 0 / 611 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/ghostpay-lean-core-milestone-t5lwox` | `2527d6b93678` | [#151](https://github.com/djshellshoxxx/GhostPay/pull/151) | 8 / 1505 | 4 | conflicts | DUPLICATE_OR_SUPERSEDED |
| `claude/gifted-planck-115x2k` | `1d28f24d86f4` | [#39](https://github.com/djshellshoxxx/GhostPay/pull/39) | 4 / 1208 | 3 | conflicts | DUPLICATE_OR_SUPERSEDED |
| `claude/gracious-heisenberg-97ji6q` | `c6ce2259e7f1` | [#115](https://github.com/djshellshoxxx/GhostPay/pull/115) | 0 / 1483 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/haiku-wave-2-handoff-qepfoe` | `8d1bde36bb7d` | [#43](https://github.com/djshellshoxxx/GhostPay/pull/43) | 3 / 1195 | 0 | conflicts | DUPLICATE_OR_SUPERSEDED |
| `claude/happy-maxwell-onl4x5` | `fd710eb367ef` | [#44](https://github.com/djshellshoxxx/GhostPay/pull/44) | 1 / 1195 | 1 | conflicts | DUPLICATE_OR_SUPERSEDED |
| `claude/hopeful-bardeen-8ch6l8` | `2a5b29de6a71` | [#155](https://github.com/djshellshoxxx/GhostPay/pull/155) | 0 / 1504 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/inspiring-fermat-vxv689` | `c1c4ac9b6481` | [#2](https://github.com/djshellshoxxx/GhostPay/pull/2) | 0 / 2195 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/kind-faraday-8qzf6e` | `1e4d19f1a533` | [#117](https://github.com/djshellshoxxx/GhostPay/pull/117) | 0 / 904 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/laughing-bardeen-4t20ys` | `e96cee1a4e12` | [#17](https://github.com/djshellshoxxx/GhostPay/pull/17) | 0 / 2035 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/lucid-meitner-apalzc` | `d6f6617e595b` | [#164](https://github.com/djshellshoxxx/GhostPay/pull/164) | 19 / 343 | 17 | conflicts | PARTIALLY_RECOVERABLE |
| `claude/nice-ritchie-8vivls` | `1bf25be7c540` | [#114](https://github.com/djshellshoxxx/GhostPay/pull/114) | 0 / 915 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/pages-site-1` | `7f77a44483ad` | [#13](https://github.com/djshellshoxxx/GhostPay/pull/13), [#19](https://github.com/djshellshoxxx/GhostPay/pull/19) | 0 / 2151 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/portable-hosting-kit` | `cb917c67bf8a` | [#36](https://github.com/djshellshoxxx/GhostPay/pull/36) | 0 / 1476 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/remote-extensions-1` | `39cce4663d98` | [#4](https://github.com/djshellshoxxx/GhostPay/pull/4) | 0 / 2138 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/remote-extensions-10` | `698404ca488c` | [#16](https://github.com/djshellshoxxx/GhostPay/pull/16) | 0 / 2122 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/remote-extensions-2` | `df150cbdb582` | [#3](https://github.com/djshellshoxxx/GhostPay/pull/3) | 0 / 2173 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/remote-extensions-3` | `cdfc2ba228d7` | [#7](https://github.com/djshellshoxxx/GhostPay/pull/7) | 0 / 2106 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/remote-extensions-4` | `4ffb7a99b222` | [#5](https://github.com/djshellshoxxx/GhostPay/pull/5) | 0 / 2131 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/remote-extensions-5` | `1337f6c12146` | [#12](https://github.com/djshellshoxxx/GhostPay/pull/12), [#6](https://github.com/djshellshoxxx/GhostPay/pull/6) | 0 / 2132 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/remote-extensions-6` | `7fb7aca6d68b` | [#14](https://github.com/djshellshoxxx/GhostPay/pull/14) | 0 / 2135 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/remote-extensions-7` | `e2ac361b7f42` | [#8](https://github.com/djshellshoxxx/GhostPay/pull/8) | 0 / 2123 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/remote-extensions-8` | `ad76a87e1dd5` | [#11](https://github.com/djshellshoxxx/GhostPay/pull/11), [#18](https://github.com/djshellshoxxx/GhostPay/pull/18) | 0 / 2125 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/remote-extensions-9` | `f09decc278c2` | [#15](https://github.com/djshellshoxxx/GhostPay/pull/15) | 0 / 2128 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/sharp-bohr-uigfgh` | `c9a8c3d3cf54` | [#42](https://github.com/djshellshoxxx/GhostPay/pull/42) | 2 / 1517 | 2 | clean | RETAIN_FOR_REFERENCE |
| `claude/vibrant-cori-scu18b` | `9617e8572f9b` | [#219](https://github.com/djshellshoxxx/GhostPay/pull/219), [#113](https://github.com/djshellshoxxx/GhostPay/pull/113) | 1 / 15 | 1 | clean | PARTIALLY_RECOVERABLE |
| `claude/vigilant-johnson-yjgq94` | `4403d3703cd1` | [#150](https://github.com/djshellshoxxx/GhostPay/pull/150) | 1 / 589 | 1 | conflicts | DUPLICATE_OR_SUPERSEDED |
| `claude/wizardly-babbage-mfsdrl` | `ade77362de33` | [#76](https://github.com/djshellshoxxx/GhostPay/pull/76) | 0 / 1507 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `claude/wonderful-thompson-ir89i9` | `97b919c9c19d` | [#118](https://github.com/djshellshoxxx/GhostPay/pull/118) | 0 / 907 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-approval-gated-auto-integration-20261109` | `e36786bce4e7` | [#100](https://github.com/djshellshoxxx/GhostPay/pull/100) | 0 / 1503 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-browser-isolation-20261118` | `e8857bfa1ec9` | [#241](https://github.com/djshellshoxxx/GhostPay/pull/241) | 0 / 9 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-canonical-time-20261116` | `27852ba89896` | [#186](https://github.com/djshellshoxxx/GhostPay/pull/186) | 0 / 95 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-caveman-completion-20261116` | `0c4c3c8d951a` | [#182](https://github.com/djshellshoxxx/GhostPay/pull/182) | 0 / 97 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-caveman-followup-20261116` | `2de9b0c5764c` | [#183](https://github.com/djshellshoxxx/GhostPay/pull/183) | 0 / 96 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-cloud-41868394956` | `f34a80f710d1` | [#81](https://github.com/djshellshoxxx/GhostPay/pull/81) | 1 / 1508 | 0 | clean | DUPLICATE_OR_SUPERSEDED |
| `codex/ghostpay-companion-merchant-20261109` | `b748ecdce06d` | [#91](https://github.com/djshellshoxxx/GhostPay/pull/91) | 0 / 961 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-completion-20261116` | `b4be8866f6ff` | [#179](https://github.com/djshellshoxxx/GhostPay/pull/179) | 0 / 122 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-consolidation-20261030` | `70d8bf6ec37a` | [#41](https://github.com/djshellshoxxx/GhostPay/pull/41) | 0 / 1195 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-consolidation-audit-20261104` | `e2ac398c2c89` | [#83](https://github.com/djshellshoxxx/GhostPay/pull/83) | 0 / 1505 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-continuation-20261109` | `0a68a57b77a7` | [#88](https://github.com/djshellshoxxx/GhostPay/pull/88) | 0 / 1016 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-integrate-product-cli-20261109` | `3ec039c554f7` | [#95](https://github.com/djshellshoxxx/GhostPay/pull/95) | 0 / 931 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-mythril-recovery-20261116` | `ffd957e28f98` | [#180](https://github.com/djshellshoxxx/GhostPay/pull/180) | 0 / 121 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-observability-20261116` | `c738f96e2f1a` | [#185](https://github.com/djshellshoxxx/GhostPay/pull/185) | 0 / 95 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-ops-response-cap-20261116` | `73371b57040c` | [#184](https://github.com/djshellshoxxx/GhostPay/pull/184) | 0 / 95 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-policy-localization-20261109` | `5628bc00b05a` | [#90](https://github.com/djshellshoxxx/GhostPay/pull/90) | 0 / 979 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-product-20261109` | `cfc7b0f3325a` | [#89](https://github.com/djshellshoxxx/GhostPay/pull/89) | 0 / 1003 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-recovered-lean-checkpoint-20261028` | `371d235c3e59` | — | 19 / 1517 | 19 | conflicts | RETAIN_FOR_REFERENCE |
| `codex/ghostpay-registry-recovery-20261116` | `98f779538bb7` | [#181](https://github.com/djshellshoxxx/GhostPay/pull/181) | 0 / 121 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-research-acceptance-tests-41750257638` | `57b414bfbc1f` | [#54](https://github.com/djshellshoxxx/GhostPay/pull/54) | 0 / 1507 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-research-documentation-ux-41750257638` | `96fc22c42a70` | [#56](https://github.com/djshellshoxxx/GhostPay/pull/56) | 0 / 1507 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-research-release-qualification-41750257638` | `6bd5b15ce4b8` | [#57](https://github.com/djshellshoxxx/GhostPay/pull/57) | 0 / 1507 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-research-security-review-41750257638` | `2d9c30e12c41` | [#55](https://github.com/djshellshoxxx/GhostPay/pull/55) | 0 / 1507 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-resume-20261028` | `75400888c96b` | — | 1 / 1378 | 1 | clean | RETAIN_FOR_REFERENCE |
| `codex/ghostpay-security-audit-20261030` | `63994db6cff8` | [#40](https://github.com/djshellshoxxx/GhostPay/pull/40) | 5 / 1208 | 3 | conflicts | DUPLICATE_OR_SUPERSEDED |
| `codex/ghostpay-spec09-matrix-20261116` | `2de9b0c5764c` | — | 0 / 96 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/ghostpay-unified-completion` | `beb525dddcca` | [#187](https://github.com/djshellshoxxx/GhostPay/pull/187) | 0 / 88 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/network-isolation-complete-20261119` | `3ae0b4f642a8` | [#251](https://github.com/djshellshoxxx/GhostPay/pull/251) | 87 / 5 | 70 | conflicts | ACTIVE_DEVELOPMENT |
| `codex/recovery-spec02-unqualified-20261116` | `8d6fd6df5eff` | — | 4 / 122 | 4 | clean | RETAIN_FOR_REFERENCE |
| `codex/seller-ledger-receipt-qr` | `bb011134c1bf` | [#24](https://github.com/djshellshoxxx/GhostPay/pull/24) | 0 / 1559 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `codex/setup-autonomous-agent-20261104` | `122e51710eee` | [#82](https://github.com/djshellshoxxx/GhostPay/pull/82) | 2 / 1506 | 2 | conflicts | RETAIN_FOR_REFERENCE |
| `consolidation/ops-monitor-bounded-streams-20261116` | `d2e8689b0380` | [#188](https://github.com/djshellshoxxx/GhostPay/pull/188) | 0 / 1504 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `consolidation/six-verified-boundaries-20261116` | `c9787b223a24` | [#189](https://github.com/djshellshoxxx/GhostPay/pull/189) | 0 / 1502 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `dependabot/github_actions/actions-b9ade1236b` | `199ab7ef1e80` | [#207](https://github.com/djshellshoxxx/GhostPay/pull/207) | 1 / 15 | 1 | clean | SECURITY_BLOCKED |
| `dependabot/npm_and_yarn/npm-major-1ddf9439d6` | `bbc8ff3ba6c8` | [#87](https://github.com/djshellshoxxx/GhostPay/pull/87) | 1 / 15 | 1 | clean | REPAIR_THEN_MERGE |
| `dependabot/npm_and_yarn/npm-minor-patch-71cdd1547c` | `7fab4b92f90d` | [#210](https://github.com/djshellshoxxx/GhostPay/pull/210) | 3 / 15 | 2 | conflicts | REPAIR_THEN_MERGE |
| `docs/future-privacy-feature-specs-20261109` | `896c671f19fd` | [#99](https://github.com/djshellshoxxx/GhostPay/pull/99) | 2 / 1506 | 2 | conflicts | RETAIN_FOR_REFERENCE |
| `docs/ghostpay-3q-stealth-keypair-export-20261116` | `16bc61fa1c19` | [#190](https://github.com/djshellshoxxx/GhostPay/pull/190) | 0 / 86 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `docs/ghostpay-deep-research-20261103` | `894dc868dc5d` | [#75](https://github.com/djshellshoxxx/GhostPay/pull/75) | 0 / 1507 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `docs/ghostpay-privacy-architecture-5a-5l-20261116` | `e05044d4209d` | [#191](https://github.com/djshellshoxxx/GhostPay/pull/191) | 0 / 87 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `docs/lean-release-handoff-2026-10-24` | `2b032d77fef9` | [#29](https://github.com/djshellshoxxx/GhostPay/pull/29) | 0 / 1518 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `docs/readme-and-wiki` | `ab2b61687210` | [#1](https://github.com/djshellshoxxx/GhostPay/pull/1) | 0 / 2216 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `fix/ghostpay-cloud-api-secret-aliases-20261103` | `cdbb7ec775a3` | [#50](https://github.com/djshellshoxxx/GhostPay/pull/50) | 1 / 1513 | 0 | clean | DUPLICATE_OR_SUPERSEDED |
| `fix/ghostpay-reconciliation-saturated-state-20261109` | `a864949d9ee4` | [#94](https://github.com/djshellshoxxx/GhostPay/pull/94) | 0 / 978 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `fix/remediation-b16c7936-5ce634` | `0b213bd9d434` | [#77](https://github.com/djshellshoxxx/GhostPay/pull/77) | 1 / 1181 | 0 | conflicts | DUPLICATE_OR_SUPERSEDED |
| `fix/remediation-f95457fd-22ecf9` | `6b3e689c15ca` | [#80](https://github.com/djshellshoxxx/GhostPay/pull/80) | 1 / 1178 | 0 | conflicts | DUPLICATE_OR_SUPERSEDED |
| `gh-pages` | `cc8d07943a11` | — | 3 / 2227 | 3 | unrelated history | RETAIN_FOR_REFERENCE |
| `ghostpay-cloud-recovery-2026-10-26` | `2ec98b239428` | — | 12 / 1517 | 12 | conflicts | RETAIN_FOR_REFERENCE |
| `ghostpay-local-lean-boundary-20261027` | `020ba327e1a2` | — | 18 / 1517 | 18 | conflicts | RETAIN_FOR_REFERENCE |
| `ghostpay-offline-deps-2026-10-27` | `3697f539d3a8` | — | 13 / 1517 | 13 | conflicts | RETAIN_FOR_REFERENCE |
| `ghostpay-sbom-repro-2026-10-27` | `b5b04b999e84` | — | 14 / 1517 | 14 | conflicts | RETAIN_FOR_REFERENCE |
| `gpt/ghostpay-beta-spec-20261109` | `6697390ff482` | [#96](https://github.com/djshellshoxxx/GhostPay/pull/96), [#97](https://github.com/djshellshoxxx/GhostPay/pull/97) | 0 / 954 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `gpt/ghostpay-cli-completion-20261109` | `3a9ce554ff6a` | [#92](https://github.com/djshellshoxxx/GhostPay/pull/92) | 0 / 956 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `gpt/ghostpay-product-completion-20261109` | `3cd1e5544391` | [#93](https://github.com/djshellshoxxx/GhostPay/pull/93) | 0 / 959 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `haiku/ghostpay-h01-inventory-20261111` | `747239db1a9b` | [#120](https://github.com/djshellshoxxx/GhostPay/pull/120) | 0 / 1504 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `haiku/l1-i18n-20261114` | `c6a9033449cd` | [#147](https://github.com/djshellshoxxx/GhostPay/pull/147) | 0 / 568 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `haiku/l2-pkg-20261114` | `0c8b111cbe89` | [#148](https://github.com/djshellshoxxx/GhostPay/pull/148) | 0 / 591 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `haiku/l3-ledger-20261114` | `8c91051b4492` | [#149](https://github.com/djshellshoxxx/GhostPay/pull/149) | 0 / 591 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `integration/consolidated-2026-10-21` | `c206655ebfa7` | [#20](https://github.com/djshellshoxxx/GhostPay/pull/20) | 0 / 1568 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `integration/consolidated-2026-11-14` | `a89a2e948321` | [#157](https://github.com/djshellshoxxx/GhostPay/pull/157) | 0 / 369 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `integration/ghostpay-accepted-20261102` | `f8193502e602` | [#47](https://github.com/djshellshoxxx/GhostPay/pull/47) | 0 / 1185 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `integration/ghostpay-beta-consolidated-20261109` | `364b1f185fcc` | [#98](https://github.com/djshellshoxxx/GhostPay/pull/98) | 0 / 925 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `integration/ghostpay-historical-promotion-20261118` | `22af2074a086` | [#250](https://github.com/djshellshoxxx/GhostPay/pull/250) | 1 / 1 | 1 | clean | ACTIVE_DEVELOPMENT |
| `integration/ghostpay-historical-security-promotion-20261119` | `4f14d6f167c7` | [#257](https://github.com/djshellshoxxx/GhostPay/pull/257) | 17 / 0 | 11 | clean | ACTIVE_DEVELOPMENT |
| `integration/ghostpay-idle-session-completion-20261119` | `df0d70de5b29` | [#256](https://github.com/djshellshoxxx/GhostPay/pull/256) | 3 / 0 | 2 | clean | ACTIVE_DEVELOPMENT |
| `integration/ghostpay-master-consolidation-20261118` | `b529a720cfbf` | — | 145 / 0 | 112 | clean | PARTIALLY_RECOVERABLE |
| `integration/ghostpay-mythril-security-closure-20261118` | `ea47fa75eabb` | [#255](https://github.com/djshellshoxxx/GhostPay/pull/255) | 2 / 0 | 1 | clean | SECURITY_BLOCKED |
| `integration/ghostpay-pages-completion-20261118` | `198aa5baff22` | [#238](https://github.com/djshellshoxxx/GhostPay/pull/238) | 83 / 7 | 67 | conflicts | REPAIR_THEN_MERGE |
| `integration/ghostpay-qualified-fixes-20261118` | `ab4e0da2cfe2` | [#242](https://github.com/djshellshoxxx/GhostPay/pull/242) | 0 / 1 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `main` | `e454de6abfef` | — | 0 / 0 | 0 | already contained | RETAIN_FOR_REFERENCE |
| `nodata/doc-sweep-20261118` | `cce7a7f7e548` | [#223](https://github.com/djshellshoxxx/GhostPay/pull/223) | 1 / 15 | 1 | conflicts | REPAIR_THEN_MERGE |
| `nodata/eager-babbage-0w6sf6` | `2693b08ed4b1` | [#204](https://github.com/djshellshoxxx/GhostPay/pull/204) | 0 / 1499 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `nodata/jolly-rubin-u4zd45` | `1054daabc5ca` | [#224](https://github.com/djshellshoxxx/GhostPay/pull/224), [#135](https://github.com/djshellshoxxx/GhostPay/pull/135) | 5 / 15 | 5 | conflicts | PARTIALLY_RECOVERABLE |
| `nodata/wizardly-allen-qwol6u` | `1c9a3ce4a103` | [#221](https://github.com/djshellshoxxx/GhostPay/pull/221), [#203](https://github.com/djshellshoxxx/GhostPay/pull/203) | 1 / 15 | 1 | clean | PARTIALLY_RECOVERABLE |
| `nodata/wonderful-darwin-kd1h22` | `a92658b1ef6b` | [#211](https://github.com/djshellshoxxx/GhostPay/pull/211) | 48 / 15 | 41 | conflicts | PARTIALLY_RECOVERABLE |
| `nodata/zealous-hopper-lr0nxe` | `b2604949ae3c` | [#205](https://github.com/djshellshoxxx/GhostPay/pull/205) | 4 / 15 | 3 | clean | PARTIALLY_RECOVERABLE |
| `privacy/hardening-recommendations` | `2bc2098298d9` | [#222](https://github.com/djshellshoxxx/GhostPay/pull/222) | 2 / 15 | 2 | conflicts | PARTIALLY_RECOVERABLE |
| `repair/ghostpay-history-pool-values-20261118` | `ca61cc889c6a` | [#245](https://github.com/djshellshoxxx/GhostPay/pull/245) | 6 / 0 | 5 | clean | PARTIALLY_RECOVERABLE |
| `repair/ghostpay-history-scanner-20261118` | `6c11242abca5` | [#247](https://github.com/djshellshoxxx/GhostPay/pull/247) | 4 / 0 | 3 | clean | PARTIALLY_RECOVERABLE |
| `repair/ghostpay-pr-231-20261118` | `408562246341` | [#252](https://github.com/djshellshoxxx/GhostPay/pull/252) | 7 / 0 | 5 | clean | PARTIALLY_RECOVERABLE |
| `repair/ghostpay-pr-87-20261119` | `6b07e403dd26` | [#253](https://github.com/djshellshoxxx/GhostPay/pull/253) | 9 / 0 | 7 | clean | PARTIALLY_RECOVERABLE |
| `research/privacy-evidence-matrix-20261110` | `a0a2d1dfbbdb` | [#116](https://github.com/djshellshoxxx/GhostPay/pull/116) | 0 / 1504 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `security/mythril-full-remediation-20261118` | `16c48521f999` | [#220](https://github.com/djshellshoxxx/GhostPay/pull/220) | 9 / 15 | 9 | clean | SECURITY_BLOCKED |
| `work/ghostpay-consolidation-review-20261025` | `a2217ea1ccdd` | — | 0 / 1515 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `work/ghostpay-pr26-qa-2026-10-24` | `77e7d7b6dd21` | — | 0 / 1532 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
| `work/local-reconstruction-2026-10-24` | `bd320d530c72` | — | 0 / 1541 | 0 | already contained | SAFE_TO_DELETE_AFTER_VERIFICATION |
