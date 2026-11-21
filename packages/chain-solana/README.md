# @ghostpay/chain-solana

Dual-key ed25519 stealth addresses for Solana (Monero-style): derive, scan, spend, raw-scalar signing,
announcement codec, PDA / associated-token-account derivation, and a `ChainAdapter`-shaped skeleton.

**Status: testnet proof of concept. Not audited. No RPC code, no on-chain program, no transaction
building.** Only `sol-devnet` and `sol-testnet` are accepted by the adapter. Spec and research:
`docs/remote/chain-ports/solana.md`; what was actually built and how it differs:
`docs/remote/chain-ports/solana-impl.md` and [DEVIATIONS.md](./DEVIATIONS.md).

**Same formats as `@ghostpay/solana-stealth` (TB-08, 2026-11-18).** This package is the one imported by the CLI
(`packages/cli`); the web app imports `@ghostpay/solana-stealth`. Both now use the ADR-0017 scheme
(`docs/adr/ADR-0017-solana-stealth.md` sections 3 and 5): `st:sol:` meta-addresses with a cluster byte, the same
derivation (a payment derived here is detected by the web scanner) and `gpst1:` + base58 memos. `src/interop.test.ts`
pins this package and the web package's source to the shared vectors in `test-vectors/meta-address-sol-tron-v1.json`
and to the web package's own `test-vectors/solana-stealth.json`, encode-in-one / decode-in-the-other. The retired
`gpsol:` meta-address is refused with `LEGACY_META_ADDRESS` (no shipped surface generated one: the CLI only inspects
meta-addresses and the web app never produced this form); the retired `gpst1:` + base64url memo is refused as
`INVALID_ANNOUNCEMENT`. One documented difference: this decoder also refuses `S == V` (`KEY_REUSE`), which the web
decoder accepts.

Runtime dependencies (exact pins): `@noble/curves` 2.4.0, `@noble/hashes` 2.4.0, `@scure/base` 1.2.6.

## Scheme (v1)

Notation (ADR-0017 section 3): `B` ed25519 base point, `L` its prime order, scalars are 32-byte little-endian in
`[1, L-1]`, `enc(P)` the 32-byte RFC 8032 point encoding, `dst(label) = u8(len(tag)) || tag` with
`tag = "GhostPay/solana-stealth/v1/" + label`, `H(tag, ...) = SHA-512(u8(len(tag)) || tag || ...)`.

| Step | Formula |
|---|---|
| Keys | `s, v` uniform in `[1, L-1]`, `s != v`; `S = s·B`, `V = v·B` |
| Meta-address | `st:sol:` + base58(`0x01 \|\| cluster \|\| enc(S) \|\| enc(V) \|\| checksum4`), cluster bytes mainnet 0, devnet 1, testnet 2, localnet 3; `checksum4 = SHA-256(dst("checksum") \|\| payload)[0..4]` |
| Sender | `r` uniform; `R = r·B`; `Z = r·V`; `h = SHA-512(dst("shared") \|\| enc(R) \|\| enc(Z) \|\| enc(S)) mod L`, reject 0; `view_tag = SHA-256(dst("view-tag") \|\| enc(R) \|\| enc(Z))[0]`; `P = S + h·B`, reject identity; address = base58(enc(P)) |
| Receiver | `Z = v·R`; compare view tag; recompute `P`; compare with the funded account |
| Spend | `x = s + h mod L`, reject 0, check `x·B == P` |
| Sign | RFC 8032 with the raw scalar `x`; nonce prefix = `H("GhostPay/solana-stealth/v1/nonce-prefix", LE32(x), enc(P))[0..32]` |

Every point decoded from input (S, V, R) must be canonical (`y < p`, no `x = 0` with sign bit), not the
identity, and torsion-free; all 8 small-order points and every torsion-mixed point are rejected. Because of that, no
cofactor multiplication is used (an earlier version computed `[8](r·V)` and derived different addresses).

## Announcement

