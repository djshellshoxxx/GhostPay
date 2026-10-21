# Architecture and Design Rationale

Sources: `docs/MASTER_BLUEPRINT.md`, `docs/DEVELOPER_SPECIFICATION.md`, `README.md`.

- **Client-first.** Key derivation, invoice parsing and metadata decryption stay in the browser where practical. The static app is served from content-addressed hosts (IPFS, Arweave, onion mirror) per the blueprint.
- **User-chosen RPC.** The user selects an RPC endpoint or runs a local node.
- **Optional relayer.** ERC-4337 bundler and paymaster are optional. Gas sponsorship does not provide unlinkability.
- **Stealth addresses (EIP-5564) and a meta-address registry (EIP-6538)** hide the recipient relationship at the address layer, when used correctly. Amounts, timing, senders and contract calls remain visible.
- **View tags** reduce the work of scanning announcements. They do not hide log downloads or chain activity.
- **No seed phrases or spending keys in invoice links.** A URL fragment is not sent to servers but is visible to page scripts and extensions.
- **Specification before code.** Interfaces and test vectors come first, then implementation, per the blueprint's plan.
- **Non-goals stated explicitly**: no absolute anonymity, no confidential on-chain amounts.
