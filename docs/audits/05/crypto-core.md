# Audit 05: crypto-core

- Area: `packages/core-crypto/src`, `packages/invoice-schema/src`, `packages/secret-box/src`, `test-vectors/` (scheme1 generator and JSON). `apps/web/src/lib/keystore.ts` was read only for the scrypt/AES-GCM part of the scope. Callers in `apps/web/src/lib/session.ts` and `packages/pool-sdk/src/store.ts` were read only where the findings needed them.
- Snapshot: commit `88de0018b86884d49d70d269c430bdcbb39a0b4f` (read-only worktree). Every file:line reference points to that snapshot.
- Nature: AI-assisted review, static only. This is not an independent professional audit.

## 1. Summary

I found no critical, high or medium issue. I found no maths defect in the scheme-1 implementation. Derivation, view tag, point validation, scalar sampling, signature low-s handling, the canonical JSON/base64url strictness and the AES-GCM envelope are all as documented. The new findings are about the secret-handling guardrails (`secret-box` and how it meets `core-crypto`) and about how independent the test vectors are.

| ID | Sev | Title |
|---|---|---|
| CRYPTO-CORE-01 | Low | `SecretBox.random` and invoice `randomBytes` have no stuck-RNG check. A no-op `getRandomValues` silently gives an all-zero pool seed |
| CRYPTO-CORE-02 | Low | `assertNoSecretBox` lets core-crypto `SecretScalar` through (its leakier sibling), and no production code calls it |
| CRYPTO-CORE-03 | Low | `SecretBox.use`/`useAsync` give back an all-zero buffer, with no error, when the callback returns the lent view |
| CRYPTO-CORE-04 | Info | Secret scalars pass through immutable hex strings and bigints (`bytesToNumberBE`/`numberToBytesBE`), which undercuts `zeroize` |
| CRYPTO-CORE-05 | Info | The scheme-1 vectors and the differential test have a single oracle (ScopeLift SDK). No cross-implementation vector pins the compressed-S convention |
| CRYPTO-CORE-06 | Info | Nothing checks that the invoice `signer` key differs from the meta-address spend/view keys (ADR-0002 "dedicated key") |
| CRYPTO-CORE-07 | Info | `parseAnnouncement` hex-decodes the whole announcement metadata, of any length, although it uses only byte 0 |

### Regression check against prior audits (03, remote code-/security-/bugs-tslibs)

- **Partly fixed:** code-tslibs L-06 / S3-08. `slice` and `subarray` now throw (`core-crypto/src/secret.ts:53-58`). `Symbol.species` still returns `Uint8Array` (`secret.ts:33-35`), so `secret.map(x=>x)`, `secret.filter(()=>true)` and `new Uint8Array(secret.buffer)` still return plain copies or views. The `secret.ts:15` doc says this, so it is a known guardrail limit and not a regression.
- **Still open (not re-reported):**
  - S3-12, bidi/zero-width characters in invoice text: `invoice-schema/src/schema.ts:146-158`.
  - S3-13, keystore accepts attacker-chosen scrypt cost: `apps/web/src/lib/keystore.ts:30-31,130-132`. With `r=15,N=2^20` it allocates about 1.9 GiB, under `maxmem 2^31`.
  - security-tslibs L-1, `token` zero address / lowercase native marker: `schema.ts:98,239`.
  - L-4, exported `rng` parameters: `core-crypto/src/rng.ts:31`, `keys.ts:45`, `stealth.ts:111`, `invoice-schema/src/schema.ts:311,331`, `envelope.ts:505-506`.
  - I-2, viem under core-crypto: `hex.ts:2`, `stealth.ts:5`, `metadata.ts:2`.
  - I-3/I-01, no runtime scalar check on `viewingSecret`/`spendingSecret`: `stealth.ts:148-153,196-203`.
  - I-02, `generateKeySet` does not wipe on throw: `keys.ts:45-58`.
  - I-03, `DEC_RE` admits `"0"`: `schema.ts:92`.
  - BUG-06, sparse `lineItems`: `schema.ts:162` still uses `.map`.
  - M-1, unpinned `valid-signature` invoices are payable: `envelope.ts:633-640` (design/app).
