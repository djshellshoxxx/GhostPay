> Historical lane record. The final [catalogue](../FINDINGS.md), [branch matrix](../branch-applicability.md), [quality review](../findings-quality-review.md) and [unified coverage](../coverage.json) supersede earlier provisional status, pending queues and branch-wide wording below. UTC worker dates may fall on November 20; the user-facing audit date is November 19, 2026 (America/Los_Angeles).

# GhostPay scan, custody, network and storage test source review — wave 3

## Result and limits

This wave reviewed **67 distinct test/helper path-plus-blob rows**: 56 complete source bodies and 11 complete deltas against already read bases. It explicitly excluded 26 test blobs confined to proved inactive browser module branches. **34 active test blobs remain untouched** and are handed off with exact full-file ranges. No new finding was established.

All 13 custody/tag/tag-archive/Reconciliation rows transferred from payment wave 2 are complete. The inherited custody generation-1 production backlog is fully reconciled: 80 rows have exact reviewed successor matches and 29 have explicit inactive-module exclusions. There is no unresolved active production row in that inherited set.

This is read-only static source review. No test suite, analyzer, application, benchmark, fuzz property, network listener, live probe or reproduction was executed. No source/test/config file, transaction, deployment or remote repository was changed. A test assertion documents intended behavior and does not establish runtime success.

## Scope, identity and counting

Coverage keyed by path plus full Git blob. Full source bodies or complete deltas against a fully read base only; identical blob sharing verified against all twenty immutable Git trees.

The 122 scan/network remaining candidate rows and the 13 transferred custody rows deduplicate to 127 rows across 105 paths. They were checked against custody_privacy_review.json, payment_ui_review.json, payment_surfaces_wave2.json, root-review.json, tooling-review.json and qualification-review.json. No exact candidate test row already marked reviewed in those ledgers was counted again. The 149 fresh payment/tests successor rows remain with the payment worker; qualification and browser E2E remain with root.

| Disposition | Path-plus-blob rows | Sum of target blob lengths |
|---|---:|---:|
| reviewed | 67 | 10522 |
| pending | 34 | 11201 |
| excluded | 26 | 4844 |

Line totals are sums of target blob sizes, including variants. They are not runtime coverage, executed lines, or the number of distinct lines printed during delta review.

## Observations from the reviewed test sources

### Reconciliation UI

Assertions cover encrypted writes, untrusted import provenance, explicit invoice-link consent, stale scan/preview/unlock revocation, payload-free refresh, partial amount summary limits, and privacy reveal. Receipt archive fixtures use ordinary current timestamps; these files do not assert the out-of-Date-range ingress/render criterion for CUSTODY-02. No runtime result claimed.

Source identities: apps/web/src/components/ReconciliationLedger.i18n.test.tsx @ be6fb9d4ffa6db300695d5b25ffc1ffa63de81e6; apps/web/src/components/ReconciliationLedger.invoices.test.tsx @ d3f96ceebe31fa1fde01dc2dfeca427e10df24c7; apps/web/src/components/ReconciliationLedger.test.tsx @ eb5258cc762b0dbc4c7d9191b4fb36888ebda9e0; apps/web/src/components/ReconciliationLedger.privacy.test.tsx @ ef369c7623aa6593e5db6c1579ae762d07cd4392.

### Archive UI and tag vault

Assertions cover discarded/changed previews, partial cross-chain import outcomes, lost write acknowledgements, lifecycle/session locks, export cleanup, stale CAS/wipe/rotation handling, keyed lookup/AAD binding, and typed tag payloads. Latest TagArchive test delta explicitly checks idle authority suspension and removal of archive forms; older baseline asserts field clearing with retained session.

Source identities: apps/web/src/components/TagArchive.atomicity.test.tsx @ 9e51bda4ea0f872622a86f476da996a1a6b74a32; apps/web/src/components/TagArchive.history.test.ts @ 5380b9e5103f740c424195ba05effde25a7729e3; apps/web/src/components/TagArchive.retry.test.tsx @ 4dc87d93947d5499be1792836642cf4606e6ccde; apps/web/src/components/TagArchive.test.tsx @ 01beb3c0c5cf3142ad957a9e1209f15871062082; apps/web/src/lib/tagArchive.fuzz.nocov.test.ts @ 8f899eb8e00a5717dc8d094f1470bf72bc4e14d9; apps/web/src/lib/tagArchive.vectors.test.ts @ ae49b5a848f8af4b61621b0b2535ff911720f891; apps/web/src/lib/tags.test.ts @ cabeff3806d9ee2a2ed44b4d60679db071e70aec; apps/web/src/lib/tagsConcurrency.test.ts @ 1729f7dcc4f9330278a40572c87719babb987268.

### Settings library tests

Assertions preserve endpoint confidentiality by stripping session-only primary/secondary selections from storage and exchange; credential detection is explicitly heuristic and consent remains slot/chain specific. These isolated storage/exchange tests do not demonstrate that private scanning receives the same-tab endpoints. UI privacy is persisted separately in the latest privacy variants. No new production finding and no runtime result.

Source identities: apps/web/src/lib/settings.test.ts @ 01fe046841dacb451962614ef219f1c7ab122ea8; apps/web/src/lib/settings.loopback.test.ts @ 6bdda45ce1de594800ad1b7377d0206a93cdabdf; apps/web/src/lib/settingsPrivacy.test.ts @ 549d64d9348fe9638c04454078b08654e23077c1; apps/web/src/lib/settings.uiPrivacy.test.ts @ d53995d69830845c7b48553bbc5c8adeb483367b; apps/web/src/lib/settingsExchange.test.ts @ 5ce01111b90a7c5b938ba712790f0b7cb7660358; apps/web/src/lib/settings.test.ts @ 9ba2a5ccb59077ec6ac27c83e95ae69e10835e01; apps/web/src/lib/settings.test.ts @ db3e1d0e58641947725dd27b3fb3e9c6cee6fada; apps/web/src/lib/settingsPrivacy.test.ts @ 03b845702db83998a2b578ebaa593bb1b243f28b; apps/web/src/lib/settingsExchange.test.ts @ 6dfda318e1ddcdc0c6d3914f8b37d92001995384.

