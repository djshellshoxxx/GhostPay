# Core cryptography, schemas, SDK, policy and vault review

## Scope and result

This defensive source review covers the assigned production directories `packages/core-crypto/src`, `packages/secret-box/src`, `packages/invoice-schema/src`, `packages/sdk/src`, `packages/policy-scheme/src` and `packages/ux-vault/src`. Application code was not changed. No attack, exploit reproduction, live endpoint request or transaction was performed. Existing tests were read where they clarified intended behavior; none was executed by this reviewer.

Coverage is complete for **65 production paths and all 78 distinct path/blob versions** in this domain of `source-inventory.json`. There are 64 paths on main, 13 changed existing paths in the release/consolidation family, and one new path, `stealth-export-portable.ts`. These versions account for 518 appearances across the eight selected refs. `crypto-schema-coverage.json` records the exact blob and representative pinned source for each version. Identical blobs on other selected refs share that review and are not new implementations. Test helpers are outside production coverage.

| Ref | Commit |
| --- | --- |
| main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| release | `417f7c71daf8645e1432f2ec8f070110879b80bd` |
| consolidation | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |

The other five refs are pinned in `scope-refs.json`. Their assigned-domain blobs equal reviewed main or consolidation versions. Complete main implementation files were read, followed by complete changes for newer versions and analysis of their unchanged surrounding behavior. The new 855-line export codec was read in full. The three ABI files are data-only constant exports: every entry and nested parameter structure was inspected through structural enumeration. This does not independently establish deployed-contract equivalence.

The actionable cross-layer finding is **ZC-CRYPTO-01**, a low-severity mismatch between minimal receipts and the UI's recipient-check assurance. **ZC-CRYPTO-02** is a low-severity lock-state defect in the supporting address-book API, for which no production application consumer was found. **ZC-CRYPTO-H01** records residual-buffer hardening, including a previously documented exception path. **ZC-CRYPTO-O01** records a conditional SDK resource-bound observation. Keep these categories separate in browser/release-impact counts. This static review did not identify a confirmed cryptographic forgery, broken stealth-key derivation or authenticated-ciphertext substitution path in the assigned sources.

## ZC-CRYPTO-01 — Minimal receipts do not report whether the expected recipient was checked

**Severity:** Low. **Confidence:** High for source behavior and the cross-layer mismatch. **Status:** Present in the selected release/consolidation family; pinned main requires the address and lacks this omission behavior. **Scope:** New minimal-receipt feature. The UI corroboration in `web-views-review.md`, **WV-02**, is the same finding and must not be counted twice.

