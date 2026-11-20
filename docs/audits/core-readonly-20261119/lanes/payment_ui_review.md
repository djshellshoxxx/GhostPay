> Historical lane record. The final [catalogue](../FINDINGS.md), [branch matrix](../branch-applicability.md), [quality review](../findings-quality-review.md) and [unified coverage](../coverage.json) supersede earlier provisional status, pending queues and branch-wide wording below. UTC worker dates may fall on November 20; the user-facing audit date is November 19, 2026 (America/Los_Angeles).

# GhostPay payment/UI review — generation 1

## Status and scope

Completed **43 distinct production path/blob versions across 28 paths**, totaling 11,606 source lines when version variants are counted separately. This is a partial audit lane, not a complete repository audit. **86 production blobs and 169 test blobs remain pending in this lane inventory.** No tests were executed and no complete test-file coverage is claimed.

Immutable git-show full source plus complete inspected diffs for the marked path/blob versions. Blob equality propagates coverage only to identical content. No production/test/config files were changed. No tests, exploit attempts, network probing or fuzzing were run.

The JSON companion is the authoritative exhaustive path/blob/ref ledger. All statuses describe actual source review, not file discovery. Coverage includes latest source plus every changed hunk of other marked variants. Main/release/integration are snapshots, not assumptions about deployment.

### Pinned revisions

| Label | Commit |
|---|---|
| main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| release | `417f7c71daf8645e1432f2ec8f070110879b80bd` |
| integration | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| PR305 | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` |
| PR303 | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` |
| PR298 | `acbf39ee21ad35e9d14df958fa16fbcc2e230cae` |
| PR301 | `7523da612ba365451f1d5c2dbc01d0bdeedbe8c7` |
| PR290 | `ec546311f994fe1db544fe85ff2aa6db428d67d4` |
| PR285 | `89942105c48df03b9351f777278b6a992e35a95e` |

## Findings and hardening observations

| ID | Severity | Finding | Status |
|---|---|---|---|
| PUI-01 | Medium | Receipt polling accepts a receipt without binding it to the requested transaction | Affects main and release; corrected in integration; PR298 fixes hash binding only, retaining permissive status handling |
| PUI-02 | Low | Malformed ERC20 simulation output is classified as a successful dry run | Affects main, release and integration; corrected only in inspected PR305 head |
| PUI-03 | Medium | Main sweep operations do not revoke an in-flight signing review when visible inputs change | Affects main-derived sweep implementation; corrected in release/integration |
| PUI-04 | Low | Page hiding does not revoke pending local imports in the main camera/import component | Affects main; corrected in release/integration |
| PUI-05 | Low | parseUnits runtime arguments are not validated in main/integration | Affects main, release and integration; corrected in inspected PR301/303 heads |
| PUI-06 | Informational | QR classification helpers rely on compile-time union types in older versions | Main lacks unknown-key guards; release adds own-key checks; integration/PR290 also validates string type |
| PUI-07 | Informational | Older multipart QR encoding silently normalizes ill-formed Unicode input | Affects main; corrected in release/integration |

### PUI-01: Receipt polling accepts a receipt without binding it to the requested transaction

**Medium — RPC result integrity.** Affects main and release; corrected in integration; PR298 fixes hash binding only, retaining permissive status handling.

**Conditions.** The selected RPC returns an inconsistent receipt: the transactionHash is missing or differs from the requested hash, or status is an integer outside the two defined outcomes.

**Evidence.** The older pollReceipt reads destination, status and blockNumber without validating transactionHash, and maps every status except 1 to reverted. The latest integration requires a valid matching transactionHash and status exactly 0 or 1.

**Impact and bounds.** Payment confirmation or revert presentation can be attributed to a receipt that does not identify the requested transaction. This is a boundary-validation defect under inconsistent RPC data, not proof of chain-state forgery or theft.

**Recommended fix.** Retain the strict hash and status validation from the integration version across all shipped branches; retain the original known transaction hash and an unresolved outcome when validation fails.

**Safe acceptance criteria.** Read-only/unit validation should establish that missing or mismatched receipt identity and out-of-domain status cannot produce success/reverted, while the original transaction remains trackable. No live endpoint or transaction is required.

**Immutable source locations:**

- `c977b5d6723f6822c3b5d86cd6b231712c53c395` · `apps/web/src/lib/wallet.ts` · lines 478-503.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` · `apps/web/src/lib/wallet.ts` · lines 490-508.
- `acbf39ee21ad35e9d14df958fa16fbcc2e230cae` · `apps/web/src/lib/wallet.ts` · lines 492-500.

### PUI-02: Malformed ERC20 simulation output is classified as a successful dry run

**Low — Preflight result integrity.** Affects main, release and integration; corrected only in inspected PR305 head.

**Conditions.** An ERC20-style call is simulated with expectBool=true and the RPC returns nonempty even-length hex that is not a canonical ABI boolean.

**Evidence.** The older helper rejects only a 32-byte zero result. Every other syntactically hex result returns ok. PR305 classifies nonempty output with the wrong width or value as unavailable.

**Impact and bounds.** The interface can omit the unavailable-simulation warning despite lacking a meaningful affirmative simulation result. A dry run is not a guarantee of execution, and the product deliberately allows unavailable simulation with a warning; this finding does not demonstrate a bypass that directly moves funds to an unintended recipient.

**Recommended fix.** Integrate the PR305 canonical boolean check without losing legacy empty-return compatibility or the explicit false-return refusal.

**Safe acceptance criteria.** Validate that canonical true is ok, canonical false refuses, empty legacy output follows its documented policy, and all other nonempty boolean-domain output is unavailable. Verify caller warning propagation for both submitted and unknown-after-handoff outcomes.

**Immutable source locations:**

- `c977b5d6723f6822c3b5d86cd6b231712c53c395` · `apps/web/src/lib/txGuard.ts` · lines 111-128.
- `87cf6c603338ad64ec02300fe42b96c3e0a205b9` · `apps/web/src/lib/txGuard.ts` · lines 124-135.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` · `apps/web/src/lib/sweep.ts` · lines 774-778.

### PUI-03: Main sweep operations do not revoke an in-flight signing review when visible inputs change

**Medium — Consent and asynchronous state binding.** Affects main-derived sweep implementation; corrected in release/integration.

**Conditions.** A sweep action has begun with a valid session, then its destination, mode or displayed review context is changed while preflight/signing is awaiting completion.

**Evidence.** Main guard captures session/authEpoch only. The main direct/relayed helpers are called without a UI assertReviewCurrent capability; directSweep checks the seller session but not the current UI review before signing and handoff. The editable destination remains available while busy. Latest view binds balance and quote scopes, aborts on context changes and passes assertReviewCurrent through the helper to handoff.

**Impact and bounds.** A transaction can continue using the earlier captured destination/context after the interface presents changed input. This is stale consent, not arbitrary recipient injection. No fund-loss magnitude is asserted.

**Recommended fix.** Preserve scope-bound cancellation and review guards from release/integration, checking before and after asynchronous preparation, immediately before signing, and before handoff. Preserve truthful tracking once a handoff has already occurred.

**Safe acceptance criteria.** With local stubbed dependencies, changing a review field or leaving the view before handoff must prevent later signing/handoff; a response after an actual handoff must keep the original transaction/order tracked. Native confirmation must remain single-use, scoped and time-bounded.

**Immutable source locations:**

