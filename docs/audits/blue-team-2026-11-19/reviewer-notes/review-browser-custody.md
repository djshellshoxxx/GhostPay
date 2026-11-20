> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# Browser custody source audit — production checkpoint and fresh-worker handoff

## Outcome

One confirmed core finding: **BROWSER-01, Medium / high confidence**, introduced by the latest quick-hide/privacy branch (#300). Its `WalletAttempts` component now requires wallet context to expose attempt details and recovery controls, but the core Pay and Registry callers still omit that context. Existing journal records continue to block matching submissions. Main, combined candidate #302 and clipboard-only #297 do not have this new integration regression.

This checkpoint completes the initial lane’s included production source reads. It does **not** complete the associated test-source review or the parent’s broader union of recent branch versions. No runtime tests, vulnerability reproductions, live probes, transactions, source/test/config changes, or Git mutations were performed. Only these audit notes were written.

## Frozen source scope

| Label | Frozen commit |
|---|---|
| main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| candidate | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| quick_hide | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| clipboard | `04910f65dc0268e41519c4b1a44e83264272f0bf` |

Initial inventory: **116 paths and 150 unique path/blob versions**. The companion JSON records the exact commits, full blob hashes, line counts, review methods and covered line ranges. Identical versions across commits share one record. Complete-source-plus-exact-diff reviews are marked as such; they are not represented as independent full-source reads.

| Coverage measure | Count |
|---|---|
| Initial-inventory unique versions read | 61 |
| Included unique versions | 141 |
| Included unique versions read | 59 |
| Included production versions read | 58 |
| Included production versions remaining | 0 |
| Included test/helper versions remaining | 82 |
| Excluded full-profile versions | 9 |

Repository context instructions read: `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, and `docs/HANDOFF.md`. The audit’s read-only task constraints govern this work. The parent restored the repository after a scratch reset; the frozen objects remained unchanged and this ledger was reconstructed from reviewed content.

## BROWSER-01 — wallet-attempt recovery controls are unreachable

**Severity:** Medium (P2). **Confidence:** High. **Status:** new and still present in #300; absent from main/#302/#297. No prior issue identifier established.

### Source evidence

| Exact source | Evidence |
|---|---|
| `137628961463fc5abd8b7927b2efe6b18a0a206a:apps/web/src/components/WalletAttempts.tsx:10–40` | Optional wallet prop gates visible records and the only rendered clear control; omitted prop always yields an empty visible list. |
| `137628961463fc5abd8b7927b2efe6b18a0a206a:apps/web/src/views/Pay.tsx:1055–1059` | Input branch mounts WalletAttempts with no wallet prop. |
| `137628961463fc5abd8b7927b2efe6b18a0a206a:apps/web/src/views/Pay.tsx:1124–1127` | Review branch mounts WalletAttempts with no wallet prop. |
| `137628961463fc5abd8b7927b2efe6b18a0a206a:apps/web/src/features/registry/RegistryView.tsx:269–272` | Registry route mounts WalletAttempts with no wallet prop. |
| `137628961463fc5abd8b7927b2efe6b18a0a206a:apps/web/src/lib/wallet.ts:285–295` | Payment attempt identity uses chain plus invoice scope, not the currently selected account. |
| `137628961463fc5abd8b7927b2efe6b18a0a206a:apps/web/src/lib/wallet.ts:347–372` | beginAttempt executes before the provider submission; the returned hash updates but retains the attempt. |
| `137628961463fc5abd8b7927b2efe6b18a0a206a:apps/web/src/lib/duplicateAttemptJournal.ts:64–87` | An existing same-key record blocks beginAttempt, with no expiry or automatic eviction; explicit clear removes it. |
| `137628961463fc5abd8b7927b2efe6b18a0a206a:apps/web/src/components/WalletAttempts.test.tsx:11–36` | Connected component test manually supplies wallet; omitted-wallet test intentionally hides clear while preserving duplicate protection, leaving route wiring uncovered. |

### Reachable flow and practical impact

Core Pay and Registry mount the component without props. Once the tab journal contains an attempt, the component can display its generic warning but treats wallet as undefined regardless of the actual connection. It never renders the record, returned hash, or confirmed-clear button. A subsequent matching action is rejected by beginAttempt before a new provider submission, and the record does not expire automatically.

Users cannot review or clear unresolved attempt records through the core route UI, so retry/recovery for a matching payment or registry action stays blocked while that record remains in the tab journal. Changing a payment account does not change the invoice-scoped duplicate key. This is a recovery/availability regression; no loss of funds is established.

The journal intentionally retains both unknown and submitted records. It has no automatic expiration, and its duplicate check happens before the wallet provider submission. The latest component’s `wallet === undefined` branch is therefore a functional recovery dead end even when the route has a connected wallet. The independent payments review confirmed this exact source flow.

### Remediation direction and test gap

Pass the current connected wallet context to WalletAttempts at every core caller. Make the integration contract explicit so omitted wallet wiring cannot silently compile. Add route-level coverage for pre-existing attempt review and confirmed clearing across connected, disconnected, account-change and chain-change states, while retaining privacy gating and duplicate-submission protection.

The reviewed #300 component tests manually inject a wallet for the connected case. A separate omitted-wallet case verifies that clear is hidden and duplicate protection remains. Those component-level assertions do not establish that the real Pay or Registry routes pass the needed context. Tests were read only; no result is claimed from execution.

## Reviewed protections and resolved questions

The candidate synchronously suspends ordinary session use at idle expiry before asynchronous custody checks. It invalidates secret guards, wipes tracked asynchronous secret copies and rejects stale results. A retained sole-copy session has a narrow encrypted-backup recovery path. AppShell directs that suspended state to SellerKeys, so CreateInvoice unmounts rather than retaining its old route after lock. These are source-level conclusions, not runtime verification.

Export flows were traced through credential proof, current-session checks, derived-key ownership, request cancellation, download review and saved-file verification. The package reviewer confirmed that SecretBox.copyOf consumes and wipes source bytes by default on successful transfer; this resolved a suspected ownership gap in recovered payment keys. No additional current core defect was established in those reviewed flows.

The quick-hide boundary intentionally preserves mounted state and hides sensitive content visually. It should not be described as erasing the DOM or JavaScript memory. Latest clipboard cleanup reserves copy intent, tracks ownership and compares digests before clearing; external clipboard changes can still race with a browser write, so the behavior remains best effort. No separate new core finding was established from that limitation.

## Exclusions and supporting observation

BackupPanel and its test are full-profile-only and excluded. SecretBackup and its associated tests are also excluded from core completion because no lean route caller was identified; their already completed production reads are retained as supporting evidence. SellerPairing stays included because lean SellerKeys mounts it. ReconciliationLedger stays included because lean Scan mounts it.

**BROWSER-OBS-01 — Low / high confidence; excluded full-profile observation.** On main/candidate, SecretBackup cleanup unconditionally clears the current clipboard, which can erase unrelated content copied after the backup. Candidate evidence: `e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/components/SecretBackup.tsx:34–65`, with the empty write at line 59. This remains in clipboard-only #297. Latest #300 fixes it using copy ownership and digest comparisons: `137628961463fc5abd8b7927b2efe6b18a0a206a:apps/web/src/components/SecretBackup.tsx:40–68` and `137628961463fc5abd8b7927b2efe6b18a0a206a:apps/web/src/lib/clipboardPrivacy.ts:57–77`. It is not counted as a lean/core finding. Associated tests are unread and unrun.

## Completed production coverage

Every included production version below covers its full `1–N` line range. The JSON gives the exact review method for each version. The quick-hide WalletAttempts test is the only test version read in this checkpoint.

| Path | Labels | Blob | Lines |
|---|---|---|---|
| `apps/web/src/App.tsx` | main, candidate, quick_hide, clipboard | `14d318dc3abc774a06e05e33ac03d2a7645afe6e` | 1–28 |
| `apps/web/src/AppLean.tsx` | main, candidate, quick_hide, clipboard | `b9bbdfe053510ba13ef5ebac4488411a04f6770e` | 1–9 |
| `apps/web/src/AppShell.tsx` | main | `22c6d0b76c97584bd7059f830ae6aa8134a4a3a9` | 1–323 |
| `apps/web/src/AppShell.tsx` | candidate, clipboard | `8e2006a8309403f336efda82c1cc6eb6699f04c4` | 1–519 |
| `apps/web/src/AppShell.tsx` | quick_hide | `ae90814b2edb359cf1d72d0a728cfb619870933f` | 1–551 |
| `apps/web/src/components/ClipboardPrivacyControls.tsx` | quick_hide | `b9e3a56bc77a731e4302063dfe07a122ad226340` | 1–31 |
| `apps/web/src/components/ClipboardPrivacySync.tsx` | quick_hide | `f0d0138c6cc30f181110a65d32d317345e52139b` | 1–13 |
| `apps/web/src/components/Common.tsx` | main, candidate | `71b607b3e92f583b6bc784c7ec929567dd6f75da` | 1–135 |
| `apps/web/src/components/Common.tsx` | quick_hide | `acee66019d29abb5844982c6da13d205f5cca440` | 1–142 |
| `apps/web/src/components/Common.tsx` | clipboard | `6d83d05d31ce3812f3ac9faebdea994a491bf188` | 1–137 |
| `apps/web/src/components/PrivacyControls.tsx` | quick_hide | `590b40b5ed2f984870122cbbaff9da47f651d4d6` | 1–29 |
| `apps/web/src/components/PrivacyQuickHide.tsx` | quick_hide | `7e855836d25e8e70ed17430161efd12116794d52` | 1–28 |
| `apps/web/src/components/PrivateHistory.tsx` | quick_hide | `1919f8a37f42fe5994450713c86c8f3fc276fb35` | 1–22 |
| `apps/web/src/components/ReconciliationLedger.tsx` | main, candidate, clipboard | `c190e0efeb942fb7bcb91f5e14f9f3e6c3df5d67` | 1–796 |
| `apps/web/src/components/ReconciliationLedger.tsx` | quick_hide | `07e736bb80b10e16b49e9e09b2aff9d3085a2a82` | 1–801 |
| `apps/web/src/components/SensitiveContent.tsx` | quick_hide | `e4b64ba4f3312c3392e2498ca5c6b306fd0871d5` | 1–31 |
| `apps/web/src/components/StealthExportArchive.tsx` | candidate, quick_hide, clipboard | `b4ba62a90797295349725dbc0e991d83da576826` | 1–128 |
| `apps/web/src/components/StealthExportCommon.tsx` | candidate, quick_hide, clipboard | `4c62a819ba7bccbd6af6698d4a6bed0f039c4e5a` | 1–204 |
| `apps/web/src/components/StealthExportMaster.tsx` | candidate, quick_hide, clipboard | `c703b8a853f9b8613db64d78892bce49484872dc` | 1–92 |
| `apps/web/src/components/StealthExportPayment.tsx` | candidate, quick_hide, clipboard | `8db65de1837b1bf70dff72a4be1e0e30a5d27006` | 1–196 |
| `apps/web/src/components/StealthExportRecovery.tsx` | candidate, quick_hide, clipboard | `fda705e782c147702ebcbac125ddb30ffee94910` | 1–289 |
| `apps/web/src/components/StealthExportVerification.tsx` | candidate, quick_hide, clipboard | `9c01f02e5fe7a0a6f1ff5c9839ca36d0176f20d8` | 1–108 |
| `apps/web/src/components/WalletAttempts.tsx` | main, candidate, clipboard | `70ba12b8ae8d07460266c07f4dbd25e6126bfb80` | 1–34 |
| `apps/web/src/components/WalletAttempts.tsx` | quick_hide | `a9aef3f940bed8f3e26a45ffd75aedea2f0b5563` | 1–42 |
| `apps/web/src/lib/appLock.ts` | main, candidate, quick_hide, clipboard | `918ea520b4867d69dbb575c0c9a14a8e336c5a2e` | 1–30 |
| `apps/web/src/lib/clipboardPrivacy.ts` | quick_hide | `cfb9e13bb3548d48f65b2578a76d2888553a0b35` | 1–92 |
| `apps/web/src/lib/clipboardPrivacy.ts` | clipboard | `5e55f2ca693ef3112e8d12409572b29d96ef86a8` | 1–38 |
| `apps/web/src/lib/executionSettings.ts` | quick_hide | `eb5354fd199e4c7e5edbb89b04742e25946a67f2` | 1–15 |
| `apps/web/src/lib/frameGuard.ts` | candidate, quick_hide, clipboard | `e1f2279c35ca58966f3a4aa270378da48b78ee94` | 1–88 |
| `apps/web/src/lib/idbStore.ts` | main, candidate, quick_hide, clipboard | `c6944c59a52a069f1856bb7ecdcfe971d03c593e` | 1–125 |
| `apps/web/src/lib/keyVault.ts` | main | `46bc24df04ce940d0880199e2f4f0ac522787c43` | 1–381 |
| `apps/web/src/lib/keyVault.ts` | candidate, quick_hide, clipboard | `000be25182a877bbab96cc3b6a0e5ac9038790ca` | 1–428 |
| `apps/web/src/lib/keystore.ts` | main, candidate, quick_hide, clipboard | `5df27bcc439bcde961e0ea191923c89534ea090a` | 1–7 |
| `apps/web/src/lib/paymentExportRpc.ts` | candidate, quick_hide, clipboard | `78a2122759db2b1245b74cd965c4c4f20b539a15` | 1–51 |
| `apps/web/src/lib/paymentKeyExport.ts` | candidate, quick_hide, clipboard | `a2d67e2a7373546574c27c327e5a8beecb9a3bbd` | 1–475 |
| `apps/web/src/lib/privacyMode.tsx` | quick_hide | `1ab179b7a39c6e5c4f54fb114d21e70f83f6effa` | 1–119 |
| `apps/web/src/lib/reconciliationVault.ts` | main | `b9be19c98c20fb904d7ca149f2e89af302f00a97` | 1–230 |
| `apps/web/src/lib/reconciliationVault.ts` | candidate, quick_hide, clipboard | `f71adf00f68e3ad64e612f66ff57d9f89bceab93` | 1–252 |
| `apps/web/src/lib/sellerPairing.ts` | main, candidate, quick_hide, clipboard | `7fd1578738e869f77c06e3822d6dcb17257f9ac1` | 1–23 |
| `apps/web/src/lib/session.ts` | main | `4b5d36e9ed7651d1d6f3e4b63e805b41667e8f0a` | 1–490 |
| `apps/web/src/lib/session.ts` | candidate, quick_hide, clipboard | `9440ec16a0283f70b8fc317f13f98db0de0194e0` | 1–610 |
| `apps/web/src/lib/settings.ts` | main | `24b906e163e6bd314c73f172d95332dce4340233` | 1–158 |
| `apps/web/src/lib/settings.ts` | candidate, clipboard | `5d73dc4b122d8d418f3f912d3b7008d1a11ef4d4` | 1–218 |
| `apps/web/src/lib/settings.ts` | quick_hide | `666aff245eac46a61633b74257bc65c39fb6093e` | 1–265 |
| `apps/web/src/lib/settingsExchange.ts` | main | `8ab2753690b4bb99621278db22c04b25a00791f2` | 1–220 |
| `apps/web/src/lib/settingsExchange.ts` | candidate, clipboard | `e9d632142c41d51b0850ff4d16a7308f3115012a` | 1–226 |
| `apps/web/src/lib/settingsExchange.ts` | quick_hide | `94b41f3c5cbd8dd3bc60c4efc8701464f969b690` | 1–227 |
| `apps/web/src/lib/stealthExport.ts` | candidate, quick_hide, clipboard | `abfaf722906562156ca976ad88b1e84af64b7433` | 1–7 |
| `apps/web/src/main.tsx` | main | `5531434b522b3bf288fefe97545673c3ca8362a6` | 1–19 |
| `apps/web/src/main.tsx` | candidate, quick_hide, clipboard | `290ba486b19ad7a36139b8559130fd6c6b498e1e` | 1–48 |
| `apps/web/src/state.tsx` | main | `0a8c106cf9f67357a4af5304f652612076d7d3da` | 1–215 |
| `apps/web/src/state.tsx` | candidate, quick_hide, clipboard | `68f481926a20ee6d528edea74773047194c434d9` | 1–226 |
| `apps/web/src/views/SellerKeys.tsx` | main | `437c684af1fac0f759607bb3fe4f8e37238a3d89` | 1–649 |
| `apps/web/src/views/SellerKeys.tsx` | candidate, quick_hide, clipboard | `2c17d389ad6d108a68470e075caf98d0a987cd33` | 1–660 |
| `apps/web/src/views/SellerPairing.tsx` | main, candidate, quick_hide, clipboard | `4e325d81f2adb73dc10a1dc0f02522286889db22` | 1–116 |
| `apps/web/src/views/Settings.tsx` | main | `05179dfa993616e1cf59f19717a1263d61f6c31e` | 1–500 |
| `apps/web/src/views/Settings.tsx` | candidate, clipboard | `fb144d734ef2e05825735e01aaeb3243d43085f7` | 1–721 |
| `apps/web/src/views/Settings.tsx` | quick_hide | `83a8148de6a30fe4e34a287af19d72e2a7dd05fc` | 1–735 |

Additional cross-lane evidence reads are tracked separately in JSON and do not inflate the initial inventory count: complete #300 duplicateAttemptJournal; selected Pay, RegistryView and wallet dependency ranges supporting BROWSER-01. Other reviewers own complete coverage of those modules.

## Fresh-worker handoff

The parent requested a fresh successor after context compaction. Start from the exact unread inventory below; do not repeat completed production unless a new blob or unresolved question requires it. Prioritize session/AppShell idle and privacy lifecycle tests, then key-vault/export and clipboard behavior, then the remaining test files and helpers. Read test implementations without executing them.

Parent is constructing the union of unique core path/blob versions across 28 recent source-bearing refs. This agent has not received or reviewed that expanded assignment. Successor must obtain the exact list from parent, then de-duplicate against this ledger by path plus blob; do not infer coverage from commit name.

Portable ux-vault belongs to package lane; parent will assign any remaining portable vault review to successor. This ledger does not claim that package reviewed.

### Included unread test/helper versions

Every entry below is **unread**. Its label maps to the full frozen commit above. All exact commit arrays also appear in JSON.

| Path | Labels | Blob | Lines unread |
|---|---|---|---|
| `apps/web/src/App.test.tsx` | main, candidate, quick_hide, clipboard | `63832b4078d23e3a8e24ba6faf63f1cbe5da9968` | 1–330 |
| `apps/web/src/AppLean.fragment.test.tsx` | main, candidate, quick_hide, clipboard | `f3a0bd09abada7d88f02483ef10d920fc158c038` | 1–170 |
| `apps/web/src/AppLean.test.tsx` | main, candidate, quick_hide, clipboard | `66de30ed6f99258b38f5cbc44e6c8a518eb341aa` | 1–166 |
| `apps/web/src/AppShell.beforeUnload.test.tsx` | candidate, quick_hide, clipboard | `559b539b56213bd83f9ed5cc47c5e0d0e39a4abf` | 1–101 |
| `apps/web/src/AppShell.frameGuard.test.tsx` | candidate, quick_hide, clipboard | `0896c29c5eeb62ed6538870e1d9ef7db4ce01cfb` | 1–83 |
| `apps/web/src/AppShell.i18n.test.tsx` | main, candidate, quick_hide, clipboard | `00f900bf327c8079717230465d5d4654186744c0` | 1–88 |
| `apps/web/src/AppShell.idleClock.test.tsx` | main | `560e879fbf8e457983b9c682157a9da56b786185` | 1–122 |
| `apps/web/src/AppShell.idleClock.test.tsx` | candidate, quick_hide, clipboard | `ba81445f5861a3895a364fb0c357fe09a3842d6e` | 1–429 |
| `apps/web/src/AppShell.network.test.tsx` | candidate, quick_hide, clipboard | `6fed5ee88798d7871d60583e04f0d2552c30e8df` | 1–64 |
| `apps/web/src/AppShell.privacy.test.tsx` | quick_hide | `d7f4b0385712dfc48c7b04412217dacba11c89de` | 1–195 |
| `apps/web/src/AppShell.quickHide.test.tsx` | quick_hide | `e524497cf602d5c08fbd15f11b7b5fd35f9e73a5` | 1–44 |
| `apps/web/src/components/Common.clipboardPrivacy.test.tsx` | quick_hide | `8f4a9246266ee4565a9cbbce32e526f09e27b888` | 1–172 |
| `apps/web/src/components/Common.test.tsx` | main, candidate | `af9c2a77b7d1232b50f8861dd0793c2c0eebc240` | 1–183 |
| `apps/web/src/components/Common.test.tsx` | quick_hide, clipboard | `67a93df29f2df39dbe2f4489959e5e68835e7457` | 1–204 |
| `apps/web/src/components/PrivacyQuickHide.test.tsx` | quick_hide | `abc4394869cf13217141dcf64d98d8edefb5dabd` | 1–120 |
| `apps/web/src/components/ReconciliationLedger.i18n.test.tsx` | main, candidate, quick_hide, clipboard | `be6fb9d4ffa6db300695d5b25ffc1ffa63de81e6` | 1–135 |
| `apps/web/src/components/ReconciliationLedger.invoices.test.tsx` | main, candidate, quick_hide, clipboard | `d3f96ceebe31fa1fde01dc2dfeca427e10df24c7` | 1–283 |
| `apps/web/src/components/ReconciliationLedger.privacy.test.tsx` | quick_hide | `ef369c7623aa6593e5db6c1579ae762d07cd4392` | 1–79 |
| `apps/web/src/components/ReconciliationLedger.test.tsx` | main, candidate, quick_hide, clipboard | `eb5258cc762b0dbc4c7d9191b4fb36888ebda9e0` | 1–432 |
| `apps/web/src/components/StealthExportCommon.expiry.test.tsx` | candidate, quick_hide, clipboard | `c4fe7475b40ced0f3c98abb690b36b5351139793` | 1–90 |
| `apps/web/src/components/StealthExportCommon.review.test.tsx` | candidate, quick_hide, clipboard | `1c9f60cee51327f25d7e76407fb03b82058439f7` | 1–70 |
| `apps/web/src/components/StealthExportDownload.test.tsx` | candidate, quick_hide, clipboard | `b575ca653ec342ba75de1c3790172389f5c40781` | 1–61 |
| `apps/web/src/components/StealthExportPayment.test.tsx` | candidate, quick_hide, clipboard | `e862d56370e933cdead752e57a30c6d54e2af000` | 1–311 |
| `apps/web/src/components/StealthExportRecovery.test.tsx` | candidate, quick_hide, clipboard | `916f471c6a9ba26c9a15f7672460896e3c8a240c` | 1–430 |
| `apps/web/src/components/StealthExportSelection.test.tsx` | candidate, quick_hide, clipboard | `01e4b56e692bf638fe7be61ff1149f20fd244077` | 1–92 |
| `apps/web/src/components/StealthExportVerification.test.tsx` | candidate, quick_hide, clipboard | `2a38ab18ac0fb37b53b4f40062695e2c5876addf` | 1–200 |
| `apps/web/src/components/WalletAttempts.test.tsx` | main, candidate, clipboard | `8109cae9dd53a8645ce4c5fcda524b752b95cb6b` | 1–18 |
| `apps/web/src/lib/appLock.test.ts` | main, candidate, quick_hide, clipboard | `906b574c2808aa8104ed568eeb488ade0332c543` | 1–40 |
| `apps/web/src/lib/clipboardPrivacy.test.ts` | quick_hide | `18c81c21dfa680c5498b2f907633cbdca32c09e5` | 1–111 |
| `apps/web/src/lib/clipboardPrivacy.test.ts` | clipboard | `9a3c70863ea0373a6cd9bb6adf9960116cfd4c2d` | 1–111 |
| `apps/web/src/lib/executionSettings.test.ts` | quick_hide | `40d1842efa873544e01ba4bb653b5375c26e424a` | 1–32 |
| `apps/web/src/lib/frameGuard.test.ts` | candidate, quick_hide, clipboard | `e52932be58a380e349f62fe38a34aaad1e150345` | 1–67 |
| `apps/web/src/lib/idbStore.test.ts` | main, candidate, quick_hide, clipboard | `ac35d25819dc2799b011b6e456d9fac05e1ab082` | 1–109 |
| `apps/web/src/lib/keyVault.idb.test.ts` | main, candidate, quick_hide, clipboard | `b15fa874bbf0397b569a7d6fcc2722da44eda0d9` | 1–90 |
| `apps/web/src/lib/keyVault.secretExport.test.ts` | candidate, quick_hide, clipboard | `57f4e70f37c4319e75d0f98af3a48f445e469c06` | 1–132 |
| `apps/web/src/lib/keyVault.test.ts` | main, candidate, quick_hide, clipboard | `af1323436da652d8defe084464f7c252c61c7e26` | 1–404 |
| `apps/web/src/lib/keystore.test.ts` | main, candidate, quick_hide, clipboard | `ff824086da7994ea866e6445abd4402534eb3641` | 1–206 |
| `apps/web/src/lib/paymentExportRpc.test.ts` | candidate, quick_hide, clipboard | `8aadf1028cfcc92e1eb42371f6dcbe17c2085719` | 1–165 |
| `apps/web/src/lib/paymentKeyExport.expiry.test.ts` | candidate, quick_hide, clipboard | `c08d77395d40d3f67b8afa58909b86ea57b992a6` | 1–95 |
| `apps/web/src/lib/paymentKeyExport.test.ts` | candidate, quick_hide, clipboard | `826578ab8904206b22d69f4ea963648f01a5eb38` | 1–405 |
| `apps/web/src/lib/paymentKeyExport.testutil.ts` | candidate, quick_hide, clipboard | `6e3c2bb7232beeee5bc9aeee66dbbaa8e7c3dd0b` | 1–94 |
| `apps/web/src/lib/privacyMode.test.tsx` | quick_hide | `b70402daeada1ead5a91e2c6bf77ba06a61b2bdf` | 1–150 |
| `apps/web/src/lib/reconciliationVault.idb.test.ts` | main | `ada7cdbcd4f16163e15923f15f652dec0fcac7f6` | 1–129 |
| `apps/web/src/lib/reconciliationVault.idb.test.ts` | candidate, quick_hide, clipboard | `4c52b6fe0c7224ef4812ab6d31a07b401d721862` | 1–200 |
| `apps/web/src/lib/reconciliationVault.invoices.test.ts` | main, candidate, quick_hide, clipboard | `c68a9d26ce94c836079a83dc2694929aa13e8ac9` | 1–476 |
| `apps/web/src/lib/reconciliationVault.test.ts` | main, candidate, quick_hide, clipboard | `a587e583e7ae8168a27fcdc7db414d614378290b` | 1–565 |
| `apps/web/src/lib/sellerPairing.test.ts` | main, candidate, quick_hide, clipboard | `59c0ff53bd9e4619adc700cd559ea00886ac7359` | 1–119 |
| `apps/web/src/lib/session.atomicity.test.ts` | candidate, quick_hide, clipboard | `f6cdfc565e943ed52e4c73973cdb4398f0707430` | 1–64 |
| `apps/web/src/lib/session.idleLock.test.ts` | candidate, quick_hide, clipboard | `8ae759c2e2eb6f20df73bb658a5b97fe4f4477fa` | 1–341 |
| `apps/web/src/lib/session.test.ts` | main, candidate, quick_hide, clipboard | `17c93c2e96814428c0ae8ac2155f937fb099ecfa` | 1–343 |
| `apps/web/src/lib/settings.loopback.test.ts` | candidate, quick_hide, clipboard | `6bdda45ce1de594800ad1b7377d0206a93cdabdf` | 1–17 |
| `apps/web/src/lib/settings.test.ts` | main | `01fe046841dacb451962614ef219f1c7ab122ea8` | 1–92 |
| `apps/web/src/lib/settings.test.ts` | candidate, clipboard | `9ba2a5ccb59077ec6ac27c83e95ae69e10835e01` | 1–133 |
| `apps/web/src/lib/settings.test.ts` | quick_hide | `db3e1d0e58641947725dd27b3fb3e9c6cee6fada` | 1–153 |
| `apps/web/src/lib/settings.uiPrivacy.test.ts` | quick_hide | `d53995d69830845c7b48553bbc5c8adeb483367b` | 1–81 |
| `apps/web/src/lib/settingsExchange.test.ts` | main, candidate, clipboard | `5ce01111b90a7c5b938ba712790f0b7cb7660358` | 1–190 |
| `apps/web/src/lib/settingsExchange.test.ts` | quick_hide | `6dfda318e1ddcdc0c6d3914f8b37d92001995384` | 1–207 |
| `apps/web/src/lib/settingsPrivacy.test.ts` | candidate, clipboard | `549d64d9348fe9638c04454078b08654e23077c1` | 1–63 |
| `apps/web/src/lib/settingsPrivacy.test.ts` | quick_hide | `03b845702db83998a2b578ebaa593bb1b243f28b` | 1–64 |
| `apps/web/src/main.test.tsx` | candidate, quick_hide, clipboard | `1e7e06a879996ebbb3dadd077d3bc2063d3c3e15` | 1–85 |
| `apps/web/src/privacyInvariants.test.ts` | main | `957cde23e8c602fa096e497851aed8ba96549c1c` | 1–219 |
| `apps/web/src/privacyInvariants.test.ts` | candidate, quick_hide, clipboard | `f8a67c6d1df7939aad8daf57f36d3a04cfadfca7` | 1–231 |
| `apps/web/src/state.sweep.test.ts` | main, candidate, quick_hide, clipboard | `4e70df6a705a56a4f475136fe183b6e00b943e21` | 1–156 |
| `apps/web/src/test/fakeIndexedDb.ts` | main, candidate, quick_hide, clipboard | `3424eec28ee24d9fc24f82a61e938b7970bbaa8b` | 1–98 |
| `apps/web/src/test/keys.ts` | main, candidate, quick_hide, clipboard | `f4235382a9d5bf11de2dbadd163cb284d38983a6` | 1–15 |
| `apps/web/src/test/memoryIndexedDb.ts` | main, candidate, quick_hide, clipboard | `cdec2333fce7a696e75baa58b1b9132338100fe1` | 1–143 |
| `apps/web/src/test/render.tsx` | main, candidate, quick_hide, clipboard | `dbd0a6a491b6284a39a7e185847713184a97be88` | 1–50 |
| `apps/web/src/views/SellerKeys.completion.test.tsx` | main, candidate, quick_hide, clipboard | `96d79a91967763376e3ccbd472a0111d470be367` | 1–339 |
| `apps/web/src/views/SellerKeys.i18n.test.tsx` | main, candidate, quick_hide, clipboard | `a5a93e5a38fbc9026c260bfc41884f5e9573ab81` | 1–36 |
| `apps/web/src/views/SellerKeys.lock.test.tsx` | main, candidate, quick_hide, clipboard | `098c626f4c401dfea4ccc342809d4c6571e52f5c` | 1–65 |
| `apps/web/src/views/SellerKeys.recovery.test.tsx` | main, candidate, quick_hide, clipboard | `dfaeaf232a511786fada7ca13abad49a5d067116` | 1–172 |
| `apps/web/src/views/SellerKeys.stealthExport.test.tsx` | candidate, quick_hide, clipboard | `7231bb425a0d7132ca0dc6107ba74ddf12fe71ff` | 1–113 |
| `apps/web/src/views/SellerKeys.storage.test.tsx` | main, candidate, quick_hide, clipboard | `4a2aaaa6e9cca4e98481313b1afa0bb211d624eb` | 1–129 |
| `apps/web/src/views/SellerKeys.test.tsx` | main, candidate, quick_hide, clipboard | `3a51679880d33e69390b0ceafd8e4c48c6b6e81d` | 1–942 |
| `apps/web/src/views/SellerPairing.test.tsx` | main, candidate, quick_hide, clipboard | `e827e5f02f1762724dbbdec0d1cd832485f941a9` | 1–260 |
| `apps/web/src/views/Settings.clipboardPrivacy.test.tsx` | quick_hide | `e27f09ebd02b61b69bfb9f72d78d68bdf3598a58` | 1–79 |
| `apps/web/src/views/Settings.exchange.test.tsx` | main | `bc1344d8bc56fba59d9f126646cf9505973f0601` | 1–253 |
| `apps/web/src/views/Settings.exchange.test.tsx` | candidate, quick_hide, clipboard | `6094ae5931e43d72b3fad9ade002275afaace426` | 1–254 |
| `apps/web/src/views/Settings.race.test.tsx` | main, candidate, quick_hide, clipboard | `5cc29989d5952ec0f60cbe8f7a82f9c307b73b1c` | 1–50 |
| `apps/web/src/views/Settings.scanPrivacy.test.tsx` | main, candidate, quick_hide, clipboard | `c3ca70c56ae0bae2e313b40d5c3f268abd30e343` | 1–61 |
| `apps/web/src/views/Settings.test.tsx` | main | `f898ade764504ab8aee0024194afed15f35f92fb` | 1–238 |
| `apps/web/src/views/Settings.test.tsx` | candidate, quick_hide, clipboard | `7bf77779c2128ca6782f79fce0cf0600e2419360` | 1–436 |

### Excluded versions

| Path | Labels | Blob | Review status |
|---|---|---|---|
| `apps/web/src/components/BackupPanel.test.tsx` | main, candidate, quick_hide, clipboard | `c4150f545fcceddf8c5b680ea4f422b05f402bbc` | unread |
| `apps/web/src/components/BackupPanel.tsx` | main, candidate, quick_hide, clipboard | `83f0e937414b1fdd129aa0ff70b5f109e7bb73e9` | unread |
| `apps/web/src/components/SecretBackup.clipboardPrivacy.test.tsx` | quick_hide | `9fd22059746398b5be98884e97b4fb490faf346c` | unread |
| `apps/web/src/components/SecretBackup.test.tsx` | main, candidate, clipboard | `d980357d1c6be7e89806933ddeff77ff3fe371b5` | unread |
| `apps/web/src/components/SecretBackup.test.tsx` | quick_hide | `f16293d89ee542fce28e9bd6fe7782e69d91b2cf` | unread |
| `apps/web/src/components/SecretBackup.tsx` | main, candidate, clipboard | `c86f77de050b838204e3f4222cd796ca6e54337a` | reviewed |
| `apps/web/src/components/SecretBackup.tsx` | quick_hide | `c92bd4951f23325c854cdd8ca37f1ca1aa1a91b6` | reviewed |
| `apps/web/src/components/SecretBackup.views.test.tsx` | main, candidate, clipboard | `7f43ef17516de5a0e334e41a1e64b1e7c7731ff3` | unread |
| `apps/web/src/components/SecretBackup.views.test.tsx` | quick_hide | `a88fa6cd417c4dbf64d90b2884606b33de9bb03f` | unread |

### Stop conditions and next step

Continue only the authorized source audit and note writing. Record each newly read path/blob and actual line coverage immediately. Do not execute tests or application code to reproduce the finding. Before claiming completion beyond these four commits, obtain and finish the parent’s expanded branch-union assignment. Check whether any newly assigned version corrects the WalletAttempts caller contract and update its status with exact source evidence.
