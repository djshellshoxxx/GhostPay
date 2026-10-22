# Stablecoin payments (USDC, EURC)

> **Experimental, testnet only.** Nothing is deployed. The app refuses to pay on any chain that has no deployment manifest, and no manifest ships in this repository. Nothing here has been run against a live wallet or chain. Do not use real money.

GhostPay can pay ERC-20 stablecoins on EVM testnets. The app only accepts tokens in its built-in allowlist (`packages/chain-adapters/src/config/tokens.ts`). Any other token is refused.

## Tokens in the allowlist

| Symbol | Chain (testnet) | Chain id | Decimals | Permit (ERC-2612) |
|---|---|---|---|---|
| USDC | Ethereum Sepolia | 11155111 | 6 | yes |
| USDC | Base Sepolia | 84532 | 6 | yes |
| USDC | OP Sepolia | 11155420 | 6 | yes |
| USDC | Arbitrum Sepolia | 421614 | 6 | yes |
| USDC | Polygon Amoy | 80002 | 6 | yes |
| USDC | Avalanche Fuji | 43113 | 6 | yes |
| EURC | Ethereum Sepolia | 11155111 | 6 | yes |
| EURC | Base Sepolia | 84532 | 6 | yes |
| EURC | Avalanche Fuji | 43113 | 6 | yes |

Only Circle's published testnet addresses are listed. The EURC addresses were taken from search snippets and must be re-checked against Circle's documentation before any release. Mainnet tokens are not listed. USDT, DAI, PYUSD, FDUSD, WETH and WBTC are not allowlisted because their addresses are not verified (see `docs/chains/token-notes.md`).

## How a stablecoin payment works

1. The seller creates an invoice with a token from the list. The amount is in token base units (100.00 USDC = 100000000).
2. The Pay page reads the router address and fee recipient from the deployment manifest for that chain. If the manifest is missing, payment is disabled.
3. The app picks one of three router calls:
   - **`payERC20WithPermit`**: the payer signs an ERC-2612 permit, so no separate approve transaction is needed. Used for permit tokens.
   - **Approve, then `payERC20`**: the payer approves exactly the gross amount first.
   - **`payERC20WithBuffer`**: as above, plus native coin for the seller's gas (optional, public, see [Review and pay](review-and-pay-an-invoice.md)).
4. The router sends the net amount to a one-time address and charges the checkout fee (25 basis points, see [Fees](fees.md)).
5. Your wallet shows the router address. Check it against the manifest before you confirm.

## Things that can go wrong

- **Issuer blacklist.** USDC and EURC are marked as blacklist-capable. If the issuer blocks the payer, the seller, the one-time address or the fee recipient, the transfer reverts. Nothing is refunded by GhostPay; the payer keeps the funds in the wallet.
- **Wrong chain.** The same token symbol exists on many chains with different addresses. Send only on the chain shown on the review screen.
- **Permit support.** The relayer sweep path needs `permit`. A token without `permit` (USDT-style) cannot use the relayer and needs the direct sweep path. No such token is allowlisted yet.
- **Non-standard approve.** The allowlist has a flag for tokens whose `approve` needs a zero first or returns no bool. No listed token sets it, but the code expects a safe-approve wrapper for any token that does.
- **Decimals.** Amounts use 6 decimals. Check the displayed value, not a number you calculated yourself.
- **Fiat quotes.** Stablecoin invoices are priced in the token. A fiat-priced invoice needs a price feed. None is configured, so no fiat quote is shown.

## Privacy notes

Stablecoin transfers are public. The payer address, token, gross and net amounts and the router use are visible to any chain analyst. The one-time address can be sent to, but the amounts are not hidden. See [Privacy limits](privacy-limits.md).

## Before you rely on this

- Run the flow on a testnet with test tokens from a faucet you verify yourself.
- The contracts have not been audited by an independent party.
- See [Testnet usage](testnet-usage.md) for a step-by-step test plan.
