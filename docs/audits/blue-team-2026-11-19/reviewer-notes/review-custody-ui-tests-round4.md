> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# Browser custody UI-test audit — round 4

## Outcome

All **28 exact immutable test/support versions** in this assignment are reviewed, representing **6,186 source lines**. This round established **no new confirmed finding**. There are **no remaining or partially reviewed variants** in this assignment.

This is read-only source coverage. No application, build, test, PoC, live probe, network transaction, dependency installation or Git mutation was performed. Only the owned scratch audit reports were written. The review completed without context compaction.

## Coverage and method

- 26 versions were read directly in full from immutable Git blobs.
- 2 Settings variants were covered by a fully read counterpart plus the entire untruncated diff, including added and deleted lines.
- Every assignment SHA/path/blob mapping and line count matched its immutable Git object.
- The final ledger exactly matches all 28 assignment path/blob keys, with ranges covering lines 1 through each file end.
- Search hits, imports, and references were not counted as source coverage.

## Frozen refs

| State | Commit |
|---|---|
| main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| candidate | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| quick_hide | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| clipboard | `04910f65dc0268e41519c4b1a44e83264272f0bf` |

The ledger preserves each assignment representative SHA. Shared immutable blobs can have a different representative commit from the predecessor ledger; integration must deduplicate by `(path, blob)`.

## Source-backed review observations

### CUSTODY-UI-OBS-01: Export UI source contracts separate generated files, initiated downloads, retention and verification

The assigned tests require a second confirmation for raw-key download; distinguish a blocked download from a generated encrypted file; check the exact saved bytes, including refusal of BOM-normalized input; and keep seller custody unchanged during verification. These are reviewed assertions, not executed outcomes.

- `a9e0715573f7247d7a16f9d1d030cf0232708fb2` — `apps/web/src/components/StealthExportDownload.test.tsx`, lines 18–59 (blob `b575ca653ec342ba75de1c3790172389f5c40781`).
- `a9e0715573f7247d7a16f9d1d030cf0232708fb2` — `apps/web/src/components/StealthExportPayment.test.tsx`, lines 145–168 (blob `e862d56370e933cdead752e57a30c6d54e2af000`).
- `a9e0715573f7247d7a16f9d1d030cf0232708fb2` — `apps/web/src/components/StealthExportVerification.test.tsx`, lines 49–95 (blob `2a38ab18ac0fb37b53b4f40062695e2c5876addf`).
- `a9e0715573f7247d7a16f9d1d030cf0232708fb2` — `apps/web/src/components/StealthExportVerification.test.tsx`, lines 110–129 (blob `2a38ab18ac0fb37b53b4f40062695e2c5876addf`).

### CUSTODY-UI-OBS-02: Seller tests bind asynchronous completion and storage changes to the reviewed identity

The test sources distinguish identical public keys installed in a new session revision, reject late cancelled recovery results, check temporary-buffer wiping, separate pre-commit write refusal from post-commit reporting, and preserve replacement ciphertext when a vault-deletion confirmation becomes stale.

- `87cf6c603338ad64ec02300fe42b96c3e0a205b9` — `apps/web/src/views/SellerKeys.completion.test.tsx`, lines 161–191 (blob `96d79a91967763376e3ccbd472a0111d470be367`).
- `87cf6c603338ad64ec02300fe42b96c3e0a205b9` — `apps/web/src/views/SellerKeys.recovery.test.tsx`, lines 70–114 (blob `dfaeaf232a511786fada7ca13abad49a5d067116`).
- `87cf6c603338ad64ec02300fe42b96c3e0a205b9` — `apps/web/src/views/SellerKeys.test.tsx`, lines 667–712 (blob `3a51679880d33e69390b0ceafd8e4c48c6b6e81d`).
- `87cf6c603338ad64ec02300fe42b96c3e0a205b9` — `apps/web/src/views/SellerKeys.test.tsx`, lines 757–829 (blob `3a51679880d33e69390b0ceafd8e4c48c6b6e81d`).

