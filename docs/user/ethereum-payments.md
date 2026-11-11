# Ether and EVM native payments

> **Experimental, testnet only.** Nothing is deployed and no deployment manifest ships. The app shows "payments disabled on this chain" until a manifest is loaded for the chain. Do not use real ETH.

GhostPay accepts native coin (ETH on Ethereum-family networks) and ERC-20 tokens on EVM chains. This page covers the native path. For tokens, see [Stablecoin payments](stablecoin-payments.md).

## Chains enabled in code

Only testnets are enabled. Mainnets are listed in the code with `enabled: false` and cannot be selected for payment.

| Network | Chain id | Native symbol | Enabled in code |
|---|---|---|---|
| Ethereum Sepolia | 11155111 | ETH | yes |
| Base Sepolia | 84532 | ETH | yes |
| OP Sepolia | 11155420 | ETH | yes |
| Arbitrum Sepolia | 421614 | ETH | yes |
| Polygon Amoy | 80002 | POL | yes |
| BNB Smart Chain Testnet | 97 | tBNB | yes |
| Avalanche Fuji | 43113 | AVAX | yes |
| Ethereum, Base, OP, Arbitrum, Polygon, BNB, Avalanche (mainnets) | 1, 8453, 10, 42161, 137, 56, 43114 | ETH, POL, BNB, AVAX | **no** |

Source: `packages/chain-adapters/src/config/chains.ts`. Enabling a chain requires every item in `docs/chains/CHECKLIST.md`.

## Paying in native coin

1. Open the invoice on the Pay page. Check the chain, the amount in wei or ETH, and the fee.
2. Choose a wallet. The app uses browser wallets that announce themselves (EIP-6963). Unlock the wallet and reload if none appears.
3. The app calls `payNative` on the router with the gross amount as `msg.value`. The router takes the checkout fee (25 basis points) and forwards the net amount to a one-time address.
4. Your wallet should show the router address as the target. If the wallet changes the target, value or data, the app reports a mismatch rather than success.
5. Wait for inclusion. "Included" means mined, not final. Finality depth differs per chain (see `chains.ts`).

## What is public

- Your address, the amount, the chain, the router address and the time are on-chain.
- The announcement reveals a one-time address and an ephemeral key. Only the seller can match it to the seller's keys.
- Native transfers to a one-time address are visible to anyone watching that address.

## Sweeping native coin

The seller sweeps the one-time address to a wallet. Native coin needs gas. There are two options:

- **Direct sweep**: the one-time address must already hold enough native coin to pay its own gas (on OP Stack chains such as Base Sepolia also the L1 data fee, which the app keeps back from a native sweep). Funding it from your wallet links that wallet to the address. Avoid this.
- **Relayer sweep**: a relayer pays gas and takes a fee inside your signed amount. The relayer sees the one-time address, destination and amount. The sweep guide describes this path only for tokens with `permit`, so treat native coin as a direct sweep unless the sweep screen offers otherwise.

See [Sweep funds and gas privacy](sweep-and-gas-privacy.md).

## Limits

- The checkout fee cannot be enforced on direct transfers that skip the router. A payer can send ETH straight to the one-time address with no fee. Sellers must check balances themselves ([Receive and scan](receive-and-scan.md)).
- The router's fee recipient is read from the manifest. The owner has not chosen it. Compare it with a source you trust.
- A wallet provider, RPC provider and the browser see your transaction requests. See [Privacy limits](privacy-limits.md).

## Testnet check

Use a test network only. Get test ETH from a faucet you have checked yourself, and use a wallet that holds no other funds. See [Testnet usage](testnet-usage.md).
