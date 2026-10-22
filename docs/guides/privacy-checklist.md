# Privacy do and don't checklist

> GhostPay reduces address reuse. It is **not anonymity**. Pre-audit, testnet only.

![Privacy limits map: observers against what they can learn](../assets/diagrams/privacy-limits-map.svg)

## Do

- [ ] **Do** use test funds on testnets while GhostPay is pre-audit and undeployed.
- [ ] **Do** sweep to a **fresh destination** each time.
- [ ] **Do** verify the one-time address's **real balance** before delivering goods.
- [ ] **Do** back up the encrypted keystore and keep the passphrase elsewhere.
- [ ] **Do** configure your own RPC (or a node you run) for scanning and sweeping.
- [ ] **Do** paste invoice links into the Pay page or use a private window.
- [ ] **Do** compare router and fee-recipient addresses with a source you trust; the manifest is not yet authenticated.
- [ ] **Do** read the destination on screen before signing a sweep (no wallet confirmation on that path).
- [ ] **Do** sweep batches rather than instantly after each payment, knowing this only blurs timing.
- [ ] **Do** report vulnerabilities privately ([SECURITY.md](../../SECURITY.md)).

## Don't

- [ ] **Don't** sweep to your main wallet or reuse one destination for many customers.
- [ ] **Don't** fund a one-time address with gas from a wallet you use elsewhere.
- [ ] **Don't** share spending key, viewing key, keystore or passphrase. The viewing key reveals all your incoming payments.
- [ ] **Don't** trust an announcement's amount.
- [ ] **Don't** post invoice links publicly; they are bearer links.
- [ ] **Don't** treat a valid signature as proof of who the seller is.
- [ ] **Don't** assume the payment delay, gas buffer, or relayer adds anonymity. The delay is timing friction; the buffer links payer and address; the relayer sees your sweep.
- [ ] **Don't** assume a policy account or Bitcoin silent payments hide the transaction graph.
- [ ] **Don't** type private keys into any web page if a keystore will do.
- [ ] **Don't** use a lookalike site: there is no official host and no signed release yet.

## Unfixable with habits

A compromised device, browser extension, wallet or website defeats everything. Anyone with two of your invoices can tell they come from one seller. Public chain facts (payer, amounts, token, time, fee flow, router use) stay public. See [Privacy limits](../user/privacy-limits.md).
