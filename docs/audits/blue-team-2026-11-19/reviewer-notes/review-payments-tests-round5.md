> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# GhostPay payment test-source audit — round 5 checkpoint

Completed **16 of 41 assigned immutable versions (8,818 version-lines)**: every assigned Sweep helper, journal, and view test version. **25 versions (3,259 version-lines) remain**, all in the invoice, receipt, format and merchant groups. No assigned file is partially reviewed.

**No new distinct production finding was established.** The reviewed tests add specific regression evidence for PN-02 and PN-03, and show conservative sweep recovery and privacy expectations. Tests were inspected, not executed; no passing, failing, build or runtime status is claimed.

## Scope and provenance

- Exact assignment: the `remaining` array in `/workspace/scratch/e449ed9154f6/review-payments-tests-round4.json`.
- Frozen main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Primary candidate: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.
- Complete immutable blobs were read with line numbers. Other versions were reviewed using a fully read counterpart plus every added and deleted line of the exact blob diff.
- All 16 completed records were checked against the representative commit's path/blob identity and complete line count. The completed and remaining sets exactly partition the round4 remainder.
- Native-review output truncation was repaired by reading lines 165–184 separately. Broad helper output truncation was repaired by reading lines 801–990 separately. No unseen truncated source was counted as reviewed.
- No source, test, configuration or dependency edits; no Git mutations, target execution, tests, builds, reproductions, live probes or transactions. Only these local audit records were written.

## Additional evidence for existing findings

### PN-02: reviewed native balance and fee binding

`apps/web/src/lib/sweep.reviewAuthority.test.ts`, blob `b1e5c22e708da43efa3d61b85d9272ce136a2bdb`, lines 187–249 explicitly covers both directions of balance change, changes returned by a delayed balance read, the same check for a replacement nonce, and deposits after the checked snapshot. Assertions distinguish the reviewed amount from the later live balance.

`apps/web/src/lib/sweep.nativeReview.test.ts`, blob `1a57ad6d116171cc64cab5293aa572a45d22daa2`, lines 104–144 checks preparation without signing and exact serialized destination, nonce, gas, fee caps and net amount after a separate confirmation. Lines 264–278 require fresh review when fees, balance or simulation results change. The sibling blob `ead0a287483a65add77eb8ce1722cc05b235ec63` changes only a JSON body-type handling line in the test transport.

`apps/web/src/views/Sweep.nativeReview.test.tsx`, blob `e8d5fcb22def002ca90add99e344b4a132835c10`, lines 91–161 verifies visible fee review, separate submit authority, invalidation on changed context, late preparation, and expiry before new RPC creation; lines 177–187 separately cover a reviewed same-nonce replacement. These are supporting source assertions for the existing PN-02 candidate fix, not runtime verification.

### PN-03: stale review refusal through asynchronous work

The complete authority helper source at `b1e5c22e708da43efa3d61b85d9272ce136a2bdb`, lines 96–185, tests direct and relayed review revocation before key derivation and across RPC/signing boundaries. It also preserves outcomes when the review changes after transport begins.

The native-review tests at `1a57ad6d116171cc64cab5293aa572a45d22daa2`, lines 195–251 and 280–335, cover copied reviews, destination/balance/chain/owner/announcement/endpoint/manifest/context binding, wall and monotonic clock failure or rollback, session replacement, cancellation, concurrent confirmation and expiry during signing.

`apps/web/src/views/Sweep.quoteLifecycle.test.tsx`, blob `2da1d11b208b413377b41b8416c0909dd0deebfa`, lines 152–220 and 242–424, tests stale quote and signing continuations while vault/RPC/helper work is pending. It distinguishes edits before handoff from outcomes after handoff, and checks retention of previous replacement hashes. The full Sweep route source at `2be1f668375db2c95f6d184514350bc0913b8685`, lines 363–400, also contains a real-helper test for session clearing during a held gas-price read. No new finding is added.

## Recovery and privacy assertions reviewed

The boundary audit (`e3813045c7975bcbd4e1201d65869e6962827c25`, lines 109–215) uses real cryptographic functions and the ordinary RPC client/network-authority adapter over a synthetic transport. It exercises late session/network revocation and conservative uncertainty after the journal callback. Secret-buffer assertions check zeroization without printing secret arguments.

