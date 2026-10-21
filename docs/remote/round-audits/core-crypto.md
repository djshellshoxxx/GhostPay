# Deep security audit: packages/core-crypto and packages/invoice-schema

Branch claude/remote-extensions-1. Read-only: no source/test/config edited, nothing committed. Probes are scratch scripts outside the repo, run against `dist/` (`node p1.mjs`, `p2.mjs`, `p3.mjs`). Findings only; no fixes claimed.

## 0. Threat model

Assets: recipient spend/view scalars; derived one-time stealth private keys; invoice-signing key; per-invoice AES key (travels in link); recipient-payer unlinkability; payer's payment target integrity.
Trust boundaries: (a) on-chain `Announcement` logs (fully attacker-writable, ERC-5564 Announcer is permissionless) -> `checkAnnouncement`/`parseMetadata`; (b) invoice link `#gpi=v1.` (attacker-supplied bytes, any script on the page can read it) -> `parseFragment`; (c) injected `rng`/`pinnedSigners`/clock (caller-controlled); (d) JS runtime (no memory-safety, no constant-time bigint, no guaranteed zeroization).
Adversaries: hostile log emitter; phishing invoice author (self-signed); passive observer of links/logs; XSS/extension with page access; careless integrator.

## 1. Summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | |
| High | 0 | |
| Medium | 2 | M-1, M-2 |
| Low | 8 | L-1 .. L-8 |
| Info | 6 | I-1 .. I-6 |

Tests re-run: invoice-schema 174/174 pass. core-crypto 53/54: `differential.test.ts` "matches on 500 random key sets" timed out at 60000 ms (machine heavily loaded by parallel agents; environmental, not a logic failure; not re-run in isolation, UNVERIFIED as flaky).

## 2. Findings

### M-1 (Medium) Announcement metadata is not authenticated: `checkAnnouncement` matches with any metadata sharing the view-tag byte
- Evidence: stealth.ts:140-176. Match depends only on ephemeral key R, stealth address, and `metadata[0]`. Metadata beyond byte 0 (selector, token, net amount) is never bound to R/S. R, address and tag are public once the original log exists, so anyone can re-emit them with arbitrary metadata.
- Reproduction (p1.mjs, verified): original native/5 wei announcement matches; copy with `buildErc20Metadata(tag, USDC, 10n**30n)` also returns `{matches:true}` and `deriveStealthSecret` succeeds. A 1-byte metadata `0x<tag>` also matches.
- Impact: a scanner/UI that renders `parseMetadata(...).netAmount/token` from a matched announcement shows attacker-chosen amounts/tokens (receipt spoofing; also duplicate-log double counting, same mechanism). No fund theft. Related to docs/audits/03 S3-02; this is the concrete package-level cause.
- Suggested fix: document and expose a check that amount/token come only from the router's own event or on-chain balance; optionally have `checkAnnouncement` require `parseMetadata`-valid 57-byte metadata and return `matches` separately from `metadataTrusted`.

### M-2 (Medium) Self-signed invoice is indistinguishable in structure from a legitimate one; payee is whatever `metaAddress` the link carries
- Evidence: envelope.ts:302-308 (`valid-signature` for any key), schema.ts validate does not bind signer to metaAddress. p2.mjs: unpinned invoice parses as `valid-signature`.
- Impact: phisher signs own invoice, payer pays attacker stealth address. Library is honest (`trust` enum, docs warn), so residual risk is in consumers (see docs/remote/audits/security-tslibs M-1, same class, confirmed by reading envelope.ts only; the apps/web claim UNVERIFIED here).
- Fix: callers must gate payment on `isTrustedSeller` or explicit payee confirmation; consider an API that returns the payee only from a `TrustedSellerInvoice`.

### L-1 (Low) Invisible/bidi/format characters accepted in `description` and `memo`
- Evidence: schema.ts `text()` rejects only `[\u0000-\u001f\u007f-\u009f]`. p2.mjs verified accepted: U+202E/U+202C (bidi override), U+200B, U+FEFF, U+2028. (Also docs/audits/03 S3-12.)
- Impact: visual spoofing of memo/line items in the payer UI ("Pay ‮..." reorders text).
- Fix: reject Cf category and U+2028/2029 (or restrict to an allowlisted script/category set).

