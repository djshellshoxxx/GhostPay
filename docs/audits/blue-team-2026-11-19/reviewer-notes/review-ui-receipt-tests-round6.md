> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# UI, receipt and invoice test review — round 6

**Clean checkpoint: 40 immutable versions / 5,710 version-lines reviewed.** The remaining **26 versions / 3,053 version-lines are entirely untouched**, with no partially read file. The full 25-version payment-test remainder is complete.

Frozen main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. Combined candidate: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.

## Outcome

No new production vulnerability or behavior defect was established in this test-source batch. Two bounded test assurance observations are recorded below separately from the canonical production findings. Tests were inspected, never executed; no passing or failing runtime result is claimed.

## Review evidence and implications

### Receipts, invoice creation and signer trust

The newest ReceiptPanel test at blob `8f14ca64dfef6668c59d280597dd252adf849bb0` (lines 41–118) explicitly requires omission of the one-time recipient address by default, inclusion only after an explicit choice, and reset of that choice on another payment, another seller or remount. The web receipt helper test at `d8770c168ada02cedf50ecaa8bb47060f7199a35` (lines 137–149) verifies both minimal and address-bearing formats. These assertions support the intentional omission boundary underlying existing PN-05; they do not resolve the unqualified Pay import description. The earlier receipt variants require the address and were reviewed by complete counterpart plus every changed/deleted diff line.

Invoice-bound ReceiptPanel tests (`909b92a8ba967c82af14dfffe0385b34ef4331ad`, lines 53–200) exercise local-open consent, a separate signing choice, valid scan/invoice binding, expiry recheck, same-key session reinstall refusal, stale parser completion, single-flight retention through cancel/edit/revoke/unmount, and clearing of a derived digest when binding is invalidated. Archive tests assert scoped vault selection, locking on both success and failure, and stale-match result suppression. Profile tests narrow manual receipt mode out of lean shells.

Signer-pin store and component tests cover exact identity selection, full-key confirmation, replacement/removal against the displayed old key, bounded strict storage parsing, failed reads/dropped writes, contended or absent locks, monotonic revisions, rereading actual storage on events, and rejection of stale delayed mutations. They do not turn a valid unpinned signature into a trusted identity.

CreateInvoice tests cover the actual signed local link, exact fixed-token and fiat arithmetic, temporary signing-buffer zeroization, backup gating, explicit local-vault registration, profile narrowing and unsupported-result refusal, asynchronous result ordering, and encryption opt-out confined to the current seller session. The newer privacy suite (`e882d1107eb8a88c4583094a1081a82fc7d1f644`, lines 60–118) requires encryption to return after remount or session replacement, clears old invoice text, and discards a late result from the prior session. The gas-buffer suite was read only as assigned test source; full-profile features are not described as available in the lean Pages beta.

### Camera, registry and shared helpers

All six CameraImporter suites were read. The lifecycle suite uses the real camera wrapper over fake MediaDevices and directly observes track lifetimes, camera switches, late grants and hidden-page behavior. The main suite checks that a cancelled permission request cannot replace or stop a newer stream. Multipart tests keep the real assembler and assert rejection/reset boundaries, bounded progress, single delivery, explicit retries and no payload display. Visibility tests (`591becf9ad1f59e143bd3356b9b3a1bcc1ec6d11`, lines 50–154) refuse hidden dispatch even before the event is delivered and discard delayed image/paste results after a visibility change.

Registry tests retain the public-link consent and backup gates, separate call review and submission, strict deployment/typehash refusal, exact register/clear data, and consent withdrawal during wallet recheck. ENS lookup tests invalidate a held result even if input is changed back to the same name. The network suite (`f2a879bf1deecde6c8ad94d40a21096dcbe1c04c`, lines 30–78) uses a deliberately non-cooperative held RPC to require late-result suppression after authority revocation, with a fresh explicit lookup needed for retry. The reference ERC-1271 fixture and optional Anvil harness were fully read but never compiled or started.

Common and clipboard tests assert opt-in delayed cleanup, invalid-delay refusal, matching content checks, superseded copy generations, permission failures, and stale-copy status reset. Download tests check delayed URL revocation and cleanup when attachment or browser click fails. These assertions do not establish atomic clipboard compare-and-clear or real-browser permissions.

BROWSER-01 remains unchanged. Its existing Pay route clearing/retry regression is already documented; this review makes no claim that the route test is absent.

## Test assurance observations

### UI-RECEIPT-TEST-ASSURANCE-01 — Optional Anvil availability check treats bare command names as installed

**Informational; high confidence.** The documented optional skip path uses available = (!ANVIL.includes('/') || existsSync(ANVIL)) && existsSync(SOLC) && existsSync(REF). A bare name such as the default anvil passes this check regardless of whether it resolves on PATH. With solc and the reference source present but no Anvil binary, the suite is selected and startup rejects through the spawn error handler instead of skipping. REQUIRE_ANVIL is not needed for that path.

