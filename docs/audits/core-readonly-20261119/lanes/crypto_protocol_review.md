> Historical lane record. The final [catalogue](../FINDINGS.md), [branch matrix](../branch-applicability.md), [quality review](../findings-quality-review.md) and [unified coverage](../coverage.json) supersede earlier provisional status, pending queues and branch-wide wording below. UTC worker dates may fall on November 20; the user-facing audit date is November 19, 2026 (America/Los_Angeles).

# GhostPay crypto and protocol review — wave-one handoff

This is a static defensive source review checkpoint. The completed first wave covers all 73 production file versions in the eight packages listed below and 33 focused test file versions. It does not claim that contracts, policy, every test/configuration file, or the whole repository have been reviewed. No tests or exploit reproductions were run. The shared working tree was clean at this checkpoint.

## Immutable baselines

- main: c977b5d6723f6822c3b5d86cd6b231712c53c395
- release: 417f7c71daf8645e1432f2ec8f070110879b80bd
- completion: e22c1748a3de6eb02f5be3abe27d634b238c67c6
- base64-fix: 856b2d60fd38eabb8a1c856c95ad82f1c7d30c64
- qr-idle-fix: 172695efb41665a4e50d335029e54184bbb5b328

The JSON ledger records every inventoried path, exact git blob, all matching heads, line count, classification, and review status. Identical path/blob versions are counted once.

## Coverage and remaining work

| Package | Production versions read | Test versions read | Test versions pending | Configuration versions pending |
|---|---:|---:|---:|---:|
| address-safety | 6 / 6 | 3 | 2 | 5 |
| core-crypto | 8 / 8 | 3 | 9 | 5 |
| invoice-schema | 17 / 17 | 12 | 14 | 5 |
| payment-uri | 14 / 14 | 2 | 4 | 5 |
| qr-exchange | 11 / 11 | 4 | 4 | 5 |
| sdk | 9 / 9 | 3 | 6 | 8 |
| secret-box | 3 / 3 | 3 | 0 | 5 |
| tx-review | 5 / 5 | 3 | 3 | 5 |
| contracts | 0 / 10 | 0 | 35 | 0 |
| policy-scheme | 0 / 19 | 0 | 10 | 6 |

Completed source: 73 versions / 9,464 physical lines. Focused test source: 33 versions / 4,954 lines. Pending inventory: 165 versions / 29,012 lines (29 production, 87 test, 49 configuration). Counts refer to inventoried immutable file versions, including blank/comment lines. Source tests were read, not executed.

## Confirmed findings and historical corrections

### CP-01 — Temporary secret buffers are not consistently cleared on exceptional exits

Severity: Low. Status: confirmed; existing defense-in-depth gap; all reviewed baselines.

Condition: generateKeySet creates the spending scalar before creating the viewing scalar; a subsequent RNG or public-key operation can throw before ownership is returned. In the bearer-encrypted invoice path, the generated AES key is cleared only after successful encryption, and the decrypt path does not clear its temporary decoded key or plaintext byte array.

Impact: These temporary byte arrays remain eligible for garbage collection rather than being explicitly overwritten. This is a best-effort memory-hygiene gap. No remote read primitive, disclosure, signature bypass, or fund-loss path was established. JavaScript strings and runtime copies cannot be guaranteed to be erased.

Recommended remediation: Use an exception-safe scope/try-finally for newly created secret buffers. Transfer ownership only on successful key-set construction. Retain and clear the temporary AES key and plaintext arrays after use, while documenting unavoidable string/runtime copies.

Non-operational validation criterion: With a controlled failing dependency, already-created temporary buffers are cleared on each failure path; successful key generation retains the returned secrets. Assess through ordinary isolated unit assertions, without live targets or crafted attack files.

Evidence:

- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/core-crypto/src/keys.ts:45-58 (blob 086e80c73f79107c33dcc036f60577874cb7c279)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/envelope.ts:242-259 (blob cc6b9dd6fc20fb93ecb22b00e8391338bfd6a0e4)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/envelope.ts:570-594 (blob cc6b9dd6fc20fb93ecb22b00e8391338bfd6a0e4)
- c977b5d6723f6822c3b5d86cd6b231712c53c395:docs/audits/05/crypto-core.md:24-31 (blob 10428c018451ed7ee8600b443c3899656694c45c)

The core key-generation part was already recorded as I-02. SecretScope and SecretBox provide working cleanup patterns, and their source tests were read. This finding does not imply SecretBox itself exposes its stored bytes.

