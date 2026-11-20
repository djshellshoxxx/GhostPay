# Generation 5 continuation: bounded remainder checkpoint

This continues the existing worker after initial matrix `b4d4c1bb25a4ce0a2f99d5262a302244590b8f88`; it is not a new independent generation. The coordinator requested a useful bounded checkpoint while combined qualification proceeds. Comparison remains frozen at `3dc86fbc49e919e664230b63dae372ff79430fc5`, the same tree as published #278 head `d74af79ebabdc8cead843361c3497b46d8c421f9`. Later candidate changes need their own final check.

## Result and limits

All **59 remaining original census heads** were refreshed read-only and matched their recorded identities. Every best merge base against candidate and main, every path in their changed-path unions, and both final Git entries are preserved in [continuation-final-blobs.json.gz](continuation-final-blobs.json.gz). [The raw live-ref sample](continuation-live-refs.txt) and [the matrix](CONTINUATION_MATRIX.json) retain exact full heads. No third product defect or required fix was demonstrated in this continuation.

The safe action labels are **24 FUTURE — PRESERVE, 14 SUPERSEDED — ARCHIVE, 8 EQUIVALENT — SKIP and 13 UNKNOWN — INSPECT**. These labels have explicit review levels: 15 bounded source comparisons, two parsed dependency equivalence checks, six exact touched-source comparisons, 23 path-category screens and 13 unresolved source scopes. A path-category preservation decision does not certify the underlying semantics. Documentation may include executable evidence scripts or unconfirmed source snapshots; these are preserved artifacts, not claimed production work or current qualification.

The large historical recovery/consolidation snapshots remain UNKNOWN. The first eleven branches were not repeated. Neither the original census nor its dated dispositions were overwritten. No historical complete suite, browser session, hosted analyzer, updater or migration was executed for this continuation. No source, workflow, dependency, schedule or remote mutation occurred.

## Material findings

**Viem and the minor-update graph are already represented.** For `chatgpt/ghostpay-viem-alignment-20261118` (`defdaa308a2d`) and `dependabot/npm_and_yarn/npm-minor-patch-71cdd1547c` (`3c95b2a00bdc`), all **752 `node_modules/` lock records (684 external package records and 68 workspace links)** match the candidate as parsed mappings, including their metadata. This is stronger evidence than equal package version strings. Both already declare Viem `2.57.19` in web and relayer. Residual manifest differences are current beta version, CSP/deployment scripts, and hygiene/metadata workspace dependencies; restoring the older files would remove those additions. [Verification metadata](continuation-verification.json) includes the canonical lock-record hashes for each comparison. No new install or whole-graph qualification is inferred.

**Private scan source is retained with later safeguards.** Directly reviewed `18b367457103` against current `scanClient.ts`, `defaultServices.ts`, `services.ts`, `keyVault.ts` and relevant Scan changes. Replay/checkpoint behavior remains; current source adds bulk evidence, abort normalization, action-specific network authority, credential/suspension guards and selected-scope checks after asynchronous work. Browser, locale and historical receipt differences remain preserved without claiming every old test equivalent or rerun.

**Small earlier fixes are represented or superseded.** Current `scanSpam.ts` retains token/block filter rejection and extends partial-count marking to the available 30-day span. Current `qrKinds.ts` additionally refuses unknown/inherited keys. Current relayer requests retain streamed limits through the shared bounded transport and add cancellation, padding and fixed public error classes. The CLI parser retains terminator/value handling with later position-aware global switches. Current TagArchive tests strengthen blocked-click cleanup with explicit failure/backup status. Current invoice schema adds representable time limits and explicit v2 policy validation. Current checkpoint persistence retains the page-level claimed-payment replay while also refusing to pin the resumed floor indefinitely. These are bounded current-source comparisons, not freshly executed suites.

**One apparent missing policy guard is intentionally rejected.** `fix/remediation-f95457fd-22ecf9` (`6b3e689c15ca`) treats any different payment key for the payer as a legacy payment. Current `apps/web/src/features/policy/send.test.ts` explicitly records why that proposal was rejected: journal records have no key version, so it blocks a later, distinct scoped payment. Current assertions permit a different completed scope while still refusing the same scope. Recovering the old broad guard would reintroduce that regression. The earlier policy history remains preserved; no claim of a new exploit or complete policy qualification is made.

**The old lean-core expiry proposal is surpassed in the inspected payment functions.** Current `boundedDeadline` uses the invoice's last payable second; permit and router deadlines share the bound, and `sendPayment` checks fresh invoice/buffer expiry before signing/submitting. The broader `claude/ghostpay-lean-core-milestone-t5lwox` branch stays UNKNOWN because its workflow, manifest and reachability-test differences were not fully reviewed.

**Distinct maintenance/future work remains.** The Actions updater branch proposes `setup-python` 6.3.0 → 7.1.0 in three workflows and `create-pull-request` 7 → 8.1.3 in two. Those pins are distinct, but no missing beta behavior or migration readiness was demonstrated. The npm major branch remains an unqualified dependency migration. Optional agent scheduling and BTC spentness/worker/verification work remain preserved without activation or complete semantic review.