**Library evidence:** `packages/invoice-schema/src/receipts.ts`, consolidation blob `a991e6aa7ac6bb2cea5758a1d79409c513758311`. Lines 24–25 make `stealthAddress` optional. Lines 147–155 in `bindReceiptToInvoice` compare a supplied expected address only when the signed receipt also contains an address. Lines 52–55 and 157–167 return the signed receipt and signer-match classification without separately reporting recipient binding. [Pinned source](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/receipts.ts#L143-L167).

The added `receipts.test.ts` case “does not assert a recipient binding the receipt does not carry” explicitly expects acceptance of a correctly signed minimal receipt even when the binding argument includes an expected address. Omission support is intentional; that test does not establish that the UI communicates the omitted check.

**Caller evidence:** The views reviewer independently read consolidation `apps/web/src/views/Pay.tsx` lines 678–688, which pass the current prepared recipient as `stealthAddress`, and lines 1279–1282, which show a successful receipt result. English receipt guidance in `apps/web/locales/en.json` line 973 promises that the prepared one-time address is checked. This reviewer then directly read those same pinned snippets. WV-02 records the UI evidence and source pins. The success wording separately limits the receipt to seller-key attestation, reducing impact but not making the recipient-check statement true. [Pinned UI](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Pay.tsx#L678-L688), [pinned guidance](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/locales/en.json#L973-L985).

**Preconditions and impact:** A payer verifies an otherwise valid seller-signed minimal receipt while an expected recipient is available. The signature, invoice digest, chain, asset, amount, signer policy and any supplied transaction hash still have to pass their checks. The receipt can establish the seller's attestation without establishing the recipient fact. The current result and guidance can give the payer more assurance about that fact than was checked. This does not allow forging a signature and does not establish an on-chain payment or enable a spend.

**Remediation:** Preserve minimal receipts while reporting actual binding results, for example recipient binding as `matched`, `omitted` or `not-requested`, and display the omitted case accurately. If a consumer requires recipient binding, provide a strict policy that rejects omission when an expected address is supplied. Do not silently require optional disclosure for every receipt consumer.

**Validation guidance:** Add ordinary unit/UI regressions for a minimal signed receipt with an expected recipient, a matching address-bearing receipt and a mismatching address-bearing receipt. Assert both verifier status and displayed assurance. Preserve wrong-signer, wrong-invoice and signature-integrity checks. The existing acceptance test should remain compatible with the chosen minimal-receipt policy, with the missing distinction explicit.

## ZC-CRYPTO-02 — A pending address-book password change can restore key state after lock

**Severity:** Low, supporting API only. **Confidence:** High for the source state transition; not reproduced at runtime. **Status:** Present in all selected refs. **Reachability:** Repository search found `createVault` used by its own tests, with no production application caller. The browser's current seller-key and reconciliation vaults use different guarded implementations. This is not a claim that their lock controls are bypassed.

**Evidence:** `packages/ux-vault/src/vault.ts`, blob `2cb0dbee41ab47e4bba5dcb3c2246d5547af8bdb`. `changePassword` captures the book at line 212, awaits storage/password verification/key derivation/persistence at lines 213–217, then assigns `ctx = fresh` unconditionally at line 218. `lock()` clears both `ctx` and `book` at lines 233–235, while `isLocked` checks only `ctx` at lines 198–200. Adjacent mutation/import paths already check captured context before restoring book state. [Pinned source](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-vault/src/vault.ts#L189-L236).

**Preconditions and impact:** A consumer begins a password change on an unlocked profile and locks before an awaited step finishes. Its continuation can retain the newly derived `CryptoKey` and make `isLocked` false after lock. The book remains undefined, so normal `live()`-guarded operations reject: this is inconsistent lock state and avoidable key retention, not demonstrated post-lock book access. Persistence can also finish after lock without a revision check.

**Remediation:** Capture a session generation/context and check it after asynchronous boundaries, before storage commit where the interface permits a transactional guard, and before assigning the new context. An invalidated continuation should release its key reference and remain locked. Use one predicate for both reported lock state and operation eligibility.

**Validation guidance:** A controlled asynchronous storage/KDF test should lock during pending rekey, allow that step to settle, and verify the session remains locked with no restored context. Cover ordinary successful rekey and lock before invocation. Existing tests read here cover normal rekey and immediate lock, not this interleaving.

## ZC-CRYPTO-H01 — Residual-buffer cleanup is incomplete on owned temporary paths

**Classification:** Low-severity hardening, distinct from demonstrated disclosure. **Confidence:** High for missing cleanup in source. **Status:** The paths below remain in main and consolidation. `generateKeySet` exceptional cleanup was already documented as code-tslibs I-02 in `docs/audits/05/crypto-core.md` and is not a new discovery.

| Source and exact blob | Observation |
| --- | --- |
| `packages/ux-vault/src/tag-archive-portable.ts` 139–145; `c6ff5f13cfc286921cd06f7aa036579747dd943e` | The NFKC UTF-8 passphrase buffer is passed directly to scrypt without retaining a cleanup reference. The raw derived key is wiped, but the password byte copy is not. Latest keystore code now explicitly wipes this same class of buffer. |
| `packages/invoice-schema/src/envelope.ts` main 230–247 and 534–557; main `9e6f5d8b80405d634252bf0b65a50d8610325f58`, consolidation `cc6b9dd6fc20fb93ecb22b00e8391338bfd6a0e4` | Original `A256GCM` fragment encryption wipes its AES key only after success. Decryption passes an anonymous decoded key buffer and has no cleanup for decrypted plaintext bytes. The newer passphrase mode uses stronger `finally` cleanup. |
| `packages/core-crypto/src/keys.ts` 45–57; `086e80c73f79107c33dcc036f60577874cb7c279` | `generateKeySet` creates a spending secret before viewing-key/public-key generation without failure cleanup. Later failure leaves an already-created secret for garbage collection. Equal-key rejection wipes both. Previously documented I-02. |
| `packages/ux-vault/src/vault.ts` 215; `2cb0dbee41ab47e4bba5dcb3c2246d5547af8bdb` | Current-password verification discards `open()`'s result, leaving its decrypted address-book byte buffer unwiped. Normal unlock has a `finally` cleanup. Supporting legacy API only. |

Pinned evidence: [tag archive KDF](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-vault/src/tag-archive-portable.ts#L139-L145), [invoice encryption](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/envelope.ts#L230-L247), [invoice decryption](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/envelope.ts#L534-L557), [key generation](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/core-crypto/src/keys.ts#L45-L57).

**Preconditions and impact:** Incremental exposure requires later memory inspection/disclosure while the allocations remain recoverable. No independent heap-access path was established. Wiping owned byte arrays does not erase JavaScript strings or engine/internal copies. The original encrypted invoice format deliberately includes its decryption key in the shared fragment, and private fields become application strings; this observation is duplicate-buffer retention, not confidentiality from a link holder. A failed key-generation attempt ordinarily occurs before the identity is used.

**Remediation:** Retain explicit references to owned password/raw-key/plaintext buffers and wipe them in `finally`, including provider/KDF rejection. Transfer ownership only after operation success. Capture and wipe the result of address-book password verification. Retain the documented limitation that JavaScript erasure is best effort.

**Validation guidance:** Follow consolidation `keystore-portable-memory.test.ts`: inspect caller-owned buffers through test doubles, assert cleanup on success and controlled KDF/provider failure, and preserve roundtrips. Such tests do not prove engine-memory or immutable-string erasure.

## ZC-CRYPTO-O01 — Supporting merchant SDK response cap follows buffering

**Classification:** Informational, conditional availability observation; excluded from browser-impact counts. **Confidence:** High for source ordering. **Status:** Same implementation in all selected refs.

**Evidence:** `packages/sdk/src/merchant.ts`, blob `17e7eb97c6820fd176f180f57a849e2460a8d664`, lines 188–192 awaits `res.text()` before checking `MAX_RESPONSE_CHARS` and strict-parsing JSON. Lines 170–175 use only a caller-provided abort signal, with no internal deadline. Lines 153–157 identify this as the self-hosted merchant API client. [Pinned source](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/sdk/src/merchant.ts#L152-L195).

**Preconditions and implication:** An integrator must enable this client against its configured merchant service. A malfunctioning/hostile service can make the fetch implementation buffer beyond the acceptance cap or leave a call pending unless the integrator supplies cancellation. The cap constrains parser/schema acceptance, not transport memory. No active Pages consumer or resource-exhaustion reproduction was established.

**Recommendation and validation:** Before relying on it in production, provide bounded streamed response reading and a documented default deadline or mandatory cancellation policy. Transport-double tests should verify cancellation at the bound and timeout cleanup. No payload generator or stress test is included.

## Main behavior already repaired in the selected newer snapshots

These are branch-status observations, not additional open consolidation findings. Main and `erc20-simulation` retain the older blobs. The six other refs share repaired versions. Invalid caller-created objects at an exported helper do not alone establish a browser attack path.

| Boundary | Main behavior | Newer behavior/disposition |
| --- | --- | --- |
| Policy signer | `eip712.ts` 337–352 verifies a digest against caller-supplied domain/types/message then signs the caller digest, contrary to its builder-only comment. Main blob `5a300009bf3bd95e3c0bc808acffaa00ac366f36`. | `rebuildPolicyDigest` 358–385 and signer 413–430 restrict the domain/types, copy validated fields and sign only the rebuilt digest. Blob `2f7679ede1e91ad43690fbe3f6fbfc4ab65910d7`. Closes generic-signer misuse; callers must still approve account and values. |
| Limit proof consistency | Builder verifies a supplied leaf/root without recomputing the displayed token/limit/window. Stored proof entries have the same gap. Blobs `5a300009bf3bd95e3c0bc808acffaa00ac366f36`, `b25c1fa2a7b50ccb800c5eedfca2f927c33697a9`. | New `isLimitLeaf` checks these fields in both paths. Limits blob `2836251024e902ab3bbfd203b90f6ebacd42a9db`. Main calldata/contract checks independently bind the leaf; no on-chain limit bypass established here. |
| Policy payment decoder | Predicted-account binding without full metadata/point/canonical-ABI consistency. Blob `3e1af8ed068229466ec14478a39aa07bc5aaccb1`. | Blob `35f20d3f07e02f42fac244552f4b50bce292402f` checks canonical re-encoding, point validity, metadata kind/token, net and minimum. Documentation correctly preserves caller responsibility for intended payee/router/value. |
| Scheme-2 secret copy | `derive.ts` 177 copies viewing secret before public validation outside cleanup. Blob `d70af630f3dfe38100f4714b1e8f5c38ab4d4e89`. | Blob `ce4be42c09dec5e77b34f185c2af717687143330` moves the copy after validation into its guarded lifetime. Memory hardening. |
| Canonical arrays | Main `.map` does not establish dense data-only arrays. Blob `b7a34bb5176ec72daf0026a59991863421bdb341`. | Blob `8ed01592d487c356a72d51e240e5cc63fb470a3a` captures descriptors, requires every element and rejects extra/accessor keys. Network JSON and invoice validation already constrain external inputs; no signature bypass established here. |
| Profile expiry clock | `merchantProfile.ts` lacks invalid-clock rejection. Blob `a75124bb35d2c319e6936097ef6b4048ac59ec76`. Already documented in random-audit ledger rotation 208. | Blob `a4269dec888518799aa4b3e8cc82d2ff9cc21d77` 157–158 rejects non-finite/negative clocks. Invalid caller clock is the precondition. Browser review found expiry rechecked after async fetch. |
| Keystore password bytes | Main untracked UTF-8 scrypt input. Blob `59e998e772e26be386aea4b8369d5240222ea1f9`. | Blob `330cebb6652fa6e54a10536eec7292af5cde129d` owns and wipes password and optional derived bytes in `finally`. Its memory tests were read. Tag archive equivalent remains in H01. |
| Runtime decoder type | Main `base64url.ts` relies on the TypeScript string type. Blob `eb7b8723f4a3b80a6ce457012636a5b29e1f8ccb`. | Blob `5466ee0b99925dedd23e753636ae7ab3f6f48234` checks runtime string type. API hardening, not demonstrated compromise. |

Newer envelope/error changes also classify missing signatures, unsupported versions and unavailable verification providers. Inspection found that these changes continue to fail closed; they were not counted as open defects.

## Controls and limits that prevented false positives

**Core and secret containers.** Rejection sampling excludes invalid scalars, compressed curve points are validated, reused spending/viewing keys are rejected, zero/infinite derivations fail, and the final secret's address is checked. Compressed-shared-point hashing follows repository ADR-0001; this review did not independently certify cross-wallet interoperability or audit noble internals. `SecretScalar` explicitly offers serialization guardrails, not same-realm secrecy. `SecretBox` uses WeakMap storage, cleans borrowed copies and bounds serialization-guard traversal. Arbitrary same-realm code calling secret-use methods is a documented trust limit, not a new sandbox finding.

**Invoice format.** Decoding checks encoded/decoded bounds, canonical base64url, fatal UTF-8, strict JSON, closed schemas and canonical equality. Signatures are domain separated and low-S. Passphrase envelopes constrain scrypt before derivation and bind clear headers through AAD. Original `A256GCM` links intentionally carry decryption keys. Valid signatures establish key control; pinning remains separate. Schema error paths contain fixed fields and bounded item indices, not supplied member names or field values.

**New stealth exports.** Exact schemas, input sizes, versions, curve points, checksum addresses, chains, canonical secret-body lengths and KDF bounds are validated. Headers use distinct keypair/master AAD domains. Every decrypted private key is checked against its public record, and partial failures wipe accumulated keys. Master exports contain spending/viewing keys only. A public record or matching key is not payment confirmation. Raw-key text is an explicit sensitive export and its UI must control exposure.

The apparent lack of a final serialized-size check in `encryptPaymentKeys` was not promoted: every output field length and unique-payment count is bounded. The existing maximum-capacity test uses maximum chain/block/log values plus transaction hashes and asserts the file limit and roundtrip. It was read, not run, and no contrary valid-record case was established.

**Reconciliation.** The entire 1,146-line shared engine was reviewed. HKDF/AAD bind seller/chain scope. Revisions and transactional compare-and-swap guard asynchronous writes. Imported history remains separate from current scan evidence and cannot automatically reserve invoice matches. Seller receipts are not matching inputs. Reorg tombstones, conservative cutoffs, checked canonical hashes and saturation preserve known invalidation through import. Caller-supplied verified scan evidence remains a trust input; this module does not independently contact a chain or prove finality.

**Other vault surfaces.** Default address-book merge does not automatically replace a same-ID payee address. Confusable detection is explicitly heuristic. The legacy text backup decoder lacks its own pre-decode text cap, but the discovered CLI input path uses bounded file I/O before it; no additional unbounded shipped entry was established. Public profile labels, seller/chain identifiers and archive headers expose metadata intentionally described by the formats.

## Completion and verification limits

All assigned inventory entries are reviewed; none remains for a fresh worker. Coverage is not a guarantee of exhaustive security correctness. This reviewer did not run tests/application code, install dependencies, audit third-party cryptographic implementations, compare deployed bytecode or test live infrastructure. Browser reachability and assurance were coordinated with the views/library reviewers. Existing notes distinguish documented limits and pending repairs from new findings. Whole-repository coverage integration and publication remain with the parent reviewer.