### CUSTODY-UI-OBS-03: Settings tests preserve separate review, active policy and local privacy state

The source tests keep imported endpoints inactive during preview, require explicit consent for trust changes, bind endpoint status to the latest input/request, and ensure clipboard/privacy control changes do not persist unfinished sensitive endpoint edits. The candidate Settings tests additionally model blocked network actions for unacknowledged or corrupt profile storage.

- `87cf6c603338ad64ec02300fe42b96c3e0a205b9` — `apps/web/src/views/Settings.exchange.test.tsx`, lines 113–195 (blob `bc1344d8bc56fba59d9f126646cf9505973f0601`).
- `87cf6c603338ad64ec02300fe42b96c3e0a205b9` — `apps/web/src/views/Settings.race.test.tsx`, lines 17–48 (blob `5cc29989d5952ec0f60cbe8f7a82f9c307b73b1c`).
- `a9e0715573f7247d7a16f9d1d030cf0232708fb2` — `apps/web/src/views/Settings.test.tsx`, lines 304–436 (blob `7bf77779c2128ca6782f79fce0cf0600e2419360`).
- `137628961463fc5abd8b7927b2efe6b18a0a206a` — `apps/web/src/views/Settings.clipboardPrivacy.test.tsx`, lines 57–79 (blob `e27f09ebd02b61b69bfb9f72d78d68bdf3598a58`).

### CUSTODY-UI-OBS-04: DOM, storage, timing and download substitutes limit what this round establishes

These sources use jsdom, in-memory stores, controlled promises, mocked clipboard/RPC ports and intercepted Blob/anchor handoffs; some flows lower KDF work for tests. DOM hiddenness and autocomplete attributes are asserted, but no browser, password-manager, real-disk retention, production-cost KDF or live-network behavior was verified. Imported locale/vector contents are not covered merely because tests reference them.

- `87cf6c603338ad64ec02300fe42b96c3e0a205b9` — `apps/web/src/components/ReconciliationLedger.test.tsx`, lines 58–82 (blob `eb5258cc762b0dbc4c7d9191b4fb36888ebda9e0`).
- `a9e0715573f7247d7a16f9d1d030cf0232708fb2` — `apps/web/src/components/StealthExportPayment.test.tsx`, lines 22–38 (blob `e862d56370e933cdead752e57a30c6d54e2af000`).
- `137628961463fc5abd8b7927b2efe6b18a0a206a` — `apps/web/src/components/ReconciliationLedger.privacy.test.tsx`, lines 58–78 (blob `ef369c7623aa6593e5db6c1579ae762d07cd4392`).
- `137628961463fc5abd8b7927b2efe6b18a0a206a` — `apps/web/src/views/Settings.clipboardPrivacy.test.tsx`, lines 19–41 (blob `e27f09ebd02b61b69bfb9f72d78d68bdf3598a58`).
- `87cf6c603338ad64ec02300fe42b96c3e0a205b9` — `apps/web/src/views/SellerKeys.test.tsx`, lines 911–940 (blob `3a51679880d33e69390b0ceafd8e4c48c6b6e81d`).

## Completed review batches

**Batch 1.** Read full App/AppLean and fragment UI tests. Source contracts cover core-route boundaries, invoice-fragment cleanup with retained navigation state, idle recoverability, downloaded-but-unverified backup distinctions, scope replacement races, focus and error recovery. No new confirmed finding.

**Batch 2.** Read full reconciliation UI, invoice, localization and quick-hide privacy tests. Source assertions cover preview versus activation, historical receipt/import distinctions, canonical-time matching, stale scan/preview guards, guarded writes, cross-tab reorg refresh, saturation, localization with redacted errors, and explicit history reveal. No new confirmed finding.

**Batch 3.** Read every assigned stealth-export component/UI test and SellerKeys master/recovery integration test. Tests cover raw-key second confirmation, address-bound reauthentication, disclosure of public header and RPC privacy, exact selected-source binding, cancellation and revision guards, blocked-download retry using the same generated file, exact saved-byte matching including BOM refusal, recovery-key disposal, retention/verification distinctions, master-replacement consent and cross-tab vault-deletion re-review. No new confirmed finding; referenced vector contents are not covered by imports.

