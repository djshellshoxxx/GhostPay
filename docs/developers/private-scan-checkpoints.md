# Private EVM seller scan checkpoints

This is the Pages EVM scanner's local continuity mechanism. It does not alter contracts, EIP-5564 derivation, EIP-6538, keystore formats, Spec 18 exports, BTC/Solana/TRON scanning or release gates.

## State and identity

`PrivateScanVault` (`apps/web/src/lib/privateScanStore.ts`) stores one authenticated document containing `startBlock`, a `ScanCursor`, bounded discovered public announcements, and router-only coverage notes. The immutable scope binds the spending/viewing public-key identity digest, chain ID, manifest announcer/router, configured finality depth, Deep scan mode and a canonical configuration digest. The UI includes signed deployment and selected primary/secondary/scan-source settings in that digest. Budget/display changes that do not affect identity are handled by the UI's conservative configuration binding.

The storage key is `ghostpay.scan.checkpoint.v5.<HKDF output>`. HKDF-SHA256 uses the private viewing key and domain-separated scope input. The key derivation domain differs from the slot domain. A random 32-byte salt derives an AES-256-GCM key, with a random 12-byte IV; authenticated additional data binds the v5 domain, slot, envelope version, salt and IV. This reuses the cryptographic primitives and guarded IndexedDB compare-and-swap pattern already used by the reconciliation and BTC vaults. No new cryptographic dependency or key-backup format is introduced.

The encrypted plaintext has its own version and scope digest. Parsing uses field allowlists and rejects malformed versions, scope substitutions, malformed public points/addresses/hashes, duplicate event identities, and invalid cursor relationships. An advanced cursor requires `last.number + 1 == nextBlock` and a canonical-length hash. An anchorless cursor is accepted only at its starting position. Storage presence alone never authorizes resume. A valid old encrypted document can be replayed by someone controlling storage; the scanner therefore continues to recheck canonical anchors and never treats local history as current payment evidence.

## Atomic advancement and recovery

`runScan` accepts an awaited `onCheckpoint(cursor, matches, routerOnlyBlocks)` callback. The Pages view saves the complete discovery set and safe cursor in one document. The callback must complete before the scanner reports a completed page. A failed write, quota error, stale guard or CAS conflict stops the run; it does not advance the durable cursor. Matches found in a failed page can remain visible in that live session, but the page is retried after reopening.

`load` restores public observations as claims, never as verified receipt authority. Before incremental scanning, `replayBlocks` re-fetches the unique historical match blocks strictly below the saved cursor using the same selected clients, worker, cryptographic matching and transaction-bound verification. Blocks at or above the cursor belong to the ordinary finality-tail scan; replaying them separately would create an overlap/reorg race. Only fresh results feed actionable UI state. No new checkpoint is saved until historical replay is complete. A narrowed router-only historical block, unavailable historical head, incomplete response or reorg during that replay fails closed and leaves the saved document intact.

Unresolved claims stay in the encrypted discovery set and are checked again on future resumes. This preserves liveness of the forward cursor without permanently skipping a payment after repeated transient verification failures. Duplicate event IDs and existing router-versus-public-replay rules remain enforced.

The adapter's configured chain-specific `finalityDepth` defines the conservative saved overlap. There is no new universal confirmation count. The persisted preceding-block anchor is checked on resume. Confirmed reorgs use the existing conservative genesis reset and canonical reconciliation invalidation. When two providers are selected, existing page/anchor corroboration remains required. Router-only coverage notes follow confirmed rollbacks. These checks are not consensus verification and cannot prove an RPC did not omit data.

## Concurrency, locking and deletion

The existing `IdbReconciliationVaultStore` commits ciphertext only when its previous exact value still matches. Success resolves on transaction completion. Guards are checked before writes and within the transaction, including after request success. Two tabs cannot silently overwrite the same previously loaded revision. Conflicts are surfaced for explicit reload/resume.

Even a missing journal is first reserved with a random tombstone. `forget` writes a fresh random tombstone rather than removing the key, preventing an old handle from recreating a cleared value through a null/absence ABA race. Different contexts can proceed independently. No cross-tab secret or seller identifier is broadcast.

`privateScanLifecycle.ts` captures the current session object/revision and a local invalidation generation. A silent lock or reinstall of identical keys still invalidates the old handle. The view locks handles on abort/unmount and guards all UI updates, including terminal status. Copied viewing-key buffers are consumed and wiped, and nonextractable WebCrypto key handles are dropped on lock. JavaScript/WebCrypto zeroization remains best effort.

GhostPay currently has one saved seller-vault slot. Deleting it first deletes the confirmed keystore ciphertext, then atomically replaces all v5 journal rows with tombstones before reporting success. The deletion may therefore invalidate histories of identities previously used in this profile as well. A cleanup failure is reported as partial completion; it cannot claim all history was removed. The existing policy for retaining loaded keys is unchanged.

