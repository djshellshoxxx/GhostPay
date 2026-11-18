# GhostPay branch and PR reconciliation

Starting main: `dfc75ef2087fa6463ae59e0818abec01796c578d`. Read-only census: 2026-11-18 UTC.

Enumerated **242 branches** (100 + 100 + 42), **235 PRs** (100 + 100 + 35), including **40 open PRs**.

## Evidence boundaries

- All 242 branch refs and 235 PR metadata entries enumerated with pagination. All branch ancestry and patch equivalence checked locally.
- Source-level independent review is limited to assigned #227/#231/#234/#235/#237 plus tooling/security extraction slices from #220/#212/#224/#225/#226.
- No runtime tests, remote writes, merges, deployments or publications performed by branch-archaeology worker.
- Ancestry and patch equivalence prove historical inclusion only, not current behavior after later changes.
- CI check-run snapshots can contain multiple workflow attempts; neither check counts nor old green results qualify an intended merge result.
- BLOCKED narrow candidates may be locally integrated for testing; label means merge gate remains unmet, not that source is rejected.

## Open PR candidates

| PR | Head | Base | Ahead / behind main | Disposition | Check records | Dependencies / pairs | Reason |
|---|---|---|---:|---|---|---|---|
| [#51](https://github.com/djshellshoxxx/GhostPay/pull/51) | `5835736c12968231ac7b3152e394077bee453622` | `main` | 3 / 1501 | DEFER | success 26 | none | Historical API-funded scheduled automation is outside Pages beta scope; do not activate it. |
| [#52](https://github.com/djshellshoxxx/GhostPay/pull/52) | `68dc5b502f25ed192f3ca82ee4fece8ee91d3bce` | `main` | 6 / 1501 | DEFER | success 26, skipped 4 | none | Historical paid parallel-agent workflow is outside Pages beta scope; current guarded workflow supersedes its operating assumptions. |
| [#82](https://github.com/djshellshoxxx/GhostPay/pull/82) | `122e51710eeee51a5ffc3f9dc76ee0b8ec291d43` | `main` | 2 / 1495 | DEFER | success 23, failure 2, skipped 1 | none | Historical paid autonomous development configuration is outside current Pages beta scope. |
| [#87](https://github.com/djshellshoxxx/GhostPay/pull/87) | `bbc8ff3ba6c8e3786ccea9bd5c2679d0527bc6aa` | `main` | 1 / 4 | DEFER | failure 24, success 10, skipped 3, neutral 1 | none | Grouped major dependency upgrade has 24 failing check records and expands compatibility work beyond the narrow repair. |
| [#139](https://github.com/djshellshoxxx/GhostPay/pull/139) | `364b01f847391cd02b3aecb74e18ddd047096c97` | `claude/ghostpay-github-pages-up6cj6` | 43 / 521 | DEFER | skipped 12, success 4 | none | Historical audit rotations are archived evidence; newer source-pinned audit/report work supersedes their current-status claims. |
| [#140](https://github.com/djshellshoxxx/GhostPay/pull/140) | `c5efadab9d9af6a0053f489ebe6c0c06e760d025` | `claude/ghostpay-github-pages-up6cj6` | 110 / 413 | REWORK | skipped 12, success 4 | none | Extract useful guide text only after reconciling obsolete branch/qualification status with final integrated source. |
| [#153](https://github.com/djshellshoxxx/GhostPay/pull/153) | `83fe9b022d2b5a4068137fd7987467f1803803dc` | `chatgpt/zero-codex/pages-reconciliation-idb-retry-20261113` | 42 / 549 | DEFER | skipped 12, success 4 | none | Historical qualification handoff describes old candidate heads; preserve history but do not import its status as current. |
| [#160](https://github.com/djshellshoxxx/GhostPay/pull/160) | `2221a6117cdcf397527d96c2b20862d05a6b26da` | `integration/consolidated-2026-11-14` | 2 / 374 | DEFER | skipped 12, success 4 | none | Historical release-gate inventory is rooted in old #157; current ledger must supersede its status claims. |
| [#205](https://github.com/djshellshoxxx/GhostPay/pull/205) | `b2604949ae3cfae493bcfb0213d390a213e63037` | `main` | 4 / 4 | EXTRACT | skipped 12, success 8 | none | Use audit/recovery backlog and source evidence as inputs; reconcile claims with current exact source. |
| [#207](https://github.com/djshellshoxxx/GhostPay/pull/207) | `199ab7ef1e80e6368fdc17c09b94c87a62871861` | `main` | 1 / 4 | EXTRACT | success 27, skipped 2, failure 1, neutral 1 | none | Coherent action pin updates need current workflow overlap and scanner verification; Mythril check record fails. |
| [#208](https://github.com/djshellshoxxx/GhostPay/pull/208) | `ef610872aa4ef1f2ee3d0b177f883481662d4733` | `main` | 1 / 4 | DEFER | success 8, skipped 12 | none | Historical execution prompt is superseded by the current owner directive; retain as evidence only. |
| [#209](https://github.com/djshellshoxxx/GhostPay/pull/209) | `b5e2ea3e5030b56c79063eb1f91c8a634ee5d740` | `main` | 24 / 4 | EXTRACT | skipped 4, queued 20, success 16, failure 1 | none | Broad completion branch; extract verified Pages hosting, transport, session and build fixes, preserving other owners and current source. |
| [#210](https://github.com/djshellshoxxx/GhostPay/pull/210) | `4d19655a2e5d93ad9378803cd4163245168aca24` | `main` | 1 / 4 | REWORK | failure 23, success 11, skipped 3, neutral 1 | none | Grouped minor dependency update has 23 failing check records; only qualify together with #236 dependency/lock repair. |
| [#211](https://github.com/djshellshoxxx/GhostPay/pull/211) | `a92658b1ef6b95ff0145b2e1933d0047d51289d5` | `main` | 48 / 4 | EXTRACT | skipped 3, queued 2, success 12 | #209, #213, #218, #235 | Extract coherent Pages gap fixes after #209/#218 reconciliation; replace its incompatible v3 checkpoint format with #235 v4. |
| [#212](https://github.com/djshellshoxxx/GhostPay/pull/212) | `4894d0d8d94333dffa8ae3937a4d8314f27c686f` | `main` | 6 / 4 | EXTRACT | success 34, skipped 5 | #225 | Extract deployment-validation entrypoint and test; checker may be included only with #225 and must stay unwired until provenance and policy decisions are resolved. |
| [#213](https://github.com/djshellshoxxx/GhostPay/pull/213) | `ebf7c92c3be1c7aebd37fc58b5567e114fb932fc` | `main` | 6 / 5 | REWORK | queued 20, skipped 3, success 14 | #229 | Spec18 recovery branch requires complete UI/acceptance and #229 import-consent/key-boundary corrections before qualification. |
| [#214](https://github.com/djshellshoxxx/GhostPay/pull/214) | `7490aac58ece15f9e4ec9979fbe48987354618fa` | `main` | 2 / 4 | EXTRACT | success 6, skipped 12, queued 2 | none | Preserve source-pinned historical audit evidence without promoting it to a current combined-source audit. |
| [#215](https://github.com/djshellshoxxx/GhostPay/pull/215) | `b43b134028357455a557ca95f820e7dfd586eef7` | `main` | 2 / 4 | REWORK | success 6, skipped 12, queued 2 | none | Reconcile current-status wiki banner against final integration; do not publish live Wiki. |
| [#216](https://github.com/djshellshoxxx/GhostPay/pull/216) | `a78a5467f5eb7de83b9ea9f08c6633ada30e026d` | `main` | 2 / 4 | EXTRACT | skipped 12, queued 2, success 6 | none | Preserve post-merge ownership/source reconciliation as historical evidence with exact source pins. |
| [#217](https://github.com/djshellshoxxx/GhostPay/pull/217) | `9e5cc3789b7b8a3c550ed2680304ab6245ec6676` | `main` | 1 / 4 | DEFER | success 36, skipped 3, failure 1 | none | Scheme-2 fee-freeze deployment guard is outside enabled Pages beta; no production deployment authorized. |
| [#218](https://github.com/djshellshoxxx/GhostPay/pull/218) | `b1327d4d0e263fdfc7d4fb0b5546b18de2d7434e` | `main` | 34 / 4 | EXTRACT | queued 19, success 16, skipped 3 | #234 | Recover Pages sweep destination/quote-age and shared validation fixes in coherent units; CLI/relayer fixes stay separately scoped. |
| [#219](https://github.com/djshellshoxxx/GhostPay/pull/219) | `9617e8572f9bc414410bd937b0e7718d0c5bd55c` | `main` | 1 / 4 | DEFER | queued 10, in_progress 1, success 24, skipped 3 | none | Bitcoin Silent Payments spent-output work is outside enabled lean Pages beta; preserve branch for its later qualification. |
| [#220](https://github.com/djshellshoxxx/GhostPay/pull/220) | `16c48521f99903ccd2e584df5d00a9dec5ef754c` | `main` | 9 / 4 | EXTRACT | success 39, skipped 5, failure 1 | none | Extract RPC metadata minimization, key-boundary documentation/test and complete workflow hardening with independent-review follow-up; do not reintroduce reverted D-1 ambiguity guard. |
| [#221](https://github.com/djshellshoxxx/GhostPay/pull/221) | `1c9a3ce4a103c86b9ca849a2fd5ed77f86c66849` | `main` | 1 / 4 | EXTRACT | skipped 12, success 8 | none | Preserve retirement and owner-action evidence; repository branch-protection change is not executed by this report. |
| [#222](https://github.com/djshellshoxxx/GhostPay/pull/222) | `2bc2098298d90928eb1acafad969f28316bb05fc` | `main` | 2 / 4 | REWORK | queued 21, skipped 3, success 11, failure 3 | #228, #230, #231, #233, #235 | Broad privacy branch contains incompatible v3 checkpoint and persistent plaintext sweep history; combine #228/#230/#231/#233/#235, retaining only approved Pages scope. |
| [#223](https://github.com/djshellshoxxx/GhostPay/pull/223) | `cce7a7f7e548130afba2ef6b2be518ca5b667ade` | `main` | 1 / 4 | REWORK | queued 2, skipped 12, success 6 | none | Documentation synchronization must be rechecked after implementation integration; current head is older than final candidate. |
| [#224](https://github.com/djshellshoxxx/GhostPay/pull/224) | `1054daabc5cabe958466ec144582d76137b54910` | `main` | 5 / 4 | EXTRACT | queued 20, skipped 3, success 15 | #226 | Extract Sonar fixes with #226 static-helper containment; bidi escape substitutions preserve semantics; HTTPS-only downloads retain content pins. |
| [#225](https://github.com/djshellshoxxx/GhostPay/pull/225) | `94ca7d5ba9dc65c7324805e5bf9b7d1d2dccee57` | `claude/ghostpay-consolidation-9xhtxg-security` | 7 / 4 | EXTRACT | queued 20, failure 1, success 2 | #212 | Take checker failure handling atop #212 only; keep helper unwired and retain current strict Mythril gate. |
| [#226](https://github.com/djshellshoxxx/GhostPay/pull/226) | `3a3b136a326e0d8c1f369d94d4517ad0711babc8` | `nodata/jolly-rubin-u4zd45` | 6 / 4 | EXTRACT | skipped 12, queued 2, success 2 | #224 | Take alongside #224 helper to cover realpath symlink escapes, malformed raw URLs and filesystem exceptions. |
| [#227](https://github.com/djshellshoxxx/GhostPay/pull/227) | `613667be4eeb132c7d21ccd06c627f9a7144d85b` | `main` | 1 / 0 | BLOCKED | skipped 3, neutral 1, queued 21, success 9 | none | Independent source review found no introduced blocker; local integrated tests and incomplete hosted checks still required before merge. |
| [#228](https://github.com/djshellshoxxx/GhostPay/pull/228) | `685fe1a39a3fa9f1d6a4d10a77b4d1a2745edeed` | `privacy/hardening-recommendations` | 3 / 4 | EXTRACT | queued 20, skipped 1, success 8, in_progress 1, failure 1 | #222 | Apply cached own-node policy correction to retained #222 privacy functionality; verify policy on every cached-client access. |
| [#229](https://github.com/djshellshoxxx/GhostPay/pull/229) | `18110015e99efbeb4f23d47cd88bd6f917010108` | `claude/ghostpay-consolidation-9xhtxg-spec18` | 7 / 5 | EXTRACT | skipped 3, success 6, queued 1 | #213 | Apply import-consent and cryptographic-boundary correction with #213 recovery functionality; final cross-profile recovery acceptance required. |
| [#230](https://github.com/djshellshoxxx/GhostPay/pull/230) | `0b2609c2c83143741ad343bfb08234a2d1182aa5` | `privacy/hardening-recommendations` | 3 / 4 | EXTRACT | skipped 1, queued 7, success 2, failure 1 | #222 | Replace #222 persistent plaintext sweep ledger with session-only state; no persistent address history. |
| [#231](https://github.com/djshellshoxxx/GhostPay/pull/231) | `d9ff386807de724eb1a1c4d400c882df0fc20bb7` | `main` | 1 / 0 | BLOCKED | queued 26, skipped 1, success 3, in_progress 1 | none | Independent source review found no introduced blocker; integrated Sweep/privacy/browser tests and fresh hosted checks required before merge. |
| [#232](https://github.com/djshellshoxxx/GhostPay/pull/232) | `437704da28fc5d9dbf6abea3fd2c50014319ecf4` | `main` | 3 / 0 | EXTRACT | queued 3 | none | Preserve twelve-repair execution evidence as historical source-pinned records; current census differs and status claims must remain dated. |
| [#233](https://github.com/djshellshoxxx/GhostPay/pull/233) | `67cf835d0bf5f3b239e8ee6f18dca401fd5a5050` | `privacy/hardening-recommendations` | 3 / 4 | EXTRACT | skipped 1, queued 7 | #222, #231 | Apply browser fixture updates to integrated privacy behavior, then run actual browser acceptance; collection alone is insufficient. |
| [#234](https://github.com/djshellshoxxx/GhostPay/pull/234) | `5e9e7be70399a9818579cf87bd494e013e25d4f9` | `main` | 1 / 0 | BLOCKED | skipped 1, queued 12, success 1 | none | Independent source review found no introduced blocker for shared strict parser API; current Pay UI does not opt in; local package tests and hosted checks pending. |
| [#235](https://github.com/djshellshoxxx/GhostPay/pull/235) | `a5076f4d4e8d2dc515bdc31f304b6c6ce75bf3b1` | `main` | 1 / 0 | BLOCKED | skipped 1, queued 13 | none | Independent source review found no introduced blocker for private HKDF v4; preserve this format over both v3 branches and execute integrated scan/session tests plus fresh hosted checks. |
| [#236](https://github.com/djshellshoxxx/GhostPay/pull/236) | `defdaa308a2d05ab407af7e42f8dc457cf52d103` | `dependabot/npm_and_yarn/npm-minor-patch-71cdd1547c` | 2 / 4 | REWORK | skipped 1, queued 9, success 1 | #210 | Depends on #210 matching dependency and lock versions; never transplant root override independently; audit and all compatibility checks required. |
| [#237](https://github.com/djshellshoxxx/GhostPay/pull/237) | `7109290b7e4f029c36d9743bde9fd664d1da5474` | `main` | 1 / 0 | BLOCKED | queued 6 | none | Independent source review found no introduced blocker; log glob remains restricted to test .log files; hosted workflow checks remain queued. |

## Branch census

The JSON companion contains all changed paths, exact source commits, test paths, CI URLs, dependency pairs and open-PR overlap. No branch is deleted.

| Branch | Head | Related PRs | Ahead / behind main | Patch-unique commits | Disposition |
|---|---|---|---:|---:|---|
| `ai/agent-harness-20261113` | `15dc9c192c6086f2e51bcce68ca18ea483968b57` | #152 | 0 / 1489 | 0 | SUPERSEDED |
| `automation/api-funded-ghostpay-cloud-20261103` | `29ce481d2d4a964f0acc42cc5233eb2d9c3e9482` | #48 | 0 / 1503 | 0 | SUPERSEDED |
| `automation/ghostpay-parallel-four-agents-20261103` | `68dc5b502f25ed192f3ca82ee4fece8ee91d3bce` | #52 | 6 / 1501 | 6 | DEFER |
| `automation/ghostpay-parallel-review-wave-20261103` | `03a3f5701c89e19667f309bb5f01bd36793a5474` | #53 | 0 / 1498 | 0 | SUPERSEDED |
| `automation/ghostpay-recurrent-backlog-20261103` | `5835736c12968231ac7b3152e394077bee453622` | #51 | 3 / 1501 | 3 | DEFER |
| `backup/codex-observed-pr37-915d710-20261028` | `915d71053e2335dfff638b729b160f9df3200c22` | none | 0 / 1339 | 0 | SUPERSEDED |
| `backup/pr30-before-consolidation-20261025` | `356fe5e44d42db1731d6b35794c6474afcc23037` | none | 0 / 1482 | 0 | SUPERSEDED |
| `backup/pr31-before-consolidation-20261025` | `a2217ea1ccdd29f4e67ebdde9e6606eaa0fde523` | none | 0 / 1504 | 0 | SUPERSEDED |
| `chatgpt/consolidation-reconciliation-20261113` | `3cf3437a8d9dbe3ec1d9056adb73fb93f0f2929c` | #146 | 0 / 1493 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-beta-consolidation-20261118` | `437704da28fc5d9dbf6abea3fd2c50014319ecf4` | #232 | 3 / 0 | 3 | EXTRACT |
| `chatgpt/ghostpay-beta-log-artifact-20261118` | `7109290b7e4f029c36d9743bde9fd664d1da5474` | #237 | 1 / 0 | 1 | BLOCKED |
| `chatgpt/ghostpay-beta-qualification-20261112` | `c11f905b362ae2b0734b4dc6ff348fe3c5e0fcfa` | #136 | 0 / 616 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-billing-horizon-port-20261112` | `eb21d57c8ad1550481d5d674fa6356ac98f146f0` | #130 | 0 / 737 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-cli-sentinel-port-20261112` | `3fd18ef4011b8d6e094ac49a13c0e6ccc2c0c9c9` | #129 | 0 / 736 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-historical-consolidation-20261115` | `7dc7eccc34af289050aa1606784a88dfe8a5633a` | none | 7 / 358 | 5 | EXTRACT |
| `chatgpt/ghostpay-integration-matrix-20261112` | `1a5e815d8446f00a63f98de261081910c9c78ce6` | #128 | 0 / 737 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-invoice-validation-20261118` | `5e9e7be70399a9818579cf87bd494e013e25d4f9` | #234 | 1 / 0 | 1 | BLOCKED |
| `chatgpt/ghostpay-merchant-csv-port-20261112` | `bbc7dda4ce275613296609a5001bac36c888229e` | #131 | 0 / 737 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-mythril-checker-failclosed-20261118` | `94ca7d5ba9dc65c7324805e5bf9b7d1d2dccee57` | #225 | 7 / 4 | 7 | EXTRACT |
| `chatgpt/ghostpay-onion-canonical-port-20261112` | `8277879eeaa003c31fd76b4f840b9628f4b02cf7` | #134 | 0 / 736 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-own-node-guard-20261118` | `685fe1a39a3fa9f1d6a4d10a77b4d1a2745edeed` | #228 | 3 / 4 | 3 | EXTRACT |
| `chatgpt/ghostpay-pages-checkpoint-v4-20261118` | `a5076f4d4e8d2dc515bdc31f304b6c6ce75bf3b1` | #235 | 1 / 0 | 1 | BLOCKED |
| `chatgpt/ghostpay-pages-client-hardening-20261115` | `f3872e90eb255b46a773d78f4f5adb6239db2b4f` | #166 | 0 / 573 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-pages-gp02-gp04-review-20261115` | `9b3a3070499a2a6d70349d540f7aaaed006426e9` | #165 | 0 / 577 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-pages-idle-clock-20261118` | `613667be4eeb132c7d21ccd06c627f9a7144d85b` | #227 | 1 / 0 | 1 | BLOCKED |
| `chatgpt/ghostpay-pages-second-pass-notes-20261115` | `cf6a8d69620af6271e573a8b20fe1562e89ef81c` | #167 | 0 / 572 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-privacy-browser-fixtures-20261118` | `67cf835d0bf5f3b239e8ee6f18dca401fd5a5050` | #233 | 3 / 4 | 3 | EXTRACT |
| `chatgpt/ghostpay-recovery-review-20261118` | `18110015e99efbeb4f23d47cd88bd6f917010108` | #229 | 7 / 5 | 7 | EXTRACT |
| `chatgpt/ghostpay-rpc-filter-guard-20261114` | `dfed84c18b5f02c568c87f14a4fa4cec20fea80b` | none | 2 / 358 | 1 | EXTRACT |
| `chatgpt/ghostpay-rpc-filter-guard-beta-20261114` | `73923350fcda62f00be0f2b83ad346f416a24bb6` | none | 5 / 374 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-sensitive-surface-audit-20261115` | `90a145740a163a9515e5c70e79be33610b67b293` | #168 | 0 / 571 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-sensitive-surface-fourth-pass-20261115` | `97a617b5b95f04a1e736c5c730c587ef0824d05a` | #169 | 0 / 570 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-six-fixes-combined-20261112` | `36dfa8d26d4e7a9ccb7a9a8e1e562877741212ef` | none | 6 / 738 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-sonar-review-20261118` | `3a3b136a326e0d8c1f369d94d4517ad0711babc8` | #226 | 6 / 4 | 6 | EXTRACT |
| `chatgpt/ghostpay-sweep-balance-consent-20261118` | `d9ff386807de724eb1a1c4d400c882df0fc20bb7` | #231 | 1 / 0 | 1 | BLOCKED |
| `chatgpt/ghostpay-sweep-ledger-memory-20261118` | `0b2609c2c83143741ad343bfb08234a2d1182aa5` | #230 | 3 / 4 | 3 | EXTRACT |
| `chatgpt/ghostpay-top-down-audit-20261115` | `775756931be4683f47e8af6b2ecf26f9458897d7` | #170 | 0 / 569 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-ux-clock-port-20261112` | `c3173f849ad6ce3d3e5a4c4b2a1efdb7d9c937df` | #132 | 0 / 736 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-ux-guide-port-20261112` | `f3a9b2389f8ba32f7a3cccce2cdabc186c23df1b` | #133 | 0 / 736 | 0 | SUPERSEDED |
| `chatgpt/ghostpay-viem-alignment-20261118` | `defdaa308a2d05ab407af7e42f8dc457cf52d103` | #236 | 2 / 4 | 2 | REWORK |
| `chatgpt/pages-browser-fixes-combined-20261114` | `73923350fcda62f00be0f2b83ad346f416a24bb6` | #161 | 5 / 374 | 0 | SUPERSEDED |
| `chatgpt/pages-release-gate-audit-20261114` | `2221a6117cdcf397527d96c2b20862d05a6b26da` | #160 | 2 / 374 | 2 | DEFER |
| `chatgpt/zero-codex/audit-main-20261118-r185` | `7490aac58ece15f9e4ec9979fbe48987354618fa` | #214 | 2 / 4 | 2 | EXTRACT |
| `chatgpt/zero-codex/audit-pages-release-20261112` | `364b01f847391cd02b3aecb74e18ddd047096c97` | #139 | 43 / 521 | 43 | DEFER |
| `chatgpt/zero-codex/audit-secret-box-20261110` | `621ee0af3f4748c072eee0479accad82f7c2fdd3` | #103 | 0 / 886 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/b0-receipt-recovery-20261110` | `0a61e2c7fc54a87fc80cb8f7fadd143d1f1789aa` | #108 | 0 / 913 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/cli-sentinel-value-20261111` | `a6e74591e134b31de3e0efc84448eb97cdc3b012` | #125 | 2 / 914 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/docs-pages-scope-20261112` | `c5efadab9d9af6a0053f489ebe6c0c06e760d025` | #140 | 110 / 413 | 110 | REWORK |
| `chatgpt/zero-codex/docs-postmerge-wiki-20261118` | `b43b134028357455a557ca95f820e7dfd586eef7` | #215 | 2 / 4 | 2 | REWORK |
| `chatgpt/zero-codex/docs-wiki-20261110` | `fa375dbc1f2416b27d75e44487e5a382f237b379` | #104 | 0 / 853 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/handoff-postmerge-20261118` | `a78a5467f5eb7de83b9ea9f08c6633ada30e026d` | #216 | 2 / 4 | 2 | EXTRACT |
| `chatgpt/zero-codex/merchant-csv-safety-20261111` | `afaf7ce62d2bad7ecfc558d96b8dd6fb772cc790` | #124 | 0 / 911 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/merchant-schedule-horizon-20261111` | `7cdc6b32ecafd73636136c852542fddd42213848` | #123 | 1 / 914 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/onion-canonical-host-20261111` | `72dde82d9d898f5ed0c3c2b6901870c557a5012a` | #122 | 2 / 914 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/ops-monitor-bounded-fetch-20261110` | `5280569b7eaad9b4d996861410211cd40d005fdb` | #106 | 0 / 911 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-autoclear-enable-retained-hash-20261117` | `9732adb949cc7191beddcb986dff76e9f9534537` | #198 | 0 / 547 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-backup-gate-verified-only-20261115` | `433307b869acf2d81b2d12b415631076a89f7213` | #171 | 0 / 570 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-bearer-qr-warning-20261114` | `81fd4c032e29a87ce509236a0398468022c23012` | #156 | 0 / 579 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-combined-qualification-20261113` | `ab427ab81c7bc18a6d908c5201cf86450cf3f21f` | #143 | 0 / 594 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-download-cleanup-20261116` | `cf5ad81cab48424e6302e507c9af46bf4c99aee4` | #178 | 0 / 560 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-fragment-history-state-20261117` | `68993c668aa70ac4be1a9deeeef3badec3b10fcd` | #197 | 0 / 549 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-fragment-shell-gates-20261117` | `120dcd7fc15b2d5a646a93835287ef9bc7281fe1` | #196 | 0 / 551 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-hash-navigation-exceptions-20261117` | `b570d4bb748d318e0963d6bfa2f5e19f22e0d666` | #199 | 0 / 546 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-invoice-stale-submit-20261115` | `dffe072511c34b8a73bd64ac6147d5a79256480e` | #174, #172 | 0 / 568 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-keystore-reimport-control-20261118` | `30cc4560c6a71694a1cd116d879823e9a596e4d3` | #202 | 0 / 542 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-late-invoice-focus-20261117` | `23cc6db4b924943ba99b169ac83c214272dcaa10` | #200 | 0 / 545 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-manifest-disclosure-rejection-20261113` | `907e2919e93091fd2e9c2abaecbeb95e331f4b7d` | #144 | 0 / 586 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-manifest-gates-20261117` | `12e18931ae99d1444e1f3f3ecfc5f8c117a7b6d0` | #195 | 0 / 552 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-negative-fiat-regression-20261114` | `9bdc9cbade90995e3207b72535a7818f909c2684` | #154 | 1 / 580 | 1 | EXTRACT |
| `chatgpt/zero-codex/pages-owner-ci-handoff-20261114` | `83fe9b022d2b5a4068137fd7987467f1803803dc` | #153 | 42 / 549 | 42 | DEFER |
| `chatgpt/zero-codex/pages-owner-transfer-filter-20261115` | `cf5e876ce164e63d535fb6e40319573798b746e1` | #163 | 3 / 358 | 1 | EXTRACT |
| `chatgpt/zero-codex/pages-pay-rich-tags-20261117` | `c15833bc2aa6e0e0189f6cd18becf293e0e6e73e` | #194 | 0 / 553 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-qr-combined-20261115` | `26f83ccdda98ee82c26ad5f71c3f90d90ad68c20` | #162 | 7 / 374 | 1 | EXTRACT |
| `chatgpt/zero-codex/pages-reconciliation-e2e-proof-20261116` | `57acf1b06b3b31ada0220556cf64344e1f854e21` | #175 | 0 / 564 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-reconciliation-idb-retry-20261113` | `c8d4c42bee724bacd244bc90b0259c961d27e84f` | #145 | 0 / 581 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-reconciliation-imported-link-20261115` | `97cf5a0cda257451c99643909a7b5ebe7da89a79` | #173 | 0 / 565 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-relayer-stream-limit-20261114` | `9a84764e70603e5f4e0b7bac13bdb6eeec6e469b` | #158 | 0 / 579 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-renderer-own-property-20261116` | `dd4a7eb4dd71435284d9d326310cb2695faa249a` | #192 | 0 / 557 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-rpc-http-status-20261113` | `68aca93bc19e4c9d91fa37212d9b8c502b4ce884` | #141 | 0 / 597 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-same-view-invoice-focus-20261117` | `2fb89ff5f2dcf34f3a02b66e4485d5e282ee9aa1` | #201 | 0 / 543 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-scan-transfer-filter-20261114` | `7b6c4983e5c0ba048edf97aaff7399bd77980234` | #159 | 2 / 374 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-smoke-project-boundary-20261113` | `eece5aff554255ca6c02e53849403f66123b8e40` | #142 | 0 / 593 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-tag-store-closed-connection-20261116` | `17f681915f25441f5c38326ad718b8082495d52a` | #177 | 0 / 562 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/pages-tagarchive-blocked-click-20261117` | `8aed22ad44ee2131b36a9e12ec2dc33fe3501e1b` | #193 | 1 / 557 | 1 | EXTRACT |
| `chatgpt/zero-codex/pages-verifier-comment-attrs-20261112` | `6f59cc2cb7add5ca04aa05eef724cb0a65bb3891` | #138 | 0 / 597 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/qualify-98-20261110` | `a2f4205f900d87ed0726aadeda4b808e6c76fd0c` | #102 | 0 / 885 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/receipt-boundary-regressions-20261110` | `83d17adb4a07ff2120c6674a5128684e4f13776a` | #105 | 0 / 913 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/recovery-auth-negative-20261110` | `969d1b270b243ce6fbdf1d7b9f5e813b775e7ea3` | #109 | 0 / 912 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/rpc-concurrent-byte-budget-20261110` | `b12a20e1d6e284e8e3e228ab6bf08c83c012777a` | #111 | 0 / 911 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/rpc-response-correlation-20261110` | `bbe300b7fb21829350f66677d270a689f3a79ecf` | #110 | 0 / 910 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/signed-receipt-no-rpc-proof-20261110` | `0ab175e552485032672c59d9b38c733545c7c50f` | #107 | 0 / 913 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/ux-confirm-clock-boundary-20261111` | `d77956901d95c3eeb8c5c1d67ae7d1647bd069aa` | #126 | 2 / 914 | 0 | SUPERSEDED |
| `chatgpt/zero-codex/ux-guide-plain-object-20261111` | `cf3a8b23a1994b39d2cf77b72d8c61c0a903ae4a` | #127 | 3 / 914 | 2 | EXTRACT |
| `chatgpt/zero-codex-continuation-spec-20261109` | `d15921981ecfe8342886c27c52af43c22c1c6205` | #101 | 0 / 1493 | 0 | SUPERSEDED |
| `checkpoint/ghostpay-recovery-20261102` | `1dffa5a366fc88a4428823634f43247913048915` | #46 | 0 / 1505 | 0 | SUPERSEDED |
| `checkpoint/ghostpay-source-reconciliation-20261101` | `243d98d67c7cbcc854b2107da5461e4718cb6272` | none | 2 / 1184 | 2 | DEFER |
| `claude/admiring-albattani-6kydor` | `ef610872aa4ef1f2ee3d0b177f883481662d4733` | #208, #84 | 1 / 4 | 1 | DEFER |
| `claude/adoring-wozniak-850ue6` | `a2217ea1ccdd29f4e67ebdde9e6606eaa0fde523` | #31, #28, #27 | 0 / 1504 | 0 | SUPERSEDED |
| `claude/ar-a0-pr47-green` | `4a38efdfa999f84685e5004b4c17a2a8e493f704` | #59 | 0 / 1173 | 0 | SUPERSEDED |
| `claude/ar-a4-btc-headersync` | `27d1580c5c535cef5ea44491716d0d86712df841` | #74 | 0 / 1165 | 0 | SUPERSEDED |
| `claude/ar-a5-announcer-budget` | `d9fe8b4e9c020f8cef0073b9a990903fad38f1a8` | #70 | 0 / 1170 | 0 | SUPERSEDED |
| `claude/ar-a6-combined-backup` | `f5d219851a4715cb947eb224976f97a7bec49380` | #61 | 0 / 1164 | 0 | SUPERSEDED |
| `claude/ar-a7-policy-send-guard` | `f7b8ee9db98162a97a962ff40d77460cb6eb8417` | #65 | 0 / 1167 | 0 | SUPERSEDED |
| `claude/ar-b1-core-journey` | `e0a499bdd95da4d9dd24a19a73fe9609e302b104` | #62 | 0 / 1168 | 0 | SUPERSEDED |
| `claude/ar-b2-lean-bound-receipts` | `2bcfd11f9dc56138612079a713ecf1b2bcdb0cd0` | #64 | 0 / 1169 | 0 | SUPERSEDED |
| `claude/ar-b3-sweep-permit-states` | `9d100956f08ddab66c6aeff1647ca51f3d5ef9cc` | #69 | 0 / 1142 | 0 | SUPERSEDED |
| `claude/ar-b5-testnet-feeds` | `76199cdac3ee336e2751995d511111467141d943` | #72 | 0 / 1172 | 0 | SUPERSEDED |
| `claude/ar-c1-reconciliation-adr` | `1e87109119c1945ea81bfa7e29bc9d1663984bf7` | #71 | 0 / 1169 | 0 | SUPERSEDED |
| `claude/ar-c2-qr-pairing` | `78be1730ad2a7963d66ba8c69e5b6480fa46bf2f` | #60 | 0 / 1167 | 0 | SUPERSEDED |
| `claude/ar-c4-i18n-create-b4-buffer-ui` | `4fe95fc0f6f59cc4ddacfc011f8001e5a83ffefd` | #68 | 0 / 1152 | 0 | SUPERSEDED |
| `claude/ar-c4-i18n-pay` | `e02d04c7540607624e4bf4627566a5e605242fe1` | #66 | 0 / 1170 | 0 | SUPERSEDED |
| `claude/ar-c4-i18n-scan` | `7f4702fdd36671fa8c114d08a8e0e4ae13939ddd` | #67 | 0 / 1164 | 0 | SUPERSEDED |
| `claude/ar-c5-device-matrix` | `92af349a2e877d6cf94e7ed95a6466163a205089` | #73 | 0 / 1170 | 0 | SUPERSEDED |
| `claude/ar-c7-embed-iframe-e2e` | `2b9db8ab199881cc6f7e4af3ca90265ffe3dcb0c` | #63 | 0 / 1169 | 0 | SUPERSEDED |
| `claude/consolidation-2026-11-04` | `a28ca06a83dc621a2bcb0eb0432889d7b4416285` | #78 | 0 / 1040 | 0 | SUPERSEDED |
| `claude/cool-albattani-xopr89` | `7373172db4cf40ce5622e5a92a55b2b086e5e7cb` | #30, #26 | 0 / 1417 | 0 | SUPERSEDED |
| `claude/cw-c2` | `b9cba0978cade31e15faa4067adae448e4dcbc04` | none | 0 / 1075 | 0 | SUPERSEDED |
| `claude/cw-c4` | `511c23bd925504b02d329e1c82bc30593d3ac496` | none | 0 / 1081 | 0 | SUPERSEDED |
| `claude/cw-c5` | `99d80dcd0e18ca3c6ec41fcb1333ff99e9075275` | none | 0 / 1075 | 0 | SUPERSEDED |
| `claude/cw-w1` | `704e268bfa7df57964175f820f67400834bdce43` | none | 0 / 1081 | 0 | SUPERSEDED |
| `claude/cw-w5` | `f030376a331445f5059061f24238acb5cf867b29` | none | 0 / 1080 | 0 | SUPERSEDED |
| `claude/cw-w6` | `16cddc21931775fc17ade3a8f37361aed4ae90bf` | none | 0 / 1075 | 0 | SUPERSEDED |
| `claude/cw-w7` | `a4ee36ee4328d80fa30d10b4a81af6b1865b2edd` | none | 0 / 1059 | 0 | SUPERSEDED |
| `claude/cw-w8` | `f162960457b40eb28eaed25a532a56b0a7bc7785` | #79 | 0 / 1496 | 0 | SUPERSEDED |
| `claude/cw-w9` | `8303c8c6a79ca2aeac1789161ba091fa6772e3aa` | none | 0 / 1059 | 0 | SUPERSEDED |
| `claude/cw-w10` | `391454b2609b97dd9e98f65df470dfb880e16142` | none | 0 / 1058 | 0 | SUPERSEDED |
| `claude/cw-w11` | `764020c208c144e165437e244b6a1bc43673dc5f` | none | 0 / 1059 | 0 | SUPERSEDED |
| `claude/docs-screenshots` | `0476cb117ff5ee6b5ccaff77aecc4b4e86038298` | #112 | 0 / 1493 | 0 | SUPERSEDED |
| `claude/docs-snapshot-1` | `dc2340c998250039d906a7beb72a4bed7a2b56c5` | #9 | 0 / 2154 | 0 | SUPERSEDED |
| `claude/docs-snapshot-2` | `e1a92c876c4443b5ad49318ede200119ceaf4e8d` | #10 | 0 / 2153 | 0 | SUPERSEDED |
| `claude/exciting-brown-7v69cr` | `b1327d4d0e263fdfc7d4fb0b5546b18de2d7434e` | #218, #119 | 34 / 4 | 31 | EXTRACT |
| `claude/friendly-turing-1ui0on` | `f4e79b078514cdd174a087bd5142ad76bc49f811` | none | 2 / 4 | 1 | DEFER |
| `claude/gallant-hamilton-4wzkyn` | `ca358acfa8f48d4deff9b770214bcba797b6b1f0` | #121 | 0 / 738 | 0 | SUPERSEDED |
| `claude/ghostpay-autonomous-completion-y4sk2h` | `b6a0871d0618c5ee804947af22d21b794948fa3d` | #37 | 0 / 1191 | 0 | SUPERSEDED |
| `claude/ghostpay-autonomous-prompt-scpgun` | `1db8e967af91bc1d3132e99fa5f4d94696e22997` | #58 | 0 / 1496 | 0 | SUPERSEDED |
| `claude/ghostpay-completion-audit-ot5jjm` | `b5e2ea3e5030b56c79063eb1f91c8a634ee5d740` | #209 | 24 / 4 | 21 | EXTRACT |
| `claude/ghostpay-consolidation-9xhtxg` | `c487f0fe649e24a1e89f1f8fd0d82e90a3441c62` | #206 | 0 / 2 | 0 | SUPERSEDED |
| `claude/ghostpay-consolidation-9xhtxg-feeguard` | `9e5cc3789b7b8a3c550ed2680304ab6245ec6676` | #217 | 1 / 4 | 1 | DEFER |
| `claude/ghostpay-consolidation-9xhtxg-security` | `4894d0d8d94333dffa8ae3937a4d8314f27c686f` | #212 | 6 / 4 | 6 | EXTRACT |
| `claude/ghostpay-consolidation-9xhtxg-spec18` | `ebf7c92c3be1c7aebd37fc58b5567e114fb932fc` | #213 | 6 / 5 | 6 | REWORK |
| `claude/ghostpay-github-pages-up6cj6` | `ac08062ec540d429a0bfb24f3aab042be5d212eb` | #137 | 0 / 600 | 0 | SUPERSEDED |
| `claude/ghostpay-lean-core-milestone-t5lwox` | `2527d6b9367887508d7d8f678a18564132652a03` | #151 | 8 / 1494 | 4 | EXTRACT |
| `claude/gifted-planck-115x2k` | `1d28f24d86f40c7af5d4187f5d0b3b0d0bf79c78` | #39 | 4 / 1197 | 3 | EXTRACT |
| `claude/gracious-heisenberg-97ji6q` | `c6ce2259e7f14e3442e26d37a50313b119e9b442` | #115 | 0 / 1472 | 0 | SUPERSEDED |
| `claude/haiku-wave-2-handoff-qepfoe` | `8d1bde36bb7d16374a2f9ad0ac2c39f46c086951` | #43 | 3 / 1184 | 0 | SUPERSEDED |
| `claude/happy-maxwell-onl4x5` | `fd710eb367eff8bbc250024f5a4317875930736b` | #44 | 1 / 1184 | 1 | EXTRACT |
| `claude/hopeful-bardeen-8ch6l8` | `2a5b29de6a71f13ba855571b74fd33a603cc8736` | #155 | 0 / 1493 | 0 | SUPERSEDED |
| `claude/inspiring-fermat-vxv689` | `c1c4ac9b648174db33c87b59bc9c09267eca731c` | #2 | 0 / 2184 | 0 | SUPERSEDED |
| `claude/kind-faraday-8qzf6e` | `1e4d19f1a533db0be9ce7341a083b7934f8ee81e` | #117 | 0 / 893 | 0 | SUPERSEDED |
| `claude/laughing-bardeen-4t20ys` | `e96cee1a4e12773a6f66781c5a6797cbf9ff4ec5` | #17 | 0 / 2024 | 0 | SUPERSEDED |
| `claude/lucid-meitner-apalzc` | `d6f6617e595bbba7e83a1fcdec585bedb9adaf0f` | #164 | 19 / 332 | 17 | EXTRACT |
| `claude/nice-ritchie-8vivls` | `1bf25be7c5405c0055c3bb99b0ceec8a2226fe23` | #114 | 0 / 904 | 0 | SUPERSEDED |
| `claude/pages-site-1` | `7f77a44483ad844fbf9021ffd6fa4dd95fc8226d` | #13, #19 | 0 / 2140 | 0 | SUPERSEDED |
| `claude/portable-hosting-kit` | `cb917c67bf8a621c48ef02e7d70caf5eadb7b4e2` | #36 | 0 / 1465 | 0 | SUPERSEDED |
| `claude/remote-extensions-1` | `39cce4663d98c7da06775441a301040af51907ed` | #4 | 0 / 2127 | 0 | SUPERSEDED |
| `claude/remote-extensions-2` | `df150cbdb58203789f5afc3050e75d92c655fa49` | #3 | 0 / 2162 | 0 | SUPERSEDED |
| `claude/remote-extensions-3` | `cdfc2ba228d76dd7605921736ed33891d1b14b0b` | #7 | 0 / 2095 | 0 | SUPERSEDED |
| `claude/remote-extensions-4` | `4ffb7a99b222f58fde51726e06df90a6e9863b6d` | #5 | 0 / 2120 | 0 | SUPERSEDED |
| `claude/remote-extensions-5` | `1337f6c121463aa70107bdd065ea88ed30ec3584` | #12, #6 | 0 / 2121 | 0 | SUPERSEDED |
| `claude/remote-extensions-6` | `7fb7aca6d68b96b89d32959636827fcfb343968d` | #14 | 0 / 2124 | 0 | SUPERSEDED |
| `claude/remote-extensions-7` | `e2ac361b7f425ef3b3a7e98389ad3add3353086e` | #8 | 0 / 2112 | 0 | SUPERSEDED |
| `claude/remote-extensions-8` | `ad76a87e1dd5bd21599fcaecec7508de1a241996` | #11, #18 | 0 / 2114 | 0 | SUPERSEDED |
| `claude/remote-extensions-9` | `f09decc278c2052c90dfa209a7098888c8d9877a` | #15 | 0 / 2117 | 0 | SUPERSEDED |
| `claude/remote-extensions-10` | `698404ca488c87347858105bda66be21bf428303` | #16 | 0 / 2111 | 0 | SUPERSEDED |
| `claude/sharp-bohr-uigfgh` | `c9a8c3d3cf549799a9fc93a7053f2d9ccb5d0483` | #42 | 2 / 1506 | 2 | DEFER |
| `claude/vibrant-cori-scu18b` | `9617e8572f9bc414410bd937b0e7718d0c5bd55c` | #219, #113 | 1 / 4 | 1 | DEFER |
| `claude/vigilant-johnson-yjgq94` | `4403d3703cd1dff893e1984e98505691267f8a20` | #150 | 1 / 578 | 1 | EXTRACT |
| `claude/wizardly-babbage-mfsdrl` | `ade77362de33156de849989e26206126f978bb8f` | #76 | 0 / 1496 | 0 | SUPERSEDED |
| `claude/wonderful-thompson-ir89i9` | `97b919c9c19ddc4c0eec6c04299cebd644c8e28a` | #118 | 0 / 896 | 0 | SUPERSEDED |
| `codex/ghostpay-approval-gated-auto-integration-20261109` | `e36786bce4e752cb79d60bdca4b640e36ad45753` | #100 | 0 / 1492 | 0 | SUPERSEDED |
| `codex/ghostpay-canonical-time-20261116` | `27852ba898968a08f7d7c448fac8b19058189281` | #186 | 0 / 84 | 0 | SUPERSEDED |
| `codex/ghostpay-caveman-completion-20261116` | `0c4c3c8d951a9d6e71affcdaa26478911c8037f1` | #182 | 0 / 86 | 0 | SUPERSEDED |
| `codex/ghostpay-caveman-followup-20261116` | `2de9b0c5764cb1fb80a648e18d269b4d91210dcc` | #183 | 0 / 85 | 0 | SUPERSEDED |
| `codex/ghostpay-cloud-41868394956` | `f34a80f710d191b025538bae43cc9b4c92fd2455` | #81 | 1 / 1497 | 0 | SUPERSEDED |
| `codex/ghostpay-companion-merchant-20261109` | `b748ecdce06d2dfa911144814161c31a46a09e9b` | #91 | 0 / 950 | 0 | SUPERSEDED |
| `codex/ghostpay-completion-20261116` | `b4be8866f6ff883fbbedc49be88b5b251a7d270e` | #179 | 0 / 111 | 0 | SUPERSEDED |
| `codex/ghostpay-consolidation-20261030` | `70d8bf6ec37a5ea61868b9de2a3cea60e22ca6d2` | #41 | 0 / 1184 | 0 | SUPERSEDED |
| `codex/ghostpay-consolidation-audit-20261104` | `e2ac398c2c8943a244239b9d6ffa2181e13e7782` | #83 | 0 / 1494 | 0 | SUPERSEDED |
| `codex/ghostpay-continuation-20261109` | `0a68a57b77a70d3bcf4635ccbc5190d735e71f40` | #88 | 0 / 1005 | 0 | SUPERSEDED |
| `codex/ghostpay-integrate-product-cli-20261109` | `3ec039c554f7052b859975facb2b634a1763d5cf` | #95 | 0 / 920 | 0 | SUPERSEDED |
| `codex/ghostpay-mythril-recovery-20261116` | `ffd957e28f982f5c6d2dc00f51143766b2406773` | #180 | 0 / 110 | 0 | SUPERSEDED |
| `codex/ghostpay-observability-20261116` | `c738f96e2f1a0dfef9003ae29ad636b03cf74b09` | #185 | 0 / 84 | 0 | SUPERSEDED |
| `codex/ghostpay-ops-response-cap-20261116` | `73371b57040c61bdb480e724e8593313d95c6781` | #184 | 0 / 84 | 0 | SUPERSEDED |
| `codex/ghostpay-policy-localization-20261109` | `5628bc00b05a6dd0d9cd89f04f0385d9119281ac` | #90 | 0 / 968 | 0 | SUPERSEDED |
| `codex/ghostpay-product-20261109` | `cfc7b0f3325a550df830584e86db4c38bcc9d6b2` | #89 | 0 / 992 | 0 | SUPERSEDED |
| `codex/ghostpay-recovered-lean-checkpoint-20261028` | `371d235c3e5926014c00e027196b6aa567ea1b82` | none | 19 / 1506 | 19 | EXTRACT |
| `codex/ghostpay-registry-recovery-20261116` | `98f779538bb7fe5ffa3b5235f87b6d9cf25bca2c` | #181 | 0 / 110 | 0 | SUPERSEDED |
| `codex/ghostpay-research-acceptance-tests-41750257638` | `57b414bfbc1fa9de9ef68675b9181b4c148f18e4` | #54 | 0 / 1496 | 0 | SUPERSEDED |
| `codex/ghostpay-research-documentation-ux-41750257638` | `96fc22c42a704d1c590d56d624fff15a945c8231` | #56 | 0 / 1496 | 0 | SUPERSEDED |
| `codex/ghostpay-research-release-qualification-41750257638` | `6bd5b15ce4b883b1070ccc1deef6086fd9df3aa4` | #57 | 0 / 1496 | 0 | SUPERSEDED |
| `codex/ghostpay-research-security-review-41750257638` | `2d9c30e12c41cfb0212b0cfc366c83a1e5e45b21` | #55 | 0 / 1496 | 0 | SUPERSEDED |
| `codex/ghostpay-resume-20261028` | `75400888c96b9bddb2a406dd8fd6d273521aebb2` | none | 1 / 1367 | 1 | DEFER |
| `codex/ghostpay-security-audit-20261030` | `63994db6cff8b3b3ca698427eee9e95904230546` | #40 | 5 / 1197 | 3 | EXTRACT |
| `codex/ghostpay-spec09-matrix-20261116` | `2de9b0c5764cb1fb80a648e18d269b4d91210dcc` | none | 0 / 85 | 0 | SUPERSEDED |
| `codex/ghostpay-unified-completion` | `beb525dddcca103de9eda447b55cddf7ee2f428c` | #187 | 0 / 77 | 0 | SUPERSEDED |
| `codex/recovery-spec02-unqualified-20261116` | `8d6fd6df5effc5fad93fd7afafe65f258182923c` | none | 4 / 111 | 4 | DEFER |
| `codex/seller-ledger-receipt-qr` | `bb011134c1bf9cd0e75090fec75d85235d637281` | #24 | 0 / 1548 | 0 | SUPERSEDED |
| `codex/setup-autonomous-agent-20261104` | `122e51710eeee51a5ffc3f9dc76ee0b8ec291d43` | #82 | 2 / 1495 | 2 | DEFER |
| `consolidation/ops-monitor-bounded-streams-20261116` | `d2e8689b038034233d6587cfca547bff3321fcde` | #188 | 0 / 1493 | 0 | SUPERSEDED |
| `consolidation/six-verified-boundaries-20261116` | `c9787b223a240b8bd5a626325944b3c01a2d4be0` | #189 | 0 / 1491 | 0 | SUPERSEDED |
| `dependabot/github_actions/actions-b9ade1236b` | `199ab7ef1e80e6368fdc17c09b94c87a62871861` | #207 | 1 / 4 | 1 | EXTRACT |
| `dependabot/npm_and_yarn/npm-major-1ddf9439d6` | `bbc8ff3ba6c8e3786ccea9bd5c2679d0527bc6aa` | #87 | 1 / 4 | 1 | DEFER |
| `dependabot/npm_and_yarn/npm-minor-patch-71cdd1547c` | `4d19655a2e5d93ad9378803cd4163245168aca24` | #210 | 1 / 4 | 1 | REWORK |
| `docs/future-privacy-feature-specs-20261109` | `896c671f19fdb81c4aae56cd3170c09fe1aba7b7` | #99 | 2 / 1495 | 2 | DEFER |
| `docs/ghostpay-3q-stealth-keypair-export-20261116` | `16bc61fa1c19083cf3c8ee8e33be52bc7f90de83` | #190 | 0 / 75 | 0 | SUPERSEDED |
| `docs/ghostpay-deep-research-20261103` | `894dc868dc5d07102ecb7f6a1e251381d8127f61` | #75 | 0 / 1496 | 0 | SUPERSEDED |
| `docs/ghostpay-privacy-architecture-5a-5l-20261116` | `e05044d4209de7e9cc242c8a83e5fc2264663174` | #191 | 0 / 76 | 0 | SUPERSEDED |
| `docs/lean-release-handoff-2026-10-24` | `2b032d77fef95d5eaa446a72fda2eef46e83bbcd` | #29 | 0 / 1507 | 0 | SUPERSEDED |
| `docs/readme-and-wiki` | `ab2b61687210f79fa5401c8a25fa9a96bcb1ca61` | #1 | 0 / 2205 | 0 | SUPERSEDED |
| `fix/ghostpay-cloud-api-secret-aliases-20261103` | `cdbb7ec775a37f985f6c66afddbcbba6e043f467` | #50 | 1 / 1502 | 0 | SUPERSEDED |
| `fix/ghostpay-reconciliation-saturated-state-20261109` | `a864949d9ee48cb48a43710f5dbd382032ab8db9` | #94 | 0 / 967 | 0 | SUPERSEDED |
| `fix/remediation-b16c7936-5ce634` | `0b213bd9d43409aaa9671945761e51892aa5d69e` | #77 | 1 / 1170 | 0 | SUPERSEDED |
| `fix/remediation-f95457fd-22ecf9` | `6b3e689c15ca0a4ca0bc034ef24c3a2a5fb5ea7a` | #80 | 1 / 1167 | 0 | SUPERSEDED |
| `gh-pages` | `cc8d07943a11b77fbed825c1ede0c8234140ad1d` | none | None / None | 0 | DEFER |
| `ghostpay-cloud-recovery-2026-10-26` | `2ec98b23942838c7177d91c46c66c3768b4ca493` | none | 12 / 1506 | 12 | EXTRACT |
| `ghostpay-local-lean-boundary-20261027` | `020ba327e1a26f6d989d428eee19fb12f63dec82` | none | 18 / 1506 | 18 | EXTRACT |
| `ghostpay-offline-deps-2026-10-27` | `3697f539d3a8e5c5c039fb64f4d2bfc970e7f48c` | none | 13 / 1506 | 13 | EXTRACT |
| `ghostpay-sbom-repro-2026-10-27` | `b5b04b999e84e7598dcb98adbf3c44e340223d05` | none | 14 / 1506 | 14 | EXTRACT |
| `gpt/ghostpay-beta-spec-20261109` | `6697390ff482ba18985de075412ba542e38040ab` | #96, #97 | 0 / 943 | 0 | SUPERSEDED |
| `gpt/ghostpay-cli-completion-20261109` | `3a9ce554ff6ae0231c6a41bbb163fcb5477c9e04` | #92 | 0 / 945 | 0 | SUPERSEDED |
| `gpt/ghostpay-product-completion-20261109` | `3cd1e5544391bad61c943ffab9e5c432d80ea1ee` | #93 | 0 / 948 | 0 | SUPERSEDED |
| `haiku/ghostpay-h01-inventory-20261111` | `747239db1a9b641d761736062c64bfb766d363ed` | #120 | 0 / 1493 | 0 | SUPERSEDED |
| `haiku/l1-i18n-20261114` | `c6a9033449cd9717d022f1c37913f951b1baaa6e` | #147 | 0 / 557 | 0 | SUPERSEDED |
| `haiku/l2-pkg-20261114` | `0c8b111cbe899a49b3cb03dc32c375b36ca9768d` | #148 | 0 / 580 | 0 | SUPERSEDED |
| `haiku/l3-ledger-20261114` | `8c91051b449248bfc822a6578a3815b3c9d83ce3` | #149 | 0 / 580 | 0 | SUPERSEDED |
| `integration/consolidated-2026-10-21` | `c206655ebfa747b3dd56b1dc9f4e7f16e641a833` | #20 | 0 / 1557 | 0 | SUPERSEDED |
| `integration/consolidated-2026-11-14` | `a89a2e948321314acf97db435e9776d9322a9461` | #157 | 0 / 358 | 0 | SUPERSEDED |
| `integration/ghostpay-accepted-20261102` | `f8193502e602c99bb24ff956f142671750b744a0` | #47 | 0 / 1174 | 0 | SUPERSEDED |
| `integration/ghostpay-beta-consolidated-20261109` | `364b1f185fcc2adaedab4ce7b4b14e676b1da3b7` | #98 | 0 / 914 | 0 | SUPERSEDED |
| `main` | `dfc75ef2087fa6463ae59e0818abec01796c578d` | none | 0 / 0 | 0 | SUPERSEDED |
| `nodata/doc-sweep-20261118` | `cce7a7f7e548130afba2ef6b2be518ca5b667ade` | #223 | 1 / 4 | 1 | REWORK |
| `nodata/eager-babbage-0w6sf6` | `2693b08ed4b1dae35fad604a2324b790f1eee5dc` | #204 | 0 / 1488 | 0 | SUPERSEDED |
| `nodata/jolly-rubin-u4zd45` | `1054daabc5cabe958466ec144582d76137b54910` | #224, #135 | 5 / 4 | 5 | EXTRACT |
| `nodata/wizardly-allen-qwol6u` | `1c9a3ce4a103c86b9ca849a2fd5ed77f86c66849` | #221, #203 | 1 / 4 | 1 | EXTRACT |
| `nodata/wonderful-darwin-kd1h22` | `a92658b1ef6b95ff0145b2e1933d0047d51289d5` | #211 | 48 / 4 | 41 | EXTRACT |
| `nodata/zealous-hopper-lr0nxe` | `b2604949ae3cfae493bcfb0213d390a213e63037` | #205 | 4 / 4 | 3 | EXTRACT |
| `privacy/hardening-recommendations` | `2bc2098298d90928eb1acafad969f28316bb05fc` | #222 | 2 / 4 | 2 | REWORK |
| `research/privacy-evidence-matrix-20261110` | `a0a2d1dfbbdb10d89ef1a6ca4557d286d0e3f49e` | #116 | 0 / 1493 | 0 | SUPERSEDED |
| `security/mythril-full-remediation-20261118` | `16c48521f99903ccd2e584df5d00a9dec5ef754c` | #220 | 9 / 4 | 9 | EXTRACT |
| `work/ghostpay-consolidation-review-20261025` | `a2217ea1ccdd29f4e67ebdde9e6606eaa0fde523` | none | 0 / 1504 | 0 | SUPERSEDED |
| `work/ghostpay-pr26-qa-2026-10-24` | `77e7d7b6dd21da1995259c8950141db0d34bcb6e` | none | 0 / 1521 | 0 | SUPERSEDED |
| `work/local-reconstruction-2026-10-24` | `bd320d530c725c0edc820b496ea298d741c7ba9e` | none | 0 / 1530 | 0 | SUPERSEDED |

## PR history

All PRs are retained below for reconciliation; open candidates have their detailed decisions above.

| PR | State | Head | Merge commit | Disposition |
|---|---|---|---|---|
| [#237](https://github.com/djshellshoxxx/GhostPay/pull/237) | open | `7109290b7e4f029c36d9743bde9fd664d1da5474` | none | BLOCKED |
| [#236](https://github.com/djshellshoxxx/GhostPay/pull/236) | open | `defdaa308a2d05ab407af7e42f8dc457cf52d103` | none | REWORK |
| [#235](https://github.com/djshellshoxxx/GhostPay/pull/235) | open | `a5076f4d4e8d2dc515bdc31f304b6c6ce75bf3b1` | none | BLOCKED |
| [#234](https://github.com/djshellshoxxx/GhostPay/pull/234) | open | `5e9e7be70399a9818579cf87bd494e013e25d4f9` | none | BLOCKED |
| [#233](https://github.com/djshellshoxxx/GhostPay/pull/233) | open | `67cf835d0bf5f3b239e8ee6f18dca401fd5a5050` | none | EXTRACT |
| [#232](https://github.com/djshellshoxxx/GhostPay/pull/232) | open | `437704da28fc5d9dbf6abea3fd2c50014319ecf4` | none | EXTRACT |
| [#231](https://github.com/djshellshoxxx/GhostPay/pull/231) | open | `d9ff386807de724eb1a1c4d400c882df0fc20bb7` | none | BLOCKED |
| [#230](https://github.com/djshellshoxxx/GhostPay/pull/230) | open | `0b2609c2c83143741ad343bfb08234a2d1182aa5` | none | EXTRACT |
| [#229](https://github.com/djshellshoxxx/GhostPay/pull/229) | open | `18110015e99efbeb4f23d47cd88bd6f917010108` | none | EXTRACT |
| [#228](https://github.com/djshellshoxxx/GhostPay/pull/228) | open | `685fe1a39a3fa9f1d6a4d10a77b4d1a2745edeed` | none | EXTRACT |
| [#227](https://github.com/djshellshoxxx/GhostPay/pull/227) | open | `613667be4eeb132c7d21ccd06c627f9a7144d85b` | none | BLOCKED |
| [#226](https://github.com/djshellshoxxx/GhostPay/pull/226) | open | `3a3b136a326e0d8c1f369d94d4517ad0711babc8` | none | EXTRACT |
| [#225](https://github.com/djshellshoxxx/GhostPay/pull/225) | open | `94ca7d5ba9dc65c7324805e5bf9b7d1d2dccee57` | none | EXTRACT |
| [#224](https://github.com/djshellshoxxx/GhostPay/pull/224) | open | `1054daabc5cabe958466ec144582d76137b54910` | none | EXTRACT |
| [#223](https://github.com/djshellshoxxx/GhostPay/pull/223) | open | `cce7a7f7e548130afba2ef6b2be518ca5b667ade` | none | REWORK |
| [#222](https://github.com/djshellshoxxx/GhostPay/pull/222) | open | `2bc2098298d90928eb1acafad969f28316bb05fc` | none | REWORK |
| [#221](https://github.com/djshellshoxxx/GhostPay/pull/221) | open | `1c9a3ce4a103c86b9ca849a2fd5ed77f86c66849` | none | EXTRACT |
| [#220](https://github.com/djshellshoxxx/GhostPay/pull/220) | open | `16c48521f99903ccd2e584df5d00a9dec5ef754c` | none | EXTRACT |
| [#219](https://github.com/djshellshoxxx/GhostPay/pull/219) | open | `9617e8572f9bc414410bd937b0e7718d0c5bd55c` | none | DEFER |
| [#218](https://github.com/djshellshoxxx/GhostPay/pull/218) | open | `b1327d4d0e263fdfc7d4fb0b5546b18de2d7434e` | none | EXTRACT |
| [#217](https://github.com/djshellshoxxx/GhostPay/pull/217) | open | `9e5cc3789b7b8a3c550ed2680304ab6245ec6676` | none | DEFER |
| [#216](https://github.com/djshellshoxxx/GhostPay/pull/216) | open | `a78a5467f5eb7de83b9ea9f08c6633ada30e026d` | none | EXTRACT |
| [#215](https://github.com/djshellshoxxx/GhostPay/pull/215) | open | `b43b134028357455a557ca95f820e7dfd586eef7` | none | REWORK |
| [#214](https://github.com/djshellshoxxx/GhostPay/pull/214) | open | `7490aac58ece15f9e4ec9979fbe48987354618fa` | none | EXTRACT |
| [#213](https://github.com/djshellshoxxx/GhostPay/pull/213) | open | `ebf7c92c3be1c7aebd37fc58b5567e114fb932fc` | none | REWORK |
| [#212](https://github.com/djshellshoxxx/GhostPay/pull/212) | open | `4894d0d8d94333dffa8ae3937a4d8314f27c686f` | none | EXTRACT |
| [#211](https://github.com/djshellshoxxx/GhostPay/pull/211) | open | `a92658b1ef6b95ff0145b2e1933d0047d51289d5` | none | EXTRACT |
| [#210](https://github.com/djshellshoxxx/GhostPay/pull/210) | open | `4d19655a2e5d93ad9378803cd4163245168aca24` | none | REWORK |
| [#209](https://github.com/djshellshoxxx/GhostPay/pull/209) | open | `b5e2ea3e5030b56c79063eb1f91c8a634ee5d740` | none | EXTRACT |
| [#208](https://github.com/djshellshoxxx/GhostPay/pull/208) | open | `ef610872aa4ef1f2ee3d0b177f883481662d4733` | none | DEFER |
| [#207](https://github.com/djshellshoxxx/GhostPay/pull/207) | open | `199ab7ef1e80e6368fdc17c09b94c87a62871861` | none | EXTRACT |
| [#206](https://github.com/djshellshoxxx/GhostPay/pull/206) | merged | `c487f0fe649e24a1e89f1f8fd0d82e90a3441c62` | dfc75ef2087fa6463ae59e0818abec01796c578d | SUPERSEDED |
| [#205](https://github.com/djshellshoxxx/GhostPay/pull/205) | open | `b2604949ae3cfae493bcfb0213d390a213e63037` | none | EXTRACT |
| [#204](https://github.com/djshellshoxxx/GhostPay/pull/204) | merged | `2693b08ed4b1dae35fad604a2324b790f1eee5dc` | c487f0fe649e24a1e89f1f8fd0d82e90a3441c62 | SUPERSEDED |
| [#203](https://github.com/djshellshoxxx/GhostPay/pull/203) | merged | `71abc7e55c25d45b206ac47e5ddd24e072805710` | 5467c158069c5bab264b6a653ac56e89e13f3e13 | SUPERSEDED |
| [#202](https://github.com/djshellshoxxx/GhostPay/pull/202) | closed | `30cc4560c6a71694a1cd116d879823e9a596e4d3` | none | DEFER |
| [#201](https://github.com/djshellshoxxx/GhostPay/pull/201) | closed | `2fb89ff5f2dcf34f3a02b66e4485d5e282ee9aa1` | none | DEFER |
| [#200](https://github.com/djshellshoxxx/GhostPay/pull/200) | closed | `23cc6db4b924943ba99b169ac83c214272dcaa10` | none | DEFER |
| [#199](https://github.com/djshellshoxxx/GhostPay/pull/199) | closed | `b570d4bb748d318e0963d6bfa2f5e19f22e0d666` | none | DEFER |
| [#198](https://github.com/djshellshoxxx/GhostPay/pull/198) | closed | `9732adb949cc7191beddcb986dff76e9f9534537` | none | DEFER |
| [#197](https://github.com/djshellshoxxx/GhostPay/pull/197) | closed | `68993c668aa70ac4be1a9deeeef3badec3b10fcd` | none | DEFER |
| [#196](https://github.com/djshellshoxxx/GhostPay/pull/196) | closed | `120dcd7fc15b2d5a646a93835287ef9bc7281fe1` | none | DEFER |
| [#195](https://github.com/djshellshoxxx/GhostPay/pull/195) | closed | `12e18931ae99d1444e1f3f3ecfc5f8c117a7b6d0` | none | DEFER |
| [#194](https://github.com/djshellshoxxx/GhostPay/pull/194) | closed | `c15833bc2aa6e0e0189f6cd18becf293e0e6e73e` | none | DEFER |
| [#193](https://github.com/djshellshoxxx/GhostPay/pull/193) | closed | `8aed22ad44ee2131b36a9e12ec2dc33fe3501e1b` | none | DEFER |
| [#192](https://github.com/djshellshoxxx/GhostPay/pull/192) | closed | `dd4a7eb4dd71435284d9d326310cb2695faa249a` | none | DEFER |
| [#191](https://github.com/djshellshoxxx/GhostPay/pull/191) | closed | `e05044d4209de7e9cc242c8a83e5fc2264663174` | none | DEFER |
| [#190](https://github.com/djshellshoxxx/GhostPay/pull/190) | closed | `16bc61fa1c19083cf3c8ee8e33be52bc7f90de83` | none | DEFER |
| [#189](https://github.com/djshellshoxxx/GhostPay/pull/189) | merged | `c9787b223a240b8bd5a626325944b3c01a2d4be0` | cfaebeeae22f292cb0bb3074619b2603cb738367 | SUPERSEDED |
| [#188](https://github.com/djshellshoxxx/GhostPay/pull/188) | merged | `d2e8689b038034233d6587cfca547bff3321fcde` | 0fb33dc87571c918c1bdfa8b5e3e55c8c12c1be6 | SUPERSEDED |
| [#187](https://github.com/djshellshoxxx/GhostPay/pull/187) | merged | `beb525dddcca103de9eda447b55cddf7ee2f428c` | f5e10f84dfa71d26ffc4024adcec94111152c0ee | SUPERSEDED |
| [#186](https://github.com/djshellshoxxx/GhostPay/pull/186) | closed | `27852ba898968a08f7d7c448fac8b19058189281` | none | DEFER |
| [#185](https://github.com/djshellshoxxx/GhostPay/pull/185) | closed | `c738f96e2f1a0dfef9003ae29ad636b03cf74b09` | none | DEFER |
| [#184](https://github.com/djshellshoxxx/GhostPay/pull/184) | closed | `73371b57040c61bdb480e724e8593313d95c6781` | none | DEFER |
| [#183](https://github.com/djshellshoxxx/GhostPay/pull/183) | merged | `2de9b0c5764cb1fb80a648e18d269b4d91210dcc` | 0c4c3c8d951a9d6e71affcdaa26478911c8037f1 | SUPERSEDED |
| [#182](https://github.com/djshellshoxxx/GhostPay/pull/182) | closed | `0c4c3c8d951a9d6e71affcdaa26478911c8037f1` | none | DEFER |
| [#181](https://github.com/djshellshoxxx/GhostPay/pull/181) | closed | `98f779538bb7fe5ffa3b5235f87b6d9cf25bca2c` | none | DEFER |
| [#180](https://github.com/djshellshoxxx/GhostPay/pull/180) | closed | `ffd957e28f982f5c6d2dc00f51143766b2406773` | none | DEFER |
| [#179](https://github.com/djshellshoxxx/GhostPay/pull/179) | closed | `b4be8866f6ff883fbbedc49be88b5b251a7d270e` | none | DEFER |
| [#178](https://github.com/djshellshoxxx/GhostPay/pull/178) | closed | `cf5ad81cab48424e6302e507c9af46bf4c99aee4` | none | DEFER |
| [#177](https://github.com/djshellshoxxx/GhostPay/pull/177) | closed | `17f681915f25441f5c38326ad718b8082495d52a` | none | DEFER |
| [#176](https://github.com/djshellshoxxx/GhostPay/pull/176) | closed | `7d1f0ae17e31c0a9e706188cb1c98900ea1757b1` | none | DEFER |
| [#175](https://github.com/djshellshoxxx/GhostPay/pull/175) | closed | `57acf1b06b3b31ada0220556cf64344e1f854e21` | none | DEFER |
| [#174](https://github.com/djshellshoxxx/GhostPay/pull/174) | closed | `dffe072511c34b8a73bd64ac6147d5a79256480e` | none | DEFER |
| [#173](https://github.com/djshellshoxxx/GhostPay/pull/173) | closed | `97cf5a0cda257451c99643909a7b5ebe7da89a79` | none | DEFER |
| [#172](https://github.com/djshellshoxxx/GhostPay/pull/172) | closed | `dffe072511c34b8a73bd64ac6147d5a79256480e` | none | DEFER |
| [#171](https://github.com/djshellshoxxx/GhostPay/pull/171) | closed | `433307b869acf2d81b2d12b415631076a89f7213` | none | DEFER |
| [#170](https://github.com/djshellshoxxx/GhostPay/pull/170) | closed | `775756931be4683f47e8af6b2ecf26f9458897d7` | none | DEFER |
| [#169](https://github.com/djshellshoxxx/GhostPay/pull/169) | closed | `97a617b5b95f04a1e736c5c730c587ef0824d05a` | none | DEFER |
| [#168](https://github.com/djshellshoxxx/GhostPay/pull/168) | closed | `90a145740a163a9515e5c70e79be33610b67b293` | none | DEFER |
| [#167](https://github.com/djshellshoxxx/GhostPay/pull/167) | closed | `cf6a8d69620af6271e573a8b20fe1562e89ef81c` | none | DEFER |
| [#166](https://github.com/djshellshoxxx/GhostPay/pull/166) | closed | `f3872e90eb255b46a773d78f4f5adb6239db2b4f` | none | DEFER |
| [#165](https://github.com/djshellshoxxx/GhostPay/pull/165) | closed | `9b3a3070499a2a6d70349d540f7aaaed006426e9` | none | DEFER |
| [#164](https://github.com/djshellshoxxx/GhostPay/pull/164) | closed | `0d2ea8b40d6eea95388ace12d1bb03049f5d181e` | none | DEFER |
| [#163](https://github.com/djshellshoxxx/GhostPay/pull/163) | closed | `cf5e876ce164e63d535fb6e40319573798b746e1` | none | DEFER |
| [#162](https://github.com/djshellshoxxx/GhostPay/pull/162) | closed | `26f83ccdda98ee82c26ad5f71c3f90d90ad68c20` | none | DEFER |
| [#161](https://github.com/djshellshoxxx/GhostPay/pull/161) | closed | `73923350fcda62f00be0f2b83ad346f416a24bb6` | none | DEFER |
| [#160](https://github.com/djshellshoxxx/GhostPay/pull/160) | open | `2221a6117cdcf397527d96c2b20862d05a6b26da` | none | DEFER |
| [#159](https://github.com/djshellshoxxx/GhostPay/pull/159) | closed | `7b6c4983e5c0ba048edf97aaff7399bd77980234` | none | DEFER |
| [#158](https://github.com/djshellshoxxx/GhostPay/pull/158) | closed | `9a84764e70603e5f4e0b7bac13bdb6eeec6e469b` | none | DEFER |
| [#157](https://github.com/djshellshoxxx/GhostPay/pull/157) | merged | `a89a2e948321314acf97db435e9776d9322a9461` | a89a2e948321314acf97db435e9776d9322a9461 | SUPERSEDED |
| [#156](https://github.com/djshellshoxxx/GhostPay/pull/156) | closed | `81fd4c032e29a87ce509236a0398468022c23012` | none | DEFER |
| [#155](https://github.com/djshellshoxxx/GhostPay/pull/155) | closed | `2a5b29de6a71f13ba855571b74fd33a603cc8736` | none | DEFER |
| [#154](https://github.com/djshellshoxxx/GhostPay/pull/154) | closed | `9bdc9cbade90995e3207b72535a7818f909c2684` | none | DEFER |
| [#153](https://github.com/djshellshoxxx/GhostPay/pull/153) | open | `83fe9b022d2b5a4068137fd7987467f1803803dc` | none | DEFER |
| [#152](https://github.com/djshellshoxxx/GhostPay/pull/152) | closed | `15dc9c192c6086f2e51bcce68ca18ea483968b57` | none | DEFER |
| [#151](https://github.com/djshellshoxxx/GhostPay/pull/151) | closed | `2527d6b9367887508d7d8f678a18564132652a03` | none | DEFER |
| [#150](https://github.com/djshellshoxxx/GhostPay/pull/150) | closed | `36bcdb7470caf7e563b4f72cadc209504137fd6f` | none | DEFER |
| [#149](https://github.com/djshellshoxxx/GhostPay/pull/149) | closed | `8c91051b449248bfc822a6578a3815b3c9d83ce3` | none | DEFER |
| [#148](https://github.com/djshellshoxxx/GhostPay/pull/148) | closed | `0c8b111cbe899a49b3cb03dc32c375b36ca9768d` | none | DEFER |
| [#147](https://github.com/djshellshoxxx/GhostPay/pull/147) | closed | `c6a9033449cd9717d022f1c37913f951b1baaa6e` | none | DEFER |
| [#146](https://github.com/djshellshoxxx/GhostPay/pull/146) | closed | `3cf3437a8d9dbe3ec1d9056adb73fb93f0f2929c` | none | DEFER |
| [#145](https://github.com/djshellshoxxx/GhostPay/pull/145) | closed | `c8d4c42bee724bacd244bc90b0259c961d27e84f` | none | DEFER |
| [#144](https://github.com/djshellshoxxx/GhostPay/pull/144) | closed | `907e2919e93091fd2e9c2abaecbeb95e331f4b7d` | none | DEFER |
| [#143](https://github.com/djshellshoxxx/GhostPay/pull/143) | closed | `ab427ab81c7bc18a6d908c5201cf86450cf3f21f` | none | DEFER |
| [#142](https://github.com/djshellshoxxx/GhostPay/pull/142) | closed | `eece5aff554255ca6c02e53849403f66123b8e40` | none | DEFER |
| [#141](https://github.com/djshellshoxxx/GhostPay/pull/141) | closed | `68aca93bc19e4c9d91fa37212d9b8c502b4ce884` | none | DEFER |
| [#140](https://github.com/djshellshoxxx/GhostPay/pull/140) | open | `c5efadab9d9af6a0053f489ebe6c0c06e760d025` | none | REWORK |
| [#139](https://github.com/djshellshoxxx/GhostPay/pull/139) | open | `364b01f847391cd02b3aecb74e18ddd047096c97` | none | DEFER |
| [#138](https://github.com/djshellshoxxx/GhostPay/pull/138) | closed | `6f59cc2cb7add5ca04aa05eef724cb0a65bb3891` | none | DEFER |
| [#137](https://github.com/djshellshoxxx/GhostPay/pull/137) | closed | `ac08062ec540d429a0bfb24f3aab042be5d212eb` | none | DEFER |
| [#136](https://github.com/djshellshoxxx/GhostPay/pull/136) | merged | `c11f905b362ae2b0734b4dc6ff348fe3c5e0fcfa` | e556688381efdaf25253fb3f75df846b1e278916 | SUPERSEDED |
| [#135](https://github.com/djshellshoxxx/GhostPay/pull/135) | closed | `f88aaf2fe27a7656d15fed50670d841879da92ad` | none | DEFER |
| [#134](https://github.com/djshellshoxxx/GhostPay/pull/134) | closed | `8277879eeaa003c31fd76b4f840b9628f4b02cf7` | none | DEFER |
| [#133](https://github.com/djshellshoxxx/GhostPay/pull/133) | closed | `f3a9b2389f8ba32f7a3cccce2cdabc186c23df1b` | none | DEFER |
| [#132](https://github.com/djshellshoxxx/GhostPay/pull/132) | closed | `c3173f849ad6ce3d3e5a4c4b2a1efdb7d9c937df` | none | DEFER |
| [#131](https://github.com/djshellshoxxx/GhostPay/pull/131) | closed | `bbc7dda4ce275613296609a5001bac36c888229e` | none | DEFER |
| [#130](https://github.com/djshellshoxxx/GhostPay/pull/130) | closed | `eb21d57c8ad1550481d5d674fa6356ac98f146f0` | none | DEFER |
| [#129](https://github.com/djshellshoxxx/GhostPay/pull/129) | closed | `3fd18ef4011b8d6e094ac49a13c0e6ccc2c0c9c9` | none | DEFER |
| [#128](https://github.com/djshellshoxxx/GhostPay/pull/128) | closed | `1a5e815d8446f00a63f98de261081910c9c78ce6` | none | DEFER |
| [#127](https://github.com/djshellshoxxx/GhostPay/pull/127) | closed | `cf3a8b23a1994b39d2cf77b72d8c61c0a903ae4a` | none | DEFER |
| [#126](https://github.com/djshellshoxxx/GhostPay/pull/126) | closed | `d77956901d95c3eeb8c5c1d67ae7d1647bd069aa` | none | DEFER |
| [#125](https://github.com/djshellshoxxx/GhostPay/pull/125) | closed | `a6e74591e134b31de3e0efc84448eb97cdc3b012` | none | DEFER |
| [#124](https://github.com/djshellshoxxx/GhostPay/pull/124) | closed | `afaf7ce62d2bad7ecfc558d96b8dd6fb772cc790` | none | DEFER |
| [#123](https://github.com/djshellshoxxx/GhostPay/pull/123) | closed | `7cdc6b32ecafd73636136c852542fddd42213848` | none | DEFER |
| [#122](https://github.com/djshellshoxxx/GhostPay/pull/122) | closed | `72dde82d9d898f5ed0c3c2b6901870c557a5012a` | none | DEFER |
| [#121](https://github.com/djshellshoxxx/GhostPay/pull/121) | closed | `ca358acfa8f48d4deff9b770214bcba797b6b1f0` | none | DEFER |
| [#120](https://github.com/djshellshoxxx/GhostPay/pull/120) | merged | `747239db1a9b641d761736062c64bfb766d363ed` | 153de1b07f00756e063ffcfa79d78eb9619eae75 | SUPERSEDED |
| [#119](https://github.com/djshellshoxxx/GhostPay/pull/119) | closed | `07968599cd37a98b8fb7b212609bc343e62c5c94` | none | DEFER |
| [#118](https://github.com/djshellshoxxx/GhostPay/pull/118) | closed | `97b919c9c19ddc4c0eec6c04299cebd644c8e28a` | none | DEFER |
| [#117](https://github.com/djshellshoxxx/GhostPay/pull/117) | closed | `1e4d19f1a533db0be9ce7341a083b7934f8ee81e` | none | DEFER |
| [#116](https://github.com/djshellshoxxx/GhostPay/pull/116) | merged | `a0a2d1dfbbdb10d89ef1a6ca4557d286d0e3f49e` | ca358acfa8f48d4deff9b770214bcba797b6b1f0 | SUPERSEDED |
| [#115](https://github.com/djshellshoxxx/GhostPay/pull/115) | merged | `c6ce2259e7f14e3442e26d37a50313b119e9b442` | 8755b7d3a933c9f0a5647fe8285c8c97d788c9c7 | SUPERSEDED |
| [#114](https://github.com/djshellshoxxx/GhostPay/pull/114) | closed | `1bf25be7c5405c0055c3bb99b0ceec8a2226fe23` | none | DEFER |
| [#113](https://github.com/djshellshoxxx/GhostPay/pull/113) | closed | `0641d41a4e869b9a1b16d25aa839070b4492bea1` | none | DEFER |
| [#112](https://github.com/djshellshoxxx/GhostPay/pull/112) | merged | `0476cb117ff5ee6b5ccaff77aecc4b4e86038298` | 220145ec8a900250f60ce4fd4a34e4d05ef8b375 | SUPERSEDED |
| [#111](https://github.com/djshellshoxxx/GhostPay/pull/111) | closed | `b12a20e1d6e284e8e3e228ab6bf08c83c012777a` | none | DEFER |
| [#110](https://github.com/djshellshoxxx/GhostPay/pull/110) | closed | `bbe300b7fb21829350f66677d270a689f3a79ecf` | none | DEFER |
| [#109](https://github.com/djshellshoxxx/GhostPay/pull/109) | closed | `969d1b270b243ce6fbdf1d7b9f5e813b775e7ea3` | none | DEFER |
| [#108](https://github.com/djshellshoxxx/GhostPay/pull/108) | closed | `0a61e2c7fc54a87fc80cb8f7fadd143d1f1789aa` | none | DEFER |
| [#107](https://github.com/djshellshoxxx/GhostPay/pull/107) | closed | `0ab175e552485032672c59d9b38c733545c7c50f` | none | DEFER |
| [#106](https://github.com/djshellshoxxx/GhostPay/pull/106) | closed | `5280569b7eaad9b4d996861410211cd40d005fdb` | none | DEFER |
| [#105](https://github.com/djshellshoxxx/GhostPay/pull/105) | closed | `83d17adb4a07ff2120c6674a5128684e4f13776a` | none | DEFER |
| [#104](https://github.com/djshellshoxxx/GhostPay/pull/104) | closed | `fa375dbc1f2416b27d75e44487e5a382f237b379` | none | DEFER |
| [#103](https://github.com/djshellshoxxx/GhostPay/pull/103) | closed | `621ee0af3f4748c072eee0479accad82f7c2fdd3` | none | DEFER |
| [#102](https://github.com/djshellshoxxx/GhostPay/pull/102) | closed | `a2f4205f900d87ed0726aadeda4b808e6c76fd0c` | none | DEFER |
| [#101](https://github.com/djshellshoxxx/GhostPay/pull/101) | merged | `d15921981ecfe8342886c27c52af43c22c1c6205` | 4bf0ffa6cdf080ea6852bf40a047de82ad8d5da4 | SUPERSEDED |
| [#100](https://github.com/djshellshoxxx/GhostPay/pull/100) | closed | `e36786bce4e752cb79d60bdca4b640e36ad45753` | none | DEFER |
| [#99](https://github.com/djshellshoxxx/GhostPay/pull/99) | merged | `896c671f19fdb81c4aae56cd3170c09fe1aba7b7` | bd2652bf1853948594522140a6a0fe0cbe54e32b | SUPERSEDED |
| [#98](https://github.com/djshellshoxxx/GhostPay/pull/98) | merged | `364b1f185fcc2adaedab4ce7b4b14e676b1da3b7` | 16eac253db24db584a9fee09a15d58656cb7cf00 | SUPERSEDED |
| [#97](https://github.com/djshellshoxxx/GhostPay/pull/97) | merged | `6697390ff482ba18985de075412ba542e38040ab` | 364b1f185fcc2adaedab4ce7b4b14e676b1da3b7 | SUPERSEDED |
| [#96](https://github.com/djshellshoxxx/GhostPay/pull/96) | closed | `6697390ff482ba18985de075412ba542e38040ab` | none | DEFER |
| [#95](https://github.com/djshellshoxxx/GhostPay/pull/95) | closed | `3ec039c554f7052b859975facb2b634a1763d5cf` | none | DEFER |
| [#94](https://github.com/djshellshoxxx/GhostPay/pull/94) | closed | `a864949d9ee48cb48a43710f5dbd382032ab8db9` | none | DEFER |
| [#93](https://github.com/djshellshoxxx/GhostPay/pull/93) | closed | `3cd1e5544391bad61c943ffab9e5c432d80ea1ee` | none | DEFER |
| [#92](https://github.com/djshellshoxxx/GhostPay/pull/92) | closed | `3a9ce554ff6ae0231c6a41bbb163fcb5477c9e04` | none | DEFER |
| [#91](https://github.com/djshellshoxxx/GhostPay/pull/91) | closed | `b748ecdce06d2dfa911144814161c31a46a09e9b` | none | DEFER |
| [#90](https://github.com/djshellshoxxx/GhostPay/pull/90) | closed | `5628bc00b05a6dd0d9cd89f04f0385d9119281ac` | none | DEFER |
| [#89](https://github.com/djshellshoxxx/GhostPay/pull/89) | closed | `cfc7b0f3325a550df830584e86db4c38bcc9d6b2` | none | DEFER |
| [#88](https://github.com/djshellshoxxx/GhostPay/pull/88) | merged | `0a68a57b77a70d3bcf4635ccbc5190d735e71f40` | 0a68a57b77a70d3bcf4635ccbc5190d735e71f40 | SUPERSEDED |
| [#87](https://github.com/djshellshoxxx/GhostPay/pull/87) | open | `bbc8ff3ba6c8e3786ccea9bd5c2679d0527bc6aa` | none | DEFER |
| [#86](https://github.com/djshellshoxxx/GhostPay/pull/86) | closed | `e09bbc1201b56d0fa40d7fa1a963263c81fb3da6` | none | DEFER |
| [#85](https://github.com/djshellshoxxx/GhostPay/pull/85) | closed | `8f34d83c618b6cde9b0854fa414e30f742faa94e` | none | DEFER |
| [#84](https://github.com/djshellshoxxx/GhostPay/pull/84) | merged | `5f9e444d3c9775f920b2f4f9a8771a7f8a3d86bf` | c56fd79706e3b383b72f5367094d1ee74a205092 | SUPERSEDED |
| [#83](https://github.com/djshellshoxxx/GhostPay/pull/83) | merged | `e2ac398c2c8943a244239b9d6ffa2181e13e7782` | 88765da896e8976fcbc334ec726e19f6497daf94 | SUPERSEDED |
| [#82](https://github.com/djshellshoxxx/GhostPay/pull/82) | open | `122e51710eeee51a5ffc3f9dc76ee0b8ec291d43` | none | DEFER |
| [#81](https://github.com/djshellshoxxx/GhostPay/pull/81) | closed | `f34a80f710d191b025538bae43cc9b4c92fd2455` | none | DEFER |
| [#80](https://github.com/djshellshoxxx/GhostPay/pull/80) | closed | `6b3e689c15ca0a4ca0bc034ef24c3a2a5fb5ea7a` | none | DEFER |
| [#79](https://github.com/djshellshoxxx/GhostPay/pull/79) | merged | `f162960457b40eb28eaed25a532a56b0a7bc7785` | f162960457b40eb28eaed25a532a56b0a7bc7785 | SUPERSEDED |
| [#78](https://github.com/djshellshoxxx/GhostPay/pull/78) | merged | `a28ca06a83dc621a2bcb0eb0432889d7b4416285` | 9dcf393e040f4591987ca7ab62dbc46a11f6828f | SUPERSEDED |
| [#77](https://github.com/djshellshoxxx/GhostPay/pull/77) | closed | `0b213bd9d43409aaa9671945761e51892aa5d69e` | none | DEFER |
| [#76](https://github.com/djshellshoxxx/GhostPay/pull/76) | merged | `ade77362de33156de849989e26206126f978bb8f` | f9d262423037751c52eb3e08faa75b1314e0805a | SUPERSEDED |
| [#75](https://github.com/djshellshoxxx/GhostPay/pull/75) | merged | `894dc868dc5d07102ecb7f6a1e251381d8127f61` | 63ea83379c19cd1059de390bf3805e308078ab13 | SUPERSEDED |
| [#74](https://github.com/djshellshoxxx/GhostPay/pull/74) | closed | `27d1580c5c535cef5ea44491716d0d86712df841` | none | DEFER |
| [#73](https://github.com/djshellshoxxx/GhostPay/pull/73) | closed | `92af349a2e877d6cf94e7ed95a6466163a205089` | none | DEFER |
| [#72](https://github.com/djshellshoxxx/GhostPay/pull/72) | closed | `76199cdac3ee336e2751995d511111467141d943` | none | DEFER |
| [#71](https://github.com/djshellshoxxx/GhostPay/pull/71) | closed | `1e87109119c1945ea81bfa7e29bc9d1663984bf7` | none | DEFER |
| [#70](https://github.com/djshellshoxxx/GhostPay/pull/70) | closed | `d9fe8b4e9c020f8cef0073b9a990903fad38f1a8` | none | DEFER |
| [#69](https://github.com/djshellshoxxx/GhostPay/pull/69) | closed | `9d100956f08ddab66c6aeff1647ca51f3d5ef9cc` | none | DEFER |
| [#68](https://github.com/djshellshoxxx/GhostPay/pull/68) | closed | `4fe95fc0f6f59cc4ddacfc011f8001e5a83ffefd` | none | DEFER |
| [#67](https://github.com/djshellshoxxx/GhostPay/pull/67) | closed | `7f4702fdd36671fa8c114d08a8e0e4ae13939ddd` | none | DEFER |
| [#66](https://github.com/djshellshoxxx/GhostPay/pull/66) | closed | `e02d04c7540607624e4bf4627566a5e605242fe1` | none | DEFER |
| [#65](https://github.com/djshellshoxxx/GhostPay/pull/65) | closed | `f7b8ee9db98162a97a962ff40d77460cb6eb8417` | none | DEFER |
| [#64](https://github.com/djshellshoxxx/GhostPay/pull/64) | closed | `2bcfd11f9dc56138612079a713ecf1b2bcdb0cd0` | none | DEFER |
| [#63](https://github.com/djshellshoxxx/GhostPay/pull/63) | closed | `2b9db8ab199881cc6f7e4af3ca90265ffe3dcb0c` | none | DEFER |
| [#62](https://github.com/djshellshoxxx/GhostPay/pull/62) | closed | `e0a499bdd95da4d9dd24a19a73fe9609e302b104` | none | DEFER |
| [#61](https://github.com/djshellshoxxx/GhostPay/pull/61) | closed | `f5d219851a4715cb947eb224976f97a7bec49380` | none | DEFER |
| [#60](https://github.com/djshellshoxxx/GhostPay/pull/60) | closed | `78be1730ad2a7963d66ba8c69e5b6480fa46bf2f` | none | DEFER |
| [#59](https://github.com/djshellshoxxx/GhostPay/pull/59) | closed | `4a38efdfa999f84685e5004b4c17a2a8e493f704` | none | DEFER |
| [#58](https://github.com/djshellshoxxx/GhostPay/pull/58) | merged | `1db8e967af91bc1d3132e99fa5f4d94696e22997` | 435bcf14757bd0a4becf733c0e4d78a56c91cf65 | SUPERSEDED |
| [#57](https://github.com/djshellshoxxx/GhostPay/pull/57) | merged | `6bd5b15ce4b883b1070ccc1deef6086fd9df3aa4` | deb624308ab60ea5972b6e450d21a3d08f0d039c | SUPERSEDED |
| [#56](https://github.com/djshellshoxxx/GhostPay/pull/56) | merged | `96fc22c42a704d1c590d56d624fff15a945c8231` | 18e721bc1ea26f4a236595c1e8a342f9b18ad12d | SUPERSEDED |
| [#55](https://github.com/djshellshoxxx/GhostPay/pull/55) | merged | `2d9c30e12c41cfb0212b0cfc366c83a1e5e45b21` | e5af614399d80630f5843c0f2d6472d98fc9a7b6 | SUPERSEDED |
| [#54](https://github.com/djshellshoxxx/GhostPay/pull/54) | merged | `57b414bfbc1fa9de9ef68675b9181b4c148f18e4` | 29e793684b55c43aeab70f2759710425399281f7 | SUPERSEDED |
| [#53](https://github.com/djshellshoxxx/GhostPay/pull/53) | merged | `03a3f5701c89e19667f309bb5f01bd36793a5474` | 0014bc5b26c7487ea1f9fb230194c36673193236 | SUPERSEDED |
| [#52](https://github.com/djshellshoxxx/GhostPay/pull/52) | open | `68dc5b502f25ed192f3ca82ee4fece8ee91d3bce` | none | DEFER |
| [#51](https://github.com/djshellshoxxx/GhostPay/pull/51) | open | `5835736c12968231ac7b3152e394077bee453622` | none | DEFER |
| [#50](https://github.com/djshellshoxxx/GhostPay/pull/50) | merged | `cdbb7ec775a37f985f6c66afddbcbba6e043f467` | ecbd085cff78d492a3ffff95c465d61b70ec84bf | SUPERSEDED |
| [#49](https://github.com/djshellshoxxx/GhostPay/pull/49) | closed | `6bffb63d1638253e677511672ffd32c24ac8f2f6` | none | DEFER |
| [#48](https://github.com/djshellshoxxx/GhostPay/pull/48) | merged | `29ce481d2d4a964f0acc42cc5233eb2d9c3e9482` | 6f36e7ca2d7b616f134d1bb7d4d585fb3d90ad48 | SUPERSEDED |
| [#47](https://github.com/djshellshoxxx/GhostPay/pull/47) | merged | `f8193502e602c99bb24ff956f142671750b744a0` | efcbd8a76c81d23db34a9fb70a5e7106df127e0f | SUPERSEDED |
| [#46](https://github.com/djshellshoxxx/GhostPay/pull/46) | merged | `1dffa5a366fc88a4428823634f43247913048915` | c148ee13ef8273660b9cf16477329e5fedede4b9 | SUPERSEDED |
| [#45](https://github.com/djshellshoxxx/GhostPay/pull/45) | closed | `277e490857a654f11e564ce8b208ee236ffbeb13` | none | DEFER |
| [#44](https://github.com/djshellshoxxx/GhostPay/pull/44) | closed | `fd710eb367eff8bbc250024f5a4317875930736b` | none | DEFER |
| [#43](https://github.com/djshellshoxxx/GhostPay/pull/43) | closed | `8d1bde36bb7d16374a2f9ad0ac2c39f46c086951` | none | DEFER |
| [#42](https://github.com/djshellshoxxx/GhostPay/pull/42) | closed | `c9a8c3d3cf549799a9fc93a7053f2d9ccb5d0483` | none | DEFER |
| [#41](https://github.com/djshellshoxxx/GhostPay/pull/41) | closed | `70d8bf6ec37a5ea61868b9de2a3cea60e22ca6d2` | none | DEFER |
| [#40](https://github.com/djshellshoxxx/GhostPay/pull/40) | closed | `63994db6cff8b3b3ca698427eee9e95904230546` | none | DEFER |
| [#39](https://github.com/djshellshoxxx/GhostPay/pull/39) | closed | `1d28f24d86f40c7af5d4187f5d0b3b0d0bf79c78` | none | DEFER |
| [#37](https://github.com/djshellshoxxx/GhostPay/pull/37) | closed | `b6a0871d0618c5ee804947af22d21b794948fa3d` | none | DEFER |
| [#36](https://github.com/djshellshoxxx/GhostPay/pull/36) | merged | `cb917c67bf8a621c48ef02e7d70caf5eadb7b4e2` | f44adbb38b90e4a58060ae669dd49af73e8aa049 | SUPERSEDED |
| [#34](https://github.com/djshellshoxxx/GhostPay/pull/34) | closed | `212967febe05a8afc8e481e9c6b91d70558d5894` | none | DEFER |
| [#33](https://github.com/djshellshoxxx/GhostPay/pull/33) | closed | `cf17cd0df8884c417247dd9673730ab764e6edfc` | none | DEFER |
| [#32](https://github.com/djshellshoxxx/GhostPay/pull/32) | closed | `b34edd5a7fccbc3d904d004135d1352bf2838ca1` | none | DEFER |
| [#31](https://github.com/djshellshoxxx/GhostPay/pull/31) | merged | `a2217ea1ccdd29f4e67ebdde9e6606eaa0fde523` | c0b0ba66663cb60f710de32f85c2782bcde1bf5b | SUPERSEDED |
| [#30](https://github.com/djshellshoxxx/GhostPay/pull/30) | merged | `7373172db4cf40ce5622e5a92a55b2b086e5e7cb` | f44adbb38b90e4a58060ae669dd49af73e8aa049 | SUPERSEDED |
| [#29](https://github.com/djshellshoxxx/GhostPay/pull/29) | merged | `2b032d77fef95d5eaa446a72fda2eef46e83bbcd` | edb0051eb89bd135c73733d9db14569aa000662d | SUPERSEDED |
| [#28](https://github.com/djshellshoxxx/GhostPay/pull/28) | merged | `3831d029df26b38e574a9bd62370d517d8a7eff0` | a6a2a1c5cbccb7d97c36decba78a99fa83e8a6f8 | SUPERSEDED |
| [#27](https://github.com/djshellshoxxx/GhostPay/pull/27) | merged | `a4ab45fa17606de589916cbe460e5e1a100db6b5` | 7ea6c3c4d9f6889ae2198026be1b5e5b7a676a2e | SUPERSEDED |
| [#26](https://github.com/djshellshoxxx/GhostPay/pull/26) | merged | `06f1426dd29b9b154d9f725d48918dcf049876bf` | 06f1426dd29b9b154d9f725d48918dcf049876bf | SUPERSEDED |
| [#25](https://github.com/djshellshoxxx/GhostPay/pull/25) | closed | `990fedee6652f4313920875692dd8a86cd91c9e9` | none | DEFER |
| [#24](https://github.com/djshellshoxxx/GhostPay/pull/24) | merged | `bb011134c1bf9cd0e75090fec75d85235d637281` | ca30bf821f412f0af50b2725722b0e968e6fed12 | SUPERSEDED |
| [#23](https://github.com/djshellshoxxx/GhostPay/pull/23) | closed | `c382456cb1349ba107fb2f9ae41c97b61229cbaf` | none | DEFER |
| [#22](https://github.com/djshellshoxxx/GhostPay/pull/22) | merged | `00212154513a11d324de9599cfd7e1b4d08443d2` | c3e282b468cea55fff1a888b7702d5c93a9a9b0b | SUPERSEDED |
| [#21](https://github.com/djshellshoxxx/GhostPay/pull/21) | merged | `a8c62cb500e444f86951b11022de88c1f13a876e` | 02a424038ee0e55179763b1ade26ad7396f2c068 | SUPERSEDED |
| [#20](https://github.com/djshellshoxxx/GhostPay/pull/20) | merged | `c206655ebfa747b3dd56b1dc9f4e7f16e641a833` | 5795857d9e366cc9a4304c6afa9b03365e7c1844 | SUPERSEDED |
| [#19](https://github.com/djshellshoxxx/GhostPay/pull/19) | merged | `7f77a44483ad844fbf9021ffd6fa4dd95fc8226d` | 84c2c185528ea13580a415874d9f584a323e9cfb | SUPERSEDED |
| [#18](https://github.com/djshellshoxxx/GhostPay/pull/18) | merged | `ad76a87e1dd5bd21599fcaecec7508de1a241996` | 84c2c185528ea13580a415874d9f584a323e9cfb | SUPERSEDED |
| [#17](https://github.com/djshellshoxxx/GhostPay/pull/17) | merged | `e96cee1a4e12773a6f66781c5a6797cbf9ff4ec5` | e96cee1a4e12773a6f66781c5a6797cbf9ff4ec5 | SUPERSEDED |
| [#16](https://github.com/djshellshoxxx/GhostPay/pull/16) | closed | `698404ca488c87347858105bda66be21bf428303` | none | DEFER |
| [#15](https://github.com/djshellshoxxx/GhostPay/pull/15) | closed | `f09decc278c2052c90dfa209a7098888c8d9877a` | none | DEFER |
| [#14](https://github.com/djshellshoxxx/GhostPay/pull/14) | closed | `7fb7aca6d68b96b89d32959636827fcfb343968d` | none | DEFER |
| [#13](https://github.com/djshellshoxxx/GhostPay/pull/13) | closed | `7f77a44483ad844fbf9021ffd6fa4dd95fc8226d` | none | DEFER |
| [#12](https://github.com/djshellshoxxx/GhostPay/pull/12) | closed | `1337f6c121463aa70107bdd065ea88ed30ec3584` | none | DEFER |
| [#11](https://github.com/djshellshoxxx/GhostPay/pull/11) | closed | `ad76a87e1dd5bd21599fcaecec7508de1a241996` | none | DEFER |
| [#10](https://github.com/djshellshoxxx/GhostPay/pull/10) | merged | `e1a92c876c4443b5ad49318ede200119ceaf4e8d` | 61be363b47a859871cf909c4375a9329973fe83a | SUPERSEDED |
| [#9](https://github.com/djshellshoxxx/GhostPay/pull/9) | merged | `dc2340c998250039d906a7beb72a4bed7a2b56c5` | f46878c231e261eb7447ab01775d58593e68c5b0 | SUPERSEDED |
| [#8](https://github.com/djshellshoxxx/GhostPay/pull/8) | closed | `e2ac361b7f425ef3b3a7e98389ad3add3353086e` | none | DEFER |
| [#7](https://github.com/djshellshoxxx/GhostPay/pull/7) | closed | `cdfc2ba228d76dd7605921736ed33891d1b14b0b` | none | DEFER |
| [#6](https://github.com/djshellshoxxx/GhostPay/pull/6) | merged | `a107d2dc4878bfcab4e98d8285477ccdd7545e32` | 2fc09f70a865cfaf4688d1779c4c05dd8a19d496 | SUPERSEDED |
| [#5](https://github.com/djshellshoxxx/GhostPay/pull/5) | closed | `4ffb7a99b222f58fde51726e06df90a6e9863b6d` | none | DEFER |
| [#4](https://github.com/djshellshoxxx/GhostPay/pull/4) | closed | `39cce4663d98c7da06775441a301040af51907ed` | none | DEFER |
| [#3](https://github.com/djshellshoxxx/GhostPay/pull/3) | closed | `df150cbdb58203789f5afc3050e75d92c655fa49` | none | DEFER |
| [#2](https://github.com/djshellshoxxx/GhostPay/pull/2) | merged | `c1c4ac9b648174db33c87b59bc9c09267eca731c` | 84c2c185528ea13580a415874d9f584a323e9cfb | SUPERSEDED |
| [#1](https://github.com/djshellshoxxx/GhostPay/pull/1) | merged | `ab2b61687210f79fa5401c8a25fa9a96bcb1ca61` | 84c2c185528ea13580a415874d9f584a323e9cfb | SUPERSEDED |
