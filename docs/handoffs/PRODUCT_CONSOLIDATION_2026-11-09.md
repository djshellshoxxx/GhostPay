# Product continuation: consolidation evidence — 2026-11-09

Read alongside the [2026-11-07 handoff](AUTONOMOUS_RUN_2026-11-07.md) and [2026-11-04 ledger](consolidation-2026-11-04/LEDGER.md). This is a source and review inventory, not release acceptance. No source branch or PR was deleted, closed or merged by this audit.

## Pinned comparison

| Ref | Exact head | Role |
|---|---|---|
| `main` | `14f9b2673ac25c7ec60a0a3a78eb17e2c7acf44d` | Current published default branch |
| #84 `claude/admiring-albattani-6kydor` | `48b6bc20108079bb7fbf89997249734bf9f41646` | Draft application consolidation, based on main |
| #88 `codex/ghostpay-continuation-20261109` | `0a68a57b77a70d3bcf4635ccbc5190d735e71f40` | Draft notice-i18n child of #84; comparison target below |

The initial local clone was shallow at `a28ca06`; it falsely reported some already-integrated branches as divergent. `git fetch --unshallow origin` completed and `git rev-parse --is-shallow-repository` returned `false` before this ledger's ancestry results were taken. Never use the earlier shallow negative results as missing-work evidence.

`git merge-base --is-ancestor <source> 0a68a57` and `git rev-list --count 0a68a57..<source>` establish containment below. The unique count is commits absent from the target, not a product-completion percentage. Listed source tips were fetched from GitHub on November 9.

## Product and documentation source dispositions

| PR / source ref | Source head | Unique commits | Evidence and disposition | Existing landing |
|---|---|---:|---|---|
| #60 `claude/ar-c2-qr-pairing` | `78be1730ad2a7963d66ba8c69e5b6480fa46bf2f` | 0 | Ancestor. Public seller pairing, strict parsing and stale file-read fixes already present. Do not reimport. | `7fafdfd`, inherited by #84/#88 |
| #61 `claude/ar-a6-combined-backup` | `f5d219851a4715cb947eb224976f97a7bec49380` | 0 | Ancestor. Combined backup and later tag-backup fixes already present. | `17b02f3`, later `a45e3f2`, #84/#88 |
| #64 `claude/ar-b2-lean-bound-receipts` | `2bcfd11f9dc56138612079a713ecf1b2bcdb0cd0` | 0 | Ancestor. Lean invoice-bound receipt policy and profile tests retained. | `8aba343`, #84/#88 |
| #65 `claude/ar-a7-policy-send-guard` | `f7b8ee9db98162a97a962ff40d77460cb6eb8417` | 0 | Ancestor. Guarded sends and refusal before approval retained. Deliberate repeats still require explicit journal clearing, per resolved review. | `4f289c0`, later `8291041`, #84/#88 |
| #66 `claude/ar-c4-i18n-pay` | `e02d04c7540607624e4bf4627566a5e605242fe1` | 0 | Ancestor. Pay catalog conversion already present. | stacked through #67/#68/#69, `641fd49`, #84/#88 |
| #67 `claude/ar-c4-i18n-scan` | `7f4702fdd36671fa8c114d08a8e0e4ae13939ddd` | 0 | Ancestor. Scan catalog conversion already present. | stacked through #68/#69, `641fd49`, #84/#88 |
| #68 `claude/ar-c4-i18n-create-b4-buffer-ui` | `4fe95fc0f6f59cc4ddacfc011f8001e5a83ffefd` | 0 | Ancestor. Create localization and full-profile buffer policy already present. | through #69, `641fd49`, #84/#88 |
| #69 `claude/ar-b3-sweep-permit-states` | `9d100956f08ddab66c6aeff1647ca51f3d5ef9cc` | 0 | Ancestor. Later copy distinguishes permit versus transfer simulation failures. | `641fd49`, later `5499a49`, #84/#88 |
| #70 `claude/ar-a5-announcer-budget` | `d9fe8b4e9c020f8cef0073b9a990903fad38f1a8` | 0 | Ancestor. Spam budgets and page-end corroboration present; two review findings are tracked below. | `56789ae`, #84/#88 |
| #71 `claude/ar-c1-reconciliation-adr` | `1e87109119c1945ea81bfa7e29bc9d1663984bf7` | 0 | Ancestor. ADR-0026 is present; its implementation claims must be checked against code. | `cb035c3`, #84/#88 |
| #72 `claude/ar-b5-testnet-feeds` | `76199cdac3ee336e2751995d511111467141d943` | 0 | Ancestor. Historical failed-source-fetch note retained. Later `cw-w6` feed work supersedes its blocked state, per existing ledger. | `c2c5da8`, #84/#88 |
| #73 `claude/ar-c5-device-matrix` | `92af349a2e877d6cf94e7ed95a6466163a205089` | 0 | Ancestor. Device tests and route-specific heading checks retained. | `dab4777`, later `e599727`, #84/#88 |
| #74 `claude/ar-a4-btc-headersync` | `27d1580c5c535cef5ea44491716d0d86712df841` | 0 | Ancestor. Header-sync and later sweep/forget guards present. | `4dda075`, later `abfd2ed`, #84/#88 |
| #75 `docs/ghostpay-deep-research-20261103` | `894dc868dc5d07102ecb7f6a1e251381d8127f61` | 1 | Not ancestor, but all 16 added handoff/research/evidence files have identical blob IDs in #88. Its INDEX addition is retained in the expanded index. No unique content to import. | content port `511c23b`, merged `8c00992`, #84/#88 |
| #83 `codex/ghostpay-consolidation-audit-20261104` | `e2ac398c2c8943a244239b9d6ffa2181e13e7782` | 1 | Docs-only main-relative planning audit. Keep separate; this target-relative ledger supersedes its comparison step, without altering the source. | no new landing |