**Batch 4.** Read all remaining SellerKeys and SellerPairing test sources. Tests cover recovery-operation ownership by exact session revision, refusal of late key installs, observable temporary-buffer wiping, same-file cancellation retry, passphrase/DOM clearing, step-up authorization, backup versus download distinctions, storage pre-commit refusal and post-commit reporting, cross-tab replacement/deletion compare-and-swap, public pairing preview without authority changes, and obsolete preview cancellation. No new confirmed finding.

**Batch 5.** Read the full base Settings and Settings exchange UI test sources, complete main-to-candidate diffs, and full RPC-result race, scan-privacy, and clipboard-privacy tests. Source assertions cover reviewed import consent, conservative trust changes, no imported-endpoint contact during preview, session-only RPC consent retained on invalid form submissions, network policy acknowledgement and corrupt-storage refusal, stale endpoint-response rejection, bounded scan settings, and separate UI privacy persistence without saving unfinished endpoint edits. No new confirmed finding.

## Exact coverage

| Path | Immutable blob | Lines | Method |
|---|---|---:|---|
| `apps/web/src/App.test.tsx` | `63832b4078d23e3a8e24ba6faf63f1cbe5da9968` | 330 | Full source |
| `apps/web/src/AppLean.fragment.test.tsx` | `f3a0bd09abada7d88f02483ef10d920fc158c038` | 170 | Full source |
| `apps/web/src/AppLean.test.tsx` | `66de30ed6f99258b38f5cbc44e6c8a518eb341aa` | 166 | Full source |
| `apps/web/src/components/ReconciliationLedger.i18n.test.tsx` | `be6fb9d4ffa6db300695d5b25ffc1ffa63de81e6` | 135 | Full source |
| `apps/web/src/components/ReconciliationLedger.invoices.test.tsx` | `d3f96ceebe31fa1fde01dc2dfeca427e10df24c7` | 283 | Full source |
| `apps/web/src/components/ReconciliationLedger.test.tsx` | `eb5258cc762b0dbc4c7d9191b4fb36888ebda9e0` | 432 | Full source |
| `apps/web/src/views/SellerKeys.completion.test.tsx` | `96d79a91967763376e3ccbd472a0111d470be367` | 339 | Full source |
| `apps/web/src/views/SellerKeys.i18n.test.tsx` | `a5a93e5a38fbc9026c260bfc41884f5e9573ab81` | 36 | Full source |
| `apps/web/src/views/SellerKeys.lock.test.tsx` | `098c626f4c401dfea4ccc342809d4c6571e52f5c` | 65 | Full source |
| `apps/web/src/views/SellerKeys.recovery.test.tsx` | `dfaeaf232a511786fada7ca13abad49a5d067116` | 172 | Full source |
| `apps/web/src/views/SellerKeys.storage.test.tsx` | `4a2aaaa6e9cca4e98481313b1afa0bb211d624eb` | 129 | Full source |
| `apps/web/src/views/SellerKeys.test.tsx` | `3a51679880d33e69390b0ceafd8e4c48c6b6e81d` | 942 | Full source |
| `apps/web/src/views/SellerPairing.test.tsx` | `e827e5f02f1762724dbbdec0d1cd832485f941a9` | 260 | Full source |
| `apps/web/src/views/Settings.exchange.test.tsx` | `bc1344d8bc56fba59d9f126646cf9505973f0601` | 253 | Full source |
| `apps/web/src/views/Settings.race.test.tsx` | `5cc29989d5952ec0f60cbe8f7a82f9c307b73b1c` | 50 | Full source |
| `apps/web/src/views/Settings.scanPrivacy.test.tsx` | `c3ca70c56ae0bae2e313b40d5c3f268abd30e343` | 61 | Full source |
| `apps/web/src/views/Settings.test.tsx` | `f898ade764504ab8aee0024194afed15f35f92fb` | 238 | Full source |
| `apps/web/src/components/StealthExportCommon.review.test.tsx` | `1c9f60cee51327f25d7e76407fb03b82058439f7` | 70 | Full source |
| `apps/web/src/components/StealthExportDownload.test.tsx` | `b575ca653ec342ba75de1c3790172389f5c40781` | 61 | Full source |
| `apps/web/src/components/StealthExportPayment.test.tsx` | `e862d56370e933cdead752e57a30c6d54e2af000` | 311 | Full source |
| `apps/web/src/components/StealthExportRecovery.test.tsx` | `916f471c6a9ba26c9a15f7672460896e3c8a240c` | 430 | Full source |
| `apps/web/src/components/StealthExportSelection.test.tsx` | `01e4b56e692bf638fe7be61ff1149f20fd244077` | 92 | Full source |
| `apps/web/src/components/StealthExportVerification.test.tsx` | `2a38ab18ac0fb37b53b4f40062695e2c5876addf` | 200 | Full source |
| `apps/web/src/views/SellerKeys.stealthExport.test.tsx` | `7231bb425a0d7132ca0dc6107ba74ddf12fe71ff` | 113 | Full source |
| `apps/web/src/views/Settings.exchange.test.tsx` | `6094ae5931e43d72b3fad9ade002275afaace426` | 254 | Counterpart + full diff |
| `apps/web/src/views/Settings.test.tsx` | `7bf77779c2128ca6782f79fce0cf0600e2419360` | 436 | Counterpart + full diff |
| `apps/web/src/components/ReconciliationLedger.privacy.test.tsx` | `ef369c7623aa6593e5db6c1579ae762d07cd4392` | 79 | Full source |
| `apps/web/src/views/Settings.clipboardPrivacy.test.tsx` | `e27f09ebd02b61b69bfb9f72d78d68bdf3598a58` | 79 | Full source |

