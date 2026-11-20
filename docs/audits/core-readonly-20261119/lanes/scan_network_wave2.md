> Historical lane record. The final [catalogue](../FINDINGS.md), [branch matrix](../branch-applicability.md), [quality review](../findings-quality-review.md) and [unified coverage](../coverage.json) supersede earlier provisional status, pending queues and branch-wide wording below. UTC worker dates may fall on November 20; the user-facing audit date is November 19, 2026 (America/Los_Angeles).

# GhostPay scan, settings, network and reconciliation review — wave 2

## Result and review boundary

The assigned active production source is complete across the selected immutable branch variants. This lane identified **one current Medium issue** in the session-only RPC settings integration and **one Low issue limited to main/older selected heads, corrected in latest**. The receipt-date rendering issue already reported as CUSTODY-02 remains a single inherited finding and is not duplicated.

This is a static defensive source review. No application, test or configuration file was changed. No tests, fuzzers, exploit reproductions, browser sessions, live endpoints, deployments or remote writes were performed. The two IndexedDB browser harnesses were read as source only. Findings describe defensive consequences and repair criteria, without attack instructions.

This lane is not a whole-repository completion assertion. The exact inherited test rows still requiring review or an explicit owner/scope disposition are in `scan_network_wave2_remaining.json`. Root is responsible for reconciling identical blobs and other reviewers' coverage before global completion.

## Immutable revision continuity