The attempt-journal tests (`9bfe12a040b536bd4bc8e9016b80ad70347b767b`, lines 16–161), broad helper tests (`c391e4aca34e7125383e04bb32d26f1c1b55bd4d`, lines 350–438 and 839–1015), and route tests (`2be1f668375db2c95f6d184514350bc0913b8685`, lines 408–542, 579–807 and 854–1019) specify malformed/unavailable persistence refusal, journal writes before handoff, retention of all same-nonce transaction hashes, exact-hash receipt checks, finalized-nonce replacement, and relayed-order nonce/deadline reconciliation. These source expectations do not establish that the tests pass.

The older privacy blob `2334a9bb524127b6cc6165a857f7942e74420c27` intentionally expects automatic Settings-RPC balance reads outside required local-proxy mode (lines 51–84). The candidate-aligned blob `70d8ba09fbc19a6b2ab2de14d21d73c25cebb6a4` requires an explicit click in all modes and tests pending-read invalidation and absence of fallback (lines 76–224). The destination privacy tests (`8097b83ba5ce627a38ec302fd9f9b1950369ba4b`, lines 25–114) require session-only history, removal without import of legacy plaintext data, clearing on lock or seller-key change, and suppression of stale completion writes. Sibling branch differences are not assumed to be integrated.

## Bounded test-quality observation

Two individual legacy test names in `apps/web/src/lib/sweep.test.ts`, blob `c391e4aca34e7125383e04bb32d26f1c1b55bd4d`, claim more than those assertions alone demonstrate:

- Lines 233–240 call a failing relayed sweep and assert rejection, but do not observe the derived secret buffer despite the zeroization claim in the title. Add a direct buffer-zeroization assertion with count-only failure diagnostics, or narrow the title.
- Lines 502–525 claim to exercise a mismatched fee recipient, but supply the correct manifest fee recipient and fail because the permit RPC always throws. Use the intended mismatch and a specific refusal assertion, or rename that case. A separate test at lines 110–134 does explicitly reject a mismatched fee recipient, so this is not a claim that fee-recipient binding is absent from the suite.

These are informational test-quality notes. They do not establish a production security defect or an executed test failure.

## Completed immutable versions

| Assignment index | Path | Blob | Representative commit | Lines | Method |
|---|---|---|---|---:|---|
| 17 | `apps/web/src/lib/sweep.test.ts` | `f38c5b90985f705a8d4cfac87a897cd6ee394d1b` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–1091 | Full counterpart + complete blob diff |
| 18 | `apps/web/src/lib/sweepAttemptJournal.test.ts` | `9bfe12a040b536bd4bc8e9016b80ad70347b767b` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–161 | Full source |
| 34 | `apps/web/src/views/Sweep.privacy.test.tsx` | `2334a9bb524127b6cc6165a857f7942e74420c27` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–84 | Full counterpart + complete blob diff |
| 35 | `apps/web/src/views/Sweep.test.tsx` | `17049ca012bd5bab662dd450668c64b11e7700dd` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–1012 | Full counterpart + complete blob diff |
| 46 | `apps/web/src/lib/sweep.boundaryAudit.test.ts` | `e3813045c7975bcbd4e1201d65869e6962827c25` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–215 | Full source |
| 47 | `apps/web/src/lib/sweep.destinations.privacy.test.ts` | `8097b83ba5ce627a38ec302fd9f9b1950369ba4b` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–114 | Full source |
| 48 | `apps/web/src/lib/sweep.nativeReview.test.ts` | `1a57ad6d116171cc64cab5293aa572a45d22daa2` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–336 | Full source |
| 49 | `apps/web/src/lib/sweep.reviewAuthority.test.ts` | `b1e5c22e708da43efa3d61b85d9272ce136a2bdb` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–249 | Full source |
| 50 | `apps/web/src/lib/sweep.test.ts` | `c391e4aca34e7125383e04bb32d26f1c1b55bd4d` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–1124 | Full source |
| 59 | `apps/web/src/views/Sweep.nativeReview.test.tsx` | `e8d5fcb22def002ca90add99e344b4a132835c10` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–188 | Full source |
| 60 | `apps/web/src/views/Sweep.privacy.test.tsx` | `70d8ba09fbc19a6b2ab2de14d21d73c25cebb6a4` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–224 | Full source |
| 61 | `apps/web/src/views/Sweep.quoteLifecycle.test.tsx` | `2da1d11b208b413377b41b8416c0909dd0deebfa` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–424 | Full source |
| 62 | `apps/web/src/views/Sweep.test.tsx` | `2be1f668375db2c95f6d184514350bc0913b8685` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–1070 | Full source |
| 66 | `apps/web/src/views/Sweep.test.tsx` | `ae39744fcef08590eaf4ffbffb1691275433860c` | `e4d54a6829fcc861de7af1669c0e0f64f62aa137` | 1–1067 | Full counterpart + complete blob diff |
| 67 | `apps/web/src/lib/sweep.nativeReview.test.ts` | `ead0a287483a65add77eb8ce1722cc05b235ec63` | `ac7b7a11f00896d105fa7a06e44e218046bdc56c` | 1–335 | Full counterpart + complete blob diff |
| 68 | `apps/web/src/lib/sweep.test.ts` | `73c9f6fcc16280c0dbae6bfb1199034ca56d09ab` | `40b64e8f3a0f34f7b19235ba4655ef918687f22e` | 1–1124 | Full counterpart + complete blob diff |

