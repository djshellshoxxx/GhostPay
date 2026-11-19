# Privacy limits

> Pre-audit software, testnet only. GhostPay is **not anonymous**. Read this page before you rely on it for anything.

GhostPay reduces **address reuse**: customers never pay the same address twice, and a stranger cannot tell from your invoice which on-chain address is yours. It does not make payments private. For the detailed analysis see the [privacy threat model](../threat-model/PRIVACY_THREAT_MODEL.md) and the [metadata exposure matrix](../threat-model/metadata-exposure-matrix.md).

## What GhostPay hides

- Your receiving address is not on the invoice, and every payment goes to a new one-time address. Someone who only reads your invoice or your public meta-address cannot see your payments on the chain.
- Your keys are not sent to providers; deliberate local key exports are a separate explicit action. The page that scans for your payments has no network access of its own, and the filter sent to your RPC provider contains no key, address or view tag.
- There are no accounts, no analytics, no tracking scripts, no remote fonts and no GhostPay server. The app does not phone home. (The test suite checks this: a build that adds an analytics or tracking call fails.)
- The invoice link's secret part (after the `#`) is not sent to the website that serves the app. The app removes it from the address bar after reading it (you can turn that off).
- Your saved notes, labels and keys are encrypted in your browser with your passphrase or viewing key.

## What stays public, forever

- Payer address, token, amount, time, and that a GhostPay router was used.
- The fee flow to the fee recipient.
- The announcement: one-time address, ephemeral key, view tag.
- The sweep: from the one-time address to your destination, with the amount. Anyone can follow it.

All routed EVM payments on a chain go through one configured router with the same fee/announcement shape, so an analyst can list them. Your anonymity set is "GhostPay users on that chain", not "everyone". Direct payments and other network families take different paths; none of these mechanisms hides the public transaction graph.

## What the services you choose can see

GhostPay needs an RPC provider (a server that reads the blockchain for you). You must pick one; the app does not choose for you. **That provider sees more than the blockchain does.**

| Who | What they learn |
|---|---|
| **Your RPC provider** (and your second RPC, if you set one) | The connecting IP address, when you scan and how far back, **which payments matched your keys** in the default receipt-validation path, and the one-time address when you explicitly check its balance or review a sweep, the destination and amount of a direct sweep, and every transaction you send through it. A second RPC sees the same matches, so it adds a cross-check, not privacy. |
| **A Bitcoin (Esplora) server** | Every block you scan and what you broadcast. Complete verified block ranges provide local spend detection; incomplete/light/history paths may still query matching outpoints, and signing rechecks selected outputs with the server. |
| **A Solana or TRON node** (experimental) | Slots/blocks and requested transaction data during scanning; address-bearing balance requests at explicit sweep review and signing. Their behavior and network guarantees differ from EVM and Bitcoin. |
| **The relayer operator**, if you use one | The one-time address, your destination, token, amount, fee, your internet address (stored only as a short-lived hash for rate limiting) and the timing. It can refuse or delay your request. It cannot change the destination or amount you signed. |
| **The website host or CDN** | That your internet address opened GhostPay, when, and which files. Not the part of the link after `#`, not your keys, not your RPC traffic. A compromised host can serve altered code, which can read unlocked contents. |
| **Your internet provider or Wi-Fi network** | Which sites your device talks to (the app host, your RPC provider, the relayer), when and how much. Not the content. |
| **The payer** | The one-time address they paid, so they can watch it and see where you sweep it. Not your keys. |
| **Anyone with your invoice link** | The whole invoice (it is a bearer link). Anyone with two of your invoices can tell they come from one seller. |
| **Anyone with a payment receipt** | Transaction hash, chain, amount, invoice digest and your signing key. The one-time address is omitted by default and included only by explicit choice, but the transaction can still reveal it on-chain. Share receipts only with who needs them. |
| **Public chain analyst** | Everything in "What stays public", plus any link you create by sweeping carelessly. |
| **Anyone using your computer or phone later** | Saved RPC and relayer addresses (plaintext, including embedded credentials unless kept session-only), which chains you scan and how far, and possibly your invoice links in browser history. Not your encrypted keys or notes without your passphrase. |
| **Wallet provider or extension** | Transaction requests, chain, connected accounts. |
| **Fee recipient (project owner)** | Aggregate fees on-chain; nothing beyond public chain data. |

## What GhostPay does NOT protect

