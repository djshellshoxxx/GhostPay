# User Guide — static Pages client (draft)

[Home](Home.md) · [Developer Guide](Developer-Guide.md) · [Verification and Release Gates](Verification-and-Release-Gates.md)

## Overview and availability

GhostPay is an experimental client-side EVM stealth-invoice and payment application. The **only actively developed candidate** is the lean, static GitHub Pages client in unmerged [draft PR #137](https://github.com/djshellshoxxx/GhostPay/pull/137) at `ac08062ec540d429a0bfb24f3aab042be5d212eb`. There is **no approved public release, independently audited deployment or real-funds use**. The source-pinned [Pages release matrix](https://github.com/djshellshoxxx/GhostPay/blob/ac08062ec540d429a0bfb24f3aab042be5d212eb/docs/pages/RELEASE_MATRIX.md) distinguishes implemented/tested code from open gates.

The client needs no GhostPay-operated server, database, relayer or cron job. It depends on user-selected external wallets and RPC nodes for network interactions. With **no signed, approved testnet deployment manifests**, the build is a payments-disabled demonstration; an owner's separately approved manifest would be required for testnet payments. All other versions (full-profile server/relayer, native, CLI, BTC, Solana, TRON, merchant backends and other non-Pages features) remain preserved but **their development is paused**. Future-only ideas from PR #99 are not shipped.

## Getting started and access

No verified public deployment URL is available from this draft. To evaluate locally, obtain the repository at the exact candidate SHA, install Node.js 22 or newer, run `npm ci --ignore-scripts` and `npm run build:libs`, then follow the [Pages build and local-serve instructions](https://github.com/djshellshoxxx/GhostPay/blob/ac08062ec540d429a0bfb24f3aab042be5d212eb/docs/pages/README.md). Local development/test builds must be marked `GHOSTPAY_PAGES_DEV=1` where the build requires it; that flag does not constitute release verification. Do not infer a deployable artifact from a successful local demo.

Use a current browser with JavaScript enabled. On a shared `*.github.io` account origin, other sites belonging to that account may share origin-scoped browser storage and scripting privileges. A dedicated origin is a required owner decision before a meaningful beta involving keys or payments. There is no browser extension or native installation requirement for the static client.

## Common workflows (test-only, when supported and enabled)

1. **Seller keys and backup:** generate or import keys; keep the encrypted keystore and its passphrase safely and separately. A download prompt alone does **not** establish that a usable backup was saved or restored. The GP-PAGES-02 backup-verification correction is still under independent review on this source head.
2. **Invoice:** select an allowed EVM test network and asset, review amount, expiry, fee, recipient and signer identity, then retain the original signed invoice. A QR or screenshot may not hold the complete verifiable document.
3. **Buyer:** import the signed invoice, confirm network/asset/amount and wallet context, review the transaction and separately authorize it in the wallet. A broadcast attempt is not confirmation; uncertain outcomes must be reconciled before any retry.
4. **Scan and reconcile:** inspect discovered stealth-payment candidates against chain evidence, confirmation/finality and invoice bindings. The optional automatic scan is opt-in, operates while the tab is visible and can expose timing and account queries to the chosen RPC provider.
5. **Receipt and recovery:** retain signed receipts **and** actual chain settlement evidence. A seller signature alone does not prove settlement. Native-coin testnet sweep/recovery is represented in the draft's local-chain acceptance; ERC-20 sweep needs externally provided gas and is **not qualified by that devnet acceptance**.
6. **QR and imports:** use the documented invoice/payment-request/receipt/backup formats only; import must validate sizes, integrity and network identity. Do not treat QR payloads as implicit transaction authorization.

## Troubleshooting and FAQ

- **Why are payments disabled?** No approved signed testnet manifest was bundled, the selected wallet/network does not match, or a fail-closed check prevented operation. Do not circumvent deployment trust pins.
- **Why is a payment pending or failed?** Check wallet rejection, RPC results, transaction hash, chain and finality. Timeouts do not prove that no transaction was broadcast.
- **Why is a receipt rejected?** Confirm the original signed invoice, signer pin, chain, token, amount, recipient, actual transaction and finality. A receipt alone does not certify chain settlement.
- **Can I restore keys after clearing my browser?** Only with a complete externally saved encrypted backup and the correct passphrase; local storage is not custodial recovery. The independent backup-verification fix remains under review.
- **Does inactivity automatically secure the wallet?** The device-sleep idle-lock behaviour (GP-PAGES-04) remains an open candidate correction on this head; do not rely on it as a fully qualified defense.
- **Is it anonymous?** No. RPC queries, wallets, transaction senders, timing, amounts, approvals and subsequent sweeps can expose linkage.
- **Can I run the CLI, relayer, BTC or other chain apps from Pages?** No. Those are preserved separately and are excluded from active Pages development.

## Privacy, security and safe use

This is **pre-audit** software. Protect secret keys and invoice capability URLs; browser fragments and browser extensions can expose sensitive data. Selected RPC providers see network metadata and requests, and a static host cannot supply response security headers such as `frame-ancestors`. A self-displayed file hash is for comparison with independently obtained release evidence, not a proof of host integrity. The build may execute only approved testnet operations after separate configuration and review; no real funds, mainnet, release or public deployment are authorized. Consult [SECURITY.md](https://github.com/djshellshoxxx/GhostPay/blob/ac08062ec540d429a0bfb24f3aab042be5d212eb/SECURITY.md) for private security reporting and the [Pages guide](https://github.com/djshellshoxxx/GhostPay/blob/ac08062ec540d429a0bfb24f3aab042be5d212eb/docs/pages/README.md) for current limitations.

This page is version-controlled **wiki source**, not a published live GitHub Wiki page.
