# @ghostpay/btc-family

Self-contained BIP-352 silent payments engine with pluggable per-chain `ChainParams`.
Research/testnet only. No imports from `@ghostpay/btc-silent-payments` (code adapted from it).

## Chains

| id | HRP | coin type | eligible inputs | status |
|---|---|---|---|---|
| `btc-mainnet` | `sp` | 0 | p2tr, p2wpkh, p2sh-p2wpkh, p2pkh | verified-feasible |
| `btc-testnet` (testnet3/4, signet, regtest) | `tsp` | 1 | same | verified-feasible |
| `ltc-mainnet` | `ltcsp` (experimental) | 2 | p2wpkh, p2sh-p2wpkh, p2pkh | research-only |
| `ltc-testnet` | `tltcsp` (experimental) | 1 | same | research-only |
| `doge-mainnet` | `dogesp` (experimental) | 3 | p2pkh | research-only |
| `bch-mainnet` | `bchsp` (experimental) | 145 | p2pkh | research-only |

WARNING: no silent payment HRP is registered for Litecoin, Dogecoin or Bitcoin Cash. `ltcsp`, `tltcsp`,
`dogesp`, `bchsp` are experimental and not standardised. Experimental MAINNET params are refused for sending
and payment requests (`EXPERIMENTAL_CHAIN`). Dogecoin and Bitcoin Cash have no Taproot, so BIP-352's P2TR
outputs cannot exist there. Litecoin Taproot activation is unverified. See `DEVIATIONS.md`.

## API

```ts
import {
  BITCOIN_TESTNET, LITECOIN_TESTNET, generateKeys, silentPaymentAddress, labeledAddress, changeAddress,
  decodeAddress, createSilentPaymentOutputs, computeTransactionTweak, createLabelTable,
  scanOutputsForTweak, spendPrivateKey, createBtcFamilyAdapter, defineChainParams,
} from '@ghostpay/btc-family';

const keys = generateKeys();
const addr = silentPaymentAddress(LITECOIN_TESTNET, keys);          // tltcsp1q...
decodeAddress(BITCOIN_TESTNET, addr);                                // throws NETWORK_MISMATCH
```

- `generateKeys`, `keysFromSecrets`, `keysFromSeed(params, seed, account)` (path uses `params.coinType`).
- `encodeAddress` / `decodeAddress(params, ...)`; labels (`labeledAddress`, `changeAddress`, `createLabelTable`).
- Sender: `createSilentPaymentOutputs({ chain, inputs: [{ privateKey, type }], outpoints, recipients })`.
- Receiver: `computeTransactionTweak(params, inputs)`, `scanOutputsForTweak`, `scanTransaction`,
  `spendPrivateKey` (even-y normalisation), `scanBlocks` with a `TweakSource`.
- `createBtcFamilyAdapter(params, { source })`: `family: 'bitcoin'`, `chainId: params.id`, all fees `not_enforceable`.
- `defineChainParams` validates custom chains.

## Verification (2026-10-21)

- `npx tsc -p tsconfig.json --noEmit` and `npx eslint --config ../../eslint.config.js src`: clean.
- `npx vitest run --coverage`: 9 files, 161 tests passed. Statements 96.68%, branches 94.14%,
  functions 100%, lines 99.78% (thresholds 95/90/95/95).
- All 28 sending and 29 receiving official BIP-352 vectors pass on the Bitcoin params.
- Cross-chain rejection, LTC/DOGE/BCH round trips (experimental params run as testnet copies), negative
  and fast-check property tests included.

What is NOT verified: see `DEVIATIONS.md` (Litecoin Taproot activation, MWEB, real-network behaviour of
any non-Bitcoin chain, fee/dust rules, sighash rules).
