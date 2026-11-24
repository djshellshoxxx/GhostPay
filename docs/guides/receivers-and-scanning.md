# Receivers and scanning

> **Pre-audit, testnet only.**

Sellers get no notification. Every routed payment emits a public **announcement** (one-time address, ephemeral key, view tag). Your scanner downloads announcements and tests which ones are yours using your viewing key.

![Stealth payment flow: steps 5 to 7 are announcement, scan, verify](../assets/diagrams/stealth-payment-flow.svg)

## How scanning works

1. Open **Scan and receive** with keys loaded ([setup](../user/set-up-stealth-meta-address.md)).
2. Pick chain, RPC endpoint and **start block**. The block where you first shared your meta-address is a safe choice; later can miss payments, earlier only costs time.
3. The app downloads logs in the ranges your RPC allows and tests each in a background worker. A checkpoint lets you resume.
4. Matches appear under *Payments found*.

### View tags in one minute

Each announcement carries a one-byte **view tag** derived from the shared secret. Your scanner computes the tag it would expect; if it differs the announcement is not yours and is skipped cheaply. About 255 of 256 unrelated announcements stop there, and about 1 in 256 matches by chance, so a full check follows.

View tags **save computation**. They do **not** reduce the logs you download, and they hide nothing.

![Animated explainer: scanning with view tags](../assets/animations/scanning-view-tags.svg)

## Verify before you deliver (most important rule)

- Anyone can derive a valid one-time address from your public meta-address and post an announcement claiming any amount. Your scanner lists it because the keys match. **The amount is the poster's claim.**
- The scanner distinguishes unverified claims from payment evidence checked against transaction/receipt data and the configured confirmation depth. Review that status and the relevant chain facts before delivering goods; a balance alone does not prove that an invoice was paid.
- The configured confirmation-depth check is distinct from independent finality verification; an RPC disagreement or reorganisation can change the result.
- Match payments to balances, not rows. Replayed announcements can appear as extra rows.

## A customer says they paid but you see nothing

A dishonest or buggy payer can publish a wrong view tag, so your tag-filtered scan skips the payment. Ask for the transaction hash, find the address that received the tokens, and test it with your keys. The opt-in **Deep scan (also check wrong view tags)** checks router announcements without the view-tag filter, at higher CPU cost, while still verifying the full one-time address. Direct announcements stay tag-filtered.

## What your RPC provider learns

Your IP, which blocks and addresses you query (including a one-time address when you check its balance), and that you scan GhostPay announcements. It never receives your viewing key. Use your own node or a provider you trust ([local scanner and RPC](../operators/local-scanner-and-rpc.md)).

## Private tags

You can label a match ("order 1042"). Tags are encrypted in this browser with keys derived from your viewing key (ciphertext in IndexedDB), lock after the idle time you set, and can be wiped. They do not automatically sync between devices. The full build can export and import an encrypted tag archive under **Seller keys**; this archive is separate from the keystore. Clearing site data deletes the local copy.

## Reorgs

The scanner rolls back to a checkpoint on reorganisation and ignores duplicate logs.

Next: [Sweeping safely](sweeping-safely.md). Problems: [Troubleshooting by symptom](troubleshooting-by-symptom.md).
