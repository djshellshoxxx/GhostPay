# TRON (TRX + TRC-20 USDT)

Researched 2026-10-21 from the build environment WITHOUT access to developers.tron.network (DNS blocked). Everything below marked UNVERIFIED comes from memory of java-tron / TronGrid behaviour and must be checked against official docs before relying on it. Code: `packages/tron-adapter`. Design: ADR-0019. Proof of concept, unaudited, **mainnet disabled** (`TRON_NETWORKS.mainnet.enabled = false`, `createTronAdapter({network:'mainnet'})` always throws).

| Network | chainId | enabled | endpoint hint (not a default; UNVERIFIED from here) |
|---|---|---|---|
| Nile (target testnet) | `tron-nile` | true | `https://nile.trongrid.io` |
| Shasta | `tron-shasta` | true | `https://api.shasta.trongrid.io` |
| local devnet | `tron-local` | true | `http://127.0.0.1:9090` |
| mainnet | `tron-mainnet` | **false** | none |

No endpoint, token contract or faucet address is hard-coded. The caller supplies the RPC (`createHttpRpc`, https only, localhost excepted) and the trusted TRC-20 contract list.

## Address encoding

`address = base58check(0x41 || keccak256(uncompressedPubKey[1:])[12:])`, base58check = base58(payload || sha256(sha256(payload))[0:4]). Same hash as an EVM address, different prefix and encoding, so scheme-1 secp256k1 stealth keys from `@ghostpay/core-crypto` are reused unchanged (the EVM address bytes are converted, not recomputed).

Test vectors (`test-vectors/tron.json`, independently re-derived by `scripts/crosscheck_vectors.py` with its own base58, keccak, secp256k1 and protobuf code; run `npm run vectors -w @ghostpay/tron-adapter`):

- `41a614f803b6fd780986a42c78ec9c7f77e6ded13c` <-> `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` (the widely published mainnet USDT contract; checksum validates). This vector is from public knowledge, NOT fetched from the official docs here: re-confirm against developers.tron.network.
- secp256k1 private key 1 -> `TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC`.

## Payments

- Stealth meta-address: `st:trx:0x<spend33><view33>` (ERC-5564 layout, local `trx` tag, not registered anywhere).
- TRC-20: `TriggerSmartContract` calling `transfer(address,uint256)` (selector `a9059cbb`), built locally as protobuf (not by the node), unsigned, for the payer's wallet. `fee_limit` is required (no hidden default).
- TRX: `TransferContract`, amount in sun (1 TRX = 1 000 000 sun).
- The announcement (`GPT1 || R(33) || viewTag`, 38 bytes) goes in `raw_data.data` of the payment tx itself. No announcer contract. Whether nodes/wallets accept a memo of this size and any memo fee: UNVERIFIED.
- Scan: walks blocks (`/wallet/getblockbylimitnext`), keeps only successful txs whose id equals sha256 of their `raw_data_hex`, parses the memo, runs the view-tag check, then for TRC-20 requires a matching `Transfer` log in `/wallet/gettransactioninfobyid`. Untrusted contracts are flagged `trustedToken: false`.
- Spend: `deriveTronStealthKey` re-derives and verifies the key controls the address; `signTronTx` signs sha256(raw_data) (65 bytes r||s||recId, self-verified by public-key recovery).

## Energy and bandwidth (fees)

A TRON tx burns BANDWIDTH (bytes) and, for contract calls, ENERGY. Each is covered first by staked/delegated allowance (and free daily bandwidth), then the shortfall burns TRX at chain-parameter prices (`getEnergyFee`, `getTransactionFee` from `/wallet/getchainparameters`; key names and historical values 420 sun/energy, 1000 sun/byte are UNVERIFIED and may differ now; `parseChainParameters` fails closed). `fee_limit` caps the sun burnable for energy.

Consequences for GhostPay:

1. A fresh stealth address holds USDT but 0 TRX and no allowance, so the sweep (a TRC-20 call) cannot pay for itself. Options: (a) payer also sends a little TRX (second visible link payer -> stealth), (b) recipient/relayer delegates energy+bandwidth to the stealth address (links sponsor -> stealth), (c) pre-fund from a non-linked source. This is the TRON analogue of the EVM gas-buffer problem; no relayer exists yet, so the PoC documents it only.
2. TRC-20 transfer energy is roughly 65 000 to an existing holder and about double to a fresh holder (zero -> non-zero storage write). ESTIMATES (`TYPICAL_TRC20_ENERGY`, UNVERIFIED); real figure must come from `triggerconstantcontract` on the target token.
3. TRX sent to a never-used address creates the account and may cost an extra account-creation fee (UNVERIFIED magnitude). TRC-20 transfers to an unactivated address are expected to work without activation (UNVERIFIED).
4. Fee capability is honestly `not_deployed` on all lines: no fee contract exists, so no fee is advertised.

## What needs a real wallet / testnet funds (not done)

Nile faucet funding, broadcasting any tx (`/wallet/broadcasthex` or `broadcasttransaction`, UNVERIFIED), obtaining a real Nile USDT contract address and a real ref block. The package never broadcasts. All tests use a mock RPC.
