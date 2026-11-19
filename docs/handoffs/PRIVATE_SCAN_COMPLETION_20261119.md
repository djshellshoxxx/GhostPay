# Private seller scan completion — review handoff

## Scope and source

This change completes the local EVM seller scan journal for the Pages beta and supersedes the narrower v4 slot extraction in PR #235. It does not establish overall GhostPay release readiness. No deployment, protected-main merge, release publication, contract change, Spec 18 format change, dependency change, or weakened gate is part of this work.

- Feature branch: `chatgpt/ghostpay-private-scan-completion-20261119`.
- Starting feature source: PR #235, `a5076f4d4e8d2dc515bdc31f304b6c6ce75bf3b1`.
- Initial main: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
- Updated main: `58d89b39b27a66454ebf392bcd35d5c68b57b2f8`, including transport isolation PR #241 and beta log retention PR #237.
- Main was integrated into the feature branch at `684eec18`; the only merge conflict was the append-only work-ownership document. Both existing entries were preserved.
- PR #238 (`198aa5baff22272453733a0f3dcfcac0e0994eec`) was inspected as a read-only integration input. Its unrelated features and release failures were not imported.

The PR head and the machine-readable evidence beside this report identify the final source. The independent review is in [private-scan-independent-review.md](private-scan-independent-review.md). Feature behavior and limits are specified in [the developer guide](../developers/private-scan-checkpoints.md) and [the seller guide](../user/receive-and-scan.md).

## Initial implementation inventory

| Classification at PR #235 | Finding and disposition |
|---|---|
| Completed and tested | Private v4 seller slot derivation; existing worker-based EIP-5564 matching; chain-specific finality overlap, canonical anchor checks, duplicate/replay handling, transaction-bound evidence, optional second-provider comparison. Reused and retained. |
| Implemented with incomplete feature coverage | Existing session aborts, storage error handling, and scan controls worked for live scans, but did not establish encrypted discovery continuity after a real reload. Expanded with storage, lifecycle, view, and browser regressions. |
| Partial | Incremental cursors survived a reload, while discovered payment observations did not. A later resume could skip the completed range and present no prior payment. The durable journal now commits both together. |
| Missing | Authenticated and bounded checkpoint contents; configuration/Deep mode binding; cross-tab compare-and-swap; key-vault deletion invalidation; explicit corrupted-history recovery; fresh revalidation of restored observations. Implemented. |
| Confirmed defects | Unauthenticated cursor authority, lost discovery on resume, stale setup cancellation, historical replay/finality-tail overlap, replay consuming the forward budget, lower-layer jitter dispatch after cancellation, and lost/truncated incomplete-coverage warnings. Regression evidence and corrections are described below. |
| Integration boundaries | PR #241 transport work was independently owned and later merged into main; its updated implementation is inherited unchanged. PR #228's wider AppShell cached-client work and PR #238's broader consolidation remain separate. This scanner explicitly constructs clients for the selected endpoints. |
| Release blockers outside this feature | Existing Mythril findings and other release gates remain enforced. This feature does not disposition or suppress them. |

At the initial census, PR #235 was an open draft with five successful workflows and no unresolved review discussion. Its scope was private slot naming, not the complete journal required here. The refreshed census observed 44 open PRs and verified that the transport PR had been merged. Existing automation and integration branches were treated as read-only.

## Implementation and acceptance mapping

