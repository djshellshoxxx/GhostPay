# Deviations, discrepancies and unverified items (btc-silent-payments)

Status (2026-10-21): **all 28 official BIP-352 test cases pass (28 sending + 29 receiving vectors)**, including the
exact priv_key_tweak values and the exact BIP-340 signatures (aux-randomness variant) for every found output.
See `test-vectors/README.md` for provenance.

## Intentional differences from the BIP text / reference code

| # | BIP-352 / reference | This package | Reason |
|---|---------------------|--------------|--------|
| 1 | Bech32m (BIP-350) permits all-uppercase strings | `decodeSilentPaymentAddress` accepts lowercase only | strict input; QR-uppercase can be lowercased by the caller. Encoding is always lowercase |
| 2 | A version 1-30 address may be longer than v0; the first 66 bytes are read | Implemented. The data part must still be a whole number of bytes with zero padding (BIP-173 conversion rules) | forward compatibility without accepting malformed padding |
| 3 | Reference scanner checks labels only if the wallet lists them | The change label `m = 0` is **always** scanned | BIP-352 "Scanning" says to always check it |
| 4 | Reference label check: `output - P_k` then negated output | Checks `x(P_k + label*G)` against the output set | equivalent (x-only equality covers both parities) and O(labels) per k instead of O(outputs) |
| 5 | P2SH-P2WPKH: reference only checks the shape of the redeem script | Also requires `HASH160(redeem script)` = spent script hash and `scriptSig` length 23 | stricter; always true for confirmed transactions |
| 6 | Transactions spending a SegWit v2+ output "MUST NOT be scanned" (BIP text); the reference code does not implement it | Implemented in `computeTransactionTweak` (returns `null`) | follows the BIP text; covered by own tests, not by an official vector |
| 7 | BIP-32: if a derived key is invalid, continue with the next index | `bip32Child` throws `DERIVATION_FAILED` | fail closed (probability ~2^-127); never silently derive a different path |
| 8 | Witness serialization in vectors | `parseWitness` additionally rejects non-canonical compact sizes and trailing bytes | hostile input hardening |
| 9 | `shared_secrets` / `input_private_key_sum` are only test outputs | Exposed via `buildSenderContext` / `senderEcdhSharedSecret` / `receiverEcdhSharedSecret` | needed to assert the vectors; documented `@security` |
| 10 | BIP-352 does not fix BIP-32 `coin_type` | `mainnet` -> `0'`, `testnet` -> `1'` | BIP-44 convention; seed derivation is optional in the BIP ("wallets MAY use BIP32") and verified against the BIP-32 vectors and `@scure/bip32` |

## Deviations from MULTICHAIN_SPEC / chain-adapters

- **`ChainAdapter` is EVM-shaped.** `packages/chain-adapters/src/adapter.ts` requires `PaymentRequest.router`,
  `feeRecipient`, `build()` and `DetectedPayment.stealthAddress/announcement/...` and takes `ValidatedInvoice =
  Invoice` (numeric EVM `chainId`). A Bitcoin adapter cannot satisfy those structurally. `src/adapter-types.ts`
  copies the contract, keeps all member **names** of `ChainAdapter`, `RecipientAddress`, `FeeCapability`,
  `ScanRange`, `RequestOptions`, `ChainFamily`, `FeeStatus` identical (enforced by `adapter-types.test.ts`, which
  parses the TypeScript source of the real file) and defines `BitcoinPaymentRequest`, `BitcoinInvoice`,
  `DetectedBitcoinPayment`. **Follow-up for chain-adapters:** make `PaymentRequest`/`DetectedPayment`/invoice
  discriminated unions on `family`, or make `ChainAdapter` generic as `ChainAdapterShape` here.
- `SecretScalar` / `CompressedPoint` are this package's own branded types (brands are module-private `unique symbol`s,
  so they are not assignable to core-crypto's). Converting at the boundary is a follow-up when the packages are wired.
- `ViewCapability` gains an optional `labels` array (Bitcoin only).
- **Fee capability "none"** (MULTICHAIN_SPEC section 4) is expressed as `not_enforceable` on every line of the
  shared `FeeStatus` vocabulary (there is no literal `none`). `buildPaymentRequest` always returns `feeAmount = 0n`
  and `grossAmount = netAmount`. A voluntary tip output is not implemented.
- `scan` heights are `bigint` in `ScanRange` and must fit in uint32.

## BlindBit oracle: what is verified and what is not

Source: `https://raw.githubusercontent.com/setavenger/BlindBit-Oracle/master/README.md` and
`internal/server/README.md`, read 2026-10-21 (v2 documentation).

- **Verified from the docs:** `GET /info` (supported; JSON with `height`), `GET /tweaks/:blockheight`
  (`{block_identifier:{block_hash,block_height}, index:[33-byte hex]}`), `GET /utxos/:blockheight`
  (`{block_identifier, index:[{txid,vout,pubkey,amount}]}`). `BlindBitClient` implements exactly these three.
- The same documents mark `/tweaks` and `/utxos` **DEPRECATED** in favour of gRPC (`OracleService`, protobuf in
  `blindbit-lib`). **gRPC is not implemented.** Expect these HTTP routes to disappear.
- **Unverified / not implemented:** the `/filter` endpoints (v1 oracle; not documented for v2), which would let a
  client avoid downloading all outputs. Nothing is guessed. Whether `/utxos` returns outputs that were already
  spent in the same block, whether it applies dust filtering (`tweaks_full_with_dust_filter`) and the precise txid
  byte order are **not specified** in the docs; the client treats `txid` as display-order hex, which is unverified.
- The client was **never run against a real oracle**. Tests use an injected fake `fetch`. Treat the BlindBit client
  as unverified until a live signet/regtest oracle test is recorded.
- Light-client privacy: the oracle operator sees which block heights are scanned (and the client IP). It never
  receives key material, which the tests assert (`blindbit.test.ts`, `scanner.test.ts`, `adapter.test.ts`).
  `TweakSource` is the generic seam for an own-node or other index.

## Security statements

- JavaScript gives **no constant-time guarantee**: bigint arithmetic and noble point multiplication branch on secret
  data. Zeroization (`zeroize`) is best-effort: engines copy buffers and bigints are immutable and unwipeable.
  Run signing-related code on trusted devices only.
- Secrets use the redacting `SecretScalar` wrapper (a small copy of the core-crypto pattern). Errors use fixed
  messages and never embed keys, addresses or URIs.
- Keys come from rejection sampling in [1, n-1]; zero, out-of-range, off-curve, infinity points and zero tweaks are
  rejected everywhere.

## Out of scope / follow-ups

- **Spending / PSBT signing** (`@scure/btc-signer` is not installed): only the parity-normalized spend key
  (`spendPrivateKey`) is provided; tests prove a BIP-340 signature with it verifies against the output key.
- gRPC BlindBit client; `/filter` support; own-node (`bitcoind`) `TweakSource`; reorg tracking across blocks
  (only a per-block height/hash consistency check exists); persistence of scan progress.
- Voluntary tip output; hosted scanning service; hardware wallet support (unsupported in v1 per spec).
- `package-lock.json` was not regenerated (no `npm install` was run). New declared dependencies:
  `@scure/base@1.2.6` (already installed at the root via viem) and devDependency `@scure/bip32@1.7.0`
  (differential test only; already installed at the root). Run `npm install` once when the workspace is free.
- The Bitshala `silent-pay` differential reference (MULTICHAIN_SPEC 3.4) was **not** used (not installed); the
  differential coverage here is the official vectors plus `@scure/bip32` for BIP-32 paths.
