# GhostPay help guides

> **Pre-audit software, testnet only.** There has been no independent professional audit. Code support or a hosted preview does not establish a qualified public deployment; ordinary EVM payment requires accepted deployment information and on-chain verification. See the [current product guide](../user/product-guide.md) and [completion handoff](../handoffs/PRODUCT_COMPLETION_HANDOFF.md) for scope and validation. Examples use made-up values; never paste a real key, seed phrase or keystore into a document, chat or issue.

GhostPay reduces **address reuse**. It does **not** make payments anonymous or unlinkable. Read [Privacy limits](../user/privacy-limits.md) before relying on any of it.

## Guides

| Guide | For | Read it to |
|---|---|---|
| [Getting started: merchants](getting-started-merchants.md) | Sellers | Create keys, back them up, make an invoice, get paid safely |
| [Getting started: payers](getting-started-payers.md) | Customers | Check an invoice link and pay it |
| [Receivers and scanning](receivers-and-scanning.md) | Sellers | Find payments, understand view tags, verify before delivering |
| [Sweeping safely](sweeping-safely.md) | Sellers | Move funds out without exposing your wallet more than you must |
| [Policy accounts](policy-accounts.md) | Curious / advanced | Understand the experimental timelocked account and its disabled UI gate |
| [Bitcoin silent payments](bitcoin-silent-payments.md) | Curious / advanced | Understand the Bitcoin library and full-build test view |
| [Privacy do and don't checklist](privacy-checklist.md) | Everyone | A one-page list of habits that matter |
| [FAQ](faq.md) | Everyone | Quick answers |
| [Glossary](glossary.md) | Everyone | Plain-language definitions |
| [Troubleshooting by symptom](troubleshooting-by-symptom.md) | Everyone | Start from what you see and find a fix |

The reference pages stay in [docs/user](../user/README.md) (set-up, pay, scan, sweep, fees, privacy limits, troubleshooting table). Where a guide and the code disagree, the code wins and the guide has a bug.

## Pictures and animations

Diagrams are self-contained SVG files in [`docs/assets/diagrams`](../assets/diagrams/) and work in light and dark mode. Animated explainers are in [`docs/assets/animations`](../assets/animations/); they use only CSS (no scripts, no network) and show every step at once if your system asks for reduced motion.

![System overview: browser app, RPC provider, EVM contracts, optional relayer, and the separate Bitcoin library/test view](../assets/diagrams/system-overview.svg)

## What is built, what is planned

| Feature | State |
|---|---|
| Seller keys, invoices, pay, scan, tags, sweep in the web app | Implemented for testnet development; applicable provider and deployment gates remain. See the handoff for executed validation |
| Router (0.25% fee), announcer use, sweep relayer contract, relayer service | Implemented, pre-audit; no deployment manifest ships, and live deployment/relayer qualification is not established |
| Fiat-priced invoices | Full-build support for configured chain/asset/currency pairs; ETH/USD and USDC/USD feeds are configured for Sepolia and Base Sepolia. Fresh quote and deployment checks still gate payment; lean builds use fixed-token invoices |
| ERC-6538 registry publishing | Implemented with explicit consent, transaction review and registry verification; not evidence of a qualified public deployment |
| Deep scan ignoring view tags | Implemented as an opt-in check of router announcements; full address checks remain, and direct announcements stay tag-filtered |
| Encrypted tag export/import | Implemented in the full build under Seller keys; separate from the seller keystore |
| Per-client meta-address derivation | Not exposed as a web workflow |
| WalletConnect | No operational relay integration in this web payment flow; a separate session-model package is not live wallet support |
| Policy accounts | Contracts, library and experimental web controls exist; the feature is disabled by default and has no pinned deployment |
| Bitcoin silent payments | Library and full-build test view for receive, scan and sweep; separate from EVM invoices/router and the relayer |
| Solana and TRON | Full-build test views for receive, scan and native SOL/TRX sweep; no payer flow or SPL/TRC-20 sweep |

Implementation scope: [full shell](../../apps/web/src/App.tsx), [feed registry](../../packages/chain-adapters/src/quote.ts), [registry view](../../apps/web/src/features/registry/RegistryView.tsx), [scan controls](../../apps/web/src/views/Scan.tsx) and [tag archive](../../apps/web/src/components/TagArchive.tsx). These source features do not establish live-network acceptance.
