# GhostPay help guides

> **Pre-audit software, testnet only.** Nothing is deployed, nothing is hosted, and there has been no independent audit. These guides explain how GhostPay is designed to work so you can understand it. Do not use it with real money. Examples use made-up values; never paste a real key, seed phrase or keystore into a document, chat or issue.

GhostPay reduces **address reuse**. It does **not** make payments anonymous or unlinkable. Read [Privacy limits](../user/privacy-limits.md) before relying on any of it.

## Guides

| Guide | For | Read it to |
|---|---|---|
| [Getting started: merchants](getting-started-merchants.md) | Sellers | Create keys, back them up, make an invoice, get paid safely |
| [Getting started: payers](getting-started-payers.md) | Customers | Check an invoice link and pay it |
| [Receivers and scanning](receivers-and-scanning.md) | Sellers | Find payments, understand view tags, verify before delivering |
| [Sweeping safely](sweeping-safely.md) | Sellers | Move funds out without exposing your wallet more than you must |
| [Policy accounts](policy-accounts.md) | Curious / advanced | Understand the experimental timelocked account (not in the app) |
| [Bitcoin silent payments](bitcoin-silent-payments.md) | Curious / advanced | Understand the Bitcoin tier (library only, not in the app) |
| [Privacy do and don't checklist](privacy-checklist.md) | Everyone | A one-page list of habits that matter |
| [FAQ](faq.md) | Everyone | Quick answers |
| [Glossary](glossary.md) | Everyone | Plain-language definitions |
| [Troubleshooting by symptom](troubleshooting-by-symptom.md) | Everyone | Start from what you see and find a fix |

The reference pages stay in [docs/user](../user/README.md) (set-up, pay, scan, sweep, fees, privacy limits, troubleshooting table). Where a guide and the code disagree, the code wins and the guide has a bug.

## Pictures and animations

Diagrams are self-contained SVG files in [`docs/assets/diagrams`](../assets/diagrams/) and work in light and dark mode. Animated explainers are in [`docs/assets/animations`](../assets/animations/); they use only CSS (no scripts, no network) and show every step at once if your system asks for reduced motion.

![System overview: browser app, RPC provider, EVM contracts, optional relayer, and the Bitcoin library that is not wired in](../assets/diagrams/system-overview.svg)

## What is built, what is planned

| Feature | State |
|---|---|
| Seller keys, invoices, pay, scan, tags, sweep in the web app | Built, tested with mocks; testnets only; nothing deployed |
| Router (0.25% fee), announcer use, sweep relayer contract, relayer service | Built; not deployed; pre-audit |
| Fiat-priced invoices | Disabled in practice: no price feed is configured |
| ERC-6538 registry publishing, per-client meta-addresses, deep scan ignoring view tags, encrypted tag export, WalletConnect | Planned, not built |
| Policy accounts | Experimental: contracts and a client library only |
| Bitcoin silent payments | Library only; not in the app or relayer |
