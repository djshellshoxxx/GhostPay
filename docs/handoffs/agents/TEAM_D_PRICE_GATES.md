# Team D quote protections — 2026-11-16

- Repository: `djshellshoxxx/GhostPay`.
- Branch: `codex/unified-price-gates`.
- Base: `b0b7afa9de68510b821cc702a0f82847a205495b`.
- Implementation source: `d7b12e69a18426e112c29fa55d47dab102659420`.
- Owner: price_gates worker using Caveman investigation, regression-first implementation and scoped verification.
- Integration owner: root coordinator. No remote ref, dependency, production feed, contract, web caller or relayer protocol was changed.

## Implementation

`packages/chain-adapters/src/quote.ts` extends the already exported `readPrice` with optional, explicit protections:

1. `sequencerFeed` is read before the price. It must be a distinct nonzero address on the same chain, return initialized valid status data, report up, and have been up for **more than** 3600 seconds. Exactly 3600 seconds is refused. A long-running up status is not rejected merely because its status-change timestamp is old.
2. `reference` supplies a separate reader, distinct feed address, expected decimals and freshness limit for the same asset/currency. The existing price validation is reused. Difference greater than 1% of the lower price is refused. Different precision uses bigint cross multiplication with no floating-point conversion. Source independence and asset/currency identity remain operator verification requirements.
3. `enforceUsdPeg` explicitly requires the validated price to remain within inclusive $0.98–$1.02. It is appropriate only for an intentionally configured USD-pegged asset.
4. Quote clock/skew values are bounded before reads. `fiatToTokenAmount`, which is also callable without `readPrice`, now validates price precision and int256 answer bounds before exponentiation.

Malformed configuration and unsuccessful reads fail closed; remote exception details are not surfaced. No fallback reader,
endpoint, feed or price is selected. Existing calls retain their previous behavior unless a guard is explicitly configured.
All mainnet feeds remain absent from the registry; this does not enable any chain or production pricing path.

## Verification

| Source | Check | Result |
|---|---|---|
| New regression file before implementation | Focused quote guards | 14 failed, 3 passed, establishing that the existing reader ignored guard options and conversion accepted invalid precision. |
| `d7b12e69` | Existing quote suite plus new guard/property tests and compiled mock-aggregator Anvil tests; `REQUIRE_ANVIL=1` | 46 passed across 3 files, zero failures/skips. Counts include 5 native-suite checks. |
| Same | Focused coverage of `src/quote.ts`, original thresholds unchanged | 100% statements/branches/functions/lines for this one file. This is not whole-package coverage. |
| Same | Chain-adapters build, including core-crypto/invoice-schema prerequisites | Passed. |
| Same | Focused ESLint for all 3 changed source/test files | Passed. |
| Same | Full chain-adapters TypeScript check, including tests | Passed. |
| Same | Independent final-review source inspection and `quote.guards.test.ts` rerun | 19/19 passed; no additional source blocker. Clearance covers optional helper implementation only. |

The native tests compile a test-only Solidity 0.8.28 mock with the existing verified local compiler and install its
runtime only into a disposable Anvil instance. They execute actual ABI calls for healthy matching prices, stale/negative/
zero/regressed rounds, decimals mismatch, sequencer outage/grace and reference/depeg rejection. They do not connect to
public networks, deploy production contracts or certify Chainlink feed provenance.

## Research and reuse

Reused the existing `AggregatorReader`, `createAggregatorReader`, price validation, RPC transport, ABI and conversion
math. No dependency or external source code was imported. Current primary documentation was checked on 2026-11-16:

- [Chainlink L2 Sequencer Uptime Feeds](https://docs.chain.link/data-feeds/l2-sequencer-feeds): status and recovery timestamp semantics, 3600-second example grace, and uninitialized Arbitrum timestamp behavior.
- [Chainlink Data Feeds API Reference](https://docs.chain.link/data-feeds/api-reference): aggregator ABI and decimal precision.

The 1% reference and 2% peg thresholds come from GhostPay specification 03, not from a claimed universal Chainlink policy.

## Remaining requirements and concrete next actions

- Obtain verified same-chain sequencer and independent reference-feed configuration, asset/currency mapping and real
  fork/testnet acceptance before configuring the web or relayer consumers. This change provides reusable enforcement;
  it does **not** claim that the existing web caller activates these optional guards.
- A same-provider second feed cannot prove independent price discovery, and latest-state offchain reads are not an
  atomic contract transaction. Verify selected reader/provider trust and invocation timing for each consumer.
- The later Uniswap TWAP source remains unimplemented; an adapter must supply verified pricing for the same asset
  and quote currency. The generic aggregator reference seam is not a TWAP implementation.
- Relayer v1 still uses `FixedStablePriceSource`. Replacing that with native/USD feed pricing requires sourced feeds,
  a cache/freshness policy, and the specified signed `priceRoundId` protocol plus consumer compatibility. No signed
  quote ABI was silently changed. Mainnet qualification remains blocked on those requirements.
- Signed quote provenance/round ids and TTL are not added to the returned `Price` by this guard change. The primary
  price keeps its existing shape; a complete provenance envelope is a separate consumer/protocol requirement.
- Integrate after independent review, rerun the final candidate package/build/web checks, then record exact published
  source and hosted CI in the authoritative master ledger. Optional helpers alone do not complete specification 03.
