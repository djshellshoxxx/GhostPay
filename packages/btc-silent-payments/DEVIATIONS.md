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

## BlindBit oracle and Frigate: what is verified and what is not

Primary sources, all retrieved 2026-10-21:

- `https://raw.githubusercontent.com/setavenger/BlindBit-Oracle/master/README.md` ("Available HTTP Endpoints", "Client Discovery")
- `https://raw.githubusercontent.com/setavenger/BlindBit-Oracle/master/internal/server/README.md` (HTTP API specification)
- `https://raw.githubusercontent.com/sparrowwallet/frigate/master/README.md`
- `https://raw.githubusercontent.com/silent-payments/BIP0352-index-server-specification/main/README.md`

BlindBit-Oracle (v2 docs; v1 endpoints are declared incompatible):

- **Verified, implemented:** `GET /info` (the only HTTP route still **supported**; JSON `network`, `height`,
  `tweaks_only`, `tweaks_full_basic`, `tweaks_full_with_dust_filter`, `tweaks_cut_through_with_dust_filter`;
  `getTipHeight` and `getInfo`), `GET /tweaks/:blockheight` (`{block_identifier:{block_hash,block_height}, index:[33-byte hex]}`),
  `GET /utxos/:blockheight` (`{block_identifier, index:[{txid,vout,pubkey,amount}]}`).
- **Verified, deliberately not implemented:** `GET /spent-outputs/:h`, `GET /compute-index/:h`, `GET /full-block/:h`
  (all marked **deprecated**; the README says new clients should use the gRPC `OracleService`: `GetInfo`,
  `StreamComputeIndex`, `StreamBlockScanDataShort`, `GetFullBlock`, protobufs in `blindbit-lib`). `/tweaks` and `/utxos`
  are deprecated too; expect all block-data HTTP routes to disappear. **gRPC is not implemented.**
- The v1 `/filter` endpoints are not documented for v2: not implemented, nothing guessed.
- **Not specified by the docs (unverified):** whether `/utxos` omits already-spent outputs, dust filtering semantics per
  storage flag (the docs only say `tweaks_full_basic` = "no dust"), and txid byte order in `/utxos`. The only byte-order
  statement is for `spent_outpoints` of the deprecated full-block route ("reversed"). The client treats `txid` as
  display-order hex: **unverified**. `getInfo` does not enforce that `network` matches the wallet network (the set of
  network strings is undocumented); callers should compare it themselves.
- The client was **never run against a real oracle**; tests use an injected fake `fetch`.

Frigate (Sparrow) / Electrum Silent Payments protocol:

- Frigate is an Electrum server doing **server-side** scanning with **ephemeral client keys**
  (`blockchain.silentpayments.subscribe`, per the Frigate README pacing section and the index-server spec table:
  `subscribe`, `unsubscribe`). The spec signature is `subscribe(scan_private_key, spend_public_key, start)`.
  The Frigate README does not document the wire format beyond that, and the spec's notification payload was not read to
  the level needed for an implementation.
- **Not implemented, by design:** this protocol sends the **scan private key** to the server. That contradicts this
  package's invariant that key material never reaches a transport (tested). A hosted scanner is a separate trust
  decision (and, per MULTICHAIN_SPEC, hosted scanning is out of scope). Nothing here is claimed about Frigate behaviour.

- Light-client privacy: the oracle operator sees which block heights are scanned (and the client IP). It never
  receives key material, which the tests assert (`blindbit.test.ts`, `scanner.test.ts`, `adapter.test.ts`).
  `TweakSource` is the generic seam for an own-node or other index.

## Spending (BIP-352 spend path)

- Per input: `d = b_spend + tweak`, negated if `d*G` has odd y (`spendPrivateKey`); the tweak from the scanner already
  includes the label tweak, so labeled outputs and change (m = 0) spend the same way. The key is used **without** a BIP-341
  taproot tweak (the silent-payment output key is final), so `@scure/btc-signer`'s own `tapInternalKey` signing path is
  NOT used: the key-path BIP-341 sighash (`preimageWitnessV1`, SIGHASH_DEFAULT) is signed with noble BIP-340 and set as
  `tapKeySig`; the signer finalizes and extracts.
- Self-check before returning: independent noble `schnorr.verify` of every input against the output key (also exported as
  `verifyKeyPathSpend`), and exact vsize == estimate. The wallet key is checked against the claimed output key first.
- Verification evidence: all official BIP-352 receiving vectors that have outputs are swept in `spend-vectors.test.ts`
  (labels included) and verify; `spend.test.ts` covers both parities, multi-tx multi-label sweeps, fee math, change
  (regular address and derived silent-payment change, re-scanned and re-spent), silent-payment destinations, dust and
  error paths. **Not verified:** acceptance by Bitcoin Core (`testmempoolaccept`) or any network; no signet broadcast.
