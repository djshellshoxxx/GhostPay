# GhostPay user guides

> **Experimental software, testnet development.** GhostPay has not received an independent professional audit. A hosted preview or listed network does not establish a qualified public deployment: payment remains subject to deployment-signature and on-chain verification gates. See the [current completion handoff](../handoffs/PRODUCT_COMPLETION_HANDOFF.md) for validation scope. Examples use made-up values (for example `0x0000...0001`); never paste a real key or seed phrase into a document, chat or issue.

## Start here

| Guide | Read it to |
|---|---|
| [Current product guide](product-guide.md) | Understand supported workflows, network configuration, evidence states and file recovery |
| [Testnet usage](testnet-usage.md) | See what works today, what is blocked, and how to run a safe local test |
| [Set up a stealth meta-address](set-up-stealth-meta-address.md) | Create seller keys, back them up, and get an address to share |
| [Share public configuration between devices](public-device-exchange.md) | Compare public seller config, transfer preferences, and review registry QR codes |
| [Review and pay an invoice](review-and-pay-an-invoice.md) | Check an invoice link and pay it safely |
| [Reconciliation and receipt archive](reconciliation-and-receipts.md) | Review local invoice matches and manage archived seller receipts |
| [Receive and scan](receive-and-scan.md) | Find payments sent to you and keep private notes about them |
| [Sweep funds and gas privacy](sweep-and-gas-privacy.md) | Move funds to your wallet and understand what that reveals |
| [Privacy limits](privacy-limits.md) | See who can learn what (observer table) |
| [Seller privacy](seller-privacy.md) | The privacy-set banner, scanner lanes and spam, what the scan RPC learns |
| [Fees](fees.md) | Know exactly what you pay and when GhostPay's fee does not apply |
| [Troubleshooting](troubleshooting.md) | Fix common problems |
| [Technology and attribution](technology-attribution.md) | Check upstream authors, licenses, standards and source links |

## By asset and network

| Guide | Status |
|---|---|
| [Ether and EVM native payments](ethereum-payments.md) | Experimental, testnet only; no manifest ships |
| [Stablecoin payments (USDC, EURC)](stablecoin-payments.md) | Experimental, testnet only; allowlist of Circle testnet tokens |
| [Bitcoin silent payments](bitcoin-silent-payments.md) | Experimental, testnet4 / signet / regtest; mainnet disabled |
| [Solana payments](solana-payments.md) | Experimental view in the full build; separately qualified testnet flow |
| [TRON payments](tron-payments.md) | Experimental view in the full build; mainnet disabled and separate verification limits |

The [product guide](product-guide.md) describes the current full/lean split. Older chain-specific guides may retain
earlier integration status; consult the current source and completion evidence before assuming a path is available.

If you only read one thing: **moving funds from your one-time address to a wallet you already use can reveal that the payer paid you.** See [Sweep funds and gas privacy](sweep-and-gas-privacy.md).
