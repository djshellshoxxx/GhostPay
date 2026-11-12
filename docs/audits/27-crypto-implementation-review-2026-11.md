# 27 - Cryptographic implementation review (EXTRA-05), 2026-11

> **This is not a professional audit.** It is an AI-assisted code review with added differential and negative tests.
> It does not certify the reviewed code as secure. Treat every "no finding" as "nothing found by the methods below".

## Scope and commit

- **Base commit:** `fc57154` (`fix(deps): resolve invalid nested abitype/zod peer ...`), branch `extra/05-crypto`.
- **In scope (reviewed):**
  - `packages/core-crypto`: ERC-5564 scheme-1 stealth derivation (`stealth.ts`), view tags, meta-address
    encode/decode (`keys.ts`), scalar/point validation (`secret.ts`, `rng.ts`), router metadata (`metadata.ts`).
  - ERC-6538 registry handling. It is located in `packages/chain-adapters/src/registry.ts` (core-crypto has none).
  - `packages/invoice-schema`: invoice signing (`sign.ts`), `A256GCM` and `A256GCM-PW` envelopes (`envelope.ts`,
    `passphrase.ts`: scrypt + AES-256-GCM), strict base64url/JSON, versioning.
  - EIP-712: invoice-schema has **no** EIP-712 code (see I-1). The EIP-712 code on the stealth-key path is the sweep
    relayer typed data in `packages/chain-adapters/src/sweep.ts`, reviewed for domain binding only.
  - `packages/secret-box`: random fill and `equals` only. Lifecycle, wiping, transfer and serialization guardrails were
    already reviewed in PR #103 (`origin/chatgpt/zero-codex/audit-secret-box-20261110`,
    random-audit ledger under `docs/audits/` on that branch, entry "2026-11-10: scoped read-only review"). That review is not repeated
    here. secret-box does **no key wrapping** (no encryption). The passphrase key wrapping in
    `apps/web/src/lib/keystore.ts` was spot-checked for scrypt bounds only.
  - `test-vectors/scheme1.json` (provenance, independence of the generator, recomputation).
- **Out of scope:** BIP-352 / `btc-silent-payments`, relayer, `packages/qr-exchange`, app UI.

## Spec references

Primary spec pages could **not** be fetched from this sandbox (`eips.ethereum.org` was not reachable on this network).
The spec was checked against:

- EIP-5564 (https://eips.ethereum.org/EIPS/eip-5564), scheme 1 (secp256k1 with view tags), through the repo's ADR-0001
  serialization pin (compressed 33-byte `S`, `s_h = keccak256(S)`, `tag = s_h[0]`, `P = P_spend + (s_h mod n)G`) and
  the ScopeLift reference SDK `@scopelift/stealth-address-sdk@1.0.0-beta.5` already in `node_modules`. The repo already
  had a 1000-payment SDK differential test.
- EIP-6538 (https://eips.ethereum.org/EIPS/eip-6538): registry address, `registerKeys` / `stealthMetaAddressOf`, entry
  typehash string. These are pinned in `registry.compat.test.ts`. Not re-verified against the live page.
- EIP-712 (https://eips.ethereum.org/EIPS/eip-712): the published "Ether Mail" example (domain separator
  `0xf2ce...090f`, digest `0xbe60...7bd2`, `cow` key signature `v=28, r=0x4355...1c9d, s=0x0729...1562`). The new test
  reproduces all of these, which independently confirms the values used.
- EIP-55 (mixed-case checksum), SEC 1 v2 section 2.3.3/2.3.4 (point encoding), SEC 2 v2 section 2.4.1 (secp256k1 constants).

## Method

1. Read the source of every in-scope file against the spec steps above.
2. **Curve-independent differential:** wrote `secp256k1-ref.testutil.ts`, a plain-bigint secp256k1 from the SEC 2
   constants (affine add/double, double-and-add, SEC1 compress/decompress, textbook ECDSA verify). It shares no code with
   `@noble/curves`. Only keccak256 (`@noble/hashes`) is shared, and it is checked against `keccak256("")`. The reference
   is checked against the published address of private keys 1 and 2.
3. **Third AEAD/KDF implementation:** `node:crypto` (OpenSSL) `scryptSync` + `aes-256-gcm`. It is used in both
   directions against the package's `A256GCM` and `A256GCM-PW` envelopes. The existing tests use `@noble/ciphers`.
4. Spec-driven negative cases (listed below).
5. Grep for `Math.random` in non-test source under `packages/` and `apps/`. Grep for hand-rolled MAC/tag comparisons.

## Differential and negative tests added

| File | Tests | What it checks |
|---|---|---|
| `packages/core-crypto/src/independent.test.ts` (+ `secp256k1-ref.testutil.ts`) | 16 | Reference self-checks; all 6 `scheme1.json` vectors recomputed (pubkeys, meta-address, R, tag, EIP-55 address, stealth key); 150 random key sets: `deriveStealthPayment` / `checkAnnouncement` / `deriveStealthSecret` equal to the reference byte for byte; point acceptance equal to the SEC1 reference on 2000 random encodings and on edge x (0, 1, 7, p-1, p, p+1, 2^256-1) times 9 prefixes; infinity, uncompressed and hybrid encodings refused; all 255 wrong view tags refused (and found with `ignoreViewTag`, `tagMatches: false`); `-R` (02/03 swap) does not alias; 65-byte R or meta-address keys refused, not reinterpreted; uncompressed-S hashing gives a different address (shows the ADR-0001 pin is load-bearing); zero / n / n+1 / 2^256-1 / 31-byte scalars refused even when passed around the branded type; RNG that always yields n gives `RNG_FAILURE` (no reduction) |
| `packages/invoice-schema/src/independent.test.ts` (+ copy of the reference) | 9 | Signer key, canonical bytes and digest reproduced with an own canonical-JSON writer; 20 signatures verify under the bigint ECDSA verifier and are low-s; cross-chain replay (chainId 1, 10, 137, 8454, 84532) fails in both; high-s twin is valid textbook ECDSA but refused by the package; r/s = 0 or >= n refused; `A256GCM` and `A256GCM-PW` package output opens with OpenSSL under the documented AAD; an OpenSSL-made PW envelope parses; changes to AAD chainId, nonce, salt and 24 sampled ciphertext/tag bytes, a truncated tag and an appended byte all give `WrongPassphraseError`; header/plaintext chainId mismatch under an authentic AAD gives `SchemaError`; unknown prefixes (`v0`, `v2`, case variants) give `FragmentFormatError`, unknown `alg` gives `UnsupportedError`, invoice `v: 2` gives `SchemaError`; absurd scrypt N/r/p (2^31, 2^20, 3*2^15, MAX_SAFE_INTEGER, r=1024, p=16, wrong types) are refused in < 1.5 s total, with no KDF run |
| `packages/chain-adapters/src/eip712.independent.test.ts` | 2 | EIP-712 "Ether Mail" domain separator, digest and `cow` signature match the EIP text; a sweep signature does not recover to the owner under a different verifyingContract, chainId, domain name, version or nonce |
| `packages/chain-adapters/src/registry.test.ts` | +1 | Regression for EXTRA05-F1 |

Pass counts after the change (`npm test -w <pkg>`, coverage thresholds 95/90/95/95 all met):
core-crypto 71/71 (was 55), invoice-schema 635/635 (was 626), chain-adapters 341 passed + 18 skipped (was 338 + 18),
secret-box 47/47 (unchanged). `apps/web` `RegistryView.test.tsx` 11/11 after rebuilding chain-adapters.

## Findings

| ID | Severity | File:line | Issue | Status | Test |
|---|---|---|---|---|---|
| EXTRA05-F1 | Low | `packages/chain-adapters/src/registry.ts:113-118` | `buildLookupCall` (and so `lookupMetaAddress`, which the web Registry page calls with user-typed input) accepted a mixed-case registrant whose EIP-55 checksum is wrong (`isAddress(..., { strict: false })`). A mistyped checksummed address was looked up without complaint, and the result was shown for the wrong address. It cannot be used to redirect funds: that would need control of the mistyped address's key. | **Fixed:** mixed-case input must verify its checksum; single-case input (no checksum) is still accepted. | `registry.test.ts` "EXTRA05-F1 ..." (failed before the fix, passes after) |
| I-1 | Info | `packages/invoice-schema/src/sign.ts:9` | Invoice signatures are **not EIP-712**. They are ECDSA over `keccak256("GhostPay.Invoice.v1\0" || canonical JSON)` (ADR-0002). There is no `verifyingContract` binding. `chainId` is bound because it is a signed invoice field (verified). Wallet-signing UX and EIP-712 tooling do not apply. | By design; documented | `independent.test.ts` cross-chain replay |
| I-2 | Info | `packages/core-crypto/src/stealth.ts:64`, `secret.ts:132` | Announcements with a 65-byte (uncompressed) ephemeral key are treated as non-matching. A third-party ERC-5564 sender that emits uncompressed R would be missed by the scanner (funds stay recoverable once the scanner accepts it). The behaviour matches the reference SDK and ADR-0001. | Accepted interop limitation | `independent.test.ts` compressed/uncompressed |
| I-3 | Info | `packages/core-crypto/src/keys.ts:24` vs `packages/invoice-schema/src/schema.ts:99` | core-crypto accepts upper-case hex in a meta-address and returns canonical lowercase. invoice-schema requires lowercase. The two are consistent in effect (canonical output) but differ on input. | No change | - |
| I-4 | Info | `packages/core-crypto/src/keys.ts:48` | Spend/view key equality check uses an early-exit `every`. It compares two freshly drawn local secrets, so an attacker gets no timing oracle. | No change | - |
| I-5 | Info | `packages/secret-box/src/secretBox.ts:126` | `SecretBox.random` without `globalThis.crypto` throws a raw `TypeError`, not `SecretBoxError`. It fails closed. Not a security issue. | No change | - |
| I-6 | Info | `packages/chain-adapters/src/registry.ts:136,182` | Registry identity is a behavioural probe (code exists, typehash answers), not a code-hash pin. A hostile RPC can fake it. Already documented in `TODO-VERIFY.md`. | Known | - |

### Areas checked with no finding

- **Scheme-1 maths and serialization:** matches the reference SDK (existing), and now also a curve-independent
  implementation. Hash reduction mod n, zero-hash and infinity rejection are already covered in `hash-edge.test.ts`.
- **Randomness:** scalars come from `crypto.getRandomValues` with rejection sampling in [1, n-1] (64-attempt stuck-RNG
  guard). Invoice nonces, AES keys, GCM nonces and scrypt salts come from `crypto.getRandomValues`. `Math.random` appears
  in no non-test source under `packages/` or `apps/`; the only hits are comments and the bundle-scanner rule
  (`apps/web/scripts/scan-bundle.mjs`).
- **Signatures:** RFC 6979 deterministic signing, low-s enforced on verify, 64-byte compact only, domain separated.
- **AEAD:** AES-256-GCM through Web Crypto with a 128-bit tag. The tag check is inside Web Crypto, and no MAC/tag
  comparison in scope is hand-rolled. A fresh random key and a 96-bit nonce per `A256GCM` envelope; a fresh salt and
  nonce per `A256GCM-PW` envelope. The PW AAD binds chainId, signer, N, r, p and salt. All authentication failures
  collapse into one error.
- **scrypt DoS:** `A256GCM-PW` accepts only N in {2^15, 2^16, 2^17} with r=8 and p=1, checked before any derivation and
  again inside `derivePassphraseKey`. `maxmem` is set tight. The web keystore bounds N to 2^14..2^18, r and p are capped
  (`keystore.ts`), and it reads local files only.
- **Versioning:** only `#gpi=v1.` and `alg` in {`none`, `A256GCM`, `A256GCM-PW`}; anything else fails closed.
- **EIP-712 (sweep):** a manual digest is cross-checked against viem before signing; full domain binding is verified.
- **Constant-time comparisons:** `SecretBox.equals` has no early exit (it makes no JS timing guarantee, as its doc says).
- **Test vectors:** `test-vectors/generate.mjs` does not import `@ghostpay/core-crypto`. The vectors now agree with
  three implementations: the SDK, the package and the bigint reference. No official EIP-5564 test vectors exist in the
  repo, and the EIP text was not reachable to confirm whether it publishes any.

## Assumptions and limitations

- No network access to the EIP pages. Spec conformance rests on the repo ADRs, the ScopeLift reference SDK and
  well-known published constants (SEC 2, EIP-712 example, EIP-55). The EIP-5564 text does not fix the serialization of
  `S`; ADR-0001's compressed choice was taken as the spec of record, as the SDK uses it.
- The bigint reference and OpenSSL checks are differential, not proofs. The shared dependency is keccak256 from
  `@noble/hashes`, which is checked against one known answer only.
- Side channels (timing, cache, JIT/GC copies), browser runtime behaviour and the contracts were not assessed.
- The Web Crypto AES-GCM tag check is trusted as implemented by the platform.
- A single reviewer and a single pass. This is not a professional audit and gives no assurance of absence of defects.
