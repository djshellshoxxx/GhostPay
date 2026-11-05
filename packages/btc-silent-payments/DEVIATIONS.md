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

## Security statements

- JavaScript gives **no constant-time guarantee**: bigint arithmetic and noble point multiplication branch on secret
  data. Zeroization (`zeroize`) is best-effort: engines copy buffers and bigints are immutable and unwipeable.
  Run signing-related code on trusted devices only.
- Secrets use the redacting `SecretScalar` wrapper (a small copy of the core-crypto pattern). Errors use fixed
  messages and never embed keys, addresses or URIs.
- Keys come from rejection sampling in [1, n-1]; zero, out-of-range, off-curve, infinity points and zero tweaks are
  rejected everywhere.

## Out of scope / follow-ups

- **Hardware signers: interface and software reference only (2026-10-25, spec 11).** `SilentPaymentSigner` +
  `buildSpendTransactionWithSigner` keep `b_spend` out of the host; `SoftwareSilentPaymentSigner` enforces the checks a
  device must (input key = `b_spend + tweak` for the claimed key and amount, SIGHASH_DEFAULT only, no foreign inputs,
  silent-payment outputs re-derived from its own keys, outputs it cannot display refused, confirmation required).
  **Not implemented:** any real device driver or vendor protocol; no device has been tested. The host cannot verify an
  ECDH share by itself (no BIP-374 DLEQ proof): a faulty signer that returns a wrong share AND skips its own
  re-derivation at signing would pay unfindable outputs. An output whose silent-payment nature is not declared is shown
  as its raw `bc1p`/`tb1p` address. Change to the wallet's own label-0 address is displayed, not proven to be own change
  (that would need the scan key on the device). The web view uses the software signer.
- Spending covers P2TR key-path spends of detected silent-payment outputs only. Not implemented: coin selection (the
  caller picks the outputs; all are swept), SIGHASH types other than DEFAULT, multi-party/PSBT combining of foreign
  inputs, Taproot script-path spends, regtest (`bcrt`) addresses (`@scure/btc-signer` ships mainnet and testnet `tb`
  parameters only; `testnet` here means `tb`/`tsp`), fee estimation from a node/mempool (the caller supplies the
  feerate; capped at 10 000 sat/vB), output shuffling (destinations then change, in order), anti-fee-sniping locktime.
- gRPC BlindBit client; `/filter` support; own-node (`bitcoind`) `TweakSource`; Web Worker scanning.
- **Header chain (2026-10-25, spec 12).** `HeaderChain` mirrors Core `GetNextWorkRequired` /
  `ContextualCheckBlockHeader` for mainnet, testnet4 (BIP-94), signet and regtest: linkage, PoW vs own nBits and
  powLimit, exact required nBits (retarget + 4x clamp, testnet min-difficulty walk-back, BIP-94 first-block bits and
  timewarp), MTP-11, +2 h future limit, BIP-34/66/65 versions; most cumulative work wins (strictly more). Evidence:
  Core `pow_tests.cpp` retarget vectors and real mainnet headers 0-2, plus mined regtest-style chains. **Not covered:**
  block contents beyond what `verifyBlockTransactions` binds, signet block signatures, Core checkpoints/assumevalid,
  anything below the caller's pinned checkpoint (which must sit on a 2016-block boundary), withheld heavier chains
  (ask several sources), and cheap test-network PoW. Checkpoints for testnet4/signet are not pinned in this repo, so the
  web view does not use `HeaderChain` yet (it keeps per-block PoW/Merkle/witness checks and height linkage).
- **Witness binding (2026-10-25).** `parseRawTransaction` (txid/wtxid, strict BIP-144) and `verifyWitnessCommitment`
  (Core `CheckWitnessMalleation`: last matching commitment output, 32-byte reserved value, no witness without a
  commitment). Prevout scripts/amounts remain unbound (earlier blocks); a lying server can hide, not forge, payments.
- **Scan state (2026-10-25).** `ScanState` (birth height, last height/hash, 100-block reorg window, matches with
  `confirmed`/`pending`), `reconcileScanState`, `resumeScan` (progress after every block), strict JSON. It holds no
  secret but is private; `ScanStateStore` implementations must encrypt at rest. **Not implemented:** an encrypted
  IndexedDB store and its use in the web view.
- Voluntary tip output; hosted scanning service (mode C: absent, would need an ADR).
- Dependencies: `@scure/base@1.2.6`, devDependency `@scure/bip32@1.7.0` and (2026-10-21) `@scure/btc-signer@2.4.1`
  (exact; its dependencies are `@noble/curves` 2.4.0 and `@noble/hashes` 2.4.0, identical to this package's pins and
  hoisted as one copy; it nests its own `@scure/base` 2.4.0 and `micro-packed` 0.11.1, so two `@scure/base` majors exist
  in the tree and are not interchangeable at runtime boundaries, which this package keeps separate). Lockfile updated.
- The Bitshala `silent-pay` differential reference (MULTICHAIN_SPEC 3.4) was **not** used (not installed); the
  differential coverage here is the official vectors plus `@scure/bip32` for BIP-32 paths.
