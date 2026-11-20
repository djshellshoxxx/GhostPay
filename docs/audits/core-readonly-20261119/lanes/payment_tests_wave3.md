> Historical lane record. The final [catalogue](../FINDINGS.md), [branch matrix](../branch-applicability.md), [quality review](../findings-quality-review.md) and [unified coverage](../coverage.json) supersede earlier provisional status, pending queues and branch-wide wording below. UTC worker dates may fall on November 20; the user-facing audit date is November 19, 2026 (America/Los_Angeles).

# GhostPay payment/tests static audit — wave 3

## Completion and scope

This bounded continuation reviewed **89 of 149 assigned path+blob versions**, spanning **70 paths and 21,368 version-lines**. It leaves **60 versions across 51 paths, totaling 13,509 version-lines**, for a fresh payment/tests wave 4 worker. There are **no partially read blobs** at this checkpoint and **no newly confirmed production finding**.

The starting assignment is exactly the 149 entries marked `handoff_owner: fresh payment/tests successor` in `payment_surfaces_wave2.json`. The immutable head set is the same 20 heads in `selected-heads.json`, including main at `c977b5d6723f6822c3b5d86cd6b231712c53c395`. This wave does not claim completion of the whole payment test surface or repository. In particular, `lib/pay.test.ts`, both broad `lib/sweep.test.ts` versions, and both broad `views/Sweep.test.tsx` versions remain pending. Root's later expanded head set is outside this bounded assignment and must be reconciled separately.

Repository: `/workspace/scratch/e1ba011306bd/GhostPay-audit`.

Machine-readable ledger and exact continuation: `/workspace/scratch/e1ba011306bd/payment_tests_wave3.json`.

## Method and integrity

Read `AGENTS.md`, `docs/ai/WORKFLOW.md`, and the predecessor findings and handoff before continuing. Inspected 70 immutable blobs in full and 19 complete diffs against fully read same-path baselines. Large bodies were read in contiguous, untruncated chunks. Every reviewed entry has a method, and every delta entry names its reviewed baseline. Prior production findings were treated as context; no prior coverage was relabeled as a new read.

The ledger preserves all 149 inherited path/blob identities, line counts and reference lists. Metadata reconciliation against `git ls-tree` for each of the 20 selected head SHAs confirmed every per-entry occurrence list. The completed and pending sets partition the original assignment without duplication. Version-line totals count each unique path+blob once, including unchanged lines inherited through a complete delta; they are not counts of distinct source lines or test assertions.

**No tests, property tests, fuzzers, compilers, Anvil instances, vulnerability reproductions, network calls, or transactions were run.** Anvil and fuzz test files were read as text. Only this scratch report and its coverage ledger were written. Application, test and configuration files were not changed; no checkout, merge, push or publication was performed. Repository HEAD remained `3b7c60d3d67eed0f038108d60f362f5dbef33e39` on `docs/ghostpay-core-readonly-audit-20261119`. Parent-owned documentation additions were visible in the shared worktree and were left alone.

## Completed groups

| Group | Versions | Paths | Version-lines |
| --- | ---: | ---: | ---: |
| QR helpers, classification and display components | 18 | 14 | 1,895 |
| Policy sending, evidence, withdrawal and utility tests | 10 | 9 | 1,732 |
| Payment execution, wallet and transaction guards | 10 | 4 | 4,611 |
| Pay route tests | 9 | 7 | 3,933 |
| Focused Sweep review and lifecycle tests | 8 | 7 | 1,834 |
| Chain-adapter tests and fixture helpers | 34 | 29 | 7,363 |

The payment execution group covers every assigned `payExec`, acceptance, `wallet` and `txGuard` variant, including receipt hash/status and ERC20 simulation regression additions. All assigned Pay route variants and focused network, preflight-completion, signer, invoice-QR, support and localization tests were read. The focused Sweep group covers single-use review authority, exact native fee review, scope revocation, final signing boundaries, and preservation of submitted/unknown attempt evidence.

All **34 assigned chain-adapter test/helper versions** are complete. Their source covers RPC bounds and batch behavior; deployment manifests and signatures; announcement pagination, canonical block binding and reorg handling; exact payment evidence and transfer consumption; quote guards; registry/delegation/ENS boundaries; router fee/calldata parity; and Sweep/permit typed-data checks. Local-chain fixtures explicitly distinguish disposable mock contracts from deployed token/feed provenance. Their dependency guards and `REQUIRE_ANVIL` behavior were inspected, with no assertion that those fixtures have executed successfully.

The QR group includes classification and fixed-seed fuzz source, exact UTF-8 raster decoding assertions, multipart assembly, each assigned runtime-kind guard variant, reveal/dialog lifecycle, payload-preserving localization and payment-request/proof display. Existing QR palette and print-policy checks inspect component behavior or the QR stylesheet; they do not establish the result of the full application's print CSS cascade. This does not replace the existing receipt-print finding or credit the pending ReceiptPanel test group.