Optional local qualification can fail for a missing optional dependency even though the source documents a skip. This is a test harness issue, not an application defect or a claim about this environment.

**Remediation:** Resolve a bare executable name against PATH, or use an explicit capability check before selecting the suite; keep REQUIRE_ANVIL as the explicit fail-if-missing gate. Preserve clear distinction between skipped and executed integration coverage.

Source: `apps/web/src/features/registry/registry.anvil.test.ts`, blob `a49f0439dc4ffdec9449df3fee32fc92ba114c8d`, representative commit `87cf6c603338ad64ec02300fe42b96c3e0a205b9`, ranges 11–19, 43–57, 60–65, 106–111. The exact blob is present on both frozen main and the combined candidate.

### UI-RECEIPT-TEST-ASSURANCE-02 — Final RegistryView negative case does not isolate malformed registry-entry handling

**Informational; high confidence.** The case titled reports no entry, bad input and malformed entries configures only an empty bytes entry, checks the no-entry message, then enters a syntactically valid ENS name and checks for any alert. It never supplies malformed registry-entry bytes for a valid address. Those assertions therefore do not independently establish the malformed-entry UI path described by the title.

A route-level malformed-entry regression could remain untested by this case. This is not a claim that malformed registry values are accepted or that the whole repository lacks coverage: registry.anvil.test.ts lines 141-145 separately assert adapter rejection of malformed stored bytes.

**Remediation:** Split the route cases and supply a malformed registry result after a valid deployment/typehash response for a valid address; assert the intended refusal and absence of usable lookup data. Narrow the current title to its actual assertions if no additional route case is intended.

Source: `apps/web/src/features/registry/RegistryView.test.tsx`, blob `fb79a7398af4872f6cb129914dfea12b96cb8d6d`, representative commit `87cf6c603338ad64ec02300fe42b96c3e0a205b9`, ranges 36–48, 279–290. The exact blob is present on both frozen main and the combined candidate.

## Method and constraints

Complete immutable source was read with line numbers, or through a fully read counterpart plus every added/deleted line of the exact blob diff. Read-only checks verified all 40 commit/path/blob associations and line counts. The completed and untouched sets exactly partition the assignment. Initial outer-output truncation was repaired by reading the complete affected ReceiptPanel invoice/profile/newest core tests again before counting them.

No target tests, builds, scripts, probes, proof-of-concept execution, transactions, dependency installation, application/test/configuration edits, Git mutation or pushes occurred. Only local audit notes were written. No English catalog, CSS or E2E worker source was read.

## Completed immutable versions

