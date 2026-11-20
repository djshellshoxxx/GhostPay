> Historical lane record. The final [catalogue](../FINDINGS.md), [branch matrix](../branch-applicability.md), [quality review](../findings-quality-review.md) and [unified coverage](../coverage.json) supersede earlier provisional status, pending queues and branch-wide wording below. UTC worker dates may fall on November 20; the user-facing audit date is November 19, 2026 (America/Los_Angeles).

# GhostPay custody, export and privacy review — handoff

Read-only static defensive review. This is the completed custody/export portion and an exact continuation handoff, not a whole-repository completion statement. No application, test or configuration files changed. No tests, fuzzers, exploit reproducers or live target interactions ran.

## Immutable revisions

- **main**: `c977b5d6723f6822c3b5d86cd6b231712c53c395`
- **release**: `417f7c71daf8645e1432f2ec8f070110879b80bd`
- **completion**: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`
- **quick_hide**: `137628961463fc5abd8b7927b2efe6b18a0a206a`
- **clipboard**: `6c648770f5647ca7993cc108ef9e5ede9b46b4c9`
- **clipboard_qualification**: `04910f65dc0268e41519c4b1a44e83264272f0bf`
- **privacy_snapshot**: `d6819796a9542acc488b896786faffe83b913d9b`

## Coverage

{"paths": 292, "path_blob_rows": 353, "by_status": {"reviewed": 90, "pending": 230, "partial": 3, "excluded": 30}, "reviewed_production": 43, "reviewed_tests": 47}

The machine ledger records every candidate path/blob and refs sharing it. Reviewed means a full source/body read or a fully read base plus complete delta. Partial ranges stay explicit; inventoried test files are not treated as read. Pending package modules still require core dependency classification. Two parallel owners may have independently completed rows; merge their ledger before global counting.

Custody/session/key-vault lifecycle, SellerKeys, all StealthExport components and codecs, and their selected tests are complete. AppShell selected variants, quick-hide/clipboard helpers and privacy tests were read. SecretBackup and BackupPanel supplemental tests are now also fully read. Remaining scanning, settings, transport and reconciliation production/tests are listed below and in custody_privacy_remaining.json.

## CUSTODY-01 — Main idle lock retains ordinary seller-key authority when the sole copy must be kept

**Severity:** medium. **Status:** main-only; corrected in release/completion and latest selected privacy candidates.

**Conditions:** Loaded main-branch seller keys reach inactivity timeout while there is no verified recoverable copy. Ordinary authority is also not revoked while the asynchronous custody check waits.

**Impact:** Tag vault and view inputs lock, but ordinary secret APIs can still use the retained seller keys. The retained state therefore lacks the authority suspension now provided by latest code. No live compromise or runtime reproduction is claimed.

### Source evidence

- `c977b5d6723f6822c3b5d86cd6b231712c53c395` — `apps/web/src/AppShell.tsx:145-168`: No-recoverable-copy branch returns without revoking seller authority.
- `c977b5d6723f6822c3b5d86cd6b231712c53c395` — `apps/web/src/lib/session.ts:312-348`: Secret access checks only current keys; version guard has no expiry/suspension check.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `apps/web/src/AppShell.tsx:257-272`: suspendSession at 263 precedes asynchronous custody.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `apps/web/src/lib/session.ts:383-451`: Latest ordinary access rejects suspension; separate backup-only guard.

**Remediation:** Backport latest synchronous suspension, expiry checks and stale async guard invalidation before treating main idle timeout as an authority lock. Keep sole-copy recovery narrow.

**Safe acceptance criterion:** Safe lifecycle tests show ordinary signing/scanning/raw export and old guards reject immediately at expiry despite unresolved custody storage; encrypted recovery remains available.

## CUSTODY-02 — Out-of-range archived receipt issue time can fail history rendering

**Severity:** low. **Status:** still current in main and all selected recent snapshots.

**Conditions:** An authenticated same-seller/same-chain reconciliation archive contains a positive safe-integer issuedAt in seconds outside JavaScript Date range.

**Impact:** Import accepts the value and history calls unguarded toISOString, which can throw RangeError and interrupt that UI. No fund impact or stored-byte corruption established; this is not an unauthenticated network path.

### Source evidence

- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `packages/invoice-schema/src/receipts.ts:90-95`: issuedAt at line93 is positive safe integer only.
- `c977b5d6723f6822c3b5d86cd6b231712c53c395` — `packages/invoice-schema/src/receipts.ts:86-94`: Same missing bound at line90.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `packages/ux-vault/src/reconciliation-portable.ts:527-542`: Import bounds archivedAt only, not issuedAt.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `packages/ux-vault/src/reconciliation-portable.ts:1045-1083`: Preview/activation use document validator without another issue-time bound.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `apps/web/src/components/ReconciliationLedger.tsx:751-757`: Date(receipt.issuedAt*1000).toISOString at757.

**Remediation:** Bound issuedAt at schema/import to representable seconds, and safely render existing incompatible records without throwing or discarding valid unrelated records. A Date-converted positive value may not exceed 8,640,000,000,000 seconds.

**Safe acceptance criterion:** Valid boundary timestamps display; invalid values are refused before commit or safely represented from old storage. History does not throw and valid records remain available.

**Deduplication:** Payment reviewer first identified renderer; custody confirmed import chain. Publish once.

## CUSTODY-S1 — Older supplemental backup cleanup can erase newer unrelated clipboard content

**Severity:** low. **Status:** full-profile supplemental helper; fixed in quick-hide/privacy snapshot, still present in main/release/completion/clipboard-only heads.

**Conditions:** After backup copy, another application/page replaces clipboard before Hide/Lock/unmount or a delayed retry.

**Impact:** App-local generation alone does not establish current clipboard ownership; unconditional empty write removes newer unrelated content.

### Source evidence

- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `apps/web/src/components/SecretBackup.tsx:24-65`: Retry and cleanup use unconditional writeText at59.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `apps/web/src/components/SecretBackup.tsx:68-72`: Global lock retries after originating view is gone.
- `137628961463fc5abd8b7927b2efe6b18a0a206a` — `apps/web/src/lib/clipboardPrivacy.ts:48-77`: Current helper stores digest and requires matching reads plus ownership; denied reads do not clear.

**Remediation:** Backport conditional clearing where the supplemental helper remains supported. Preserve unrelated content on changed/denied reads.

**Safe acceptance criterion:** Safe mocked-clipboard tests verify changed content and denied reads never cause clearing writes. External OS read/write races remain best effort.

**Scope qualification:** SecretBackup serves preserved Bitcoin/Solana/TRON test wallets outside core lean mode; explicitly assigned shared helper, not a core release blocker by itself.

## CUSTODY-N1 — Backup-only idle retention deliberately preserves recovery without a prior credential for a sole copy

**Severity:** informational. **Status:** current documented design tradeoff; not an additional ordinary-session bypass.

**Conditions:** Retained sole-copy keys have no verified recoverable copy or existing tied encrypted-vault credential.

**Impact:** Encrypted backup/save remains available with a newly chosen backup passphrase. This protects recoverability but is not full confidentiality against someone controlling the already-open tab. Ordinary signing/scanning/raw/payment export are separately revoked.

### Source evidence

- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `apps/web/src/lib/session.ts:442-451`: Deliberate backup-only retained-holder guard.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `apps/web/src/lib/keyVault.ts:260-271`: Existing-vault proof only required when record exists.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `apps/web/src/views/SellerKeys.tsx:208-227,564-577`: Encrypted recovery flow remains available.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` — `apps/web/src/lib/session.idleLock.test.ts:247-309`: Explicitly permits recovery and rejects ordinary/raw/payment exports.

