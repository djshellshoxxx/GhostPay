> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# GhostPay payment test-source audit — round 4 checkpoint

Completed **28 of 69 assigned immutable test/support versions (10,207 version-lines)**. **41 versions (12,077 version-lines) remain**, listed exactly below and in the companion JSON. All completed records cover their complete source, either directly or through a fully read counterpart plus every changed/deleted line in the exact blob diff. No partial test file remains in progress.

**No new distinct production finding was established.** The principal new evidence is a correction to the BROWSER-01 test-gap assessment: Pay already has a route regression test for confirmed clearing and retry. This audit does not claim that test was executed or passed on the affected branch.

## Boundary and provenance

- Scope: exact `/workspace/scratch/e449ed9154f6/payments_tests_round4-assignment.json` rows.
- Frozen main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Primary combined candidate: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.
- Each table row identifies a representative immutable commit and exact source blob; sibling branch fixes must not be assumed integrated into other snapshots.
- Read only: no application, test, configuration or dependency edits; no target execution, builds, tests, vulnerability reproduction, live probes, wallet/chain actions, Git mutations or publishing. Only these local audit records were written.
- Previous payment findings PN-01 through PN-05 and custody finding BROWSER-01 were read before this pass to avoid duplication.

## Important correction: BROWSER-01 already has a Pay route regression test

Affected quick-hide commit: `137628961463fc5abd8b7927b2efe6b18a0a206a`.

`apps/web/src/views/Pay.test.tsx`, blob `7ef3db702caa56538a7fd4e82e63eafb895debd5`, lines **647–663**, already tests a rejected wallet request, refusal of a duplicate request, explicit confirmed clearing through the rendered Pay route, and a subsequent second request. The setup at 483–490 connects a wallet through the ordinary route. The test file resets the tab journal at 28–33. Exact `git rev-parse` inspection confirms the affected #300 branch contains this same test blob.

The complete helper `apps/web/src/test/render.tsx`, blob `dbd0a6a491b6284a39a7e185847713184a97be88`, mounts `App` through `ServicesContext` at 39–44; this helper does not replace WalletAttempts. The affected WalletAttempts source (blob `a9aef3f940bed8f3e26a45ffd75aedea2f0b5563`, lines 24–40) hides the only clear button when the wallet prop is absent. Exact Pay call sites (blob `c44a7789d5c0a7c9952944c11e5dfcbdd00ba099`, lines 1055–1059 and 1124–1127) omit that prop.

**Inference from source:** the existing route test expectation conflicts with the affected #300 wiring and should expose the regression when executed on that source. No runtime failure was observed because tests were not run. Keep BROWSER-01 as a production finding, but do not describe Pay clearing as wholly missing route-test coverage. Extend pre-existing journal, disconnect, account-change and chain-change scenarios where appropriate after repairing the wiring.

The fully read journal tests independently confirm persistence and duplicate protection: `duplicateAttemptJournal.test.ts` blob `ca7d71ac96456ac1d1f1d641b5ab474d4e07fd5e` lines 12–42; `walletJournal.test.ts` blob `8dd95a9edf5be8465b340fab6b27bcb65111766a` lines 11–30. This is supporting evidence for the existing impact, not a separate finding.

## Existing findings: additional test evidence

### PN-01 receipt binding

The complete payment execution source and both assigned corrected variants were inspected. In `payExec.test.ts` blob `0e9a3abe4e78e4091b19614ef68efb285b5c1254` at `a9e0715573f7247d7a16f9d1d030cf0232708fb2`, lines 130–207 cover a wrong receipt transaction identity, unsupported receipt status, and non-string transaction fields. The assertions preserve the submitted hash, classify verification as incomplete, retain the attempt journal and prevent a second wallet submission. The earlier corrected blob `4deb9d710209a5a83a8ae9d5dcecf3aac1058748` at `acbf39ee21ad35e9d14df958fa16fbcc2e230cae` contains the receipt-identity regression block at 130–149.

`wallet.test.ts` corrected blob `0eef38ea9deb736072515d3240eeabfbd6b5e49b` adds non-string transaction-field checks and receipt-hash/status cases; `d76eae2520f89b14208485a79f8e686117382a55` contains the earlier receipt-hash checks. Full test sources plus exact diffs also show receipt fixtures updated to carry transactionHash in payment execution, acceptance and Pay UI tests. This supports the existing fix assessment; it is not execution evidence.

### PN-04 ERC20 simulation classification

`txGuard.test.ts` blob `1f1749730b2af7483bacdeecc29f2fbda5490de3` at `87cf6c603338ad64ec02300fe42b96c3e0a205b9`, lines 61–89, explicitly distinguishes canonical true, canonical false, empty legacy return, malformed nonempty data, and generic eth_call behavior. The complete exact diff to sibling blob `c5c6f6488a7ddd52bc175df6b8221ff45b2fd44d` shows that malformed-return regression block is absent there. No new defect is added.