### CP-02 — QR image pixel bounds can be checked only after native allocation for unsupported headers

Severity: Low. Status: confirmed limitation; all reviewed baselines.

Condition: The file picker accepts raster image MIME types beyond the PNG/GIF/JPEG/WebP headers inspected by imageHeaderDimensions. For an unrecognized header, decodeQrImage calls createImageBitmap before checking the universal pixel cap.

Impact: A user-selected image in a platform-supported format whose header is not inspected may consume native decoder resources before the 40-million-pixel limit rejects it. The input still has a 10 MiB compressed-file cap and decoded resources are closed. Actual browser memory behavior was not measured; this is a local availability limitation, not a demonstrated remote exploit.

Recommended remediation: Restrict imports to formats with a reliable pre-decode dimension check, extend supported header inspection, or use an appropriately resource-bounded image decoding path. Keep the post-decode check as a second control.

Non-operational validation criterion: Every accepted file format is rejected or dimension-checked before the native decoder allocates its full bitmap. Existing small stubbed decoder assertions can verify ordering; no oversized image need be generated or opened.

Evidence:

- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/qr-exchange/src/readers.ts:120-125 (blob caea9b8a3bbfeb9e626814e5db3882e22e568921)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/qr-exchange/src/readers.ts:137-181 (blob caea9b8a3bbfeb9e626814e5db3882e22e568921)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/qr-exchange/src/readers.ts:226-260 (blob caea9b8a3bbfeb9e626814e5db3882e22e568921)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/qr-exchange/src/readers.test.ts:203-207 (blob 58769a945594dc2b1c95d4e96f80832fed3551e7)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/components/CameraImporter.tsx:310-310 (blob 255e318fb120ef769687e0c2dfb38f2bceb9e7d9)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/components/CameraImporter.tsx:348-348 (blob 255e318fb120ef769687e0c2dfb38f2bceb9e7d9)

The existing test explicitly documents post-decode fallback for HEIC/AVIF. No image was generated, opened, or used to reproduce resource exhaustion.

### CP-H01 — Rejected conflicting QR chunks refresh the idle deadline on older baselines

Severity: Low. Status: confirmed on main/release; corrected on completion and qr-idle-fix.

Condition: On main and release, Assembler updates lastActivity before rejecting a conflicting chunk. Latest completion moves that update after validation.

Impact: Rejected input can prolong a bounded partial QR session beyond the intended idle deadline. This does not bypass final payload integrity or authentication and does not create unbounded storage.

Recommended remediation: Retain the latest ordering, where only accepted activity refreshes the deadline.

Non-operational validation criterion: A rejected conflict preserves the previous deadline; the next operation after that deadline reports session expiry. Accepted duplicates retain their explicitly intended refresh behavior.

Evidence:

- c977b5d6723f6822c3b5d86cd6b231712c53c395:packages/qr-exchange/src/assembler.ts:63-86 (blob 8e8d12e447265e682597edf2887e5a2f6afd55db)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/qr-exchange/src/assembler.ts:63-88 (blob 144dd8ec67e8aaeffc5c3d90f6a06234d770abcd)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/qr-exchange/src/assembler.test.ts:71-127 (blob ee613b41e23d1d77ebe9caf3151ecef014bd22cd)

### CP-H02 — Canonical arrays were not restricted to dense own data properties on main

Severity: Informational. Status: confirmed API hardening gap on main/base64-fix; corrected on release/completion/qr-idle-fix.

Condition: The main canonicalizer calls an input array map method and does not reject sparse/decorated arrays or snapshot data descriptors. Latest versions validate and snapshot dense own data properties before recursion.

Impact: Malformed JavaScript API inputs can have unexpected or ambiguous canonical representations. A reachable signature bypass through the strict JSON invoice parser was not established; parsed JSON supplies ordinary dense arrays.

Recommended remediation: Retain the descriptor-based latest implementation and its regression tests.

Non-operational validation criterion: Malformed sparse/decorated/accessor arrays fail closed; supported dense arrays retain identical canonical bytes and array membership/value traps are not invoked.

Evidence:

- c977b5d6723f6822c3b5d86cd6b231712c53c395:packages/invoice-schema/src/json.ts:191-205 (blob b7a34bb5176ec72daf0026a59991863421bdb341)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/json.ts:192-218 (blob 8ed01592d487c356a72d51e240e5cc63fb470a3a)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/json.test.ts:128-228 (blob 2ffdfe70a8814762b14721ac640fc82cab0b9e54)