| Path | Blob | Representative SHA | Version lines | Method |
|---|---|---|---:|---|
| `apps/web/src/components/InvoicePaymentSummary.test.tsx` | `ceb237b51e68887f5932b8a87ddf4e71a7719522` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 41 | Full source |
| `apps/web/src/components/MerchantTemplateIssuer.test.tsx` | `c162fb9ca1ba5b71cbc34296172a2339883fc9a1` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 35 | Full source |
| `apps/web/src/components/ReceiptPanel.archive.test.tsx` | `93dc56732d3fc433d640fb88b04d1f13295beac1` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 92 | Full source |
| `apps/web/src/components/ReceiptPanel.i18n.test.tsx` | `ee6c99f0a4dc9d5c3a8d47194f9e6425c24e8d06` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 67 | Full source |
| `apps/web/src/components/ReceiptPanel.invoice.test.tsx` | `909b92a8ba967c82af14dfffe0385b34ef4331ad` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 200 | Full source |
| `apps/web/src/components/ReceiptPanel.profile.test.tsx` | `ba9b2d6b690c2494cad7c4c3633abff7de6a0d4c` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 85 | Full source |
| `apps/web/src/components/ReceiptPanel.test.tsx` | `1ba3f5cce99b7a13d2b6cb21d728bf152d283353` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 93 | Full counterpart + complete diff |
| `apps/web/src/lib/format.test.ts` | `3d6a9f5fade916452bc64fe98a3c9abb64add101` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 78 | Full counterpart + complete diff |
| `apps/web/src/lib/invoiceCreate.test.ts` | `b852ad654e5d78f79d971accd90810dd7d82f549` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 149 | Full source |
| `apps/web/src/lib/merchantTemplate.test.ts` | `cfd2b73cdd1497a20e940c62ccbe59210af4f9a3` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 114 | Full source |
| `apps/web/src/lib/receipts.test.ts` | `70e1c9aed859596389f5b43b93e0d6ff26f58bec` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 135 | Full counterpart + complete diff |
| `apps/web/src/views/CreateInvoice.buffer.test.tsx` | `5c4269fa33cad4250deba0b955c4a090c0b269bd` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 249 | Full source |
| `apps/web/src/views/CreateInvoice.i18n.test.tsx` | `8269636eef8652821346ec8fa375671409561e21` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 51 | Full source |
| `apps/web/src/views/CreateInvoice.ordering.test.tsx` | `5cded4b3666f14dc57f1878c245a59d6bed4192a` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 76 | Full source |
| `apps/web/src/views/CreateInvoice.register.test.tsx` | `c0ab7561bb91cc777026c081a9ee39ff54db2e41` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 83 | Full source |
| `apps/web/src/views/CreateInvoice.supported.test.tsx` | `17feff9faf1ceb38432b63cd1cf361433827b340` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 159 | Full source |
| `apps/web/src/views/CreateInvoice.test.tsx` | `0d1ca5555de25aeebebccec61232bedbad4e1c18` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 267 | Full counterpart + complete diff |
| `apps/web/src/components/InvoiceSignerVerification.test.tsx` | `28a040d3b4b2049f97d90c6de10605aa32fd9210` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 143 | Full source |
| `apps/web/src/components/ReceiptPanel.test.tsx` | `8f14ca64dfef6668c59d280597dd252adf849bb0` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 142 | Full source |
| `apps/web/src/lib/format.test.ts` | `43d5b5c882abdfb392776dd13d772e972f13ab46` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 92 | Full source |
| `apps/web/src/lib/invoiceSignerPins.test.ts` | `d0f00af1cc06573870f047967b97087cc086628d` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 306 | Full source |
| `apps/web/src/lib/invoiceVerification.test.ts` | `dc43e8c535e862c4e5798d5b757f6335d29c6ce0` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 54 | Full source |
| `apps/web/src/lib/receipts.test.ts` | `d8770c168ada02cedf50ecaa8bb47060f7199a35` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 149 | Full source |
| `apps/web/src/views/CreateInvoice.privacy.test.tsx` | `e882d1107eb8a88c4583094a1081a82fc7d1f644` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 118 | Full source |
| `apps/web/src/views/CreateInvoice.test.tsx` | `de1c61ddaee5a7e2ef33b41a2c02a6bbfda6569e` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 281 | Full source |
| `apps/web/src/components/CameraImporter.behavior.test.tsx` | `4c6e955619e147baca36ad0ba8fecc48c806d640` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 142 | Full source |
| `apps/web/src/components/CameraImporter.i18n.test.tsx` | `5cd833b00369917e7e2caf62f9e1b3bb673623b8` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 137 | Full source |
| `apps/web/src/components/CameraImporter.lifecycle.test.tsx` | `9e66a8f7cccd7a5e9cd4cec94f79b6ddeb70926e` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 278 | Full source |
| `apps/web/src/components/CameraImporter.multipart.test.tsx` | `58833ea84270b29d5b21eb5fb10ccb5a9928187b` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 401 | Full source |
| `apps/web/src/components/CameraImporter.test.tsx` | `9de1420a4ffd86d57aff5500da6db386565efd23` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 158 | Full source |
| `apps/web/src/features/registry/RegistryView.export.test.tsx` | `10fc44d00152be737dbf4f3a172624cce0337b1d` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 71 | Full source |
| `apps/web/src/features/registry/RegistryView.i18n.test.tsx` | `03180167b4e9ae29e8294d1cee73028cb360de46` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 87 | Full source |
| `apps/web/src/features/registry/RegistryView.test.tsx` | `fb79a7398af4872f6cb129914dfea12b96cb8d6d` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 291 | Full source |
| `apps/web/src/features/registry/ref/Registry1271Wallet.test.sol` | `051aec1851c392ab9c5040bd34e8137d01ac1d6a` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 34 | Full source |
| `apps/web/src/features/registry/registry.anvil.test.ts` | `a49f0439dc4ffdec9449df3fee32fc92ba114c8d` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 252 | Full source |
| `apps/web/src/views/RegistryView.route.test.tsx` | `1e72d4e6486fc9022994ac052182f881c805e04a` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 53 | Full source |
| `apps/web/src/components/CameraImporter.visibility.test.tsx` | `591becf9ad1f59e143bd3356b9b3a1bcc1ec6d11` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 154 | Full source |
| `apps/web/src/features/registry/RegistryView.network.test.tsx` | `f2a879bf1deecde6c8ad94d40a21096dcbe1c04c` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 78 | Full source |
| `apps/web/src/components/Common.test.tsx` | `0d7bbf035fc95e8f79c84b7766b87c7b43eaed37` | `6c648770f5647ca7993cc108ef9e5ede9b46b4c9` | 204 | Full source |
| `apps/web/src/lib/clipboardPrivacy.test.ts` | `2af15327f398c18c7dc09cb890b9008d150c4198` | `6c648770f5647ca7993cc108ef9e5ede9b46b4c9` | 111 | Full source |

