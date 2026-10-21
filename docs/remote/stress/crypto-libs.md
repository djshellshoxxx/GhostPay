# Stress report: core-crypto, invoice-schema, policy-scheme, secret-box

Scope: malformed/hostile input, huge sizes, boundary scalars/field elements, non-canonical encodings, timing sanity, differential testing against independent computation (viem 2.57.7, @noble/curves 2.4.0, @noble/hashes 2.4.0, @noble/ciphers 2.4.0, manual byte-level keccak/ABI). Only items I ran are reported as findings; unrun items are marked UNVERIFIED. No source edited, no fixes claimed.

Host: 4 vCPU Intel Xeon 2.8 GHz, Node v22.22.0, shared with other agents (timings are noisy, p95 about 2x median). Branch claude/remote-extensions-1 at dea46be plus uncommitted work of other agents (not touched).

## Method

Build output to scratch (not repo): `cd packages/<p> && ../../node_modules/.bin/tsc -p tsconfig.build.json --outDir $S/b/<p>` for the four packages, with `$S/node_modules -> /home/user/ghostpay/node_modules`. For core-crypto, invoice-schema, secret-box the fresh build is byte-identical to the checked-in `dist/` (diff of .js, excluding maps/d.ts: no differences); policy-scheme has no `dist/`. Probe scripts (ad hoc, in the session scratchpad, not committed): cc.mjs, cc2.mjs, inv.mjs, inv2.mjs, inv3.mjs, inv4.mjs, inv5.mjs, pol.mjs, pol2.mjs, sb.mjs, sb2.mjs. Minimal repros for every finding are inlined below so the scripts are not needed.

Baseline of the existing suites (`vitest run --coverage.enabled=false` per package):

| package | result | time |
|---|---|---|
| invoice-schema | 174/174 pass | 14.5 s |
| secret-box | 31/31 pass | 1.1 s |
| policy-scheme | 53 pass, 7 skipped (anvil cross-check skipped by default) | 8.3 s |
| core-crypto | 53 pass, 1 FAIL: `differential.test.ts` "matches on 500 random key sets x 2 payments" | timed out at testTimeout 60 000 ms (vitest.config.ts:7); standalone rerun 74.6 s |

The core-crypto failure is a timeout, not a mismatch: 500 sets x 2 payments x several 4-8 ms scalar multiplications exceeds 60 s on this shared 4-vCPU host (see S-CC-1 for the per-op cost). It will be flaky on slow CI.

## Findings summary

| ID | Sev | Package | Title |
|---|---|---|---|
| S-INV-1 | Medium | invoice-schema | Sparse `lineItems` arrays validate, sign, and then emit invalid JSON or silently drop items |
| S-INV-2 | Low | invoice-schema | Text hygiene allows bidi overrides, zero-width, tag chars, noncharacters, U+2028/9 in memo/description |
| S-INV-3 | Low | invoice-schema | Schema maximum (50 x 200 + 500 memo) cannot be encoded; encrypted limit is 28 items |
| S-INV-4 | Low | invoice-schema | Injected/failed RNG yields all-zero AES key and nonce, or all-zero invoice nonce, without error |
| S-INV-5 | Info | invoice-schema | Non-InvoiceError TypeErrors on null/odd arguments; `canonicalize` stack overflow on deep/cyclic input |
| S-POL-1 | Low | policy-scheme | `signPolicyTypedData` signs any self-consistent typed data (docstring claim is false at runtime) |
| S-POL-2 | Low | policy-scheme | `buildWithdrawTypedData` limit check trusts caller-supplied `proof.limit` and does not bind the proof to the token |
| S-POL-3 | Low | policy-scheme | `decodePolicyPaymentCalldata` accepts truncated, over-long and ABI-dirty calldata; checks only stealth/owner/policy binding |
| S-POL-4 | Info | policy-scheme | Linear/quadratic-ish costs: `checkScheme2Announcement` per policyHash, `verifyLimitProof` per word, `getLimitProof` O(n) scan |
| S-POL-5 | Info | policy-scheme | Raw noble errors instead of `SIGNING_FAILED`/`INVALID_SCALAR`; scheme-2 scanner tolerates bad-checksum address that scheme 1 rejects |
| S-SB-1 | Low | secret-box | `SecretScope.close()` / `wipe(...)` throw RangeError above about 125k tracked buffers and then wipe nothing |
| S-SB-2 | Low | secret-box | `SecretScope.box(bytes, badLabel)` throws without wiping or tracking `bytes` |
| S-SB-3 | Info | secret-box | `SecretBox.random` accepts a non-filling RNG (all-zero secret); `assertNoSecretBox` blind spots; runtime `new SecretBox` |
| S-CC-1 | Info | core-crypto | Scan throughput about 160 announcements/s/core; view-tag reject happens after the 7-8 ms ECDH |
| S-CC-2 | Info | core-crypto | `decodeMetaAddress` coerces non-strings; viewing-secret arguments not range-checked with `GhostPayCryptoError`; null announcement throws TypeError |

