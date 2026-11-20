> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# Browser custody test audit — round 3 handoff

## Outcome

No new confirmed core finding was established in this bounded source review. Thirty exact test/helper path-and-blob versions are now covered, including all remaining assigned browser library tests, common helpers, settings library variants, privacy invariant tests and sweep state tests. Production coverage remains in the predecessor ledgers.

**This is a partial App/UI-test handoff.** Twenty-eight exact App, component and view test versions remain unread. The reviewer deliberately ended this round before context exhaustion; no compaction occurred, and no partially read source remains.

## Coverage accounting

- 30 reviewed versions, representing 5,349 source lines.
- 24 versions read directly in full; 6 covered through fully read counterparts plus complete diffs.
- 28 exact unread versions, totaling 6,186 lines.
- The 30 reviewed and 28 unread records exactly partition the predecessor’s 58-version, 11,535-line assignment.
- All reviewed SHA/path/blob mappings and line counts were checked against Git objects. There are no duplicate coverage records or pending partial ranges.
- No application, test, build, PoC, live probe, network transaction or Git mutation was executed. Only source inspection and owned scratch audit notes were used.
- Imported JSON fixture contents are not claimed as read. Merely importing or referencing another source does not confer coverage.

## Frozen refs

| State | Commit |
|---|---|
| main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| candidate | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| quick-hide | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| clipboard | `04910f65dc0268e41519c4b1a44e83264272f0bf` |

## Completed source review

**Batch 1.** Read test IndexedDB factories, render/session helpers and tag/key-store connection recovery tests. The IndexedDB substitutes model limited adapter operations and controlled event ordering; no real-browser validation is claimed. No new confirmed finding.

**Batch 2.** Read key-vault authorization/persistence and browser keystore tests completely. Source tests cover exact seller-key reauthentication, guard invalidation, no-vault refusal, cancelled/delayed operations, backup verification versus download, authenticated envelope validation, and normalized passphrase policy. No new confirmed finding; no test execution.

**Batch 3.** Read session and sweep-state test source. Tests cover temporary key copy wiping, guard invalidation, backup proof state, unresolved sweep lock preservation, stale CAS results, bounded replacement hash history and fail-closed journal writes. No new confirmed finding.

**Batch 4.** Read reconciliation IndexedDB recovery/quota tests, candidate atomic namespace invalidation additions, full main/candidate diff, and seller pairing schema tests. The pairing refusal cases recompute the public checksum to isolate field validation. No new confirmed finding.

**Batch 5.** Read payment-export RPC tests, vector/download helper and payment-key export/recovery/verification tests. Source assertions cover address-bound fresh authority, chain and endpoint checks, cancellation, seller changes, no RPC before credential validation, bounded archive scope, boxed recovery-key disposal, and unchanged custody during verification. Referenced JSON vector contents are not claimed as read. No new confirmed finding.

**Batch 6.** Read all three settings core-test variants, both settingsPrivacy variants, separate privacy-store tests and own-node loopback tests via complete source/diffs. Tests explicitly distinguish session-only consent by slot/chain, omit detected credentials on export, preserve dedicated UI privacy independently and report partial full-save failure. Secret-URL heuristics are not claimed exhaustive. No new confirmed finding.

**Batch 7.** Read both settings exchange and privacy invariant test versions through full source and complete diffs. Exchange tests bind apply to a reviewed basis and confirm trust-reducing changes. Privacy checks parse TypeScript sources and pin dispatch/CSP patterns; they are source-level guards, not proof of dynamic egress or a test run. Imported files and fixture contents gain no coverage merely by reference. No new confirmed finding.

**Batch 8.** Read both remaining reconciliation library test files in full. Source contracts cover strict authenticated vault schema, seller/chain binding, exact-ciphertext CAS, stale session/scan guards, invoice matching ambiguity and canonical time, imported-history separation, bounded registrations/receipts, receipt claims not becoming payment proof, and durable reorg tombstones/saturation. No new confirmed finding.

## Source-backed observations

### CUSTODY-TEST-OBS-01: Test substitutes limit the evidence

The fakeIndexedDb and memoryIndexedDb helpers explicitly model only adapter operations; captureDownloads records anchor/Blob handoff and does not establish successful disk storage. No source-only result is reported as a runtime test pass.

- `c977b5d6723f6822c3b5d86cd6b231712c53c395` — `apps/web/src/test/fakeIndexedDb.ts`, lines 39–98.
- `c977b5d6723f6822c3b5d86cd6b231712c53c395` — `apps/web/src/test/memoryIndexedDb.ts`, lines 35–143.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `apps/web/src/lib/paymentKeyExport.testutil.ts`, lines 69–94.

