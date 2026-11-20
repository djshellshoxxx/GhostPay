# Scope, coverage and source provenance

## Completed coverage

**546 distinct paths, 670 distinct `(path, Git blob)` versions and 6,218 commit/path appearances are reviewed across 12 immutable snapshots. There are zero pending or missing source versions in the selected scope.**

Every reviewed disposition means a complete source read or a complete previously read baseline followed by its entire variant diff. Identical source versions are reused across branch aliases. Search hits, file enumeration, output truncation and a passing metadata check do not earn source-review coverage. Three supplemental helper reviews overlap; they are deduplicated from the total.

The final reconciliation checked each of the 6,218 ref/path/blob/size mappings against Git trees, recomputed every distinct blob identity from its bytes and matched every included version to at least one completed reviewer ledger. The 673 raw ledger rows therefore represent 670 unique reviewed versions. [coverage-summary.json](coverage-summary.json) gives the totals; [reviewed-coverage.json](reviewed-coverage.json) joins each version to its review notes and all final source aliases.

| Domain | Paths | Unique versions | Ref/path appearances | Pending |
| --- | ---: | ---: | ---: | ---: |
| Original build/release/hosting configuration | 48 | 64 | 552 | 0 |
| Chain adapters | 31 | 34 | 372 | 0 |
| Core contracts/interfaces | 10 | 10 | 120 | 0 |
| Core crypto, schemas, SDK, policy and vault | 65 | 78 | 774 | 0 |
| Latest hosting source closure and Tor deployment | 40 | 44 | 392 | 0 |
| Bitcoin, Solana and TRON packages | 59 | 63 | 708 | 0 |
| Network, privacy, address/transaction and exchange packages | 108 | 116 | 1284 | 0 |
| Browser libraries and components | 107 | 145 | 1080 | 0 |
| Browser views/features, translation boundary and styles | 78 | 116 | 936 | 0 |
| **Total** | **546** | **670** | **6,218** | **0** |

The entry/view reviewer owns 99 of the 116 browser-view-domain versions. The coordinator owns the other 17 i18n/style versions plus the 64 original build versions, reflected in `root-coverage.json`. Registry's reference contract is counted with its feature, whereas the ten core contract/interface paths are in the contracts domain.

The original inventory had 506 paths / 626 versions. After main moved and the new Tor hosting feature appeared, the audit added the full portable-hosting-kit `src` closure, its executable entry point and eight new deployment/workflow/support inputs: 40 paths / 44 additional versions. The three hosting workers and coordinator completed that entire addition. Code on the four later snapshots inside the original selected roots matched already reviewed blobs; the source-root census found no unaccounted production-code path.

## Exact snapshots

The source cutoff is **November 19, 2026 at 10:29:30 p.m. Pacific** (`2026-11-20T06:29:30.589769+00:00`). This is a bounded audit of immutable snapshots, not a claim about commits created afterward. Initial and cutoff main are both retained to make branch movement explicit.

| Label | Source branch | Exact commit |
| --- | --- | --- |
| main | `main (initial snapshot)` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| release | `release/ghostpay-beta-qualification-20261119` | `417f7c71daf8645e1432f2ec8f070110879b80bd` |
| consolidation | `integration/ghostpay-completion-20261120` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| privacy-snapshot | `snapshot/ghostpay-privacy-8be15289-20261120` | `d6819796a9542acc488b896786faffe83b913d9b` |
| quick-hide | `feat/ghostpay-privacy-quick-hide-20261120` | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| clipboard | `automation/20261120T004531Z/feature/clipboard-guard` | `6c648770f5647ca7993cc108ef9e5ede9b46b4c9` |
| format | `fix/ghostpay-format-validation-20261120` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` |
| erc20-simulation | `automation/20261120T0434Z/bug/erc20-simulation-result` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` |
| main-final | `main (cutoff snapshot)` | `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` |
| recovered-fixes | `integration/ghostpay-main-recovered-fixes-20261120` | `6c65cc3fd31c9ae361f932bee4a3449d89ed776c` |
| unique-code | `integration/ghostpay-main-unique-code-20261120` | `885b9569e6fc99e43bf01d23305494275e10120e` |
| tor-completion | `feat/ghostpay-tor-completion-20261119` | `14a7526842b3cb055452b721d237a7e68813ff0c` |

