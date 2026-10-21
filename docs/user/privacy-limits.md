# Privacy limits

GhostPay reduces **address reuse**: customers never pay the same address twice, and a stranger cannot tell from your invoice which on-chain address is yours. It does not make payments private.

## What stays public

- Payer address, token, gross and net amounts, time, and that a GhostPay router was used.
- The fee flow to the fee recipient.
- The announcement: one-time address, ephemeral key, view tag.
- The sweep: source, destination, amount (and the relayer's address) if you sweep.

All GhostPay payments go through one router address per chain with the same fee split and a fixed announcement shape. An analyst can list them. Your anonymity set is "GhostPay users on that chain", not "everyone".

## Who learns what

| Observer | Learns | Does not learn |
|---|---|---|
| Public chain analyst | Payer address, token, gross/net amounts, fee to the recipient, router use, announcement data, timing; sweep source and destination | Which seller owns a one-time address (from the chain data alone), invoice contents |
| **The payer** | The one-time address they paid, so they can watch it and see where you sweep it | Your keys |
| Anyone holding the invoice link | The entire invoice (it is a bearer link) | Your keys |
| Static web host or CDN | Your IP, user agent, which app files you fetched, timing | The part of the address after `#`, keys, invoice contents |
| RPC provider | Your IP, which blocks and addresses you query (including a one-time address when you check its balance), and every transaction you broadcast through it | Your keys, invoice contents |
| Relayer operator | Hashed IP, one-time address, destination, token, amount, fee, timing; can censor or delay | Keys |
| Wallet provider / extension | Transaction requests, chain, connected accounts | Keys of the one-time address (they live in the page) |
| Fee recipient (project owner) | Aggregate fees on-chain | Anything beyond public chain data |
| Anyone with two of your invoices | That they come from the same seller (same meta-address) | Your private keys |

## Specific limits to remember

1. **Sweeping can reveal the link between payer, one-time address and your wallet.** See [Sweep funds and gas privacy](sweep-and-gas-privacy.md).
2. **Invoice links are bearer secrets and may persist in browser history.** The app clears the address bar after reading the link, but the history database may already have stored it.
3. **Your meta-address is a stable public identifier.** If you publish it in the registry, it is tied to the publisher's wallet.
4. **The optional delay is timing friction, not anonymity.** No cover transactions are made.
5. **The optional gas buffer is public** and links payer and one-time address.
6. **View tags save scanning work; they do not hide anything.** The log download is unchanged.
7. **Fiat prices are quotes**, not guaranteed settlement values.
8. **Direct payments bypass the router,** so no fee, but also none of the router's checks on the announcement shape.
9. **A compromised website, browser extension or device defeats everything.** The app has had no external audit, no release is signed yet, and no official host exists.
10. **The deployment manifest is not yet authenticated**; the contract and fee-recipient addresses shown in the app are as trustworthy as the host that served the manifest until the planned pinning and on-chain checks ship.