- **No regression found** in the items that earlier audits marked safe: rejection sampling, point checks, canonical-equality order, AAD, low-s.

## 2. Method

- Read every non-test source line in scope:
  - core-crypto: `index, rng, hex, errors, keys, stealth, secret, metadata`
  - invoice-schema: `index, sign, base64url, expiry, json, errors, schema, envelope`
  - secret-box: `secretBox, scope, index`
  - the three `DEVIATIONS.md` files, `test-vectors/README.md`, `test-vectors/generate.mjs` and the head of `scheme1.json`
- Read the relevant code in `node_modules/@noble/curves@2.4.0/abstract/weierstrass.js`:
  - `getPublicKey`, `getSharedSecret`, `sign`, `verify`
  - the defaults: `lowS: true`, `format: 'compact'`, and `prehash` honoured when false
- Checked by hand:
  - EIP-5564 scheme 1 per ADR-0001: `S = r·P_view` (compressed, 33 bytes), `s_h = keccak(S)`, `tag = s_h[0]`, `h = s_h mod n` with h≠0, `Q = P_spend + hG`, `p = p_spend + h mod n`, plus the infinity and zero checks
  - y-parity of R; off-curve and prefix rejection; secp256k1 has cofactor 1, so there is no small-subgroup case
  - view tag taken from `metadata[0]`; early reject before the address check
  - ECDSA domain string `GhostPay.Invoice.v1\0` cannot collide with an RLP transaction (first byte 0x47 is not an RLP list prefix). RFC 6979 deterministic nonces; high-s rejected
  - AES-GCM: a fresh 256-bit key and 96-bit nonce per envelope, so nonce reuse is impossible without an RNG failure. AAD binding. Decrypt happens before signature verify, and the result is not an oracle because the key is in the fragment
  - strict parser: depth, duplicate keys, prototype keys, numbers, `\u` escapes, BOM handling, canonical round-trip; base64url trailing bits; size caps checked before decode
  - error messages never echo input
- Nothing was executed. No PoC was written: every finding can be shown by reading the code, and the brief discouraged running JS.

## 3. Findings

### CRYPTO-CORE-01 (Low): no stuck-RNG detection in `SecretBox.random` / invoice `randomBytes`

- **Where:**
  - `packages/secret-box/src/secretBox.ts:114-122`: `(opts.rng ?? globalThis.crypto).getRandomValues(bytes)`; the result is not checked.
  - `packages/invoice-schema/src/schema.ts:311-315`: the same pattern.
  - Consumer: `packages/pool-sdk/src/store.ts:103-105`, where `createPoolSeed` uses `SecretBox.random(32)` for the SP-PAY pool seed.
- **Contrast:** core-crypto `randomScalar` (`core-crypto/src/rng.ts:35-40`) rejects 0 and throws `RNG_FAILURE` after 64 draws, so an all-zero source fails closed there.
- **Failing input:** a source whose `getRandomValues` returns a fresh array and does not fill the argument, for example a polyfill `getRandomValues: (a) => nodeCrypto.randomBytes(a.length)`. The same happens with an injected test double left in production (L-4).
  - `createPoolSeed()` returns 32 zero bytes. Every note derived from that seed can then be predicted by anyone, so pool funds can be stolen.
  - `createInvoice` gives nonce `000…0` for every invoice, which breaks client-side single-use tracking.
  - `encodeFragment` uses a zero AES key and nonce. That is low impact, because the key is public in the link anyway.
- **Conditions:** a broken or non-standard CSPRNG environment. With a standard Web Crypto, nothing goes wrong.
- **Fix:** after filling, reject an all-zero buffer (and, cheaply, a buffer identical to the previous draw) and throw. Apply this in `SecretBox.random` and `invoice-schema` `randomBytes`. Share one `secureRandom(len)` helper with core-crypto.

### CRYPTO-CORE-02 (Low): `assertNoSecretBox` is blind to `SecretScalar` and unused