### CUSTODY-TEST-OBS-02: Recovery and reconciliation source contracts preserve authority distinctions

The payment export source tests check unchanged custody after verification and disposed recovery key boxes. Reconciliation source tests keep imported records as history and prevent archived receipts from serving as payment evidence or invoice links. These are reviewed test contracts, not executed outcomes or new findings.

- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `apps/web/src/lib/paymentKeyExport.test.ts`, lines 352–405.
- `c977b5d6723f6822c3b5d86cd6b231712c53c395` — `apps/web/src/lib/reconciliationVault.invoices.test.ts`, lines 144–165.
- `c977b5d6723f6822c3b5d86cd6b231712c53c395` — `apps/web/src/lib/reconciliationVault.invoices.test.ts`, lines 434–444.

## Composite coverage methods

Each record below has its own full range in the JSON ledger. Complete diffs were read; search hits alone were not counted.

- `apps/web/src/lib/reconciliationVault.idb.test.ts` / `ada7cdbcd4f16163e15923f15f652dec0fcac7f6`: Composite read: fully read candidate counterpart blob 4c52b6fe0c7224ef4812ab6d31a07b401d721862 plus complete untruncated git diff 4c52b6fe0c7224ef4812ab6d31a07b401d721862 ada7cdbcd4f16163e15923f15f652dec0fcac7f6. Main is the identical first 129 lines; candidate-only namespace invalidation block removed.

- `apps/web/src/lib/settings.test.ts` / `9ba2a5ccb59077ec6ac27c83e95ae69e10835e01`: Composite read: fully read quick-hide blob db3e1d0e58641947725dd27b3fb3e9c6cee6fada plus complete untruncated git diff db3e1d0e58641947725dd27b3fb3e9c6cee6fada 9ba2a5ccb59077ec6ac27c83e95ae69e10835e01.

- `apps/web/src/lib/settings.test.ts` / `01fe046841dacb451962614ef219f1c7ab122ea8`: Composite read: fully read quick-hide blob db3e1d0e58641947725dd27b3fb3e9c6cee6fada plus complete untruncated diffs db3e1d0e58641947725dd27b3fb3e9c6cee6fada -> 9ba2a5ccb59077ec6ac27c83e95ae69e10835e01 -> 01fe046841dacb451962614ef219f1c7ab122ea8.

- `apps/web/src/lib/settingsPrivacy.test.ts` / `549d64d9348fe9638c04454078b08654e23077c1`: Composite read: fully read quick-hide blob 03b845702db83998a2b578ebaa593bb1b243f28b plus complete untruncated git diff 03b845702db83998a2b578ebaa593bb1b243f28b 549d64d9348fe9638c04454078b08654e23077c1.

- `apps/web/src/lib/settingsExchange.test.ts` / `5ce01111b90a7c5b938ba712790f0b7cb7660358`: Composite read: fully read quick-hide blob 6dfda318e1ddcdc0c6d3914f8b37d92001995384 plus complete untruncated git diff 6dfda318e1ddcdc0c6d3914f8b37d92001995384 5ce01111b90a7c5b938ba712790f0b7cb7660358.

- `apps/web/src/privacyInvariants.test.ts` / `957cde23e8c602fa096e497851aed8ba96549c1c`: Composite read: fully read candidate blob f8a67c6d1df7939aad8daf57f36d3a04cfadfca7 plus complete untruncated git diff f8a67c6d1df7939aad8daf57f36d3a04cfadfca7 957cde23e8c602fa096e497851aed8ba96549c1c.

## Output completeness

The initial combined key-vault read omitted a middle section; `keyVault.test.ts` lines 200–325 were reread without truncation to fill it. The initial combined settings read omitted parts of `settings.uiPrivacy.test.ts` and `settingsPrivacy.test.ts`; both affected files were then reread completely without truncation. All other source and complete-diff coverage was checked against visible, untruncated output.

## Existing finding and scope

BROWSER-01 remains owned by the browser predecessor. This round did not reread the WalletAttempts evidence and adds no duplicate finding. The earlier portable-vault and production findings/coverage remain unchanged in their respective ledgers.

Optional SecretBackup, BackupPanel, full-profile MerchantProfilePanel/TagArchive UI and BTC/Solana/TRON/policy views stay excluded. Portable archive/ledger primitives remain included in predecessor coverage. Do not broaden the next round or install dependencies.

## Exact unread versions