### Settings UI and scoped network operations

Settings tests assert explicit endpoint/trust selection, import preview invalidation, failed-save behavior, session-only omission, profile acknowledgment, cross-tab changes and stale RPC-test results. They stop before exercising session-only endpoint selection from private Scan. Network operation tests assert exact/prefix destination limits, most-specific grant revocation, incomplete profile refusal, adapter dispatch revocation and redirect refusal. Loopback server test code was read only; no listeners or probes were run.

Source identities: apps/web/src/views/Settings.test.tsx @ f898ade764504ab8aee0024194afed15f35f92fb; apps/web/src/views/Settings.race.test.tsx @ 5cc29989d5952ec0f60cbe8f7a82f9c307b73b1c; apps/web/src/views/Settings.scanPrivacy.test.tsx @ c3ca70c56ae0bae2e313b40d5c3f268abd30e343; apps/web/src/views/Settings.clipboardPrivacy.test.tsx @ e27f09ebd02b61b69bfb9f72d78d68bdf3598a58; apps/web/src/views/Settings.exchange.test.tsx @ bc1344d8bc56fba59d9f126646cf9505973f0601; apps/web/src/lib/networkAuthorization.adapters.test.ts @ 6a27d3bd41b8508001539a914eabbf0c7f138ae4; apps/web/src/lib/networkAuthorization.profileConsistency.test.ts @ f1a38a5bd5264cede57e98b1c0cb883f8bc335d6; apps/web/src/lib/networkOperation.test.ts @ bb02e38582b7b3cdf9bf638be6bd52c2129114a6; apps/web/src/views/Settings.test.tsx @ 7bf77779c2128ca6782f79fce0cf0600e2419360; apps/web/src/views/Settings.exchange.test.tsx @ 6094ae5931e43d72b3fad9ade002275afaace426.

### Network authority, export RPC and scan transport

Source asserts per-action capability and selected-endpoint binding, exact payment-export address/method binding, clock validity, context/request expiry, lifecycle cancellation, bounded body disposal, no fallback, and privacy-policy validation. networkAuthorization.test.ts:140-147 directly supplies a session-only URL to authority, so this does not exercise Scan selection from persisted settings. Client/scheduler tests assert cancellation after jitter and late responses, independent request budgets and window caps. Sweep state tests assert journal CAS and unknown-status preservation. No new production finding and no runtime result.

Source identities: apps/web/src/lib/networkAuthorization.test.ts @ 4fda284ea68de5ddbf68b5608d0a06491875153d; apps/web/src/lib/paymentExportRpc.test.ts @ 8aadf1028cfcc92e1eb42371f6dcbe17c2085719; apps/web/src/lib/scanPrivacy.authorization.test.ts @ 7cdb7bf627b2624005f1ba8e3d0ee8bc12e6df3c; apps/web/src/lib/scanPrivacy.transport.test.ts @ f022052311390d7338e38f0c2a548b731ddd3093; apps/web/src/lib/scanPrivacy.clients.test.ts @ 4f549cf25d5f63daacfbc2a39ea993c9f2524a89; apps/web/src/lib/scanPrivacy.bulkEvidence.test.ts @ 5bb3480d1e52945391c83f2be161e5ddef73fe9a; apps/web/src/lib/scanPrivacy.scheduler.test.ts @ 6cb3f232ccffe8c453d1c977d0b80c16a483ff0e; apps/web/src/lib/scanPrivacy.i18n.test.ts @ 931eeb063f1fa6855b95e757472cef69724f5d7d; apps/web/src/state.sweep.test.ts @ 4e70df6a705a56a4f475136fe183b6e00b943e21; apps/web/src/lib/scanPrivacy.clients.test.ts @ 42bc1709a3c13f624a7ce0865d7a08580938e37a.

### Browser transport package and scan privacy/indexer

Complete mixed transport core test body retained because it also tests the active browser guards/onion/settings/fetch adapters. Package selection parser defaults are separate from application network authority strict validity checks. Tests assert stream byte/deadline cleanup, redirect isolation, fixed-window shaping, padding and provider-limit splitting. Indexer tests explicitly retain the omitted-record limitation; header continuity/witness assertions do not prove log completeness. Test fixture utility includes unused PIR helpers incidentally; no production scope expansion.

Source identities: packages/net-transport/src/browser.test.ts @ 7c26ee3fbff011a3c46b99274a7a90eade242964; packages/net-transport/src/selection.test.ts @ 018e3d754211e3f15bf1199b210ebfe7d0c6f6ba; packages/net-transport/src/fetchAdapter.isolation.test.ts @ 7eb5b48dc17d030b6b0e8a2d456ad3ea9bc331a3; packages/net-transport/src/fetchIsolation.test.ts @ e46041cb959fd6148e557174cb90c719ed00e8e1; packages/net-transport/src/core.test.ts @ 9e74331f2b5dedc328e36af9687fe87ae2dc0336; apps/web/src/lib/scanPrivacy.test.ts @ 5905dd39831b3dc42fcfe95e435e22e9af16aa2b; packages/scan-source/src/indexer.test.ts @ b4776a2a734b91fe83112cea38be58886761260a; packages/scan-source/src/testutil.ts @ 80abc5dffb35c837bb0d3ee6e793636d56bfedeb; packages/net-transport/src/browser.test.ts @ 5a11e91b46c0cd6fa6697673284affe315c7f380; apps/web/src/lib/scanPrivacy.test.ts @ 604004028b6b804b1f41f8bb62e2de61e892ea6b.

### Scan-source, portable vault and metadata package tests