### L-2 (Low) `token` accepts zero address and `0xeeee...eeee` as distinct from `'native'`
- Evidence: schema.ts ADDRESS_RE; p2.mjs: both accepted by `createInvoice`. core-crypto metadata.ts rejects both (buildErc20Metadata), so the two packages disagree on validity; invoice is schema-valid but unpayable or ambiguous.
- Fix: share one token validator; reject zero, map or reject native marker.

### L-3 (Low) Sparse array in `lineItems` yields an unparsable signed fragment
- Evidence: schema.ts validateLineItems uses `Array.prototype.map` (skips holes). p3.mjs verified: `lineItems: new Array(2)` validates; `canonicalize` emits `[,]`; sign and encode succeed; `parseFragment` throws `JsonParseError`. (Already in bugs-tslibs.md.)
- Impact: programmatic misuse only; produces a validly signed invoice whose canonical bytes are not JSON. Digest over non-JSON bytes.
- Fix: `Array.from` or index loop with `i in v` check; reject holes.

### L-4 (Low) Secret redaction is shallow: copies and views are plain
- Evidence: p1.mjs verified: `secret.slice()`, `.subarray()`, `Array.from`, `Buffer.from(secret).toString('hex')`, `{...secret}`, `Object.values`, `structuredClone` all expose bytes without throwing (Symbol.species returns Uint8Array). `JSON.stringify` and keyset JSON do throw. Also `Buffer.from(secret.buffer)`.
- Impact: guardrail only (docs/audits/03 S3-08, code-tslibs L-06 confirmed by execution). Any logging framework that iterates typed arrays leaks.
- Fix: keep as documented guardrail; consider returning secrets only via closure/handle API; add test for derived views.

### L-5 (Low) Key arguments are not runtime-validated; raw noble errors escape
- Evidence: p1.mjs verified: `checkAnnouncement(ann, new Uint8Array(32), pk)` throws `RangeError`, with 5 bytes throws plain `Error "Field.fromBytes: expected 32 bytes"`, not `GhostPayCryptoError INVALID_SCALAR` as stealth.ts doc claims (@throws INVALID_SCALAR). `deriveStealthSecret` with zero spend scalar yields `ADDRESS_MISMATCH` (fails closed).
- Impact: error-type contract broken; callers that `catch (e instanceof GhostPayCryptoError)` to skip hostile logs but treat others as fatal get halted scanners only if their own key is bad (not attacker-triggerable).
- Fix: `isScalarBytes` on entry (secret.ts already has it).

### L-6 (Low) `rng` injection on production APIs enables catastrophic key/nonce reuse
- Evidence: rng.ts:14, stealth.ts deriveStealthPayment(rng?), keys.ts generateKeySet(rng?), invoice-schema schema.ts createInvoice(rng?), envelope.ts EncodeOptions.rng. p1/p2 verified: constant source makes `deriveStealthPayment` return an identical address twice (predictable `r` => anyone with P_view recomputes S and links payment); `encodeFragment(..., {encrypt:true, rng: const})` twice yields identical key and nonce (GCM nonce reuse); `createInvoice` nonce `0101...01`. core-crypto detects only all-zero/out-of-range (`RNG_FAILURE`) and spend==view (`KEY_REUSE`). Invoice-schema `randomBytes` has no health check.
- Fix: gate behind test-only export or assert `rng === globalThis.crypto` outside test builds; add repeat-output detection.

### L-7 (Low) `pinnedSigners` entries are not validated
- Evidence: envelope.ts:304 `k.toLowerCase()`. p2.mjs verified: `pinnedSigners:[123]` throws `TypeError` (not `InvoiceError`) after a successful signature check. Uppercase pins are accepted (lowercased).
- Impact: robustness; a misconfigured pin list crashes parse rather than failing closed to `valid-signature`.
- Fix: validate pins with PUBKEY_RE at entry; throw typed error.

### L-8 (Low) Metadata leakage in the link and on chain (design, partially documented)
- Evidence: envelope.ts encrypts only `lineItems`/`memo`; `pub` carries signer, metaAddress, token, amounts, quote times, expiry in clear. `signer` is a stable per-merchant identifier across invoices; `quote.timestamp` leaks creation time to the second. Ciphertext length leaks item count/size (no padding; p2.mjs: 1396-char encrypted fragment for a 1-item invoice). core-crypto metadata (57 bytes) publishes token and net amount; view tag leaks 1 byte of hash by design.
- Impact: cross-invoice linkage of a seller; weak confidentiality given key sits in same link (bearer, ADR-0005).
- Fix: per-invoice signer subkey or rotation; pad plaintext to buckets; document.

