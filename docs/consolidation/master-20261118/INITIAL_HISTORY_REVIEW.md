# GhostPay branch history and recovery review

Pinned main `dfc75ef2087fa6463ae59e0818abec01796c578d`. Pinned candidate `198aa5baff22272453733a0f3dcfcac0e0994eec`. Full non-shallow clone. All reachability, stable patch IDs and exact tree/blob comparisons were computed from these sources.

**246 current branches; 239 historical PRs (44 open / 53 merged / 142 closed unmerged); 12 additional historical heads across 11 deleted branch names; 257 distinct current/historical names examined.**

Mechanical results: 164 main-ancestor heads, 13 patch-equivalent heads, 69 heads with unique patches/merges. All 81 non-ancestor shared-history branches match git cherry exactly. Semantic review moves one intentionally reverted equivalent patch to I. gh-pages has unrelated generated-output history.

## Classifications

| Class | Meaning | Current branch count |
|---|---|---:|
| A | Fully contained | 164 |
| B | Patch-equivalent | 12 |
| C | Superseded | 17 |
| D | Unique useful work | 2 |
| E | Active development | 25 |
| F | Conflicting implementation | 0 |
| G | Documentation/evidence | 18 |
| H | Owner decision | 7 |
| I | Obsolete/rejected | 1 |

## Priority findings

- **Lost recent historical work:** claude/lucid-meitner-apalzc advanced 19 commits after closed PR164. Missing calendar-date, non-finite-retry and TRON completeness safeguards at e2fef011 + b098b73a and c37604d1 should be selectively recovered with their regressions. The historical price-decimals runtime hunk is redundant with the existing stricter 0..30 guard; retain only the additional regression test. Pool zero-value and source-scanner/maxQueue changes need separate scope review.
- **Independent guard:** PR217 is absent and changes deployment script/preflight only, with tests; qualify independently.
- **Overlapping signer work:** The invoice-signer portion of PR218 runtime is semantically duplicated by PR234 already in candidate. Preserve its additional regressions while recovering independent CLI/relayer fixes.
- **Bitcoin query consent:** PR219 local spent tracking is useful; light mode forces visibly disclosed per-outpoint queries. Review against explicit authorization requirements rather than describing every mode as opt-in.
- **Recovery branches differ:** PR239 and PR240 change app lifecycle/export/recovery/locale paths differently and also differ in standalone recovery/specs. Neither can be presumed a duplicate.
- **Current candidate:** PR238 exactly contains heads #213/#229/#222/#228/#230/#231/#233/#227/#234/#235/#237, but their isolated checks do not qualify the combined source.
- **Deliberate revert:** 6b3e689c is equivalent to 0fe67bcd, explicitly reverted by 051c1c12. Preserve rejection, do not recover it.
- **Old recovery snapshots:** source paths and named post-checkpoint guards retained/evolved; obsolete vendor archive behavior is inapplicable. Preserve backups rather than replacing modern trees.

## Retirement proposal

No deletion or PR closure was performed. Main and gh-pages are excluded. A/B/C are proposal classes only; owner approval, current behavior preservation and provenance retention remain prerequisites. Synthetic recovery branches remain retained. G rows preserve evidence; H rows remain inactive or unresolved.

## Current branch ledger