### CP-H03 — Base64url decoder lacks an explicit runtime string guard on main

Severity: Informational. Status: confirmed API hardening gap on main; corrected on release/completion and both fix heads.

Condition: The main exported decoder reads text.length and charCodeAt without checking that the runtime argument is a string. All later reviewed versions add the explicit type guard.

Impact: Malformed direct JavaScript caller inputs can be accepted as empty data or produce inconsistent errors. The invoice fragment entry point already checks its string input, so no remote invoice-verification bypass was established.

Recommended remediation: Retain the latest explicit string guard and fixed decoder error.

Non-operational validation criterion: All non-string direct API inputs receive the same typed decoder failure before allocation or iteration.

Evidence:

- c977b5d6723f6822c3b5d86cd6b231712c53c395:packages/invoice-schema/src/base64url.ts:52-60 (blob eb7b8723f4a3b80a6ce457012636a5b29e1f8ccb)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/base64url.ts:52-61 (blob 5466ee0b99925dedd23e753636ae7ab3f6f48234)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/base64url.test.ts:27-40 (blob 8d959c2b144182d0d0f576214dc7b761b7166c47)

### CP-H04 — Merchant profile expiry accepts an invalid caller clock on older baselines

Severity: Low. Status: confirmed on main/base64-fix; corrected on release/completion/qr-idle-fix.

Condition: The older verifier compares exp with the supplied nowSec without first rejecting invalid clocks. Latest versions reject non-finite and negative clocks.

Impact: A caller supplying an invalid clock can receive a valid result for an otherwise correctly signed profile whose expiry cannot be meaningfully evaluated. Control of the clock is a caller/environment prerequisite; no external clock-control path was established.

Recommended remediation: Retain the latest clock guard.

Non-operational validation criterion: Invalid clocks fail with a format result; correct clocks preserve the exclusive expiry boundary.

Evidence:

- c977b5d6723f6822c3b5d86cd6b231712c53c395:packages/invoice-schema/src/merchantProfile.ts:156-182 (blob a75124bb35d2c319e6936097ef6b4048ac59ec76)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/merchantProfile.ts:156-158 (blob a4269dec888518799aa4b3e8cc82d2ff9cc21d77)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/merchantProfile.test.ts:48-54 (blob a1299d9ceedefeefb5784d287d556008531af02f)

## Scoped observations, separated from active Pages findings

### CP-O01 — SDK merchant response size limit follows full body materialization

Status: confirmed implementation limitation; outside active Pages runtime. Severity: Low if SDK merchant transport is in deployment scope; otherwise informational.

merchant.ts awaits res.text() before enforcing MAX_RESPONSE_CHARS, and has only an optional caller-provided abort signal. A configured service or faulty endpoint can consume response-body memory/time before rejection. No SDK import was found in apps/web/src or apps/web/public at completion. No service was contacted.

Recommendation: Before enabling this SDK transport, use a bounded streaming read and an explicit timeout/abort policy. An injected transport should expose equivalent resource limits.

Validation criterion: The client aborts reading at its configured byte budget and deadline without materializing an unbounded body.

Evidence:

- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/sdk/src/merchant.ts:163-195 (blob 17e7eb97c6820fd176f180f57a849e2460a8d664)

### CP-O02 — SDK invoice-status responses are not bound to the requested nonce

Status: confirmed API consistency gap; outside active Pages runtime. Severity: Informational; assess deployment-specific reliance before promotion.

getInvoiceStatus and registerInvoice parse the returned nonce shape but do not compare it to the requested invoice nonce. A faulty or misrouted API response can be returned for the wrong invoice. A malicious API already controls the reported payment status; independent payment authenticity is not established by this SDK transport.

Recommendation: Require returned nonce equality for status/register responses and make callers retain their independently selected invoice identity.

Validation criterion: A well-formed response for a different nonce is rejected as a response mismatch.

Evidence:

- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/sdk/src/merchant.ts:208-216 (blob 17e7eb97c6820fd176f180f57a849e2460a8d664)

### CP-O03 — Permit domain name/version are outside the tx-review intent comparison

Status: retired as active Pages vulnerability after caller inspection. Severity: Informational API boundary.

decodeTypedData requires nonempty permit name/version but omits them from PermitSigIntent. The current Pages permit path separately builds and checks the domain through buildPermit and the on-chain DOMAIN_SEPARATOR comparison before signing. No active ungated caller was established. Consumers using tx-review alone should retain this separate domain check.