The source checkout is `/workspace/scratch/e1ba011306bd/GhostPay-audit`. Every ledger row is keyed by path and Git blob, with the complete immutable head list sharing that blob. The base full-body reads use completion `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; main is `c977b5d6723f6822c3b5d86cd6b231712c53c395`. Release, privacy and other selected branch variants were compared by complete deltas against fully read bodies. All 20 heads come from `selected-heads.json`.

`reviewed` means an actually read complete body, or an actually read complete delta against an already fully read body. File inventory, import search and matching path names are not source-review coverage. `excluded` means outside the selected active browser dependency scope and carries an explicit reason; it is not a claim of safety or a completed source read.

## SCAN-NET-02 — Private scanning drops session-only RPC selections, including a chosen independent secondary provider

**Severity:** Medium for loss of the selected independent secondary cross-check. The missing-primary branch is a separate Low availability aspect and fails visibly and closed. **Status:** current in the selected release/completion/privacy-era heads; main lacks this private-scan path. Root independently confirmed the complete settings-to-scan source chain.

### Conditions and observed behavior

The production services activate the private scan store. A user can select an RPC endpoint in Settings and choose to keep it only for the current tab/session. Settings passes the selected endpoints into application memory, while persistence correctly strips the session-only values. The private Scan view then reconstructs its selected endpoint settings from persistent storage instead of using the complete current-tab settings snapshot.

When the primary endpoint remains usable, the secondary endpoint is session-only, and **`plan.useSecondary === true`**, the missing persisted secondary becomes an empty endpoint. The private scan branch skips opening the secondary and continues with the primary alone. The chosen independent cross-check is therefore absent.

When it is the primary endpoint that is session-only and there is no other applicable configured scan endpoint, `selectedRpc` returns no client. The scan stops with the explicit `scan.error.noRpc` error. This branch does not establish an undisclosed fallback endpoint.

### Source evidence at completion SHA e22c1748a3de6eb02f5be3abe27d634b238c67c6

| Source | Evidence |
|---|---|
| `apps/web/src/views/Settings.tsx:101–109` | Commits per-slot session-only retention choices, then calls `app.updateSettings(next)` with the selected primary/secondary maps. |
| `apps/web/src/AppShell.tsx:421–436` | Preserves the full valid same-tab settings in React memory, then saves the stripped representation. This was a boundary read here; custody/root owns full AppShell coverage. |
| `apps/web/src/lib/settings.ts:195–204` | Removes matching session-only primary and secondary entries before persistence. `loadSettings` reads stored preferences without restoring the module's ephemeral selections. |
| `apps/web/src/lib/defaultServices.ts:116` | Enables `privateScanStore` in production. Root owns full coverage of this file. |
| `apps/web/src/views/Scan.tsx:92–98` | `currentScanSettings` returns the persisted preferences when storage is readable; the passed in-memory fallback is used only without usable storage. |
| `apps/web/src/views/Scan.tsx:166–175` | Private mode uses that persisted settings object for endpoint selection and its configuration digest. |
| `apps/web/src/views/Scan.tsx:434–447` | Missing primary yields no selected client and the explicit no-RPC error. |
| `apps/web/src/views/Scan.tsx:450–467` | With secondary requested, absent persisted secondary skips both client-opening choices in private mode; the scan continues. |

The privacy branch's Scan delta changes reveal revocation, and does not correct this endpoint selection path. The machine ledger lists the exact affected heads and complete source blobs.

### Impact and limits

The established integrity consequence is loss of the user's selected secondary-provider cross-check. Static review did not establish a forged payment, a transfer of funds, an authority bypass, or an exploitable receipt-acceptance result. The primary omission causes a clear availability failure instead. These outcomes should remain distinct in release notes and severity reporting.

### Remediation

Use one validated, current-revision endpoint selection snapshot for private scanning that retains same-tab session-only primary and secondary entries. Continue to strip those entries from persistent storage. Preserve the selected-secondary requirement: if the user requested the secondary, an absent or unusable chosen endpoint must refuse the scan rather than silently change the evidence policy. Retain cross-tab revision revocation so an obsolete in-memory endpoint cannot survive an externally changed selection.

### Safe acceptance criteria

- A same-tab Settings save with a session-only primary remains usable by the production privateScanStore flow, while the URL remains absent from localStorage.
- With a usable persisted primary, a session-only secondary, and `plan.useSecondary === true`, both selected providers are used.
- A requested secondary that cannot be opened blocks the scan with a clear error.
- A stale cross-tab persisted selection still revokes/reloads the operation and does not reuse obsolete session-only endpoints.
- The primary-error case stays explicit and does not introduce an endpoint fallback.

## SCAN-NET-01 — Thirty-day privacy-set count can omit its partial-coverage qualifier

**Severity:** Low. **Status:** main and older selected heads only; corrected in selected release/completion/latest code.

At main `c977b5d6723f6822c3b5d86cd6b231712c53c395`, `apps/web/src/lib/scanSpam.ts:170–196` derives the `partial` flag from the seven-day boundary while providing both seven-day and thirty-day counts. A range that covers all seven days but less than thirty days can therefore present its thirty-day count without the lower-bound/partial qualifier. This is a privacy-statistic coverage disclosure error; no spend-authority consequence was established.

The fully read latest delta changes the condition to the thirty-day boundary (`from30`). Retain that correction if backporting or releasing the older line. A safe regression criterion is that any range beginning after the start of the thirty-day window still marks the thirty-day value partial, including ranges that cover the full seven-day window.

The machine ledger lists all older selected heads sharing the main blob. Do not present this as a remaining latest-branch defect.

## Existing finding carried forward without duplication

**CUSTODY-02, Low, current:** an authenticated same-seller/same-chain reconciliation archive can contain a positive safe-integer receipt `issuedAt` outside JavaScript's Date range. The receipt schema and import validator accept it; the history renderer's unguarded `toISOString` can then throw. This lane completed the full reconciliation archive and UI bodies, and confirmed the existing bounded finding rather than creating another one.

Existing anchors: completion `packages/invoice-schema/src/receipts.ts:90–95`; `packages/ux-vault/src/reconciliation-portable.ts:527–542,1045–1083`; `apps/web/src/components/ReconciliationLedger.tsx:751–757`. The invoice schema itself is owned by payment, not this lane. The recommended repair remains a representable-date bound at ingress plus safe rendering for existing incompatible records. No unauthenticated remote ingress or fund consequence is established.

## Production areas completed

The following descriptions are source-review observations, not runtime test results or a cryptographic proof. Exact paths, blobs, sharing heads and review methods appear in the ledger.

| Area | Reviewed boundary and outcome |
|---|---|
| Settings and application state | Full settings/state/settingsExchange and Settings UI bodies, main/latest deltas, and privacy changes. Endpoint validation and persistence were traced into Scan; SCAN-NET-02 is the resulting integration issue. |
| Browser network authorization | Full networkOperation/networkSelection/networkAuthorization and the browser transport closure. Observed per-action endpoint/method/header binding, timeout/byte limits, response checks, request isolation, and revocation on preference/session changes. No additional bypass established. |
| Scan execution | Full Scan UI, scanClient, scanPrivacy, scannerCore/worker, matches, spam and cursor slots. Traced cancellation/current-scope checks, provider comparisons, durable progress and publication. The selected-secondary omission remains the bounded exception above. |
| Private scan persistence | Full privateScanLifecycle/privateScanStore/IndexedDB adapter. Observed authenticated scope binding, randomized encrypted records, exact-ciphertext CAS and tombstone handling. No new persistence finding established. |
| Reconciliation | Full ledger/match/vault, reconciliation UI, portable archive and amount codec. Imported history and live evidence remain distinct; reorg invalidation and import/CAS boundaries were read. CUSTODY-02 is retained once. |
| Portable tag archive | Full browser-portable tag archive codec, including bounded envelope/KDF parsing and authenticated decryption. App tag/tagArchive production is payment-owned. No new codec finding established. |
| Browser dependency closure | Full hygiene DestLedger/fundingGuard dependencies, metadata padBody dependencies, net-transport browser entry and used dependencies, and scan-source indexer/range/padding/validation closure. Unused implementations are explicitly excluded below. |
| Storage harnesses | Full main/latest `test-reconciliation-idb.mjs` and `test-seller-vault-idb.mjs` bodies, including latest recovery cases. No harness was run. |

The earlier predecessor's partial reconciliation-portable, ReconciliationLedger and net-transport browser-barrel reads were closed. There are no partial or pending active production rows in this lane.

## Scope exclusions and ownership boundaries

Production import occurrences were checked across all 20 heads and saved in `scan_network_wave2_import_closure.json`. That evidence supports scope classification; complete source reads are recorded separately.

| Scope rule | Why the implementation is outside the selected browser core |
|---|---|
| HYGIENE_UNUSED | Latest sweep imports only `DestLedger` and `fundingGuard`; their ledger/guard/address/error/testnet dependencies were read. The remaining consolidation, destination, hopping, buffer and verification features are not activated by those calls. |
| METADATA_UNUSED | Latest relayerClient imports only `MetadataHardeningError` and `padBody`; release/guard were read. Other amount/Bitcoin/catalogue/derivation/gas/invoice/tag implementations are not used by that selected flow. web/direct/scan bodies were incidentally fully read, without expanding active scope. |
| NODE_TRANSPORT_UNUSED | Browser runtime imports use `@ghostpay/net-transport/browser`. Its complete barrel excludes Node socket/profile factories, OHTTP/BHTTP and proxy implementations. The root barrel was read only to verify the split. `credentials.ts` appears as a type-only dependency in the selected closure. |
| SCAN_MODES_UNUSED | Browser scanPrivacy calls the indexer and range-padding path; it does not activate PIR2, light, quorum, the general source factory, or their claims. Used range/indexer/validation/padding modules were read. |

Root owns boundedRequest/embedHost/embedProtocol/frameGuard, defaultServices/manifest/release/build and associated tests. Payment owns chain-adapters and tag/jitter production. Custody wave 1 owns key/session/SellerKeys/AppShell/export source and its selected tests. Boundary reads here are not counted as new full-source coverage of those owners' files.

Indexer completeness is explicitly disclosed as unverified in the reviewed source/UI; this review does not turn provider omission within that disclosure into a new hidden-completeness guarantee finding. A possible TagVault late-result concern had already been retired by the mounted AppShell's synchronous session lock. No broader tag-UI lifecycle or suspended-session availability candidate was confirmed here.

## Continuation instructions

The production portion can now be merged into the repository notes. The remaining work is **test-source review and final owner/scope deduplication**. Keep test inventory distinct from completed review.

1. Read the repository instructions and `scan_network_wave2_remaining.json` before starting. Root controls note integration.
2. Coordinate tag/state/paymentExportRpc and ux-vault test overlap with root/payment/custody ledgers. Tests for unused package exports require an explicit scope disposition before further reading.
3. Read complete test bodies, or complete deltas against already fully read test blobs. Do not execute test, property-test or fuzz files; filenames are coverage entries only.
4. Use the immutable SHAs and blobs already recorded, explicit bash `login:false`, and absolute workdir. Do not switch the shared checkout.
5. Preserve current-versus-fixed-head distinctions and the bounded impact of SCAN-NET-02. Deduplicate CUSTODY-02.
6. Save exact remaining path/blob/read-range state before context exhaustion, then hand it to a fresh worker.

The two requested real-IndexedDB script variants are complete and should not be delegated again. The remaining test table below is an inherited candidate list, including overlaps and unused feature tests; it is intentionally not a false claim that every row is active or still unreviewed by every other lane.

## Coverage counts

| Measure | Count |
|---|---:|
| paths | 187 |
| path blob rows | 232 |
| reviewed production | 77 |
| reviewed tests | 4 |
| excluded production | 29 |
| pending test rows | 122 |
| pending production rows | 0 |
| reviewed blob line sum | 18906 |
| pending test blob line sum | 25658 |

Line sums count each distinct path/blob variant in the ledger; they are not unique semantic lines or a claim of runtime execution.

## Explicitly excluded production rows

| Path | Exact blob | Lines | Rule |
|---|---|---:|---|
| `packages/hygiene/src/buffer.ts` | `b315a0c8feb0325bf16bd495b764f5c559da4494` | 92 | HYGIENE_UNUSED |
| `packages/hygiene/src/consolidation.ts` | `5ab0df2417788351b2178941bf52b533099bdf61` | 37 | HYGIENE_UNUSED |
| `packages/hygiene/src/destination.ts` | `bcf7487353406e81653c8b3e22261bee026d8be9` | 154 | HYGIENE_UNUSED |
| `packages/hygiene/src/hop-source.ts` | `ef87f0b90184425d67bfc99cda05cf51da0e8324` | 59 | HYGIENE_UNUSED |
| `packages/hygiene/src/options.ts` | `1edb3f0571204628340584332a6ca208d2daed91` | 73 | HYGIENE_UNUSED |
| `packages/hygiene/src/verify.ts` | `7bbcbe44b385053f5308e1cfa380e2655eef95d1` | 309 | HYGIENE_UNUSED |
| `packages/metadata-hardening/src/amounts.ts` | `518529ac783fc30e071a272c74c9e3c59c787a33` | 91 | METADATA_UNUSED |
| `packages/metadata-hardening/src/btc.ts` | `6f89002a040cd4d35f506a09a42d2d1f50a93982` | 229 | METADATA_UNUSED |
| `packages/metadata-hardening/src/catalogue.ts` | `13514c0dc8152ca028cd495d0c7458a09823ee0d` | 131 | METADATA_UNUSED |
| `packages/metadata-hardening/src/derive.ts` | `23a84a35b492088d687657434ca98960368321c1` | 187 | METADATA_UNUSED |
| `packages/metadata-hardening/src/gas.ts` | `3007b52461b0066bf501ebb4d3d26cb464669ba5` | 46 | METADATA_UNUSED |
| `packages/metadata-hardening/src/invoice.ts` | `3bb832739b6ca5e96de8d7b0042f3aa2d43d1bd2` | 97 | METADATA_UNUSED |
| `packages/metadata-hardening/src/tags.ts` | `449fd1b23134e28a276aee3b0cd623a8e4ea995e` | 159 | METADATA_UNUSED |
| `packages/net-transport/src/bhttp.ts` | `3b5365b89c55cbad54dd550b40a168e5f2708709` | 183 | NODE_TRANSPORT_UNUSED |
| `packages/net-transport/src/credentials.ts` | `62717fdb082420fd7a47ad3725e01170b3d0f7e1` | 84 | NODE_TRANSPORT_UNUSED |
| `packages/net-transport/src/httpConnect.ts` | `efeba6d6c2faf23ec47fb0bddaeb0e7f9be22c8b` | 52 | NODE_TRANSPORT_UNUSED |
| `packages/net-transport/src/ohttp.ts` | `bf0b5dde6738bd4ee8b612e1cad1c4de31000a92` | 375 | NODE_TRANSPORT_UNUSED |
| `packages/net-transport/src/profiles.ts` | `1549e1d6ce45263576f1aef5c3fbe699258dd64c` | 578 | NODE_TRANSPORT_UNUSED |
| `packages/net-transport/src/proxyUrl.ts` | `72b6a598b178cc8d355a6e20216890065e05d68d` | 89 | NODE_TRANSPORT_UNUSED |
| `packages/net-transport/src/request.ts` | `dc219d33362d36a2a596e6d028fdb413777034f3` | 159 | NODE_TRANSPORT_UNUSED |
| `packages/net-transport/src/socketReader.ts` | `9f9eb6471472fbaec5be4ebae366d599bdd6fe3f` | 108 | NODE_TRANSPORT_UNUSED |
| `packages/net-transport/src/socks5.ts` | `93549b383f9733d1b1e360f5a31614984985a815` | 166 | NODE_TRANSPORT_UNUSED |
| `packages/net-transport/src/url.ts` | `69aeeea72a8f507bee4bc1d26b3114a8efef2a43` | 47 | NODE_TRANSPORT_UNUSED |
| `packages/scan-source/src/claims.ts` | `9e921b5e15654ca19291513040b07ca50e02b98b` | 72 | SCAN_MODES_UNUSED |
| `packages/scan-source/src/create.ts` | `6e39bd1b5f06a0d04a7a1593dc28cf846d0ba9c5` | 36 | SCAN_MODES_UNUSED |
| `packages/scan-source/src/light.ts` | `23fda11871aaeddaf27bb0648456f8bc06cf5ddf` | 46 | SCAN_MODES_UNUSED |
| `packages/scan-source/src/pir2.ts` | `53964c79fbe9b8f80eb6bfbee0224fa6e2d9f764` | 103 | SCAN_MODES_UNUSED |
| `packages/scan-source/src/quorum.ts` | `460c15891229418a56b3e9ee712ecab351f36f3a` | 46 | SCAN_MODES_UNUSED |
| `packages/scan-source/src/pir2.ts` | `4d63e1f3c193fc9e7d37c249466e435dbaf55023` | 110 | SCAN_MODES_UNUSED |

## Exact remaining test rows

The JSON continuation file additionally contains every immutable head sharing each blob and owner/scope triage notes.

| Path | Exact blob | Lines |
|---|---|---:|
| `apps/web/src/components/ReconciliationLedger.i18n.test.tsx` | `be6fb9d4ffa6db300695d5b25ffc1ffa63de81e6` | 135 |
| `apps/web/src/components/ReconciliationLedger.invoices.test.tsx` | `d3f96ceebe31fa1fde01dc2dfeca427e10df24c7` | 283 |
| `apps/web/src/components/ReconciliationLedger.test.tsx` | `eb5258cc762b0dbc4c7d9191b4fb36888ebda9e0` | 432 |
| `apps/web/src/lib/idbStore.test.ts` | `ac35d25819dc2799b011b6e456d9fac05e1ab082` | 109 |
| `apps/web/src/lib/reconciliationLedger.test.ts` | `2d0157b553d8b05eb04dd457d9e698a39a3c6dc9` | 224 |
| `apps/web/src/lib/reconciliationMatch.test.ts` | `fcec62d5d4d2ff02e42b428a7e0a4b60c6c11933` | 215 |
| `apps/web/src/lib/reconciliationMatch.testutil.ts` | `e228abfe1c3b48b9d74c51899cd05c4a97f6af26` | 28 |
| `apps/web/src/lib/reconciliationVault.idb.test.ts` | `ada7cdbcd4f16163e15923f15f652dec0fcac7f6` | 129 |
| `apps/web/src/lib/reconciliationVault.invoices.test.ts` | `c68a9d26ce94c836079a83dc2694929aa13e8ac9` | 476 |
| `apps/web/src/lib/reconciliationVault.test.ts` | `a587e583e7ae8168a27fcdc7db414d614378290b` | 565 |
| `apps/web/src/lib/scanCheckpointPrivacy.test.ts` | `5a8984f59efedbad9c71eb2aea9e6379d3b55b63` | 137 |
| `apps/web/src/lib/scanClient.test.ts` | `c9f850561062eb011c0d97ca02d95898301fdd2b` | 1760 |
| `apps/web/src/lib/scanCursorSlot.test.ts` | `f83c257546972347ae3860d15c53c20388aeb7e6` | 312 |
| `apps/web/src/lib/scanMatches.test.ts` | `2973e6da0371537fa5198bc01998f83fc49bdd40` | 33 |
| `apps/web/src/lib/scanPrivacy.clients.test.ts` | `4f549cf25d5f63daacfbc2a39ea993c9f2524a89` | 37 |
| `apps/web/src/lib/scanPrivacy.i18n.test.ts` | `931eeb063f1fa6855b95e757472cef69724f5d7d` | 106 |
| `apps/web/src/lib/scanPrivacy.test.ts` | `5905dd39831b3dc42fcfe95e435e22e9af16aa2b` | 458 |
| `apps/web/src/lib/scanPrivacy.transport.test.ts` | `f022052311390d7338e38f0c2a548b731ddd3093` | 68 |
| `apps/web/src/lib/scanSpam.test.ts` | `762deed547d68f934999994d770369b2ee95c9ad` | 272 |
| `apps/web/src/lib/scannerCore.bench.nocov.test.ts` | `907f5f380fd846c46cd4737deb6aeae8878a2bc4` | 54 |
| `apps/web/src/lib/scannerCore.fuzz.test.ts` | `77ce0bd28772235418d9e241b0da84028068035f` | 38 |
| `apps/web/src/lib/scannerCore.spam.nocov.test.ts` | `671e4041953379c58270388eebb201fcec2dd541` | 194 |
| `apps/web/src/lib/scannerCore.test.ts` | `902cb6d07492fc8b08131d17b94d7d3fbc70c826` | 198 |
| `apps/web/src/lib/settings.test.ts` | `01fe046841dacb451962614ef219f1c7ab122ea8` | 92 |
| `apps/web/src/lib/settingsExchange.test.ts` | `5ce01111b90a7c5b938ba712790f0b7cb7660358` | 190 |
| `apps/web/src/lib/tagArchive.fuzz.nocov.test.ts` | `8f899eb8e00a5717dc8d094f1470bf72bc4e14d9` | 36 |
| `apps/web/src/lib/tagArchive.test.ts` | `3f4a4a046f42373a722bcb17130c7bbf459f465d` | 325 |
| `apps/web/src/lib/tagArchive.vectors.test.ts` | `ae49b5a848f8af4b61621b0b2535ff911720f891` | 35 |
| `apps/web/src/lib/tags.test.ts` | `cabeff3806d9ee2a2ed44b4d60679db071e70aec` | 240 |
| `apps/web/src/lib/tagsConcurrency.test.ts` | `1729f7dcc4f9330278a40572c87719babb987268` | 118 |
| `apps/web/src/state.sweep.test.ts` | `4e70df6a705a56a4f475136fe183b6e00b943e21` | 156 |
| `apps/web/src/views/Scan.autoRescan.test.tsx` | `1c52101fd63804fa5e80c540923d89a5606afc8e` | 157 |
| `apps/web/src/views/Scan.i18n.test.tsx` | `2892f973dcb48a6076eb38e768bd43082378becb` | 94 |
| `apps/web/src/views/Scan.privacy.test.tsx` | `5ca8631fb1f25658ae55e122d10e22027c0d5e51` | 92 |
| `apps/web/src/views/Scan.test.tsx` | `8b2fcf37b6c7670c20938018a3810265fd777152` | 696 |
| `apps/web/src/views/ScanPrivacy.i18n.test.tsx` | `bd5571c580d0fbfb882bf15d0e39c97e1ff60231` | 216 |
| `apps/web/src/views/Settings.exchange.test.tsx` | `bc1344d8bc56fba59d9f126646cf9505973f0601` | 253 |
| `apps/web/src/views/Settings.race.test.tsx` | `5cc29989d5952ec0f60cbe8f7a82f9c307b73b1c` | 50 |
| `apps/web/src/views/Settings.scanPrivacy.test.tsx` | `c3ca70c56ae0bae2e313b40d5c3f268abd30e343` | 61 |
| `apps/web/src/views/Settings.test.tsx` | `f898ade764504ab8aee0024194afed15f35f92fb` | 238 |
| `packages/hygiene/src/buffer.test.ts` | `365b99cdf060ade859b188d6b107e1019e59587e` | 173 |
| `packages/hygiene/src/destination.test.ts` | `17428fd39a1abdce421326bb14d4069ccf00c2aa` | 162 |
| `packages/hygiene/src/fixtures.testutil.ts` | `bac04217818e4f4d08ec43575a5a2d3c6a983a67` | 62 |
| `packages/hygiene/src/hop-source.test.ts` | `66fea14996baf0da07c122e69e0dd1114974f31f` | 63 |
| `packages/hygiene/src/ledger.test.ts` | `1fdcb829fba6d2c6918d9e2f291620a67f78e5b6` | 174 |
| `packages/hygiene/src/verify.test.ts` | `d83bdc376af2a492c73c3ad2d8367316cacf7bae` | 414 |
| `packages/metadata-hardening/src/amounts.test.ts` | `ae17376455d96bb084a019f38341bc228d8a7300` | 120 |
| `packages/metadata-hardening/src/btc.test.ts` | `0329c475d4a46cc623a4ae304ac3a8416dc21fde` | 181 |
| `packages/metadata-hardening/src/catalogue.test.ts` | `766bda9e50b69cd8f5d2dac30e80b733c72ddcce` | 91 |
| `packages/metadata-hardening/src/derive.test.ts` | `945a62819e56904d6e7f30992fb393af57272aa5` | 118 |
| `packages/metadata-hardening/src/direct.test.ts` | `6b9b2456f54576890ea7ab77b95020dfc7fbf96c` | 66 |
| `packages/metadata-hardening/src/invoice.test.ts` | `69f68168e7cf0ab278d953b23ede5959cf276152` | 82 |
| `packages/metadata-hardening/src/release.test.ts` | `6f9e91a5b3d54929b750d1cdc05dee14b5a63fd9` | 165 |
| `packages/metadata-hardening/src/scan.test.ts` | `0c5ea5e7d4b2a9788fe0a2b83fff7dc1d962e70d` | 101 |
| `packages/metadata-hardening/src/tags.test.ts` | `40f348e7fe6d367093811ee5807f592187fd52a7` | 85 |
| `packages/metadata-hardening/src/testutil.testutil.ts` | `02511269b2c6d51f0f4205013c74c82b68e17adb` | 32 |
| `packages/metadata-hardening/src/web.test.ts` | `7ca4869d8fbad003efe79edff5f7e2340a137a1d` | 76 |
| `packages/net-transport/src/browser.test.ts` | `7c26ee3fbff011a3c46b99274a7a90eade242964` | 43 |
| `packages/net-transport/src/core.test.ts` | `9e74331f2b5dedc328e36af9687fe87ae2dc0336` | 523 |
| `packages/net-transport/src/fakeHpke.testutil.ts` | `6d5573edf042784ebd0ed23fb3e23084bd1a2c46` | 93 |
| `packages/net-transport/src/fetchAdapter.isolation.test.ts` | `7eb5b48dc17d030b6b0e8a2d456ad3ea9bc331a3` | 71 |
| `packages/net-transport/src/fetchIsolation.test.ts` | `e46041cb959fd6148e557174cb90c719ed00e8e1` | 217 |
| `packages/net-transport/src/ohttp.test.ts` | `b32eee2a7adf9b84b9c4b5c0bf11f3fb739705d8` | 378 |
| `packages/net-transport/src/socks.test.ts` | `780601901ded5ec3ef99b42db9ebc383a2178317` | 674 |
| `packages/scan-source/src/composite.test.ts` | `9246734a198f12adf9512da541dd247d13d3c08a` | 145 |
| `packages/scan-source/src/indexer.test.ts` | `b4776a2a734b91fe83112cea38be58886761260a` | 109 |
| `packages/scan-source/src/pir2.test.ts` | `2f1740ea8289dfafa08a7614114eb2880c033570` | 113 |
| `packages/scan-source/src/range.test.ts` | `357c9d96c636c4df4d2698c1c2d34fcec4ec8bfd` | 100 |
| `packages/scan-source/src/testutil.ts` | `80abc5dffb35c837bb0d3ee6e793636d56bfedeb` | 133 |
| `packages/scan-source/src/validate.test.ts` | `84500028971740c8d42580be599aad4fc49e797e` | 60 |
| `packages/scan-source/src/window.test.ts` | `49244a63e4c0fc16793f6e429940fc153be37267` | 41 |
| `packages/ux-vault/src/confusables.test.ts` | `0825066436d44673e7c881de6c6e74014da9a74e` | 155 |
| `packages/ux-vault/src/contacts.test.ts` | `15462e18c59b6351ff222e80999d5e96d080b7c1` | 224 |
| `packages/ux-vault/src/envelope.test.ts` | `8608ab75206841194d26a5c58ee67f66b2f58ae8` | 187 |
| `packages/ux-vault/src/memory.testutil.ts` | `b796c38449ab06baedb79011bfaeeedc9ad774dc` | 43 |
| `packages/ux-vault/src/portable-parity.test.ts` | `e33114ecaa8a4eea7b6e0cf5632fdcd2453247ef` | 45 |
| `packages/ux-vault/src/reconciliation-amounts.test.ts` | `45c7063b70a10720885eec7583b002d18ab05bba` | 145 |
| `packages/ux-vault/src/schema.test.ts` | `7c1e3b90b90c9e9254b1755568457b870513594d` | 280 |
| `packages/ux-vault/src/vault.test.ts` | `196fa33df5e2ee5ca910fd05ea88a075300f1c28` | 364 |
| `apps/web/src/lib/networkAuthorization.adapters.test.ts` | `6a27d3bd41b8508001539a914eabbf0c7f138ae4` | 93 |
| `apps/web/src/lib/networkAuthorization.profileConsistency.test.ts` | `f1a38a5bd5264cede57e98b1c0cb883f8bc335d6` | 44 |
| `apps/web/src/lib/networkAuthorization.test.ts` | `4fda284ea68de5ddbf68b5608d0a06491875153d` | 482 |
| `apps/web/src/lib/networkOperation.test.ts` | `bb02e38582b7b3cdf9bf638be6bd52c2129114a6` | 64 |
| `apps/web/src/lib/paymentExportRpc.test.ts` | `8aadf1028cfcc92e1eb42371f6dcbe17c2085719` | 165 |
| `apps/web/src/lib/privateScanLifecycle.test.ts` | `8d8f2e22bdff1be59721a9ce1a7b8ad29eaeb4ad` | 190 |
| `apps/web/src/lib/privateScanPerformance.nocov.test.ts` | `548916051671c2645c584d5e459a583405db65cf` | 260 |
| `apps/web/src/lib/privateScanStore.test.ts` | `c39c51ef15e04127ea434ed6cbb98791c7eb851d` | 304 |
| `apps/web/src/lib/reconciliationVault.idb.test.ts` | `4c52b6fe0c7224ef4812ab6d31a07b401d721862` | 200 |
| `apps/web/src/lib/scanClient.test.ts` | `297c6f0cbf22e8e351f42579c05dc4c79bdb6cc5` | 1995 |
| `apps/web/src/lib/scanCursorSlot.test.ts` | `3565f11dd4ef6cee70789fa26c9da22e4230a03d` | 404 |
| `apps/web/src/lib/scanPrivacy.authorization.test.ts` | `7cdb7bf627b2624005f1ba8e3d0ee8bc12e6df3c` | 94 |
| `apps/web/src/lib/scanPrivacy.bulkEvidence.test.ts` | `5bb3480d1e52945391c83f2be161e5ddef73fe9a` | 24 |
| `apps/web/src/lib/scanPrivacy.clients.test.ts` | `42bc1709a3c13f624a7ce0865d7a08580938e37a` | 85 |
| `apps/web/src/lib/scanPrivacy.scheduler.test.ts` | `6cb3f232ccffe8c453d1c977d0b80c16a483ff0e` | 164 |
| `apps/web/src/lib/scanPrivacy.test.ts` | `604004028b6b804b1f41f8bb62e2de61e892ea6b` | 520 |
| `apps/web/src/lib/scanSpam.partial.test.ts` | `ceeba44eb5156581c4fa9c65b3104109306bff1e` | 37 |
| `apps/web/src/lib/scannerCore.test.ts` | `64d9d0d95a66da023f2968faa7bd97c7dbe66605` | 256 |
| `apps/web/src/lib/settings.loopback.test.ts` | `6bdda45ce1de594800ad1b7377d0206a93cdabdf` | 17 |
| `apps/web/src/lib/settings.test.ts` | `9ba2a5ccb59077ec6ac27c83e95ae69e10835e01` | 133 |
| `apps/web/src/lib/settingsPrivacy.test.ts` | `549d64d9348fe9638c04454078b08654e23077c1` | 63 |
| `apps/web/src/views/Scan.privacy.test.tsx` | `146a90721ae039959af1ce4cd973c572394721f7` | 117 |
| `apps/web/src/views/Scan.privateCheckpoint.test.tsx` | `a704ec91667f26d087cb732e273873a2b8514560` | 440 |
| `apps/web/src/views/Scan.stealthExport.authorization.test.tsx` | `576a2c5ff4bc13b61181d554c7a59135070d1cb9` | 172 |
| `apps/web/src/views/Scan.stealthExport.test.tsx` | `a386af69cb9c30910df93438cb8d589d16229980` | 124 |
| `apps/web/src/views/Scan.test.tsx` | `c25de17f75fcea631452b769aadede99a305f25f` | 703 |
| `apps/web/src/views/Settings.exchange.test.tsx` | `6094ae5931e43d72b3fad9ade002275afaace426` | 254 |
| `apps/web/src/views/Settings.test.tsx` | `7bf77779c2128ca6782f79fce0cf0600e2419360` | 436 |
| `packages/net-transport/src/browser.test.ts` | `5a11e91b46c0cd6fa6697673284affe315c7f380` | 50 |
| `packages/net-transport/src/selection.test.ts` | `018e3d754211e3f15bf1199b210ebfe7d0c6f6ba` | 75 |
| `packages/scan-source/src/composite.test.ts` | `4280a956a606315455c39b1b254a13b21aaf004c` | 145 |
| `packages/scan-source/src/padded.test.ts` | `94a8befe42447d02b44f47fe57ce9ab1120a9102` | 134 |
| `packages/scan-source/src/pir2.test.ts` | `99678e91f2a22a2d0e8ef74dbece3a040a300bde` | 121 |
| `packages/scan-source/src/range.test.ts` | `37eeeb47f674b5dc6e86569ddefcd7cb56b13eaa` | 142 |
| `packages/ux-vault/src/contacts.test.ts` | `2db7c9fbcc61e6b27a735f19ea658c3911d128a6` | 224 |
| `packages/ux-vault/src/schema.test.ts` | `9cdb54565aa5d3d4140d59ed80689dcc02a0dd36` | 280 |
| `packages/ux-vault/src/vault.test.ts` | `50fd4de340c7f1a090059d2d4652f84d10d4bf0a` | 364 |
| `apps/web/src/components/ReconciliationLedger.privacy.test.tsx` | `ef369c7623aa6593e5db6c1579ae762d07cd4392` | 79 |
| `apps/web/src/lib/settings.test.ts` | `db3e1d0e58641947725dd27b3fb3e9c6cee6fada` | 153 |
| `apps/web/src/lib/settings.uiPrivacy.test.ts` | `d53995d69830845c7b48553bbc5c8adeb483367b` | 81 |
| `apps/web/src/lib/settingsExchange.test.ts` | `6dfda318e1ddcdc0c6d3914f8b37d92001995384` | 207 |
| `apps/web/src/lib/settingsPrivacy.test.ts` | `03b845702db83998a2b578ebaa593bb1b243f28b` | 64 |
| `apps/web/src/views/Settings.clipboardPrivacy.test.tsx` | `e27f09ebd02b61b69bfb9f72d78d68bdf3598a58` | 79 |

## Pinned head map

| Branch | Immutable commit |
|---|---|
| `main` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| `release/ghostpay-beta-qualification-20261119` | `417f7c71daf8645e1432f2ec8f070110879b80bd` |
| `integration/ghostpay-completion-20261120` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| `snapshot/ghostpay-privacy-8be15289-20261120` | `d6819796a9542acc488b896786faffe83b913d9b` |
| `feat/ghostpay-privacy-quick-hide-20261120` | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| `fix/ghostpay-format-validation-20261120` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` |
| `fix/ghostpay-pages-integrity-gate-20261120` | `936d054ed067d89c773310d42e33939c1129bbfa` |
| `automation/20261120T0434Z/bug/erc20-simulation-result` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` |
| `automation/20261120T004531Z/feature/clipboard-guard` | `6c648770f5647ca7993cc108ef9e5ede9b46b4c9` |
| `automation/20261120T0115Z/coordinator/clipboard-qualification` | `04910f65dc0268e41519c4b1a44e83264272f0bf` |
| `automation/20261120T0115Z/worker/receipt-hash-validation` | `acbf39ee21ad35e9d14df958fa16fbcc2e230cae` |
| `automation/20261120T0243Z/worker/format-units-validation` | `7523da612ba365451f1d5c2dbc01d0bdeedbe8c7` |
| `automation/20261120T003500Z/coordinator/qr-runtime-qualification` | `ec546311f994fe1db544fe85ff2aa6db428d67d4` |
| `fix/ghostpay-qr-conflict-expiry-20261119-c374725a11b7` | `172695efb41665a4e50d335029e54184bbb5b328` |
| `automation/20261119T2243Z/bug/base64url-runtime-input` | `856b2d60fd38eabb8a1c856c95ad82f1c7d30c64` |
| `automation/20261119T204728Z/bug/qr-kind-failclosed` | `89942105c48df03b9351f777278b6a992e35a95e` |
| `automation/20261119T183817Z/bug/merchant-pin-duplicate-json` | `9fbf3312cb8e65083f604cc0bf0512d59c83f141` |
| `automation/20261119T1640Z/bug/scan-privacy-partial-30d` | `0041514a630398c89693498d9b5e44ef562d9c61` |
| `automation/20261119-c977/bug/build-profile-failclosed` | `25c380f253e3338c0e6b79e8d052cdf8950f9e88` |
| `automation/20261119T124337Z/bug/qr-utf8-surrogate-guard` | `b5fc0991eb7cc12fcdfaea514f1fee5be1eca2a0` |
