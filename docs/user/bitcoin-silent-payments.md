# Bitcoin silent payments

> **Experimental, testnet only, unaudited.** Mainnet is disabled in the code. Bitcoin is not connected to the router, the relayer or the Ethereum invoice flow. Do not send real bitcoin.

GhostPay's Bitcoin tier uses BIP-352 silent payments. The seller shares one reusable `sp`/`tsp` address. Each payment creates a fresh taproot output that only the seller can find and spend. The engine is `packages/btc-silent-payments`. The UI is the **Bitcoin** view of the web app (`apps/web/src/features/btc`).

## Networks

| Network | Silent-payment prefix | Regular prefix | Enabled in the app |
|---|---|---|---|
| testnet4 | `tsp` | `tb` | yes |
| signet | `tsp` | `tb` | yes |
| regtest (local node) | `tsp` | `bcrt` | yes |
| mainnet | `sp` | `bc` | **no** |

Source: `apps/web/src/features/btc/network.ts`. The app refuses a server whose genesis hash does not match the selected network.

## Seller: receive

1. Open **Bitcoin** in the web app and choose a test network.
2. Create a wallet. The app generates a random 32-byte seed and shows it **once**. Write it down offline. It is not stored.
3. Share the `tsp1...` address, the `bitcoin:?sp=...` link or the QR code.
4. The keys stay in page memory. They are dropped when you press **Lock** or leave the view.

## Seller: scan

Scanning needs an Esplora-compatible server URL that you supply. No public server is hard-coded.

- The app downloads each block's transactions and computes the tweak locally. Keys never leave the page.
- The server sees block heights, the outputs you check for spends, and any transaction you broadcast.
- A malicious server can hide payments or lie about spent state. It cannot spend your funds.
- A scan covers at most 500 blocks per run.

Run your own Esplora-compatible node if you can. See [Local scanner and RPC](../operators/local-scanner-and-rpc.md).

## Seller: sweep

1. Select the outputs to spend and enter a destination (a regular address or another `tsp1` address).
2. Enter a fee rate in sat/vB. The app has no fee oracle. Rates above 50 sat/vB or fees above 10 % of the amount show a warning.
3. Review the card: inputs, fee, amount and destination. The sign button stays disabled until you tick the confirmation box.
4. The app signs with the software key and checks every signature. It aborts if the fee or size differs from what you reviewed.
5. Broadcasting is a separate click.

The sweep uses BIP-125 signalling. There is no fee-bump button. To replace a stuck sweep, scan again, pick the same inputs and sweep with a higher rate.

## What is public

- Each payment creates an output on-chain. The payer can see the transaction they sent.
- Silent payments hide the link from the reusable address to the output, but the amounts, timing and spends remain visible.
- A sweep to a wallet you already use links that wallet to the funds. Use a fresh destination.

## Not in scope yet

- No relayer, no fee sponsorship and no GhostPay fee on this path.
- No BlindBit oracle in the UI (the client exists in the package but is not wired).
- No fee estimator in the UI.
- Mainnet is disabled until the project's enablement checklist is complete and an independent audit exists.

## Testing

Use testnet4 or signet with coins from a faucet you verify. For a local test, run regtest with a Bitcoin Core node you compile or download yourself. The local regtest script in `scripts/regtest/` has not been run against a live `bitcoind` in this repository (see `docs/chains/bitcoin.md`).
