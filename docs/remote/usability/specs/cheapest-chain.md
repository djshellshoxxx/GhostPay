# Spec: cheapest-chain (ux-fees)

Module: `packages/ux-fees/src/cheapest.ts`, `suggestCheapestChain`.

## Requirements
1. **Input** is plain data (`ChainFeeQuote[]`) shaped after chain-adapters `ChainConfig` + `FeeCapability` + `calculateBuffer` inputs. No import from that package.
2. **Cost** per chain = worst-case network fee `gasUnits * maxFeePerGas` (native wei) + checkout fee `floor(gross * bps / 10_000)` in token units (0 if `not_enforceable`). All bigint.
3. **Fiat is optional**, via injected `CheapestRates` (native price per symbol, token price). Fiat micro-units (1e-6 major) are rounded UP. Used only when every qualifying chain is fully priced with fresh rates.
4. **Fallback**: if all qualifying chains share one native asset, compare network fee in native wei (`native` mode; warn if token fees differ). Otherwise `incomparable`: no winner is invented.
5. **Exclusions (data, not exceptions)**: invalid quote, duplicate chain id (all copies), disabled chain, checkout `not_deployed`, stale (`now - quotedAt > maxQuoteAge`, default 120 s), future-dated (> skew 60 s), recipient-unsupported.
6. **Rate staleness**: rates older than `maxRateAge` (default 3600 s), future-dated or invalid are ignored with a warning.
7. **Tie-break**: chains within `tieToleranceBps` (default 100) of the cheapest form a group; preferred chain wins, else lowest time-to-finality, else lowest chain id.
8. **Explain-why keys** (`fees.cheapest.why.*`, `.excluded.*`, `.warn.*`, `.note.*`) with plain params; stay/switch suggestion vs `currentChainId` using `switchThresholdBps` (default 500).
9. Pure: no clock, no randomness, no I/O. Output is advice only.

## Acceptance tests (implemented in `cheapest.test.ts`)
- AT-1 Two chains, ETH at $2000, 100 USDC, 25 bps: network 7_200_000 / 12_000 micro, token fee 250_000 micro, totals 7_450_000 / 262_000, winner chain 2, savings 7_188_000.
- AT-2 Fiat rounding up (1 wei -> 1 micro). AT-3 Mixed natives via rates (POL 7_500 micro).
- AT-4 Tie by preference; by speed; by id; outside tolerance the cheaper wins.
- AT-5 Stay/switch thresholds (3.6 % saving -> stay; 7.18 USD saving -> switch); unavailable current chain warns.
- AT-6 Stale/future/missing token rate -> native mode or incomparable with warnings; prototype-key symbols ignored.
- AT-7 Each exclusion reason; 19 adversarial malformed quotes all excluded as `invalid_quote`; stray `checkoutBps` on non-enforced chain rejected.
- AT-8 Structural errors throw `UxFeesError` (non-array, >64, negative gross, bad options).
- AT-9 fast-check: winner within tolerance of true minimum; ranking is a permutation; `bestChainId === ranked[0]`.

## Non-goals
Fetching quotes or rates; choosing the chain automatically (the user confirms); cross-chain bridging costs; MEV or inclusion probability.