| Branch | Head | Class | PR(s) | In candidate | Disposition |
|---|---|---|---|---|---|
| `ai/agent-harness-20261113` | `15dc9c192c60` | A | #152 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `automation/api-funded-ghostpay-cloud-20261103` | `29ce481d2d4a` | A | #48 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `automation/ghostpay-parallel-four-agents-20261103` | `68dc5b502f25` | H | #52 | no | preserve inactive source; separate owner authorization needed for future activation |
| `automation/ghostpay-parallel-review-wave-20261103` | `03a3f5701c89` | A | #53 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `automation/ghostpay-recurrent-backlog-20261103` | `5835736c1296` | H | #51 | no | preserve inactive source; separate owner authorization needed for future activation |
| `backup/codex-observed-pr37-915d710-20261028` | `915d71053e23` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `backup/pr30-before-consolidation-20261025` | `356fe5e44d42` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `backup/pr31-before-consolidation-20261025` | `a2217ea1ccdd` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/consolidation-reconciliation-20261113` | `3cf3437a8d9d` | A | #146 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/ghostpay-beta-consolidation-20261118` | `df5e4f6990bd` | G | #232 | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `chatgpt/ghostpay-beta-log-artifact-20261118` | `7109290b7e4f` | E | #237 | yes | source head already in PR238; preserve and qualify combined candidate before main promotion |
| `chatgpt/ghostpay-beta-qualification-20261112` | `c11f905b362a` | A | #136 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/ghostpay-billing-horizon-port-20261112` | `eb21d57c8ad1` | A | #130 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/ghostpay-cli-sentinel-port-20261112` | `3fd18ef4011b` | A | #129 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/ghostpay-historical-consolidation-20261115` | `7dc7eccc34af` | C | — | no | superseded by current source; retain provenance and do not duplicate or overwrite implementation |
| `chatgpt/ghostpay-integration-matrix-20261112` | `1a5e815d8446` | A | #128 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/ghostpay-invoice-validation-20261118` | `5e9e7be70399` | E | #234 | yes | source head already in PR238; preserve and qualify combined candidate before main promotion |
| `chatgpt/ghostpay-merchant-csv-port-20261112` | `bbc7dda4ce27` | A | #131 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/ghostpay-mythril-checker-failclosed-20261118` | `94ca7d5ba9dc` | H | #225 | no | preserve fail-closed fixes selectively; retain unresolved policy decisions and strict security gate |
| `chatgpt/ghostpay-onion-canonical-port-20261112` | `8277879eeaa0` | A | #134 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/ghostpay-own-node-guard-20261118` | `685fe1a39a3f` | E | #228 | yes | source head already in PR238; preserve and qualify combined candidate before main promotion |
| `chatgpt/ghostpay-pages-checkpoint-v4-20261118` | `a5076f4d4e8d` | E | #235 | yes | source head already in PR238; preserve and qualify combined candidate before main promotion |
| `chatgpt/ghostpay-pages-client-hardening-20261115` | `f3872e90eb25` | A | #166 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/ghostpay-pages-gp02-gp04-review-20261115` | `9b3a3070499a` | A | #165 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/ghostpay-pages-idle-clock-20261118` | `613667be4eeb` | E | #227 | yes | source head already in PR238; preserve and qualify combined candidate before main promotion |
| `chatgpt/ghostpay-pages-second-pass-notes-20261115` | `cf6a8d69620a` | A | #167 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/ghostpay-privacy-browser-fixtures-20261118` | `67cf835d0bf5` | E | #233 | yes | source head already in PR238; preserve and qualify combined candidate before main promotion |
| `chatgpt/ghostpay-recovery-review-20261118` | `18110015e99e` | E | #229 | yes | source head already in PR238; preserve and qualify combined candidate before main promotion |
| `chatgpt/ghostpay-rpc-filter-guard-20261114` | `dfed84c18b5f` | C | — | no | superseded by current source; retain provenance and do not duplicate or overwrite implementation |
| `chatgpt/ghostpay-rpc-filter-guard-beta-20261114` | `73923350fcda` | B | — | no | patch incorporated historically; current-source preservation and owner-approved retirement remain required |
| `chatgpt/ghostpay-sensitive-surface-audit-20261115` | `90a145740a16` | A | #168 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/ghostpay-sensitive-surface-fourth-pass-20261115` | `97a617b5b95f` | A | #169 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/ghostpay-six-fixes-combined-20261112` | `36dfa8d26d4e` | B | — | no | patch incorporated historically; current-source preservation and owner-approved retirement remain required |
| `chatgpt/ghostpay-sonar-review-20261118` | `3a3b136a326e` | E | #226 | no | retain source; inspect smallest useful port, active ownership, overlaps and tests before integration |
| `chatgpt/ghostpay-sweep-balance-consent-20261118` | `d9ff386807de` | E | #231 | yes | source head already in PR238; preserve and qualify combined candidate before main promotion |
| `chatgpt/ghostpay-sweep-ledger-memory-20261118` | `0b2609c2c831` | E | #230 | yes | source head already in PR238; preserve and qualify combined candidate before main promotion |
| `chatgpt/ghostpay-top-down-audit-20261115` | `775756931be4` | A | #170 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/ghostpay-ux-clock-port-20261112` | `c3173f849ad6` | A | #132 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/ghostpay-ux-guide-port-20261112` | `f3a9b2389f8b` | A | #133 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/ghostpay-viem-alignment-20261118` | `defdaa308a2d` | E | #236 | no | retain source; inspect smallest useful port, active ownership, overlaps and tests before integration |
| `chatgpt/pages-browser-fixes-combined-20261114` | `73923350fcda` | B | #161 | no | patch incorporated historically; current-source preservation and owner-approved retirement remain required |
| `chatgpt/pages-release-gate-audit-20261114` | `2221a6117cdc` | G | #160 | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `chatgpt/spec18-recovery-completion-20261118` | `38d69832ddc5` | E | #240 | no | retain source; inspect smallest useful port, active ownership, overlaps and tests before integration |
| `chatgpt/spec18-recovery-reviewed-20261118-a264` | `4a1b181c89e0` | E | #239 | no | retain source; inspect smallest useful port, active ownership, overlaps and tests before integration |
| `chatgpt/zero-codex/audit-main-20261118-r185` | `a238c22dbc8a` | G | #214 | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `chatgpt/zero-codex/audit-pages-release-20261112` | `364b01f84739` | G | #139 | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `chatgpt/zero-codex/audit-secret-box-20261110` | `621ee0af3f47` | A | #103 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/b0-receipt-recovery-20261110` | `0a61e2c7fc54` | A | #108 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/cli-sentinel-value-20261111` | `a6e74591e134` | B | #125 | no | patch incorporated historically; current-source preservation and owner-approved retirement remain required |
| `chatgpt/zero-codex/docs-pages-scope-20261112` | `c5efadab9d9a` | G | #140 | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `chatgpt/zero-codex/docs-postmerge-wiki-20261118` | `362dfa999a96` | G | #215 | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `chatgpt/zero-codex/docs-wiki-20261110` | `fa375dbc1f24` | A | #104 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/handoff-postmerge-20261118` | `bb193849a568` | G | #216 | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `chatgpt/zero-codex/merchant-csv-safety-20261111` | `afaf7ce62d2b` | A | #124 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/merchant-schedule-horizon-20261111` | `7cdc6b32ecaf` | B | #123 | no | patch incorporated historically; current-source preservation and owner-approved retirement remain required |
| `chatgpt/zero-codex/onion-canonical-host-20261111` | `72dde82d9d89` | B | #122 | no | patch incorporated historically; current-source preservation and owner-approved retirement remain required |
| `chatgpt/zero-codex/ops-monitor-bounded-fetch-20261110` | `5280569b7eaa` | A | #106 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-autoclear-enable-retained-hash-20261117` | `9732adb949cc` | A | #198 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-backup-gate-verified-only-20261115` | `433307b869ac` | A | #171 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-bearer-qr-warning-20261114` | `81fd4c032e29` | A | #156 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-combined-qualification-20261113` | `ab427ab81c7b` | A | #143 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-download-cleanup-20261116` | `cf5ad81cab48` | A | #178 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-fragment-history-state-20261117` | `68993c668aa7` | A | #197 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-fragment-shell-gates-20261117` | `120dcd7fc15b` | A | #196 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-hash-navigation-exceptions-20261117` | `b570d4bb748d` | A | #199 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-invoice-stale-submit-20261115` | `dffe072511c3` | A | #174, #172 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-keystore-reimport-control-20261118` | `30cc4560c6a7` | A | #202 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-late-invoice-focus-20261117` | `23cc6db4b924` | A | #200 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-manifest-disclosure-rejection-20261113` | `907e2919e930` | A | #144 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-manifest-gates-20261117` | `12e18931ae99` | A | #195 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-negative-fiat-regression-20261114` | `9bdc9cbade90` | C | #154 | no | superseded by current source; retain provenance and do not duplicate or overwrite implementation |
| `chatgpt/zero-codex/pages-owner-ci-handoff-20261114` | `83fe9b022d2b` | G | #153 | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `chatgpt/zero-codex/pages-owner-transfer-filter-20261115` | `cf5e876ce164` | G | #163 | no | archive ownership evidence; do not reinstate stale claim |
| `chatgpt/zero-codex/pages-pay-rich-tags-20261117` | `c15833bc2aa6` | A | #194 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-qr-combined-20261115` | `26f83ccdda98` | C | #162 | no | superseded by current source; retain provenance and do not duplicate or overwrite implementation |
| `chatgpt/zero-codex/pages-reconciliation-e2e-proof-20261116` | `57acf1b06b3b` | A | #175 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-reconciliation-idb-retry-20261113` | `c8d4c42bee72` | A | #145 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-reconciliation-imported-link-20261115` | `97cf5a0cda25` | A | #173 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-relayer-stream-limit-20261114` | `9a84764e7060` | A | #158 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-renderer-own-property-20261116` | `dd4a7eb4dd71` | A | #192 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-rpc-http-status-20261113` | `68aca93bc19e` | A | #141 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-same-view-invoice-focus-20261117` | `2fb89ff5f2dc` | A | #201 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-scan-transfer-filter-20261114` | `7b6c4983e5c0` | B | #159 | no | patch incorporated historically; current-source preservation and owner-approved retirement remain required |
| `chatgpt/zero-codex/pages-smoke-project-boundary-20261113` | `eece5aff5542` | A | #142 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-tag-store-closed-connection-20261116` | `17f681915f25` | A | #177 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/pages-tagarchive-blocked-click-20261117` | `8aed22ad44ee` | C | #193 | no | superseded by current source; retain provenance and do not duplicate or overwrite implementation |
| `chatgpt/zero-codex/pages-verifier-comment-attrs-20261112` | `6f59cc2cb7ad` | A | #138 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/qualify-98-20261110` | `a2f4205f900d` | A | #102 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/receipt-boundary-regressions-20261110` | `83d17adb4a07` | A | #105 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/recovery-auth-negative-20261110` | `969d1b270b24` | A | #109 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/rpc-concurrent-byte-budget-20261110` | `b12a20e1d6e2` | A | #111 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/rpc-response-correlation-20261110` | `bbe300b7fb21` | A | #110 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/signed-receipt-no-rpc-proof-20261110` | `0ab175e55248` | A | #107 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `chatgpt/zero-codex/ux-confirm-clock-boundary-20261111` | `d77956901d95` | B | #126 | no | patch incorporated historically; current-source preservation and owner-approved retirement remain required |
| `chatgpt/zero-codex/ux-guide-plain-object-20261111` | `cf3a8b23a199` | C | #127 | no | superseded by current source; retain provenance and do not duplicate or overwrite implementation |
| `chatgpt/zero-codex-continuation-spec-20261109` | `d15921981ecf` | A | #101 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `checkpoint/ghostpay-recovery-20261102` | `1dffa5a366fc` | A | #46 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `checkpoint/ghostpay-source-reconciliation-20261101` | `243d98d67c7c` | G | — | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `claude/admiring-albattani-6kydor` | `ef610872aa4e` | G | #208, #84 | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `claude/adoring-wozniak-850ue6` | `a2217ea1ccdd` | A | #31, #28, #27 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ar-a0-pr47-green` | `4a38efdfa999` | A | #59 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ar-a4-btc-headersync` | `27d1580c5c53` | A | #74 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ar-a5-announcer-budget` | `d9fe8b4e9c02` | A | #70 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ar-a6-combined-backup` | `f5d219851a47` | A | #61 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ar-a7-policy-send-guard` | `f7b8ee9db981` | A | #65 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ar-b1-core-journey` | `e0a499bdd95d` | A | #62 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ar-b2-lean-bound-receipts` | `2bcfd11f9dc5` | A | #64 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ar-b3-sweep-permit-states` | `9d100956f08d` | A | #69 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ar-b5-testnet-feeds` | `76199cdac3ee` | A | #72 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ar-c1-reconciliation-adr` | `1e87109119c1` | A | #71 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ar-c2-qr-pairing` | `78be1730ad2a` | A | #60 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ar-c4-i18n-create-b4-buffer-ui` | `4fe95fc0f6f5` | A | #68 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ar-c4-i18n-pay` | `e02d04c75406` | A | #66 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ar-c4-i18n-scan` | `7f4702fdd366` | A | #67 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ar-c5-device-matrix` | `92af349a2e87` | A | #73 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ar-c7-embed-iframe-e2e` | `2b9db8ab1998` | A | #63 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/consolidation-2026-11-04` | `a28ca06a83dc` | A | #78 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/cool-albattani-xopr89` | `7373172db4cf` | A | #30, #26 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/cw-c2` | `b9cba0978cad` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/cw-c4` | `511c23bd9255` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/cw-c5` | `99d80dcd0e18` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/cw-w1` | `704e268bfa7d` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/cw-w5` | `f030376a3314` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/cw-w6` | `16cddc219317` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/cw-w7` | `a4ee36ee4328` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/cw-w8` | `f162960457b4` | A | #79 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/cw-w9` | `8303c8c6a79c` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/cw-w10` | `391454b2609b` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/cw-w11` | `764020c208c1` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/docs-screenshots` | `0476cb117ff5` | A | #112 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/docs-snapshot-1` | `dc2340c99825` | A | #9 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/docs-snapshot-2` | `e1a92c876c44` | A | #10 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/exciting-brown-7v69cr` | `b1327d4d0e26` | E | #218, #119 | no | port independent CLI/relayer fixes; preserve PR234 runtime and unique signer regressions; qualify conflicts |
| `claude/friendly-turing-1ui0on` | `f4e79b078514` | G | — | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `claude/gallant-hamilton-4wzkyn` | `ca358acfa8f4` | A | #121 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ghostpay-autonomous-completion-y4sk2h` | `b6a0871d0618` | A | #37 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ghostpay-autonomous-prompt-scpgun` | `1db8e967af91` | A | #58 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ghostpay-completion-audit-ot5jjm` | `b5e2ea3e5030` | E | #209 | no | retain source; inspect smallest useful port, active ownership, overlaps and tests before integration |
| `claude/ghostpay-consolidation-9xhtxg` | `c487f0fe649e` | A | #206 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ghostpay-consolidation-9xhtxg-feeguard` | `9e5cc3789b7b` | D | #217 | no | qualify focused deployment/preflight guard and integrate independently if checks and review pass |
| `claude/ghostpay-consolidation-9xhtxg-security` | `4894d0d8d943` | H | #212 | no | preserve fail-closed fixes selectively; retain unresolved policy decisions and strict security gate |
| `claude/ghostpay-consolidation-9xhtxg-spec18` | `ebf7c92c3be1` | E | #213 | yes | source head already in PR238; preserve and qualify combined candidate before main promotion |
| `claude/ghostpay-github-pages-up6cj6` | `ac08062ec540` | A | #137 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/ghostpay-lean-core-milestone-t5lwox` | `2527d6b93678` | C | #151 | no | superseded by current source; retain provenance and do not duplicate or overwrite implementation |
| `claude/gifted-planck-115x2k` | `1d28f24d86f4` | C | #39 | no | superseded by current source; retain provenance and do not duplicate or overwrite implementation |
| `claude/gracious-heisenberg-97ji6q` | `c6ce2259e7f1` | A | #115 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/haiku-wave-2-handoff-qepfoe` | `8d1bde36bb7d` | B | #43 | no | patch incorporated historically; current-source preservation and owner-approved retirement remain required |
| `claude/happy-maxwell-onl4x5` | `fd710eb367ef` | C | #44 | no | superseded by current source; retain provenance and do not duplicate or overwrite implementation |
| `claude/hopeful-bardeen-8ch6l8` | `2a5b29de6a71` | A | #155 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/inspiring-fermat-vxv689` | `c1c4ac9b6481` | A | #2 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/kind-faraday-8qzf6e` | `1e4d19f1a533` | A | #117 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/laughing-bardeen-4t20ys` | `e96cee1a4e12` | A | #17 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/lucid-meitner-apalzc` | `d6f6617e595b` | D | #164 | no | selectively recover e2fef011+b098b73a and c37604d1, excluding redundant price-decimals runtime hunk; separately reconcile ea1f0b24/768b1f4c and 016fa252 with current modules |
| `claude/nice-ritchie-8vivls` | `1bf25be7c540` | A | #114 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/pages-site-1` | `7f77a44483ad` | A | #19, #13 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/portable-hosting-kit` | `cb917c67bf8a` | A | #36 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/remote-extensions-1` | `39cce4663d98` | A | #4 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/remote-extensions-2` | `df150cbdb582` | A | #3 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/remote-extensions-3` | `cdfc2ba228d7` | A | #7 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/remote-extensions-4` | `4ffb7a99b222` | A | #5 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/remote-extensions-5` | `1337f6c12146` | A | #12, #6 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/remote-extensions-6` | `7fb7aca6d68b` | A | #14 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/remote-extensions-7` | `e2ac361b7f42` | A | #8 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/remote-extensions-8` | `ad76a87e1dd5` | A | #18, #11 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/remote-extensions-9` | `f09decc278c2` | A | #15 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/remote-extensions-10` | `698404ca488c` | A | #16 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/sharp-bohr-uigfgh` | `c9a8c3d3cf54` | G | #42 | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `claude/vibrant-cori-scu18b` | `9617e8572f9b` | E | #219, #113 | no | review explicit light-mode query consent and source labels; qualify BTC scanner/state/worker/UI suites on combined source |
| `claude/vigilant-johnson-yjgq94` | `4403d3703cd1` | C | #150 | no | superseded by current source; retain provenance and do not duplicate or overwrite implementation |
| `claude/wizardly-babbage-mfsdrl` | `ade77362de33` | A | #76 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `claude/wonderful-thompson-ir89i9` | `97b919c9c19d` | A | #118 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-approval-gated-auto-integration-20261109` | `e36786bce4e7` | A | #100 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-browser-isolation-20261118` | `e8857bfa1ec9` | E | #241 | no | retain source; inspect smallest useful port, active ownership, overlaps and tests before integration |
| `codex/ghostpay-canonical-time-20261116` | `27852ba89896` | A | #186 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-caveman-completion-20261116` | `0c4c3c8d951a` | A | #182 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-caveman-followup-20261116` | `2de9b0c5764c` | A | #183 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-cloud-41868394956` | `f34a80f710d1` | B | #81 | no | patch incorporated historically; current-source preservation and owner-approved retirement remain required |
| `codex/ghostpay-companion-merchant-20261109` | `b748ecdce06d` | A | #91 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-completion-20261116` | `b4be8866f6ff` | A | #179 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-consolidation-20261030` | `70d8bf6ec37a` | A | #41 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-consolidation-audit-20261104` | `e2ac398c2c89` | A | #83 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-continuation-20261109` | `0a68a57b77a7` | A | #88 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-integrate-product-cli-20261109` | `3ec039c554f7` | A | #95 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-mythril-recovery-20261116` | `ffd957e28f98` | A | #180 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-observability-20261116` | `c738f96e2f1a` | A | #185 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-ops-response-cap-20261116` | `73371b57040c` | A | #184 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-policy-localization-20261109` | `5628bc00b05a` | A | #90 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-product-20261109` | `cfc7b0f3325a` | A | #89 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-recovered-lean-checkpoint-20261028` | `371d235c3e59` | C | — | no | retain recovery backup branch; port only a demonstrated remaining gap, never whole synthetic tree |
| `codex/ghostpay-registry-recovery-20261116` | `98f779538bb7` | A | #181 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-research-acceptance-tests-41750257638` | `57b414bfbc1f` | A | #54 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-research-documentation-ux-41750257638` | `96fc22c42a70` | A | #56 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-research-release-qualification-41750257638` | `6bd5b15ce4b8` | A | #57 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-research-security-review-41750257638` | `2d9c30e12c41` | A | #55 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-resume-20261028` | `75400888c96b` | G | — | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `codex/ghostpay-security-audit-20261030` | `63994db6cff8` | C | #40 | no | superseded by current source; retain provenance and do not duplicate or overwrite implementation |
| `codex/ghostpay-spec09-matrix-20261116` | `2de9b0c5764c` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/ghostpay-unified-completion` | `beb525dddcca` | A | #187 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/recovery-spec02-unqualified-20261116` | `8d6fd6df5eff` | G | — | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `codex/seller-ledger-receipt-qr` | `bb011134c1bf` | A | #24 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `codex/setup-autonomous-agent-20261104` | `122e51710eee` | H | #82 | no | preserve inactive source; separate owner authorization needed for future activation |
| `consolidation/ops-monitor-bounded-streams-20261116` | `d2e8689b0380` | A | #188 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `consolidation/six-verified-boundaries-20261116` | `c9787b223a24` | A | #189 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `dependabot/github_actions/actions-b9ade1236b` | `199ab7ef1e80` | E | #207 | no | retain source; inspect smallest useful port, active ownership, overlaps and tests before integration |
| `dependabot/npm_and_yarn/npm-major-1ddf9439d6` | `bbc8ff3ba6c8` | E | #87 | no | retain source; inspect smallest useful port, active ownership, overlaps and tests before integration |
| `dependabot/npm_and_yarn/npm-minor-patch-71cdd1547c` | `4d19655a2e5d` | E | #210 | no | retain source; inspect smallest useful port, active ownership, overlaps and tests before integration |
| `docs/future-privacy-feature-specs-20261109` | `896c671f19fd` | C | #99 | no | superseded by current source; retain provenance and do not duplicate or overwrite implementation |
| `docs/ghostpay-3q-stealth-keypair-export-20261116` | `16bc61fa1c19` | A | #190 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `docs/ghostpay-deep-research-20261103` | `894dc868dc5d` | A | #75 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `docs/ghostpay-privacy-architecture-5a-5l-20261116` | `e05044d4209d` | A | #191 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `docs/lean-release-handoff-2026-10-24` | `2b032d77fef9` | A | #29 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `docs/readme-and-wiki` | `ab2b61687210` | A | #1 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `fix/ghostpay-cloud-api-secret-aliases-20261103` | `cdbb7ec775a3` | B | #50 | no | patch incorporated historically; current-source preservation and owner-approved retirement remain required |
| `fix/ghostpay-reconciliation-saturated-state-20261109` | `a864949d9ee4` | A | #94 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `fix/remediation-b16c7936-5ce634` | `0b213bd9d434` | B | #77 | no | patch incorporated historically; current-source preservation and owner-approved retirement remain required |
| `fix/remediation-f95457fd-22ecf9` | `6b3e689c15ca` | I | #80 | no | retain rejection provenance; do not reapply reverted patch |
| `gh-pages` | `cc8d07943a11` | H | — | no | keep untouched; any future publication decision is outside this consolidation |
| `ghostpay-cloud-recovery-2026-10-26` | `2ec98b239428` | C | — | no | retain recovery backup branch; port only a demonstrated remaining gap, never whole synthetic tree |
| `ghostpay-local-lean-boundary-20261027` | `020ba327e1a2` | C | — | no | retain recovery backup branch; port only a demonstrated remaining gap, never whole synthetic tree |
| `ghostpay-offline-deps-2026-10-27` | `3697f539d3a8` | C | — | no | retain recovery backup branch; port only a demonstrated remaining gap, never whole synthetic tree |
| `ghostpay-sbom-repro-2026-10-27` | `b5b04b999e84` | C | — | no | retain recovery backup branch; port only a demonstrated remaining gap, never whole synthetic tree |
| `gpt/ghostpay-beta-spec-20261109` | `6697390ff482` | A | #97, #96 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `gpt/ghostpay-cli-completion-20261109` | `3a9ce554ff6a` | A | #92 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `gpt/ghostpay-product-completion-20261109` | `3cd1e5544391` | A | #93 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `haiku/ghostpay-h01-inventory-20261111` | `747239db1a9b` | A | #120 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `haiku/l1-i18n-20261114` | `c6a9033449cd` | A | #147 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `haiku/l2-pkg-20261114` | `0c8b111cbe89` | A | #148 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `haiku/l3-ledger-20261114` | `8c91051b4492` | A | #149 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `integration/consolidated-2026-10-21` | `c206655ebfa7` | A | #20 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `integration/consolidated-2026-11-14` | `a89a2e948321` | A | #157 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `integration/ghostpay-accepted-20261102` | `f8193502e602` | A | #47 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `integration/ghostpay-beta-consolidated-20261109` | `364b1f185fcc` | A | #98 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `integration/ghostpay-pages-completion-20261118` | `198aa5baff22` | E | #238 | yes | source head already in PR238; preserve and qualify combined candidate before main promotion |
| `main` | `dfc75ef2087f` | A | — | yes | keep canonical main |
| `nodata/doc-sweep-20261118` | `cce7a7f7e548` | G | #223 | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `nodata/eager-babbage-0w6sf6` | `2693b08ed4b1` | A | #204 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `nodata/jolly-rubin-u4zd45` | `1054daabc5ca` | E | #224, #135 | no | retain source; inspect smallest useful port, active ownership, overlaps and tests before integration |
| `nodata/wizardly-allen-qwol6u` | `1c9a3ce4a103` | G | #221, #203 | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `nodata/wonderful-darwin-kd1h22` | `a92658b1ef6b` | E | #211 | no | retain source; inspect smallest useful port, active ownership, overlaps and tests before integration |
| `nodata/zealous-hopper-lr0nxe` | `b2604949ae3c` | G | #205 | no | retain source-pinned historical evidence; reconcile current facts without reinstating old status/ownership claims |
| `privacy/hardening-recommendations` | `2bc2098298d9` | E | #222 | yes | source head already in PR238; preserve and qualify combined candidate before main promotion |
| `research/privacy-evidence-matrix-20261110` | `a0a2d1dfbbdb` | A | #116 | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `security/mythril-full-remediation-20261118` | `16c48521f999` | H | #220 | no | preserve fail-closed fixes selectively; retain unresolved policy decisions and strict security gate |
| `work/ghostpay-consolidation-review-20261025` | `a2217ea1ccdd` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `work/ghostpay-pr26-qa-2026-10-24` | `77e7d7b6dd21` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |
| `work/local-reconstruction-2026-10-24` | `bd320d530c72` | A | — | yes | ancestry contained; retirement proposal only after owner approval and provenance retention review |

