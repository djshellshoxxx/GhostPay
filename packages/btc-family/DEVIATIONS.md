# Deviations and open items: @ghostpay/btc-family

Status: research port. Not wired into `chain-adapters`, not published, not for mainnet funds.
Numbers below come from runs on 2026-10-21 (`npx vitest run --coverage`): 9 test files, 161 tests,
coverage statements 96.68%, branches 94.14%, functions 100%, lines 99.78% (thresholds 95/90/95/95
in `vitest.config.ts`, unchanged).

## What was verified, and against what

| Claim | Source | Result |
|---|---|---|
| BIP-352 engine is correct for Bitcoin | official `send_and_receive_test_vectors.json`, read read-only from `../btc-silent-payments/test-vectors/` | 28 sending and 29 receiving vectors pass through this package's own code (`src/vectors.test.ts`, 58 tests). Includes label, taproot-parity, multi-input and K_max cases |
| BIP-32 derivation | BIP-32 test vectors 1 to 4 from `../btc-silent-payments/test-vectors/bip-0032.mediawiki` | all chain steps match |
| Bitcoin segwit HRPs `bc`/`tb`/`bcrt` | `bitcoin/bitcoin` `src/kernel/chainparams.cpp` (raw.githubusercontent.com) | confirmed. Note regtest segwit HRP is `bcrt` but the silent payment HRP for every test network is `tsp` (BIP-352) |
| Litecoin segwit HRPs `ltc`/`tltc`/`rltc`, SegWit active, coin type 2 | `litecoin-project/litecoin` `src/chainparams.cpp`; SLIP-44 | confirmed |
| Litecoin Taproot | same file: BIP9 `DEPLOYMENT_TAPROOT` (bit 2, mainnet start height 2161152, timeout 2370816; always-active on regtest only) | a deployment definition is NOT proof of activation. Not verified, so `p2tr` is not an eligible Litecoin input and Litecoin is `research-only` |
| Dogecoin has no SegWit/Taproot/bech32 | `dogecoin/dogecoin` `src/chainparams.cpp`: SegWit deployment with `nTimeout = 0` ("Disabled"), no `bech32_hrp`, no taproot | confirmed (reading of "Disabled" is an inference). Coin type 3 per SLIP-44 |
| Bitcoin Cash has no SegWit/Taproot | `bitcoin-cash-node` `src/chainparams.cpp`: only base58 and cashaddr (`bitcoincash`, `bchtest`, `bchreg`), no witness deployments | confirmed. Coin type 145 per SLIP-44 |

## Status of each built-in chain

- `btc-mainnet` (`sp`), `btc-testnet` (`tsp`; testnet3, testnet4, signet, regtest): `verified-feasible`.
- `ltc-mainnet` (`ltcsp`), `ltc-testnet` (`tltcsp`): `research-only`, `experimental: true`.
- `doge-mainnet` (`dogesp`), `bch-mainnet` (`bchsp`): `research-only`, `experimental: true`.

No silent payment HRP is registered for Litecoin, Dogecoin or Bitcoin Cash (SLIP-173 lists none).
`ltcsp`, `tltcsp`, `dogesp`, `bchsp` are made up by this package: experimental, not standardised. Do not
treat them as an interoperable format. No wallet was found that can send to them.

## Guards

- `experimental: true` on a `network: 'mainnet'` chain makes `createSilentPaymentOutputs` and the adapter's
  `buildPaymentRequest` throw `EXPERIMENTAL_CHAIN`. There is no override flag by design.
  Address encoding/decoding, key generation and `scan` remain available for research.
- Address decoding for chain B rejects every chain-A HRP with `NETWORK_MISMATCH` (tested for all 30
  ordered pairs of built-in chains, including `ltcsp`/`dogesp`/`bchsp` vs `sp` suffix look-alikes).
- Sender fails closed with `INELIGIBLE_INPUT_TYPE` when a key's script type is not in the chain's list.
- The output key math does not contain the HRP. The chain binding is entirely the address check plus the
  adapter `chainId`. Callers must not pass an address through a different chain's params.

## Known gaps and deliberate differences

1. **P2TR outputs on chains without Taproot.** The engine implements BIP-352 as written: outputs are
   x-only taproot keys. Dogecoin and Bitcoin Cash cannot create such outputs, and their eligible input
   list is `['p2pkh']` only. Their params therefore describe an engine configuration, NOT a deployable
   protocol. The "scheme B" idea in `docs/remote/chain-ports/btc-family.md` (P2PKH outputs, a new
   non-BIP-352 scheme) is not implemented. Litecoin has the same issue until Taproot activation is
   confirmed against a node.
2. **Experimental HRPs** (see above). Also not built in: `tdogesp`, `tbchsp` and Litecoin regtest; add with
   `defineChainParams` if needed.
3. **Key paths** `m/352'/coinType'/account'/{1',0'}/0` are BIP-352's for Bitcoin; the same shape for other
   coin types is an extrapolation.
4. **Not copied from `btc-silent-payments`**: spending/PSBT (`spend.ts`), BIP-21 URIs, Blindbit client, unit
   handling. The adapter has no URI and uses `2^63-1` as the amount ceiling, not a per-chain max supply
   (unverified for LTC/DOGE/BCH).
5. **`TweakSource`** here is a smaller interface (`getTipHeight`, `getBlock`) than the one in
   `btc-silent-payments`; no network source is implemented. `scan` fails with `UNSUPPORTED` without one.
6. **Adapter types** (`src/adapter-types.ts`) are a local copy. Member names are pinned against
   `packages/chain-adapters/src/adapter.ts` by `adapter-types.test.ts`. Structural differences: request
   carries `address` + `experimental` instead of `router`/`feeRecipient`/`build()`; `family` is `'bitcoin'`
   (the research doc proposes a possible `'utxo'` family, a decision for the chain-adapters owner).
7. **Unverified, not checked at all**: Litecoin MWEB interaction with eligibility/skip rules; Dogecoin/LTC/BCH
   dust and fee rules; BCH P2PKH sighash; whether any transaction library accepts these chains' prefixes.
8. Constant-time and memory erasure: JavaScript gives no guarantees; `zeroize` is best effort (same as the
   source package).
9. The BIP-352 vectors are Bitcoin-only. Nothing validates LTC/DOGE/BCH on a real network.