**Remediation:** Use precise retained-recovery language. If full unattended-tab confidentiality is required, establish a wrapping credential before sole-copy payment use or require completed backup. Do not destroy the sole copy to achieve a lock label.

**Safe acceptance criterion:** UI accurately discloses retained recovery, ordinary authority remains revoked, and ordinary reuse requires defined import/unlock.

## Controls and non-findings

Reviewed controls include strict bounded encrypted-keystore/export parsing; metadata authenticated with ciphertext; wallet/key identity checks; pre-KDF size/cost bounds; temporary key wiping and cancellation; exact-wallet credential proof for secret export; atomic vault save/delete behavior; stale-result guards; backup download verification; and synchronous latest idle authority suspension. Static source review is not a cryptographic proof or a runtime test result.

Quick-hide is visual presentation only, with reveal expiry and visibility/session revocation. Clipboard cleanup is best effort; its read/write API cannot guarantee atomicity against unrelated OS writes. The latest helper checks a digest and copy ownership rather than retaining copied text.

The TagVault late-return candidate was not confirmed: mounted AppShell completion lines195-200 subscribes to session changes and synchronously locks the vault; idle also locks before awaiting custody. Missing receipt signature revalidation inside an authenticated archive was considered but not asserted as a vulnerability; this boundary does not turn imported notes into payment evidence.

## Fresh-worker instructions

Read AGENTS.md, docs/ai/WORKFLOW.md and HANDOFF.md, then this JSON ledger. Use explicit bash/login=false and immutable git show reads; never switch the shared checkout. Preserve exact SHA/blob continuity. Root will merge notes into the repository.

- state.tsx, Settings/settings/settingsExchange
- networkAuthorization/networkOperation/networkSelection, browser net-transport closure
- Scan/scanClient/scanPrivacy/scannerCore/scanner.worker/privateScan/persistence/cursors/spam
- reconciliation vault/ledger and portable reconciliation/amounts/tag-archive codecs
- hygiene DestLedger/fundingGuard and metadata-hardening padBody used closures
- remaining security-relevant test bodies; classify unused modules explicitly

Also inspect the two storage harness scripts: `apps/web/scripts/test-reconciliation-idb.mjs` and `apps/web/scripts/test-seller-vault-idb.mjs` (not yet included in this source inventory).

**Do not duplicate root work:** defaultServices, buildProfile, deployment, manifest, release, releaseKeys, errors, sanitize, services, workerFactory, displayText, appLock, transactionOutcome, attempt journals, i18n, Home, About, boundedRequest, embedHost, embedProtocol, frameGuard.

**Payment wave2 owns:** tags.ts, tagArchive.ts, TagArchive.tsx, jitter.ts, jitter.test.ts, Common.tsx, WalletAttempts. It confirmed tags/tagArchive/TagArchive production complete but left tag tests and the portable tag-archive codec for the successor.

**Scope correction:** latest sweep imports hygiene and relayerClient imports metadata-hardening. These were incorrectly excluded based on main-only imports; all their rows have been reopened except the fully read metadata export barrel. Follow the used closure and record exclusions. privacy-profiles has no directly observed browser import in the checked four primary heads; verify transitive usage if needed.

### Exact partial ranges

- reconciliation-portable.ts blob78d7b8ec843514d3446b69fa22b84e35b178a694: read350-570,1010-1085; remaining1-349,571-1009,1086-1146.
- ReconciliationLedger.tsx base blobc190e0efeb942fb7bcb91f5e14f9f3e6c3df5d67: read420-480,740-770; remaining1-419,481-739,771-796. Privacy blob07e736bb80b10e16b49e9e09b2aff9d3085a2a82: full delta only; full base incomplete.
- net-transport/browser.ts main17-line barrel read; latest31-line version and used closure pending.

### Remaining path/blob rows

