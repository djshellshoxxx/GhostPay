# User Guide

[Home](Home.md) · [Developer Guide](Developer-Guide.md)

## Overview and availability
GhostPay experimentally creates signed invoices, derives one-time EVM addresses, allows seller-key generation/backup, supports test-network payment review, scanning, invoice-bound signed receipts, reconciliation and recovery. Merchant integrations and other chain families have separate availability and acceptance conditions. **There is no independently audited production release, approved real-funds use, or qualified public-chain deployment.** Consolidation [PR #98](https://github.com/djshellshoxxx/GhostPay/pull/98) remains a draft. The merged PR #99 catalog is **future only**, not shipped.

## Access and installation
Obtain the repository source at a recorded SHA and use test-only fixtures. The browser UI needs JavaScript and a compatible browser. Node.js >=22 and npm are required for CLI setup from the repository root:

```sh
npm ci --ignore-scripts
npm run build:cli
node packages/cli/dist/bin.js --help
node packages/cli/dist/bin.js doctor
node packages/cli/dist/bin.js invoice --help
node packages/cli/dist/bin.js receipt --help
```

The local CLI is offline by default. An explicit `--online` plus operator-provided RPC and independent deployment trust pin is required for live *read-only* verification. The CLI cannot broadcast payments or refunds. Do not use `npx ghostpay` to obtain this repository's CLI; see [the exact command reference](https://github.com/djshellshoxxx/GhostPay/blob/364b1f185fcc2adaedab4ce7b4b14e676b1da3b7/packages/cli/README.md).

## Common workflows
1. **Seller keys:** generate or import spending, viewing and invoice-signing keys. Export an encrypted keystore, preserve the passphrase separately and test restoration before relying on the address. Public pairing data is not a key backup.
2. **Invoice:** choose allowed chain, token address, amount, expiry and fee; review the signer key and private-field exposure. Preserve the complete original signed invoice or protected link.
3. **Payment review:** inspect expected signer pin, chain, asset, amount, fee, recipient and transaction target. Wallet approval is separate from sending payment; signed or broadcast-attempted does not mean confirmed.
4. **Scan and reconcile:** discovery/announcement is only a candidate. Verify payment receipt, recipient, amount, finality and provider agreement; confirm reconciliation explicitly.
5. **Receipt / QR:** retain the original signed invoice and `ghostpay-receipt.json`. A QR or screenshot is only a convenience representation and can omit data. A seller signature alone does **not** establish actual chain settlement.
6. **Sweep and recovery:** require explicit review and wallet authorization, using local test setups only. Encrypted backups need their keys and passphrase; there is no custodial or guaranteed lost-key recovery.

More detail: [product guide](https://github.com/djshellshoxxx/GhostPay/blob/364b1f185fcc2adaedab4ce7b4b14e676b1da3b7/docs/user/product-guide.md) and [privacy boundaries](https://github.com/djshellshoxxx/GhostPay/blob/364b1f185fcc2adaedab4ce7b4b14e676b1da3b7/docs/user/privacy-limits.md).

## Troubleshooting and FAQ
- **Why is pay unavailable?** Missing/untrusted deployment, unsupported chain/asset, wrong wallet context or incomplete evidence. Do not bypass trust checks.
- **What if a send timed out?** Treat the result as potentially broadcast; inspect wallet and transaction hash before retrying. Deleting local history does not cancel network transactions.
- **Why does receipt verification fail?** Supply original signed files and compare signer key, invoice, chain, asset, amount and recipient; text copied from a QR is not a substitute.
- **How do I recover lost browser keys?** Restore a separately saved encrypted keystore; clearing browser data can destroy locally held keys.
- **Is the product anonymous?** No. Amounts, timing, senders, RPC metadata, token transfers and subsequent sweeps can reveal linkage.
- **Is it independently audited? Can I use real money?** No to both on this unqualified candidate. See [SECURITY.md](https://github.com/djshellshoxxx/GhostPay/blob/364b1f185fcc2adaedab4ce7b4b14e676b1da3b7/SECURITY.md).
- **Can I exchange Solana stealth addresses or memos between the browser and CLI?** No. The experimental CLI-oriented `@ghostpay/chain-solana` format uses `gpsol:` addresses and base64url `gpst1:` memos; the separate browser-oriented `@ghostpay/solana-stealth` uses `st:sol:` addresses and base58 `gpst1:` memos. They are **not interoperable**. Neither variant is an approved production deployment; do not transfer money between them. See the [source-backed chain-solana README](https://github.com/djshellshoxxx/GhostPay/blob/364b1f185fcc2adaedab4ce7b4b14e676b1da3b7/packages/chain-solana/README.md).
- **Does the CLI automate payment?** No; it supports documents, local merchant tools and consented read-only checks.

## Privacy and safe use
Fragment-bearing links are bearer capabilities; browser scripts/extensions can see fragments. RPC providers can see network metadata and queries; relayers are optional and gas sponsorship is not unlinkability. Protect secret keys, verified release hashes and the original digital documents. Report vulnerabilities privately per [SECURITY.md](https://github.com/djshellshoxxx/GhostPay/blob/364b1f185fcc2adaedab4ce7b4b14e676b1da3b7/SECURITY.md); its owner reporting configuration is still pending confirmation.
