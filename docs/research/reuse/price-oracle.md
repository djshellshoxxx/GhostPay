# Reuse research: price-oracle

Scope: Chainlink AggregatorV3 + staleness checks, Pyth, RedStone clients, Uniswap v3 OracleLibrary licence check.
Mode: read-only. No clone, no install, no code copied into repo. Only this file written.

## Verification limits (read first)

- GitHub API (`api.github.com`) returned HTTP 403 to WebFetch. `gh api` returned "GitHub access to this repository is not enabled for this session" for all four repos. `add_repo` was NOT called (would change session repo access).
- Commit SHAs and last-commit dates: NOT VERIFIED. The GitHub HTML pages did not show them to the fetcher.
- Star counts come from the GitHub HTML page via WebFetch (small-model paraphrase). Treat as approximate. The Pyth value (249) looks low and is unverified.
- Licence text was read from raw.githubusercontent.com `LICENSE` files and per-file SPDX headers, via WebFetch. Fetch results are model-summarised, not byte-exact copies.
- Several planned paths returned 404 (noted per row). Those files are unverified.

## Repo inventory (what GhostPay already has)

- `packages/chain-adapters/scripts/abi-src/AggregatorV3Interface.sol`: SPDX MIT, minimal AggregatorV3 interface (decimals, description, version, getRoundData, latestRoundData). Written as a public-interface ABI source.
- `packages/chain-adapters/src/abi/chainlinkAggregator.ts`: GENERATED ABI (`scripts/gen-abi.sh`). Do not hand-edit.
- `apps/relayer/src/pricing.ts` line 68: native coin price is an operator-configured fixed USD value per chain, "no oracle in v1".
- No Pyth or RedStone code exists in the repo.

## Candidate table

| # | Repo | Licence (verified how) | SHA / last commit | Stars | Maintained? | Worth reusing | Deps |
|---|---|---|---|---|---|---|---|
| 1 | https://github.com/smartcontractkit/chainlink | Root `LICENSE`: "Portions ... MIT (The MIT License (MIT))" and "Some directories are instead licensed under Business Source License 1.1" (raw.githubusercontent.com/smartcontractkit/chainlink/develop/LICENSE, fetched). `contracts/LICENSE` on develop and master: 404 (unverified). Interface file path `contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol` on develop: 404 (unverified). | NOT VERIFIED | 8.3k (page) | Yes, very active (org-level, not verified by date) | Only the AggregatorV3Interface ABI shape (already in repo). Staleness pattern = `updatedAt` vs per-feed heartbeat (general pattern, not copied code). | none for interface |
| 2 | https://github.com/pyth-network/pyth-crosschain (Solidity SDK at `target_chains/ethereum/sdk/solidity/`) | Root `LICENSE`: "Copyright 2025 Pyth Data Association. Licensed under the Apache License, Version 2.0" (fetched). Per-file: `PythStructs.sol` header `// SPDX-License-Identifier: Apache-2.0`, `pragma solidity ^0.8.0;` (fetched). Sub-dir `LICENSE` returned 404 (unverified sub-licence). | NOT VERIFIED | 249 (page, suspect) | Yes (Pyth org active; Solidity SDK moved from pyth-sdk-solidity into this monorepo per Pyth forum thread, not verified) | `PythStructs.sol` (Price, PriceFeed, TwapPriceFeed structs, verified fields: price int64, conf uint64, expo int32, publishTime). IPyth interface and `getPriceNoOlderThan` pattern (IPyth.sol / AbstractPyth.sol NOT fetched, unverified). | Pull model: caller must pay `getUpdateFee` and call `updatePriceFeeds` |
| 3 | https://github.com/redstone-finance/redstone-oracles-monorepo (`packages/evm-connector`) | Root `LICENSE`: Business Source License 1.1 (fetched). `packages/evm-connector/LICENSE`: 404 (unverified). Search snippet said ISC for an old deprecated JS `redstone-evm-connector` package (jsDelivr; not verified, different package). | NOT VERIFIED | not fetched | Unverified | Nothing copyable under BUSL-1.1 unless a per-package licence proves otherwise. | npm `@redstone-finance/evm-connector` (licence not verified) |
| 4 | https://github.com/Uniswap/v3-periphery (`contracts/libraries/OracleLibrary.sol`) | File SPDX: `// SPDX-License-Identifier: GPL-2.0-or-later` (raw.githubusercontent.com/Uniswap/v3-periphery/main/contracts/libraries/OracleLibrary.sol, fetched). Repo `LICENSE`: GNU GPL v2, June 1991 (fetched). Pragma `>=0.5.0 <0.8.0`. | NOT VERIFIED | 1.3k (page) | Page shows repo active; last commit not verified | Functions: consult, getQuoteAtTick, getOldestObservationSecondsAgo, getBlockStartingTickAndLiquidity, getWeightedArithmeticMeanTick, getChainedPrice. Algorithm reference only. | imports FullMath, TickMath, IUniswapV3Pool from @uniswap/v3-core (BUSL-1.1 core, per search snippet; unverified here) |