## Exact fresh-worker handoff

Read remaining_untouched in full. All 26 versions / 3,053 version-lines are untouched; exact path/blob/representative SHA/line_count/refs/assignment source are preserved. The payment remainder is exhausted. Do not reread completed counterparts unless independently needed. Continue other shared/QR UI, i18n and About/Settings/Disclosure tests. No English catalog, CSS or E2E worker scope was read. Preserve BROWSER-01 correction and PN-05 optional-address interpretation. Do not run target tests/builds/scripts or mutate target/source/Git.

| Path | Blob | Representative SHA | Unread lines |
|---|---|---|---:|
| `apps/web/src/components/ContextHelp.test.tsx` | `6c282bff7a223286c431c41514351ba6c6d2b2c2` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–145 |
| `apps/web/src/components/ErrorBoundary.test.tsx` | `b1bdf393bac0b9fb3e576f3b526d2f78d21b9f76` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–65 |
| `apps/web/src/components/PaymentRequestQr.test.tsx` | `167776cdc0703bed151715ff619197649da0d2fe` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–138 |
| `apps/web/src/components/PrintableBill.test.tsx` | `4e80b81546f6d10464ef2dd25464036113d0e817` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–111 |
| `apps/web/src/components/QrFrame.i18n.test.tsx` | `31c15bcb5a18296b67942bf93cdc30c32426d2c3` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–42 |
| `apps/web/src/components/QrFrame.largeWarning.test.tsx` | `7c8c1cf7150a88a5487a8b0db9496c7287c22af3` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–21 |
| `apps/web/src/components/QrFrame.security.test.tsx` | `642a51e40607844f2af9e5d59a3e1a0e752b3c4f` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–106 |
| `apps/web/src/components/QrFrame.test.tsx` | `6f84f7e43f15afae4bc1f292a95510ead7bd2123` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–162 |
| `apps/web/src/components/QrView.i18n.test.tsx` | `474affeda6d8f7e68a0bd4d4a976350b92a8291f` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–56 |
| `apps/web/src/components/QrView.test.tsx` | `8dc103ff3c081a63bc631aa9e532fdf2de2e3bd0` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–21 |
| `apps/web/src/components/SharedComponents.i18n.test.tsx` | `a48fbe04da171154ba009ce11132e30ffbcaf80f` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–238 |
| `apps/web/src/i18n/LanguagePicker.test.tsx` | `8b492301d0bd857770581acf17de66ec82883053` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–73 |
| `apps/web/src/i18n/Trans.test.tsx` | `39a69e994819cacf23d3e03c2d8f1f464302a552` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–54 |
| `apps/web/src/i18n/catalog.test.ts` | `cebbbc60c3f01698d90ddf24c08de95d8f98e8c5` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–45 |
| `apps/web/src/i18n/context.test.tsx` | `1ec8e02639c038ec458e762886d45cbb20ea1ca1` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–67 |
| `apps/web/src/i18n/languages.test.ts` | `68d1fed519cb0a86b8f9804bbe8f063fda455e1d` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–82 |
| `apps/web/src/i18n/message.test.ts` | `6bc2e91cdf4ed5402f895f8cc8d2a296702fff1b` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–216 |
| `apps/web/src/i18n/securityKeys.test.ts` | `5efd78ea6c77a1e161a0716199e853d57138cacb` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–215 |
| `apps/web/src/i18n/settings.integration.test.tsx` | `8142f472ee68134bf07508fab46ea5354bba67f4` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–45 |
| `apps/web/src/i18n/storage.test.ts` | `b02a7ca4af0c1c5cc7efb812ba545166a5d6cda1` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–41 |
| `apps/web/src/i18n/translator.test.ts` | `580a69de0a6272210fbbc3f23677b6af3ef5ed42` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–53 |
| `apps/web/src/views/About.test.tsx` | `b7efecde8c62043aa894385a3af05f91eb8382d5` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–99 |
| `apps/web/src/components/Disclosure.manifest.test.tsx` | `da7fd9a6813dc6b1ddfa1aaa5ec165d199b525e8` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–72 |
| `apps/web/src/i18n/message.test.ts` | `b9bb238e31af3b5febf5f05972da4c5f9b960649` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–216 |
| `apps/web/src/i18n/securityKeys.test.ts` | `14ea92f4f68a910aadc6ac78003c4443de1ffa76` | `137628961463fc5abd8b7927b2efe6b18a0a206a` | 1–234 |
| `apps/web/src/views/Settings.test.tsx` | `226c2c17faf611a1611acc9d40665c6e07fbb450` | `e4d54a6829fcc861de7af1669c0e0f64f62aa137` | 1–436 |

The companion JSON preserves references, original assignment indexes, exact completed methods and all remaining rows. Root owns final repository notes and global reconciliation.