No defect found in: base64url codec, strict JSON parser (bounded), fragment size limits, signature verification/malleability handling, AES-GCM envelope binding, stealth derivation math, CREATE2/policy-hash/EIP-712/Merkle math, SecretBox core redaction/move semantics. Details in "Things that held".

---

## invoice-schema

### S-INV-1 (Medium) sparse `lineItems` pass validation and corrupt canonical form

Evidence (code): `schema.ts:162` `(v as unknown[]).map(...)` skips holes and preserves them; `json.ts:199` `value.map(...).join(',')` renders a hole as the empty string. Neither `validateLineItems` nor `canonicalize` rejects holes. Confirms and extends haiku BUG-06 (`docs/remote/audits/bugs-tslibs.md:70`): that report says holes canonicalize to a different array; I additionally ran the sign/encode/parse path and the result depends on array length.

Reproduction (verified, `inv5.mjs`):

```js
const iv = validateInvoice({ ...invoice, lineItems: new Array(2) });   // OK, length 2
const s  = signInvoice(iv, signingKey);                                   // OK
new TextDecoder().decode(canonicalInvoiceBytes(s.invoice));               // ..."lineItems":[,]...  (invalid JSON)
const frag = await encodeFragment(s);                                     // OK, 1.1 kB
await parseFragment(frag);                                                // throws JsonParseError (code JSON)
```

Observed matrix:

