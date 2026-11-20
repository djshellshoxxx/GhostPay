> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# Custody and portable vault audit — round 2 handoff

## Outcome

No new confirmed core finding was identified in the completed source review. All assigned portable vault production implementations and residual custody production variants are covered. The portable tests and approved reconciliation/archive support tests were also read. The existing BROWSER-01 finding remains owned by the browser predecessor; this round adds concrete test-contract evidence without duplicating it.

**This is a partial test/helper handoff.** Context compaction occurred after the final bounded reads; the reviewer stopped source review and saved this checkpoint for a fresh worker as instructed.

## Coverage accounting

- 53 reviewed path/blob records: 17 production and 36 tests/helpers.
- 3 of these records independently reread predecessor-covered versions; 50 add coverage to predecessor ledgers.
- 58 exact unread browser test/helper versions remain, totaling 11535 source lines; no partial source ranges are pending.
- Coverage is deduplicated by path plus Git blob. Main variants derived from a fully read counterpart plus a complete diff have their own records and explicit method.
- No build, test, PoC, application code, live probe, wallet transaction or Git mutation was executed. Only source inspection and owned scratch audit notes were used.
- Referenced fixture JSON contents were not fully read; this handoff makes no fixture-content coverage claim.

## Frozen refs

| State | Commit |
|---|---|
| main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| candidate | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| quick-hide | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| clipboard | `04910f65dc0268e41519c4b1a44e83264272f0bf` |

## Completed production review

Portable closure coverage includes keystore-portable, portable-errors, portable entrypoint, seller-scope, reconciliation-amounts, reconciliation-portable, stealth-export-portable and tag-archive-portable. Eleven unique portable production path/blob versions were reviewed. Main keystore/errors/entrypoint variants were separately covered through complete diffs against fully read candidate counterparts. Associated portable test/helper paths were enumerated across all 28 frozen recent refs; no additional unique test blobs were found.

Residual web production coverage includes earlier StealthExportCommon and paymentKeyExport variants plus independently reread candidate counterparts. The approved reconciliationLedger and reconciliationMatch adapters were read in full. Predecessor-covered Settings/session/storage/journal versions remain in their original ledgers, with no new claim of independent rereading.

## Source-backed observations

### CUSTODY-OBS-01: Candidate keystore KDF wipes owned passphrase bytes in success and failure paths

Main creates an unnamed UTF-8 passphrase buffer for scrypt and only wipes derived bytes after successful scrypt; the candidate captures and wipes both owned buffers in finally. No exploit or runtime execution performed; not a new candidate finding.

- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `packages/ux-vault/src/keystore-portable.ts`, lines 74–84.
- `c977b5d6723f6822c3b5d86cd6b231712c53c395` — `packages/ux-vault/src/keystore-portable.ts`, lines 74–81.

### CUSTODY-OBS-02: Candidate export UI adds a synchronous session deadline check at final result acceptance

The earlier bc18fbc StealthExportCommon version only checks mounted state, controller cancellation, and selection identity. Candidate adds captureSessionVersionGuard and rechecks it inside current(), covering an expired result before browser event delivery. Candidate expiry tests explicitly inspect both empty/loaded sessions and final raw-key UI handoff. This is a verified source change and regression-test intent; tests were not executed. It is not a new remaining candidate finding.

- `e4d54a6829fcc861de7af1669c0e0f64f62aa137` — `apps/web/src/components/StealthExportCommon.tsx`, lines 147–182.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `apps/web/src/components/StealthExportCommon.tsx`, lines 153–194.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `apps/web/src/components/StealthExportCommon.expiry.test.tsx`, lines 34–89.

### CUSTODY-OBS-03: Quick-hide WalletAttempts tests cover the isolated wallet prop contract, not caller wiring

Connected test passes a wallet explicitly; disconnected test omits it and asserts that records/clear controls are hidden while beginAttempt still rejects the unresolved duplicate. These tests corroborate the existing finding behavior but do not verify Pay/Registry integration. Keep the predecessor-owned BROWSER-01 rather than create a duplicate finding. No test execution performed.

- `137628961463fc5abd8b7927b2efe6b18a0a206a` — `apps/web/src/components/WalletAttempts.test.tsx`, lines 11–36.

## BROWSER-01 integration note