**Branch names do not establish scope.** `integration/ghostpay-docs-recovery-20261119` has an all-base union of 72 paths, including 32 non-documentation paths and 14 differing source-category entries. Its inherited AppShell/scan/invoice/CI/TRON differences prevent treating it as a docs-only merge. Its documentation recovery remains available for selective preservation. The broad `chatgpt/ghostpay-remaining-work-20261119` union contains 1,220 paths; this checkpoint does not invent a semantic conclusion for them.

## Per-branch checkpoint

The table is an action/scope index. Full source identities, every merge base, exact counts and branch-specific limitations are in `CONTINUATION_MATRIX.json` and the compressed entry comparisons. `paths/exact` counts all paths, including documentation. **Category** means path scope only; **unknown** means source semantics remain unresolved; **source** is bounded inspection; **exact** is touched-file equality; **lock** is the parsed lock-record comparison.

| Branch / head | Paths/exact | Action | Review |
| --- | --- | --- | --- |
| `automation/ghostpay-parallel-four-agents-20261103` / `68dc5b50` | 3/0 | FUTURE — PRESERVE | category |
| `automation/ghostpay-recurrent-backlog-20261103` / `5835736c` | 1/0 | FUTURE — PRESERVE | category |
| `chatgpt/btc-spent-private-scan-20261118` / `981cc2f4` | 93/30 | FUTURE — PRESERVE | category |
| `chatgpt/btc-spent-qualification-20261119` / `7954f1e5` | 94/30 | FUTURE — PRESERVE | category |
| `chatgpt/btc-spentness-private-scan-20261118` / `2b4b1e91` | 80/39 | FUTURE — PRESERVE | category |
| `chatgpt/ghostpay-beta-consolidation-20261118` / `df5e4f69` | 37/0 | FUTURE — PRESERVE | category |
| `chatgpt/ghostpay-historical-consolidation-20261115` / `7dc7eccc` | 7/1 | UNKNOWN — INSPECT | unknown |
| `chatgpt/ghostpay-private-scan-completion-20261119` / `18b36745` | 87/40 | SUPERSEDED — ARCHIVE | source |
| `chatgpt/ghostpay-remaining-work-20261119` / `509a8004` | 1220/481 | UNKNOWN — INSPECT | unknown |
| `chatgpt/ghostpay-rpc-filter-guard-20261114` / `dfed84c1` | 2/1 | SUPERSEDED — ARCHIVE | source |
| `chatgpt/ghostpay-rpc-filter-guard-beta-20261114` / `73923350` | 5/2 | SUPERSEDED — ARCHIVE | source |
| `chatgpt/ghostpay-six-fixes-combined-20261112` / `36dfa8d2` | 6/4 | SUPERSEDED — ARCHIVE | source |
| `chatgpt/ghostpay-viem-alignment-20261118` / `defdaa30` | 71/65 | EQUIVALENT — SKIP | lock |
| `chatgpt/pages-browser-fixes-combined-20261114` / `73923350` | 5/2 | SUPERSEDED — ARCHIVE | source |
| `chatgpt/pages-release-gate-audit-20261114` / `2221a611` | 2/0 | FUTURE — PRESERVE | category |
| `chatgpt/zero-codex/audit-pages-release-20261112` / `364b01f8` | 1/0 | FUTURE — PRESERVE | category |
| `chatgpt/zero-codex/cli-sentinel-value-20261111` / `a6e74591` | 2/1 | SUPERSEDED — ARCHIVE | source |
| `chatgpt/zero-codex/docs-pages-scope-20261112` / `c5efadab` | 8/1 | FUTURE — PRESERVE | category |
| `chatgpt/zero-codex/docs-postmerge-wiki-20261118` / `362dfa99` | 6/0 | FUTURE — PRESERVE | category |
| `chatgpt/zero-codex/merchant-schedule-horizon-20261111` / `7cdc6b32` | 1/1 | EQUIVALENT — SKIP | exact |
| `chatgpt/zero-codex/onion-canonical-host-20261111` / `72dde82d` | 2/2 | EQUIVALENT — SKIP | exact |
| `chatgpt/zero-codex/pages-negative-fiat-regression-20261114` / `9bdc9cba` | 1/1 | EQUIVALENT — SKIP | exact |
| `chatgpt/zero-codex/pages-owner-ci-handoff-20261114` / `83fe9b02` | 1/0 | FUTURE — PRESERVE | category |
| `chatgpt/zero-codex/pages-owner-transfer-filter-20261115` / `cf5e876c` | 3/1 | SUPERSEDED — ARCHIVE | source |
| `chatgpt/zero-codex/pages-qr-combined-20261115` / `26f83ccd` | 7/2 | SUPERSEDED — ARCHIVE | source |
| `chatgpt/zero-codex/pages-scan-transfer-filter-20261114` / `7b6c4983` | 2/1 | SUPERSEDED — ARCHIVE | source |
| `chatgpt/zero-codex/pages-tagarchive-blocked-click-20261117` / `8aed22ad` | 1/0 | SUPERSEDED — ARCHIVE | source |
| `chatgpt/zero-codex/ux-confirm-clock-boundary-20261111` / `d7795690` | 2/2 | EQUIVALENT — SKIP | exact |
| `chatgpt/zero-codex/ux-guide-plain-object-20261111` / `cf3a8b23` | 2/2 | EQUIVALENT — SKIP | exact |
| `checkpoint/ghostpay-source-reconciliation-20261101` / `243d98d6` | 1/0 | FUTURE — PRESERVE | category |
| `claude/ghostpay-lean-core-milestone-t5lwox` / `2527d6b9` | 15/5 | UNKNOWN — INSPECT | unknown |
| `claude/gifted-planck-115x2k` / `1d28f24d` | 12/0 | UNKNOWN — INSPECT | unknown |
| `claude/haiku-wave-2-handoff-qepfoe` / `8d1bde36` | 3/2 | FUTURE — PRESERVE | category |
| `claude/happy-maxwell-onl4x5` / `fd710eb3` | 2/0 | SUPERSEDED — ARCHIVE | source |
| `claude/vigilant-johnson-yjgq94` / `4403d370` | 1/0 | UNKNOWN — INSPECT | unknown |
| `codex/ghostpay-cloud-41868394956` / `f34a80f7` | 4/2 | SUPERSEDED — ARCHIVE | source |
| `codex/ghostpay-consolidation-records-20261119` / `042b2ce3` | 38/1 | FUTURE — PRESERVE | category |
| `codex/ghostpay-recovered-lean-checkpoint-20261028` / `371d235c` | 188/24 | UNKNOWN — INSPECT | unknown |
| `codex/ghostpay-resume-20261028` / `75400888` | 1/0 | FUTURE — PRESERVE | category |
| `codex/ghostpay-security-audit-20261030` / `63994db6` | 15/1 | UNKNOWN — INSPECT | unknown |
| `codex/recovery-spec02-unqualified-20261116` / `8d6fd6df` | 4/0 | FUTURE — PRESERVE | category |
| `codex/setup-autonomous-agent-20261104` / `122e5171` | 2/0 | FUTURE — PRESERVE | category |
| `dependabot/github_actions/actions-b9ade1236b` / `199ab7ef` | 5/0 | FUTURE — PRESERVE | source |
| `dependabot/npm_and_yarn/npm-major-1ddf9439d6` / `bbc8ff3b` | 69/0 | FUTURE — PRESERVE | category |
| `dependabot/npm_and_yarn/npm-minor-patch-71cdd1547c` / `3c95b2a0` | 88/65 | EQUIVALENT — SKIP | lock |
| `docs/future-privacy-feature-specs-20261109` / `896c671f` | 20/19 | FUTURE — PRESERVE | category |
| `fix/ghostpay-cloud-api-secret-aliases-20261103` / `cdbb7ec7` | 1/0 | UNKNOWN — INSPECT | unknown |
| `fix/remediation-b16c7936-5ce634` / `0b213bd9` | 1/0 | SUPERSEDED — ARCHIVE | source |
| `fix/remediation-f95457fd-22ecf9` / `6b3e689c` | 2/0 | SUPERSEDED — ARCHIVE | source |
| `ghostpay-cloud-recovery-2026-10-26` / `2ec98b23` | 173/24 | UNKNOWN — INSPECT | unknown |
| `ghostpay-local-lean-boundary-20261027` / `020ba327` | 187/24 | UNKNOWN — INSPECT | unknown |
| `ghostpay-offline-deps-2026-10-27` / `3697f539` | 178/24 | UNKNOWN — INSPECT | unknown |
| `ghostpay-sbom-repro-2026-10-27` / `b5b04b99` | 180/24 | UNKNOWN — INSPECT | unknown |
| `integration/ghostpay-docs-recovery-20261119` / `4ff80733` | 72/31 | UNKNOWN — INSPECT | unknown |
| `maintenance/ghostpay-branch-audit-20261119` / `55e77995` | 17/0 | FUTURE — PRESERVE | category |
| `nodata/doc-sweep-20261118` / `cce7a7f7` | 3/0 | FUTURE — PRESERVE | category |
| `nodata/jolly-rubin-u4zd45` / `1054daab` | 40/35 | EQUIVALENT — SKIP | exact |
| `nodata/wizardly-allen-qwol6u` / `1c9a3ce4` | 3/0 | FUTURE — PRESERVE | category |
| `nodata/zealous-hopper-lr0nxe` / `b2604949` | 58/0 | FUTURE — PRESERVE | category |

## Next work

Root owns integration and combined exact-head qualification. The next reviewer should select one unresolved source scope and establish a current missing behavior before editing. Preserve the three BTC branches, unqualified major upgrades, optional automation and historical evidence; do not merge broad UNKNOWN histories. This checkpoint supports selective review and preservation, not branch closure or deletion.