Scan range/padding/validation tests assert public-bound request shaping, byte/record budgets, late cancellation and normalized records; no new finding. Portable-parity is an import wrapper plus bounded-header checks: its import list is not coverage for the imported tests (remaining reconciliation suites are explicitly pending). Amount-summary tests retain seller/chain/asset/invoice/provenance binding, duplicate invariance, contradiction refusal and exact bigint totals. Metadata release/guard tests cover the used padding primitive and common guards; unused catalogue/release features were incidentally read in those mixed files.

Source identities: packages/scan-source/src/range.test.ts @ 357c9d96c636c4df4d2698c1c2d34fcec4ec8bfd; packages/scan-source/src/validate.test.ts @ 84500028971740c8d42580be599aad4fc49e797e; packages/scan-source/src/window.test.ts @ 49244a63e4c0fc16793f6e429940fc153be37267; packages/scan-source/src/padded.test.ts @ 94a8befe42447d02b44f47fe57ce9ab1120a9102; packages/ux-vault/src/portable-parity.test.ts @ e33114ecaa8a4eea7b6e0cf5632fdcd2453247ef; packages/ux-vault/src/reconciliation-amounts.test.ts @ 45c7063b70a10720885eec7583b002d18ab05bba; packages/metadata-hardening/src/catalogue.test.ts @ 766bda9e50b69cd8f5d2dac30e80b733c72ddcce; packages/metadata-hardening/src/release.test.ts @ 6f9e91a5b3d54929b750d1cdc05dee14b5a63fd9; packages/metadata-hardening/src/testutil.testutil.ts @ 02511269b2c6d51f0f4205013c74c82b68e17adb; packages/scan-source/src/range.test.ts @ 37eeeb47f674b5dc6e86569ddefcd7cb56b13eaa.

### Retained mixed hygiene tests

Full buffer/ledger/verify bodies and fixture utility read. Active funding-guard assertions reject known-wallet/destination funding and malformed addresses. Destination-ledger assertions cover per-chain isolation, explicit reuse, own/protocol destination refusal, index conflicts/exhaustion, strict import shape and non-aliasing serialization. Shared testnet guard and mixed verification tests assert transfer-log normalization, bounded address-free query shapes, incomplete-range reporting and failure when secure randomness or required batch support is absent. Deterministic scalar/RNG fixtures are explicitly test data. Incidental unused feature assertions are not an expansion of browser production scope. No runtime result or new production finding.

Source identities: packages/hygiene/src/ledger.test.ts @ 1fdcb829fba6d2c6918d9e2f291620a67f78e5b6; packages/hygiene/src/buffer.test.ts @ 365b99cdf060ade859b188d6b107e1019e59587e; packages/hygiene/src/fixtures.testutil.ts @ bac04217818e4f4d08ec43575a5a2d3c6a983a67; packages/hygiene/src/verify.test.ts @ d83bdc376af2a492c73c3ad2d8367316cacf7bae.

## Existing findings retained without duplication

**SCAN-NET-02 (Medium, current selected private-scan heads)** remains the parent-confirmed production issue. Its Medium condition requires the production privateScanStore path, an otherwise usable selected primary, a current-tab selected secondary retained only for the session, and plan.useSecondary=true. Persisted settings omit that secondary, and currentScanSettings prefers the persisted representation. The selected independent check is consequently skipped. When only the session-only primary is lost and no other applicable scan endpoint exists, the flow instead fails visibly with scan.error.noRpc; that is the lower-severity availability aspect. No forged payment or fund loss is established.

Parent/wave-2 source references at integration head e22c1748a3de6eb02f5be3abe27d634b238c67c6: apps/web/src/views/Settings.tsx 101–109; apps/web/src/AppShell.tsx 421–436; apps/web/src/lib/settings.ts 195–204; apps/web/src/lib/defaultServices.ts 116; apps/web/src/views/Scan.tsx 92–98, 166–175, 434–467. The authoritative full affected-head list and evidence remain in scan_network_wave2.json. This wave adds test interpretation: settings tests assert session-only stripping, while networkAuthorization.test.ts 140–147 supplies the URL directly. Those reviewed tests do not exercise the production Settings-to-private-Scan selection chain. The pending Scan suites must still be inspected before making a suite-wide coverage claim.

Remediation and safe acceptance criteria remain: use one validated current-revision settings snapshot that preserves current-tab session-only selections without persisting them; require the selected secondary whenever the plan requests it; preserve cross-tab stale-revision revocation. Source review should establish that same-tab session-only primary and secondary selections reach the production private scan flow, unusable required secondary selections refuse the scan, and retained endpoint credentials remain absent from storage.

**SCAN-NET-01 (Low, older/main-only)** remains corrected in latest. The partial-range qualifier must describe the thirty-day window when reporting thirty-day privacy counts. The pending scanSpam.partial suite is not credited here.

**CUSTODY-02 (Low, current)** remains limited to an authenticated same-seller/same-chain archive containing a receipt timestamp that passes the positive-safe-integer check but cannot be represented as a JavaScript Date. The subsequent ledger rendering can throw. Existing evidence: packages/invoice-schema/src/receipts.ts 90–95, packages/ux-vault/src/reconciliation-portable.ts 527–542 and 1045–1083, apps/web/src/components/ReconciliationLedger.tsx 751–757 at integration. The reviewed reconciliation UI fixtures use ordinary current timestamps; they do not address that Date representability criterion. Remediation should reject nonrepresentable timestamps at the shared ingress boundary and make display formatting resilient. Safe acceptance is typed rejection or safe rendering without loss of the rest of the ledger. The remaining reconciliation-vault source suites are still pending.

**CUSTODY-01 (older/main idle authority retention)** remains fixed in latest. The fully read latest TagArchive test delta explicitly asserts idle suspension and removal of archive forms; this is source evidence of intended corrected behavior, not a runtime qualification result.

## Imported helper dispositions

