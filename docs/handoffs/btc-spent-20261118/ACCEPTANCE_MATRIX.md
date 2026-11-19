# Bitcoin spent-output/private-scan acceptance matrix

Scope: user attachment **GhostPay — Complete Bitcoin Spent-Output Detection and Private Scanning**, sections 1–18.
Baseline: main `dfc75ef2087fa6463ae59e0818abec01796c578d` plus PR #219
`9617e8572f9bc414410bd937b0e7718d0c5bd55c`, combined at `e27ce7f60fb0e21788f09df0f188b3b3490bcad2`.
Initial classification reflects inspected source, not claims in an older handoff. Final executed qualification is in README.md.

Integration source: local `3f4811afbfbdd5fa2fd2fbdd9afdac86f976668a`, published as
`ef08170a83d86d194b8ce4186299e791027e461e`, incorporating main
`58d89b39b27a66454ebf392bcd35d5c68b57b2f8`. Both commits and the hosted PR merge
`278b1d5afcbc5056fd096ea52e34feaaeedfdb4e` have identical tree
`0074dde6081e45188c45feb39503c64243ef99b8`. The differing commit IDs reflect authenticated
transport and merge ancestry, not different tested source. A subsequent lint correction at local
`10c3993d4d7a215c57b936ee2b1967741d247675` / published `4a878e302beac5cca52d20e17cdd756f3fbebb0d` adds three callback type
annotations only; emitted JavaScript is byte-identical. Its new qualification is recorded separately.

| ID | Acceptance criterion | Initial classification | Source/evidence and required completion |
| --- | --- | --- | --- |
| B01 | Consume block inputs locally without per-outpoint traffic | Completed with adversarial gap | Preserve Esplora `getSpends`, header and oracle wrappers; do not add a parallel scanner. |
| B02 | Exclude actual coinbase; reject malformed/inconsistent provider data | Partially completed | JSON `is_coinbase` could hide a real spending transaction without changing txid/wtxid. Bind identity and spends to parsed transaction; regression must reject the forged flag. |
| B03 | Correct identity, same-range and persisted output matching | Completed with edge gaps | Preserve scanBlocks/resumeScan; cover same-block/range, duplicate inputs and matches, prior records, and repeated resumes. |
| B04 | Incomplete or historical missing evidence is unknown | Missing | `getSpends` presence alone incorrectly implied local evidence. Add compatible continuous-coverage marker, tip comparison, historic membership check and unknown selection gate. |
| B05 | Provider checks off by default; explicit authorization | Partially completed | Scanner option existed. Worker bridge lacked enforcement; stale light flag could force checks after mode changes. Validate both producer and dispatch boundary. |
| B06 | Revocation, cached clients, retries, stale results | Partially completed | Checkbox disabled while running; pre-aborted injected fetch still dispatched. Cancel/close/wipe on policy changes; reject stale worker messages and headers. |
| B07 | Light mode clearly requires disclosure before traffic | Partially completed | Original UI forced checks on; public scan API and worker did not fail before traffic without consent. Explicit checkbox + scan gate + API/worker guards required. |
| B08 | Persist and restore metadata after interruption/reload | Completed with evidence gap | Existing encrypted Bitcoin continuity retained; add/validate optional coverage marker, spend evidence and corrupt/legacy compatibility, with no seller checkpoint changes. |
| B09 | Reorg clears orphan evidence while preserving canonical discoveries | Partially completed | Duplicate spend could overwrite canonical evidence; retained UI result kept old local label/count after a fork. Retain earliest proof, roll back marker/evidence, downgrade refreshed results. |
| B10 | Mempool and historical limitations explained accurately | Partially completed | Prior limitations were disclosed but unknown history was still selectable. Match disclosures to actual evidence and refresh mechanisms; no mandatory mempool query. |
| B11 | Bitcoin UI, keyboard controls, unknown/incomplete status | Partially completed | Keep existing interface/layout and English security fallback; add revocable native checkbox, explicit light gate, safe counts/status and recovery instructions. |
| B12 | Deterministic unit, integration and full/lean browser evidence | Unverified on new source | Run documented suites. Full includes Bitcoin worker; lean must retain intentional Bitcoin exclusion. Local socket restriction and hosted evidence must be recorded honestly. |
| B13 | Independent security/privacy review | Unverified | Separate reviewer examines source and reproductions, confirms fixes; no professional-audit claim. |
| B14 | Browser resource bounds and measured fixture performance | Partially completed | Preserve 500-block page, bounded block responses and worker messages; actual output count must obey 10,000 cap even with shared tweak buffers. Run deterministic input-filter benchmark. |
| B15 | Compatibility and release gates | Unverified on new source | Preserve source API/status contract, header verification, signing/recovery, dependencies and coverage thresholds. Typecheck, lint, builds, Pages verification, secrets and egress checks required. |
| B16 | Source-pinned documentation, integration and reviewable PR | Missing | Record baseline overlap, actual final source/tests/limits, changed-file mapping and PR. No merge/deploy/release. |

## Implementation disposition at the integrated source

| Criteria | Current disposition | Qualification boundary |
| --- | --- | --- |
| B01–B04 | Local extraction, coinbase binding, canonical identity/deduplication and incomplete/historical unknown semantics implemented. | Existing focused regressions and the final local package results are recorded with their own source pins; whole-web/coverage gates remain separate. |
| B05–B07 | Default-off local modes, explicit and revocable consent, default-deny worker dispatch and mandatory light disclosure implemented. | API/worker/UI regressions are retained; full-profile browser execution is required for final acceptance. |
| B08–B10 | Compatible encrypted spent metadata, continuous coverage, canonical rollback, legacy refresh and mempool limitations implemented/documented. | Native-worker persistence/reload cases are authored; their actual browser result belongs in the validation report. |
| B11 | Existing Bitcoin interface retained with native checkbox controls, evidence-specific counts/selection and English security fallback. | Catalog/key checks pass; browser/device-emulation outcomes must be reported separately from native-device acceptance. |
| B12 | Deterministic unit/integration and full/lean browser cases supplied. | Final matrix remains pending; authored or intentionally skipped cases are not counted as passed. |
| B13 | Independent source, integration and packet reviews completed with no unresolved feature-specific source blocker. | 119 independently executed focused tests; no external professional-audit claim. |
| B14 | Bounds reviewed; real output cap corrected; input-filter, memory-sample and abort-to-completion measurements recorded. | Synthetic in-memory benchmark excludes network, block parsing, payment cryptography and browser worker scheduling. |
| B15 | Interfaces, signing/recovery, dependencies and gates preserved; hosted Pages, regtest and workspace typecheck passed. | Remaining final CI checks must pass before merge readiness is asserted. |
| B16 | Reviewable draft PR #244, source/transport mapping, independent review, scope map and validation evidence prepared. | No merge into main, deployment or release performed. |

The full [validation report](VALIDATION.md) is authoritative for actual counts, failures, skips and source
identities; this disposition is not a substitute for the remaining executed qualification.

## Integration dependencies

PR #238 at inspected source `198aa5baff22272453733a0f3dcfcac0e0994eec` contains a different Esplora
`watchOutput`/`spendStatus` path that falls back to provider queries when local evidence is insufficient. It does
not carry PR #219's explicit `providerSpentCheck`/`spentStatus` contract. These BTC paths must be reconciled
explicitly during a future consolidation; merging both implementations mechanically is not qualified. This branch
continues the specifically assigned #219 contract and does not introduce a second engine.

PR #235's general seller checkpoint architecture, Spec18, other chains, browser-wide network isolation, contracts,
Mythril, dependencies and production publication remain outside this feature's change set.