## Findings and refinements

### PT3-O1 — retain the existing Pay route recovery assertion for PS2-01

**Classification:** coverage refinement to existing finding PS2-01; no separate production issue.

`apps/web/src/views/Pay.test.tsx`, blob `7ef3db702caa56538a7fd4e82e63eafb895debd5`, lines 647–663, already contains a route test named “surfaces a user rejection and blocks a blind retry until explicit clearing.” It sends through the prepared Pay route, verifies that a blind retry does not add a wallet send, clicks **Clear this attempt after checking my wallet**, then expects another explicit send attempt. The other reviewed Pay test blob, `199ecddf5d1e6ab7aec4ebd2ba5d01a5908f0b3c`, preserves that assertion while updating receipt fixtures.

Therefore, the audit must not say that no route integration test exists. The predecessor's WalletAttempts component tests manually supply the wallet prop; the privacy-head production callers omit it. Keep the production finding, retain or adapt this existing Pay route assertion, and qualify its behavior on the affected privacy heads during a separately authorized validation step. This wave establishes the assertion's presence only; it does not claim that the test passes or fails on any head.

### PT3-O2 — policy send helper tests do not exercise mounted input edits for PS2-04

**Classification:** coverage refinement to existing finding PS2-04; no separate production issue.

`apps/web/src/features/policy/send.test.ts`, blob `aa1b08c198e72dc55854551183670d37061984b0`, lines 69–77, builds its send guard from `captureSessionVersionGuard()` and a copy of the reviewed transaction. The fixture explicitly describes this as the guard used by PolicyPay. The complete suite covers session invalidation, reviewed-transaction mutation, approval evidence and payment submission checks, but it does not mount PolicyPay and edit the form while asynchronous preparation is pending.

The relevant regression evidence for PS2-04 is a mounted PolicyPay input-change case that invalidates prior review authority. Existing helper tests do not supply that evidence. Preserve the predecessor's reachability qualification: policy payment remains inactive without a pinned policy deployment, and this observation does not establish an active wallet-loss path.

### Existing findings retained without duplication

No change is proposed to the prior stale receipt/idle/Sweep findings, receipt-integrity branch distinctions, ERC20 simulation finding, WalletAttempts prop regression, receipt-print CSS conflict, QR robustness observations, or inactive merchant-ledger/policy findings. Newer test additions were credited only to their exact path/blob occurrence lists; they were not used to mark older heads fixed.

## Configuration coverage question

The two predecessor ledgers/reports, `payment_ui_review` and `payment_surfaces_wave2`, have no matching coverage entries or chain-adapter package/tsconfig/matrix references for `packages/chain-adapters/package.json`, `packages/chain-adapters/tsconfig.json`, or a chain-adapter `config/matrix.json`. Exact matrix candidates checked in the ledgers were `packages/chain-adapters/src/config/matrix.json`, `packages/chain-adapters/config/matrix.json`, and `config/matrix.json`.

Those files were **not inspected or credited by this worker**. This check establishes absence from these two predecessor records only; root should reconcile coverage from any other owner before assigning them. Reading matrix consumers or their tests does not credit the matrix data file itself.

## Exact continuation

A fresh worker should start from the **60 entries in `remaining`**, or filter `files` for `status: pending`, in `payment_tests_wave3.json`. Each has `handoff_owner: fresh payment/tests wave4 successor` and retains full selected-head SHA references. Do not restart from the wave 2 pending list. Read each remaining blob in full, or compare a complete delta to a fully read same-path baseline. Inventory scans and truncated output do not establish review.

Suggested order: broad payment/Sweep suites, remaining PolicyView and Registry UI/evidence suites, then CameraImporter, receipt, invoice, formatting and merchant components/helpers. The exact source index below is stable in the JSON `files` array and is only a lookup aid; the authoritative identity is path+blob. Root's separately owned custody tests and sweepAttemptJournal tests were excluded from this assignment and remain outside this remainder.

