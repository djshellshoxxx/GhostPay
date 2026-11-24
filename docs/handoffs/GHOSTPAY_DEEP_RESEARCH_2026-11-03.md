# Additional deep research for Claude — 2026-11-03

The new research packet is [docs/research/2026-11-03-claude-handoff/README.md](../research/2026-11-03-claude-handoff/README.md).

It supplements the earlier reuse notes and research PRs #54–57 with current frontier/child-PR reconciliation, primary-source code and license inspection, sources outside GitHub, concrete integration seams, and proposed acceptance work. It preserves the current lean EVM release scope.

**Ready to use now:** [report 10 and its saved JSON evidence](../research/2026-11-03-claude-handoff/10-chainlink-testnet-source-evidence.md) resolve the primary-source download blocker recorded by PR #72. The snapshots include the requested Sepolia/Base Sepolia feed addresses, decimals and heartbeats, with hashes and official network provenance.

## First actions

1. Read the [repository snapshot](../research/2026-11-03-claude-handoff/00-repository-snapshot.md) and refresh live PR ownership. The main and PR #47 snapshots differ, and Claude continued adding child PRs during this research.
2. Reconcile PR #72's blocked-source note with report 10. Then review the report for the task you actually own. Several apparent missing features already exist in the integrated candidate or a child PR.
3. Select one disjoint change or qualification task. Each report provides exact GhostPay paths, upstream references, reuse mode, constraints and acceptance criteria.
4. Before borrowing code, verify the intended immutable source/package artifact and selected-file license, retain notices, and record provenance in the existing third-party records.
5. Keep source observations, proposed tests, prior contributor results and newly executed evidence distinct.

## Where to look

- Payment, receipts, transaction uncertainty and finality: [01](../research/2026-11-03-claude-handoff/01-evm-payment-correctness.md).
- Recovery, wallet/mobile, camera lifecycle, QR fixtures and accessibility: [02](../research/2026-11-03-claude-handoff/02-recovery-wallet-mobile.md).
- Release verification, reproducibility, Tor/I2P/IPFS hosting and provenance: [03](../research/2026-11-03-claude-handoff/03-hosting-release-provenance.md).
- Private scanning, public indexer service, light-client evidence and PIR: [04](../research/2026-11-03-claude-handoff/04-private-scanning-indexers.md).
- Deferred Bitcoin/Solana/TRON: [05](../research/2026-11-03-claude-handoff/05-deferred-chain-interoperability.md).
- Deferred account abstraction and permits: [06](../research/2026-11-03-claude-handoff/06-account-abstraction-permits.md).
- Merchant delivery/refunds/subscriptions, embeds and price feeds: [07](../research/2026-11-03-claude-handoff/07-merchant-delivery-oracles.md).
- ENS and escrow design decisions: [08](../research/2026-11-03-claude-handoff/08-ens-escrow-design-decisions.md).
- Private pools, confidential amounts and proving artifacts: [09](../research/2026-11-03-claude-handoff/09-private-pools-confidential-amounts.md).
- Saved Chainlink primary JSON, hashes and the PR #72 continuation: [10](../research/2026-11-03-claude-handoff/10-chainlink-testnet-source-evidence.md).

The research introduced no application changes, dependency additions or deployment. It is ready for source-checked task selection; it is not a release qualification or permission to expand the supported product.