Quick-hide WalletAttempts tests manually pass a wallet for the connected case (lines 11–20), while the disconnected case omits the prop, hides records and clearing controls, retains the journal, and expects duplicate-attempt rejection (lines 23–36). The predecessor documented that Pay and Registry callers omit this prop; the tests do not exercise that caller wiring. The original Medium/P2 finding applies to quick-hide, not main/candidate/clipboard. This round does not add or elevate the finding.

## Scope and successor instructions

SecretBackup, BackupPanel and full-profile MerchantProfilePanel are excluded by the parent’s no-lean-caller decision. Full-profile TagArchive UI is excluded; portable archive/ledger primitives remain included. Other nonportable ux-vault modules/tests were outside this assigned portable closure. Do not expand into unrelated workflows or install dependencies.

Continue the exact unread list below. Read each complete source in bounded outputs, or read the entire diff against a counterpart that was actually fully read. Search hits are not coverage. Keep main/recent unique blob records distinct, preserve test/helper labels, record branch state and exact evidence for any new finding, and do not execute target code. Parent integrates repo notes; write only an owned successor audit handoff.

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
| `apps/web/src/lib/idbStore.test.ts` | `ac35d25819dc2799b011b6e456d9fac05e1ab082` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 109 |
| `apps/web/src/lib/keyVault.idb.test.ts` | `b15fa874bbf0397b569a7d6fcc2722da44eda0d9` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 90 |
| `apps/web/src/lib/keyVault.secretExport.test.ts` | `57f4e70f37c4319e75d0f98af3a48f445e469c06` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 132 |
| `apps/web/src/lib/keyVault.test.ts` | `af1323436da652d8defe084464f7c252c61c7e26` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 404 |
| `apps/web/src/lib/keystore.test.ts` | `ff824086da7994ea866e6445abd4402534eb3641` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 206 |
| `apps/web/src/lib/paymentExportRpc.test.ts` | `8aadf1028cfcc92e1eb42371f6dcbe17c2085719` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 165 |
| `apps/web/src/lib/paymentKeyExport.test.ts` | `826578ab8904206b22d69f4ea963648f01a5eb38` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 405 |
| `apps/web/src/lib/paymentKeyExport.testutil.ts` | `6e3c2bb7232beeee5bc9aeee66dbbaa8e7c3dd0b` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 94 |
| `apps/web/src/lib/reconciliationVault.idb.test.ts` | `4c52b6fe0c7224ef4812ab6d31a07b401d721862` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 200 |
| `apps/web/src/lib/reconciliationVault.idb.test.ts` | `ada7cdbcd4f16163e15923f15f652dec0fcac7f6` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 129 |
| `apps/web/src/lib/reconciliationVault.invoices.test.ts` | `c68a9d26ce94c836079a83dc2694929aa13e8ac9` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 476 |
| `apps/web/src/lib/reconciliationVault.test.ts` | `a587e583e7ae8168a27fcdc7db414d614378290b` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 565 |
| `apps/web/src/lib/sellerPairing.test.ts` | `59c0ff53bd9e4619adc700cd559ea00886ac7359` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 119 |
| `apps/web/src/lib/session.test.ts` | `17c93c2e96814428c0ae8ac2155f937fb099ecfa` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 343 |
| `apps/web/src/lib/settings.loopback.test.ts` | `6bdda45ce1de594800ad1b7377d0206a93cdabdf` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 17 |
| `apps/web/src/lib/settings.test.ts` | `01fe046841dacb451962614ef219f1c7ab122ea8` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 92 |
| `apps/web/src/lib/settings.test.ts` | `9ba2a5ccb59077ec6ac27c83e95ae69e10835e01` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 133 |
| `apps/web/src/lib/settings.test.ts` | `db3e1d0e58641947725dd27b3fb3e9c6cee6fada` | `137628961463fc5abd8b7927b2efe6b18a0a206a` | 153 |
| `apps/web/src/lib/settings.uiPrivacy.test.ts` | `d53995d69830845c7b48553bbc5c8adeb483367b` | `137628961463fc5abd8b7927b2efe6b18a0a206a` | 81 |
| `apps/web/src/lib/settingsExchange.test.ts` | `5ce01111b90a7c5b938ba712790f0b7cb7660358` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 190 |
| `apps/web/src/lib/settingsExchange.test.ts` | `6dfda318e1ddcdc0c6d3914f8b37d92001995384` | `137628961463fc5abd8b7927b2efe6b18a0a206a` | 207 |
| `apps/web/src/lib/settingsPrivacy.test.ts` | `03b845702db83998a2b578ebaa593bb1b243f28b` | `137628961463fc5abd8b7927b2efe6b18a0a206a` | 64 |
| `apps/web/src/lib/settingsPrivacy.test.ts` | `549d64d9348fe9638c04454078b08654e23077c1` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 63 |
| `apps/web/src/privacyInvariants.test.ts` | `957cde23e8c602fa096e497851aed8ba96549c1c` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 219 |
| `apps/web/src/privacyInvariants.test.ts` | `f8a67c6d1df7939aad8daf57f36d3a04cfadfca7` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 231 |
| `apps/web/src/state.sweep.test.ts` | `4e70df6a705a56a4f475136fe183b6e00b943e21` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 156 |
| `apps/web/src/test/fakeIndexedDb.ts` | `3424eec28ee24d9fc24f82a61e938b7970bbaa8b` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 98 |
| `apps/web/src/test/keys.ts` | `f4235382a9d5bf11de2dbadd163cb284d38983a6` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 15 |
| `apps/web/src/test/memoryIndexedDb.ts` | `cdec2333fce7a696e75baa58b1b9132338100fe1` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 143 |
| `apps/web/src/test/render.tsx` | `dbd0a6a491b6284a39a7e185847713184a97be88` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 50 |
| `apps/web/src/views/SellerKeys.completion.test.tsx` | `96d79a91967763376e3ccbd472a0111d470be367` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 339 |
| `apps/web/src/views/SellerKeys.i18n.test.tsx` | `a5a93e5a38fbc9026c260bfc41884f5e9573ab81` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 36 |
| `apps/web/src/views/SellerKeys.lock.test.tsx` | `098c626f4c401dfea4ccc342809d4c6571e52f5c` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 65 |
| `apps/web/src/views/SellerKeys.recovery.test.tsx` | `dfaeaf232a511786fada7ca13abad49a5d067116` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 172 |
| `apps/web/src/views/SellerKeys.stealthExport.test.tsx` | `7231bb425a0d7132ca0dc6107ba74ddf12fe71ff` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 113 |
| `apps/web/src/views/SellerKeys.storage.test.tsx` | `4a2aaaa6e9cca4e98481313b1afa0bb211d624eb` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 129 |
| `apps/web/src/views/SellerKeys.test.tsx` | `3a51679880d33e69390b0ceafd8e4c48c6b6e81d` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 942 |
| `apps/web/src/views/SellerPairing.test.tsx` | `e827e5f02f1762724dbbdec0d1cd832485f941a9` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 260 |
| `apps/web/src/views/Settings.clipboardPrivacy.test.tsx` | `e27f09ebd02b61b69bfb9f72d78d68bdf3598a58` | `137628961463fc5abd8b7927b2efe6b18a0a206a` | 79 |
| `apps/web/src/views/Settings.exchange.test.tsx` | `6094ae5931e43d72b3fad9ade002275afaace426` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 254 |
| `apps/web/src/views/Settings.exchange.test.tsx` | `bc1344d8bc56fba59d9f126646cf9505973f0601` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 253 |
| `apps/web/src/views/Settings.race.test.tsx` | `5cc29989d5952ec0f60cbe8f7a82f9c307b73b1c` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 50 |
| `apps/web/src/views/Settings.scanPrivacy.test.tsx` | `c3ca70c56ae0bae2e313b40d5c3f268abd30e343` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 61 |
| `apps/web/src/views/Settings.test.tsx` | `7bf77779c2128ca6782f79fce0cf0600e2419360` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | 436 |
| `apps/web/src/views/Settings.test.tsx` | `f898ade764504ab8aee0024194afed15f35f92fb` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | 238 |

## Authoritative machine-readable ledger

`/workspace/scratch/e449ed9154f6/review-custody-vault-round2.json` contains reviewed ranges, methods, exact commits, observations, and unread entries. Merge by `(path, blob)` with the browser/core predecessor ledgers; do not sum duplicate records across workers.
