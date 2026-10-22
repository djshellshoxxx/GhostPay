# @ghostpay/chain-solana

Dual-key ed25519 stealth addresses for Solana (Monero-style): derive, scan, spend, raw-scalar signing,
announcement codec, PDA / associated-token-account derivation, and a `ChainAdapter`-shaped skeleton.

**Status: testnet proof of concept. Not audited. No RPC code, no on-chain program, no transaction
building.** Only `sol-devnet` and `sol-testnet` are accepted by the adapter. Spec and research:
`docs/remote/chain-ports/solana.md`; what was actually built and how it differs:
`docs/remote/chain-ports/solana-impl.md` and [DEVIATIONS.md](./DEVIATIONS.md).

Runtime dependencies (exact pins): `@noble/curves` 2.4.0, `@noble/hashes` 2.4.0, `@scure/base` 1.2.6.

## Scheme (v1)

Notation: `B` ed25519 base point, `L` its prime order, scalars are 32-byte little-endian in `[1, L-1]`,
`enc(P)` the 32-byte RFC 8032 point encoding, `H(tag, ...) = SHA-512(u8(len(tag)) || tag || ...)`.

| Step | Formula |
|---|---|
| Keys | `s, v` uniform in `[1, L-1]`, `s != v`; `S = s·B`, `V = v·B` |
| Meta-address | `gpsol:` + base58check(`0x01 || enc(S) || enc(V)`) (65-byte payload; checksum = first 4 bytes of double SHA-256) |
| Sender | `r` uniform; `R = r·B`; `K = [8](r·V)`; `h = H("GhostPay/solana-stealth/v1/tweak", enc(K), enc(R), enc(S)) mod L`, reject 0; `view_tag = H("GhostPay/solana-stealth/v1/view-tag", enc(K))[0]`; `P = S + h·B`, reject identity; address = base58(enc(P)) |
| Receiver | `K = [8](v·R)`; compare view tag; recompute `P`; compare with the funded account |
| Spend | `x = s + h mod L`, reject 0, check `x·B == P` |
| Sign | RFC 8032 with the raw scalar `x`; nonce prefix = `H("GhostPay/solana-stealth/v1/nonce-prefix", LE32(x), enc(P))[0..32]` |

Every point decoded from input (S, V, R) must be canonical (`y < p`, no `x = 0` with sign bit), not the
identity, and torsion-free; all 8 small-order points and every torsion-mixed point are rejected.

## Announcement

Binary (announcer-program event data):

```
offset 0      1 byte   version = 0x01
offset 1     32 bytes  enc(R)
offset 33     1 byte   view_tag
offset 34   0..256     opaque metadata (rest of the payload, no length field)
```

SPL Memo form (the Memo program requires UTF-8): `gpst1:` + base64url-without-padding(binary).
Decoders are strict: exact length bounds (34..290 bytes), version 1, valid prime-order `R`,
canonical base64url that re-encodes identically.

## API sketch

```ts
import {
  generateStealthKeys, encodeMetaAddress, deriveStealthPayment, decodeAnnouncementMemo,
  checkAnnouncement, deriveStealthSpendScalar, signWithScalar, getAssociatedTokenAddress,
} from '@ghostpay/chain-solana';

const keys = generateStealthKeys();                     // seller, offline
const meta = encodeMetaAddress(keys);                   // "gpsol:..."
const pay = deriveStealthPayment(meta);                 // payer: pay.stealthAddress, pay.announcement
const ata = getAssociatedTokenAddress(pay.stealthAddress, mint); // SPL destination
const hit = checkAnnouncement(decodeAnnouncementMemo(memo), keys.viewSecret, keys.spendPublicKey, fundedAddress);
const x = deriveStealthSpendScalar(keys.spendSecret, hit!.tweak, hit!.stealthPublicKey);
const sig = signWithScalar(x, serializedTxMessage, hit!.stealthPublicKey);
```

`createSolanaAdapter({ chainId: 'sol-devnet', source })` returns an object with the six
`ChainAdapter` members; `scan` reads an injected `AnnouncementSource` (no RPC here) and skips
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
| Stealth scheme | **self-generated** vectors (`test-vectors/self-generated-v1.json`), recomputed by an independent BigInt + `node:crypto` implementation (`src/reference.testutil.ts`) and a 25-case differential test. No external vectors exist for this scheme. |
| Negative cases | all 8 torsion points, torsion-mixed points, identity, `y >= p`, `x = 0` with sign bit, zero scalars, `s == v`, `h = 0`, `P = identity`, `x = 0`, codec fuzz (fast-check) |

ATA derivation is only checked for self-consistency (no external ATA vector was available).