Recommendation: Document the required domain check for standalone consumers, or include a trusted expected domain in the review contract if the library is intended to provide that guarantee.

Validation criterion: Any supported signing path validates the complete permit domain before requesting a signature.

Evidence:

- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/tx-review/src/decode.ts:200-232 (blob ac87d665d0fa50510f40dc17c037589b60a957ec)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/tx-review/src/review.ts:45-50 (blob 584996185bee03a25bea873b4e7211d61bd1b38d)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/lib/pay.ts:488-504 (blob 479341df5a6a5a5f90038520d3934fe2d4fcdea8)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/lib/pay.ts:589-604 (blob 479341df5a6a5a5f90038520d3934fe2d4fcdea8)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/chain-adapters/src/sweep.ts:275-286 (blob 8a8004d1a19be56426e8d19663d438ce69516077)
- e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/lib/sweep.ts:333-360 (blob 2acd7e6fee3f508ef5b55608c8d90fb7684852dc)

## Candidate delegated to the payment review lane

CP-C01 — Receipt issuedAt permits safe integers outside a displayable Date range. candidate delegated to parent/payment reviewer; not a confirmed impact here.

validateReceiptPayload only requires a positive safe integer for issuedAt. Inspect actual receipt rendering/export consumers for safe handling before assigning severity. This is not a receipt signature bypass. Parent acknowledged routing it to the payment reviewer.

Evidence:

- e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/receipts.ts:82-105 (blob a991e6aa7ac6bb2cea5758a1d79409c513758311)

## Retired hypotheses and trust boundaries

- A minimal signed receipt may intentionally omit the stealth address. The signature still binds its present fields and receipt verification is explicitly distinct from independent payment evidence; this is not a forged-payment finding.
- Bearer-encrypted invoice links intentionally carry the encryption key in the fragment. Link-holder readability is the documented model, not a cryptographic break.
- A valid self-signature is intentionally distinct from a pinned seller identity. Latest and main strict-pin behavior was reviewed; no pin bypass was established.
- QR checksums and short session identifiers provide transport integrity, not peer authentication. Configuration imports require caller review and signed invoice payloads retain their own verification.
- SecretScalar is a redaction guardrail with documented JavaScript copy limitations; SecretBox stores bytes separately and lends wiped copies. Guardrail limits were not promoted to arbitrary secret disclosure.
- Non-EVM structural address/URI helpers and SDK merchant operations do not establish active Pages payment exposure. Their code was read, but no deployment or live service was assessed.

## Fresh-worker continuation instructions

- Read all production versions in packages/contracts and packages/policy-scheme. Contracts: 10 production versions. Policy: 19 production versions. Do not treat these as reviewed.
- Read remaining pending tests/configuration versions, prioritizing relevant contract/policy tests. Other wave-one tests not marked test_source_reviewed remain pending (42 versions).
- Resolve the 14 provisionally excluded supporting contract fixture/Echidna paths if needed to substantiate an exhaustive core-code claim; they are not covered by this review. Vendored forge-std/OpenZeppelin dependencies and future experimental contracts were not audited.
- Use immutable git show/cat-file reads and the existing path/blob ledger; do not switch the shared checkout or modify product source. Record tests as statically read, not executed.
- Coordinate receipt-date candidate CP-C01 with parent/payment reviewer and deduplicate shared findings. Do not promote SDK-only or guarded permit-domain observations to active Pages vulnerabilities without additional evidence.
- Publish the combined report only after parent integrates all lanes. This checkpoint does not establish repository-wide completion.

Use /workspace/scratch/e1ba011306bd/GhostPay-audit, read-only, without switching its checkout. Read the repository instructions and continue from entries whose status is pending in crypto_protocol_review.json. The parent will place the combined findings in repository notes. Keep a durable checkpoint before ending each worker context.

The 14 provisional exclusions are explicitly listed in JSON. They are supporting contract mocks/Echidna fixtures rather than reviewed production. Their exclusion must not silently become a claim of exhaustive test or contract coverage.

## Review limitations

No live environment, deployments, runtime behavior, browser memory exhaustion, or cryptographic side-channel timing was tested. This review establishes the identified source-level conditions and documents their limits. It does not establish absence of other vulnerabilities. Branch findings are pinned to the SHAs above; future branch movement is outside this checkpoint.

A transient runtime reset interrupted the first context. The workdir and clone were recovered, refs fetched, immutable heads verified, and the reviewed ledger reconstructed. No application source was changed during recovery or review.