- Fee policy: `fee = ceil(feerate * vsize)`; change below the dust limit (default 546) is folded into the fee; a leftover
  larger than that without a change address is refused instead of burned.

## Audit fixes (TS-01, TS-02, TS-04), 2026-10-21

- **TS-01 fixed.** `scanBlocks` indexes block outputs by x-only key to a LIST and yields every output with a matching
  key (flag `duplicateKey: true` when more than one), instead of silently keeping the last. Callers must not assume the
  first is the real one; with BlindBit `/tweaks` carrying no txid, only `verifier` can tie an output to its transaction.
- **TS-02 mitigated, not solved.** Oracle data stays untrusted: every `ReceivedOutput` has `verified: false` unless the
  optional `verifier` (own node `getrawtransaction` or a second oracle; the caller implements it) returned true; outputs
  failing it are dropped. A repeated `(txid, vout)` across heights is reported once. An oracle can still omit tweaks
  (silently missing payments) and the `/utxos` txid byte order is still undocumented. No verifier implementation ships.
- **TS-04 fixed.** `BlindBitClient`: `https` only (`http` for loopback hosts only with `allowInsecureLoopback`; a
  behaviour change for tests/local oracles), per-request timeout (15 s), streamed body cap (8 MiB) when the transport
  exposes `Response.body`/`headers` (the structural `FetchResponseLike` falls back to `json()` otherwise, where the cap
  cannot apply before parsing), tip height bounded (`maxTipHeight`, default 10 000 000). `scanBlocks` refuses ranges above
  `maxBlocks` (default 200 000) before requesting any block. The client now always passes its own `AbortSignal` (linked to
  the caller's) to the transport.

## Security statements

- JavaScript gives **no constant-time guarantee**: bigint arithmetic and noble point multiplication branch on secret
  data. Zeroization (`zeroize`) is best-effort: engines copy buffers and bigints are immutable and unwipeable.
  Run signing-related code on trusted devices only.
- Secrets use the redacting `SecretScalar` wrapper (a small copy of the core-crypto pattern). Errors use fixed
  messages and never embed keys, addresses or URIs.
- Keys come from rejection sampling in [1, n-1]; zero, out-of-range, off-curve, infinity points and zero tweaks are
  rejected everywhere.

## Out of scope / follow-ups

- **Hardware-wallet signing is out of scope.** Spending is software signing only (`buildSpendTransaction`), on a
  trusted device. No device protocol (and no device displays or verifies silent-payment outputs) is implemented.
- Spending covers P2TR key-path spends of detected silent-payment outputs only. Not implemented: coin selection (the
  caller picks the outputs; all are swept), SIGHASH types other than DEFAULT, multi-party/PSBT combining of foreign
  inputs, Taproot script-path spends, regtest (`bcrt`) addresses (`@scure/btc-signer` ships mainnet and testnet `tb`
  parameters only; `testnet` here means `tb`/`tsp`), fee estimation from a node/mempool (the caller supplies the
  feerate; capped at 10 000 sat/vB), output shuffling (destinations then change, in order), anti-fee-sniping locktime.
- gRPC BlindBit client; `/filter` support; own-node (`bitcoind`) `TweakSource`; reorg tracking across blocks
  (only a per-block height/hash consistency check exists); persistence of scan progress.
- Voluntary tip output; hosted scanning service; hardware wallet support (unsupported in v1 per spec).
- Dependencies: `@scure/base@1.2.6`, devDependency `@scure/bip32@1.7.0` and (2026-10-21) `@scure/btc-signer@2.4.1`
  (exact; its dependencies are `@noble/curves` 2.4.0 and `@noble/hashes` 2.4.0, identical to this package's pins and
  hoisted as one copy; it nests its own `@scure/base` 2.4.0 and `micro-packed` 0.11.1, so two `@scure/base` majors exist
  in the tree and are not interchangeable at runtime boundaries, which this package keeps separate). Lockfile updated.
- The Bitshala `silent-pay` differential reference (MULTICHAIN_SPEC 3.4) was **not** used (not installed); the
  differential coverage here is the official vectors plus `@scure/bip32` for BIP-32 paths.

## Audit round 3 (NC-03), 2026-10-21

- **NC-03 fixed (mitigated).** `scanBlocks` now de-duplicates by x-only key across the whole call (and across calls
  when the caller persists `seenKeys`): a key seen at an earlier height is still yielded but flagged
  `duplicateKey: true`, because a BIP-352 output key cannot legitimately recur. Flagged results must not be trusted;
  the first sighting is NOT proven genuine either. `BitcoinAdapterDeps` gains `verifier` and `seenKeys`. Without a
  `verifier` every adapter result stays `verified: false`: show txid/vout/amount as claimed. No verifier ships.
