# ADR-0016: Multichain configuration expansion

Status: Accepted. Date: 2026-10-21. Gaps: G-03, G-24.

Context: Proof of concept must cover the popular EVM chains. Token and feed data could not be verified from issuer or Chainlink pages in this environment (direct fetches blocked; web-search snippets only).

Decision:
1. Testnets enabled: Ethereum Sepolia, Base Sepolia, OP Sepolia, Arbitrum Sepolia, Polygon Amoy, BNB testnet (97), Avalanche Fuji. All mainnets present with `enabled: false`.
2. Token allowlist only contains Circle USDC/EURC testnet addresses seen on the issuer page via search snippets; flagged for re-check. No mainnet token, no USDT/DAI/PYUSD/FDUSD/WETH/WBTC until verified (docs/chains/token-notes.md).
3. `TokenConfig` gains `blacklistCapable` and `nonStandardApprove` flags.
4. `FEEDS` stays empty; the "Fiat price" option in CreateInvoice is hard-disabled (not warned) while `FEEDS` is empty.
5. Mainnet enablement requires docs/chains/CHECKLIST.md.

Consequences: Wider testnet surface for the PoC; no unverified financial data ships. Bitcoin and Solana are non-EVM and out of scope for this config (separate adapters).