- **Where:** `packages/secret-box/src/secretBox.ts:269` returns early on any `ArrayBuffer.isView(v)`. The only detection is `SecretBox.isSecretBox` (`:263`).
- **Problem:** `SecretScalar` (`core-crypto/src/secret.ts:20,29`) is a `Uint8Array` subclass, and its own doc (`secret.ts:15`) says `structuredClone` copies its bytes. It is exactly the value that leaks through `postMessage` or IndexedDB, and this guard waves it through. A boxed `SecretBox` would only clone to `{}`, as the doc at `:255` notes.
  - A grep of `apps/` and `packages/` (non-test) finds no production caller of `assertNoSecretBox`. It is a defence that is documented but not wired in.
- **Failing input:** `assertNoSecretBox({ type: 'start', viewingKey: keys.viewingSecret })` returns normally. `worker.postMessage` of the same payload then sends the full viewing key. Today `apps/web/src/lib/scanClient.ts:129` sends a plain key copy on purpose, so this is a guard gap, not a live leak.
- **Fix:** mark `SecretBytes` with a shared registered symbol (for example `Symbol.for('ghostpay.secret')`) and have `assertNoSecretBox` reject it. Call the guard at the postMessage and IndexedDB boundaries, or delete it from the README and docs.

### CRYPTO-CORE-03 (Low): `use()`/`useAsync()` silently give back zeroed bytes

- **Where:** `packages/secret-box/src/secretBox.ts:159-170` and `:178-185`. `fn(copy)` is returned, then `finally { wipe(copy) }` runs.
- **Failing input:**
  - `const k = box.use((b) => b)` and `box.use((b) => b.subarray(0, 16))` both return an all-zero `Uint8Array` with no error.
  - If `k` is then passed to `subtle.importKey('raw', k, 'AES-GCM', …)`, data is encrypted under the all-zero AES key and anyone can decrypt it. It fails open.
  - The same happens when a callback returns an object that holds the view, or schedules work (`queueMicrotask`) that reads it.
- **Current call sites:** I checked them and none returns the view. `session.ts:184,224-226` return `b.slice()`, `session.ts:85` copies through `secretScalarFromBytes`, and the HKDF users return fresh output. So this is latent.
- **Fix:** after `fn` returns, throw `INVALID_INPUT` if `r === copy`, or if `ArrayBuffer.isView(r) && r.buffer === copy.buffer`. For `useAsync`, apply the check to the awaited value.

### CRYPTO-CORE-04 (Info): secrets go through un-wipeable strings and bigints

- **Where:**
  - `core-crypto/src/rng.ts:37`: `bytesToNumberBE(buf)` on every candidate scalar.
  - `secret.ts:71`: `isScalarBytes`.
  - `stealth.ts:204`: the spend secret.
  - `stealth.ts:207`: `numberToBytesBE(sum, 32)` on the stealth private key.
- **Mechanism:** in `@noble/curves` these helpers go through `bytesToHex` and `hexToNumber`, so each call leaves a 64-character hex string and a bigint of the secret on the JS heap. `zeroize` (`secret.ts:116-118`) cannot reach either. The core-crypto README already says zeroization is best-effort, and noble itself turns the secret into a bigint inside `getPublicKey`/`getSharedSecret`. This item only records that the package's own code adds copies the docs do not name.
- **Fix:** document this in the README. Optionally do the range check with a byte-wise comparison against `n`.

### CRYPTO-CORE-05 (Info): single-oracle vectors for the scheme-1 hashing convention

- **Where:**
  - `test-vectors/generate.mjs:44-72`: every expected value comes from `@scopelift/stealth-address-sdk@1.0.0-beta.5`, which builds on `@noble/secp256k1` 2.3.0.
  - `core-crypto/DEVIATIONS.md` (1000-payment differential) uses the same SDK.
- **Risk:** ADR-0001 hashes the **compressed** 33-byte S. Both oracles share that choice, so neither can catch a convention that differs from other ERC-5564 wallets.
- **Scenario:** a payer using another ERC-5564 scheme-1 wallet that hashes a different S encoding pays a GhostPay meta-address. The GhostPay scanner never matches the view tag or address, and the funds are not shown to the seller. They are not lost: the seller would need the other convention to recover them.
- **Fix:** add at least one vector from an independent implementation or from the EIP text, if it gives one. Alternatively, write the interop assumption into the README and the payer UI.

### CRYPTO-CORE-06 (Info): signer key not checked distinct from spend/view keys

