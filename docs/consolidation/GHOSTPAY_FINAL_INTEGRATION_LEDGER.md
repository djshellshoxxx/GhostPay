# GhostPay final integration ledger

Experimental, unaudited project. No contracts deployed, no mainnet, no real funds, no release published.
Machine-readable source: [`ghostpay-final-ledger.json`](ghostpay-final-ledger.json) (all 46 branches below) and
[`ledger-code-branches.json`](ledger-code-branches.json) (worker A's per-commit recovery detail).

- Baseline: `integration/consolidated-2026-11-14` @ `a89a2e94` (PR #157). `main` = `bd2652bf` is an ancestor of it.
- Integration branch: `claude/lucid-meitner-apalzc`, built on that baseline. Nothing merged to `main`.
- Branch universe: 176 remote branches. 130 are fully contained in the baseline. 46 have commits outside it (table below).
- Method: real ancestry (`git rev-list`, `git cherry`) and `git merge-tree --write-tree` against the baseline. Branch names, PR titles
  and descriptions were not treated as evidence. Limitation: the older 113-row PR ledger was revalidated at branch level, not row by row.

## Recovered, merged, rejected, deferred (46 branches)
| Branch | PR | Ahead | Patch-unique | Merge sim (files / conflict) | Class | Result |
|---|---|---|---|---|---|---|
| `chatgpt/zero-codex/pages-qr-combined-20261115` | #162 | 7 | 4 | 4 / yes | INTEGRATED | integrated |
| `claude/ghostpay-lean-core-milestone-t5lwox` | #151 | 8 | 4 | 9 / yes | INTEGRATE_AFTER_FIXES | partially_integrated |
| `automation/ghostpay-parallel-four-agents-20261103` | - | 6 | 6 | 3 / no | DEFERRED | deferred |
| `automation/ghostpay-recurrent-backlog-20261103` | - | 3 | 3 | 1 / yes | DEFERRED | deferred |
| `claude/happy-maxwell-onl4x5` | - | 1 | 1 | 1 / yes | DEFERRED | deferred |
| `claude/vigilant-johnson-yjgq94` | - | 1 | 1 | 1 / yes | DEFERRED | deferred |
| `codex/ghostpay-recovered-lean-checkpoint-20261028` | - | 19 | 19 | 140 / yes | DEFERRED | deferred |
| `codex/setup-autonomous-agent-20261104` | - | 2 | 2 | 2 / yes | DEFERRED | deferred |
| `dependabot/github_actions/actions-1850456dc8` | - | 1 | 1 | 2 / no | DEFERRED | deferred |
| `dependabot/npm_and_yarn/npm-major-1ddf9439d6` | - | 1 | 1 | 69 / yes | DEFERRED | deferred |
| `dependabot/npm_and_yarn/npm-minor-patch-f818bbfb6d` | - | 1 | 1 | 68 / yes | DEFERRED | deferred |
| `fix/remediation-f95457fd-22ecf9` | - | 1 | 0 | 2 / yes | DEFERRED | deferred |
| `gh-pages` | - | 3 | 3 | 0 / yes | DEFERRED | not_applicable |
| `ghostpay-local-lean-boundary-20261027` | - | 18 | 18 | 139 / yes | DEFERRED | deferred |
| `ghostpay-offline-deps-2026-10-27` | - | 13 | 13 | 130 / yes | DEFERRED | deferred |
| `ghostpay-sbom-repro-2026-10-27` | - | 14 | 14 | 132 / yes | DEFERRED | deferred |
| `chatgpt/pages-release-gate-audit-20261114` | #160 | 2 | 2 | 2 / no | DEFERRED_DOCS_ONLY | deferred |
| `chatgpt/zero-codex/audit-pages-release-20261112` | #139 | 26 | 26 | 1 / no | DEFERRED_DOCS_ONLY | deferred |
| `chatgpt/zero-codex/docs-pages-scope-20261112` | #140 | 76 | 76 | 6 / no | DEFERRED_DOCS_ONLY | deferred |
| `chatgpt/zero-codex/pages-owner-ci-handoff-20261114` | #153 | 27 | 27 | 1 / no | DEFERRED_DOCS_ONLY | deferred |
| `checkpoint/ghostpay-source-reconciliation-20261101` | - | 2 | 2 | 1 / no | DEFERRED_DOCS_ONLY | deferred |
| `claude/haiku-wave-2-handoff-qepfoe` | - | 3 | 0 | 1 / yes | DEFERRED_DOCS_ONLY | deferred |
| `codex/ghostpay-resume-20261028` | - | 1 | 1 | 1 / no | DEFERRED_DOCS_ONLY | deferred |
| `docs/future-privacy-feature-specs-20261109` | - | 2 | 2 | 1 / yes | DEFERRED_DOCS_ONLY | deferred |
| `chatgpt/ghostpay-rpc-filter-guard-20261114` | - | 2 | 2 | 2 / no | DUPLICATE_SUPERSEDED | superseded |
| `chatgpt/ghostpay-rpc-filter-guard-beta-20261114` | - | 5 | 3 | 3 / no | DUPLICATE_SUPERSEDED | superseded |
| `chatgpt/ghostpay-six-fixes-combined-20261112` | - | 6 | 0 | 0 / no | DUPLICATE_SUPERSEDED | superseded |
| `chatgpt/pages-browser-fixes-combined-20261114` | #161 | 5 | 3 | 3 / no | DUPLICATE_SUPERSEDED | superseded |
| `chatgpt/zero-codex/cli-sentinel-value-20261111` | #125 | 2 | 0 | 0 / no | DUPLICATE_SUPERSEDED | superseded |
| `chatgpt/zero-codex/merchant-schedule-horizon-20261111` | - | 1 | 0 | 0 / no | DUPLICATE_SUPERSEDED | superseded |
| `chatgpt/zero-codex/onion-canonical-host-20261111` | - | 2 | 0 | 0 / no | DUPLICATE_SUPERSEDED | superseded |
| `chatgpt/zero-codex/pages-negative-fiat-regression-20261114` | #154 | 1 | 1 | 0 / no | DUPLICATE_SUPERSEDED | superseded |
| `chatgpt/zero-codex/pages-owner-transfer-filter-20261115` | #163 | 3 | 3 | 3 / no | DUPLICATE_SUPERSEDED | superseded |
| `chatgpt/zero-codex/pages-scan-transfer-filter-20261114` | #159 | 2 | 2 | 2 / no | DUPLICATE_SUPERSEDED | superseded |
| `chatgpt/zero-codex/ux-confirm-clock-boundary-20261111` | #126 | 2 | 0 | 0 / no | DUPLICATE_SUPERSEDED | superseded |
| `chatgpt/zero-codex/ux-guide-plain-object-20261111` | #127 | 3 | 2 | 0 / no | DUPLICATE_SUPERSEDED | superseded |
| `claude/gifted-planck-115x2k` | - | 4 | 3 | 12 / yes | DUPLICATE_SUPERSEDED | superseded |
| `claude/laughing-bardeen-4t20ys` | - | 105 | 104 | 203 / yes | DUPLICATE_SUPERSEDED | superseded |
| `claude/remote-extensions-10` | - | 18 | 17 | 47 / yes | DUPLICATE_SUPERSEDED | superseded |
| `claude/sharp-bohr-uigfgh` | - | 2 | 2 | 0 / no | DUPLICATE_SUPERSEDED | superseded |
| `codex/ghostpay-cloud-41868394956` | - | 1 | 0 | 0 / no | DUPLICATE_SUPERSEDED | superseded |
| `codex/ghostpay-security-audit-20261030` | - | 5 | 3 | 14 / yes | DUPLICATE_SUPERSEDED | superseded |
| `dependabot/npm_and_yarn/follow-redirects-1.16.2` | - | 1 | 0 | 0 / no | DUPLICATE_SUPERSEDED | superseded |
| `fix/ghostpay-cloud-api-secret-aliases-20261103` | - | 1 | 0 | 0 / no | DUPLICATE_SUPERSEDED | superseded |
| `fix/remediation-b16c7936-5ce634` | - | 1 | 0 | 1 / yes | DUPLICATE_SUPERSEDED | superseded |
| `ghostpay-cloud-recovery-2026-10-26` | - | 12 | 12 | 124 / yes | DUPLICATE_SUPERSEDED | superseded |

## Reasons
- `chatgpt/zero-codex/pages-qr-combined-20261115` (`26f83ccdd`): Off-filter transfer fail-closed fix + regression test ported (scanSpam.ts, scanSpam.test.ts). qrKinds bearer fix already present.
- `claude/ghostpay-lean-core-milestone-t5lwox` (`2527d6b93`): Only A5-2 (invalid openai-agents.yml step fragment) was missing; A5-1 skipped (baseline gate stronger), A3-2 skipped (baseline has assertInvoiceStillPayable), rest patch-equivalent.
- `automation/ghostpay-parallel-four-agents-20261103` (`68dc5b502`): Agent/automation infrastructure (workflow + prompts). Brief requires independent review of agent infrastructure (#152) first; not done, nothing changed.
- `automation/ghostpay-recurrent-backlog-20261103` (`5835736c1`): Agent/automation infrastructure (workflow + prompts). Brief requires independent review of agent infrastructure (#152) first; not done, nothing changed.
- `claude/happy-maxwell-onl4x5` (`fd710eb36`): Single script tweak (gen-audit24-report.py file mode); conflicts; low value, not reviewed.
- `claude/vigilant-johnson-yjgq94` (`4403d3703`): Single web test (Settings.test.tsx idle-lock hint wording); conflicts; not reviewed for current wording.
- `codex/ghostpay-recovered-lean-checkpoint-20261028` (`371d235c3`): Adds vendor/viem-2.22.14-ghostpay-deps2.tgz (repacked dependency binary) plus a rewritten normalize-sbom.mjs; its test fails on baseline script (5 not ok). Dependency-integrity/provenance policy is an owner decision; do not import a binary tarball unreviewed.
- `codex/setup-autonomous-agent-20261104` (`122e51710`): Agent/automation infrastructure (workflow + prompts). Brief requires independent review of agent infrastructure (#152) first; not done, nothing changed.
- `dependabot/github_actions/actions-1850456dc8` (`d071b3939`): Bumps actions in agent workflows; repo requires SHA pins (check-actions-pinned); needs pinned SHAs and owner review.
- `dependabot/npm_and_yarn/npm-major-1ddf9439d6` (`5338a7e04`): Lockfile conflicts (68-69 files); needs regenerated lockfile and full CI; not verifiable offline here.
- `dependabot/npm_and_yarn/npm-minor-patch-f818bbfb6d` (`e09bbc120`): Lockfile conflicts (68-69 files); needs regenerated lockfile and full CI; not verifiable offline here.
- `fix/remediation-f95457fd-22ecf9` (`6b3e689c1`): Baseline contains Revert 051c1c12 of this exact fix, no reason recorded. Fix refuses a new payment if ANY other payment record exists for same payer+chain (a.key !== key), which looks over-broad for scoped keys (hypothesis, not reproduced). Owner decision / narrower design needed.
- `gh-pages` (`cc8d07943`): Deploy branch with unrelated history (merge-tree rc=128); never merge.
- `ghostpay-local-lean-boundary-20261027` (`020ba327e`): Adds vendor/viem-2.22.14-ghostpay-deps2.tgz (repacked dependency binary) plus a rewritten normalize-sbom.mjs; its test fails on baseline script (5 not ok). Dependency-integrity/provenance policy is an owner decision; do not import a binary tarball unreviewed.
- `ghostpay-offline-deps-2026-10-27` (`3697f539d`): Adds vendor/viem-2.22.14-ghostpay-deps2.tgz (repacked dependency binary) plus a rewritten normalize-sbom.mjs; its test fails on baseline script (5 not ok). Dependency-integrity/provenance policy is an owner decision; do not import a binary tarball unreviewed.
- `ghostpay-sbom-repro-2026-10-27` (`b5b04b999`): Adds vendor/viem-2.22.14-ghostpay-deps2.tgz (repacked dependency binary) plus a rewritten normalize-sbom.mjs; its test fails on baseline script (5 not ok). Dependency-integrity/provenance policy is an owner decision; do not import a binary tarball unreviewed.
- `chatgpt/pages-release-gate-audit-20261114` (`2221a6117`): Docs/handoff only by file list (1-6 files each); content not individually reviewed; not integrated to avoid stale or competing handoff documents.
- `chatgpt/zero-codex/audit-pages-release-20261112` (`61a7b4874`): Docs/handoff only by file list (1-6 files each); content not individually reviewed; not integrated to avoid stale or competing handoff documents.
- `chatgpt/zero-codex/docs-pages-scope-20261112` (`2377d4ae3`): Docs/handoff only by file list (1-6 files each); content not individually reviewed; not integrated to avoid stale or competing handoff documents.
- `chatgpt/zero-codex/pages-owner-ci-handoff-20261114` (`3270a29a5`): Docs/handoff only by file list (1-6 files each); content not individually reviewed; not integrated to avoid stale or competing handoff documents.
- `checkpoint/ghostpay-source-reconciliation-20261101` (`243d98d67`): Docs/handoff only by file list (1-6 files each); content not individually reviewed; not integrated to avoid stale or competing handoff documents.
- `claude/haiku-wave-2-handoff-qepfoe` (`8d1bde36b`): Docs/handoff only by file list (1-6 files each); content not individually reviewed; not integrated to avoid stale or competing handoff documents.
- `codex/ghostpay-resume-20261028` (`75400888c`): Docs/handoff only by file list (1-6 files each); content not individually reviewed; not integrated to avoid stale or competing handoff documents.
- `docs/future-privacy-feature-specs-20261109` (`896c671f1`): Docs/handoff only by file list (1-6 files each); content not individually reviewed; not integrated to avoid stale or competing handoff documents.
- `chatgpt/ghostpay-rpc-filter-guard-20261114` (`dfed84c18`): Same scanSpam off-filter change as the ported #162 content (worker A: identical tips/patches). Recovered once via #162 row.
- `chatgpt/ghostpay-rpc-filter-guard-beta-20261114` (`73923350f`): Same scanSpam off-filter change as the ported #162 content (worker A: identical tips/patches). Recovered once via #162 row.
- `chatgpt/ghostpay-six-fixes-combined-20261112` (`36dfa8d26`): merge-tree vs baseline changes 0 files: content already present (patch ids differ from re-picks).
- `chatgpt/pages-browser-fixes-combined-20261114` (`73923350f`): Same scanSpam off-filter change as the ported #162 content (worker A: identical tips/patches). Recovered once via #162 row.
- `chatgpt/zero-codex/cli-sentinel-value-20261111` (`a6e74591e`): merge-tree vs baseline changes 0 files: content already present (patch ids differ from re-picks).
- `chatgpt/zero-codex/merchant-schedule-horizon-20261111` (`7cdc6b32e`): merge-tree vs baseline changes 0 files: content already present (patch ids differ from re-picks).
- `chatgpt/zero-codex/onion-canonical-host-20261111` (`72dde82d9`): merge-tree vs baseline changes 0 files: content already present (patch ids differ from re-picks).
- `chatgpt/zero-codex/pages-negative-fiat-regression-20261114` (`9bdc9cbad`): merge-tree vs baseline changes 0 files: content already present (patch ids differ from re-picks).
- `chatgpt/zero-codex/pages-owner-transfer-filter-20261115` (`cf5e876ce`): Same scanSpam off-filter change as the ported #162 content (worker A: identical tips/patches). Recovered once via #162 row.
- `chatgpt/zero-codex/pages-scan-transfer-filter-20261114` (`7b6c4983e`): Same scanSpam off-filter change as the ported #162 content (worker A: identical tips/patches). Recovered once via #162 row.
- `chatgpt/zero-codex/ux-confirm-clock-boundary-20261111` (`d77956901`): merge-tree vs baseline changes 0 files: content already present (patch ids differ from re-picks).
- `chatgpt/zero-codex/ux-guide-plain-object-20261111` (`cf3a8b23a`): merge-tree vs baseline changes 0 files: content already present (patch ids differ from re-picks).
- `claude/gifted-planck-115x2k` (`1d28f24d8`): Worker A: D3 relayer deadline present with broader test; B2R sweep fee covered by stricter executionReverted; AR2 patch-equivalent; 1d28f24 stale doc edit rejected.
- `claude/laughing-bardeen-4t20ys` (`e96cee1a4`): Older lineage (merge-base 2026-10-21); 0 files absent from baseline; 203 files differ because baseline evolved.
- `claude/remote-extensions-10` (`698404ca4`): Only file absent from baseline is apps/relayer/src/breaker.ts, an older copy; baseline has packages/relayer-guard/src/breaker.ts + tests; nothing imports the branch copy except tests.
- `claude/sharp-bohr-uigfgh` (`c9a8c3d3c`): merge changes 0 files; docs handoff already present.
- `codex/ghostpay-cloud-41868394956` (`f34a80f71`): merge-tree vs baseline changes 0 files: content already present (patch ids differ from re-picks).
- `codex/ghostpay-security-audit-20261030` (`63994db6c`): Worker A: D3 relayer deadline present with broader test; B2R sweep fee covered by stricter executionReverted; AR2 patch-equivalent; 1d28f24 stale doc edit rejected.
- `dependabot/npm_and_yarn/follow-redirects-1.16.2` (`6bffb63d1`): merge-tree vs baseline changes 0 files: content already present (patch ids differ from re-picks).
- `fix/ghostpay-cloud-api-secret-aliases-20261103` (`cdbb7ec77`): merge-tree vs baseline changes 0 files: content already present (patch ids differ from re-picks).
- `fix/remediation-b16c7936-5ce634` (`0b213bd9d`): Baseline copy (29a58109) is stricter: also requires blockNumber > floor. Branch version would weaken it.
- `ghostpay-cloud-recovery-2026-10-26` (`2ec98b239`): 0 non-doc files absent from baseline; older recovery lineage.

## Changes made on top of the baseline (non-merge commits)
| Commit | Kind | What |
|---|---|---|
| `4b107609` | recovered (#151 A5-2) | removed invalid `.github/workflows/openai-agents.yml` fragment (disabled copy already present) |
| `aa827a43`, `6e986e85`, `f471ab4e` | recovered (#162/#163/#161/#159) | off-filter transfer telemetry fails closed (`scanSpam.ts`) + regression test + docs pin |
| `e77172cf`, `c0885a7a`, `016fa252` | fix (Haiku R1 F1, R3 F1, Opus-1) | `scan-bundle` src sink scan: string-aware, then regex-aware stripper, finally **replaced by a TypeScript AST scan** after the Opus review showed the heuristic stripper was still bypassable |
| `00e93f7a` | fix (worker C) | "Show larger" QR dialog kept dropping bearer/secret/caution warning |
| `be7e9671`, `016fa252` | fix (Haiku R2 F1 / worker D, Opus-2) | `check-tx-origin.sh` split-line bypass, then comment/multi-line splits via an additive whole-file pass |
| `62ccb311`, `38cb0bfa` | fix | two polynomial-ReDoS regexes (CodeQL on #157) in `i18n` readability and `ops-monitor` fetcher; lint fix |
| `f37b06c1` | fix (worker B W1/W2) | payer-sponsor: per-chain send lane; receipt failure after broadcast = `OUTCOME_UNKNOWN` with hash, loss charged |
| `5da91c2d` | fix (worker B W3) | pool-relayer bounded admission (503 `queue_full`) |
| `ea1f0b24`, `768b1f4c` | fix (Haiku R2 F3) | pool-circuits refuses zero values for withdraw/ragequit |
| `e2fef011` | fix (CHAIN-ADAPTERS-10) | real-calendar manifest date, NaN retries, bounded price decimals |
| `c37604d1` | fix (SOLANA-TRON-08) | tron-adapter `getBlockRange` fails closed on missing/gapped blocks (one old test that expected `[]` was changed on purpose) |
| `016fa252` | fix (Opus-5) | pool-relayer `maxQueue` NaN/0/negative/fractional rejected at construction |
| `b098b73a` | test | chain-adapters NaN-retries test fails cleanly (was a hang) when its fix is reverted |
| docs commits | docs | audit reports for rounds 1-3 and workers B, C, D, E; task ledger |

Every code fix above has a regression test that was run RED before the fix and GREEN after (per the worker reports and my own re-runs of F1 and the ReDoS pair).