| Path | Blob | Refs | Lines | Status |
|---|---|---|---:|---|
| `apps/web/src/components/ReconciliationLedger.i18n.test.tsx` | `be6fb9d4ffa6db300695d5b25ffc1ffa63de81e6` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 135 | pending |
| `apps/web/src/components/ReconciliationLedger.invoices.test.tsx` | `d3f96ceebe31fa1fde01dc2dfeca427e10df24c7` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 283 | pending |
| `apps/web/src/components/ReconciliationLedger.test.tsx` | `eb5258cc762b0dbc4c7d9191b4fb36888ebda9e0` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 432 | pending |
| `apps/web/src/components/ReconciliationLedger.tsx` | `c190e0efeb942fb7bcb91f5e14f9f3e6c3df5d67` | main, release, completion, clipboard, clipboard_qualification | 796 | partial |
| `apps/web/src/lib/idbStore.test.ts` | `ac35d25819dc2799b011b6e456d9fac05e1ab082` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 109 | pending |
| `apps/web/src/lib/idbStore.ts` | `c6944c59a52a069f1856bb7ecdcfe971d03c593e` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 125 | pending |
| `apps/web/src/lib/reconciliationLedger.test.ts` | `2d0157b553d8b05eb04dd457d9e698a39a3c6dc9` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 224 | pending |
| `apps/web/src/lib/reconciliationLedger.ts` | `d68324f2944fc6ec00cec8ea541020a09f8a23a7` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 84 | pending |
| `apps/web/src/lib/reconciliationMatch.test.ts` | `fcec62d5d4d2ff02e42b428a7e0a4b60c6c11933` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 215 | pending |
| `apps/web/src/lib/reconciliationMatch.testutil.ts` | `e228abfe1c3b48b9d74c51899cd05c4a97f6af26` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 28 | pending |
| `apps/web/src/lib/reconciliationMatch.ts` | `d85d06572fa49df91f09e40ccc5336356415ad29` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 6 | pending |
| `apps/web/src/lib/reconciliationVault.idb.test.ts` | `ada7cdbcd4f16163e15923f15f652dec0fcac7f6` | main | 129 | pending |
| `apps/web/src/lib/reconciliationVault.invoices.test.ts` | `c68a9d26ce94c836079a83dc2694929aa13e8ac9` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 476 | pending |
| `apps/web/src/lib/reconciliationVault.test.ts` | `a587e583e7ae8168a27fcdc7db414d614378290b` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 565 | pending |
| `apps/web/src/lib/reconciliationVault.ts` | `b9be19c98c20fb904d7ca149f2e89af302f00a97` | main | 230 | pending |
| `apps/web/src/lib/scanCheckpointPrivacy.test.ts` | `5a8984f59efedbad9c71eb2aea9e6379d3b55b63` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 137 | pending |
| `apps/web/src/lib/scanClient.test.ts` | `c9f850561062eb011c0d97ca02d95898301fdd2b` | main | 1760 | pending |
| `apps/web/src/lib/scanClient.ts` | `043fb19af6e3ccf88224122185192829eed29c92` | main | 751 | pending |
| `apps/web/src/lib/scanCursorSlot.test.ts` | `f83c257546972347ae3860d15c53c20388aeb7e6` | main | 312 | pending |
| `apps/web/src/lib/scanCursorSlot.ts` | `d33c6f6e4099fb386016289cc8aa560b1380ffa8` | main | 104 | pending |
| `apps/web/src/lib/scanMatches.test.ts` | `2973e6da0371537fa5198bc01998f83fc49bdd40` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 33 | pending |
| `apps/web/src/lib/scanMatches.ts` | `48da43b4c870fc9d3debaf46b00e19951d012ba5` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 47 | pending |
| `apps/web/src/lib/scanPrivacy.clients.test.ts` | `4f549cf25d5f63daacfbc2a39ea993c9f2524a89` | main | 37 | pending |
| `apps/web/src/lib/scanPrivacy.i18n.test.ts` | `931eeb063f1fa6855b95e757472cef69724f5d7d` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 106 | pending |
| `apps/web/src/lib/scanPrivacy.test.ts` | `5905dd39831b3dc42fcfe95e435e22e9af16aa2b` | main | 458 | pending |
| `apps/web/src/lib/scanPrivacy.transport.test.ts` | `f022052311390d7338e38f0c2a548b731ddd3093` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 68 | pending |
| `apps/web/src/lib/scanPrivacy.ts` | `31dd6847ed088206afb7080873a2520c2201c393` | main | 659 | pending |
| `apps/web/src/lib/scanSpam.test.ts` | `762deed547d68f934999994d770369b2ee95c9ad` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 272 | pending |
| `apps/web/src/lib/scanSpam.ts` | `0cf63cb855bb80e1dcf1e2b9f511c8758b124558` | main | 213 | pending |
| `apps/web/src/lib/scanner.worker.ts` | `59c8bcfb1d3227f8ba04ac9b88e4a6ab2f101092` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 15 | pending |
| `apps/web/src/lib/scannerCore.bench.nocov.test.ts` | `907f5f380fd846c46cd4737deb6aeae8878a2bc4` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 54 | pending |
| `apps/web/src/lib/scannerCore.fuzz.test.ts` | `77ce0bd28772235418d9e241b0da84028068035f` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 38 | pending |
| `apps/web/src/lib/scannerCore.spam.nocov.test.ts` | `671e4041953379c58270388eebb201fcec2dd541` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 194 | pending |
| `apps/web/src/lib/scannerCore.test.ts` | `902cb6d07492fc8b08131d17b94d7d3fbc70c826` | main | 198 | pending |
| `apps/web/src/lib/scannerCore.ts` | `3d22991c284bc58ef0abe27671785ef768546259` | main | 163 | pending |
| `apps/web/src/lib/settings.test.ts` | `01fe046841dacb451962614ef219f1c7ab122ea8` | main | 92 | pending |
| `apps/web/src/lib/settings.ts` | `24b906e163e6bd314c73f172d95332dce4340233` | main | 158 | pending |
| `apps/web/src/lib/settingsExchange.test.ts` | `5ce01111b90a7c5b938ba712790f0b7cb7660358` | main, release, completion, clipboard, clipboard_qualification | 190 | pending |
| `apps/web/src/lib/settingsExchange.ts` | `8ab2753690b4bb99621278db22c04b25a00791f2` | main | 220 | pending |
| `apps/web/src/lib/tagArchive.fuzz.nocov.test.ts` | `8f899eb8e00a5717dc8d094f1470bf72bc4e14d9` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 36 | pending |
| `apps/web/src/lib/tagArchive.test.ts` | `3f4a4a046f42373a722bcb17130c7bbf459f465d` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 325 | pending |
| `apps/web/src/lib/tagArchive.vectors.test.ts` | `ae49b5a848f8af4b61621b0b2535ff911720f891` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 35 | pending |
| `apps/web/src/lib/tags.test.ts` | `cabeff3806d9ee2a2ed44b4d60679db071e70aec` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 240 | pending |
| `apps/web/src/lib/tagsConcurrency.test.ts` | `1729f7dcc4f9330278a40572c87719babb987268` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 118 | pending |
| `apps/web/src/state.sweep.test.ts` | `4e70df6a705a56a4f475136fe183b6e00b943e21` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 156 | pending |
| `apps/web/src/state.tsx` | `0a8c106cf9f67357a4af5304f652612076d7d3da` | main | 215 | pending |
| `apps/web/src/views/Scan.autoRescan.test.tsx` | `1c52101fd63804fa5e80c540923d89a5606afc8e` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 157 | pending |
| `apps/web/src/views/Scan.i18n.test.tsx` | `2892f973dcb48a6076eb38e768bd43082378becb` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 94 | pending |
| `apps/web/src/views/Scan.privacy.test.tsx` | `5ca8631fb1f25658ae55e122d10e22027c0d5e51` | main | 92 | pending |
| `apps/web/src/views/Scan.test.tsx` | `8b2fcf37b6c7670c20938018a3810265fd777152` | main | 696 | pending |
| `apps/web/src/views/Scan.tsx` | `eed9daf882711659720a577138b3e08554ce9fe9` | main | 656 | pending |
| `apps/web/src/views/ScanPrivacy.i18n.test.tsx` | `bd5571c580d0fbfb882bf15d0e39c97e1ff60231` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 216 | pending |
| `apps/web/src/views/Settings.exchange.test.tsx` | `bc1344d8bc56fba59d9f126646cf9505973f0601` | main | 253 | pending |
| `apps/web/src/views/Settings.race.test.tsx` | `5cc29989d5952ec0f60cbe8f7a82f9c307b73b1c` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 50 | pending |
| `apps/web/src/views/Settings.scanPrivacy.test.tsx` | `c3ca70c56ae0bae2e313b40d5c3f268abd30e343` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 61 | pending |
| `apps/web/src/views/Settings.test.tsx` | `f898ade764504ab8aee0024194afed15f35f92fb` | main | 238 | pending |
| `apps/web/src/views/Settings.tsx` | `05179dfa993616e1cf59f19717a1263d61f6c31e` | main | 500 | pending |
| `packages/hygiene/src/addr.ts` | `367a652dd0aa368a338de5d0d546f33fc20e117a` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 45 | pending |
| `packages/hygiene/src/buffer.test.ts` | `365b99cdf060ade859b188d6b107e1019e59587e` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 173 | pending |
| `packages/hygiene/src/buffer.ts` | `b315a0c8feb0325bf16bd495b764f5c559da4494` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 92 | pending |
| `packages/hygiene/src/consolidation.ts` | `5ab0df2417788351b2178941bf52b533099bdf61` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 37 | pending |
| `packages/hygiene/src/destination.test.ts` | `17428fd39a1abdce421326bb14d4069ccf00c2aa` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 162 | pending |
| `packages/hygiene/src/destination.ts` | `bcf7487353406e81653c8b3e22261bee026d8be9` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 154 | pending |
| `packages/hygiene/src/errors.ts` | `bd65796a7d14831d16aadd57f7009428b5d8bfef` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 31 | pending |
| `packages/hygiene/src/fixtures.testutil.ts` | `bac04217818e4f4d08ec43575a5a2d3c6a983a67` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 62 | pending |
| `packages/hygiene/src/guard.ts` | `f13b8e96965b950268b38f117ec2f2a0e15c9f1b` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 23 | pending |
| `packages/hygiene/src/hop-source.test.ts` | `66fea14996baf0da07c122e69e0dd1114974f31f` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 63 | pending |
| `packages/hygiene/src/hop-source.ts` | `ef87f0b90184425d67bfc99cda05cf51da0e8324` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 59 | pending |
| `packages/hygiene/src/index.ts` | `c8d8141024eead713960d7212a8de4577022d2ce` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 45 | pending |
| `packages/hygiene/src/ledger.test.ts` | `1fdcb829fba6d2c6918d9e2f291620a67f78e5b6` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 174 | pending |
| `packages/hygiene/src/ledger.ts` | `05d7f8eb0cb723266eac7a9a644053e29c2d653c` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 196 | pending |
| `packages/hygiene/src/options.ts` | `1edb3f0571204628340584332a6ca208d2daed91` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 73 | pending |
| `packages/hygiene/src/testnet.ts` | `d20f046b8a61f8882e776e9c020eb49efbcb006a` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 17 | pending |
| `packages/hygiene/src/verify.test.ts` | `d83bdc376af2a492c73c3ad2d8367316cacf7bae` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 414 | pending |
| `packages/hygiene/src/verify.ts` | `7bbcbe44b385053f5308e1cfa380e2655eef95d1` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 309 | pending |
| `packages/metadata-hardening/src/amounts.test.ts` | `ae17376455d96bb084a019f38341bc228d8a7300` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 120 | pending |
| `packages/metadata-hardening/src/amounts.ts` | `518529ac783fc30e071a272c74c9e3c59c787a33` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 91 | pending |
| `packages/metadata-hardening/src/btc.test.ts` | `0329c475d4a46cc623a4ae304ac3a8416dc21fde` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 181 | pending |
| `packages/metadata-hardening/src/btc.ts` | `6f89002a040cd4d35f506a09a42d2d1f50a93982` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 229 | pending |
| `packages/metadata-hardening/src/catalogue.test.ts` | `766bda9e50b69cd8f5d2dac30e80b733c72ddcce` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 91 | pending |
| `packages/metadata-hardening/src/catalogue.ts` | `13514c0dc8152ca028cd495d0c7458a09823ee0d` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 131 | pending |
| `packages/metadata-hardening/src/derive.test.ts` | `945a62819e56904d6e7f30992fb393af57272aa5` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 118 | pending |
| `packages/metadata-hardening/src/derive.ts` | `23a84a35b492088d687657434ca98960368321c1` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 187 | pending |
| `packages/metadata-hardening/src/direct.test.ts` | `6b9b2456f54576890ea7ab77b95020dfc7fbf96c` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 66 | pending |
| `packages/metadata-hardening/src/direct.ts` | `12c49780ec6ae8cfb0e1701328ad1b24e2fc221f` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 97 | pending |
| `packages/metadata-hardening/src/gas.ts` | `3007b52461b0066bf501ebb4d3d26cb464669ba5` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 46 | pending |
| `packages/metadata-hardening/src/guard.ts` | `64f2e1046aacfcda72f28c3288f55b3f2e15547d` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 147 | pending |
| `packages/metadata-hardening/src/invoice.test.ts` | `69f68168e7cf0ab278d953b23ede5959cf276152` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 82 | pending |
| `packages/metadata-hardening/src/invoice.ts` | `3bb832739b6ca5e96de8d7b0042f3aa2d43d1bd2` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 97 | pending |
| `packages/metadata-hardening/src/release.test.ts` | `6f9e91a5b3d54929b750d1cdc05dee14b5a63fd9` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 165 | pending |
| `packages/metadata-hardening/src/release.ts` | `6faa694b2d6c4f21880b1d3097e871fbe00fc2ba` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 180 | pending |
| `packages/metadata-hardening/src/scan.test.ts` | `0c5ea5e7d4b2a9788fe0a2b83fff7dc1d962e70d` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 101 | pending |
| `packages/metadata-hardening/src/scan.ts` | `7d5b5cf8d50d6408b6b6e8f5012c401533cb47ae` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 179 | pending |
| `packages/metadata-hardening/src/tags.test.ts` | `40f348e7fe6d367093811ee5807f592187fd52a7` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 85 | pending |
| `packages/metadata-hardening/src/tags.ts` | `449fd1b23134e28a276aee3b0cd623a8e4ea995e` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 159 | pending |
| `packages/metadata-hardening/src/testutil.testutil.ts` | `02511269b2c6d51f0f4205013c74c82b68e17adb` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 32 | pending |
| `packages/metadata-hardening/src/web.test.ts` | `7ca4869d8fbad003efe79edff5f7e2340a137a1d` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 76 | pending |
| `packages/metadata-hardening/src/web.ts` | `5f5f856cf51541fb2935a883c77ed2197e390604` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 116 | pending |
| `packages/net-transport/src/bhttp.ts` | `3b5365b89c55cbad54dd550b40a168e5f2708709` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 183 | pending |
| `packages/net-transport/src/browser.test.ts` | `7c26ee3fbff011a3c46b99274a7a90eade242964` | main | 43 | pending |
| `packages/net-transport/src/claims.ts` | `7d691700c884e376d65a66ef9d44ad2da447ecbb` | main | 161 | pending |
| `packages/net-transport/src/core.test.ts` | `9e74331f2b5dedc328e36af9687fe87ae2dc0336` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 523 | pending |
| `packages/net-transport/src/credentials.ts` | `62717fdb082420fd7a47ad3725e01170b3d0f7e1` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 84 | pending |
| `packages/net-transport/src/errors.ts` | `476785444bf2521c7303961d96ab98a50a6a4a70` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 42 | pending |
| `packages/net-transport/src/fakeHpke.testutil.ts` | `6d5573edf042784ebd0ed23fb3e23084bd1a2c46` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 93 | pending |
| `packages/net-transport/src/fetchAdapter.isolation.test.ts` | `7eb5b48dc17d030b6b0e8a2d456ad3ea9bc331a3` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 71 | pending |
| `packages/net-transport/src/fetchAdapter.ts` | `977ace28e04bc6dca12fb67d1b3275ae72f9a700` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 56 | pending |
| `packages/net-transport/src/fetchIsolation.test.ts` | `e46041cb959fd6148e557174cb90c719ed00e8e1` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 217 | pending |
| `packages/net-transport/src/fetchTransport.ts` | `3c4f105bcdacb3c10f3b40063328d4bfb1d590b8` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 133 | pending |
| `packages/net-transport/src/guard.ts` | `bc153b65a4fb8fca9edbf19bc4de725fddb9a117` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 32 | pending |
| `packages/net-transport/src/httpConnect.ts` | `efeba6d6c2faf23ec47fb0bddaeb0e7f9be22c8b` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 52 | pending |
| `packages/net-transport/src/index.ts` | `46f16980dc831e930cc83ca21fef4a4524d1f816` | main | 77 | pending |
| `packages/net-transport/src/ohttp.test.ts` | `b32eee2a7adf9b84b9c4b5c0bf11f3fb739705d8` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 378 | pending |
| `packages/net-transport/src/ohttp.ts` | `bf0b5dde6738bd4ee8b612e1cad1c4de31000a92` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 375 | pending |
| `packages/net-transport/src/onion.ts` | `4e93261f46b209b3264e8bebbc83c9a0087eee8e` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 88 | pending |
| `packages/net-transport/src/profile.ts` | `7fca676d1261e2a6b1ef99599bbc6406bae11c7e` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 60 | pending |
| `packages/net-transport/src/profiles.ts` | `1549e1d6ce45263576f1aef5c3fbe699258dd64c` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 578 | pending |
| `packages/net-transport/src/proxyUrl.ts` | `72b6a598b178cc8d355a6e20216890065e05d68d` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 89 | pending |
| `packages/net-transport/src/request.ts` | `dc219d33362d36a2a596e6d028fdb413777034f3` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 159 | pending |
| `packages/net-transport/src/settings.ts` | `8348f3cfe1f7af811c2b212169cf4629243cd544` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 169 | pending |
| `packages/net-transport/src/socketReader.ts` | `9f9eb6471472fbaec5be4ebae366d599bdd6fe3f` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 108 | pending |
| `packages/net-transport/src/socks.test.ts` | `780601901ded5ec3ef99b42db9ebc383a2178317` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 674 | pending |
| `packages/net-transport/src/socks5.ts` | `93549b383f9733d1b1e360f5a31614984985a815` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 166 | pending |
| `packages/net-transport/src/url.ts` | `69aeeea72a8f507bee4bc1d26b3114a8efef2a43` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 47 | pending |
| `packages/scan-source/src/claims.ts` | `9e921b5e15654ca19291513040b07ca50e02b98b` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 72 | pending |
| `packages/scan-source/src/composite.test.ts` | `9246734a198f12adf9512da541dd247d13d3c08a` | main | 145 | pending |
| `packages/scan-source/src/create.ts` | `6e39bd1b5f06a0d04a7a1593dc28cf846d0ba9c5` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 36 | pending |
| `packages/scan-source/src/errors.ts` | `ab1128c4ec74b06dc1177d759f691685510e9490` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 35 | pending |
| `packages/scan-source/src/guard.ts` | `0b10a14f704fc40b1ca212169a5fad0aa2bac2cc` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 16 | pending |
| `packages/scan-source/src/index.ts` | `cf649d20aafbd4f88e23db1a3d3e43b70c5ad78d` | main | 33 | pending |
| `packages/scan-source/src/indexer.test.ts` | `b4776a2a734b91fe83112cea38be58886761260a` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 109 | pending |
| `packages/scan-source/src/indexer.ts` | `c4f85a42d17c6661792cf45f10aff391074823a3` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 157 | pending |
| `packages/scan-source/src/light.ts` | `23fda11871aaeddaf27bb0648456f8bc06cf5ddf` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 46 | pending |
| `packages/scan-source/src/pir2.test.ts` | `2f1740ea8289dfafa08a7614114eb2880c033570` | main | 113 | pending |
| `packages/scan-source/src/pir2.ts` | `53964c79fbe9b8f80eb6bfbee0224fa6e2d9f764` | main | 103 | pending |
| `packages/scan-source/src/quorum.ts` | `460c15891229418a56b3e9ee712ecab351f36f3a` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 46 | pending |
| `packages/scan-source/src/range.test.ts` | `357c9d96c636c4df4d2698c1c2d34fcec4ec8bfd` | main | 100 | pending |
| `packages/scan-source/src/range.ts` | `e19a64da351e6ab0b18957af280595eb48777510` | main | 79 | pending |
| `packages/scan-source/src/testutil.ts` | `80abc5dffb35c837bb0d3ee6e793636d56bfedeb` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 133 | pending |
| `packages/scan-source/src/types.ts` | `8f7e359a3b7b5c9783657f68fc25da7d57714c06` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 104 | pending |
| `packages/scan-source/src/validate.test.ts` | `84500028971740c8d42580be599aad4fc49e797e` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 60 | pending |
| `packages/scan-source/src/validate.ts` | `1c3b1b76495868a0b4f7d2df4e4fa7b48e05ab5d` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 95 | pending |
| `packages/scan-source/src/window.test.ts` | `49244a63e4c0fc16793f6e429940fc153be37267` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 41 | pending |
| `packages/scan-source/src/window.ts` | `f9819ad9d5b3cc3deba7cf439252d01335751827` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 23 | pending |
| `packages/ux-vault/src/confusables.test.ts` | `0825066436d44673e7c881de6c6e74014da9a74e` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 155 | pending |
| `packages/ux-vault/src/contacts.test.ts` | `15462e18c59b6351ff222e80999d5e96d080b7c1` | main | 224 | pending |
| `packages/ux-vault/src/envelope.test.ts` | `8608ab75206841194d26a5c58ee67f66b2f58ae8` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 187 | pending |
| `packages/ux-vault/src/memory.testutil.ts` | `b796c38449ab06baedb79011bfaeeedc9ad774dc` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 43 | pending |
| `packages/ux-vault/src/portable-parity.test.ts` | `e33114ecaa8a4eea7b6e0cf5632fdcd2453247ef` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 45 | pending |
| `packages/ux-vault/src/reconciliation-amounts.test.ts` | `45c7063b70a10720885eec7583b002d18ab05bba` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 145 | pending |
| `packages/ux-vault/src/reconciliation-amounts.ts` | `a1fd812a9b40d2c11dd1b551013062bc6eace5d4` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 90 | pending |
| `packages/ux-vault/src/reconciliation-portable.ts` | `78d7b8ec843514d3446b69fa22b84e35b178a694` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 1146 | partial |
| `packages/ux-vault/src/schema.test.ts` | `7c1e3b90b90c9e9254b1755568457b870513594d` | main | 280 | pending |
| `packages/ux-vault/src/tag-archive-portable.ts` | `c6ff5f13cfc286921cd06f7aa036579747dd943e` | main, release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 254 | pending |
| `packages/ux-vault/src/vault.test.ts` | `196fa33df5e2ee5ca910fd05ea88a075300f1c28` | main | 364 | pending |
| `apps/web/src/lib/networkAuthorization.adapters.test.ts` | `6a27d3bd41b8508001539a914eabbf0c7f138ae4` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 93 | pending |
| `apps/web/src/lib/networkAuthorization.profileConsistency.test.ts` | `f1a38a5bd5264cede57e98b1c0cb883f8bc335d6` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 44 | pending |
| `apps/web/src/lib/networkAuthorization.test.ts` | `4fda284ea68de5ddbf68b5608d0a06491875153d` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 482 | pending |
| `apps/web/src/lib/networkAuthorization.ts` | `04defade63f86886f12a6299f19f46a2e562b680` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 500 | pending |
| `apps/web/src/lib/networkOperation.test.ts` | `bb02e38582b7b3cdf9bf638be6bd52c2129114a6` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 64 | pending |
| `apps/web/src/lib/networkOperation.ts` | `e0cae13f36927b031b74ab2d98c1233f015a95db` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 23 | pending |
| `apps/web/src/lib/networkSelection.ts` | `cd5803357898b84863f7885c9fb827b28ff2693a` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 42 | pending |
| `apps/web/src/lib/paymentExportRpc.test.ts` | `8aadf1028cfcc92e1eb42371f6dcbe17c2085719` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 165 | pending |
| `apps/web/src/lib/privateScanLifecycle.test.ts` | `8d8f2e22bdff1be59721a9ce1a7b8ad29eaeb4ad` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 190 | pending |
| `apps/web/src/lib/privateScanLifecycle.ts` | `4a8b9e954c6f11be7438b0d6b7a14519e4ff3c63` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 99 | pending |
| `apps/web/src/lib/privateScanPerformance.nocov.test.ts` | `548916051671c2645c584d5e459a583405db65cf` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 260 | pending |
| `apps/web/src/lib/privateScanStore.test.ts` | `c39c51ef15e04127ea434ed6cbb98791c7eb851d` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 304 | pending |
| `apps/web/src/lib/privateScanStore.ts` | `7d0651782bdd49927bf40630035fa8e717ea6afd` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 365 | pending |
| `apps/web/src/lib/reconciliationVault.idb.test.ts` | `4c52b6fe0c7224ef4812ab6d31a07b401d721862` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 200 | pending |
| `apps/web/src/lib/reconciliationVault.ts` | `f71adf00f68e3ad64e612f66ff57d9f89bceab93` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 252 | pending |
| `apps/web/src/lib/scanClient.test.ts` | `297c6f0cbf22e8e351f42579c05dc4c79bdb6cc5` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 1995 | pending |
| `apps/web/src/lib/scanClient.ts` | `3b5fe3c1a8aafa1c270930b567fd06e2086d7b11` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 871 | pending |
| `apps/web/src/lib/scanCursorSlot.test.ts` | `3565f11dd4ef6cee70789fa26c9da22e4230a03d` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 404 | pending |
| `apps/web/src/lib/scanCursorSlot.ts` | `4997190d33dceca56b2a9ec4f24238fec44ce0dd` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 110 | pending |
| `apps/web/src/lib/scanPrivacy.authorization.test.ts` | `7cdb7bf627b2624005f1ba8e3d0ee8bc12e6df3c` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 94 | pending |
| `apps/web/src/lib/scanPrivacy.bulkEvidence.test.ts` | `5bb3480d1e52945391c83f2be161e5ddef73fe9a` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 24 | pending |
| `apps/web/src/lib/scanPrivacy.clients.test.ts` | `42bc1709a3c13f624a7ce0865d7a08580938e37a` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 85 | pending |
| `apps/web/src/lib/scanPrivacy.scheduler.test.ts` | `6cb3f232ccffe8c453d1c977d0b80c16a483ff0e` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 164 | pending |
| `apps/web/src/lib/scanPrivacy.test.ts` | `604004028b6b804b1f41f8bb62e2de61e892ea6b` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 520 | pending |
| `apps/web/src/lib/scanPrivacy.ts` | `4dae49b9eb15d99fb5ecb34e84b76f6ac0a95c59` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 743 | pending |
| `apps/web/src/lib/scanSpam.partial.test.ts` | `ceeba44eb5156581c4fa9c65b3104109306bff1e` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 37 | pending |
| `apps/web/src/lib/scanSpam.ts` | `da35b619ad1aa7efa8607e0ab9ce8278b585bd61` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 213 | pending |
| `apps/web/src/lib/scannerCore.test.ts` | `64d9d0d95a66da023f2968faa7bd97c7dbe66605` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 256 | pending |
| `apps/web/src/lib/scannerCore.ts` | `3ad466bae0d7d19187260e0696c0d29fb6a71293` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 167 | pending |
| `apps/web/src/lib/settings.loopback.test.ts` | `6bdda45ce1de594800ad1b7377d0206a93cdabdf` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 17 | pending |
| `apps/web/src/lib/settings.test.ts` | `9ba2a5ccb59077ec6ac27c83e95ae69e10835e01` | release, completion, clipboard, clipboard_qualification | 133 | pending |
| `apps/web/src/lib/settings.ts` | `5d73dc4b122d8d418f3f912d3b7008d1a11ef4d4` | release, completion, clipboard, clipboard_qualification | 218 | pending |
| `apps/web/src/lib/settingsExchange.ts` | `e9d632142c41d51b0850ff4d16a7308f3115012a` | release, completion, clipboard, clipboard_qualification | 226 | pending |
| `apps/web/src/lib/settingsPrivacy.test.ts` | `549d64d9348fe9638c04454078b08654e23077c1` | release, completion, clipboard, clipboard_qualification | 63 | pending |
| `apps/web/src/state.tsx` | `68f481926a20ee6d528edea74773047194c434d9` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 226 | pending |
| `apps/web/src/views/Scan.privacy.test.tsx` | `146a90721ae039959af1ce4cd973c572394721f7` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 117 | pending |
| `apps/web/src/views/Scan.privateCheckpoint.test.tsx` | `a704ec91667f26d087cb732e273873a2b8514560` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 440 | pending |
| `apps/web/src/views/Scan.stealthExport.authorization.test.tsx` | `576a2c5ff4bc13b61181d554c7a59135070d1cb9` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 172 | pending |
| `apps/web/src/views/Scan.stealthExport.test.tsx` | `a386af69cb9c30910df93438cb8d589d16229980` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 124 | pending |
| `apps/web/src/views/Scan.test.tsx` | `c25de17f75fcea631452b769aadede99a305f25f` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 703 | pending |
| `apps/web/src/views/Scan.tsx` | `d92f0f2df98b2452a9285c5d4e4687d4096a0834` | release, completion, clipboard, clipboard_qualification | 1035 | pending |
| `apps/web/src/views/Settings.exchange.test.tsx` | `6094ae5931e43d72b3fad9ade002275afaace426` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 254 | pending |
| `apps/web/src/views/Settings.test.tsx` | `7bf77779c2128ca6782f79fce0cf0600e2419360` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 436 | pending |
| `apps/web/src/views/Settings.tsx` | `fb144d734ef2e05825735e01aaeb3243d43085f7` | release, completion, clipboard, clipboard_qualification | 721 | pending |
| `packages/net-transport/src/browser.test.ts` | `5a11e91b46c0cd6fa6697673284affe315c7f380` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 50 | pending |
| `packages/net-transport/src/browser.ts` | `53d2a27c97b13edeee79682ca33ed788bf01903f` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 31 | pending |
| `packages/net-transport/src/claims.ts` | `28dd639c01b126ee64abf6e85c262fceeacecdbe` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 191 | pending |
| `packages/net-transport/src/index.ts` | `c1fd39a536e71b4ee993d3b008627ad943d1898d` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 100 | pending |
| `packages/net-transport/src/selection.test.ts` | `018e3d754211e3f15bf1199b210ebfe7d0c6f6ba` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 75 | pending |
| `packages/net-transport/src/selection.ts` | `5a48aa55720e2b4bb4f66791daf01e630142e921` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 104 | pending |
| `packages/scan-source/src/composite.test.ts` | `4280a956a606315455c39b1b254a13b21aaf004c` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 145 | pending |
| `packages/scan-source/src/index.ts` | `39959ec1f6f60cef0caeb1c789138f9f97bcaa7a` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 35 | pending |
| `packages/scan-source/src/padded.test.ts` | `94a8befe42447d02b44f47fe57ce9ab1120a9102` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 134 | pending |
| `packages/scan-source/src/padded.ts` | `bb3e2371f3831fb28d3ec5c76b9e738f64453689` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 109 | pending |
| `packages/scan-source/src/pir2.test.ts` | `99678e91f2a22a2d0e8ef74dbece3a040a300bde` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 121 | pending |
| `packages/scan-source/src/pir2.ts` | `4d63e1f3c193fc9e7d37c249466e435dbaf55023` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 110 | pending |
| `packages/scan-source/src/range.test.ts` | `37eeeb47f674b5dc6e86569ddefcd7cb56b13eaa` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 142 | pending |
| `packages/scan-source/src/range.ts` | `a95eb11f224eca996191d211ec78681e9790f778` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 90 | pending |
| `packages/ux-vault/src/contacts.test.ts` | `2db7c9fbcc61e6b27a735f19ea658c3911d128a6` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 224 | pending |
| `packages/ux-vault/src/schema.test.ts` | `9cdb54565aa5d3d4140d59ed80689dcc02a0dd36` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 280 | pending |
| `packages/ux-vault/src/vault.test.ts` | `50fd4de340c7f1a090059d2d4652f84d10d4bf0a` | release, completion, quick_hide, clipboard, clipboard_qualification, privacy_snapshot | 364 | pending |
| `apps/web/src/components/ReconciliationLedger.privacy.test.tsx` | `ef369c7623aa6593e5db6c1579ae762d07cd4392` | quick_hide, privacy_snapshot | 79 | pending |
| `apps/web/src/components/ReconciliationLedger.tsx` | `07e736bb80b10e16b49e9e09b2aff9d3085a2a82` | quick_hide, privacy_snapshot | 801 | partial |
| `apps/web/src/lib/settings.test.ts` | `db3e1d0e58641947725dd27b3fb3e9c6cee6fada` | quick_hide, privacy_snapshot | 153 | pending |
| `apps/web/src/lib/settings.ts` | `666aff245eac46a61633b74257bc65c39fb6093e` | quick_hide, privacy_snapshot | 265 | pending |
| `apps/web/src/lib/settings.uiPrivacy.test.ts` | `d53995d69830845c7b48553bbc5c8adeb483367b` | quick_hide, privacy_snapshot | 81 | pending |
| `apps/web/src/lib/settingsExchange.test.ts` | `6dfda318e1ddcdc0c6d3914f8b37d92001995384` | quick_hide, privacy_snapshot | 207 | pending |
| `apps/web/src/lib/settingsExchange.ts` | `94b41f3c5cbd8dd3bc60c4efc8701464f969b690` | quick_hide, privacy_snapshot | 227 | pending |
| `apps/web/src/lib/settingsPrivacy.test.ts` | `03b845702db83998a2b578ebaa593bb1b243f28b` | quick_hide, privacy_snapshot | 64 | pending |
| `apps/web/src/views/Scan.tsx` | `ad2bc9f8ef82de6151b8d769ad468d0761a9026e` | quick_hide, privacy_snapshot | 1036 | pending |
| `apps/web/src/views/Settings.clipboardPrivacy.test.tsx` | `e27f09ebd02b61b69bfb9f72d78d68bdf3598a58` | quick_hide, privacy_snapshot | 79 | pending |
| `apps/web/src/views/Settings.tsx` | `83a8148de6a30fe4e34a287af19d72e2a7dd05fc` | quick_hide, privacy_snapshot | 735 | pending |