### I-1 (Info) Non-constant-time bigint on secrets
stealth.ts:`bytesToNumberBE(digest) % CURVE_ORDER`, `(spend + h) % CURVE_ORDER`, rng.ts compare. JS BigInt is variable-time; local-only exposure (browser/JS timing by co-resident code). EC multiplications use noble (constant-time-intended). Residual bigint secrets (`sum`, `h`) cannot be zeroized (stealth.ts:`zeroize` only covers byte buffers).

### I-2 (Info) Unbounded hex input before length checks
`parseAnnouncement` (stealth.ts) runs `HEX_RE` + `hexToBytes` on arbitrary-length strings before any length check. p1.mjs: 10 MB string -> ~90 ms, then `{matches:false}`. Linear, no ReDoS (hex.ts regex is `(?:[0-9a-fA-F]{2})*`). Event data is gas-bounded on chain; only a risk for non-chain-sourced input. Suggest cheap length precheck (ephemeral == 68 chars).

### I-3 (Info) `decodeMetaAddress` coerces non-strings
keys.ts `META_RE.exec(x)` stringifies: p1.mjs verified an object with `toString()` is accepted. Harmless; add `typeof` check.

### I-4 (Info) `validateInvoice` reads inherited/getter properties
p2.mjs verified: `Object.prototype.memo = 'polluted'` makes `createInvoice` emit that memo (schema.ts `record()` checks proto identity only, then reads `r['memo']`). Getter flip returned validated value only (safe: every read is re-validated). Requires prior prototype pollution.

### I-5 (Info) Business-logic fields are not cross-validated
Verified by p2.mjs: `fiat.minorUnits` need not equal line-item sum plus tax; `quote.expiresAt` may exceed `expiresAt` (9e15 accepted); `maxSlippageBps` 10000 accepted; any 3-letter currency (`ZZZ`); `chainId` up to 2^53-1. Seller-signed, so seller-controlled; UI must display the signed `fiat.minorUnits`, not recompute.

### I-6 (Info) Dependency surface
core-crypto imports `viem/utils` only for `getAddress`/`isAddress` (hex.ts, stealth.ts, metadata.ts), pulling a large tree under a crypto primitive; versions pinned exactly (@noble/curves 2.4.0, hashes 2.4.0, viem 2.57.7). `npm audit` not run (no network access assumed): UNVERIFIED. Packages have `sideEffects:false`.

## 3. Checked and found sound (code read; probes where noted)
- Rejection-sampling scalar generation, 64-attempt cap, zeroize in finally (rng.ts); zero-output RNG yields `RNG_FAILURE` (p1.mjs).
- Point validation: only 02/03 + on-curve; off-curve R returns `{matches:false}` (p1.mjs); off-curve/04-prefix meta keys rejected (p2.mjs).
- ADR-0001 math, `ZERO_HASH`, `ZERO_STEALTH_KEY`, derived-address self-check before returning key (stealth.ts).
- Error messages fixed strings, no input echo (errors.ts in both packages).
- Strict JSON parser: duplicate/`__proto__`/`constructor`/`prototype` keys, depth 8, integer-only; canonical equality before schema; base64url non-canonical rejected (`+A` trailing junk -> Base64UrlError, p2.mjs); 16 KiB cap before decode; fatal UTF-8.
- AAD binds `GPI1 || chainId || signer`; signature covers full plaintext; low-s enforced; key-mismatch signing refused (p2.mjs); `encodeFragment` refuses invalid sigs; encrypted fragment >16 KiB refused (p2.mjs: 50 x 100-char items fails encrypted, plain 18791 chars ok).
- Per-parse cost ~5.8 ms (200 parses, p2.mjs): validateInvoice runs ~3x per parse (parse, verify, digest), bounded by 16 KiB; low DoS amplification.
- Replay: no on-chain replay protection (nonce single-use is client-side only, ADR-0003); cross-chain replay prevented by signed `chainId`. Not a library defect, a documented design limit.

## 4. Cross-check against earlier audits
Confirmed by execution: code-tslibs L-06 (species leak), bugs-tslibs sparse-array (L-3), S3-12 bidi (L-1), security-tslibs L-1 (L-2), L-4 (L-6), I-3 (L-5). security-tslibs M-1 maps to M-2 here (library side only). New here: M-1 (metadata unauthenticated, executed), L-7, I-2..I-4 verified.