| Index | Pending path | Immutable blob | Lines |
| ---: | --- | --- | ---: |
| 0 | `apps/web/src/components/CameraImporter.behavior.test.tsx` | `4c6e955619e147baca36ad0ba8fecc48c806d640` | 142 |
| 1 | `apps/web/src/components/CameraImporter.i18n.test.tsx` | `5cd833b00369917e7e2caf62f9e1b3bb673623b8` | 137 |
| 2 | `apps/web/src/components/CameraImporter.lifecycle.test.tsx` | `9e66a8f7cccd7a5e9cd4cec94f79b6ddeb70926e` | 278 |
| 3 | `apps/web/src/components/CameraImporter.multipart.test.tsx` | `58833ea84270b29d5b21eb5fb10ccb5a9928187b` | 401 |
| 4 | `apps/web/src/components/CameraImporter.test.tsx` | `9de1420a4ffd86d57aff5500da6db386565efd23` | 158 |
| 5 | `apps/web/src/components/Common.test.tsx` | `af9c2a77b7d1232b50f8861dd0793c2c0eebc240` | 183 |
| 6 | `apps/web/src/components/ContextHelp.test.tsx` | `6c282bff7a223286c431c41514351ba6c6d2b2c2` | 145 |
| 7 | `apps/web/src/components/ErrorBoundary.test.tsx` | `b1bdf393bac0b9fb3e576f3b526d2f78d21b9f76` | 65 |
| 8 | `apps/web/src/components/InvoicePaymentSummary.test.tsx` | `ceb237b51e68887f5932b8a87ddf4e71a7719522` | 41 |
| 9 | `apps/web/src/components/MerchantProfilePanel.test.tsx` | `d1376d02bc6ce341c382efed1fe025f9ab549c1d` | 153 |
| 10 | `apps/web/src/components/MerchantTemplateIssuer.test.tsx` | `c162fb9ca1ba5b71cbc34296172a2339883fc9a1` | 35 |
| 18 | `apps/web/src/components/ReceiptPanel.archive.test.tsx` | `93dc56732d3fc433d640fb88b04d1f13295beac1` | 92 |
| 19 | `apps/web/src/components/ReceiptPanel.i18n.test.tsx` | `ee6c99f0a4dc9d5c3a8d47194f9e6425c24e8d06` | 67 |
| 20 | `apps/web/src/components/ReceiptPanel.invoice.test.tsx` | `909b92a8ba967c82af14dfffe0385b34ef4331ad` | 200 |
| 21 | `apps/web/src/components/ReceiptPanel.profile.test.tsx` | `ba9b2d6b690c2494cad7c4c3633abff7de6a0d4c` | 85 |
| 22 | `apps/web/src/components/ReceiptPanel.test.tsx` | `1ba3f5cce99b7a13d2b6cb21d728bf152d283353` | 93 |
| 23 | `apps/web/src/components/SharedComponents.i18n.test.tsx` | `a48fbe04da171154ba009ce11132e30ffbcaf80f` | 238 |
| 24 | `apps/web/src/features/policy/PolicyReceive.regression.test.tsx` | `9c493241a69595b1c1d7d1aa92e7152da7b50397` | 103 |
| 25 | `apps/web/src/features/policy/PolicyView.guard.test.tsx` | `9ccdadb0fd50fed4112e5abc399c0598ba26f93d` | 402 |
| 26 | `apps/web/src/features/policy/PolicyView.more.test.tsx` | `2d5df14501a00e9842d2aa055cf7b08e67209693` | 221 |
| 27 | `apps/web/src/features/policy/PolicyView.test.tsx` | `7cd927c29357adda705d353a33379aea0bc29df2` | 257 |
| 32 | `apps/web/src/features/policy/policy.logic.test.ts` | `c9084fa2048ee270916a72e288a9800e7f1254fc` | 373 |
| 37 | `apps/web/src/features/registry/RegistryView.export.test.tsx` | `10fc44d00152be737dbf4f3a172624cce0337b1d` | 71 |
| 38 | `apps/web/src/features/registry/RegistryView.i18n.test.tsx` | `03180167b4e9ae29e8294d1cee73028cb360de46` | 87 |
| 39 | `apps/web/src/features/registry/RegistryView.test.tsx` | `fb79a7398af4872f6cb129914dfea12b96cb8d6d` | 291 |
| 40 | `apps/web/src/features/registry/ref/Registry1271Wallet.test.sol` | `051aec1851c392ab9c5040bd34e8137d01ac1d6a` | 34 |
| 41 | `apps/web/src/features/registry/registry.anvil.test.ts` | `a49f0439dc4ffdec9449df3fee32fc92ba114c8d` | 252 |
| 42 | `apps/web/src/lib/format.test.ts` | `3d6a9f5fade916452bc64fe98a3c9abb64add101` | 78 |
| 43 | `apps/web/src/lib/fragment.test.ts` | `d3b8dc4682bee893ead90a8c0b9ce3669d4262d3` | 34 |
| 44 | `apps/web/src/lib/invoiceCreate.test.ts` | `b852ad654e5d78f79d971accd90810dd7d82f549` | 149 |
| 45 | `apps/web/src/lib/merchantIdentity.test.ts` | `c26773145f2fdc22ff05871157c34b7021a644f4` | 137 |
| 46 | `apps/web/src/lib/merchantTemplate.test.ts` | `cfd2b73cdd1497a20e940c62ccbe59210af4f9a3` | 114 |
| 47 | `apps/web/src/lib/pay.test.ts` | `7e27cf90328b7d9421e394edc10515e61157a1d5` | 611 |
| 57 | `apps/web/src/lib/receipts.test.ts` | `70e1c9aed859596389f5b43b93e0d6ff26f58bec` | 135 |
| 58 | `apps/web/src/lib/sellerPairing.test.ts` | `59c0ff53bd9e4619adc700cd559ea00886ac7359` | 119 |
| 59 | `apps/web/src/lib/sweep.test.ts` | `f38c5b90985f705a8d4cfac87a897cd6ee394d1b` | 1091 |
| 62 | `apps/web/src/views/CreateInvoice.buffer.test.tsx` | `5c4269fa33cad4250deba0b955c4a090c0b269bd` | 249 |
| 63 | `apps/web/src/views/CreateInvoice.i18n.test.tsx` | `8269636eef8652821346ec8fa375671409561e21` | 51 |
| 64 | `apps/web/src/views/CreateInvoice.ordering.test.tsx` | `5cded4b3666f14dc57f1878c245a59d6bed4192a` | 76 |
| 65 | `apps/web/src/views/CreateInvoice.register.test.tsx` | `c0ab7561bb91cc777026c081a9ee39ff54db2e41` | 83 |
| 66 | `apps/web/src/views/CreateInvoice.supported.test.tsx` | `17feff9faf1ceb38432b63cd1cf361433827b340` | 159 |
| 67 | `apps/web/src/views/CreateInvoice.test.tsx` | `0d1ca5555de25aeebebccec61232bedbad4e1c18` | 267 |
| 73 | `apps/web/src/views/Sweep.test.tsx` | `17049ca012bd5bab662dd450668c64b11e7700dd` | 1012 |
| 102 | `apps/web/src/components/CameraImporter.visibility.test.tsx` | `591becf9ad1f59e143bd3356b9b3a1bcc1ec6d11` | 154 |
| 103 | `apps/web/src/components/Disclosure.manifest.test.tsx` | `da7fd9a6813dc6b1ddfa1aaa5ec165d199b525e8` | 72 |
| 104 | `apps/web/src/components/InvoiceSignerVerification.test.tsx` | `28a040d3b4b2049f97d90c6de10605aa32fd9210` | 143 |
| 105 | `apps/web/src/components/ReceiptPanel.test.tsx` | `8f14ca64dfef6668c59d280597dd252adf849bb0` | 142 |
| 106 | `apps/web/src/features/policy/PolicyView.network.test.tsx` | `bfcf526291cc81f624b97441cfc186997fa485ed` | 192 |
| 109 | `apps/web/src/features/registry/RegistryView.network.test.tsx` | `f2a879bf1deecde6c8ad94d40a21096dcbe1c04c` | 78 |
| 110 | `apps/web/src/lib/invoiceSignerPins.test.ts` | `d0f00af1cc06573870f047967b97087cc086628d` | 306 |
| 111 | `apps/web/src/lib/invoiceVerification.test.ts` | `dc43e8c535e862c4e5798d5b757f6335d29c6ce0` | 54 |
| 112 | `apps/web/src/lib/merchantIdentity.test.ts` | `957027808890f366f337c375e52b5c081206dae7` | 157 |
| 115 | `apps/web/src/lib/receipts.test.ts` | `d8770c168ada02cedf50ecaa8bb47060f7199a35` | 149 |
| 119 | `apps/web/src/lib/sweep.test.ts` | `c391e4aca34e7125383e04bb32d26f1c1b55bd4d` | 1124 |
| 120 | `apps/web/src/views/CreateInvoice.privacy.test.tsx` | `e882d1107eb8a88c4583094a1081a82fc7d1f644` | 118 |
| 121 | `apps/web/src/views/CreateInvoice.test.tsx` | `de1c61ddaee5a7e2ef33b41a2c02a6bbfda6569e` | 281 |
| 128 | `apps/web/src/views/Sweep.test.tsx` | `2be1f668375db2c95f6d184514350bc0913b8685` | 1070 |
| 141 | `apps/web/src/components/Common.test.tsx` | `67a93df29f2df39dbe2f4489959e5e68835e7457` | 204 |
| 142 | `apps/web/src/lib/format.test.ts` | `43d5b5c882abdfb392776dd13d772e972f13ab46` | 92 |
| 144 | `apps/web/src/components/Common.test.tsx` | `0d7bbf035fc95e8f79c84b7766b87c7b43eaed37` | 204 |

The successor has no partial read ranges to resume. Keep the same static-only scope and record new coverage in a separate wave 4 scratch report/ledger for root to integrate.