- **apps/web/src/test helpers**: exact blobs already reviewed by root. announcements, fakeManifest, mockRpc, render, memoryIndexedDb, fakeIndexedDb, inlineWorker, manifestChain and mockChain exact blobs checked against root ledger; no duplicate review counted here.
- **@ghostpay/net-harness**: only imported by explicitly excluded Node transport socks/ohttp test branches in this candidate set. No package source coverage claimed; root informed for final explicit disposition.
- **@ghostpay/pir-two-server**: incidental dependency of unused PIR helpers in a fully read mixed fixture utility; implementation outside browser scope. The shared testutil source body is reviewed; imported PIR server implementation is not covered by that read. Root informed; no uncoordinated scope expansion.
- **top-level tag vector data and generators**: root owns review. Not included in this worker test-body coverage; root confirmed separate ownership.

The full portable-parity test wrapper was read. Its imports do not confer coverage on the imported test bodies; pending reconciliation source suites are separately listed below. Package/config variants are root-owned and are not included in this worker count.

## Inactive-branch exclusion rules

Exclusions are scope dispositions, not source-review or safety claims. Full exact blob/head memberships are preserved in the JSON and the table below. Evidence is scan_network_wave2_import_closure.json plus scan_custody_tests_wave3_import_closure.json and the prior custody ledger.

**HYGIENE_UNUSED_TEST**: Tests exercise destination/hop-generation features. Browser sweep activates only DestLedger/fundingGuard; these modules are explicitly excluded by the wave2 import closure. Shared active guard/ledger tests remain in review scope.

**METADATA_UNUSED_TEST**: Tests exercise metadata-hardening features outside the browser relayerClient padBody/MetadataHardeningError closure. These feature branches are unused by the selected browser entry points across the twenty heads; release and mixed catalogue/guard tests remain in review scope.

**NODE_TRANSPORT_UNUSED_TEST**: Tests and fake-HPKE fixture target Node profile/socket/proxy/OHTTP implementations outside @ghostpay/net-transport/browser. The browser entry and its used fetch/selection dependencies are preserved in scope, including mixed core tests.

**SCAN_MODES_UNUSED_TEST**: Tests activate general source factory/PIR2/light/quorum implementations that the selected browser indexer/range-padding path does not call. Indexer, range, padding, validation and shared fixtures remain in scope.

**UX_NODE_UNUSED_TEST**: Tests target Node/operator contacts, envelope, schema and profile-vault branches. Across all twenty selected heads browser imports exclusively @ghostpay/ux-vault/portable; its barrel exports portable codecs and does not import these Node branches. Portable-parity and reconciliation-amounts tests remain in scope.

## Exact review ledger

Method F means the complete numbered source body was read (lines 1 through the listed length). Method D means the entire blob delta was read against the named, already fully covered base; unmodified lines inherit that reviewed base. Head-set identifiers expand to the immutable commits below. The JSON retains complete method text, base blobs, read ranges and full SHA membership on every row.