Notes on licence traps:
- Row 4 is GPL-2.0-or-later. Copying into GhostPay would make the file GPL. GhostPay licence is not stated in this research, so treat as copyleft = reference only.
- Row 1 chainlink repo mixes MIT and BUSL-1.1 by directory. Do not assume the repo-level MIT claim applies to `contracts/`.
- Row 3 root is BUSL-1.1. BUSL is not an open-source licence; no copying.
- Pyth row 2 is Apache-2.0 at root and per-file header. Apache-2.0 allows copy with NOTICE/attribution. Verify sub-directory LICENSE and NOTICE before copying.

## Recommendation

Overall decision: **adapt** for Pyth, **reference-only** for the rest, and **none** for Uniswap TWAP code.

1. Chainlink (row 1): **reference-only for code; keep existing ABI**. Reuse the existing `packages/chain-adapters/scripts/abi-src/AggregatorV3Interface.sol` (self-declared MIT). Do not pull `contracts/` from the chainlink repo until `contracts/LICENSE` is verified. Write the staleness check yourself (about 15 lines).
2. Pyth (row 2): **adapt** `PythStructs.sol` and `IPyth.sol` (Apache-2.0, after verifying those two files' headers and the sub-dir LICENSE). Keep attribution and NOTICE. Alternative: **depend** on the published npm/Forge package after checking its licence.
3. RedStone (row 3): **none** for now (BUSL-1.1). Revisit only if a per-package LICENSE shows a permissive licence.
4. Uniswap OracleLibrary (row 4): **none to copy** (GPL-2.0-or-later). Implement TWAP math from the Uniswap v3 oracle docs in a clean-room way, with tests against a fork of a known pool.

## Concrete integration plan for GhostPay

Target path: `packages/price-oracle/` (new package, matches existing `packages/*` layout).

API shape (TypeScript, off-chain consumer; Solidity side in `packages/price-oracle/contracts/`):

```ts
export interface PriceQuote { priceUsd: bigint; decimals: number; updatedAt: number; source: 'chainlink' | 'pyth'; }
export interface PriceOracle {
  getUsdPrice(asset: `0x${string}`, chainId: number): Promise<PriceQuote>; // throws StalePrice | NoFeed
}
export class StalePriceError extends Error {}
```

- Chainlink reader: use existing generated ABI `packages/chain-adapters/src/abi/chainlinkAggregator.ts` (import, do not regenerate by hand). Staleness: revert/throw when `now - updatedAt > heartbeat[feed]`, with heartbeat per feed from config (not a single global value). Reject `answer <= 0`. Reject `answeredInRound < roundId`.
- L2 sequencer check (Arbitrum/Optimism/Base): read sequencer uptime feed, enforce grace period. Pattern only; implement from Chainlink docs.
- Pyth reader: pull model. Fetch VAA/update data off-chain, call `updatePriceFeeds` with fee, then `getPriceNoOlderThan(id, maxAge)`. Ported structs from `PythStructs.sol` only if licence check passes.
- Uniswap TWAP (optional fallback): clean-room `observe()` math, no GPL code.

Tests (`packages/price-oracle/src/*.test.ts` and Foundry `test/`):
- Stale feed (updatedAt older than heartbeat) throws StalePriceError.
- Zero or negative answer throws.
- Round-id mismatch (answeredInRound < roundId) throws.
- Decimals normalisation (8-dec Chainlink vs 18-dec quote) gives exact bigint result.
- Sequencer down or in grace period blocks reads on L2.
- Pyth: `getPriceNoOlderThan` reverts on old publishTime; fee underpayment reverts.
- Mock aggregator and mock Pyth in tests; no network calls in unit tests.

Wiring: `apps/relayer/src/pricing.ts` currently uses fixed native price (line 68). Swap behind `PriceOracle` interface in a later change, gated by config. Do not change the v1 fixed-price path in this step.

## Risks

- Supply chain: none of the candidate code is installed or vendored by this research. Any npm/Forge dependency needs a lockfile pin and a licence check on the exact version.
- Abandonment: Pyth Solidity SDK location moved (forum thread referenced repo move). Pin to a commit SHA once verified; do not track `main`.
- Licence traps: GPL (Uniswap), BUSL (RedStone root, Chainlink non-MIT dirs). Mixed-licence repos (Chainlink) need per-directory checks.
- Oracle manipulation and staleness: a single heartbeat across feeds is wrong. Per-feed config required.
- Unverified items to close before any copy: Chainlink `contracts/LICENSE` and interface path; Pyth `IPyth.sol` / `AbstractPyth.sol` headers and sub-dir LICENSE; RedStone per-package LICENSE; all commit SHAs and dates; `add_repo` access if clone-level verification is needed.

## Next actions (not done in this run)

1. Obtain GitHub read access (add_repo or a public mirror) to verify the unverified rows, or run `gh api` once access is granted.
2. Check the Pyth SDK `LICENSE`/`NOTICE` and `IPyth.sol` header.
3. Decide Pyth adapt vs depend.