- `c977b5d6723f6822c3b5d86cd6b231712c53c395` · `apps/web/src/views/Sweep.tsx` · lines 138-157,176-209,241-264.
- `c977b5d6723f6822c3b5d86cd6b231712c53c395` · `apps/web/src/lib/sweep.ts` · lines 562-570,645-664.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` · `apps/web/src/views/Sweep.tsx` · lines 134-161,298-329,405-469.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` · `apps/web/src/lib/sweep.ts` · lines 955-985.

### PUI-04: Page hiding does not revoke pending local imports in the main camera/import component

**Low — Consent lifecycle.** Affects main; corrected in release/integration.

**Conditions.** A paste or image import remains pending when the document becomes hidden, with no active camera.

**Evidence.** Main visibilityChanged invokes stop only for a camera; visible does not check document visibility; deliver invokes the consumer callback before its first cancellation/visibility check. Latest also stops localImport work, includes document visibility in visible(), and checks before the callback.

**Impact and bounds.** An import consumer can receive content after the page has hidden and the intended local action lifetime should have ended. Consumer-specific checks may limit downstream effects; no secret exfiltration or unauthorized signing was established here.

**Recommended fix.** Retain the latest cancellation and pre-delivery checks; consumers must also recheck their supplied signal before committing any asynchronous state.

**Safe acceptance criteria.** Pending paste and image operations must be cancelled when hidden; becoming visible must require a fresh user action. Hidden/aborted callbacks must not commit imported state.

**Immutable source locations:**

- `c977b5d6723f6822c3b5d86cd6b231712c53c395` · `apps/web/src/components/CameraImporter.tsx` · lines 121-143,158-168.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` · `apps/web/src/components/CameraImporter.tsx` · lines 121-145,160-170.

### PUI-05: parseUnits runtime arguments are not validated in main/integration

**Low — Robustness; no demonstrated external security reachability.** Affects main, release and integration; corrected in inspected PR301/303 heads.

**Conditions.** A caller violates the TypeScript boundary with a non-string amount or non-integer/out-of-range decimal precision. Production callers reviewed generally supply strings and configured decimal precision.

**Evidence.** The old function calls text.trim(), BigInt(decimals), exponentiation and padEnd without runtime argument checks, despite documenting undefined for unexpected input. The standalone correction bounds decimal precision to 0..36 and validates type before arithmetic.

**Impact and bounds.** Unexpected exceptions or excessive work are possible at the utility boundary. No network-controlled production input path to unbounded decimal precision was established; do not present this as a remotely exploitable denial of service.

**Recommended fix.** Retain the narrow type/range guard in PR301/303.

**Safe acceptance criteria.** Unexpected runtime type or precision is rejected predictably without coercion, rounding, excessive allocation or arithmetic exceptions. Valid configured amounts preserve exact bigint behavior.

**Immutable source locations:**

- `c977b5d6723f6822c3b5d86cd6b231712c53c395` · `apps/web/src/lib/format.ts` · lines 16-24.
- `a9e0715573f7247d7a16f9d1d030cf0232708fb2` · `apps/web/src/lib/format.ts` · lines 16-25.

### PUI-06: QR classification helpers rely on compile-time union types in older versions

**Informational — Defensive runtime hardening; no demonstrated external exposure.** Main lacks unknown-key guards; release adds own-key checks; integration/PR290 also validates string type.

**Conditions.** A runtime caller supplies a value outside QrKind/QrPayloadType, including inherited object keys or non-string property keys. Reviewed normal callers use typed constants.

**Evidence.** Main reads PAYLOAD_KIND[type] directly and constructs class names without validation. Intermediate own-property validation still permits property-key coercion. Latest checks string type and an own key before classification.

**Impact and bounds.** Unexpected classification, missing handling rules or rendering failures are possible for invalid internal input. No demonstrated route lets imported QR data select a privileged secret-handling kind; do not claim key disclosure.

**Recommended fix.** Preserve latest runtime string and own-key checks and keep secret/bearer handling stronger than generic caution flags.

**Safe acceptance criteria.** Out-of-domain and non-string kind/payload arguments fail before coercion or property access. Legitimate secret/bearer payloads retain their handling regardless of caution flags.

**Immutable source locations:**

- `c977b5d6723f6822c3b5d86cd6b231712c53c395` · `apps/web/src/lib/qrKinds.ts` · lines 178-181,232-236.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` · `apps/web/src/lib/qrKinds.ts` · lines 178-182,233-240.

### PUI-07: Older multipart QR encoding silently normalizes ill-formed Unicode input

**Informational — Encoding integrity; production reachability not established.** Affects main; corrected in release/integration.

**Conditions.** toMultipart receives a string containing an unpaired UTF16 surrogate. Normal invoice/key payload producers reviewed produce structured encoded text.

**Evidence.** Main delegates straight to TextEncoder, which replaces such code units. Latest rejects them before encoding.

**Impact and bounds.** The multipart payload can differ from the caller-provided text; no valid signed invoice/key corruption flow was established. This is a library integrity edge case rather than a demonstrated remote vulnerability.

**Recommended fix.** Retain the latest pre-encoding rejection and consistent byte-preservation behavior across single and multipart QR paths.

**Safe acceptance criteria.** Ill-formed Unicode is rejected before generating parts, while valid Unicode round-trips byte-for-byte.

**Immutable source locations:**

