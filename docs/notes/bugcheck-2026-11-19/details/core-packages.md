> Review-chunk evidence. The consolidated [coverage](../COVERAGE.md) and [validation](../VALIDATION.md) are authoritative for final completion and executed checks. References to scratch tests identify the original local runs; retained evidence is indexed in [evidence](../evidence/INDEX.md).

# Core package bugcheck audit — 2026-11-19

## Scope and result

Reviewed all production TypeScript in `packages/{address-safety,core-crypto,invoice-schema,payment-uri,qr-exchange,secret-box,tx-review,ux-vault,net-transport,scan-source}/src` at:

- Main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Latest integration: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.

The per-file ledger `core-package-audit.json` records **108 main files, 111 latest files, 16 changed existing files, three new files, and 127 unique path/blob versions reviewed**. Identical blobs were read once and mapped to both commits. Adjacent test intent, selected relevant test bodies, package contracts and callers were inspected. This is not a claim to have manually reviewed every test body. No assigned production file remains unreviewed.

Two new low-priority exported-API correctness defects were confirmed. Five main-only defects already have corrections in latest and are separated below. Source review and passing unit tests are not a proof of bug absence or cryptographic certification. Other workers cover web flows, chain adapters and other packages. No product files, branch refs or remotes were changed; no live network, wallet or real funds were used.

## CP-01 — Payment URI builders can emit output their own parser refuses

**Priority:** P3 / low. **Status:** new finding, present at both reviewed SHAs; affected production blobs are identical. **Boundary:** exported package API. Current plain-request UI appears to provide recipient and amount without these long metadata fields, so direct current browser reachability has not been established.

**Exact locations:** `packages/payment-uri/src/solana.ts:93–104`, especially the unchecked assembled return at 104; `packages/payment-uri/src/bitcoin.ts:119–141`, especially 141; `packages/payment-uri/src/tron.ts:74–82`, especially 82. The shared rejecting boundary is `packages/payment-uri/src/query.ts:4,98–101`, which caps all accepted URIs at 2,048 characters.

**Prerequisite and behavior:** A legitimate caller supplies text within each documented UTF-8 field limit. Percent encoding expands the final URI beyond 2,048 ASCII characters. Builders check individual fields but return the unbounded assembled string. Parsing their output immediately fails with `TOO_LONG`. Solana's builder contract explicitly promises that output re-parses to the same values.

**Benign local evidence:** Invoked main's freshly built package with ordinary NFC accented text and synthetic public-address fixtures. A Solana label/message/memo of 128/512/256 UTF-8 bytes produced a 2,749-character URI and its parser returned `TOO_LONG`. Accepted Bitcoin and TRON builder inputs produced 2,106 and 2,088 characters respectively, and their parsers returned `TOO_LONG`. The existing payment-uri suite passed 199 tests but lacks the combined maximum encoding expansion case. These observations also apply to latest because the production blobs match exactly.

**Impact:** An API consumer can display, copy or encode a request that GhostPay then refuses to import. No destination/amount change, authentication bypass or fund loss was demonstrated.

**Fix direction:** Apply the same aggregate length policy after encoding and before returning from every builder, preferably in a shared finalizer. Preserve the existing parser cap unless protocol/QR limits are deliberately reviewed together.

**Benign regression:** Exercise maximum UTF-8 metadata combined with optional recipient/token fields and reserved characters, including exact-limit/one-over cases. Every successful builder result must be accepted by the corresponding parser; oversized results must fail before being returned.

**Prior-note check:** No matching combined-builder-length defect was found in inspected review/handoff notes. The parser cap and generic QR capacity are separate constraints.

## CP-02 — Completing a password change can undo the session's locked flag

**Priority:** P3 / low. **Status:** new finding, present at both reviewed SHAs; affected production blob is identical. **Boundary:** standalone address-book vault API. Current web source imports `@ghostpay/ux-vault/portable`, so this is not claimed as an active browser session defect.

**Exact locations:** `packages/ux-vault/src/vault.ts:210–218`, especially unconditional context assignment at 218; lock-state getter at 198–199. The same session factory's `lock()` clears both context and book.

**Prerequisite and behavior:** Begin a legitimate `changePassword`, then call `lock()` while it awaits storage or cryptography. Lock clears `ctx` and `book`. When the pending change finishes, line 218 unconditionally restores a new key context. `isLocked` becomes false although the book is still absent and `getBook()` throws `LOCKED`. The sibling `mutate` path checks its captured context before publishing memory state; password change lacks that check.

**Benign local evidence:** Created an empty local profile with an in-memory store, paused the password-change write, called lock, then released the write. Observed `isLocked=true` immediately after lock, followed by `isLocked=false` after password change resolved while `getBook()` threw `LOCKED`. No actual saved secrets or external store was used.

**Impact:** Consumers get contradictory session state and can display an unlocked session whose operations fail. A key context is retained again after explicit lock, contrary to the documented lifecycle. This did not expose the address book or demonstrate an authentication bypass.

**Fix direction:** Capture the starting context/revision and preserve lock revocation across asynchronous boundaries. At minimum, do not publish a fresh key context if the original session was locked or replaced. Define whether an already running persistent rekey may complete after lock, while keeping the resulting session locked. Changing only the getter would conceal the revived context.

**Benign regression:** Delay the write in a test storage adapter, start password change, lock, release the write, and verify the session stays locked. Only a fresh explicit unlock should create another active session.

**Prior-note check:** Existing tests cover lock and rekey separately; no pending-rekey lock race was found in inspected notes. `docs/remote/usability/specs/vault.md:19` requires lock to drop key/book and subsequent operations to remain locked.

## Main-only issues already corrected in latest