| Path | Full blob | Lines | Method | Head set |
|---|---|---:|---|---|
| apps/web/src/components/ReconciliationLedger.i18n.test.tsx | be6fb9d4ffa6db300695d5b25ffc1ffa63de81e6 | 135 | F | S01 |
| apps/web/src/components/ReconciliationLedger.invoices.test.tsx | d3f96ceebe31fa1fde01dc2dfeca427e10df24c7 | 283 | F | S01 |
| apps/web/src/components/ReconciliationLedger.test.tsx | eb5258cc762b0dbc4c7d9191b4fb36888ebda9e0 | 432 | F | S01 |
| apps/web/src/lib/scanPrivacy.clients.test.ts | 4f549cf25d5f63daacfbc2a39ea993c9f2524a89 | 37 | F | S02 |
| apps/web/src/lib/scanPrivacy.i18n.test.ts | 931eeb063f1fa6855b95e757472cef69724f5d7d | 106 | F | S01 |
| apps/web/src/lib/scanPrivacy.test.ts | 5905dd39831b3dc42fcfe95e435e22e9af16aa2b | 458 | F | S02 |
| apps/web/src/lib/scanPrivacy.transport.test.ts | f022052311390d7338e38f0c2a548b731ddd3093 | 68 | F | S01 |
| apps/web/src/lib/settings.test.ts | 01fe046841dacb451962614ef219f1c7ab122ea8 | 92 | F | S02 |
| apps/web/src/lib/settingsExchange.test.ts | 5ce01111b90a7c5b938ba712790f0b7cb7660358 | 190 | F | S03 |
| apps/web/src/lib/tagArchive.fuzz.nocov.test.ts | 8f899eb8e00a5717dc8d094f1470bf72bc4e14d9 | 36 | F | S01 |
| apps/web/src/lib/tagArchive.test.ts | 3f4a4a046f42373a722bcb17130c7bbf459f465d | 325 | F | S01 |
| apps/web/src/lib/tagArchive.vectors.test.ts | ae49b5a848f8af4b61621b0b2535ff911720f891 | 35 | F | S01 |
| apps/web/src/lib/tags.test.ts | cabeff3806d9ee2a2ed44b4d60679db071e70aec | 240 | F | S01 |
| apps/web/src/lib/tagsConcurrency.test.ts | 1729f7dcc4f9330278a40572c87719babb987268 | 118 | F | S01 |
| apps/web/src/state.sweep.test.ts | 4e70df6a705a56a4f475136fe183b6e00b943e21 | 156 | F | S01 |
| apps/web/src/views/Settings.exchange.test.tsx | bc1344d8bc56fba59d9f126646cf9505973f0601 | 253 | F | S02 |
| apps/web/src/views/Settings.race.test.tsx | 5cc29989d5952ec0f60cbe8f7a82f9c307b73b1c | 50 | F | S01 |
| apps/web/src/views/Settings.scanPrivacy.test.tsx | c3ca70c56ae0bae2e313b40d5c3f268abd30e343 | 61 | F | S01 |
| apps/web/src/views/Settings.test.tsx | f898ade764504ab8aee0024194afed15f35f92fb | 238 | F | S02 |
| packages/hygiene/src/buffer.test.ts | 365b99cdf060ade859b188d6b107e1019e59587e | 173 | F | S01 |
| packages/hygiene/src/fixtures.testutil.ts | bac04217818e4f4d08ec43575a5a2d3c6a983a67 | 62 | F | S01 |
| packages/hygiene/src/ledger.test.ts | 1fdcb829fba6d2c6918d9e2f291620a67f78e5b6 | 174 | F | S01 |
| packages/hygiene/src/verify.test.ts | d83bdc376af2a492c73c3ad2d8367316cacf7bae | 414 | F | S01 |
| packages/metadata-hardening/src/catalogue.test.ts | 766bda9e50b69cd8f5d2dac30e80b733c72ddcce | 91 | F | S01 |
| packages/metadata-hardening/src/release.test.ts | 6f9e91a5b3d54929b750d1cdc05dee14b5a63fd9 | 165 | F | S01 |
| packages/metadata-hardening/src/testutil.testutil.ts | 02511269b2c6d51f0f4205013c74c82b68e17adb | 32 | F | S01 |
| packages/net-transport/src/browser.test.ts | 7c26ee3fbff011a3c46b99274a7a90eade242964 | 43 | F | S02 |
| packages/net-transport/src/core.test.ts | 9e74331f2b5dedc328e36af9687fe87ae2dc0336 | 523 | F | S01 |
| packages/net-transport/src/fetchAdapter.isolation.test.ts | 7eb5b48dc17d030b6b0e8a2d456ad3ea9bc331a3 | 71 | F | S01 |
| packages/net-transport/src/fetchIsolation.test.ts | e46041cb959fd6148e557174cb90c719ed00e8e1 | 217 | F | S01 |
| packages/scan-source/src/indexer.test.ts | b4776a2a734b91fe83112cea38be58886761260a | 109 | F | S01 |
| packages/scan-source/src/range.test.ts | 357c9d96c636c4df4d2698c1c2d34fcec4ec8bfd | 100 | F | S02 |
| packages/scan-source/src/testutil.ts | 80abc5dffb35c837bb0d3ee6e793636d56bfedeb | 133 | F | S01 |
| packages/scan-source/src/validate.test.ts | 84500028971740c8d42580be599aad4fc49e797e | 60 | F | S01 |
| packages/scan-source/src/window.test.ts | 49244a63e4c0fc16793f6e429940fc153be37267 | 41 | F | S01 |
| packages/ux-vault/src/portable-parity.test.ts | e33114ecaa8a4eea7b6e0cf5632fdcd2453247ef | 45 | F | S01 |
| packages/ux-vault/src/reconciliation-amounts.test.ts | 45c7063b70a10720885eec7583b002d18ab05bba | 145 | F | S01 |
| apps/web/src/lib/networkAuthorization.adapters.test.ts | 6a27d3bd41b8508001539a914eabbf0c7f138ae4 | 93 | F | S04 |
| apps/web/src/lib/networkAuthorization.profileConsistency.test.ts | f1a38a5bd5264cede57e98b1c0cb883f8bc335d6 | 44 | F | S04 |
| apps/web/src/lib/networkAuthorization.test.ts | 4fda284ea68de5ddbf68b5608d0a06491875153d | 482 | F | S04 |
| apps/web/src/lib/networkOperation.test.ts | bb02e38582b7b3cdf9bf638be6bd52c2129114a6 | 64 | F | S04 |
| apps/web/src/lib/paymentExportRpc.test.ts | 8aadf1028cfcc92e1eb42371f6dcbe17c2085719 | 165 | F | S04 |
| apps/web/src/lib/scanPrivacy.authorization.test.ts | 7cdb7bf627b2624005f1ba8e3d0ee8bc12e6df3c | 94 | F | S04 |
| apps/web/src/lib/scanPrivacy.bulkEvidence.test.ts | 5bb3480d1e52945391c83f2be161e5ddef73fe9a | 24 | F | S04 |
| apps/web/src/lib/scanPrivacy.clients.test.ts | 42bc1709a3c13f624a7ce0865d7a08580938e37a | 85 | D from 4f549cf25d5f63daacfbc2a39ea993c9f2524a89 | S04 |
| apps/web/src/lib/scanPrivacy.scheduler.test.ts | 6cb3f232ccffe8c453d1c977d0b80c16a483ff0e | 164 | F | S04 |
| apps/web/src/lib/scanPrivacy.test.ts | 604004028b6b804b1f41f8bb62e2de61e892ea6b | 520 | D from 5905dd39831b3dc42fcfe95e435e22e9af16aa2b | S04 |
| apps/web/src/lib/settings.loopback.test.ts | 6bdda45ce1de594800ad1b7377d0206a93cdabdf | 17 | F | S04 |
| apps/web/src/lib/settings.test.ts | 9ba2a5ccb59077ec6ac27c83e95ae69e10835e01 | 133 | D from 01fe046841dacb451962614ef219f1c7ab122ea8 | S06 |
| apps/web/src/lib/settingsPrivacy.test.ts | 549d64d9348fe9638c04454078b08654e23077c1 | 63 | F | S06 |
| apps/web/src/views/Settings.exchange.test.tsx | 6094ae5931e43d72b3fad9ade002275afaace426 | 254 | D from bc1344d8bc56fba59d9f126646cf9505973f0601 | S04 |
| apps/web/src/views/Settings.test.tsx | 7bf77779c2128ca6782f79fce0cf0600e2419360 | 436 | D from f898ade764504ab8aee0024194afed15f35f92fb | S04 |
| packages/net-transport/src/browser.test.ts | 5a11e91b46c0cd6fa6697673284affe315c7f380 | 50 | D from 7c26ee3fbff011a3c46b99274a7a90eade242964 | S04 |
| packages/net-transport/src/selection.test.ts | 018e3d754211e3f15bf1199b210ebfe7d0c6f6ba | 75 | F | S04 |
| packages/scan-source/src/padded.test.ts | 94a8befe42447d02b44f47fe57ce9ab1120a9102 | 134 | F | S04 |
| packages/scan-source/src/range.test.ts | 37eeeb47f674b5dc6e86569ddefcd7cb56b13eaa | 142 | D from 357c9d96c636c4df4d2698c1c2d34fcec4ec8bfd | S04 |
| apps/web/src/components/ReconciliationLedger.privacy.test.tsx | ef369c7623aa6593e5db6c1579ae762d07cd4392 | 79 | F | S07 |
| apps/web/src/lib/settings.test.ts | db3e1d0e58641947725dd27b3fb3e9c6cee6fada | 153 | D from 9ba2a5ccb59077ec6ac27c83e95ae69e10835e01 | S07 |
| apps/web/src/lib/settings.uiPrivacy.test.ts | d53995d69830845c7b48553bbc5c8adeb483367b | 81 | F | S07 |
| apps/web/src/lib/settingsExchange.test.ts | 6dfda318e1ddcdc0c6d3914f8b37d92001995384 | 207 | D from 5ce01111b90a7c5b938ba712790f0b7cb7660358 | S07 |
| apps/web/src/lib/settingsPrivacy.test.ts | 03b845702db83998a2b578ebaa593bb1b243f28b | 64 | D from 549d64d9348fe9638c04454078b08654e23077c1 | S07 |
| apps/web/src/views/Settings.clipboardPrivacy.test.tsx | e27f09ebd02b61b69bfb9f72d78d68bdf3598a58 | 79 | F | S07 |
| apps/web/src/components/TagArchive.atomicity.test.tsx | 9e51bda4ea0f872622a86f476da996a1a6b74a32 | 246 | F | S01 |
| apps/web/src/components/TagArchive.history.test.ts | 5380b9e5103f740c424195ba05effde25a7729e3 | 36 | F | S01 |
| apps/web/src/components/TagArchive.retry.test.tsx | 4dc87d93947d5499be1792836642cf4606e6ccde | 85 | F | S01 |
| apps/web/src/components/TagArchive.test.tsx | 01beb3c0c5cf3142ad957a9e1209f15871062082 | 263 | F | S02 |
| apps/web/src/components/TagArchive.test.tsx | d5c0ec5f453dbc5d094885c8ad8301a6016631ab | 279 | D from 01beb3c0c5cf3142ad957a9e1209f15871062082 | S04 |