For sessions tied to a saved key vault, the lifecycle wrapper checks the exact saved ciphertext **after** journal reads and reservations, and before/after CAS. This ordering closes the read-before-delete/reopen race across the two databases: an earlier accepted journal revision is subsequently tombstoned, while an opening after invalidation sees the missing/replaced key vault. Broadcast messages contain only `changed` and improve responsiveness; they are not revocation authority. An independently imported holder of the keys can deliberately start a fresh scan after deletion.

## Network and cancellation

The Pages private path creates clients for the explicitly selected endpoint instead of inheriting an unrelated cached client. The scope includes current endpoint policy. Settings/session changes invalidate the captured context; checks occur before opening, before logical RPC dispatch, after RPC responses and before persistence. Windowed scanning checks again after jitter and before split/window dispatch. Indexer and selected custom-endpoint fetches use the same captured guard. No provider fallback is added.

The engine races pending RPC awaits against cancellation, terminates the worker and prevents later logical requests. Cancellation cannot retract bytes already sent or guarantee a server stops processing an in-flight request. Existing transport retry/deadline behavior is retained. PR #241 repaired transport implementation details and was merged into main during this work. This feature uses that updated base and does not add further changes to its transport modules.

The selected RPC can see IP/timing, exact header/anchor requests, coarse or exact announcement windows depending on settings, and the transaction/receipt queries used to check matches. Replaying historical payment blocks can reveal renewed interest in those blocks. Encryption of local history provides no network unlinkability or protection from a compromised unlocked frontend.

## Limits

| Resource | Bound |
|---|---|
| Historical replay block list | At most 10,000 supplied heights; duplicates collapsed; only heights below saved cursor replayed |
| Announcements | At most 100,000 in historical revalidation and separately 100,000 in new-range scanning per run, or lower caller limits |
| Open lane | Existing configurable new-range budget, default 20,000; history does not consume it; the existing first-page exception remains |
| Matches retained | At most 10,000 across restored and newly discovered records |
| New-range pages | At most 10,000; callers can lower the cap |
| Worker timeout | Existing 60-second silence timeout; forward worker progress refreshes it |
| Journal plaintext | 2,000,000 bytes; encrypted envelope at most 4,000,512 bytes |
| Per-record metadata | At most 4,096 bytes |
| Router-only notes | At most 1,000 block numbers |
| Window cache/split memo | Existing 64 cached windows / 4,096 split nodes |
| Selected RPC | Existing default 10-second request timeout, two retries (three attempts), configured retry cap five |
| Deletion transaction | At most 10,000 context rows; exceeding the bound aborts and reports failure |

The byte limit may be reached before the match-count limit. Dense historical blocks can exceed the separate historical announcement budget; resume then stops with the previous journal preserved. There is no silent eviction or assertion that all payments are known. A large archive may need an explicit rescan from an appropriate earlier block or a selected provider/source able to serve its historical blocks. Ordinary forward progress is not starved by the default open-lane budget consumed during history replay.

The UI coalesces each synchronous page's match burst and publishes bounded progress updates. There is no scan server, telemetry or scheduled background work. Context count has no automatic eviction policy; browser quota failure is explicit. Timing/performance measurements belong to source-pinned validation records, not invented browser guarantees.

## Migration and visible metadata

v1–v4 plaintext checkpoints are never imported as coverage. Default services purge known legacy names best effort without reading their contents. Storage denial or an old open tab can leave/recreate legacy records, which v5 still ignores. Restoring keys without a journal starts from the chosen start, default zero, and reconstructs discovery from public chain data.

Browser inspection can see opaque v5 slot names, namespace/version, the number and lengths of context records, random encryption parameters, and tombstones. The per-payment count is encrypted, although ciphertext size can suggest how much history is stored. Inspection cannot read the checkpoint, events or configuration from those encrypted records without the viewing key. Existing unrelated settings, seller-keystore public metadata and reconciliation identifier exposure retain their prior security model. New scan safety messages use the source-English fallback in existing draft locales pending native review.

The private parser rejects invalid or over-limit envelopes and allows explicit per-context forgetting after observing their exact stored value. The shared IndexedDB adapter has a separate outer limit of 8,000,000 string characters and refuses non-string values before the private parser observes them. Such hostile or externally malformed rows appear unavailable and cannot be reset through the per-context control; clearing the affected browser site data or the existing all-context invalidation removes them. Clearing site data also removes other locally stored wallet data, so recovery material must already be available.

Tests are in `privateScanStore.test.ts`, `privateScanLifecycle.test.ts`, `scanClient.test.ts`, `scanPrivacy.clients.test.ts`, `Scan.privateCheckpoint.test.tsx`, and `e2e/private-scan-checkpoints.spec.ts`. Existing scanning, seller-vault, reconciliation, privacy, full/lean browser and Pages artifact gates remain applicable.