## Other reviewed test behavior

Full-source review covered payment amount and calldata binding, invoice and buffer validity after asynchronous wallet steps, permit classification and fallback, post-broadcast error sanitization, relayer transport/request formatting, wallet discovery boundaries, Pay network-grant replacement, signer pin invalidation, supported-build intake, QR confirmation/cancellation and locale changes during pending wallet confirmation. Assertions were inspected for the claimed boundaries; this statement does not imply test execution, global coverage completeness, or absence of defects beyond the reviewed source.

The long Pay source additionally includes receipt import consent, changed-file and changed-trust races, invalid signatures, stale preparations, approval/payment separation, explicit send gestures, recovery, and preservation of submitted results after expiry. The minimal-receipt wording issue PN-05 is unchanged by these inspected route assertions. Invoice/receipt component/helper tests remain in the exact remainder for a fresh reviewer.

## Completed assigned versions

| Index | Path | Blob | Representative commit | Lines | Method |
|---|---|---|---|---:|---|
| 7 | `apps/web/src/lib/duplicateAttemptJournal.test.ts` | `ca7d71ac96456ac1d1f1d641b5ab474d4e07fd5e` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–63 | Full source |
| 11 | `apps/web/src/lib/pay.test.ts` | `7e27cf90328b7d9421e394edc10515e61157a1d5` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–611 | Full source |
| 12 | `apps/web/src/lib/payExec.acceptance.test.ts` | `4dded28d0f6c9521b07c07557cf2df589ba4fdba` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–171 | Full source |
| 13 | `apps/web/src/lib/payExec.test.ts` | `3554a2315bfffd0116d2ec2abaaf73f7b0dbc2cd` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–947 | Full source |
| 15 | `apps/web/src/lib/relayerClient.test.ts` | `42151b26b4fcbcdeefc09268065e2f648ca17a97` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–145 | Full source |
| 16 | `apps/web/src/lib/relayerContract.test.ts` | `5b19f96b0706156df832a873f07486356d219dd7` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–112 | Full source |
| 19 | `apps/web/src/lib/transactionOutcome.test.ts` | `90b3f7c9212cedf477e37a70be285dacba302fa4` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–177 | Full source |
| 20 | `apps/web/src/lib/txGuard.test.ts` | `1f1749730b2af7483bacdeecc29f2fbda5490de3` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–183 | Full source |
| 21 | `apps/web/src/lib/wallet.test.ts` | `6416192e15102bf6725eac9b945ff45681d021ff` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–272 | Full source |
| 22 | `apps/web/src/lib/walletDiscovery.hardening.test.ts` | `a454618d901299be8292f19e12ecd617f0a45b7d` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–161 | Full source |
| 23 | `apps/web/src/lib/walletJournal.test.ts` | `8dd95a9edf5be8465b340fab6b27bcb65111766a` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–70 | Full source |
| 30 | `apps/web/src/views/Pay.i18n.test.tsx` | `b8d80d61869c5c0ec015302a872a63269534d6ad` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–135 | Full source |
| 31 | `apps/web/src/views/Pay.invoiceQr.test.tsx` | `3eb5ab0072c4cf5c61b7502d68d0e141dfd3b133` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–373 | Full source |
| 32 | `apps/web/src/views/Pay.supported.test.tsx` | `d19f8f7efd6ca0fb5b5d6ef738e1fcf56fb8f83d` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–170 | Full source |
| 33 | `apps/web/src/views/Pay.test.tsx` | `7ef3db702caa56538a7fd4e82e63eafb895debd5` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–1273 | Full source |
| 41 | `apps/web/src/lib/payExec.acceptance.test.ts` | `6eafa0466c682977baa69b7c87b91ffd8b79c227` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–171 | Full counterpart + complete blob diff |
| 42 | `apps/web/src/lib/payExec.test.ts` | `0e9a3abe4e78e4091b19614ef68efb285b5c1254` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–1025 | Full counterpart + complete blob diff |
| 44 | `apps/web/src/lib/relayerClient.test.ts` | `6cb95e18b26429619d78a5f5ca9e11071dd497ff` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–210 | Full counterpart + complete blob diff |
| 45 | `apps/web/src/lib/relayerContract.test.ts` | `cc5fa24922b365f6230aafa4c325eb6090b78d89` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–114 | Full counterpart + complete blob diff |
| 51 | `apps/web/src/lib/txGuard.test.ts` | `c5c6f6488a7ddd52bc175df6b8221ff45b2fd44d` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–164 | Full counterpart + complete blob diff |
| 52 | `apps/web/src/lib/wallet.test.ts` | `0eef38ea9deb736072515d3240eeabfbd6b5e49b` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–383 | Full counterpart + complete blob diff |
| 55 | `apps/web/src/views/Pay.network.test.tsx` | `e72ea03feaa07a7e5450ac3eae1bef7c7a097887` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–81 | Full source |
| 56 | `apps/web/src/views/Pay.preflightCompletion.test.tsx` | `a8375bae63a9648c425d9da9e5dc8dbaa041f8a8` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–151 | Full source |
| 57 | `apps/web/src/views/Pay.signer.test.tsx` | `06a1750266a87afac186e7b1d8b64f4af689a9de` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–239 | Full source |
| 58 | `apps/web/src/views/Pay.test.tsx` | `199ecddf5d1e6ab7aec4ebd2ba5d01a5908f0b3c` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–1273 | Full counterpart + complete blob diff |
| 63 | `apps/web/src/lib/payExec.test.ts` | `4deb9d710209a5a83a8ae9d5dcecf3aac1058748` | `acbf39ee21ad35e9d14df958fa16fbcc2e230cae` | 1–967 | Full counterpart + complete blob diff |
| 64 | `apps/web/src/lib/wallet.test.ts` | `d76eae2520f89b14208485a79f8e686117382a55` | `acbf39ee21ad35e9d14df958fa16fbcc2e230cae` | 1–328 | Full counterpart + complete blob diff |
| 65 | `apps/web/src/views/Pay.signer.test.tsx` | `c93c871fb4500c1d34bcac28cedfebb2f7ab4088` | `04910f65dc0268e41519c4b1a44e83264272f0bf` | 1–238 | Full counterpart + complete blob diff |

