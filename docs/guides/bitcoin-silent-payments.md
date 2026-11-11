# Bitcoin silent payments

> **Experimental, test networks only, unaudited.** `@ghostpay/btc-silent-payments` implements BIP-352 and is used by the full web build's Bitcoin view for receive, scan and sweep on testnet4, signet and regtest. It is separate from EVM invoices, the router and the relayer. Code support is not live-network qualification; see the [test-view instructions](../user/bitcoin-silent-payments.md) and [current validation record](../handoffs/PRODUCT_COMPLETION_HANDOFF.md).

## The idea

Like the EVM flow, a seller shares **one reusable address** (`sp1...`) and every payment lands on a **different** on-chain output. Unlike the EVM flow there is no router, no announcement and no registry. The payer's wallet derives the output from the sum of its own input private keys and your address, so the transaction looks like an ordinary taproot payment.

![Bitcoin silent payments flow: seller keys, payer wallet, chain, tweak data source, receiver scan, spend](../assets/diagrams/bitcoin-silent-payments.svg)

## The six steps

1. **Seller** generates a scan key and a spend key and shares an `sp1...` address (or a `bitcoin:?sp=` link). Optional labels let you tell customers apart.
2. **Payer** uses a silent-payments-capable wallet. Support is uneven; a web page cannot build the output for an ordinary wallet.
3. **Chain** carries an ordinary-looking output. Nothing is announced.
4. **Scan data** in the web view comes from an Esplora-compatible server you choose. The app downloads blocks and computes tweaks locally; the server sees the requested heights, not your keys. The package also has an oracle client, which is not wired into this view.
5. **Receiver** scans with the scan secret (kept local) and finds outputs.
6. **Spend** derives the spend key per output and signs a PSBT or raw transaction. Hardware-wallet signing is out of scope.

## Limits to remember

- Amounts, timing and the spend are public. Silent payments avoid address reuse; they do not hide the transaction graph, and sweeping several outputs together can link them.
- An oracle you do not run sees which heights you ask about and can lie or withhold; run your own node for better privacy.
- Anyone with your scan key can see your incoming payments.
- **No GhostPay fee is enforceable on Bitcoin**: the payer's wallet builds the transaction. A hosted scanning service is only a possible later paid feature (planned).
- The full web build has receive, scan and sweep controls. Bitcoin is not part of the EVM seller-invoice/payment workflow.

Specification: `docs/MULTICHAIN_SPEC.md` section 3. Related: [Privacy limits](../user/privacy-limits.md), [Glossary](glossary.md).