| Requirement | Implementation and verification surface |
|---|---|
| Seller/network/configuration isolation | v5 HKDF slot and authenticated inner scope bind public spending/viewing identity, chain, announcer/router, chain finality, Deep mode, and canonical selected scan configuration. Storage substitution, wrong key/scope/version, malformed contents and corrupt ciphertext are rejected. `privateScanStore.test.ts` and view tests cover isolation. |
| Atomic incremental progress | One AES-GCM document contains the safe cursor, starting block, complete bounded public discovery set, and incomplete-coverage notes. Awaited transaction completion precedes completed-page progress. Failed saves leave the earlier durable position intact. |
| Recovery after interruption or reload | Restored observations are claims only. Unique historical match blocks below the cursor are freshly fetched and checked before forward scanning; the ordinary finality tail is scanned once. The UI initially shows saved-history information rather than presenting old observations as freshly verified payments. |
| Reorg and duplicate safety | Existing per-chain anchor/finality policy and two-provider checks remain in force. Reorg quarantine removes affected live observations and coverage notes. Historical narrowed or unavailable blocks cannot overwrite the previous journal. Existing event-ID and router/public-replay de-duplication rules are retained. |
| Session and seller lifecycle | Every operation captures seller identity, session revision and lifecycle generation. Reinstalling identical keys still makes old handles stale. Vault-tied handles also check the exact saved keystore ciphertext across reads/reservations/writes. Lock, replacement, configuration change and unmount invalidate captured work. |
| Deletion and multiple tabs | Exact-value IndexedDB compare-and-swap prevents lost updates. Random tombstones reserve missing records and invalidate forgotten records without an absence/ABA race. Deleting the single saved seller vault atomically tombstones all v5 contexts; partial cleanup failure is surfaced. A generic broadcast improves responsiveness without carrying identifiers or granting authority. |
| Selected network only | Fresh primary/secondary clients use the explicitly selected endpoint. Logical dispatch, window/jitter, returned responses and storage commits check the captured context. No additional provider fallback, telemetry or backend is added. |
| UI recovery and accuracy | Existing scan controls now show loading, not started, interrupted, resuming, scanning, paused, completed, failed and invalidated states; saved discovery count, durable height and network; explicit reload/forget actions; and preserved incomplete-coverage warnings. An anchorless chosen start does not invent a completed block. |
| Resource bounds | Journal size, record count, historical heights, per-run announcements/pages, coverage notes, worker timeout, existing window/cache limits and transport deadlines remain bounded. Historical replay has a separate announcement budget so it cannot repeatedly consume the new-range budget. No silent journal eviction or warning truncation is used. |
| Compatibility | Contracts, EIP-5564/EIP-6538 formats, Spec 18, existing key backups, unrelated chain scanners, invoice authority and deployment gates are unchanged. New safety messages use the existing source-English fallback policy in draft locales; existing translations are retained. |

## Confirmed defects and regression evidence

1. **Cursor/discovery split:** a completed range could be skipped after reload while its discovered payments were absent. The awaited journal callback and encrypted view restoration now preserve observations and replay their source blocks before advancing.
2. **Storage accepted by existence:** old plaintext cursors lacked authenticated identity/content authority. v5 validates the envelope, inner version, scope digest, cursor relationship, public records, limits and cryptographic authentication. v1–v4 entries are ignored and purged best effort rather than adopted as coverage.
3. **Stale cross-database lifecycle:** key-vault deletion could race a journal opening. Post-read/post-reservation keystore checks plus guarded CAS and tombstones close the ordering gap. The lifecycle RED run observed two failures before the correction.
4. **Non-cooperative RPC cancellation:** a stalled response could keep a cancelled scan waiting. Engine and setup awaits race the abort signal, while late results remain observed and cannot modify the active context. Window jitter also checks again before dispatch. Focused failing tests preceded both fixes.
5. **Historical replay replacement:** a router-only replay could silently drop a saved non-router discovery. Historical incomplete coverage now fails closed with the previous journal retained.
6. **Finality-tail overlap:** separately replaying tail observations before normal scanning could retain an orphan across an intervening reorg. Replay is restricted to heights strictly below the persisted cursor.
7. **Forward-scan starvation:** prior-history announcements could consume the open-lane budget on every resume. Separate bounded replay/new-range counters preserve forward progress.
8. **Coverage disclosure loss:** a clean resume could drop historical router-only warnings; both UI accumulation and engine accumulation could silently truncate the 1,001st height. The journal retains the union, drops only confirmed rolled-back notes, and fails before committing a page whose warnings cannot fit. The engine RED test actually completed while retaining only 1,000 warnings; the corrected test fails closed.
9. **Recovery/status ergonomics:** CAS failures now expose Reload; cancelling during client creation or manifest readback releases Start; an unchanged anchorless starting cursor does not claim completed coverage. Tests check these visible outcomes.

