# 03 Fiat price feeds and quote hardening

The seller signs a fiat price and its offer window. A payer with a qualified feed obtains a token estimate over their configured chain RPC. Only transaction and receipt verification establishes the cryptocurrency payment. The static Pages beta remains fixed-token only.

## Feed registry and qualification

The source catalogue contains four testnet listings: ETH/USD and USDC/USD on Ethereum Sepolia and Base Sepolia. Each has a proxy, answer decimals, heartbeat and dated source reference. None has pinned fork acceptance. Creation disables unsupported pairs in the full build, and checkout rejects a hand-crafted fiat invoice for an unqualified pair with `QUOTE_DISABLED`. The signed invoice format remains readable. Mainnet has no qualified feeds.

An operator proposes each qualification by PR with dated provider documentation, the exact chain and pair, a pinned block number and hash, and an independently sourced reference feed with its precision and freshness limit. L2 entries also need the verified same-chain sequencer address. Independent discovery and provider trust require review by two people. Fork replay cannot establish the independence of two markets. A Uniswap TWAP reader remains a later adapter.

1. Save the provider listing and network binding, retrieval date and hash in the source evidence. Update the registry provenance check when introducing a new source format.
2. Start the operator's archive fork at the proposed block with the original chain ID. Build the chain-adapters package. Set `FIAT_FORK_RPC` to the local fork URL and run `node scripts/verify-price-feeds.mjs --capture <chainId> <base> <quote>`. Review and save its output under `docs/chains/fiat-forks/<chainId>-<lowercase proxy>.json`. The capture checks chain, block hash, proxy code and real ABI reads at that block.
3. CI runs `node scripts/verify-price-feeds.mjs` without network access. It checks uniqueness and metadata against hashed source snapshots and replays every qualified pair's captured reads with the checkout validator. Missing or inconsistent evidence fails the check. Approval and release remain separate decisions.

## Price and conversion rules

- Bind the signed Chainlink source to the configured chain, asset and exact invoice currency. A missing feed, RPC failure, future timestamp, invalid round, nonpositive answer, mismatched decimals or excessive age blocks the quote. There is no cross-currency or stablecoin-parity fallback in checkout.
- Feed age is at most 110% of the documented heartbeat, rounded up in seconds and capped at seven days. An operator can impose a shorter relayer limit. Age exactly at the reader's limit is allowed. The relayer retains its stricter existing exclusive deadline.
- On Base, OP and Arbitrum a qualified source needs a sequencer that has been up for strictly more than one hour. Both primary and independent reference prices must be fresh. Their difference may be at most 1% of the lower price across different decimal scales. USDC/USD must lie in the inclusive 0.98–1.02 range.
- Convert fiat minor units with integer arithmetic. Round up to token base units for the payer. The reviewed floor applies the signed maximum slippage to the post-fee net, rounding the minimum upward with a one-base-unit floor. The final calldata, preview, fee and minimum net are checked against that request.
- The observed round, proxy, observation time, amount and exclusive expiry belong to one checkout estimate. The earliest of five minutes after observation by the app, either feed's freshness limit, the invoice expiry and the seller's offer expiry governs execution. The router and permit deadline precedes that expiry. Approval, signing and submission guard the current clock after asynchronous wallet checks. Repricing requires a new review.
- Relayer fixed pricing is restricted to development and testnets. Qualified feed mode binds the native/USD round ID into an authenticated v3 quote and caps the fee quote at the feed validity. Existing fixed-mode v2 tokens retain their format. Relayer gas reimbursement still assumes explicitly accepted USD-stable tokens at parity. Mainnet operation requires separate asset-risk, source and deployment qualification.

## Acceptance status

| Requirement | Evidence or gate |
| --- | --- |
| Creation and payment refusal | Actual catalogue pairs remain unavailable. Deterministic qualified fixtures exercise the successful path. The lean profile continues to reject fiat invoices. |
| Feed integrity, freshness and decimals | Mock RPC and local Anvil aggregator suites cover stale and invalid rounds, precision disagreement, sequencer recovery and reference deviation. |
| Exact conversion and authorization | Payer rounding properties and decoded payment tests cover token units, expiry, fees and minimum net. |
| Registry validation in CI | Offline source-hash and fork replay check for every qualified entry. |
| Relayer pricing | Mainnet configuration rejects a fixed native price. Feed quote tests exercise validity, signed round binding and refusal without fallback. |
| Fork acceptance and release | Zero qualified pairs. A dated real fork capture, source review, and release approval remain outstanding before enabling a particular pair. |

See [ADR-0012](../adr/ADR-LOG.md), the [dated source record](../chains/SOURCES-2026-11-04.md) and the [original guard verification](../handoffs/agents/TEAM_D_PRICE_GATES.md).