## Exact remaining source

All rows below are untouched full bodies. The remaining JSON explicitly records read_ranges=[] and remaining_ranges=[[1, lines]]. No imported wrapper, inventory, grep result or truncated output is credited. A successor should read complete bases, then complete deltas where useful, preserving every head membership. Larger scanClient, Scan and reconciliation-vault suites dominate the remaining work.

| Path | Full blob | Untouched lines | Head set |
|---|---|---|---|
| apps/web/src/lib/idbStore.test.ts | ac35d25819dc2799b011b6e456d9fac05e1ab082 | 1–109 | S01 |
| apps/web/src/lib/reconciliationLedger.test.ts | 2d0157b553d8b05eb04dd457d9e698a39a3c6dc9 | 1–224 | S01 |
| apps/web/src/lib/reconciliationMatch.test.ts | fcec62d5d4d2ff02e42b428a7e0a4b60c6c11933 | 1–215 | S01 |
| apps/web/src/lib/reconciliationMatch.testutil.ts | e228abfe1c3b48b9d74c51899cd05c4a97f6af26 | 1–28 | S01 |
| apps/web/src/lib/reconciliationVault.idb.test.ts | ada7cdbcd4f16163e15923f15f652dec0fcac7f6 | 1–129 | S02 |
| apps/web/src/lib/reconciliationVault.invoices.test.ts | c68a9d26ce94c836079a83dc2694929aa13e8ac9 | 1–476 | S01 |
| apps/web/src/lib/reconciliationVault.test.ts | a587e583e7ae8168a27fcdc7db414d614378290b | 1–565 | S01 |
| apps/web/src/lib/scanCheckpointPrivacy.test.ts | 5a8984f59efedbad9c71eb2aea9e6379d3b55b63 | 1–137 | S01 |
| apps/web/src/lib/scanClient.test.ts | c9f850561062eb011c0d97ca02d95898301fdd2b | 1–1760 | S02 |
| apps/web/src/lib/scanCursorSlot.test.ts | f83c257546972347ae3860d15c53c20388aeb7e6 | 1–312 | S02 |
| apps/web/src/lib/scanMatches.test.ts | 2973e6da0371537fa5198bc01998f83fc49bdd40 | 1–33 | S01 |
| apps/web/src/lib/scanSpam.test.ts | 762deed547d68f934999994d770369b2ee95c9ad | 1–272 | S01 |
| apps/web/src/lib/scannerCore.bench.nocov.test.ts | 907f5f380fd846c46cd4737deb6aeae8878a2bc4 | 1–54 | S01 |
| apps/web/src/lib/scannerCore.fuzz.test.ts | 77ce0bd28772235418d9e241b0da84028068035f | 1–38 | S01 |
| apps/web/src/lib/scannerCore.spam.nocov.test.ts | 671e4041953379c58270388eebb201fcec2dd541 | 1–194 | S01 |
| apps/web/src/lib/scannerCore.test.ts | 902cb6d07492fc8b08131d17b94d7d3fbc70c826 | 1–198 | S02 |
| apps/web/src/views/Scan.autoRescan.test.tsx | 1c52101fd63804fa5e80c540923d89a5606afc8e | 1–157 | S01 |
| apps/web/src/views/Scan.i18n.test.tsx | 2892f973dcb48a6076eb38e768bd43082378becb | 1–94 | S01 |
| apps/web/src/views/Scan.privacy.test.tsx | 5ca8631fb1f25658ae55e122d10e22027c0d5e51 | 1–92 | S02 |
| apps/web/src/views/Scan.test.tsx | 8b2fcf37b6c7670c20938018a3810265fd777152 | 1–696 | S02 |
| apps/web/src/views/ScanPrivacy.i18n.test.tsx | bd5571c580d0fbfb882bf15d0e39c97e1ff60231 | 1–216 | S01 |
| apps/web/src/lib/privateScanLifecycle.test.ts | 8d8f2e22bdff1be59721a9ce1a7b8ad29eaeb4ad | 1–190 | S04 |
| apps/web/src/lib/privateScanPerformance.nocov.test.ts | 548916051671c2645c584d5e459a583405db65cf | 1–260 | S04 |
| apps/web/src/lib/privateScanStore.test.ts | c39c51ef15e04127ea434ed6cbb98791c7eb851d | 1–304 | S04 |
| apps/web/src/lib/reconciliationVault.idb.test.ts | 4c52b6fe0c7224ef4812ab6d31a07b401d721862 | 1–200 | S04 |
| apps/web/src/lib/scanClient.test.ts | 297c6f0cbf22e8e351f42579c05dc4c79bdb6cc5 | 1–1995 | S04 |
| apps/web/src/lib/scanCursorSlot.test.ts | 3565f11dd4ef6cee70789fa26c9da22e4230a03d | 1–404 | S04 |
| apps/web/src/lib/scanSpam.partial.test.ts | ceeba44eb5156581c4fa9c65b3104109306bff1e | 1–37 | S05 |
| apps/web/src/lib/scannerCore.test.ts | 64d9d0d95a66da023f2968faa7bd97c7dbe66605 | 1–256 | S04 |
| apps/web/src/views/Scan.privacy.test.tsx | 146a90721ae039959af1ce4cd973c572394721f7 | 1–117 | S04 |
| apps/web/src/views/Scan.privateCheckpoint.test.tsx | a704ec91667f26d087cb732e273873a2b8514560 | 1–440 | S04 |
| apps/web/src/views/Scan.stealthExport.authorization.test.tsx | 576a2c5ff4bc13b61181d554c7a59135070d1cb9 | 1–172 | S04 |
| apps/web/src/views/Scan.stealthExport.test.tsx | a386af69cb9c30910df93438cb8d589d16229980 | 1–124 | S04 |
| apps/web/src/views/Scan.test.tsx | c25de17f75fcea631452b769aadede99a305f25f | 1–703 | S04 |