Not every initial test invocation was a behavioral RED result. The first storage invocation failed during dependency startup; two authored view fixtures initially lacked the required canonical anchor and were corrected. Those runs are recorded as setup/fixture failures rather than proof of product defects. Existing assertions, coverage thresholds and security gates were not weakened.

## Validation record

This report distinguishes completed local checks from required final combined-source qualification. The adjacent evidence manifest records exact commands, exit results, log hashes and runtime/test source hashes; later PR check results must be assessed at the PR's actual head.

Completed implementation-stage evidence includes:

- All 68 workspace library builds from source after restoring the exact locally available dependencies; the initial missing-protobuf build failure is retained separately.
- Encrypted store/lifecycle selection: 47 passing tests, including 36 store and 11 lifecycle cases.
- Existing scan view: 31 passing tests; existing automatic-rescan view: five passing tests during implementation.
- Independent scanner/privacy run: 131 passing tests before the final coverage-bound addition.
- Coverage-bound and namespace invalidation selection: three passing tests, including rollback of an earlier staged tombstone when a later update aborts.
- Package-map check and 12 package-boundary/tooling tests; source secret scan; all 111 action references pinned; locale checker with four catalogs and zero errors. English fallback warnings remain explicit.

Local environmental failures are not passing evidence:

- Offline `npm ci --ignore-scripts` could not find the pinned Vitest tarball. Tests used locally available packages whose active-platform versions were checked against the lockfile. No manifest or lockfile was changed. A later `npm ls --all --omit=dev` reports extraneous packages and override-tree inconsistencies in that reconstructed local install; a clean CI install must qualify the dependency tree.
- Several whole-web typecheck attempts exited 137 without diagnostics; a 1,024 MiB scoped ESLint attempt exhausted the V8 heap. These are resource-limited attempts, not proof that typecheck or lint passed.
- The first full-profile Playwright attempt stopped in its configured web-server typecheck with exit 137 before browser launch.
- The combined repository tooling invocation passed 13 tests and failed two unchanged dependency-tooling subprocess tests on `spawnSync` timeouts. The exact failures are retained; they are not attributed to the feature without a clean rerun.

Final view, full-web coverage, chain-adapter, full/lean Chromium, Pages artifact, whole-web typecheck/lint and hosted qualification results are updated in the evidence manifest and PR before merge readiness is claimed. Performance figures must come from executed deterministic fixtures; aggregate test durations are not mobile-browser performance promises.

## Remaining limitations and integration notes

The journal is browser-local. Closing the browser stops scanning. Recovered keys without this browser's history start from the chosen position (default zero) and reconstruct public-chain discovery. A backup is not treated as proof that a later range has been scanned.

Encrypted local history does not hide network requests from the selected provider. Historical replay reveals renewed interest in old blocks, and transaction-bound verification makes receipt/transaction queries. Existing settings and unrelated storage retain their prior visibility. Browser inspection still sees opaque context names, context count, ciphertext lengths, versions/random parameters and tombstones. A compromised unlocked page remains outside this protection.

The byte limit can be reached before 10,000 discoveries. Dense historical blocks may exceed the separate replay budget and require an appropriate explicit rescan or usable historical source. More than 1,000 retained incomplete-coverage heights fails closed. There is no claim that retrying alone resolves every capacity condition. Shared-store non-string or >8,000,000-character rows cannot be cleared through the per-context control because the adapter rejects them before the journal can observe their CAS value; browser site-data cleanup or all-context invalidation is required.

Canonical anchors and two-provider comparisons are not consensus proofs and cannot guarantee a provider returned every event. Each chain retains its configured confirmation assumptions. Already-dispatched bytes cannot be recalled by cancellation.

The independent review was performed by a separate AI-assisted reviewer and storage reviewer. It is not a professional external security audit. Merge readiness depends on the final source-pinned gates, not the presence of this document. Overall release readiness, Mythril disposition and publication remain separate decisions.
