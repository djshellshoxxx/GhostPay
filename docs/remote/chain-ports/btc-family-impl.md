# btc-family implementation notes

**Package:** `packages/btc-family` (`@ghostpay/btc-family`). Companion to `btc-family.md` (research). Date: 2026-10-21.
**Status:** research implementation. Not integrated; nothing enabled in `chains` config.

## What exists

A self-contained BIP-352 engine (no import from `@ghostpay/btc-silent-payments`; ecc, secret scalar brand, labels,
sender, receiver, input eligibility, BIP-32 paths adapted) parameterised by `ChainParams { id, name, spHrp, coinType,
eligibleInputTypes, segwit, status, network, experimental, notes }`, plus `createBtcFamilyAdapter(params, deps)`
with a local copy of the `ChainAdapter` shape (`family: 'bitcoin'`, `chainId` = `params.id`, fees all `not_enforceable`).

## Verdicts, checked against primary sources (raw.githubusercontent.com)

| Chain | Result | Evidence |
|---|---|---|
| Bitcoin (`sp`, `tsp`) | verified-feasible | official 28+29 BIP-352 vectors pass through this package |
| Litecoin | research-only | SegWit + HRPs `ltc`/`tltc`/`rltc` confirmed; Taproot only a BIP9 deployment definition, activation not verified; `p2tr` excluded from eligible inputs |
| Dogecoin | research-only | SegWit deployment `nTimeout = 0` ("Disabled"), no bech32, no Taproot; P2PKH only, P2TR outputs impossible |
| Bitcoin Cash | research-only | no witness deployments in `chainparams.cpp`; P2PKH only, P2TR outputs impossible |

HRPs `ltcsp`, `tltcsp`, `dogesp`, `bchsp` are EXPERIMENTAL and NOT standardised (no registered silent payment HRP exists).
They match the proposals in `btc-family.md`. Experimental mainnet params throw `EXPERIMENTAL_CHAIN` in
`createSilentPaymentOutputs` and `buildPaymentRequest`; there is no override.

## Alignment with btc-family.md

- Same HRP proposals, same coin types (LTC 2, DOGE 3, BCH 145, testnets 1), same fee cap (all `not_enforceable`, `feeAmount = 0n`).
- Cross-chain rejection (research Gate 3) is implemented and tested for every pair of built-in HRPs.
- Difference: the research document's "scheme B" (P2PKH outputs for DOGE/BCH) is NOT implemented. The engine keeps BIP-352's P2TR
  outputs, so DOGE/BCH params describe an engine configuration only and cannot be deployed. Family value stays `'bitcoin'`; the
  proposed `'utxo'` family is left to the chain-adapters owner.
- Litecoin Gate 0 (Taproot active on a node) remains open.

## Test evidence (2026-10-21)

`npx vitest run --coverage` in `packages/btc-family`: 9 files, 161 tests passed; statements 96.68%, branches 94.14%,
functions 100%, lines 99.78% (thresholds 95/90/95/95). `tsc --noEmit` and eslint clean.

## Not verified

Litecoin Taproot activation and MWEB interaction; any real-network behaviour for LTC/DOGE/BCH; their dust/fee/unit rules;
BCH sighash; existence of sender wallets or indexers; security of any non-BIP-352 scheme. See `packages/btc-family/DEVIATIONS.md`.