- **Where:**
  - `invoice-schema/src/schema.ts:225-229` checks the two meta keys against each other only. `:281-282` validates `signer` on its own.
  - `apps/web/src/lib/session.ts:150` accepts any imported `signingKeyHex`.
- **Effect:** a seller can import the spending (or viewing) scalar as the signing key. Every invoice then carries `signer == P_spend`. ECDSA with RFC 6979 does not leak the key, so this breaks policy and not keys. The violated rule is ADR-0002 / `sign.ts:54` ("never the spend/view keys").
- **Fix:** in `validateInvoice`, reject `signer` equal to either half of `metaAddress`.

### CRYPTO-CORE-07 (Info): unbounded metadata decode in announcement parsing

- **Where:** `core-crypto/src/stealth.ts:59` runs `strictHexToBytes(a.metadata, …)` on the whole string, then uses only `metadata[0]` (`:60`).
- **Effect:** announcers control the metadata, which is public. A log with large metadata costs a scanner a regex pass and a hex decode per announcement. The RPC response cap in chain-adapters bounds this, so the impact is negligible.
- **Fix:** check `metadata.length <= 2 + 2*1024` (or the router's 57 bytes plus slack) before decoding, or decode only the first byte.

## 4. Checked, no finding

- `parseCompressedPoint` (`secret.ts:132-140`): length 33, prefix 02/03, on-curve via noble `fromBytes`.
- `decodeMetaAddress` (`keys.ts:93-102`): exactly 132 hex characters; equal keys rejected.
- `sharedHash` (`stealth.ts:69-77`): compressed ECDH; tag is `digest[0]`; h is `mod n` and must be non-zero; the buffers are wiped.
- Infinity handling: `stealth.ts:81,173`. `ZERO_STEALTH_KEY` and the address round-trip before a secret is returned: `stealth.ts:206-211`.
- `checkAnnouncement` never throws on hostile log data, and still throws for bad key arguments.
- Metadata layout and selector/token cross-checks: `metadata.ts:95-115`.
- Invoice signing: domain prefix, keccak over canonical bytes that were validated first, `lowS:true` on both sign and verify, `SIG_RE` lowercase 128 hex. noble 2.4.0 defaults to `format:'compact'`. Self-check before encode: `envelope.ts:501`.
- Envelope:
  - prefix and size caps are checked before decode
  - canonical base64url
  - fatal UTF-8 with a BOM that is not stripped, so the JSON parse fails
  - strict JSON, then canonical byte equality
  - exact key sets
  - a private key placed in `pub` is rejected (`:626`)
  - AAD is `GPI1‖u64 chainId‖signer`
  - GCM tag is 128 bits
- `validateInvoice`: unknown keys rejected; the clean copy is built from values that were each read once and validated, so getter tricks have no time-of-check/time-of-use gap; text checks are NFC, no lone surrogates and no C0/C1.
- secret-box: WeakMap storage; `toJSON` throws; `equals` makes a full pass; `take` and `dispose` are idempotent; `SecretScope` wipes on every path.
- Keystore AEAD: scrypt N=2^17, r=8, p=1 by default; header and parameters are bound in the AAD; NFKC on both sides; wrong passphrase and tampering give the same error. S3-13 aside, no new issue.
- Constant time: secret-dependent scalar multiplication is inside noble. The bigint addition at `stealth.ts:204` is not constant-time, but it runs locally with no remote timing oracle.

## 5. Not reviewed

- `@noble/curves`/`@noble/hashes` internals beyond the four API functions listed in section 2, including whether noble's scalar multiplication is really constant-time.
- viem `isAddress`/`getAddress` internals, and the ScopeLift SDK source.
- Test files. I only noted what they cover. Suites were not run, and coverage numbers come from earlier audits.
- `test-vectors/policy-scheme.json`, `shielded-pool.json` and `solana-stealth.json`, with their generators (other areas).
- `apps/web` beyond `keystore.ts` and the `session.ts` lines cited. The scanner worker and `pool-sdk` seed export (scrypt in `store.ts`) were not reviewed.
- The browser structured-clone behaviour of `SecretBox` (Node only, per `secret-box/DEVIATIONS.md` item 6).
- `npm audit` and lockfile integrity.