| input | validated length | canonical `lineItems` | `parseFragment(encodeFragment(...))` |
|---|---|---|---|
| `new Array(1)` | 1 | `[]` | parses, `lineItems.length === 0`, `trust: valid-signature` (signer signed zero items, caller's object holds one hole) |
| `new Array(2)` | 2 | `[,]` | JSON error (unparseable link that was signed) |
| `[ , {item} ]` | 2 | `[,{...}]` | JSON error |
| `new Array(50)` | 50 | 49 commas | JSON error |

`JSON.parse` of the canonical bytes also throws. Same applies to `validatePrivatePart({lineItems: new Array(2)})` (OK) and the encrypted path (verified: encrypted own output also fails JSON). Programmatic callers only (`parseStrictJson` cannot make holes), so impact is a creator-side integrity bug: a signed digest over bytes that are not valid JSON, or a one-hole array rendered as an empty invoice. 
Suggested fix: iterate by index and reject `!(i in v)` (or `Array.from`) in `validateLineItems`/`validatePrivatePart`; make `canonicalize` throw on holes (`Object.keys(arr).length !== arr.length`).

### S-INV-2 (Low) text hygiene allows display-spoofing characters

`schema.ts:146` `text()` rejects lone surrogates, non-NFC, C0/C1 controls, and over-length only. Verified accepted in `memo` (and by code path `description`): U+202E RLO, U+2066-2069 isolates, U+200B ZWSP, U+200D ZWJ, U+FEFF, U+FFFE (noncharacter), U+FFFD, U+2028/U+2029, tag characters U+E0041, U+FE0F, whitespace-only and leading-space strings, a combining mark alone, Cyrillic homoglyph "apple". Rejected: NUL, DEL, C1, tab, newline, NFD, over-length, lone surrogates.
Repro: `validateInvoice({ ...inv, memo: 'abc‮def' })` returns OK. Payer-facing UI that renders `memo`/`description` verbatim can visually reorder amounts ("Pay 100" + RLO). The library's own docs say "render as text only", so this is a hardening gap, not a contract violation.
Suggested fix: reject Bidi controls (U+061C, U+200E/F, U+202A-E, U+2066-9), U+2028/9, noncharacters, tag chars, and unpaired ZW/variation selectors, or document and enforce rendering in the web app.

### S-INV-3 (Low) schema maximum exceeds the 16 KiB envelope limit

`createInvoice`/`signInvoice` accept an invoice the envelope can never carry; failure surfaces only at `encodeFragment` (FragmentTooLargeError). Measured canonical sizes (50 items x 200 chars + 500-char memo): ASCII 13 876 B (encodes plain, fails encrypted), `"`/`\`/`é` 24 376 B, 4-byte emoji 45 376 B (fail both). Max items of 200 ASCII chars + 500-char memo that encode: 50 plain, 28 encrypted (hex ciphertext doubles). Max valid plain fragment is 18 720 characters (URL fragment), not 16 KiB. Not exploitable; a late, user-visible failure after the seller already signed. Suggested fix: size check in `createInvoice` or document the real per-field budget.

### S-INV-4 (Low) RNG output not checked

`schema.ts:311-315 randomBytes` returns whatever the injected `getRandomValues` left in the buffer. Verified:
`encodeFragment(signed, { encrypt: true, rng: { getRandomValues: a => a } })` produces `enc.k = '00'*32`, `enc.n = '00'*12` with no error; `createInvoice(input, { getRandomValues: a => a })` yields nonce `000...0`. Production default is `crypto.getRandomValues`, so only a broken polyfill or test seam is affected; core-crypto, by contrast, detects a stuck RNG (`RNG_FAILURE`, verified with all-zero, all-0xff and no-op sources). Suggested fix: reject all-zero output (cheap defence in depth).

### S-INV-5 (Info)

- `encodeFragment(null)`, `parseFragment(f, null)`, `parseFragment(f, { pinnedSigners: [null] })` throw plain TypeError instead of InvoiceError (`envelope.ts:301` `k.toLowerCase()`), contradicting "typed InvoiceError subclasses".
- `canonicalize` (json.ts:199) overflows the stack on circular input or 200k-deep nesting with RangeError (not JsonParseError). Parse path is safe (depth cap 8); only direct callers affected.
- `canonicalize(-0)` returns `0` (accepted; harmless).
- No cross-check that `fiat.minorUnits` equals sum(lineItems)+tax; any 30-digit values are accepted (haiku DEVIATIONS item 3, confirmed by `validateInvoice` with total `1` and a 999999999 x 999...9 line OK). `expiresAt` earlier than `quote.expiresAt` is accepted; currency `ZZZ`/`XXX` accepted; token `0x000...0` accepted. UNVERIFIED against the spec whether these are intended.

### Things that held (invoice-schema)

- base64url: 20 000 random buffers (0-199 bytes) round-trip and equal `Buffer.toString('base64url')`; exhaustive 2-char (256 accepted) and 3-char (65 536 accepted) strings: every accepted string re-encodes to itself (0 non-canonical accepted); padding, `+`, `/`, whitespace, NUL, non-ASCII, surrogates, length mod 4 == 1 rejected. 16M-char decode 150 ms; 16 MiB encode 1.86 s (string concatenation; only matters if misused on huge input).
- parseStrictJson: rejects `-0`, `01`, `1.0`, `1e2`, 2^53, 17 digits, BOM, form feed, trailing comma, duplicate keys (also `a` escaped), `__proto__`/`constructor` (also `__proto__`), depth 9, raw control chars, bad escapes, NaN/Infinity, single quotes, trailing garbage. Objects are null-prototype; no prototype pollution. Accepts lone-surrogate escapes (schema rejects later). Differential vs `JSON.parse`: 20 000 random documents, 0 mismatches. Cost: 1M-element array 263 ms, 10 MB string 1.3 s, 100k keys 665 ms, 400k escapes 64 ms (no quadratic behaviour seen); the 16 KiB envelope cap bounds all of this in practice (100 max-size reject calls: 3 ms total).
- validateInvoice boundaries all behaved as spec'd (chainId 1..2^53-1, 30-digit fiat, `fixed_token` up to 2^256-1, slippage 10 000, description 200 / memo 500 code points counting astral correctly, 50 items, qty 9 digits). Mutation fuzz, 30 000 mutated invoices: 11 481 accepted, 0 non-SchemaError exceptions, 0 idempotence/canonical-round-trip anomalies (36.7 s).
- Signatures: independent verify with noble (`prehash:false, lowS:true`) and independent AES-256-GCM decrypt with @noble/ciphers using the documented AAD `"GPI1" || chainId u64 BE || signer(33)` agree. High-s, s=0, r=0, r=n, s=n, r+n, uppercase, 127/130-char, trailing newline, non-string signatures all rejected; AAD chainId/signer change fails decrypt. 500 signatures: 0 high-s, 0 verify failures; RFC 6979 deterministic. Keys 1, n-1, n-2 sign/encode/parse OK; key 0 and n rejected (`SigningError`).
- Tamper: every single-character substitution (2 x len) and every bit flip of the first 2000 decoded bytes of a plain and an encrypted fragment (2 278 + 2 940 char mutations, 6 832 + 8 816 bit flips): 0 cases of a different invoice with a valid signature. Classes: JSON/UTF8/SCHEMA/NON_CANONICAL/BASE64URL/DECRYPT errors or `invalid-signature` or identical invoice. Attacker re-encrypting a different private part under their own key yields `trust: invalid-signature`.
- Non-canonical envelopes (pretty-printed, key-swapped, `\u` escapes, trailing newline) -> NON_CANONICAL; BOM, overlong UTF-8, CESU surrogates -> JSON/UTF8. Prefix/size: `#gpi=v1.` strictness, 16 384 accepted, 16 385 -> TOO_LARGE, 100 MB encoded string rejected in constant time.
- Perf (ms/op): `parseFragment` plain 7.9, encrypted 3.7 (signature verify dominates), max-size valid 11.0; `encodeFragment` 5.1-5.9; `signInvoice` 5.3; `validateInvoice` 0.96. 200 concurrent encrypted parses 1.56 s total, all valid. 1M-entry `pinnedSigners` 234 ms.

---

## core-crypto

### S-CC-1 (Info) scanner cost and timing

`checkAnnouncement` ECDH (`secp256k1.getSharedSecret`) is 7.95 ms raw noble on this host; `deriveStealthPayment` 9.7 ms; `deriveStealthSecret` 7.8 ms; key-gen pubkey 0.86 ms. The view-tag early reject (stealth.ts:163-165) happens after the ECDH, so it only saves the second multiplication. Scan of 20 000 random announcements (valid points, random addresses/metadata): 126.6 s = 158 announcements/s, 0 false matches. A 1M-log backfill is therefore about 1.75 h per core unless worker-parallelised. Timing sanity (600 interleaved samples each, ms median/p5/p95): match 6.41/4.20/14.2, wrong address (tag ok) 5.38/4.11/14.7, wrong tag 3.98/3.25/13.4. The reject/match difference (about 1-2.5 ms) is measurable locally; remote exposure only if a service exposes per-announcement latency, which is out of scope here. Malformed rejects are cheap (0.43 ms).
Related: metadata is fully hex-validated and converted though only byte 0 is used: 4 MB metadata 144 ms, 64 MB 1.67 s (`parseAnnouncement`, stealth.ts:55-63). On-chain metadata is gas-bounded so realistic cost is small; an RPC returning pathological log data is not bounded by this library. Suggested fix: validate only the first byte (or cap length) in the scanner path.

### S-CC-2 (Info) argument handling

- `decodeMetaAddress` (keys.ts:94 `META_RE.exec(metaAddress)`) coerces its argument: `decodeMetaAddress({ toString: () => meta })` and `decodeMetaAddress([meta])` succeed. scheme-2 `decodeScheme2MetaAddress` guards with `typeof`; this one does not.
- `checkAnnouncement(ann, viewingSecret, spend)` and `deriveStealthSecret` pass `viewingSecret` straight to noble (stealth.ts:163, 201): an all-zero 32-byte value throws `RangeError: invalid scalar`, value n throws `Error: invalid field element`, 31 bytes `Error: Field.fromBytes: expected 32 bytes`, `null` TypeError, whereas the TSDoc promises `GhostPayCryptoError INVALID_SCALAR`. A plain unbranded 32-byte `Uint8Array` is accepted (brand is type-only). `deriveStealthSecret` with spendingSecret 0 or >= n throws `ADDRESS_MISMATCH` (fail-closed, wrong code). `secretScalarFromBytes(null)` and `([1,...])` throw TypeError.
- `checkAnnouncement(null, ...)`/`undefined` throws TypeError although the docstring says malformed on-chain data never throws (the case is a type violation, but a scanner fed `JSON.parse` output with a null entry would halt).
- Redaction: JSON/String/template/concat/`util.inspect`/`console.log` of a `SecretScalar` all throw TypeError (verified). `[...s]`, `Array.from`, `Buffer.from`, `bytesToHex`, `.slice()`, `structuredClone` return the raw bytes (by design: the class is a Uint8Array subclass). Documented guarantee holds; do not rely on it for more.

### Things that held (core-crypto)

- Scalar boundaries: 0, n, n+1, 2^256-1, lengths 0/1/31/33/64/65536, Uint16Array -> INVALID_SCALAR; 1 and n-1 accepted.
- Points: 33-byte prefix 04/00, uncompressed, zeros, x = p, p+1, 2^256-1, x = 0, x = 5 (non-residue) all INVALID_POINT and agree with noble `Point.fromBytes` on every case; x in 1..199: 98/199 off-curve (about 50%, as expected).
- Meta-address: uppercase hex OK (canonical output), uppercase prefix, trailing `\n`, leading space, 66-digit form, 134 digits, identical keys (KEY_REUSE), 1 MB junk, fullwidth digits all rejected; 20 000 decodes of 5 KB junk in 461 ms (no ReDoS).
- Metadata: amount 0, 2^256, -1 rejected, 1 and 2^256-1 accepted; `number`/`string` amounts rejected (verified: `buildErc20Metadata(1,tok,5)` returned OK, see note); view tag -1/256/1.5/NaN/'1'/Infinity/len-0/len-2 rejected; zero token, native marker as ERC-20, bad checksum rejected; parse rejects lengths 0/56/58/89/1 MiB, `0X`/unprefixed, native selector with ERC-20 token and the inverse, zero amount. Differential vs `viem.encodePacked(['uint8','bytes4','address','uint256'])` over 20 000 random builds + round-trips: 0 mismatches.
  Note on `number` amount: in my run `buildErc20Metadata(1, tok, 5)` and `(1, tok, '5')` returned OK (JS comparisons `5 < 1n`, `'5'.toString(16)` coerce). `build()` (metadata.ts:30) does `amount < 1n || amount > MAX_UINT256` then `amount.toString(16)`: a `number` 5 yields `'5'`, a string `'5'` yields `'5'`; so non-bigint amounts are silently accepted. Hex string `'0x10'` would yield `'0x10'` padded into invalid hex -> INVALID_METADATA (not run). Severity Info (TypeScript callers are type-checked).
- Stealth differential: 300 random key sets with injected ephemeral scalar, independent computation (noble point maths + `keccak_256` + viem `privateKeyToAddress`): address, ephemeral key, view tag, `checkAnnouncement` result and recovered stealth private key all identical, 0 mismatches. Extreme ephemeral scalars r = 1, 2, n-1, n-2, (n-1)/2 all match.
- RNG: all-zero, all-0xff, no-op fills -> RNG_FAILURE after 64 attempts; value n then 5 -> accepted on second draw; throwing RNG propagates the original Error; `{}` -> RNG_UNAVAILABLE; constant RNG into `generateKeySet` -> KEY_REUSE. Chi-square of the top byte over 51 200 `randomScalar()` draws: 230.4 (expected 255 +/- 23, df 255).
- Announcement hostile inputs (all `{ matches: false }`, no throw): schemeId number 1 / 2n, empty and odd-length metadata, wrong view tag, uncompressed/infinite/parity-flipped/2 MB ephemeral key, bad-checksum or all-uppercase address, non-string ephemeral key. 1 MB metadata with correct tag still matches (length unconstrained, see S-CC-1).

---

## policy-scheme

### S-POL-1 (Low) `signPolicyTypedData` signs foreign typed data

Docstring (eip712.ts, `signPolicyTypedData`): "Signing anything except a digest from these builders is impossible through this function." Code (eip712.ts:342) only checks `viemDigest(td.domain, td.types, td.primaryType, td.message) === td.digest`, which any self-consistent object satisfies.
Repro (verified):

```js
const domain = { name: 'USD Coin', version: '2', chainId: 1, verifyingContract: USDC };
const types  = { Permit: [ {name:'owner',type:'address'}, {name:'spender',type:'address'},
                 {name:'value',type:'uint256'}, {name:'nonce',type:'uint256'}, {name:'deadline',type:'uint256'} ] };
const message = { owner, spender: attacker, value: 2n**256n-1n, nonce: 0n, deadline: 2n**256n-1n };
const digest = hashTypedData({ domain, types, primaryType: 'Permit', message });
await signPolicyTypedData({ domain, types, primaryType: 'Permit', message, structHash: ZERO_HASH, digest }, ownerSecret);
// -> returns a signature; recoverTypedDataAddress(...) === owner
```

A tampered builder output (edited message, digest kept; or edited digest) is correctly refused (`SIGNING_FAILED`). Impact: any app path that accepts a typed-data object from outside (dApp request, deserialised JSON) can obtain an owner-key signature over an unrelated protocol's message; the owner key is per-payment and holds only that account's funds, which limits blast radius. Suggested fix: allowlist `primaryType` in `POLICY_TYPES`, require `td.domain.name/version === POLICY_DOMAIN_*`, `td.types` deep-equal `POLICY_TYPES[primaryType]`, or brand/WeakSet the builder outputs.

### S-POL-2 (Low) withdraw limit pre-check trusts caller-supplied limit data

Confirms haiku F1 (`docs/remote/audits/bugs-policyscheme.md:7`). `eip712.ts:229-230`: `verifyLimitProof(root, lp.leaf, lp.proof)` proves only that `lp.leaf` is in the tree; `amount > lp.limit` then uses `lp.limit`, which is never tied to `lp.leaf`, and `TokenLimitProof` carries no token. Verified:

```js
const pr = getLimitProof(tree, tokenA);              // true limit 100
buildWithdrawTypedData({ ..., token: tokenA, amount: 1000n, limit: { limitsRoot: tree.root, proof: { ...pr, limit: 2n**256n-1n } } })  // built (amount 1000 > 100)
// signPolicyTypedData(...) also signs it.
buildWithdrawTypedData({ ..., token: tokenB, amount: 50n, limit: { limitsRoot: tree.root, proof: prOfTokenA } })  // built
```

`encodeRequestWithdraw` does recompute `limitLeafHash({token, limit, windowSeconds})` and rejects both with `INVALID_PROOF` (verified), and the contract recomputes the leaf, so funds are safe; this is a defence-in-depth gap: an owner can be shown and sign a withdrawal the local check was meant to refuse. `encodeRequestWithdraw` with the true proof and amount 1000 > 100 succeeds locally (contract would revert on limit). Suggested fix: recompute the leaf from (token, proof.limit, proof.windowSeconds) inside `buildWithdrawTypedData` and compare to `lp.leaf`.

### S-POL-3 (Low) calldata decoder is lenient

`router.ts:165` relies on viem `decodeFunctionData`. Verified: appending `deadbeef`, truncating the last byte, upper-casing the hex, and setting the 12 high bytes of the stealth-address ABI word to 0xff (non-canonical ABI; Solidity 0.8 would revert) are all ACCEPTED by `decodePolicyPaymentCalldata`. Byte-mutation sweep of a valid 484-byte `payERC20` calldata (3 xor masks per byte, 1 452 variants): 843 accepted, 609 rejected, 0 accepted with a changed stealth address. 20 000 random calldata blobs: 0 accepted. The function checks only that `stealth == predictAccountAddress(owner, policyHash)`; it does not check ephemeral key validity, metadata/net consistency, amounts, deadline, or token, and returns metadata/ephemeral key unvalidated. Documented purpose is the stealth/owner/policy binding, which held in every test (tampered stealth, tampered owner and tampered policy -> INVALID_INPUT, wrong deployment -> INVALID_INPUT). Treat as a wallet-prompt aid, not full verification. Suggested fix: re-encode the decoded args and require byte-equality with the input.

Also (Info): `buildPolicyPaymentTx` accepts `token == router`, `deadline: 0n` when `now` is not passed, and any permit `v` in {0,1,27,28} (normalised); `permit` v=2/29 and 64/66-byte signatures rejected. Fee floor: `policyRouterFee(g) == g/400`; fee is 0 for g < 400 (399 -> fee 0, net 399); verified for g in 1..5000 and 20 000 random values up to MAX_POLICY_ROUTER_GROSS (4.63e75), `MAX_GROSS+1` rejected. Builder boundaries (`minNet` 0 / net+1 rejected, net accepted; `deadline == now` rejected; buffer 0 and buffer > max rejected; permit+buffer, native+permit/buffer rejected; zero/native-marker token rejected; fee recipient or router equal to account rejected) all as documented. Round trip build -> decode for payNative/payERC20/payERC20WithPermit/payERC20WithBuffer: 0 anomalies (420/484/580/516 byte calldata).

### S-POL-4 (Info) cost curves

- `checkScheme2Announcement` is linear in `policyHashes` once the view tag matches: 5.8 ms (1), 17.6 ms (100), 245 ms (1000) per announcement (about 0.24 ms per predicted address). Tag-reject path 8.9 ms (ECDH-bound). `deriveScheme2Payment` 9.5 ms.
- `buildLimitsTree`: n=1000 112 ms, 10 000 2.3 s, 50 000 11.1 s (about 0.22 ms/leaf, address checksum + ABI + keccak per leaf, done twice). `getLimitProof` is O(n) (`limits.ts:138` `findIndex` with `toLowerCase` per leaf): 0.35 ms (n=1000), 4.6 ms (10 000), 23 ms (50 000). `verifyLimitProof` costs 34 us per proof word: 100 000 words took 3.4 s; `encodeRequestWithdraw` with 20 000 attacker-chosen proof words 155 ms. Only matters if proofs come from untrusted input. 2nd-preimage note: `verifyLimitProof(root, innerNode, shortenedProof)` returns true (verified), because the library verifier takes any hash as a leaf; protection comes from the contract recomputing the double-hashed leaf and from `getLimitProof`/`buildWithdrawTypedData` using real leaves.

### S-POL-5 (Info) error-class and strictness inconsistencies

- `signPolicyTypedData` with a zero/>= n/short/null key throws raw noble errors (`RangeError: invalid scalar`, `Error: invalid field element`, `Field.fromBytes`) not `SIGNING_FAILED`; an unbranded `Uint8Array` key works.
- `computePolicyHash(null)`, `validatePolicy(null)`, `predictAccountAddress(null,...)`, `checkScheme2Announcement(null,...)`, `policyHashes: null` throw TypeError, not PolicySchemeError.
- Scheme-2 scanner `parse()` (derive.ts:116) uses `isAddress(..., {strict:false})` and accepts a bad mixed-case checksum (match still requires the derived address, so harmless); core-crypto `checkAnnouncement` rejects it. A missing `schemeId` is treated as matching in both.

### Things that held (policy-scheme)

- `computePolicyHash`: 5 000 random policies vs manual `keccak256(pad32(dest) || pad32(delay) || root)`: 0 mismatches; delay 0 and MAX_UINT256 encodable, 2^256, -1, number, string rejected; root of 31/33 bytes, uppercase accepted (lowercased), trailing `\n` rejected. `validatePolicy` delay boundaries: 0, 1, MIN-1 rejected; MIN (3 600) and MAX (2 592 000) accepted; MAX+1, 2^64 rejected; zero destination rejected.
- CREATE2: 3 000 random (factory, impl, owner, policyHash) vs `viem.getContractAddress({opcode:'CREATE2', bytecode: manual EIP-1167 init code})`: 0 mismatches. Zero owner/factory/impl rejected.
- Limits tree: 28 sizes between 1 and 1 025 leaves (every power of two and neighbours), every leaf's proof verified with an independent verifier and an independent leaf formula (`keccak(keccak(abi.encode(token,limit,window)))`): 0 failures, max proof length 11, order-independent root, case-insensitive lookup, one-leaf tree root == leaf with empty proof, tampered leaf fails. Boundary limits: 0, MAX-1 with window 0, 2^256, negative, `number`, window 2^64, token malformed rejected; UNLIMITED with window 0 or 1, window 2^64-1, zero (native) token accepted; mixed-case duplicate token -> DUPLICATE_TOKEN; `[]`, `null`, `{length:1}` -> EMPTY_TREE. (No `@openzeppelin/merkle-tree` in node_modules, so no byte-for-byte differential against OZ's JS library; UNVERIFIED beyond the independent leaf/pair/verify implementation and the repo's anvil test, which is skipped by default.)
- EIP-712: Withdraw digest for 500 random inputs (chain ids 1, 10, 8453, 2^53-1; amounts/deadlines/nonces of 1-32 bytes) equals both a manual byte construction and viem `hashTypedData`: 0 mismatches. Boundaries: amount 0 rejected, amount/deadline/nonce 2^256-1 accepted, 2^256 and negatives rejected, token == account, zero account, chainId 0 / 2^53 / 1.5 / bigint rejected, `limitsRoot` zero rejected. Limited withdraw: amount 99 and 100 OK vs limit 100, 101 -> INVALID_LIMIT, proof for a different root -> INVALID_PROOF. 300 sign/recover round trips on ProposeDestination: 0 failures; signatures are low-s, v in {27,28}, deterministic; wrong `expectedOwner` -> SIGNING_FAILED; edited message or digest -> SIGNING_FAILED.
- Scheme-2 meta-address: uppercase hex accepted, trailing `\n`, scheme-1 form, zero policy hash, identical keys, non-string all rejected. Derive/scan/owner-key differential, 150 random key sets with injected ephemeral scalar: owner address equals core-crypto scheme-1 derivation, account equals independent CREATE2, `checkScheme2Announcement` matches among 3 candidate hashes, `deriveScheme2OwnerKey` private key maps to the owner, wrong policy list / wrong factory / schemeId 1n do not match, lowercase announced address does match, core-crypto's scheme-1 checker does not match the account address: 0 anomalies (12.6 s). Hostile announcements: `{}`, bad schemeId (number or 1n), short/odd/empty metadata, uncompressed / off-curve / 2 MB ephemeral key -> `no match`, never throw; `[]` hashes -> no match; malformed hash / zero factory / zero or >= n viewing secret throw typed errors.
- `buildPolicyPaymentTx`: swapped account/owner/policyHash rejected; uncompressed ephemeral key, 2-byte view tag rejected.

---

## secret-box

### S-SB-1 (Low) `close()` and `wipe(...)` fail above about 125k tracked buffers and then wipe nothing

Evidence: `scope.ts:63` `wipe(...this.buffers)` spreads the whole array as call arguments; `secretBox.ts:50` `wipe(...buffers)` is variadic. Past the engine's argument limit the call throws before wiping anything, and `close()` has already set `closed = true` and has not reached the `for (const b of this.boxes) b.dispose()` loop. Repro (verified, default Node stack, `sb2.mjs`):

```js
const s = new SecretScope();
const bufs = []; for (let i = 0; i < 130_000; i++) bufs.push(s.track(new Uint8Array([7])));
const box = s.box(new Uint8Array([9]), 'k');
s.close();   // RangeError: Maximum call stack size exceeded
// bufs.every(b => b[0] === 0) === false; box.disposed === false; second close() throws again
```

Threshold: 125 000 OK, 130 000 fails (stack-dependent; lower when called from a deeper stack). `withScope(s => { track 200k; return 'x' })` throws RangeError; `wipe(...200k arrays)` throws. Impact: bulk scoped secrets (not a realistic key-handling pattern, but also exposed to a hostile or buggy caller) leave secrets unwiped with an error that does not identify the cause. Suggested fix: loop in `close()` (`for (const b of this.buffers) wipe(b)`) and dispose boxes in a `finally`.

### S-SB-2 (Low) `SecretScope.box(bytes, invalidLabel)` leaks `bytes` on the error path

`scope.ts:40` calls `SecretBox.copyOf(bytes, ...)`, which runs `checkLabel` (`secretBox.ts:99`) before the wipe at `secretBox.ts:102`. Repro (verified):

```js
const src = new Uint8Array([1, 2]);
try { new SecretScope().box(src, 'bad label!'); } catch {}
// src is still [1, 2]: neither wiped nor tracked by the scope
```

This is the same error-path pattern the module was written to eliminate (scope.ts header comment). Same for empty input (copyOf throws INVALID_INPUT before wipe; nothing sensitive in an empty buffer). Suggested fix: in `box`, `track(bytes)` first or wipe in a `finally`.

### S-SB-3 (Info)

- `SecretBox.random(len, { rng })` does not detect a no-op RNG: `random(32, { rng: { getRandomValues: a => a } })` returns a valid box of 32 zero bytes. A missing `getRandomValues` or absent `globalThis.crypto` raises a plain TypeError, and `copyOf(x, null)` TypeError.
- `new SecretBox(bytes, 'x')` works at runtime (private constructor is TypeScript-only), stores the caller's buffer without copying, and skips label validation. `label: 5` (number) passes the regex through coercion.
- `assertNoSecretBox` does not see boxes in symbol-keyed or non-enumerable properties, class `#private` fields, closures, Promises, WeakMap, `Error.cause`; it invokes getters (a throwing getter or Proxy `ownKeys` propagates the raw Error). Boxes in the walked structure are found at any depth <= 16; depth 17, 10 000 nodes, and DAG fan-out fail closed with INVALID_INPUT. A box serialises as `{}` anyway (verified `structuredClone`, `v8.serialize` -> empty object), so these are silent-data-loss gaps, not leaks. 9 990-node check: 7.4 ms.
- `take()` returns the internal buffer, `dispose()` afterwards does not wipe it (documented).
- `useAsync` lends a copy that survives a concurrent `dispose()` of the box (verified: result "123" after dispose mid-flight); the copy is wiped on settle. Same for `dispose()` inside `use()`.

### Things that held (secret-box)

- Leak surfaces: `String`, template, concat, `util.inspect` (also with `showHidden`), `console.log`/`console.dir` print only `[SecretBox <label> redacted]` or getters (no bytes); `JSON.stringify` (also nested) throws SERIALIZE; spread / `Object.keys` / `getOwnPropertyNames` / `getOwnPropertySymbols` / `Reflect.ownKeys` / `Object.entries` / `structuredClone` / `v8.serialize` expose nothing; the instance is frozen. `Proxy(box)`, `Object.create(box)`, `Object.create(SecretBox.prototype)` cannot reach the bytes (INVALID_INPUT).
- `use()` lends a copy that is zeroed on return and when the callback throws; mutating the copy does not change the box; Promise, thenable object, and function-thenable returns -> ASYNC_IN_SYNC_USE. Move semantics: `take()` twice, use/equals after take or dispose -> DISPOSED.
- `equals`: 20 000 random pairs (box vs bytes, box vs box, equal and different lengths, first-byte differences): 0 mismatches vs a plain comparison. Timing at 64 KiB (301 samples, median ns): difference at byte 0 77 386, at the last byte 77 417, equal 77 386; length mismatch against a 1-byte input 254 935 (slower, loop to max length), so length is observable, as the docstring says.
- Inputs: `copyOf` rejects empty, Uint16Array, Uint8ClampedArray, Array, ArrayBuffer, DataView, string, null, detached buffer; accepts Buffer and subarray views (wipes only the view region, verified). `random` accepts 1..65 536 and rejects 0, 65 537, negatives, fractions, NaN, Infinity, strings, 2^32; 65 536-byte chi-square 257.5 (expected 255 +/- 23). Labels 1-32 of `[A-Za-z0-9_.-]` only; newline, space, non-ASCII, 33 characters rejected.
- Scope: close wipes tracked buffers and disposes boxes; track/box after close -> DISPOSED; `keep` survives close; `withScope` returning a promise throws ASYNC_IN_SYNC_USE and still wipes; `withScopeAsync` wipes on reject; 1 000 concurrent `withScopeAsync` scopes each return their own value.
- Perf: `use` 0.27 us, `copyOf` 4.7 us (32 B), `equals` 0.16 us, `random(32)` 15.3 us, `copyOf` 256 MiB 655 ms, `wipe` 1 GiB 0.97 s. `keep` filters the box array per call (O(n) each, quadratic over many boxes by reading; timing UNVERIFIED).

---

## Reproduction commands

```sh
cd /home/user/ghostpay
S=<scratch>; mkdir -p $S/b; ln -sfn $PWD/node_modules $S/node_modules
for p in core-crypto invoice-schema secret-box policy-scheme; do
  (cd packages/$p && ../../node_modules/.bin/tsc -p tsconfig.build.json --outDir $S/b/$p); done
# probes import ../b/<pkg>/index.js; run e.g.  node --expose-gc sb.mjs
# baseline suites
cd packages/<p> && ../../node_modules/.bin/vitest run --coverage.enabled=false
```

Parameters used: differential sample sizes 300 (stealth), 150 (scheme 2), 3 000 (CREATE2), 5 000 (policy hash), 500 (EIP-712), 20 000 (metadata, JSON, equals, base64url), 30 000 (schema mutation fuzz); exhaustive base64url 2- and 3-character spaces; tree sizes 1..1025 (28 values) and 1k/10k/50k for cost; single-char and bit-flip tamper sweeps over full plain/encrypted fragments.

## Not covered / UNVERIFIED

- Anvil/on-chain agreement of policy-scheme outputs (skipped suite; no contract run here).
- Differential of Merkle roots against `@openzeppelin/merkle-tree` (package not installed).
- Browser Web Crypto behaviour (AES-GCM ran on Node's WebCrypto only).
- Constant-time properties beyond the sampled medians above; JS gives no guarantee.
- Memory residue / zeroization effectiveness (best-effort by design; not measurable from JS).
- Concurrency under multi-worker scanner load; no worker harness was built.
