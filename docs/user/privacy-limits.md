# Privacy limits

GhostPay reduces **address reuse** by deriving a one-time destination for each payment. A public meta-address does not directly identify all of its on-chain destinations. Transfers, announcements, invoice sharing and later sweeps can still reveal relationships. See the [current product guide](product-guide.md) for supported flows.

## What stays public

- Payer address, token, gross and net amounts, time, and that a GhostPay router was used.
- The fee flow to the fee recipient.
- The announcement: one-time address, ephemeral key, view tag.
- The sweep: source, destination, amount (and the relayer's address) if you sweep.

Routed EVM payments use the configured router and a recognizable fee/announcement flow. An analyst can list those interactions. Direct payments and other network families have different paths; none of these mechanisms hides the public transaction graph.

## Who learns what

| Observer | Learns | Does not learn |
|---|---|---|
| Public chain analyst | Payer address, token, gross/net amounts, fee to the recipient, router use, announcement data, timing; sweep source and destination | Which seller owns a one-time address (from the chain data alone), invoice contents |
| **The payer** | The one-time address they paid, so they can watch it and see where you sweep it | Your keys |
| Anyone holding the invoice link | Public fields and, for a link carrying its decryption key, the encrypted contents; passphrase mode needs the separate passphrase | Your private seller keys |
| Static web host or CDN | Your IP, user agent, which app files you fetched, timing; a compromised served page can read unlocked contents | URL fragments are absent from ordinary HTTP requests; this does not protect against the served code or browser extensions |
| RPC provider | Your IP, which blocks and addresses you query (including a one-time address when you check its balance), and every transaction you broadcast through it | Your keys, invoice contents |
| Relayer operator | Connection metadata, one-time address, destination, token, amount, fee, timing; actual logs depend on deployment; can censor or delay | Private keys through the supported signing protocol |
| Wallet provider / extension | Transaction requests, chain, connected accounts | Keys of the one-time address (they live in the page) |
| Fee recipient (project owner) | Aggregate fees on-chain | Anything beyond public chain data |
| Anyone with two of your invoices | That they come from the same seller (same meta-address) | Your private keys |

## Specific limits to remember

1. **Sweeping can reveal the link between payer, one-time address and your wallet.** See [Sweep funds and gas privacy](sweep-and-gas-privacy.md).
2. **Links carrying their decryption key are bearer secrets and may persist in browser history.** Passphrase mode keeps the passphrase separate. Address-bar clearing reduces exposure after reading; it cannot guarantee deletion from history, clipboard, screenshots or extensions.
3. **Your meta-address is a stable public identifier.** If you publish it in the registry, it is tied to the publisher's wallet.
4. **The optional delay is timing friction, not anonymity.** No cover transactions are made.
5. **The optional gas buffer is public** and links payer and one-time address.
6. **View tags save scanning work; they do not hide anything.** The log download is unchanged.
7. **Fiat prices are quotes**, not guaranteed settlement values.
8. **Direct payments bypass the router,** so no fee, but also none of the router's checks on the announcement shape.
9. **A compromised website, browser extension or device can expose unlocked data and alter requests.** GhostPay has not received an independent professional audit. Review the exact build and its release evidence rather than relying on a familiar-looking host.
10. **Deployment authentication is implemented, but requires approved configuration.** The ordinary web path checks a bundled manifest's signature against configured release keys and compares deployed code and configuration on-chain. Missing keys, invalid signatures or inconsistent readback keep the flow unavailable. These checks do not protect against replacement of the entire app or compromise of its trusted build. See [deployment verification](../DEPLOYMENT_MANIFEST.md).

## Other chains

- **Bitcoin silent payments** (web app, testnet only): the Esplora server you choose sees block heights and the outputs you check. The payer sees the output they paid. No GhostPay router or relayer is involved. See [Bitcoin silent payments](bitcoin-silent-payments.md).
- **Stablecoins and ETH** follow the EVM rules above: transfers, amounts and the router address are public. See [Stablecoin payments](stablecoin-payments.md) and [Ether and EVM native payments](ethereum-payments.md).
- **Solana and TRON** have experimental views in the full build and separate verification limits. Their announcements, memos and transfers are public on-chain. See the [current product guide](product-guide.md) before using older chain-specific guidance.

## Local records and providers

Ordinary settings are plaintext, including any credentials embedded in an endpoint path or query. Optional key,
tag and reconciliation vaults encrypt stored contents; scope identifiers, existence and ciphertext sizes remain
observable. Unlocked contents are available to the running page. Locking does not delete saved data, and exported
files must be deleted separately from site storage.

A second RPC adds comparison and availability while sharing queries with another operator. Explorer lookups also
reveal the requested address or transaction. A valid receipt signature is a field attestation, and restored history
is not fresh payment verification. See the [shipped privacy page](../../apps/web/privacy.html) and
[reconciliation guide](reconciliation-and-receipts.md).
