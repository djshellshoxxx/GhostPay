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
- A dishonest payer can also pay the right address but publish a wrong view tag, so your tag-filtered scan never finds the payment. If a customer says they paid and you see nothing, ask for the transaction hash and look at the transaction; the address that received the tokens is the one-time address, and you can test it with your keys. To find such a payment yourself, turn on **Deep scan (also check wrong view tags)** in Scan and receive: it checks every router announcement without the view tag (at a higher CPU cost), still verifies the full one-time address, marks a match whose announced tag was wrong, and that payment can be swept like any other. Announcements that did not come through the router stay tag-filtered.
- Wait for enough confirmations. The app shows "included", not "final".

## Local client tags

You can attach a private label (for example "order 1042") to a match. Tags are encrypted in this browser with keys derived from your viewing key: only ciphertext is stored in IndexedDB. The tag vault locks after the idle time you set in Settings and can be wiped. Limits: tags do not travel between devices (there is no encrypted export yet), do not survive clearing site data, and are readable while unlocked by anything running in your browser session.

## Reorgs and duplicates

The scanner handles chain reorganisations by rolling back to a checkpoint and ignores duplicate logs. Replayed announcements can still show up as extra rows, because an attacker can copy a genuine announcement; match payments to balances, not to rows.

- If your RPC cannot return the block saved in the checkpoint (it is lagging or returned nothing), the scan stops with an RPC error and nothing is rolled back or invalidated; scan again later.
- After a confirmed reorg, a saved reconciliation record is marked invalid only when its block was actually replaced (checked against your RPC, and against the second RPC when you set one). Unchanged records stay valid. With a second RPC, a reorg that only one provider reports keeps your checkpoint and stops the scan.
- With a second RPC, each scan ends at the last block both providers have. If the second RPC falls more than the chain's confirmation depth behind, the scan says so: later payments appear only once it catches up (or after you remove it in Settings).
- Restoring an encrypted reconciliation backup into a vault that has seen a reorg marks restored records at or above the reorg block that were recorded before it (by the recording device's clock) as invalid, because they could not be checked; adding the same payment again from a new scan makes it valid again. The preview shows how many records would be marked invalid.

## Announcement spam

Anyone can post announcements, so a block can hold more of them than one RPC response may carry. The scanner then checks that block only for payments posted through the GhostPay router and tells you which blocks it narrowed: a direct (non-router) payment in such a block would not be listed. A block counts as too large when its response passes the app's 2 MiB limit or the RPC refuses it with JSON-RPC error -32602 or -32005. Some providers also use -32005 for rate limits, so a block refused with -32005 is asked for again, whole, once its router-posted payments have been read: if the RPC answers, the block is scanned whole; if it refuses the block as too large again, the block is narrowed as above, with the same warning. Such a block stops the scan with an RPC error only when its router-posted payments cannot be read or the second request fails with a different error; scanning again later continues at that block. Other limits (too many logs or blocks in one request) only make a scan take more steps; it continues where it stopped.

Remaining limits: a block with more router-posted announcements than one response can carry stops the scan at that block with an error. So does an RPC that refuses even a single block with another limit error (JSON-RPC -32600, -32614 or -32000), because those errors do not say that the response is too large; scan with another RPC to get past that block. A -32005 rate limit that still refuses the second request for a block (see above) narrows that block even when it holds no spam, so a direct payment in it is not listed (the warning names the block; if a payer says they paid directly in it, look at the transaction as described above). The app cannot tell such a rate limit from a block that is too large: that would need the RPC's error text, which the app deliberately does not keep (it keeps only the error code). The optional indexer source (Settings) always fetches whole windows, so a window the indexer cannot serve or cross-check because of spam also stops the scan with an error; switch the source back to the scan RPC to continue.
