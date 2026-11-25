# Architecture and Design Rationale

[Home](Home.md) · [User Guide](User-Guide.md) · [Developer Guide](Developer-Guide.md)

## Current Pages-client trust boundaries (19 November 2026, source-pinned)

Only the **lean static EVM-testnet GitHub Pages client** is in active development. The default `main` [`dfc75ef2087fa6463ae59e0818abec01796c578d`](https://github.com/djshellshoxxx/GhostPay/commit/dfc75ef2087fa6463ae59e0818abec01796c578d) passed [24/24 application CI jobs](https://github.com/djshellshoxxx/GhostPay/actions/runs/44292693611), but separate unmerged [integration #238](https://github.com/djshellshoxxx/GhostPay/pull/238) failed application CI and Mythril qualification. Neither an individually green workflow nor documentation of a protocol authorizes deployment, mainnet use, a release or real funds. Server/relayer/native/CLI/full-profile functionality remains preserved but development-paused.

The browser imports the [`@ghostpay/invoice-schema` public API](https://github.com/djshellshoxxx/GhostPay/blob/dfc75ef2087fa6463ae59e0818abec01796c578d/packages/invoice-schema/src/index.ts), which re-exports strict invoice validation, canonical signing, fragment parsing, expiry checks, merchant-profile validation and receipt processing. This is a **module export surface, not an authorization boundary**. The [invoice signature verifier](https://github.com/djshellshoxxx/GhostPay/blob/dfc75ef2087fa6463ae59e0818abec01796c578d/packages/invoice-schema/src/sign.ts) verifies the signer key *embedded in the invoice*, not the seller's real-world identity. The [fragment parser](https://github.com/djshellshoxxx/GhostPay/blob/dfc75ef2087fa6463ae59e0818abec01796c578d/packages/invoice-schema/src/envelope.ts) distinguishes a valid signature from a **trusted seller** only when the caller supplies a separate pinned signer key; it enforces a 16 KiB decoded fragment limit.

The [signed receipt validator/binder](https://github.com/djshellshoxxx/GhostPay/blob/dfc75ef2087fa6463ae59e0818abec01796c578d/packages/invoice-schema/src/receipts.ts) checks signature/key control, invoice digest, chain, asset, amount and optionally transaction hash/recipient. It is **not independent blockchain settlement proof**: a wallet response, transaction state, network selection and chain confirmation still require their own verification. Existing [envelope tests](https://github.com/djshellshoxxx/GhostPay/blob/dfc75ef2087fa6463ae59e0818abec01796c578d/packages/invoice-schema/src/envelope.test.ts) exercise the trusted/unpinned distinction, and [receipt tests](https://github.com/djshellshoxxx/GhostPay/blob/dfc75ef2087fa6463ae59e0818abec01796c578d/packages/invoice-schema/src/receipts.test.ts) exercise invoice-binding and explicit signer-pin requirements. These test sources were **inspected, not executed** in this documentation pass; acceptance on an external wallet and independent security review remain outstanding.

## Earlier design principles (preserved)

Sources: `docs/MASTER_BLUEPRINT.md`, `docs/DEVELOPER_SPECIFICATION.md`, `README.md`.

- **Client-first.** Key derivation, invoice parsing and metadata decryption stay in the browser where practical. Hosting is not configured; content-addressed and onion mirrors are planned only (ADR-0015).
- **User-chosen RPC.** The user selects an RPC endpoint or runs a local node.
- **Optional relayer.** ERC-4337 bundler and paymaster are optional. Gas sponsorship does not provide unlinkability.
- **Stealth addresses (EIP-5564) and a meta-address registry (EIP-6538)** hide the recipient relationship at the address layer, when used correctly. Amounts, timing, senders and contract calls remain visible.
- **View tags** reduce the work of scanning announcements. They do not hide log downloads or chain activity.
- **No seed phrases or spending keys in invoice links.** A URL fragment is not sent to servers but is visible to page scripts and extensions.
- **Specification first.** Specs and ADRs under `docs/` pre-date much of the code; where they differ from the code, the code and `DEVIATIONS.md` files win.
- **Non-goals stated explicitly**: no absolute anonymity, no confidential on-chain amounts.