| Path | Blob | Representative commit | Lines |
|---|---|---|---|
| `apps/web/src/App.test.tsx` | `63832b4078d23e3a8e24ba6faf63f1cbe5da9968` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 330 |
| `apps/web/src/AppLean.fragment.test.tsx` | `f3a0bd09abada7d88f02483ef10d920fc158c038` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 170 |
| `apps/web/src/AppLean.test.tsx` | `66de30ed6f99258b38f5cbc44e6c8a518eb341aa` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 166 |
| `apps/web/src/components/ReconciliationLedger.i18n.test.tsx` | `be6fb9d4ffa6db300695d5b25ffc1ffa63de81e6` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 135 |
| `apps/web/src/components/ReconciliationLedger.invoices.test.tsx` | `d3f96ceebe31fa1fde01dc2dfeca427e10df24c7` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 283 |
| `apps/web/src/components/ReconciliationLedger.privacy.test.tsx` | `ef369c7623aa6593e5db6c1579ae762d07cd4392` | `137628961463fc5abd8b7927b2efe6b18a0a206a` | 79 |
| `apps/web/src/components/ReconciliationLedger.test.tsx` | `eb5258cc762b0dbc4c7d9191b4fb36888ebda9e0` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 432 |
| `apps/web/src/components/StealthExportCommon.review.test.tsx` | `1c9f60cee51327f25d7e76407fb03b82058439f7` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 70 |
| `apps/web/src/components/StealthExportDownload.test.tsx` | `b575ca653ec342ba75de1c3790172389f5c40781` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 61 |
| `apps/web/src/components/StealthExportPayment.test.tsx` | `e862d56370e933cdead752e57a30c6d54e2af000` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 311 |
| `apps/web/src/components/StealthExportRecovery.test.tsx` | `916f471c6a9ba26c9a15f7672460896e3c8a240c` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 430 |
| `apps/web/src/components/StealthExportSelection.test.tsx` | `01e4b56e692bf638fe7be61ff1149f20fd244077` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 92 |
| `apps/web/src/components/StealthExportVerification.test.tsx` | `2a38ab18ac0fb37b53b4f40062695e2c5876addf` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 200 |
| `apps/web/src/views/SellerKeys.completion.test.tsx` | `96d79a91967763376e3ccbd472a0111d470be367` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 339 |
| `apps/web/src/views/SellerKeys.i18n.test.tsx` | `a5a93e5a38fbc9026c260bfc41884f5e9573ab81` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 36 |
| `apps/web/src/views/SellerKeys.lock.test.tsx` | `098c626f4c401dfea4ccc342809d4c6571e52f5c` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 65 |
| `apps/web/src/views/SellerKeys.recovery.test.tsx` | `dfaeaf232a511786fada7ca13abad49a5d067116` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 172 |
| `apps/web/src/views/SellerKeys.stealthExport.test.tsx` | `7231bb425a0d7132ca0dc6107ba74ddf12fe71ff` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 113 |
| `apps/web/src/views/SellerKeys.storage.test.tsx` | `4a2aaaa6e9cca4e98481313b1afa0bb211d624eb` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 129 |
| `apps/web/src/views/SellerKeys.test.tsx` | `3a51679880d33e69390b0ceafd8e4c48c6b6e81d` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 942 |
| `apps/web/src/views/SellerPairing.test.tsx` | `e827e5f02f1762724dbbdec0d1cd832485f941a9` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 260 |
| `apps/web/src/views/Settings.clipboardPrivacy.test.tsx` | `e27f09ebd02b61b69bfb9f72d78d68bdf3598a58` | `137628961463fc5abd8b7927b2efe6b18a0a206a` | 79 |
| `apps/web/src/views/Settings.exchange.test.tsx` | `bc1344d8bc56fba59d9f126646cf9505973f0601` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 253 |
| `apps/web/src/views/Settings.exchange.test.tsx` | `6094ae5931e43d72b3fad9ade002275afaace426` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 254 |
| `apps/web/src/views/Settings.race.test.tsx` | `5cc29989d5952ec0f60cbe8f7a82f9c307b73b1c` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 50 |
| `apps/web/src/views/Settings.scanPrivacy.test.tsx` | `c3ca70c56ae0bae2e313b40d5c3f268abd30e343` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 61 |
| `apps/web/src/views/Settings.test.tsx` | `f898ade764504ab8aee0024194afed15f35f92fb` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 238 |
| `apps/web/src/views/Settings.test.tsx` | `7bf77779c2128ca6782f79fce0cf0600e2419360` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 436 |

## Successor instructions

Continue only the exact 28 unread entries. Read full source in bounded output, or the entire diff against a fully read counterpart. The remaining main/candidate Settings view variants can use composite methods once one full version has been read. Keep all path/blob variants distinct, record source-pinned evidence, and do not execute target code. Parent integrates repository notes.

`/workspace/scratch/e449ed9154f6/review-custody-tests-round3.json` is the authoritative machine-readable coverage ledger. Merge by `(path, blob)` with `review-custody-vault-round2.json` and predecessor ledgers; do not add record counts without deduplication.