## Exact excluded source

| Path | Full blob | Lines | Rule | Head set |
|---|---|---:|---|---|
| packages/hygiene/src/destination.test.ts | 17428fd39a1abdce421326bb14d4069ccf00c2aa | 162 | HYGIENE_UNUSED_TEST | S01 |
| packages/hygiene/src/hop-source.test.ts | 66fea14996baf0da07c122e69e0dd1114974f31f | 63 | HYGIENE_UNUSED_TEST | S01 |
| packages/metadata-hardening/src/amounts.test.ts | ae17376455d96bb084a019f38341bc228d8a7300 | 120 | METADATA_UNUSED_TEST | S01 |
| packages/metadata-hardening/src/btc.test.ts | 0329c475d4a46cc623a4ae304ac3a8416dc21fde | 181 | METADATA_UNUSED_TEST | S01 |
| packages/metadata-hardening/src/derive.test.ts | 945a62819e56904d6e7f30992fb393af57272aa5 | 118 | METADATA_UNUSED_TEST | S01 |
| packages/metadata-hardening/src/direct.test.ts | 6b9b2456f54576890ea7ab77b95020dfc7fbf96c | 66 | METADATA_UNUSED_TEST | S01 |
| packages/metadata-hardening/src/invoice.test.ts | 69f68168e7cf0ab278d953b23ede5959cf276152 | 82 | METADATA_UNUSED_TEST | S01 |
| packages/metadata-hardening/src/scan.test.ts | 0c5ea5e7d4b2a9788fe0a2b83fff7dc1d962e70d | 101 | METADATA_UNUSED_TEST | S01 |
| packages/metadata-hardening/src/tags.test.ts | 40f348e7fe6d367093811ee5807f592187fd52a7 | 85 | METADATA_UNUSED_TEST | S01 |
| packages/metadata-hardening/src/web.test.ts | 7ca4869d8fbad003efe79edff5f7e2340a137a1d | 76 | METADATA_UNUSED_TEST | S01 |
| packages/net-transport/src/fakeHpke.testutil.ts | 6d5573edf042784ebd0ed23fb3e23084bd1a2c46 | 93 | NODE_TRANSPORT_UNUSED_TEST | S01 |
| packages/net-transport/src/ohttp.test.ts | b32eee2a7adf9b84b9c4b5c0bf11f3fb739705d8 | 378 | NODE_TRANSPORT_UNUSED_TEST | S01 |
| packages/net-transport/src/socks.test.ts | 780601901ded5ec3ef99b42db9ebc383a2178317 | 674 | NODE_TRANSPORT_UNUSED_TEST | S01 |
| packages/scan-source/src/composite.test.ts | 9246734a198f12adf9512da541dd247d13d3c08a | 145 | SCAN_MODES_UNUSED_TEST | S02 |
| packages/scan-source/src/pir2.test.ts | 2f1740ea8289dfafa08a7614114eb2880c033570 | 113 | SCAN_MODES_UNUSED_TEST | S02 |
| packages/ux-vault/src/confusables.test.ts | 0825066436d44673e7c881de6c6e74014da9a74e | 155 | UX_NODE_UNUSED_TEST | S01 |
| packages/ux-vault/src/contacts.test.ts | 15462e18c59b6351ff222e80999d5e96d080b7c1 | 224 | UX_NODE_UNUSED_TEST | S02 |
| packages/ux-vault/src/envelope.test.ts | 8608ab75206841194d26a5c58ee67f66b2f58ae8 | 187 | UX_NODE_UNUSED_TEST | S01 |
| packages/ux-vault/src/memory.testutil.ts | b796c38449ab06baedb79011bfaeeedc9ad774dc | 43 | UX_NODE_UNUSED_TEST | S01 |
| packages/ux-vault/src/schema.test.ts | 7c1e3b90b90c9e9254b1755568457b870513594d | 280 | UX_NODE_UNUSED_TEST | S02 |
| packages/ux-vault/src/vault.test.ts | 196fa33df5e2ee5ca910fd05ea88a075300f1c28 | 364 | UX_NODE_UNUSED_TEST | S02 |
| packages/scan-source/src/composite.test.ts | 4280a956a606315455c39b1b254a13b21aaf004c | 145 | SCAN_MODES_UNUSED_TEST | S04 |
| packages/scan-source/src/pir2.test.ts | 99678e91f2a22a2d0e8ef74dbece3a040a300bde | 121 | SCAN_MODES_UNUSED_TEST | S04 |
| packages/ux-vault/src/contacts.test.ts | 2db7c9fbcc61e6b27a735f19ea658c3911d128a6 | 224 | UX_NODE_UNUSED_TEST | S04 |
| packages/ux-vault/src/schema.test.ts | 9cdb54565aa5d3d4140d59ed80689dcc02a0dd36 | 280 | UX_NODE_UNUSED_TEST | S04 |
| packages/ux-vault/src/vault.test.ts | 50fd4de340c7f1a090059d2d4652f84d10d4bf0a | 364 | UX_NODE_UNUSED_TEST | S04 |

