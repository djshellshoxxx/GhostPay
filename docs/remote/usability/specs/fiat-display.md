# Spec: fiat-display: Fiat display and privacy-safe price source
Impact 4/5 | Effort M | Score 2 | Build wave 0 | Depends on: none

## Problem
Users think in fiat but see only token units; fiat-priced invoices cannot be paid (no feeds, quote.ts:36 FEEDS empty; DEVIATIONS item 4); only USD-style 2-decimal minor units are handled (format.ts:41-56).

## Exists today (verified in repo) vs missing
- packages/chain-adapters/src/quote.ts:36,46,123,152 FEEDS table, findFeed, fiatToTokenAmount, createAggregatorReader (on-chain Chainlink read through the user RPC).
- apps/web/src/lib/format.ts:41-56 fiatDecimals/formatFiat.
- apps/web/src/lib/pay.ts:128-141 fiat_quote path.
- Missing: everything described under Design.

## Design
Display-only approximation layer, never used to compute payable amounts. Sources in priority: (1) on-chain feed via the user RPC (existing aggregator reader, once FEEDS is populated and verified), (2) user-entered manual rate per pair, (3) cached last-good rate with age label. NO third-party price API by default; an optional user-configured HTTPS rate URL may be added via the network-privacy transport and is labelled "this host learns your IP and pair". Offline: show cached rate with "as of" age and a stale badge >1 h; no rate -> show nothing rather than guess. Currency display via formatFiat extended with Intl-free table of minor-unit exponents (ISO 4217 incl. 3-dec BHD/KWD).

## Privacy and security impact
Fetching a price from a vendor reveals IP and interest; default path uses RPC the user already chose. Cache holds only pair, rate, timestamp (no amounts).

## Build ownership
- NEW package: `packages/fiat-display` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/fiat-display`.
- Public API (exports from `src/index.ts`):
- `convertDisplay(tokenAmount: bigint, decimals, rate: Rate): {minor: bigint; currency}  // floor, display only`
- `rateFromFeed(answer: bigint, feedDecimals): Rate`
- `isStale(rate, nowSec, maxAgeSec): boolean`
- `fiatExponent(code): 0|2|3`
- `type Rate = {pair; num: bigint; den: bigint; asOf: number; source: "chain"|"manual"|"cache"|"url"}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/lib/format.ts (extend fiatDecimals via package)
- apps/web/src/views/Pay.tsx, Sweep.tsx, Scan.tsx (secondary fiat line)
- apps/web/src/views/Settings.tsx (manual rates, optional URL)
- Add `@ghostpay/fiat-display` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **FIATD-1** MUST All conversion uses bigint rationals; no Number for money.
2. **FIATD-2** MUST Displayed fiat is always labelled "approx." and never feeds payment amount computation.
3. **FIATD-3** MUST Stale or missing rate hides the fiat line.
4. **FIATD-4** MUST No request to any host the user did not configure.
5. **FIATD-5** MUST Exponent table covers 0/2/3-decimal ISO currencies.
6. **FIATD-6** SHOULD Round half-up for display, floor for conservative receivable values; label which.

## Acceptance tests
1. **T-1** 1 ETH at rate 2000.00 USD -> 200000 minor units.
2. **T-2** JPY exponent 0, BHD exponent 3 formatted correctly.
3. **T-3** Rate older than maxAge -> isStale true and UI shows no fiat.
4. **T-4** Network spy: zero fetches when source is manual/cache.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
