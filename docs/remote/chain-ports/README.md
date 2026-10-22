# Chain ports: index

**Status:** research and spec only (2026-10-21, branch `claude/remote-extensions-6`). Base spec: `docs/MULTICHAIN_SPEC.md`; interface: `packages/chain-adapters/src/adapter.ts`.

## Documents

| Doc | Chain / rail | Verdict |
|---|---|---|
| [bitcoin.md](bitcoin.md) | Bitcoin (BIP-352) | see doc |
| [btc-family.md](btc-family.md) | Litecoin, Dogecoin, Bitcoin Cash and similar | see doc |
| [solana.md](solana.md) | Solana | see doc |
| [tron.md](tron.md) | Tron | see doc |
| [evm-extra.md](evm-extra.md) | Additional EVM chains | see doc |
| [ton.md](ton.md) | TON | see doc |
| [xrp.md](xrp.md) | XRP Ledger | see doc |
| [cardano.md](cardano.md) | Cardano | see doc |
| [monero-zcash.md](monero-zcash.md) | Monero, Zcash (hop only, no scheme port) | see doc |
| [lightning-ecash.md](lightning-ecash.md) | Lightning, Cashu, Fedimint (payment-hop options) | see doc |

## Verdict summary

Summarised from each doc by the coordinator; details and unverified lists live in the docs. "Built" = Phase 2 package exists with real tests (see each package README).

| Doc | Verdict | Adapter fit | Fee cap | Effort | Owner package |
|---|---|---|---|---|---|
| bitcoin.md | Feasible; adapter gap (EVM-shaped types, numeric chainId in invoice envelope) needs a chain-adapters change by another owner | Does not fit structurally today | all `not_enforceable`, no tip | S-M | existing `btc-silent-payments` (swarm 4) |
| btc-family.md | LTC conditional testnet spike only; BCH and DOGE no-go (no taproot) | Structural `family:'bitcoin'` shape | all `not_enforceable` | M (LTC), L (BCH/DOGE) | `packages/btc-family` (built, research-only for LTC/DOGE/BCH) |
| solana.md | Feasible; crypto PoC S, full port with program and audit L | Structural, `solana` already in union | `not_enforceable` until audited program | S / L | `packages/chain-solana` (built) |
| tron.md | Feasible, M, own adapter family | Needs `ChainFamily` extension | `not_enforceable` until fee contract | M | `packages/chain-tron` (built) |
| evm-extra.md | Feasible, S per chain; zkSync Era deferred (custom CREATE2) | Existing EVM adapter via config | enforced by router once deployed | S (zkSync L) | `packages/chain-evm-extra` (built) |
| ton.md | Feasible, spec only | Needs new family | not enforceable | M | future `packages/chain-ton` |
| xrp.md | Feasible for native XRP only | Needs new family | not enforceable | M | future `packages/chain-xrp` |
| cardano.md | Feasible | Needs new family | not enforceable without script step | M | future `packages/chain-cardano` |
| cosmos.md | Feasible, per-chain config cost | Needs new family | not enforceable without CosmWasm | M | future `packages/chain-cosmos` |
| monero-zcash.md | No scheme port; bridge/swap hop only | Hop side-interface | 0 bps | spec only | none |
| lightning-ecash.md | Payment-hop option, signet/mutinynet only | Hop side-interface | `not_enforceable` | spec only | future `packages/ln-hop` |

## Build order

1. `btc-family`
2. `chain-solana`
3. `chain-tron`
4. `chain-evm-extra`
5. Then specs only: the remaining docs (ton, xrp, cardano, monero-zcash, lightning-ecash). No code until a doc's verdict and PoC acceptance are signed off.

(Order as directed by the coordinator; each step is gated on its own doc's PoC acceptance list.)

## Shared principles

- **Testnet-only.** Every PoC runs on testnet, signet, regtest or equivalent. No mainnet use.
- **No deployments.** No contract, program, mint, node or service is deployed by these ports.
- **Fee capability honesty.** `FeeCapability` states only what is enforceable; never advertise a fee that cannot be collected (`MULTICHAIN_SPEC` section 4).
- **Adapter structural typing.** New chains satisfy `ChainAdapter` (or a side interface) structurally in their own package; no widening casts, no chain-mismatch fall-through.
- **No edits to existing packages.** New work lives in new packages; changes to `@ghostpay/chain-adapters`, `core-crypto` or `invoice-schema` need a separate ADR.
- **Source-access caveat.** Research sessions can reach only `raw.githubusercontent.com` and `registry.npmjs.org`. Claims from other sites are secondary and marked unverified; every doc lists sources with retrieval date and an unverified list.
- **No invented facts.** Mark anything not read from a primary source as unverified.