## Composite methods

- `apps/web/src/views/Settings.exchange.test.tsx` / `6094ae5931e43d72b3fad9ade002275afaace426`: Composite read: fully read Settings.exchange.test.tsx counterpart blob bc1344d8bc56fba59d9f126646cf9505973f0601 plus complete untruncated git diff --no-ext-diff --no-textconv bc1344d8bc56fba59d9f126646cf9505973f0601 6094ae5931e43d72b3fad9ade002275afaace426, including all added/deleted lines.

- `apps/web/src/views/Settings.test.tsx` / `7bf77779c2128ca6782f79fce0cf0600e2419360`: Composite read: fully read Settings.test.tsx counterpart blob f898ade764504ab8aee0024194afed15f35f92fb plus complete untruncated git diff --no-ext-diff --no-textconv f898ade764504ab8aee0024194afed15f35f92fb 7bf77779c2128ca6782f79fce0cf0600e2419360, including all added/deleted lines.

## Output completeness

- Initial assignment/predecessor metadata dump was truncated; exact assignment path/blob/SHA/line-count list and predecessor narrative were reread in bounded output.
- Initial App source combined output omitted lines near 315-324; App.test.tsx lines 310-330 were reread in full.

All source and full-diff output counted as reviewed was visible without unresolved truncation. No partial coverage remains.

## Existing findings and scope limits

BROWSER-01 remains owned by the predecessor browser review; this round neither duplicates nor changes it. No new test evidence required reopening production source. No fixture, locale, vector or referenced helper receives coverage merely because it appears in an import.

Optional SecretBackup, BackupPanel, full-profile MerchantProfilePanel/TagArchive UI and BTC/Solana/TRON/policy production views remain outside this assignment.

## Exact remaining variants

**None.** The machine-readable `remaining` and `partial_coverage` lists are empty. This completes only the assigned 28-version UI-test slice; it is not a claim that every repository file or runtime behavior has been verified.

The authoritative ledger for this round is `review-custody-ui-tests-round4.json`. Merge it with predecessor ledgers by `(path, blob)`.
