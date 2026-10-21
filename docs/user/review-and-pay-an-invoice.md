# Review and pay an invoice

An invoice arrives as a link (or QR code) that starts with the app address followed by `#gpi=v1.`. Everything after the `#` stays in your browser and is not sent to the web server.

> Testnet only for now. Nothing is deployed, so the app will refuse to pay until a deployment manifest is present for the chain.

## Before you open a link

- **The link is a bearer secret.** Anyone who has it can read the invoice, including line items and memo if the seller encrypted them. Do not post it publicly.
- **Prefer pasting over clicking.** Browsers can save visited addresses, including the part after `#`, in their history database even though the app removes it from the address bar after reading it (audit S3-03). Pasting the link into the app's Pay page, or opening it in a private window, reduces this. A private window helps with history, not with a compromised device.
- **Check where you got the link.** The signature on an invoice shows it was not altered after the seller signed it. It does **not** prove who the seller is unless you already know and have pinned the seller's signing key.

## Review screen: what to check

The Pay page shows, before anything is sent:

| Item | What to check |
|---|---|
| Chain and token | Is it the network and asset you expect? Wrong-network payments can be lost. |
| Destination | A one-time address derived for this payment. You cannot recognise it; that is normal. |
| Gross, fee, net | Gross is what you pay. The 0.25 % checkout fee is deducted from it; net reaches the seller. Depending on the seller's setting, the fee is added on top or absorbed. See [Fees](fees.md). |
| Expiry | Expired invoices are blocked. |
| Quote source and time | Only for fiat-priced invoices. These are currently disabled in practice because no price feed is configured, so you will see a "no feed" message. |
| Signature | "Signature matches key ..." is a consistency check, not seller identity. An *invalid* signature is a hard stop. |
| Fee recipient and contract addresses | Read from the deployment manifest. The app currently **does not verify the manifest's signature** and does not yet check these addresses against the chain (being fixed; see [Hosting status](../../README.md#hosting)). Compare them with addresses the project publishes through a channel you trust. |
| "What becomes public" | Payer address, amount, token and time are public on-chain. |

If anything fails to parse, is too large, or looks tampered with, the app shows an error and sends nothing.

## Optional features (off by default)

- **Payment delay.** Waits a random time inside a range you choose before letting you send. Nothing is signed while waiting, you can cancel or send now, and the app re-checks the invoice when the timer ends. It is timing friction, **not anonymity**. You must keep the tab open.
- **Gas buffer** (ERC-20 invoices). Adds a small amount of native coin to the one-time address in the same transaction so the seller can pay gas to move the tokens. It is public, adds no GhostPay fee, and **links you (the payer) to the one-time address** more visibly. It is capped, based on a live gas price, and needs an RPC.

## Paying

1. Choose your wallet. The app looks for browser wallets; if none are found, install or unlock one and reload.
2. For ERC-20 tokens, the wallet may first ask you to approve exactly the gross amount (or to sign a permit message if the token supports it and no buffer is used). Approve only the amount shown.
3. Confirm the payment in your wallet. The wallet should show the **router contract** address, not the seller's address.
4. The app compares the transaction your wallet actually sends with the reviewed preview. If your wallet or its provider changes the target, amount or data, the app reports it as a refusal or failure instead of success. If you have not configured your own RPC it says it could not verify.
5. Save the local receipt if offered. "Included" means the transaction was mined, not that it is final.

## After paying

The seller needs their viewing key to see your payment. The seller may ask for your transaction hash; with the transaction hash a seller can confirm the payment in one step. Paying the same invoice twice is possible; the invoice is not single-use on-chain (ADR-0003).

## Things the app cannot protect you from

A compromised device, browser extension or wallet; a malicious website pretending to be GhostPay (there is no official host yet); a dishonest seller. Keep the amount small and use testnets until an independent audit exists.
