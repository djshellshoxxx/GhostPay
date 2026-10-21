# @ghostpay/btc-silent-payments

BIP-352 **Silent Payments** for GhostPay's Bitcoin tier (docs/MULTICHAIN_SPEC.md section 3) and the Bitcoin
`ChainAdapter`. TypeScript, strict, ESM, no `any`. Built on `@noble/curves`, `@noble/hashes` and `@scure/base`
(Bech32m).

Scope: seller side (keys, `sp1...` / `tsp1...` addresses, labels, `bitcoin:?sp=` URIs), sender-side output
derivation, receiver-side scanning and spend-key derivation, a block scanner over an injected tweak source, and an
adapter. **Not included:** spending / PSBT signing, gRPC, running a node. See `DEVIATIONS.md` for every deviation and
unverified item.

## Verification status

- **BIP-352 official vectors:** 28 test cases = 28 sending + 29 receiving vectors, all pass, including exact
  `priv_key_tweak` and exact BIP-340 signatures (`src/vectors.test.ts`; provenance in `test-vectors/README.md`).
- BIP-350 Bech32m vectors and BIP-32 vectors 1-4 are parsed from the saved BIP texts and pass.
- Not verified: BlindBit against a live oracle; behaviour in any wallet or on a real network.
- `npm run typecheck`, `npm run lint`, `npm test` (coverage thresholds 95/90/95/95). Results are in the hand-off
  report, not hard-coded here.

## Quick tour

```ts
import {
  generateSilentPaymentKeys, silentPaymentAddress, labeledAddress, buildBitcoinUri,
  createSilentPaymentOutputs, scanBlocks, createLabelTable, spendPrivateKey, BlindBitClient,
} from '@ghostpay/btc-silent-payments';

const keys = generateSilentPaymentKeys();                       // CSPRNG, rejection sampling
const address = silentPaymentAddress(keys, 'mainnet');          // sp1q... (116 chars)
const uri = buildBitcoinUri({ address, amountSats: 150_000n }); // bitcoin:?sp=sp1q...&amount=0.0015

// Sender wallet (needs the input private keys):
const outputs = createSilentPaymentOutputs({ inputs, outpoints, recipients: [address], network: 'mainnet' });

// Receiver: only block heights go to the oracle, the scan key stays here.
const source = new BlindBitClient({ baseUrl: 'https://my-oracle.example', fetch });
for await (const hit of scanBlocks({ source, keys: { scanSecret: keys.scanSecret, spendPublicKey: keys.spendPublicKey,
  labels: createLabelTable(keys.scanSecret, [1]) }, fromHeight: 840_000 })) {
  const { privateKey, xOnlyPublicKey } = spendPrivateKey(keys.spendSecret, hit.spendTweak);
}
```

## Modules

| File | Purpose |
|---|---|
| `address.ts`, `bech32m.ts` | `sp`/`tsp` v0 encode/decode, strict validation, v1-30 forward compatibility, v31 reject |
| `keys.ts`, `bip32.ts` | CSPRNG keys; BIP-32 and the `m/352'/coin'/account'/{0',1'}/0` paths |
| `labels.ts` | `B_m = B_spend + hash(b_scan, m) * G`; `m = 0` reserved for change |
| `sender.ts` | input key sum (taproot parity), `input_hash`, grouping by `B_scan`, `k` counters, `K_max` |
| `inputs.ts`, `tx.ts` | eligible input rules (P2TR, P2WPKH, P2SH-P2WPKH, P2PKH), NUMS skip, outpoints, witness parsing |
| `receiver.ts` | tweak data, scanning with labels, spend key with even-y normalization |
| `scan/` | `TweakSource` interface, `InMemoryTweakSource`, `BlindBitClient` (HTTP, see caveats), `scanBlocks` |
| `adapter.ts`, `adapter-types.ts` | Bitcoin `ChainAdapter`; copied interface with a drift test |
| `units.ts`, `uri.ts` | sats <-> BTC decimal strings, `bitcoin:?sp=` builder and strict parser |

## Security notes

- **Not constant-time.** JavaScript offers no constant-time guarantee; zeroization is best-effort. Do signing-grade
  work on trusted devices.
- Secrets are `SecretScalar` values that throw on `JSON.stringify`, `String()`, template strings and `util.inspect`.
  Error messages are fixed strings (no keys, addresses or URIs).
- Randomness is injectable (`rng`) for tests; production uses `crypto.getRandomValues` with rejection sampling.
- The scan secret is never passed to a transport. A test asserts that sources and `fetch` only see block heights.
- Sender: all outputs returned by `createSilentPaymentOutputs` must be in the final transaction; re-derive after any
  input change (RBF). Do not use `SIGHASH_ANYONECANPAY`.
- Fee: Bitcoin has no enforceable protocol fee (`fees` = `not_enforceable`); amounts are `bigint` satoshis.

## Commands

```
npm run typecheck
npm run lint
npm test          # vitest with coverage thresholds 95 / 90 / 95 / 95
npm run build
```