1. **Timing.** A payment at one moment and a sweep soon after look connected. The optional payment delay is only a waiting period on the payer's side; no cover transactions are made.
2. **Amounts.** The amount is public. If the same amount shows up at your destination, it points back to the payment.
3. **Sweeping.** Moving funds from a one-time address to a wallet you already use shows everyone that the wallet is yours and who paid it. Sweeping several one-time addresses to one destination links them all. The app warns about destinations already used in the current seller session. The record stays in memory and clears on lock, key replacement or reload; earlier sessions and other devices are not checked. No known-wallet classification list is shipped.
4. **Gas funding.** Putting gas into a one-time address from another wallet links the two. The payer's optional gas buffer is public and links payer and one-time address.
5. **Address reuse at the destination.** If your destination already has history, everyone can see it.
6. **Which payments are yours, from your RPC provider.** See the table above.
7. **The payer following the funds.** The payer knows the one-time address.
8. **Publishing in the registry** permanently ties your meta-address to your wallet address.
9. **A compromised website, browser extension, wallet or device.** That defeats everything. There is no external audit, no signed release and no official host yet.
10. **View tags** save work; they do not hide anything.

## How to reduce your exposure

Do these in roughly this order; each helps with one named risk and none gives anonymity.

1. **Sweep to a fresh destination every time** (a new address you do not use for anything else). Sweep in batches, not immediately after each payment, knowing this only blurs timing.
2. **Do not fund a one-time address with gas from a wallet you use elsewhere.** Use the relayer path or the payer's buffer, knowing the relayer sees the sweep.
3. **Use your own RPC node** if you can run one (the app accepts `https://` or `wss://` addresses only, so a local node needs TLS in front). Otherwise use a provider you trust, and a different one for sweeping than for scanning if you can.
4. **Choose session-only storage for sensitive RPC addresses.** This option is available even if the warning heuristic misses a credential. Existing saved settings change only when you save. Session-only RPC URLs and endpoint URLs flagged as credential-bearing are omitted from settings export; detection can miss secrets, so review complete values before sharing.
5. **Use Tor Browser or a trusted VPN** if you want to hide your internet address from the RPC provider and the website host. The page cannot make you use it or check that you did, and it does not hide what you send. The setup that actually helps is **Tor Browser plus your own node or an `https://` RPC you trust**: through Tor Browser the RPC sees a Tor exit instead of your address, but it still sees every query. The optional onion service in [`deploy/TOR.md`](../../deploy/TOR.md) covers **only the app files** (and the relayer behind the same host), not your RPC calls or your wallet's traffic. It is **untested** until a smoke test on the real Tor network has been run and recorded there. GhostPay's Tor, I2P, Nym and OHTTP options are all marked unverified.
6. **Self-host** the app if you do not want the host to see you open it.
7. **Treat invoice links and receipts as secrets.** Paste links into the Pay page or use a private window; do not post them publicly. A passphrase-protected invoice is much safer than the default; the "encrypt" checkbox keeps the key inside the same link and only deters casual viewers.
8. **Use a private window** or clear site data on a shared computer.
9. **Run a relayer yourself** if you sweep through one often.
10. Only use test funds. Report problems privately ([SECURITY.md](../../SECURITY.md)).

## Opt-in privacy features and what is still library-only

