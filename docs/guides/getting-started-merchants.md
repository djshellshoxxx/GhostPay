# Getting started: merchants

> **Pre-audit, testnet only.** Nothing is deployed and the app refuses to pay without a deployment manifest. Use this guide to learn the flow; use test funds only.

You publish **one** meta-address. Each customer's payment goes to a **fresh one-time address** that only you can find and spend from. That removes address reuse. It does not hide amounts, the payer's address, or the fact that a GhostPay router was used.

![Stealth payment flow, eight numbered steps from meta-address to sweep](../assets/diagrams/stealth-payment-flow.svg)

Prefer to watch it? [Animated version](../assets/animations/stealth-payment-flow.svg).

## Before you start

- Use a test network (Ethereum Sepolia or Base Sepolia are the only chains enabled in code) and test tokens.
- Have a password manager or offline place for a keystore file and, **separately**, its passphrase.
- Decide where you will sweep funds to. Plan a fresh destination (see [Sweeping safely](sweeping-safely.md)).

## Step 1: create and back up keys

1. Open **Seller keys**, choose **Generate new keys**. They exist in memory only; reload and they are gone.
2. Under *Back up (encrypted)* pick a passphrase of at least 10 characters and download the keystore (scrypt + AES-256-GCM). Nobody, including the project, can recover a lost file or passphrase.
3. Test the backup: import it in a second browser profile.
4. Copy your **meta-address**. Share only that. Never share the spending key, the viewing key, or the keystore.

| Item | Share? | Why |
|---|---|---|
| Meta-address | Yes | Lets payers derive one-time addresses |
| Spending key | Never | Moves your money |
| Viewing key | Never | Reveals your whole payment history |
| Keystore + passphrase | Never | They are your keys |

Details: [Set up a stealth meta-address](../user/set-up-stealth-meta-address.md).

## Step 2: understand what the meta-address reveals

It is a stable identifier. Anyone holding two of your invoice links can tell they come from the same seller. The app does not publish to the ERC-6538 registry (planned, not built); if you ever publish there, it is publicly tied to the publishing wallet. A per-client meta-address mode does not exist yet.

## Step 3: create an invoice

In **Create invoice** choose chain, token, amount, expiry, optional memo and line items. You can encrypt line items and memo inside the link. Choose who pays the 0.25% checkout fee (the Pay screen shows gross, fee and net).

- **Price in the token** (for example 25.50 USDC). Fiat-priced invoices need a price feed and none is configured, so payers will see a "no feed" message.
- The link starts with the app address and `#gpi=v1.`; the part after `#` is not sent to the web host. Links over 16 KiB are rejected.
- The link is a **bearer secret**: anyone who has it can read it. Send it over a channel you trust. The signature proves the link was not altered; it does not prove who you are unless the payer has pinned your signing key.

## Step 4: wait, then verify

You get no notification. Use [Receivers and scanning](receivers-and-scanning.md) to find payments, and **check the real balance** of the one-time address before delivering anything. An announcement is only a claim.

## Step 5: sweep

Move funds to a fresh destination with [Sweeping safely](sweeping-safely.md). This is where privacy is easiest to lose.

## What this costs

0.25% on routed payments, nothing on direct payments (which also skip the router's checks), and a relayer fee if you use a sponsored sweep. See [Fees](../user/fees.md).

## Checklist

- [ ] Test funds and a test chain only.
- [ ] Keystore downloaded, tested, stored apart from its passphrase.
- [ ] Only the meta-address is shared.
- [ ] Balance verified on chain before delivering goods.
- [ ] Fresh destination ready for sweeps.

Next: [Privacy do and don't checklist](privacy-checklist.md), [FAQ](faq.md).
