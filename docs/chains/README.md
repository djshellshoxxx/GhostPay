# Chains

Per-chain research notes (source URL + date). One file per chain. Read [CHECKLIST.md](CHECKLIST.md) before enabling any mainnet. Notes do not mean a chain is enabled; enablement is decided in code (`packages/chain-adapters/src/config/chains.ts`, `packages/tron-adapter`, `packages/solana-stealth`, `apps/web/src/features/btc/network.ts`).

| File | Chain |
|---|---|
| [ethereum.md](ethereum.md) | Ethereum |
| [base.md](base.md) | Base |
| [optimism.md](optimism.md) | OP Mainnet |
| [arbitrum.md](arbitrum.md) | Arbitrum One |
| [polygon.md](polygon.md) | Polygon PoS |
| [bnb.md](bnb.md) | BNB Smart Chain |
| [avalanche.md](avalanche.md) | Avalanche C-Chain |
| [bitcoin.md](bitcoin.md) | Bitcoin (BIP-352 silent payments) |
| [solana.md](solana.md) | Solana (proof of concept) |
| [token-notes.md](token-notes.md) | Token behaviour notes (blacklists, permit, approve quirks) |
| [CHECKLIST.md](CHECKLIST.md) | Per-chain mainnet enablement checklist |

There is no `tron.md` yet. TRON notes live in [`packages/tron-adapter`](../../packages/tron-adapter/) and the user guide [TRON payments](../user/tron-payments.md).