Additional scan padding, jitter and bulk receipt evidence are **off by default**. The default fixed-window setting is 1000 blocks, constrained by the selected chain/provider. An announcement indexer, separate scan endpoint, local proxy and Tor Browser profile require explicit configuration. Indexer block hashes are still checked against your RPC. A web page cannot open SOCKS or prove it runs in Tor Browser: "Tor Browser" means you say you
opened the page there, and "local proxy" means a JSON-RPC forwarder you run on loopback. These reduce what one
provider learns per query; they do not make you anonymous. Requests to a relayer are padded to a fixed size (1, 2 or
4 KiB), which only hides the exact body length: the relayer still reads every field, your address and the timing.
Decoy-batched reads, per-invoice keys and amount rounding exist as libraries but are **not switched on in the web app
or the relayer**, so do not assume they protect you. See the [threat model](../threat-model/PRIVACY_THREAT_MODEL.md#8-mitigations-available-today-honestly-rated)
and [seller privacy](seller-privacy.md).

## Specific limits to remember

1. **Links carrying their decryption key are bearer secrets and may persist in browser history.** Passphrase mode keeps the passphrase separate. The app clears the address bar after reading the link, but that cannot guarantee deletion from history, clipboard, screenshots or extensions.
2. **Your meta-address is a stable public identifier.** If you publish it in the registry, it is tied to the publisher's wallet.
3. **Fiat prices are quotes**, not guaranteed settlement values.
4. **Direct payments bypass the router,** so no fee, but also none of the router's checks on the announcement shape.
5. **Deployment authentication is implemented, but requires approved configuration.** The ordinary web path checks a bundled manifest's signature against configured release keys and compares deployed code and configuration on-chain. Missing keys, invalid signatures or inconsistent readback keep the flow unavailable. These checks do not protect against replacement of the entire app or compromise of its trusted build. See [deployment verification](../DEPLOYMENT_MANIFEST.md).

**Funding hygiene.** Never send gas or anything else to a one-time address from a wallet that identifies you: that one
transfer links the one-time address, the payment and you on-chain, and no later sweep undoes it. Use the gas buffer the
payer can add or a relayer instead, sweep to destinations that do not already carry your name, and avoid moving many
one-time addresses into one wallet at once. See [Sweep funds and gas privacy](sweep-and-gas-privacy.md) and
[Seller privacy](seller-privacy.md) for the scanner's privacy-set notice, its lanes and budget, and what a scan reveals
to your RPC provider.

## Other chains

- **Bitcoin silent payments** (web app, testnet only): the Esplora server you choose sees block heights, the blocks you scan and the outputs you check. The payer sees the output they paid. No GhostPay router or relayer is involved. See [Bitcoin silent payments](bitcoin-silent-payments.md).
- **Stablecoins and ETH** follow the EVM rules above: transfers, amounts and the router address are public. See [Stablecoin payments](stablecoin-payments.md) and [Ether and EVM native payments](ethereum-payments.md).
- **Solana and TRON** are experimental proofs of concept (the web app has views for them, mainnet disabled; other user guides may still say "no UI"). Their announcements, memos and transfers are public on-chain. See [Solana payments](solana-payments.md) and [TRON payments](tron-payments.md).

## Local records and providers

Saved ordinary settings are plaintext, including credentials in an endpoint path or query unless the endpoint was kept session-only. Session-only here means the current page lifetime, not encrypted storage. Invalid or unacknowledged saved network-profile settings block new shared EVM RPC requests; review and save them explicitly in Settings. Removing site data resets preferences to the fresh-install defaults. The shared EVM RPC profile guard does not cover separately configured scan endpoints/indexers, raw relayer fetch, or the Bitcoin, Solana and TRON adapters; their transport behavior is tracked separately under #241. Optional key,
tag and reconciliation vaults encrypt stored contents; scope identifiers, existence and ciphertext sizes remain
observable. Unlocked contents are available to the running page. Locking does not delete saved data, and exported
files must be deleted separately from site storage.

A second RPC adds comparison and availability while sharing queries with another operator. Explorer lookups also
reveal the requested address or transaction. A valid receipt signature is a field attestation, and restored history
is not fresh payment verification. See the [shipped privacy page](../../apps/web/privacy.html) and
[reconciliation guide](reconciliation-and-receipts.md).

## Consent and request-volume defaults

Balance checks require an explicit action. Receipts omit the one-time address until you opt in for that receipt; changing payment or seller resets that choice. Invoice encryption starts enabled and is restored on reload or seller-session replacement. Plaintext opt-out and passphrases are not stored as persistent preferences. An encrypted bearer link still carries its key; use separate passphrase mode when the passphrase should travel by a different channel.

Bulk evidence and extra scan padding start at zero. Bulk evidence is a target count, not an absolute request limit: all matching transactions remain included. Repeating crowded ranges can reveal more about which transactions match. Padding can substantially increase request volume with small windows: at most `2 × ceil(padding / window size)` additional grid windows per query before provider-limit splitting, with a maximum padding value of 100000 blocks. The active web scheduler refuses more than 4096 initial grid windows before allocation and permits at most 4096 uncached window requests per query, including provider-limit split attempts. This budget excludes head/block reads, other RPC calls and inner transport retries. Cancellation stops later window dispatch and discards late results after any already-dispatched provider call settles; it cannot withdraw sent requests or force a non-cooperative provider to settle.

The [TM1–TM15 completion matrix](../threat-model/TM_HARDENING_COMPLETION_20261118.md) distinguishes implemented local controls, executed tests and environmental assumptions that remain unverified.