Supplemental reads do not inflate these assignment counts: complete `test/render.tsx` and `components/WalletAttempts.tsx` at #300; selected Pay production call-site ranges. JSON preserves exact ranges and methods.

## Fresh-worker handoff and exact remainder

No assigned test is partially reviewed. Start from the following exact rows, deduplicate only by path plus blob, and continue full-source/diff review without running tests. Suggested next groups: invoice/receipt/format/merchant helpers and components, then sweep helper/view variants. This pass did not inspect any assigned sweep test source.

| Index | Path | Blob | Representative commit | Unread lines |
|---|---|---|---|---:|
| 0 | `apps/web/src/components/InvoicePaymentSummary.test.tsx` | `ceb237b51e68887f5932b8a87ddf4e71a7719522` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–41 |
| 1 | `apps/web/src/components/MerchantTemplateIssuer.test.tsx` | `c162fb9ca1ba5b71cbc34296172a2339883fc9a1` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–35 |
| 2 | `apps/web/src/components/ReceiptPanel.archive.test.tsx` | `93dc56732d3fc433d640fb88b04d1f13295beac1` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–92 |
| 3 | `apps/web/src/components/ReceiptPanel.i18n.test.tsx` | `ee6c99f0a4dc9d5c3a8d47194f9e6425c24e8d06` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–67 |
| 4 | `apps/web/src/components/ReceiptPanel.invoice.test.tsx` | `909b92a8ba967c82af14dfffe0385b34ef4331ad` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–200 |
| 5 | `apps/web/src/components/ReceiptPanel.profile.test.tsx` | `ba9b2d6b690c2494cad7c4c3633abff7de6a0d4c` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–85 |
| 6 | `apps/web/src/components/ReceiptPanel.test.tsx` | `1ba3f5cce99b7a13d2b6cb21d728bf152d283353` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–93 |
| 8 | `apps/web/src/lib/format.test.ts` | `3d6a9f5fade916452bc64fe98a3c9abb64add101` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–78 |
| 9 | `apps/web/src/lib/invoiceCreate.test.ts` | `b852ad654e5d78f79d971accd90810dd7d82f549` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–149 |
| 10 | `apps/web/src/lib/merchantTemplate.test.ts` | `cfd2b73cdd1497a20e940c62ccbe59210af4f9a3` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–114 |
| 14 | `apps/web/src/lib/receipts.test.ts` | `70e1c9aed859596389f5b43b93e0d6ff26f58bec` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–135 |
| 17 | `apps/web/src/lib/sweep.test.ts` | `f38c5b90985f705a8d4cfac87a897cd6ee394d1b` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–1091 |
| 18 | `apps/web/src/lib/sweepAttemptJournal.test.ts` | `9bfe12a040b536bd4bc8e9016b80ad70347b767b` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–161 |
| 24 | `apps/web/src/views/CreateInvoice.buffer.test.tsx` | `5c4269fa33cad4250deba0b955c4a090c0b269bd` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–249 |
| 25 | `apps/web/src/views/CreateInvoice.i18n.test.tsx` | `8269636eef8652821346ec8fa375671409561e21` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–51 |
| 26 | `apps/web/src/views/CreateInvoice.ordering.test.tsx` | `5cded4b3666f14dc57f1878c245a59d6bed4192a` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–76 |
| 27 | `apps/web/src/views/CreateInvoice.register.test.tsx` | `c0ab7561bb91cc777026c081a9ee39ff54db2e41` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–83 |
| 28 | `apps/web/src/views/CreateInvoice.supported.test.tsx` | `17feff9faf1ceb38432b63cd1cf361433827b340` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–159 |
| 29 | `apps/web/src/views/CreateInvoice.test.tsx` | `0d1ca5555de25aeebebccec61232bedbad4e1c18` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–267 |
| 34 | `apps/web/src/views/Sweep.privacy.test.tsx` | `2334a9bb524127b6cc6165a857f7942e74420c27` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–84 |
| 35 | `apps/web/src/views/Sweep.test.tsx` | `17049ca012bd5bab662dd450668c64b11e7700dd` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–1012 |
| 36 | `apps/web/src/components/InvoiceSignerVerification.test.tsx` | `28a040d3b4b2049f97d90c6de10605aa32fd9210` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–143 |
| 37 | `apps/web/src/components/ReceiptPanel.test.tsx` | `8f14ca64dfef6668c59d280597dd252adf849bb0` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–142 |
| 38 | `apps/web/src/lib/format.test.ts` | `43d5b5c882abdfb392776dd13d772e972f13ab46` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–92 |
| 39 | `apps/web/src/lib/invoiceSignerPins.test.ts` | `d0f00af1cc06573870f047967b97087cc086628d` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–306 |
| 40 | `apps/web/src/lib/invoiceVerification.test.ts` | `dc43e8c535e862c4e5798d5b757f6335d29c6ce0` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–54 |
| 43 | `apps/web/src/lib/receipts.test.ts` | `d8770c168ada02cedf50ecaa8bb47060f7199a35` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–149 |
| 46 | `apps/web/src/lib/sweep.boundaryAudit.test.ts` | `e3813045c7975bcbd4e1201d65869e6962827c25` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–215 |
| 47 | `apps/web/src/lib/sweep.destinations.privacy.test.ts` | `8097b83ba5ce627a38ec302fd9f9b1950369ba4b` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–114 |
| 48 | `apps/web/src/lib/sweep.nativeReview.test.ts` | `1a57ad6d116171cc64cab5293aa572a45d22daa2` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–336 |
| 49 | `apps/web/src/lib/sweep.reviewAuthority.test.ts` | `b1e5c22e708da43efa3d61b85d9272ce136a2bdb` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–249 |
| 50 | `apps/web/src/lib/sweep.test.ts` | `c391e4aca34e7125383e04bb32d26f1c1b55bd4d` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–1124 |
| 53 | `apps/web/src/views/CreateInvoice.privacy.test.tsx` | `e882d1107eb8a88c4583094a1081a82fc7d1f644` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–118 |
| 54 | `apps/web/src/views/CreateInvoice.test.tsx` | `de1c61ddaee5a7e2ef33b41a2c02a6bbfda6569e` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–281 |
| 59 | `apps/web/src/views/Sweep.nativeReview.test.tsx` | `e8d5fcb22def002ca90add99e344b4a132835c10` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–188 |
| 60 | `apps/web/src/views/Sweep.privacy.test.tsx` | `70d8ba09fbc19a6b2ab2de14d21d73c25cebb6a4` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–224 |
| 61 | `apps/web/src/views/Sweep.quoteLifecycle.test.tsx` | `2da1d11b208b413377b41b8416c0909dd0deebfa` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–424 |
| 62 | `apps/web/src/views/Sweep.test.tsx` | `2be1f668375db2c95f6d184514350bc0913b8685` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–1070 |
| 66 | `apps/web/src/views/Sweep.test.tsx` | `ae39744fcef08590eaf4ffbffb1691275433860c` | `e4d54a6829fcc861de7af1669c0e0f64f62aa137` | 1–1067 |
| 67 | `apps/web/src/lib/sweep.nativeReview.test.ts` | `ead0a287483a65add77eb8ce1722cc05b235ec63` | `ac7b7a11f00896d105fa7a06e44e218046bdc56c` | 1–335 |
| 68 | `apps/web/src/lib/sweep.test.ts` | `73c9f6fcc16280c0dbae6bfb1199034ca56d09ab` | `40b64e8f3a0f34f7b19235ba4655ef918687f22e` | 1–1124 |

The machine-readable record is `/workspace/scratch/e449ed9154f6/review-payments-tests-round4.json`. It includes all exact remaining assignment rows, covered ranges, provenance, review method, supporting observations and the explicit no-execution status.
