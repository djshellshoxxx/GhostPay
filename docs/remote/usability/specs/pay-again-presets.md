# Spec: pay-again-presets

Package: `packages/ux-presets`. Feature: one-tap "pay again" and saved payment presets in an encrypted local store.

## Requirements
R1 Preset model: id, label, payeeRef (opaque address-book ref, not an address), chain (CAIP-2 style), asset (`native` or `<chain>/<ns>:<ref>`, must belong to chain), amountRule (`fixed` | `ask` | `up-to`, bigint base units, 0 < n < 10^78), privacyProfile (slug), memo (<=140 code points), createdAt/updatedAt (integer ms, updated >= created).
R2 Strict validation: unknown/missing keys, wrong types, control/bidi/lone-surrogate/non-NFC text are rejected, never rewritten.
R3 Pay-again from a past PaymentRecord re-validates the record and the present: current resolved address (injected syntax validator, fail closed on throw), chain/asset support, fresh fee quote, current address risk. Draft uses the CURRENT address.
R4 Never auto-sends: `autoSend: false`, `requiresReview: true` (literal types).
R5 Flags: `address-changed` (block), `address-risk-high` (block), `address-risk-increased` (warn), `address-risk-unknown` (warn), `fee-changed` (warn if up, info if down; only beyond tolerance, default 500 bps, exact bigint math), `fee-unavailable` (warn), `record-stale` (info, >90 days). `blocked` = any block flag.
R6 Preset use: `fixed` forbids an amount override; `ask` takes a positive amount; `up-to` enforces cap inclusively.
R7 Encrypted store: WebCrypto AES-256-GCM; key = CryptoKey (AES-GCM, 256, encrypt+decrypt) or exactly 32 bytes, imported non-extractable; no KDF. Fresh random 96-bit IV per write. Versioned format byte and AAD binding version + slot.
R8 Tamper detection and uniform failure: wrong key, wrong slot, flipped/truncated/extended bytes, bad version, bad encoding, malformed or duplicate-id plaintext all return `decrypt-failed` with one constant message. A failed open never writes.
R9 Injected `StorageAdapter {get(slot), put(slot, string)}`; storage exceptions map to `storage-failed` without detail. Writes are serialized. Max 200 presets, 1 MiB plaintext.
R10 In-instance rollback detection via a monotonic revision.

## Acceptance tests (all implemented)
- validate.test.ts: R1, R2 (each field, extra/missing keys, bidi/NUL/NFD/surrogates), JSON bigint round trip + fast-check.
- payAgain.test.ts: R3 to R6 incl. fee at exactly tolerance (1050 vs 1000 not flagged, 1051 flagged), zero fee base, throwing validators, malformed context, fast-check on flags.
- seal.test.ts: base64url vectors and canonicality, key checks, flip every byte -> identical failure, AAD known answer.
- store.test.ts: persistence, no plaintext in storage, wrong key does not clobber, slot swap, malformed plaintext variants, concurrency, limit, rollback.