`scope-refs.json` preserves the original eight-ref assignment; `scope-refs-final.json` is authoritative for final scope. Original domain reports retain their initial tables and counts. The consolidated report extends findings to all twelve by exact source identity rather than treating a newer branch as a superset.

## Branch selection and drift

The corrected initial census contains **318 actual remote branches**. An earlier 319-entry figure included an empty-name record derived from the symbolic remote HEAD alias; that metadata error was removed without changing source selection. At the final cutoff there were **364 remote heads**. The census found 41 new future-only branches, two new current-code integration branches, a new Tor hosting branch, one future-spec documentation branch and an unrelated audit branch. The two current-code integrations and Tor feature were added; future-only and documentation-only work did not expand the application scope. Main and a coordination-lock metadata branch had changed.

The original recent-branch triage selected distinct core blobs instead of rereading equivalent documentation/checkpoint branches. For example, the latest evidence/checkpoint refs carried already selected source, and the prior wallet repair was subsumed by consolidation. The final core-path census and branch aliases are recorded in `branch-reconciliation.json`; original discovery and final drift are preserved in `branch-inventory.json`, `recent-branch-triage.json` and `branch-drift-final.json`.

The unrelated remote branch `audit/ghostpay-core-latest-security-20261119` is not this audit branch. At cutoff, `audit/zero-cool-core-20261119` did not exist remotely. No source branch, PR or remote audit was modified.

## Included source and meaningful exclusions

The primary scope is the static browser application and its current first-party production dependency closure: 17 roots including the app on initial main and 19 on newer candidates. The union is recorded in `scope-package-roots.json`. Supporting SDK/core contract source is included, as are selected browser build/security workflows, public embed scripts and all latest hosting implementation source. Package exports were examined even where the browser does not currently call them; their findings retain explicit consumer limitations.

Production `.ts`, `.tsx`, `.js`, `.mjs`, shell/workflow/configuration code and Solidity in these selected roots were included. The supplemental Tor host example and Docker ignore policy are included because they affect the deployment boundary. Some inventoried build scripts are test-support code and were read, not run. Complete source ABI/type descriptors were examined as such; that does not prove correspondence with deployed code.

The audit does **not** claim to have reviewed every file in the monorepo. Exclusions are historical branches/archived copies, future-only modules, vendored third-party implementations, unrelated paused server/CLI variants, exhaustive test/spec/testutil files, generated build output and static translation/catalog data. The portable hosting CLI is included because it is the active dependency of the new hosting feature; that does not reactivate unrelated paused application CLIs. Relevant existing test source and language guidance were read as supporting evidence. Translation boundary/classification code and styles were fully reviewed; catalogs were not exhaustively copyedited.

No third-party cryptographic formal verification, live bytecode comparison, production infrastructure inspection, real Tor/I2P routing qualification, full dynamic application regression or transaction execution is implied. No deployment was started. The exact performed checks and advisory results are in [VALIDATION.md](VALIDATION.md).

## Review continuity

Fresh reviewers continued browser-library and network-transport work from saved per-file ledgers and handoffs. The coordinator completed the remaining browser components after a continuation ended. Later hosting reviewers received fresh, bounded instructions and their own source inventories. Independent quality reviews challenged impact, reachability, duplicate counting and branch claims. All final ledgers are complete; no worker's unfinished output or truncated display was treated as a pass.

Each completed handoff records its limits. Future work should begin with these immutable pins and the final coverage ledger, then review only new/changed in-scope versions unless a finding requires a deeper reassessment.
