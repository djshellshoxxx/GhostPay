# Bitcoin spent-output/private-scan acceptance matrix

Scope: user attachment **GhostPay — Complete Bitcoin Spent-Output Detection and Private Scanning**, sections 1–18.
Baseline: main `dfc75ef2087fa6463ae59e0818abec01796c578d` plus PR #219
`9617e8572f9bc414410bd937b0e7718d0c5bd55c`, combined at `e27ce7f60fb0e21788f09df0f188b3b3490bcad2`.
Initial classification reflects inspected source, not claims in an older handoff. Final executed qualification is in README.md.

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

## Integration dependencies

PR #238 at inspected source `198aa5baff22272453733a0f3dcfcac0e0994eec` contains a different Esplora
`watchOutput`/`spendStatus` path that falls back to provider queries when local evidence is insufficient. It does
not carry PR #219's explicit `providerSpentCheck`/`spentStatus` contract. These BTC paths must be reconciled
explicitly during a future consolidation; merging both implementations mechanically is not qualified. This branch
continues the specifically assigned #219 contract and does not introduce a second engine.

PR #235's general seller checkpoint architecture, Spec18, other chains, browser-wide network isolation, contracts,
Mythril, dependencies and production publication remain outside this feature's change set.
