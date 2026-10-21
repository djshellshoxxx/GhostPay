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

_Coordinator to fill after all docs land._

| Doc | Verdict | Adapter fit | Fee cap | Effort | Owner package |
|---|---|---|---|---|---|
| bitcoin.md | | | | | |
| btc-family.md | | | | | |
| solana.md | | | | | |
| tron.md | | | | | |
| evm-extra.md | | | | | |
| ton.md | | | | | |
| xrp.md | | | | | |
| cardano.md | | | | | |
| monero-zcash.md | | | | | |
| lightning-ecash.md | | | | | |

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
