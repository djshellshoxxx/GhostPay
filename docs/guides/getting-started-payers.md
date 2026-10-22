# Getting started: payers

> **Pre-audit, testnet only.** Nothing is deployed, so the app will refuse to pay until a deployment manifest exists for the chain. Use test funds.

A seller sends you an invoice link. Your wallet pays the **GhostPay router**, which takes a 0.25% fee and sends the rest to a fresh one-time address derived for this payment. You cannot recognise that address; that is normal.

![Fee flow: payer to router, fee to the fee recipient, net to the one-time address, direct payments bypass the router](../assets/diagrams/fee-flow.svg)

## What is and is not private for you

Your payer address, the token, the amounts, the time and the router use are **public on-chain**. Your wallet, RPC provider and the sites you use may see your requests. The seller does not learn your identity from the invoice, but you can watch the one-time address you paid, and anyone can. See [Privacy limits](../user/privacy-limits.md).

## Before you open the link

1. **The link is a bearer secret.** Do not post it publicly.
2. **Prefer pasting** it into the app's Pay page, or use a private window. Browsers may save the part after `#` in history even though the app clears the address bar.
3. **Check where it came from.** A valid signature means the invoice was not altered, not that the seller is who they claim.
4. Make sure you are on a site you trust. There is **no official host yet**; a lookalike site is a real risk.

## Review screen

| Check | Good sign | Stop if |
|---|---|---|
| Chain and token | What you expected | Different network or token |
| Gross / fee / net | Gross is what you pay; fee 0.25% of gross | Numbers do not add up |
| Expiry | In the future | Expired (blocked) |
| Signature | "matches key" and, if you pinned it, the key you know | Invalid (hard stop) |
| Router and fee recipient | Match addresses published by the project through a channel you trust | They differ. The app does not yet verify the manifest signature. |

Fiat-priced invoices cannot be paid today (no feed); ask for a token-priced invoice.

## Paying

1. Connect a browser wallet (WalletConnect is not built).
2. For ERC-20, approve **exactly the gross amount** shown, or sign a permit if the token supports it.
3. Confirm. The wallet should show the **router** address, not the seller.
4. The app compares what your wallet sent with the preview and refuses if the target, amount or data changed. Configure your own RPC in Settings so it can verify.
5. "Included" means mined, not final. Keep the transaction hash; the seller may ask for it.

## Optional extras (off by default)

- **Payment delay:** a random wait in a range you choose. Timing friction only; keep the tab open. Not anonymity.
- **Gas buffer** (ERC-20): sends a little native coin to the one-time address so the seller can sweep. It is public and **visibly links you to that address**.

## Mistakes to avoid

- Paying the wrong network or token. Funds can be lost.
- Paying twice: invoices are not single-use on-chain.
- Sending straight to a one-time address instead of via the router: no fee, but also none of the router's checks.

## If something goes wrong

See [Troubleshooting by symptom](troubleshooting-by-symptom.md). Never post keys, seed phrases or full invoice links in public.

Next: [Privacy do and don't checklist](privacy-checklist.md).