All entries below affect the exact main SHA above and are corrected at the exact latest SHA above. Their patches were reviewed; this is distinct from executing the latest tests. Do not count them as new latest regressions.

### CP-K01 — Sparse/extended arrays are misrepresented by canonical JSON

- **Main:** `packages/invoice-schema/src/json.ts:199`.
- **Prerequisite/effect:** In-memory caller supplies a sparse/extended array to public `canonicalize`; `Array.map` skips holes, so output loses information or becomes invalid JSON. Current invoice/receipt signers validate schema first; no signature bypass is claimed.
- **Correction:** Latest rejects missing, accessor and extra-property array shapes, then serializes dense own values.
- **Prior record:** `docs/handoffs/JSON_CANONICAL_ARRAY_20261119.md` and `docs/consolidation/canonical-array-20261119/QUALIFICATION.md`.
- **Regression:** Dense-array stable controls; accidental sparse/extended arrays fail with the documented typed error.

### CP-K02 — Merchant-profile expiry accepts an invalid caller clock

- **Main:** `packages/invoice-schema/src/merchantProfile.ts:156–182`, especially 181.
- **Prerequisite/effect:** Non-finite or negative `nowSec` with an otherwise valid signed profile can incorrectly pass the expiry comparison. Conditional on invalid local input; no remote control of the app clock was established.
- **Correction:** Latest rejects invalid clock input with `reason: 'format'` before verification.
- **Prior record:** `docs/handoffs/MERCHANT_PROFILE_CLOCK_20261119.md`; audit ID `GP-AUD-208-01` referenced in the canonical-array handoff; qualification under `docs/consolidation/merchant-clock-20261119/`.
- **Regression:** Valid/expired boundaries plus non-finite and negative clock refusal.

### CP-K03 — Base64url decoder lacks its runtime string boundary

- **Main:** `packages/invoice-schema/src/base64url.ts:52–60`.
- **Prerequisite/effect:** JavaScript/untyped caller supplies a non-string despite the TypeScript signature. Some invalid values behave as empty input; others raise an incidental JavaScript error instead of `Base64UrlError`. Valid string callers are unaffected.
- **Correction:** Latest adds `typeof text !== 'string'` rejection before length/access/allocation.
- **Prior record:** Correction and regression already in latest `base64url.ts`/`base64url.test.ts`. Earlier `docs/audits/CHATGPT_RANDOM_AUDIT_LEDGER.md` discusses string codec properties without identifying this boundary. Classified as an already corrected integration difference, not a new latest finding.
- **Regression:** Non-string runtime values fail with the codec error; empty string retains valid empty-byte behavior.

### CP-K04 — Range-source cancellation relies entirely on its backend

- **Main:** `packages/scan-source/src/range.ts:49–75`.
- **Prerequisite/effect:** The signal is aborted but the supplied backend resolves without enforcing cancellation. The helper can dispatch later windows and return success because it only forwards the signal. Active browser scheduling is a separate implementation covered by the web audit.
- **Correction:** Latest guards cancellation before work, after backend awaits, around dispatch, and before return; new bounded padding helper also reviewed.
- **Prior record:** `docs/handoffs/tm-hardening-20261118/CHANGE_TRACEABILITY.md` (TM15), `acceptance-review.md`, and `metadata-review.md`.
- **Regression:** Local resolving backend stub; cancel between windows; verify no later dispatch or late success.

### CP-K05 — Rejected QR conflict refreshes transfer idle time

- **Main:** `packages/qr-exchange/src/assembler.ts:78–84`.
- **Prerequisite/effect:** An unfinished multipart transfer receives a conflicting part for an already held index. Activity updates before conflict rejection, extending idle time without accepted progress.
- **Correction:** Latest updates activity only after conflict validation.
- **Prior record:** `docs/handoffs/qr-conflict-expiry-20261119/README.md` and `REVIEW.md`.
- **Regression:** Fake clock plus an accidental conflicting part; original incomplete-transfer expiry stays unchanged.

## Validation and limits

Existing suites ran at the pinned main checkout with `vitest run --maxWorkers=2` and exact-lock dependencies. Node version was 24.22.3. No coverage flag, lint/typecheck or latest full suite was run by this worker. All launched processes have completed.

| Package | Files | Tests | Result |
|---|---:|---:|---|
| address-safety | 4 | 76 | Passed |
| core-crypto | 9 | 74 passed, 1 timed out | Failed: existing differential test exceeded 60s |
| invoice-schema | 13 | 728 | Passed |
| payment-uri | 3 | 199 | Passed |
| qr-exchange | 7 | 233 | Passed |
| secret-box | 3 | 47 | Passed |
| tx-review | 5 | 160 | Passed |
| ux-vault | 7 | 284 | Passed |
| net-transport | 6 | 193 | Passed |
| scan-source | 6 | 57 | Passed |

The core-crypto failure is `src/independent.test.ts:126`, “sender derivation, recipient check and stealth key agree byte for byte” over 150 cases. Vitest reported `Test timed out in 60000ms` after approximately 71 seconds for that test. Its log showed no assertion mismatch; the suite remains a failed qualification result, not a passing one. No rerun or timeout weakening was performed. Exact exits are in `core-package-test-results.json`; logs are `<package>-tests.log` in scratch.

Source reviewed without another confirmed defect includes address/text safety; scalar/point/secret/metadata logic; invoice/receipt signing; QR/camera/import code; transaction intent review; secret scopes; fetch/proxy/OHTTP transports; scan composition/quorum; keystore/tag/reconciliation formats; and the new stealth public/keypair/master backup codec. The newest 1,024-payment export has an explicit maximum-size round-trip test, so its byte cap was not reported as a defect. Intentional quorum disagreement refusal and QR duplicate suppression were also not reported as bugs.
