# Receive and scan

Sellers do not get a notification when someone pays. The router (or a payer paying directly) publishes an *announcement* on the chain; your scanner downloads announcements and checks which ones are for you.

> Testnet only for now.

## How scanning works

1. Open **Scan and receive** with your keys loaded (see [Set up a stealth meta-address](set-up-stealth-meta-address.md)).
2. Choose the chain, an RPC endpoint, and a **start block** (the block when you first published your meta-address is a safe choice; earlier costs time, later can miss payments).
3. The app downloads announcement logs in ranges your RPC allows and tests each one in a background worker. A **view tag** (one byte per announcement) lets the scanner skip about 255 out of 256 non-matching announcements cheaply. It does not reduce what is downloaded.
4. Matches appear under *Payments found*. A checkpoint lets you resume later.

## What your RPC provider learns

The RPC provider sees your IP address and which blocks and addresses you ask about, and it can see that you are scanning GhostPay announcements. It does not receive your viewing key. For better privacy run your own node or use an RPC you trust; see [Run a local scanner and RPC](../operators/local-scanner-and-rpc.md).

## Do not trust the amount shown on a match

This is the most important rule for sellers.

- Anyone can derive a valid one-time address from your public meta-address and post an announcement claiming "1,000,000 USDC". The scanner will list it because the keys match. **The amount in the announcement is just the poster's claim.**
- Only a payment that went through the GhostPay router carries router-enforced amounts. Announcements that did not come through the router are payer-supplied and unverified. Today the app still shows announced amounts without checking the chain balance (audit S3-02, D4; a fix is in progress). Until that fix ships, **always check the actual balance of the one-time address on a block explorer or your own node before delivering goods.**
- A dishonest payer can also pay the right address but publish a wrong view tag, so your tag-filtered scan never finds the payment. If a customer says they paid and you see nothing, ask for the transaction hash and look at the transaction; the address that received the tokens is the one-time address, and you can test it with your keys. A "deep scan" that ignores view tags is a planned mitigation, not built.
- Wait for enough confirmations. The app shows "included", not "final".

## Local client tags

You can attach a private label (for example "order 1042") to a match. Tags are encrypted in this browser with keys derived from your viewing key: only ciphertext is stored in IndexedDB. The tag vault locks after the idle time you set in Settings and can be wiped. Limits: tags do not travel between devices (there is no encrypted export yet), do not survive clearing site data, and are readable while unlocked by anything running in your browser session.

## Reorgs and duplicates

The scanner handles chain reorganisations by rolling back to a checkpoint and ignores duplicate logs. Replayed announcements can still show up as extra rows, because an attacker can copy a genuine announcement; match payments to balances, not to rows.
