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
| [tron.md](tron.md) | TRON (TRX and TRC-20, proof of concept) |
| [token-notes.md](token-notes.md) | Token behaviour notes (blacklists, permit, approve quirks) |
| [CHECKLIST.md](CHECKLIST.md) | Per-chain mainnet enablement checklist |

TRON code lives in [`packages/tron-adapter`](../../packages/tron-adapter/); see also the user guide [TRON payments](../user/tron-payments.md).

## Non-EVM and account-abstraction compatibility matrix (2026-11)

Assessed separately from the EVM beta; none of these blocks it. Details, evidence and defects: [QUALIFICATION-2026-11.md](QUALIFICATION-2026-11.md).

| Chain | Status | CI integration | Mainnet | Est. work remaining |
|---|---|---|---|---|
| Bitcoin silent payments | tested locally; regtest CI | bitcoind regtest | disabled | ~35% (header chain and spend tracking in unmerged PRs) |
| Bitcoin PayJoin | implemented; not wired to the app | none | not representable | ~60% |
| Solana | tested locally; local-validator CI | solana-test-validator | disabled | ~40% |
| Tron | tested locally (mock RPC) | none | disabled | ~55% |
| ERC-4337 (PH-4) | implemented; not wired to any app | Foundry/anvil only | testnet allowlist | ~70% (library); service integration not started |