No source merge was required for those feature tips. The existing conflicts were already resolved before this run: #78 joined locale/security-key additions; #84 joined #61's locale additions and `TagArchive` changes. This audit does not replay those conflicts or certify every historical behavioral claim. New feature work must be tested on its own integration head.

## Automation stays separate

| PR / source ref | Source head | Unique commits | Reviewed delta / disposition |
|---|---|---:|---|
| #79 `claude/cw-w8` | `f162960457b40eb28eaed25a532a56b0a7bc7785` | 1 | Agent merge/path/cache hardening in three workflow/action files plus its regression test. Owner-only; no application code to import. |
| #82 `codex/setup-autonomous-agent-20261104` | `122e51710eeee51a5ffc3f9dc76ee0b8ec291d43` | 2 | Repository agent scope and complete manual API-funded workflow. Owner-only; keep separate. |
| #51 `automation/ghostpay-recurrent-backlog-20261103` | `5835736c12968231ac7b3152e394077bee453622` | 3 | Schedule/prompt changes plus weaker merge gates and author/head hardening. Unresolved review warns that individual checks replace aggregate gates. Do not import into product work. |
| #52 `automation/ghostpay-parallel-four-agents-20261103` | `68dc5b502f25ed192f3ca82ee4fece8ee91d3bce` | 6 | API-funded parallel workflow, tests and operating notes. Spending/integration decisions stay with owner. |

None of these workflows was enabled, dispatched or changed. The malformed `openai-agents.yml` fragment already on main is separately documented by #84; fixing or replacing it is outside this product branch.

## Open review findings

GitHub review-thread API was read for #51, #52, #60, #61, #64–75, #79, #82, #83, #84 and #88 on November 9. All returned threads were resolved except:

- **#70 `PRRT_kwDOVR5mTM6zfD5V`: transient router verification loses its replay opportunity.** The target already includes `29a5810` and the bounded-replay follow-up `80fd9a8`: a claimed router match later than the run floor holds the checkpoint once; a permanent claim at the run floor cannot pin every subsequent resume. The old source PR thread remains open; it was not changed by this audit.
- **#70 `PRRT_kwDOVR5mTM6zfD5Z`: falling provider head leaves privacy statistics anchored too high.** Still present at the pinned #88 source: `scanClient.ts:268` stores the maximum `reachableHead`, and line 497 takes the maximum with `scanHead`. A lower later page head can therefore leave windows measured against the obsolete higher head. Reported to the coordinator for a focused regression/fix; no runtime edit in this audit.
- **#51 `PRRT_kwDOVR5mTM6zY-sZ`: generated changes can merge with failing sibling checks.** Owner-only automation branch; keep excluded.

#84's CodeQL fixture-server path review is resolved. Commit `1c84a33` uses path-relative containment; the exact-head CodeQL check reports no new alerts. That does not resolve the separate Sonar gate.

## Exact-head hosted check snapshot

Public GitHub REST `/commits/<sha>/check-runs?per_page=100` returned all checks (counts below match `total_count`) at 2026-11-09 08:29 UTC:

| Head | Check-run snapshot | Meaning |
|---|---|---|
| #84 `48b6bc20108079bb7fbf89997249734bf9f41646` | 33 total: 31 success, 1 failure (SonarCloud), 1 skipped (CodeRabbit draft review) | CI aggregate gates, browser profiles, contracts, CodeQL, Integration and Hosting kit passed. Sonar blocks a claim that all checks pass. |
| #88 `0a68a57b77a70d3bcf4635ccbc5190d735e71f40` | 26 total: 26 success | Narrow child check runs pass; no Sonar check was returned for this head. This does not clear #84's broader gate. |

[Sonar annotation triage](../audits/SONAR_TRIAGE_2026-11-09.md) records the 12 actual annotations recovered through GitHub, source-level assessment and the remaining blocker. No issue was suppressed or marked resolved, and no quality gate was changed.

## Review order and validation boundary

Review #84 against main, #88 against #84, then the product continuation against #88. Keep source PRs open until the owner decides consolidation and merge order. This audit contributes only these records, no product merge or release.

Commands performed: full-history fetch; ancestry/count comparisons for every row; exact blob comparison of #75's 16 added files; review-thread reads; exact-head check-run and annotation reads. Audit-tool tests on `0a68a57`: `node --test scripts/tests/audit-report-paths.test.mjs` 4/4, `python3 scripts/tests/audit-cli.test.py` 13/13, `python3 scripts/tests/audit-permissions.test.py` 16/16, all exit 0. The last Python suite includes the 13 base cases, so these are command counts, not 33 distinct tests. Full application checks belong to the final integration head.