Binary (this package's proposed announcer-program event payload; no such program exists, ADR-0017 section 6
specifies a different instruction, and the web app never reads this form):

```
offset 0      1 byte   version = 0x01
offset 1     32 bytes  enc(R)
offset 33     1 byte   view_tag
offset 34   0..256     opaque metadata (rest of the payload, no length field)
```

SPL Memo form, the interoperable one (ADR-0017 section 5; the Memo program requires UTF-8): `gpst1:` +
base58(`enc(R) || view_tag`), exactly 33 bytes, no metadata (`encodeAnnouncementMemo` refuses non-empty metadata
instead of dropping it). Decoders are strict: binary length 34..290 bytes, version 1; memo at most 96 characters,
base58 body of exactly 33 bytes; valid prime-order `R` in both.

## API sketch

```ts
import {
  generateStealthKeys, encodeMetaAddress, deriveStealthPayment, decodeAnnouncementMemo,
  checkAnnouncement, deriveStealthSpendScalar, signWithScalar, getAssociatedTokenAddress,
} from '@ghostpay/chain-solana';

const keys = generateStealthKeys();                     // seller, offline
const meta = encodeMetaAddress({ ...keys, cluster: 'devnet' }); // "st:sol:..."
const pay = deriveStealthPayment(meta);                 // payer: pay.stealthAddress, pay.announcement
const ata = getAssociatedTokenAddress(pay.stealthAddress, mint); // SPL destination
const hit = checkAnnouncement(decodeAnnouncementMemo(memo), keys.viewSecret, keys.spendPublicKey, fundedAddress);
const x = deriveStealthSpendScalar(keys.spendSecret, hit!.tweak, hit!.stealthPublicKey);
const sig = signWithScalar(x, serializedTxMessage, hit!.stealthPublicKey);
```

`createSolanaAdapter({ chainId: 'sol-devnet', source })` returns an object with the six
`ChainAdapter` members; meta-addresses for another cluster fail with `NETWORK_MISMATCH`; `scan` reads an injected `AnnouncementSource` (no RPC here) and skips
malformed or foreign announcements. Fees are `not_enforceable` on every line and always zero.

Secrets (`SecretScalar`) throw on `JSON.stringify`, `String()`, template interpolation and
`util.inspect`. `unsafeRevealSecret` is the only plain-bytes export path.

## Tests

`npx vitest run --coverage` (thresholds 95/90/95/95). What is verified against what:

| Claim | Evidence |
|---|---|
| Raw-scalar signing core is RFC 8032 | `signExpanded(a mod L, prefix, M)` reproduces the RFC 8032 section 7.1 signatures byte for byte (TEST 1, 2, 3, 1024, SHA(abc)) |
| Production signatures verify | noble `zip215: true` and `false`, and `node:crypto` (OpenSSL) Ed25519; 2000 random cases plus the RFC keys |
| PDA derivation matches Solana | 4 `create_program_address` vectors from solana-labs/solana `pubkey.rs` (v1.18.26) |
| Stealth scheme = web scheme | `src/interop.test.ts`: every field of the web package's 6 ADR-0017 vectors (`test-vectors/solana-stealth.json`, cross-checked in Python by that package) and of the shared TB-08 vectors (`test-vectors/meta-address-sol-tron-v1.json`, generated by `scripts/gen-meta-address-sol-tron-vectors.mjs` from the web package only), plus 25 random cross-implementation round trips against the web package's source |
| Stealth scheme, independently | regenerated self-generated vectors (`test-vectors/self-generated-v1.json`), recomputed by an independent BigInt + `node:crypto` implementation (`src/reference.testutil.ts`) and a 25-case differential test. No vectors from outside GhostPay exist for this scheme. |
| Negative cases | all 8 torsion points, torsion-mixed points, identity, `y >= p`, `x = 0` with sign bit, zero scalars, `s == v`, `h = 0`, `P = identity`, `x = 0`, codec fuzz (fast-check) |

ATA derivation is only checked for self-consistency (no external ATA vector was available).