- `c977b5d6723f6822c3b5d86cd6b231712c53c395` · `apps/web/src/lib/qrMultipart.ts` · lines 19-30.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` · `apps/web/src/lib/qrMultipart.ts` · lines 19-32.

## Retired candidates and transferred follow-up

### Receipt signing after invoice expiry

**Deliberate behavior, not a vulnerability finding.** receipts.ts:108 refuses expiry at current signing time; ReceiptPanel.invoice.test.tsx:87-94 explicitly requires this. Ledger late-discovery semantics concern a different operation. Product may separately decide whether historical receipts should be supported.

### Stale local Sweep hash under a changed selected payment

**Retired after actual routing trace.** AppShell ViewSwitch95-96 selects Sweep; production selectForSweep is called only by Scan926 or idle reset267. Selection via Scan remounts Sweep; idle suspension routes Seller134. No path demonstrated that retains this component under another target.

### Receipt issuedAt Date range

**Transferred to parent/custody reviewer; not fully traced by this lane.** ReconciliationLedger.tsx:757 unconditionally formats new Date(receipt.issuedAt * 1000).toISOString(). Shared receipt parser bound and full archive/import reachability require the other lane. ReceiptPanel.tsx:310 renders a locally created timestamp.

### Privacy defaults in CreateInvoice and ReceiptPanel

**Observed correction, not independently claimed as a new vulnerability.** Latest CreateInvoice resets its child form on session identity changes and defaults encryption true. Latest ReceiptPanel omits stealthAddress unless opted in. Receipts retain other public linkage fields, so address omission is not complete unlinkability.

## Fresh-worker handoff

Custody owns BackupPanel, SecretBackup, StealthExport*, paymentKeyExport/paymentExportRpc. Root owns opStackFee, transactionOutcome, journals and ancillary UI. ReconciliationLedger timestamp sink sent to custody; ask root which lane will finish whole component. Ledger intentionally retains unreviewed ancillary paths until root consolidates ownership.

Use immutable git show only. Never checkout the shared clone. exec_command should use shell=bash, login=false and absolute valid workdir due an earlier filesystem reset. Shared clone was restored; local scratch notes are reconstructed and verified against pinned blob IDs.

Only files with reviewed_production are complete. All unreviewed entries remain pending, even if their names were inventoried or a keyword snippet was viewed. Do not infer test passage from test source reading. There are no fully reviewed tests in this generation.

Continue from JSON entries status=unreviewed. Pay is not reviewed at all in this generation; Sweep and CreateInvoice are fully reviewed at both blobs. Reuse exact blob IDs across refs. The review inventory script resets findings if rerun: run write_payment_review.py afterward, or preserve findings manually.

Priority order:

- apps/web/src/views/Pay.tsx (both 1409-line main and 1524-line integration blobs)
- apps/web/src/lib/tags.ts and tagArchive.ts; components/TagArchive.tsx
- Remaining invoice/payment/receipt/merchant UI components, after reconciling root ancillary ownership
- packages/chain-adapters and packages/merchant-ledger
- apps/web/src/features/policy and apps/web/src/features/registry
- Relevant tests for reviewed production behaviors, then remaining explicitly scoped test files

## Fully reviewed production blobs

| Path | Blob | Lines | Identical at refs |
|---|---|---:|---|
| `apps/web/src/components/CameraImporter.tsx` | `255e318fb120ef769687e0c2dfb38f2bceb9e7d9` | 365 | release, integration, PR303, PR298, PR290 |
| `apps/web/src/components/CameraImporter.tsx` | `f592f573581511d7287608c3da068aae432f5738` | 360 | main, PR305, PR301, PR285 |
| `apps/web/src/components/MerchantProfilePanel.tsx` | `18f0c7ea5772b028f4d1af6abb8d12322c00909e` | 198 | release, integration, PR303, PR298, PR290 |
| `apps/web/src/components/MerchantProfilePanel.tsx` | `ecba9e7a460b2698ea9f70f4a62edc482e9cfd60` | 191 | main, PR305, PR301, PR285 |
| `apps/web/src/components/MerchantTemplateIssuer.tsx` | `f3f3cee46e379f423fcbc2fa04512a4d96f8e85e` | 89 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| `apps/web/src/components/QrFrame.tsx` | `9554db0ddd1cf4e3fcd780a99ca5598907e77249` | 356 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| `apps/web/src/components/QrView.tsx` | `fb4091495cf34107ae15fc11e72a6c11ec307285` | 48 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| `apps/web/src/components/ReceiptPanel.tsx` | `b6cc91507f78283db57a7bb5f99b28f27711fffc` | 335 | release, integration, PR303, PR298, PR290 |
| `apps/web/src/components/ReceiptPanel.tsx` | `b81b4868434aae0891c5cd4a664ac48aecf3f947` | 328 | main, PR305, PR301, PR285 |
| `apps/web/src/lib/format.ts` | `18dad7e4235c922bb7f197312317cc86557a12c2` | 73 | main, release, integration, PR305, PR298, PR290, PR285 |
| `apps/web/src/lib/format.ts` | `9ba8ea7b418eab5cf18e900923572cf3e255aedd` | 74 | PR303, PR301 |
| `apps/web/src/lib/fragment.ts` | `9f361be2be54403f1980999bb64937299760e719` | 35 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| `apps/web/src/lib/invoiceCreate.ts` | `4f1f9c81c07c1068e49942a163421596288f6dba` | 176 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| `apps/web/src/lib/invoiceSignerPins.ts` | `9f870bed002dac0b809ab00f82c2b66c032f197c` | 218 | release, integration, PR303, PR298, PR290 |
| `apps/web/src/lib/invoiceVerification.ts` | `6256d5b234db85f4f7b0dfac40c4d5f55957e4ea` | 49 | release, integration, PR303, PR298, PR290 |
| `apps/web/src/lib/merchantIdentity.ts` | `183a8fbc588cb1c66e5ec480e572849b803761db` | 94 | release, integration, PR303, PR298, PR290 |
| `apps/web/src/lib/merchantIdentity.ts` | `8859aeb207e4b839838bdc3a5c8d9433fd9ae308` | 91 | main, PR305, PR301, PR285 |
| `apps/web/src/lib/merchantTemplate.ts` | `045efb594a73a610662e8f5d45a6b270de0e589e` | 88 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| `apps/web/src/lib/pay.ts` | `479341df5a6a5a5f90038520d3934fe2d4fcdea8` | 607 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| `apps/web/src/lib/payExec.ts` | `3ce29cb9498df24def6a1137e2c0030b656d771f` | 361 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| `apps/web/src/lib/qr.ts` | `fbdc330a993b4cc8459a5d9455217c08652503fa` | 70 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| `apps/web/src/lib/qrClassify.ts` | `973c7831c4c3d81da9d99c620fd758a03e62a118` | 452 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| `apps/web/src/lib/qrContrast.ts` | `e8ef8e977fc593ea45d4f352057722f720652bb8` | 78 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| `apps/web/src/lib/qrKinds.ts` | `68de6518783cc57bd7f3a66d0588d530e27d21b6` | 265 | release, PR298, PR285 |
| `apps/web/src/lib/qrKinds.ts` | `a85e1011cdface74c87683146ff7428654b7830d` | 265 | integration, PR303, PR290 |
| `apps/web/src/lib/qrKinds.ts` | `eb60ac5a6a8e774333d12a53df4cb2c26ee5e7b9` | 262 | main, PR305, PR301 |
| `apps/web/src/lib/qrMultipart.ts` | `48032d32ea18fa660ac72c342263d741ceb7cc0d` | 31 | main, PR305, PR301, PR285 |
| `apps/web/src/lib/qrMultipart.ts` | `d8c9a8cc2d6eb90f1a6a45fe463a6f8e7ab1abb3` | 33 | release, integration, PR303, PR298, PR290 |
| `apps/web/src/lib/qrPayload.ts` | `8b4cc2446b61adff4c5ba87bd454d10d2bdf72ce` | 10 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| `apps/web/src/lib/receipts.ts` | `a9b42e29afa652c552d17823f3d77b8eeb07cdcd` | 132 | release, integration, PR303, PR298, PR290 |
| `apps/web/src/lib/receipts.ts` | `cf880e0b9ee40a1d30c76a15e08e1c06674d71c1` | 119 | main, PR305, PR301, PR285 |
| `apps/web/src/lib/sellerPairing.ts` | `7fd1578738e869f77c06e3822d6dcb17257f9ac1` | 23 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| `apps/web/src/lib/sweep.ts` | `2acd7e6fee3f508ef5b55608c8d90fb7684852dc` | 1062 | release, integration, PR303, PR298, PR290 |
| `apps/web/src/lib/sweep.ts` | `ef73a7ec629cf33da5dba4fa8b3d9f80913bbb1a` | 746 | main, PR305, PR301, PR285 |
| `apps/web/src/lib/txGuard.ts` | `abba792709126a191cbd589f2023351a7b9e1c66` | 208 | main, release, integration, PR303, PR298, PR301, PR290, PR285 |
| `apps/web/src/lib/txGuard.ts` | `c5e7b6ea5ac9525395cb4bc8c63f923db40d2e23` | 215 | PR305 |
| `apps/web/src/lib/wallet.ts` | `3320a5650eab89763e16649e05ba8b4fa2ddeab9` | 511 | PR298 |
| `apps/web/src/lib/wallet.ts` | `800cfa90810b887898d4184ff3f5ccfb2601c971` | 519 | integration, PR303 |
| `apps/web/src/lib/wallet.ts` | `fb1d864f3223ce007e35d81c19a308df88657121` | 506 | main, release, PR305, PR301, PR290, PR285 |
| `apps/web/src/views/CreateInvoice.tsx` | `5d562426908fbffc8b9aecb4c8e4a223a3a174f2` | 406 | release, integration, PR303, PR298, PR290 |
| `apps/web/src/views/CreateInvoice.tsx` | `cb7cf3244a39c2a3b6894c616f71b562f4bab025` | 396 | main, PR305, PR301, PR285 |
| `apps/web/src/views/Sweep.tsx` | `6da18522b825c99b4073fd238174f63a8a2b7b38` | 699 | release, integration, PR303, PR298, PR290 |
| `apps/web/src/views/Sweep.tsx` | `75ea26cfa62a08cbfe001d6ac02c68c6bc210566` | 462 | main, PR305, PR301, PR285 |

## Explicit pending production and test blobs

These entries have **not** been fully read by this worker. Parent-owned files must be reconciled against the root ledger; retaining them here does not imply another worker has not reviewed them.

| Kind | Path | Blob | Lines | Refs |
|---|---|---|---:|---|
| production | `apps/web/src/components/Common.tsx` | `71b607b3e92f583b6bc784c7ec929567dd6f75da` | 135 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/components/ContextHelp.tsx` | `585e403e043292496a117c174873d2b3575dd2e5` | 121 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/components/Disclosure.tsx` | `0e822a192a2afd04bc5a1a9408ef919b066b7d08` | 161 | main, PR305, PR301, PR285 |
| production | `apps/web/src/components/Disclosure.tsx` | `4ecacbf464c6e1b413d9857be417569200a05b69` | 165 | release, integration, PR303, PR298, PR290 |
| production | `apps/web/src/components/ErrorBoundary.tsx` | `cd9d3e0699d7e4a1758a99736bc232dc666adb0b` | 61 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/components/InvoicePaymentSummary.tsx` | `7d73d645f829d14179a44c952bde2cfb62f5224c` | 30 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/components/InvoiceSignerVerification.tsx` | `9cb9a8af0d806cb3ac7c33d396113d4e8ecd787a` | 121 | release, integration, PR303, PR298, PR290 |
| production | `apps/web/src/components/ManifestBanner.tsx` | `1fd6d16562422c7383dd53059026a12aaa3d9e48` | 10 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/components/MerchantProfileNotice.tsx` | `6eaafad55dbb913f96a1d9bcd50cc8e2d3294534` | 21 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/components/PaymentRequestQr.tsx` | `3fbf35a0bc17650ae04f574fe74a00f1825c0a67` | 173 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/components/PrintableBill.tsx` | `64ba221722b1c88adb74c6c68960e95e48855c98` | 140 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/components/ReconciliationLedger.tsx` | `c190e0efeb942fb7bcb91f5e14f9f3e6c3df5d67` | 796 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/components/RichText.tsx` | `844aded5b4b601d98fb41f100f3e0e0a7b62e0de` | 24 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/components/TagArchive.tsx` | `4f4ce4036ccc4e7e931074a872e54cf9a4cfbc21` | 471 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/components/WalletAttempts.tsx` | `70ba12b8ae8d07460266c07f4dbd25e6126bfb80` | 34 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/features/policy/PolicyCreate.tsx` | `2798b82ef3d1fa095e8c487847a1c98702607bb9` | 163 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/features/policy/PolicyPay.tsx` | `2c29b545732754997b4ac0c3fb93096f125ee511` | 134 | release, integration, PR303, PR298, PR290 |
| production | `apps/web/src/features/policy/PolicyPay.tsx` | `4fa15f2aa20e428f70d789ec9186c6d36377ccc6` | 133 | main, PR305, PR301, PR285 |
| production | `apps/web/src/features/policy/PolicyReceive.tsx` | `642364b7da1d9a086655aef8d4f04ec055563dce` | 312 | release, integration, PR303, PR298, PR290 |
| production | `apps/web/src/features/policy/PolicyReceive.tsx` | `995bca7d3607da0a4e9e2628ac8ae9f161ff6320` | 311 | main, PR305, PR301, PR285 |
| production | `apps/web/src/features/policy/PolicyView.tsx` | `18af8fbd66ba4257139ad4b7a55823cce6df6423` | 164 | release, integration, PR303, PR298, PR290 |
| production | `apps/web/src/features/policy/PolicyView.tsx` | `92b02eb63315b9afd01e653b268a5a6de9b59d64` | 156 | main, PR305, PR301, PR285 |
| production | `apps/web/src/features/policy/chain.ts` | `758e19ef20d5f1ad2d3388979fb2d59e9db6578c` | 197 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/features/policy/create.ts` | `b37fbba06cfdebda896debeb1eb7fddd8dc32be4` | 78 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/features/policy/deploymentEvidence.ts` | `21b6f4f009532bb2dc40979f2e8186cec3cf67ff` | 75 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/features/policy/flag.ts` | `0102c120e4a94724919e6e5ea7e097f04d60e802` | 13 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/features/policy/guard.ts` | `f54e0106f38e3f7c882667999e683ea2e47492ec` | 115 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/features/policy/pay.ts` | `1da6869e3d9322004d29ede85ac20923f31d1777` | 90 | release, integration, PR303, PR298, PR290 |
| production | `apps/web/src/features/policy/pay.ts` | `26e0609e4b4554e6dce06f8949895e9fdf8f5bfb` | 72 | main, PR305, PR301, PR285 |
| production | `apps/web/src/features/policy/paymentEvidence.ts` | `9716b25ad550c7593a6cf4077b174798a5aedeae` | 204 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/features/policy/policyTime.ts` | `6b0f6a6c876addcb3dcac31474b9c89f0345423e` | 7 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/features/policy/scan2.ts` | `406f8540269ff0b6e335888c5b24840c3cf7d3e6` | 99 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/features/policy/send.ts` | `04ac08be009c2942b394f35975171325738ce12a` | 214 | release, integration, PR303, PR298, PR290 |
| production | `apps/web/src/features/policy/send.ts` | `7058f958a66eafc4c6bc77156cb968e5bd23cc40` | 211 | main, PR305, PR301, PR285 |
| production | `apps/web/src/features/policy/withdraw.ts` | `292f043fa2966470785cb1a5119af0faac655fc3` | 157 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/features/policy/withdrawalJournal.ts` | `54b669d2bd377ed2818f8b39fb09884fbb8851eb` | 62 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/features/policy/withdrawalState.ts` | `0099a75e9fcb4bba204c4b920926f564e0198e39` | 229 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/features/registry/RegistryView.tsx` | `5ca89f54457128b887eb9107fc4eac66ce8c0530` | 375 | release, integration, PR303, PR298, PR290 |
| production | `apps/web/src/features/registry/RegistryView.tsx` | `68e1c58aa7dd21d9208c3d67fc752b576f7d780f` | 359 | main, PR305, PR301, PR285 |
| production | `apps/web/src/features/registry/ref/ERC6538Registry.sol` | `8a0ac539be5741106a004b7f20643371bf4c8091` | 164 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/lib/sweepAttemptJournal.ts` | `18d67fec4a925411374482f1ae803eee03fd53f6` | 171 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/lib/tagArchive.ts` | `9400fce95a499d0ea2f0df1aa7238364470fffa9` | 72 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/lib/tags.ts` | `6eb3bdbde7413f6b26a6df9219ab2184c259b080` | 565 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `apps/web/src/views/Pay.tsx` | `579cbe531c39c83745e9a188b176b5a479a32a6b` | 1409 | main, PR305, PR301, PR285 |
| production | `apps/web/src/views/Pay.tsx` | `c44a7789d5c0a7c9952944c11e5dfcbdd00ba099` | 1524 | release, integration, PR303, PR298, PR290 |
| production | `packages/chain-adapters/src/abi/announcer.ts` | `4f23c31640ddd1c488862bcaf1fbb912d34eef6f` | 68 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/abi/chainlinkAggregator.ts` | `a54cdaba41c9c4bde0e2d549b488d66b54f333d9` | 114 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/abi/erc20.ts` | `9a6220772e30ee5696e7e5d4659b1dfc35fd4407` | 186 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/abi/erc20Metadata.ts` | `465b77c6bee8bc1b634034fc21fa196840c8ac1d` | 225 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/abi/erc2612.ts` | `d5d33127b4c30182257e103be4f5bf3f47a46cdd` | 78 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/abi/erc6538Registry.ts` | `e9f0cacf529165193fd32bb14ae685f3586a47af` | 174 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/abi/router.ts` | `e880f474779750d0941c34e3b6da5417e981543b` | 382 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/abi/sweepRelayer.ts` | `80d20a9cc78248064591c338fd5ddeedd4937481` | 395 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/adapter.ts` | `74bbb5e19755280fc5da29e4b12352ecd0a8b749` | 298 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/config/chains.ts` | `d9e78d0c2420ccfdd33f2bcdb29c0e5515b81f5d` | 78 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/config/tokens.ts` | `7abb737bb8ab184788d56b9f48f75712b6cf8d0b` | 64 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/deepscan.ts` | `2d8a656c0e0625789a68d82f71f2f07f42730e73` | 31 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/deployments.ts` | `1fbaa3af3f200622596bd552d7af6e330d1c2fb8` | 194 | release, integration, PR303, PR298, PR290 |
| production | `packages/chain-adapters/src/deployments.ts` | `a6d2aa4c10ec317cd3c91b0ac09447d755180425` | 187 | main, PR305, PR301, PR285 |
| production | `packages/chain-adapters/src/deploymentsSignature.ts` | `cf6a6587d79631e0e9d69cdab1c60f429642a6e5` | 104 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/deploymentsVerify.ts` | `0f958f28cf9c8a496a6068f3d1a423f47973a037` | 70 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/errors.ts` | `3b2cb127f6bbe1f4d46987206039e06554d33038` | 49 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/fees.ts` | `4008c66a0ecf84b59c656bf0607734e9c5d3be07` | 200 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/index.ts` | `dfa32775befe9a3d96addc5bc9294174025d2ad2` | 34 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/logs.ts` | `4801b9589043c0d003cf1d002e745451239f6b21` | 535 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/payments.ts` | `c57c9a2dc3bcb45c2b66df17e8be26d0a1dcbbcc` | 583 | release, integration, PR303, PR298, PR290 |
| production | `packages/chain-adapters/src/payments.ts` | `c910b8cceb25c308fdd9a93204be1022a611ae02` | 405 | main, PR305, PR301, PR285 |
| production | `packages/chain-adapters/src/permit.ts` | `03839deab45622f38b33c6ccf787eca4b55767ad` | 192 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/quote.ts` | `5e9d933b4ea06e3944c514057e7014b9eb28fa3c` | 320 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/registry.ts` | `6f55257e7f8f92c856f9808860feca48f57d8e65` | 243 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/registryDelegation.ts` | `3b1a7fd45059ebf1f165ff4e2d074937f9f5fda5` | 130 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/registryEns.ts` | `7f113d6fdc75f6818b4eceabf7dd6c445573327b` | 73 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/router.ts` | `2ee7bbdb7832797ce128b71ee31030620e04fabb` | 388 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/rpc.ts` | `1c8d1edc486c70b7ea7fee96ec62c57af00e421e` | 491 | release, integration, PR303, PR298, PR290 |
| production | `packages/chain-adapters/src/rpc.ts` | `60b3505d3bc62089afd1ed4741bea29273ebea8a` | 485 | main, PR305, PR301, PR285 |
| production | `packages/chain-adapters/src/scanVerify.ts` | `b2a7c6420c9c6cff49974c41d881b8a3f5646d28` | 170 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/sweep.ts` | `8a8004d1a19be56426e8d19663d438ce69516077` | 312 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/types.ts` | `0a3c2aabaa9f3fbceb6ddb9863ddf859a2fd8ca0` | 9 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/chain-adapters/src/verify.ts` | `4c2355a55efd4f747d363b92cb8ad90525da496e` | 238 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/merchant-ledger/src/csv.ts` | `1508ab1d2af0faaac0b9f84828e35eac0f38396a` | 31 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/merchant-ledger/src/decimal.ts` | `658367df36a8207c891626a87df91573ab8ef570` | 94 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/merchant-ledger/src/errors.ts` | `99075e980e8075f90950d70158dcd8513995832b` | 7 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/merchant-ledger/src/export.ts` | `00217cc059a213a9b6dc34f8aca29aed81a109ca` | 267 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/merchant-ledger/src/index.ts` | `5ac7123d26674f70f6dc9edb37f7c0d60596e235` | 33 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| production | `packages/merchant-ledger/src/reconcile.ts` | `5ca846c8e38c4a99343c2cb979f42f8f03883b8a` | 177 | release, integration, PR303, PR298 |
| production | `packages/merchant-ledger/src/reconcile.ts` | `9e8b5e310e0c445c954e43de3ad712a1a88512b2` | 175 | main, PR305, PR301, PR290, PR285 |
| test | `apps/web/src/components/CameraImporter.behavior.test.tsx` | `4c6e955619e147baca36ad0ba8fecc48c806d640` | 142 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/CameraImporter.i18n.test.tsx` | `5cd833b00369917e7e2caf62f9e1b3bb673623b8` | 137 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/CameraImporter.lifecycle.test.tsx` | `9e66a8f7cccd7a5e9cd4cec94f79b6ddeb70926e` | 278 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/CameraImporter.multipart.test.tsx` | `58833ea84270b29d5b21eb5fb10ccb5a9928187b` | 401 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/CameraImporter.test.tsx` | `9de1420a4ffd86d57aff5500da6db386565efd23` | 158 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/CameraImporter.visibility.test.tsx` | `591becf9ad1f59e143bd3356b9b3a1bcc1ec6d11` | 154 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/components/Common.test.tsx` | `af9c2a77b7d1232b50f8861dd0793c2c0eebc240` | 183 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/ContextHelp.test.tsx` | `6c282bff7a223286c431c41514351ba6c6d2b2c2` | 145 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/Disclosure.manifest.test.tsx` | `da7fd9a6813dc6b1ddfa1aaa5ec165d199b525e8` | 72 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/components/ErrorBoundary.test.tsx` | `b1bdf393bac0b9fb3e576f3b526d2f78d21b9f76` | 65 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/InvoicePaymentSummary.test.tsx` | `ceb237b51e68887f5932b8a87ddf4e71a7719522` | 41 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/InvoiceSignerVerification.test.tsx` | `28a040d3b4b2049f97d90c6de10605aa32fd9210` | 143 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/components/MerchantProfilePanel.test.tsx` | `d1376d02bc6ce341c382efed1fe025f9ab549c1d` | 153 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/MerchantTemplateIssuer.test.tsx` | `c162fb9ca1ba5b71cbc34296172a2339883fc9a1` | 35 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/PaymentRequestQr.test.tsx` | `167776cdc0703bed151715ff619197649da0d2fe` | 138 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/PrintableBill.test.tsx` | `4e80b81546f6d10464ef2dd25464036113d0e817` | 111 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/QrFrame.i18n.test.tsx` | `31c15bcb5a18296b67942bf93cdc30c32426d2c3` | 42 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/QrFrame.largeWarning.test.tsx` | `7c8c1cf7150a88a5487a8b0db9496c7287c22af3` | 21 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/QrFrame.security.test.tsx` | `642a51e40607844f2af9e5d59a3e1a0e752b3c4f` | 106 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/QrFrame.test.tsx` | `6f84f7e43f15afae4bc1f292a95510ead7bd2123` | 162 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/QrView.i18n.test.tsx` | `474affeda6d8f7e68a0bd4d4a976350b92a8291f` | 56 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/QrView.test.tsx` | `8dc103ff3c081a63bc631aa9e532fdf2de2e3bd0` | 21 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/ReceiptPanel.archive.test.tsx` | `93dc56732d3fc433d640fb88b04d1f13295beac1` | 92 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/ReceiptPanel.i18n.test.tsx` | `ee6c99f0a4dc9d5c3a8d47194f9e6425c24e8d06` | 67 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/ReceiptPanel.invoice.test.tsx` | `909b92a8ba967c82af14dfffe0385b34ef4331ad` | 200 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/ReceiptPanel.profile.test.tsx` | `ba9b2d6b690c2494cad7c4c3633abff7de6a0d4c` | 85 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/ReceiptPanel.test.tsx` | `1ba3f5cce99b7a13d2b6cb21d728bf152d283353` | 93 | main, PR305, PR301, PR285 |
| test | `apps/web/src/components/ReceiptPanel.test.tsx` | `8f14ca64dfef6668c59d280597dd252adf849bb0` | 142 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/components/ReconciliationLedger.i18n.test.tsx` | `be6fb9d4ffa6db300695d5b25ffc1ffa63de81e6` | 135 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/ReconciliationLedger.invoices.test.tsx` | `d3f96ceebe31fa1fde01dc2dfeca427e10df24c7` | 283 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/ReconciliationLedger.test.tsx` | `eb5258cc762b0dbc4c7d9191b4fb36888ebda9e0` | 432 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/SharedComponents.i18n.test.tsx` | `a48fbe04da171154ba009ce11132e30ffbcaf80f` | 238 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/TagArchive.atomicity.test.tsx` | `9e51bda4ea0f872622a86f476da996a1a6b74a32` | 246 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/TagArchive.history.test.ts` | `5380b9e5103f740c424195ba05effde25a7729e3` | 36 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/TagArchive.retry.test.tsx` | `4dc87d93947d5499be1792836642cf4606e6ccde` | 85 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/components/TagArchive.test.tsx` | `01beb3c0c5cf3142ad957a9e1209f15871062082` | 263 | main, PR305, PR301, PR285 |
| test | `apps/web/src/components/TagArchive.test.tsx` | `d5c0ec5f453dbc5d094885c8ad8301a6016631ab` | 279 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/components/WalletAttempts.test.tsx` | `8109cae9dd53a8645ce4c5fcda524b752b95cb6b` | 18 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/policy/PolicyReceive.regression.test.tsx` | `9c493241a69595b1c1d7d1aa92e7152da7b50397` | 103 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/policy/PolicyView.guard.test.tsx` | `9ccdadb0fd50fed4112e5abc399c0598ba26f93d` | 402 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/policy/PolicyView.more.test.tsx` | `2d5df14501a00e9842d2aa055cf7b08e67209693` | 221 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/policy/PolicyView.network.test.tsx` | `bfcf526291cc81f624b97441cfc186997fa485ed` | 192 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/features/policy/PolicyView.scope.test.tsx` | `0c80f5a339d28cbe9eecd3e547fb76f70e615052` | 186 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/policy/PolicyView.test.tsx` | `7cd927c29357adda705d353a33379aea0bc29df2` | 257 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/policy/create.callback.test.ts` | `0ba405fa0bbc1eb2b19bd8942d251784b4436099` | 21 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/policy/deploymentEvidence.test.ts` | `378e1ab2a4bacc5a13d20e852e9d5edf853d6da0` | 81 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/policy/fixtures.testutil.ts` | `5237abb184401270ac2cb96f75fb9507969f32df` | 240 | main, release, PR305, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/policy/fixtures.testutil.ts` | `6db098624324846c7a6f577a90bd35b01c80f200` | 240 | integration, PR303 |
| test | `apps/web/src/features/policy/pay.selfcheck.test.ts` | `a719bc51a3a4cb227e20ddcdf7ccd0e650f8ab9d` | 56 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/features/policy/paymentEvidence.anvil.test.ts` | `e25e0f2fc7ebe288978a324ed1893787c666c500` | 187 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/policy/paymentEvidence.test.ts` | `ab0b5217ce4f4a9982c9cf5f94d4113098222e5a` | 183 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/policy/policy.logic.test.ts` | `c9084fa2048ee270916a72e288a9800e7f1254fc` | 373 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/policy/policyTime.test.ts` | `7f3e9133a915985fa4b95ea9b4d16e3f10c3fe15` | 23 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/policy/send.test.ts` | `2d6e6e6a6afe4f066c4e23027366bf9dd9d57577` | 368 | main, PR305, PR301, PR285 |
| test | `apps/web/src/features/policy/send.test.ts` | `aa1b08c198e72dc55854551183670d37061984b0` | 440 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/features/policy/withdrawal.testutil.ts` | `4bc272f43577eb8635112e9576ccad5b1b6e23ae` | 58 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/policy/withdrawalJournal.test.ts` | `fb1563393f30ac968a7749a0ec523f6dc0b801eb` | 134 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/policy/withdrawalState.test.ts` | `e9e20473db96b5fd6a4fdb5d5343b932e61a790d` | 239 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/registry/RegistryView.export.test.tsx` | `10fc44d00152be737dbf4f3a172624cce0337b1d` | 71 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/registry/RegistryView.i18n.test.tsx` | `03180167b4e9ae29e8294d1cee73028cb360de46` | 87 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/registry/RegistryView.network.test.tsx` | `f2a879bf1deecde6c8ad94d40a21096dcbe1c04c` | 78 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/features/registry/RegistryView.test.tsx` | `fb79a7398af4872f6cb129914dfea12b96cb8d6d` | 291 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/registry/ref/Registry1271Wallet.test.sol` | `051aec1851c392ab9c5040bd34e8137d01ac1d6a` | 34 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/features/registry/registry.anvil.test.ts` | `a49f0439dc4ffdec9449df3fee32fc92ba114c8d` | 252 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/format.test.ts` | `3d6a9f5fade916452bc64fe98a3c9abb64add101` | 78 | main, release, integration, PR305, PR298, PR290, PR285 |
| test | `apps/web/src/lib/format.test.ts` | `43d5b5c882abdfb392776dd13d772e972f13ab46` | 92 | PR303, PR301 |
| test | `apps/web/src/lib/fragment.test.ts` | `d3b8dc4682bee893ead90a8c0b9ce3669d4262d3` | 34 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/invoiceCreate.test.ts` | `b852ad654e5d78f79d971accd90810dd7d82f549` | 149 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/invoiceSignerPins.test.ts` | `d0f00af1cc06573870f047967b97087cc086628d` | 306 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/lib/invoiceVerification.test.ts` | `dc43e8c535e862c4e5798d5b757f6335d29c6ce0` | 54 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/lib/merchantIdentity.test.ts` | `957027808890f366f337c375e52b5c081206dae7` | 157 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/lib/merchantIdentity.test.ts` | `c26773145f2fdc22ff05871157c34b7021a644f4` | 137 | main, PR305, PR301, PR285 |
| test | `apps/web/src/lib/merchantTemplate.test.ts` | `cfd2b73cdd1497a20e940c62ccbe59210af4f9a3` | 114 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/pay.test.ts` | `7e27cf90328b7d9421e394edc10515e61157a1d5` | 611 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/payExec.acceptance.test.ts` | `4dded28d0f6c9521b07c07557cf2df589ba4fdba` | 171 | main, release, PR305, PR301, PR290, PR285 |
| test | `apps/web/src/lib/payExec.acceptance.test.ts` | `6eafa0466c682977baa69b7c87b91ffd8b79c227` | 171 | integration, PR303, PR298 |
| test | `apps/web/src/lib/payExec.test.ts` | `0e9a3abe4e78e4091b19614ef68efb285b5c1254` | 1025 | integration, PR303 |
| test | `apps/web/src/lib/payExec.test.ts` | `3554a2315bfffd0116d2ec2abaaf73f7b0dbc2cd` | 947 | main, release, PR305, PR301, PR290, PR285 |
| test | `apps/web/src/lib/payExec.test.ts` | `4deb9d710209a5a83a8ae9d5dcecf3aac1058748` | 967 | PR298 |
| test | `apps/web/src/lib/qr.test.ts` | `bb3a921720b5d5ee7394693127d9054699e87f0f` | 69 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/qrClassify.fuzz.test.ts` | `198909c9d308d304306e0942ee15a9eb57f160b9` | 113 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/qrClassify.test.ts` | `39d4161426183bfc2dd4412ac9be27454dabd095` | 418 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/qrContrast.test.ts` | `217cc4d2bbb789767c5d7a769b9ee4929e85fb66` | 18 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/qrKinds.test.ts` | `257b634250f033ddec042b67941fec23ffba1323` | 203 | integration, PR303 |
| test | `apps/web/src/lib/qrKinds.test.ts` | `990d723ee8877c6de7f9f604a3e7e183bb6ff358` | 107 | main, PR305, PR301 |
| test | `apps/web/src/lib/qrKinds.test.ts` | `af5ef89f6fba0cea13b18884df387875f064ad34` | 194 | PR290 |
| test | `apps/web/src/lib/qrKinds.test.ts` | `e918e36848f4e01322afbdf41cf561b3222cc14a` | 119 | release, PR298, PR285 |
| test | `apps/web/src/lib/qrMultipart.test.ts` | `45992f537d1f226dd20e57d96a246c6f18419395` | 51 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/lib/qrMultipart.test.ts` | `4fd6b1e458b8d79a4828254f7b21982bf245a01e` | 41 | main, PR305, PR301, PR285 |
| test | `apps/web/src/lib/qrPayload.test.ts` | `aa45d2174751052a1dc1dfa1069297be75be634a` | 16 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/receipts.test.ts` | `70e1c9aed859596389f5b43b93e0d6ff26f58bec` | 135 | main, PR305, PR301, PR285 |
| test | `apps/web/src/lib/receipts.test.ts` | `d8770c168ada02cedf50ecaa8bb47060f7199a35` | 149 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/lib/sellerPairing.test.ts` | `59c0ff53bd9e4619adc700cd559ea00886ac7359` | 119 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/sweep.boundaryAudit.test.ts` | `e3813045c7975bcbd4e1201d65869e6962827c25` | 215 | integration, PR303 |
| test | `apps/web/src/lib/sweep.destinations.privacy.test.ts` | `8097b83ba5ce627a38ec302fd9f9b1950369ba4b` | 114 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/lib/sweep.nativeReview.test.ts` | `1a57ad6d116171cc64cab5293aa572a45d22daa2` | 336 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/lib/sweep.reviewAuthority.test.ts` | `b1e5c22e708da43efa3d61b85d9272ce136a2bdb` | 249 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/lib/sweep.test.ts` | `c391e4aca34e7125383e04bb32d26f1c1b55bd4d` | 1124 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/lib/sweep.test.ts` | `f38c5b90985f705a8d4cfac87a897cd6ee394d1b` | 1091 | main, PR305, PR301, PR285 |
| test | `apps/web/src/lib/sweepAttemptJournal.test.ts` | `9bfe12a040b536bd4bc8e9016b80ad70347b767b` | 161 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/tagArchive.fuzz.nocov.test.ts` | `8f899eb8e00a5717dc8d094f1470bf72bc4e14d9` | 36 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/tagArchive.test.ts` | `3f4a4a046f42373a722bcb17130c7bbf459f465d` | 325 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/tagArchive.vectors.test.ts` | `ae49b5a848f8af4b61621b0b2535ff911720f891` | 35 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/tags.test.ts` | `cabeff3806d9ee2a2ed44b4d60679db071e70aec` | 240 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/tagsConcurrency.test.ts` | `1729f7dcc4f9330278a40572c87719babb987268` | 118 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/txGuard.test.ts` | `1f1749730b2af7483bacdeecc29f2fbda5490de3` | 183 | PR305 |
| test | `apps/web/src/lib/txGuard.test.ts` | `c5c6f6488a7ddd52bc175df6b8221ff45b2fd44d` | 164 | main, release, integration, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/lib/wallet.test.ts` | `0eef38ea9deb736072515d3240eeabfbd6b5e49b` | 383 | integration, PR303 |
| test | `apps/web/src/lib/wallet.test.ts` | `6416192e15102bf6725eac9b945ff45681d021ff` | 272 | main, release, PR305, PR301, PR290, PR285 |
| test | `apps/web/src/lib/wallet.test.ts` | `d76eae2520f89b14208485a79f8e686117382a55` | 328 | PR298 |
| test | `apps/web/src/views/CreateInvoice.buffer.test.tsx` | `5c4269fa33cad4250deba0b955c4a090c0b269bd` | 249 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/views/CreateInvoice.i18n.test.tsx` | `8269636eef8652821346ec8fa375671409561e21` | 51 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/views/CreateInvoice.ordering.test.tsx` | `5cded4b3666f14dc57f1878c245a59d6bed4192a` | 76 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/views/CreateInvoice.privacy.test.tsx` | `e882d1107eb8a88c4583094a1081a82fc7d1f644` | 118 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/views/CreateInvoice.register.test.tsx` | `c0ab7561bb91cc777026c081a9ee39ff54db2e41` | 83 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/views/CreateInvoice.supported.test.tsx` | `17feff9faf1ceb38432b63cd1cf361433827b340` | 159 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/views/CreateInvoice.test.tsx` | `0d1ca5555de25aeebebccec61232bedbad4e1c18` | 267 | main, PR305, PR301, PR285 |
| test | `apps/web/src/views/CreateInvoice.test.tsx` | `de1c61ddaee5a7e2ef33b41a2c02a6bbfda6569e` | 281 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/views/Pay.i18n.test.tsx` | `b8d80d61869c5c0ec015302a872a63269534d6ad` | 135 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/views/Pay.invoiceQr.test.tsx` | `3eb5ab0072c4cf5c61b7502d68d0e141dfd3b133` | 373 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/views/Pay.network.test.tsx` | `e72ea03feaa07a7e5450ac3eae1bef7c7a097887` | 81 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/views/Pay.preflightCompletion.test.tsx` | `a8375bae63a9648c425d9da9e5dc8dbaa041f8a8` | 151 | release, integration, PR303, PR298 |
| test | `apps/web/src/views/Pay.signer.test.tsx` | `06a1750266a87afac186e7b1d8b64f4af689a9de` | 239 | release, integration, PR303, PR298 |
| test | `apps/web/src/views/Pay.signer.test.tsx` | `c93c871fb4500c1d34bcac28cedfebb2f7ab4088` | 238 | PR290 |
| test | `apps/web/src/views/Pay.supported.test.tsx` | `d19f8f7efd6ca0fb5b5d6ef738e1fcf56fb8f83d` | 170 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `apps/web/src/views/Pay.test.tsx` | `199ecddf5d1e6ab7aec4ebd2ba5d01a5908f0b3c` | 1273 | integration, PR303, PR298 |
| test | `apps/web/src/views/Pay.test.tsx` | `7ef3db702caa56538a7fd4e82e63eafb895debd5` | 1273 | main, release, PR305, PR301, PR290, PR285 |
| test | `apps/web/src/views/Sweep.nativeReview.test.tsx` | `e8d5fcb22def002ca90add99e344b4a132835c10` | 188 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/views/Sweep.privacy.test.tsx` | `2334a9bb524127b6cc6165a857f7942e74420c27` | 84 | main, PR305, PR301, PR285 |
| test | `apps/web/src/views/Sweep.privacy.test.tsx` | `70d8ba09fbc19a6b2ab2de14d21d73c25cebb6a4` | 224 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/views/Sweep.quoteLifecycle.test.tsx` | `2da1d11b208b413377b41b8416c0909dd0deebfa` | 424 | release, integration, PR303, PR298, PR290 |
| test | `apps/web/src/views/Sweep.test.tsx` | `17049ca012bd5bab662dd450668c64b11e7700dd` | 1012 | main, PR305, PR301, PR285 |
| test | `apps/web/src/views/Sweep.test.tsx` | `2be1f668375db2c95f6d184514350bc0913b8685` | 1070 | release, integration, PR303, PR298, PR290 |
| test | `packages/chain-adapters/src/abi.test.ts` | `f002b418d7a4ded9b4b6f57d3773a68aa0e7373e` | 31 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/adapter.deep.test.ts` | `6d9e6a729beb5c23823d5e9df9d5b218ac8fd98a` | 119 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/adapter.test.ts` | `d0daffb7d0dc6f1dae3f3e66121843261c39542a` | 192 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/config.test.ts` | `13b089af2466865360b6d58806a94d1c5aa66580` | 61 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/deployments.test.ts` | `251fdedabf2f2be66ce1a0b48946ee5721fe7691` | 136 | release, PR298, PR290 |
| test | `packages/chain-adapters/src/deployments.test.ts` | `8ad8ca9c354435a2acf491bb4372a98e21e08738` | 134 | main, PR305, PR301, PR285 |
| test | `packages/chain-adapters/src/deployments.test.ts` | `9a35cce7f79ef3341e73ed2b8aa140653b97756b` | 138 | integration, PR303 |
| test | `packages/chain-adapters/src/deploymentsVerify.test.ts` | `403eca13495a3d7a850b14c2629ff0b781c4efe3` | 136 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/eip712.independent.test.ts` | `9470d3c9304a1e969965d36b8fc86e4a8688566c` | 99 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/fees.test.ts` | `d460da6b0030eb99edac2464399f689ef77f147e` | 163 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/fixtures.testutil.ts` | `e7fe0201cbbc0f7581baabf25e67a1c951707f6f` | 70 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/logs.test.ts` | `e10267684a88385ecd9b289f3d85f29546961196` | 466 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/payments.anvil.test.ts` | `fe6523aa89555b5b0fa4c17109aa931c4aff8a64` | 230 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/payments.bulkCancellation.test.ts` | `e59e3618be5b8ed9b7e4017c6edcf4a9200a511f` | 113 | release, integration, PR303, PR298, PR290 |
| test | `packages/chain-adapters/src/payments.test.ts` | `12fdeeece0a305b75c46baf51098e6e704ed7c86` | 575 | main, PR305, PR301, PR285 |
| test | `packages/chain-adapters/src/payments.test.ts` | `d14d6209eabff60cc6dbf1a78cb50fbf57b81ca3` | 674 | release, integration, PR303, PR298, PR290 |
| test | `packages/chain-adapters/src/permit.test.ts` | `a59fe67b62b7b368e072ad37fb5fa9a818367dfa` | 197 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/quote.anvil.test.ts` | `b0d274199e3ff7aaab1926e88eafc2437534d617` | 111 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/quote.guards.test.ts` | `a0b5058d01dcea87a2e20fc3b7f63a4b5cc45f29` | 148 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/quote.test.ts` | `a6348941fa36533ca408d8a10e059fcd52ed5884` | 207 | main, PR305, PR301, PR285 |
| test | `packages/chain-adapters/src/quote.test.ts` | `ab98c68605acba6a7d094e631ab1431ab88e2763` | 211 | release, integration, PR303, PR298, PR290 |
| test | `packages/chain-adapters/src/registry.compat.test.ts` | `ffcc3420bf57ec069bc9ad1995497c0a85da21fb` | 114 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/registry.test.ts` | `b705e66f46759ee506fa7cea74b4fa84ed59bc02` | 111 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/registryDelegation.test.ts` | `e80fdc0c4e0a681336552f866d0d0e4dd66dfe24` | 184 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/registryEns.test.ts` | `890f227fa0a11ec5ab7104444173187cc2de2540` | 88 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/router.anvil.test.ts` | `bca50477b3cb2768b2aa6729bd3fc22a5f247336` | 159 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/router.test.ts` | `0e5791a4bfba226e85ef4028469dcda095254951` | 304 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/rpc.test.ts` | `cbc9b3498b3411b2a8187ece3fc97f928bef6e13` | 489 | main, PR305, PR301, PR285 |
| test | `packages/chain-adapters/src/rpc.test.ts` | `f7bb85cb0296ccae726859842b06c6f76b6974b8` | 502 | release, integration, PR303, PR298, PR290 |
| test | `packages/chain-adapters/src/rpc.testutil.ts` | `fd1f9785ada9a09a9c2a98278b32e52c81d3cfd6` | 30 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/scanHardening.test.ts` | `d6f41acbfe8cab313bd07fbc9c366e92bd80221e` | 493 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/scanVerify.test.ts` | `7999c8edb1b36220b06490c773cdda0b37aff695` | 218 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/sweep.test.ts` | `60526c7f94d0f6851b6f1dd64ec1ef9668b94392` | 212 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/chain-adapters/src/verify.test.ts` | `44e8a2b27749afd6f44f13f5114288a86c40a15e` | 248 | main, release, integration, PR305, PR303, PR298, PR301, PR290, PR285 |
| test | `packages/merchant-ledger/src/ledger.test.ts` | `91712cbb9561ba9d660d8ac10892c8c96e5942c3` | 369 | main, PR305, PR301, PR290, PR285 |
| test | `packages/merchant-ledger/src/ledger.test.ts` | `ee0270fc6fbd7402262c89b33f4213a03bd294e3` | 395 | release, integration, PR303, PR298 |

## Additional partial source reads

These snippets informed triage and do not grant whole-file coverage.

- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` · `apps/web/src/AppShell.tsx` · context around ViewSwitch, selected view, sweepTarget setters, idle reset and render.
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` · `apps/web/src/views/Scan.tsx` · 926 (callsite search only).
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` · `apps/web/src/components/ReceiptPanel.invoice.test.tsx` · 70-104,182-198 (partial source evidence only).
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6` · `apps/web/src/components/ReconciliationLedger.tsx` · 757 (rendering sink search only).