## Immutable head membership

| Head ID | Branch label | Full commit SHA |
|---|---|---|
| H01 | main | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| H02 | release/ghostpay-beta-qualification-20261119 | 417f7c71daf8645e1432f2ec8f070110879b80bd |
| H03 | integration/ghostpay-completion-20261120 | e22c1748a3de6eb02f5be3abe27d634b238c67c6 |
| H04 | snapshot/ghostpay-privacy-8be15289-20261120 | d6819796a9542acc488b896786faffe83b913d9b |
| H05 | feat/ghostpay-privacy-quick-hide-20261120 | 137628961463fc5abd8b7927b2efe6b18a0a206a |
| H06 | fix/ghostpay-format-validation-20261120 | a9e0715573f7247d7a16f9d1d030cf0232708fb2 |
| H07 | fix/ghostpay-pages-integrity-gate-20261120 | 936d054ed067d89c773310d42e33939c1129bbfa |
| H08 | automation/20261120T0434Z/bug/erc20-simulation-result | 87cf6c603338ad64ec02300fe42b96c3e0a205b9 |
| H09 | automation/20261120T004531Z/feature/clipboard-guard | 6c648770f5647ca7993cc108ef9e5ede9b46b4c9 |
| H10 | automation/20261120T0115Z/coordinator/clipboard-qualification | 04910f65dc0268e41519c4b1a44e83264272f0bf |
| H11 | automation/20261120T0115Z/worker/receipt-hash-validation | acbf39ee21ad35e9d14df958fa16fbcc2e230cae |
| H12 | automation/20261120T0243Z/worker/format-units-validation | 7523da612ba365451f1d5c2dbc01d0bdeedbe8c7 |
| H13 | automation/20261120T003500Z/coordinator/qr-runtime-qualification | ec546311f994fe1db544fe85ff2aa6db428d67d4 |
| H14 | fix/ghostpay-qr-conflict-expiry-20261119-c374725a11b7 | 172695efb41665a4e50d335029e54184bbb5b328 |
| H15 | automation/20261119T2243Z/bug/base64url-runtime-input | 856b2d60fd38eabb8a1c856c95ad82f1c7d30c64 |
| H16 | automation/20261119T204728Z/bug/qr-kind-failclosed | 89942105c48df03b9351f777278b6a992e35a95e |
| H17 | automation/20261119T183817Z/bug/merchant-pin-duplicate-json | 9fbf3312cb8e65083f604cc0bf0512d59c83f141 |
| H18 | automation/20261119T1640Z/bug/scan-privacy-partial-30d | 0041514a630398c89693498d9b5e44ef562d9c61 |
| H19 | automation/20261119-c977/bug/build-profile-failclosed | 25c380f253e3338c0e6b79e8d052cdf8950f9e88 |
| H20 | automation/20261119T124337Z/bug/qr-utf8-surrogate-guard | b5fc0991eb7cc12fcdfaea514f1fee5be1eca2a0 |

| Head set | Exact members |
|---|---|
| S01 | H01, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H12, H13, H14, H15, H16, H17, H18, H19, H20 |
| S02 | H01, H08, H12, H15, H16, H17, H18, H19, H20 |
| S03 | H01, H02, H03, H06, H07, H08, H09, H10, H11, H12, H13, H14, H15, H16, H17, H18, H19, H20 |
| S04 | H02, H03, H04, H05, H06, H07, H09, H10, H11, H13, H14 |
| S05 | H02, H03, H04, H05, H06, H07, H09, H10, H11, H13, H14, H18 |
| S06 | H02, H03, H06, H07, H09, H10, H11, H13, H14 |
| S07 | H04, H05 |

## Handoff artifacts

- /workspace/scratch/e1ba011306bd/scan_custody_tests_wave3.json
- /workspace/scratch/e1ba011306bd/scan_custody_tests_wave3_remaining.json
- /workspace/scratch/e1ba011306bd/scan_custody_tests_wave3_import_closure.json

The production_reconciliation array in the full ledger preserves each of the 109 prior custody pending/partial path/blob rows and its exact successor ledger disposition. That reconciliation adds no duplicate source-review count.
