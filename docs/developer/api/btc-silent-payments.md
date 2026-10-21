# `@ghostpay/btc-silent-payments`

BIP-352 **Silent Payments** for GhostPay's Bitcoin tier (MULTICHAIN_SPEC section 3). Source:
`packages/btc-silent-payments/src/`. Deps: `@noble/curves` 2.4.0, `@noble/hashes` 2.4.0, `@scure/base` 1.2.6,
`@scure/btc-signer` 2.4.1. **Standalone: no other workspace imports it**, the web app and relayer do not use it, and it
depends on no other GhostPay package (it carries its own `SecretScalar`/`CompressedPoint` brands that are *not*
assignable to core-crypto's). Evidence level: all 28 official BIP-352 test cases (28 sending + 29 receiving vectors)
pass per the package README; BlindBit was never run against a real oracle; spending was never accepted by Bitcoin Core
or a network.

The package is not covered by `npm run build:libs`; build it with `npm run build -w @ghostpay/btc-silent-payments`.

## Modules and exports (all re-exported from `index.ts`)

| File | Exports (selected) |
|---|---|
| `address.ts`, `bech32m.ts` | `SilentPaymentNetwork = 'mainnet' \| 'testnet'`, `SilentPaymentAddress`, `encodeSilentPaymentAddress(network, scanPublicKey, spendPublicKey)`, `decodeSilentPaymentAddress(address, expectedNetwork?)`, `bech32mEncode`, `bech32mDecode`, `SP_MAX_LENGTH = 1023` |
| `keys.ts`, `bip32.ts` | `SilentPaymentKeys { scanSecret, spendSecret, scanPublicKey, spendPublicKey }`, `generateSilentPaymentKeys(rng?)`, `silentPaymentKeysFromSecrets`, `silentPaymentKeysFromSeed(seed, { network, account? })`, `bip32Master`, `bip32Child`, `bip32Derive`, `HARDENED_OFFSET` |
| `labels.ts` | `CHANGE_LABEL = 0`, `checkLabel`, `labelTweak`, `labeledSpendPublicKey`, `silentPaymentAddress(keys, network)`, `labeledAddress(keys, network, m)`, `changeAddress(keys, network)`, `createLabelTable(scanSecret, labels?)`, `LabelTable`, `LabelEntry` |
| `sender.ts` | `SenderKey { privateKey, isTaproot }`, `buildSenderContext`, `senderEcdhSharedSecret`, `CreateOutputsParams { inputs, outpoints, recipients, network }`, `createSilentPaymentOutputs(params): SilentPaymentOutput[]` (`recipientIndex`, `xOnlyPublicKey`, `k`) |
| `inputs.ts`, `tx.ts` | `TxInput { txid, vout, scriptSig, witness, prevoutScriptPubKey }`, `Outpoint`, `extractInputPublicKey`, `spendsFutureSegwit`, `serializeOutpoint`, `smallestOutpoint`, `parseWitness`, `txInputFromHex`, `taprootScriptPubKey`, `taprootOutputKey` |
| `receiver.ts` | `ScanKeys { scanSecret, spendPublicKey, labels? }`, `FoundOutput { xOnlyPublicKey, k, label, spendTweak }`, `computeTransactionTweak(inputs)`, `scanOutputsForTweak`, `scanTweakAgainstSet`, `scanTransaction(keys, inputs, outputScripts)`, `spendPrivateKey(spendSecret, spendTweak): { privateKey, xOnlyPublicKey }` |
| `scan/` | `TweakSource` (`getTipHeight`, `getTweaks(height)`, `getOutputs(height)`), `InMemoryTweakSource` (records every call), `BlindBitClient` (HTTP, `BlindBitClientOptions { baseUrl, fetch, allowInsecureLoopback?, timeoutMs?, maxBodyBytes?, maxTipHeight? }`), `scanBlocks({ source, keys, fromHeight, toHeight?, signal?, maxBlocks?, verifier?, seenKeys? })` async generator of `ReceivedOutput` |
| `spend.ts` | `SpendableOutput`, `SpendDestination { address, amountSats? }`, `BuildSpendParams`, `SpendResult { psbt, rawTx, txid, feeSats, vsize, changeSats, changeIndex }`, `buildSpendTransaction`, `estimateKeyPathVsize`, `verifyKeyPathSpend`, `MAX_FEE_RATE_SAT_PER_VB = 10_000` |
| `uri.ts`, `units.ts` | `buildBitcoinUri({ address, amountSats?, label?, message? })`, `parseBitcoinUri(uri, expectedNetwork?)`, `satsToBtcString`, `btcStringToSats`, `SATS_PER_BTC`, `MAX_MONEY_SATS` |
| `adapter.ts`, `adapter-types.ts` | `createBitcoinAdapter({ network, source?, verifier?, seenKeys? })`, `BITCOIN_FEES`, `BitcoinChainAdapter`, `ChainAdapterShape<Invoice, Request, Detected>`, `BitcoinInvoice`, `BitcoinPaymentRequest`, `DetectedBitcoinPayment` |
| `secret.ts`, `rng.ts`, `errors.ts` | `SecretScalar`, `CompressedPoint`, `secretScalarFromBytes`, `unsafeRevealSecret`, `zeroize`, `parseCompressedPoint`, `randomScalar`, `SilentPaymentError { code }` |

`SilentPaymentError` codes: `INVALID_SCALAR`, `INVALID_POINT`, `INVALID_ADDRESS`, `NETWORK_MISMATCH`,
`UNSUPPORTED_VERSION`, `INVALID_LABEL`, `RESERVED_LABEL`, `INVALID_INPUT`, `NO_ELIGIBLE_INPUTS`, `INPUT_SUM_ZERO`,
`INPUT_HASH_INVALID`, `TWEAK_INVALID`, `DERIVED_KEY_INVALID`, `GROUP_LIMIT_EXCEEDED`, `INVALID_SEED`, `DERIVATION_FAILED`,
`INVALID_AMOUNT`, `INVALID_URI`, `CHAIN_MISMATCH`, `RNG_UNAVAILABLE`, `RNG_FAILURE`, `TRANSPORT_FAILURE`,
`INVALID_RESPONSE`, `REORG_DETECTED`, `ABORTED`, `UNSUPPORTED`, `INSUFFICIENT_FUNDS`, `DUST_OUTPUT`, `FEE_TOO_HIGH`,
`SIGNATURE_INVALID`.

Behaviour worth knowing (from `DEVIATIONS.md`): addresses are lowercase only on decode; the change label `m = 0` is
always scanned; v1-30 addresses are read forward-compatibly, v31 rejected; a transaction spending a SegWit v2+ output
is not scanned (`computeTransactionTweak` returns `null`); BIP-32 derivation fails closed (`DERIVATION_FAILED`);
the oracle sees only block heights and your IP, never key material (asserted by tests). Frigate-style hosted scanning
is deliberately not implemented because it sends the scan private key to a server.

## Verified examples

Executed against a `tsc` build of `src/` (no `dist/` in the checkout). Everything is synthetic: random keys, a fake
funding coin, no network.

```ts
import {
  generateSilentPaymentKeys, silentPaymentAddress, labeledAddress, changeAddress, buildBitcoinUri, parseBitcoinUri,
  decodeSilentPaymentAddress, createLabelTable, BITCOIN_FEES, SilentPaymentError,
} from '@ghostpay/btc-silent-payments';

const keys = generateSilentPaymentKeys();                        // CSPRNG, rejection sampling
const address = silentPaymentAddress(keys, 'mainnet');           // 'sp1qq...' (116 chars)
labeledAddress(keys, 'mainnet', 1);                              // label 1 (116 chars)
changeAddress(keys, 'testnet');                                  // 'tsp1qq...' label 0
const uri = buildBitcoinUri({ address, amountSats: 150_000n });  // 'bitcoin:?sp=sp1qq...&amount=0.0015'
parseBitcoinUri(uri).amountSats;                                 // 150000n
decodeSilentPaymentAddress(address).version;                     // 0
createLabelTable(keys.scanSecret, [1]).entries.length;           // 2  (label 1 + the always-present change label 0)
BITCOIN_FEES;   // { checkout: 'not_enforceable', gasSponsorship: 'not_enforceable', flatSecurity: 'not_enforceable' }
try { decodeSilentPaymentAddress(address.toUpperCase()); } catch (e) { e instanceof SilentPaymentError; /* 'INVALID_ADDRESS' */ }
```

Sender, receiver, block scan and spend in one run:

```ts
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { concatBytes } from '@noble/hashes/utils.js';
import {
  generateSilentPaymentKeys, silentPaymentAddress, secretScalarFromBytes, createSilentPaymentOutputs,
  scanTransaction, spendPrivateKey, buildSpendTransaction, computeTransactionTweak, taprootScriptPubKey,
  InMemoryTweakSource, scanBlocks, createLabelTable,
} from '@ghostpay/btc-silent-payments';

const receiver = generateSilentPaymentKeys();
const address = silentPaymentAddress(receiver, 'mainnet');

// Sender wallet: one P2WPKH input it controls (synthetic)
const sk = secp256k1.utils.randomSecretKey();
const pub = secp256k1.getPublicKey(sk, true);
const txid = 'ab'.repeat(32);
const input = { txid, vout: 0, scriptSig: new Uint8Array(0), witness: [new Uint8Array(71).fill(1), pub],
                prevoutScriptPubKey: concatBytes(Uint8Array.of(0, 0x14), ripemd160(sha256(pub))) };
const outputs = createSilentPaymentOutputs({
  inputs: [{ privateKey: secretScalarFromBytes(sk), isTaproot: false }],
  outpoints: [{ txid, vout: 0 }], recipients: [address], network: 'mainnet',
});                                                             // [{ recipientIndex: 0, k: 0, xOnlyPublicKey: Uint8Array(32) }]
// every returned output MUST be in the final transaction; re-derive after any input change (RBF)

// Receiver: scan one transaction ...
const found = scanTransaction({ scanSecret: receiver.scanSecret, spendPublicKey: receiver.spendPublicKey },
                              [input], outputs.map((o) => taprootScriptPubKey(o.xOnlyPublicKey)));
const { xOnlyPublicKey } = spendPrivateKey(receiver.spendSecret, found[0].spendTweak);   // equals found[0].xOnlyPublicKey

// ... or scan blocks from a TweakSource (BlindBitClient in production; only heights leave the machine)
const tweak = computeTransactionTweak([input])!;
const blockHash = 'ee'.repeat(32);
const source = new InMemoryTweakSource([{
  tweaks: { height: 100, blockHash, tweaks: [tweak.tweak] },
  outputs: { height: 100, blockHash, outputs: [{ xOnlyPublicKey: outputs[0].xOnlyPublicKey, txid: 'cd'.repeat(32), vout: 0, amountSats: 100_000n }] },
}]);
for await (const hit of scanBlocks({ source, keys: { scanSecret: receiver.scanSecret, spendPublicKey: receiver.spendPublicKey,
                                     labels: createLabelTable(receiver.scanSecret, [1]) }, fromHeight: 100 })) {
  hit.height; hit.amountSats; hit.verified;   // 100, 100000n, false (no OutputVerifier supplied)
}

// Spend (software key, key-path, SIGHASH_DEFAULT): one destination with no amount = sweep
const r = buildSpendTransaction({
  outputs: [{ txid: 'cd'.repeat(32), vout: 0, amountSats: 100_000n, xOnlyPublicKey: found[0].xOnlyPublicKey, spendTweak: found[0].spendTweak }],
  spendSecret: receiver.spendSecret,
  destinations: [{ address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4' }],   // BIP-173 example address
  feeRate: 4.5, network: 'mainnet',
});
[r.feeSats, r.vsize, r.changeSats];   // [446n, 99, 0n]   fee = ceil(4.5 * 99)
```

## Pitfalls

- Sweeping needs `changeAddress` unless exactly one destination has no `amountSats`; a leftover above dust with no
  change address is refused rather than burned. Change below the dust limit (default 546) is folded into the fee.
- `scanBlocks` flags an output key it has already reported (across the call, and across calls if you persist `seenKeys`) as
  `duplicateKey: true`: a BIP-352 output key cannot legitimately recur, so flagged results must not be trusted, and the first
  sighting is not proven genuine either. Without an `OutputVerifier` every result has `verified: false`: show txid/vout/amount
  as *claimed* (no verifier ships; NC-03/TS-02).
- `scanBlocks` refuses ranges longer than `maxBlocks` (default 200 000) and fails with `REORG_DETECTED` if tweak and
  output data disagree on height or hash. It does not track reorgs across blocks or persist progress.
- BlindBit HTTP routes for block data are deprecated upstream (gRPC is the successor and is not implemented). `txid`
  byte order in `/utxos` is unverified (`DEVIATIONS.md`).
- Hardware wallets, coin selection, regtest (`bcrt`) and script-path spends are out of scope.
- Not constant-time; zeroization is best effort.

Using it behind the GhostPay adapter interface and the follow-up needed in `chain-adapters`: [extending.md](../extending.md).
Tests: `vectors.test.ts` (official vectors), `spend-vectors.test.ts`, `roundtrip.test.ts`, `scan/*.test.ts`,
`adapter-types.test.ts` (drift test against `chain-adapters/src/adapter.ts`). Provenance of the vectors:
`packages/btc-silent-payments/test-vectors/README.md`.
