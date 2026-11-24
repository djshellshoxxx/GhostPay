# Fees

This page follows [FEE_SCHEDULE.md](../FEE_SCHEDULE.md). If they ever disagree, the schedule and the contract code win. No deployment manifest ships in this repository, and live qualification is not established. The rules below describe implemented fee behaviour, not verified fee collection on a public deployment.

## What GhostPay can charge

| Fee | When | Amount | Where it is enforced |
|---|---|---|---|
| **Checkout fee** | A payment sent through the GhostPay router | **0.25 % (25 basis points)** of the gross amount, rounded down | On-chain, by the router. Rate and recipient are fixed when the router is deployed. |
| **Gas-sponsored sweep** | You use a relayer to sweep | `max(relayer gas cost x 1.10, 0.50 %)` of the swept amount, **capped at 3 %** | The exact fee and fee recipient are inside your signature; the contract cannot take more than you signed. The pricing rule is applied by the relayer and checked by the client. |
| **Policy-account creation** | Creating the experimental guarded account | A flat fee in a stablecoin (default design value: USD 3.00 equivalent, owner to confirm) | On-chain at account creation. Experimental web controls exist but are disabled by default; no pinned deployment is provided. |
| Everything else | Scanning, tagging, delay, QR codes, invoice creation | Free | Nothing to enforce |

## Worked example (made-up numbers)

An invoice for 100.00 USDC (6 decimals = 100,000,000 base units), checkout fee 0.25 %:

- Fee: 100,000,000 x 25 / 10,000 = 250,000 base units = 0.25 USDC.
- Net to the seller's one-time address: 99.75 USDC.
- If the seller chose "payer pays the fee", the payer's gross is increased so the seller receives the full invoice amount; the Pay screen shows the exact gross, fee and net before you confirm.

Payments below 400 base units pay a fee of 0. The gas buffer (extra native coin sent for the seller's sweep) carries no fee.

## Direct payments bypass the fee

A payer can send tokens straight to the one-time address without the router. That costs no GhostPay fee. The fee only applies when funds pass through GhostPay's contract; it cannot be enforced on direct transfers, on forks of the client, or on other chains' tiers (for example Bitcoin). This is stated up front in the app and in the schedule.

Direct payments also skip the router's checks, and their announcements carry amounts that nobody verified. Sellers must check balances ([Receive and scan](receive-and-scan.md)).

## Who gets the fee

The fee recipient is chosen at deployment and read from the app's bundled deployment manifest; it is public on-chain by design. The app requires a valid signature from a configured release key and verifies the deployment against its RPC before payment. No deployment manifest ships in this repository, and missing or invalid deployment information keeps payments disabled. Compare the displayed addresses with a source you trust; signature and RPC checks do not replace that trust decision. See [deployment verification](../DEPLOYMENT_MANIFEST.md).

If that recipient is blacklisted by a token issuer or cannot receive ETH, checkout for that asset stops. The project would have to deploy a new router and publish a new manifest (see [ADR-0013](../adr/ADR-LOG.md)).

## Costs that are not GhostPay fees

Network gas for your own transactions, wallet fees, RPC provider charges and token issuer rules. The relayer fee already includes its estimated gas.

## Legal

Collecting a percentage of payments can have tax, money-transmission and sanctions consequences depending on where the operator and users are. The project gives no legal advice and the owner has not completed a legal review.