## Fresh-worker handoff and exact remaining scope

No partial source remains. Continue the rows below in full; deduplicate only exact path/blob identity. Review receipts and invoice-signing assertions alongside PN-05. Preserve round4's BROWSER-01 correction: Pay already has a route regression test for confirmed clearing and retry; execution remains unverified. Do not repeat that issue as a new finding or describe the route test as missing.

| Assignment index | Path | Blob | Representative commit | Unread lines |
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
| 24 | `apps/web/src/views/CreateInvoice.buffer.test.tsx` | `5c4269fa33cad4250deba0b955c4a090c0b269bd` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–249 |
| 25 | `apps/web/src/views/CreateInvoice.i18n.test.tsx` | `8269636eef8652821346ec8fa375671409561e21` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–51 |
| 26 | `apps/web/src/views/CreateInvoice.ordering.test.tsx` | `5cded4b3666f14dc57f1878c245a59d6bed4192a` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–76 |
| 27 | `apps/web/src/views/CreateInvoice.register.test.tsx` | `c0ab7561bb91cc777026c081a9ee39ff54db2e41` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–83 |
| 28 | `apps/web/src/views/CreateInvoice.supported.test.tsx` | `17feff9faf1ceb38432b63cd1cf361433827b340` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–159 |
| 29 | `apps/web/src/views/CreateInvoice.test.tsx` | `0d1ca5555de25aeebebccec61232bedbad4e1c18` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 1–267 |
| 36 | `apps/web/src/components/InvoiceSignerVerification.test.tsx` | `28a040d3b4b2049f97d90c6de10605aa32fd9210` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–143 |
| 37 | `apps/web/src/components/ReceiptPanel.test.tsx` | `8f14ca64dfef6668c59d280597dd252adf849bb0` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–142 |
| 38 | `apps/web/src/lib/format.test.ts` | `43d5b5c882abdfb392776dd13d772e972f13ab46` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–92 |
| 39 | `apps/web/src/lib/invoiceSignerPins.test.ts` | `d0f00af1cc06573870f047967b97087cc086628d` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–306 |
| 40 | `apps/web/src/lib/invoiceVerification.test.ts` | `dc43e8c535e862c4e5798d5b757f6335d29c6ce0` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–54 |
| 43 | `apps/web/src/lib/receipts.test.ts` | `d8770c168ada02cedf50ecaa8bb47060f7199a35` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–149 |
| 53 | `apps/web/src/views/CreateInvoice.privacy.test.tsx` | `e882d1107eb8a88c4583094a1081a82fc7d1f644` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–118 |
| 54 | `apps/web/src/views/CreateInvoice.test.tsx` | `de1c61ddaee5a7e2ef33b41a2c02a6bbfda6569e` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 1–281 |

The companion `review-payments-tests-round5.json` preserves complete covered ranges, exact methods, observations and the unchanged remaining assignment rows. Root owns final repository notes and global completion reconciliation.