## Deleted historical branch snapshots

| PR | Branch | SHA | Main contains head | Class |
|---|---|---|---|---|
| #176 | `dependabot/npm_and_yarn/npm-minor-patch-9f9e7f3407` | `7d1f0ae17e31` | False | C |
| #86 | `dependabot/npm_and_yarn/npm-minor-patch-f818bbfb6d` | `e09bbc1201b5` | False | C |
| #85 | `dependabot/github_actions/actions-1850456dc8` | `8f34d83c618b` | False | C |
| #49 | `dependabot/npm_and_yarn/follow-redirects-1.16.2` | `6bffb63d1638` | False | C |
| #45 | `dependabot/npm_and_yarn/npm-minor-patch-22cc71b711` | `277e490857a6` | False | C |
| #34 | `dependabot/npm_and_yarn/npm-major-92ee7eceef` | `212967febe05` | False | C |
| #33 | `dependabot/npm_and_yarn/npm-minor-patch-6e94eb9223` | `cf17cd0df888` | False | C |
| #32 | `dependabot/github_actions/actions-712ca5a515` | `b34edd5a7fcc` | False | C |
| #25 | `dependabot/npm_and_yarn/npm-major-86c5c8168c` | `990fedee6652` | False | C |
| #23 | `dependabot/npm_and_yarn/npm-major-86c5c8168c` | `c382456cb134` | False | C |
| #22 | `dependabot/npm_and_yarn/npm-minor-patch-cdbdfc697a` | `00212154513a` | True | A |
| #21 | `dependabot/github_actions/actions-d5b8684899` | `a8c62cb500e4` | True | A |

## Limits

- Snapshot pinned to dfc75ef2 main and 198aa5ba candidate; later main changes are coordinator evidence.
- Ancestry and patch IDs are provenance, not proof that every behavior survived later merges.
- No runtime tests executed by this census; candidate source must be independently qualified.
- Synthetic recovery snapshots were checked for current path retention and named post-checkpoint safeguards, not fully requalified as old whole trees.
- H includes proposals that require separate owner authorization only if activated; retaining them needs no user action.
