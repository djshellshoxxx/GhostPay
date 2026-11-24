# 03 Fiat price feeds and quote hardening

> **2026-11-16 supporting implementation:** `readPrice` now accepts an explicit same-chain `sequencerFeed`, a separately configured `reference` reader/feed and `enforceUsdPeg`. These enforce sequencer-up status after a strict 3600-second recovery grace, fresh reference prices within 1% of the lower price, and the inclusive USD $0.98–$1.02 range. Callers must supply verified feed provenance and matching asset/currency; different feed addresses do not prove independent sources. No new feed address or production activation is included. Existing configured feed-decimal checks remain enforced. Tests include a compiled mock aggregator on Anvil; real-feed fork acceptance, consumer configuration and relayer signed pricing integration remain pending. See [Team D handoff](../handoffs/agents/TEAM_D_PRICE_GATES.md).

Priority P0 (disable, S) then P2 (feeds, M) | Owner: chain-adapters + web | Deps: verified feed addresses (network-gated, owner/operator)
Sources: ADR-0012; gap-analysis items 3, 7, 14; audits G-03, R-03, G-26; `quote.ts`.

## 1. Stage A (immediately, 0.5 d)
Hide/disable "Fiat price" in `CreateInvoice.tsx` whenever `FEEDS[chainId][token]` is empty (derive from `isQuoteAvailable(chainId, token)`); keep Pay fail-closed. Tests: option absent for all current chains; Pay refuses a hand-crafted `fiat_quote` invoice with code `QUOTE_DISABLED`.

## 2. Stage B: feed registry and reads
```ts
interface FeedEntry { chainId: number; base: string; quote: 'USD'; aggregator: Address; decimals: number; heartbeatSec: number; maxAgeSec: number /* heartbeat*1.1+grace */; sources: {url: string; retrieved: string}[]; verified: boolean }
```
- Entries added only by PR with docs.chain.link source and retrieval date; CI lint rejects entries with `verified:false` on enabled chains. No feed addresses are given in this repo today: all are **UNVERIFIED**.
- Read `latestRoundData` and `decimals()`; reject answer<=0, `updatedAt==0`, `answeredInRound<roundId`, age>maxAge, decimals mismatch, result overflow.
- L2 sequencer uptime feed (Arbitrum/OP/Base): require status up and `now - startedAt > 3600s` (grace); feed addresses UNVERIFIED.
- Second source (`uniswap-twap`, later): relative deviation >1% between sources blocks payment (fail closed).
- `fiatToTokenAmount` rounds up for payer (ADR-0012 item 2); quote object carries source, round id, timestamp, token amount, expiry (<=5 min) and the router `minNet` derived from it with explicit slippage.
- Relayer: replace operator constants (`pricing.ts`) with the same registry for native/USD plus per-quote TTL; quote signed fields include `priceRoundId`. Required before mainnet.

## 3. Threats
Stale/frozen feed; L2 sequencer outage; depeg of USD stablecoin (token treated as $1.0 only for allowlisted stablecoins; add optional depeg guard: stablecoin/USD feed deviation >2% blocks); feed address typo or malicious PR (two-reviewer rule + fork test); user-visible quote vs executed amount (calldata assertion).

## 4. Tests
Mock aggregator contract on anvil: stale, negative, zero, round regression, decimals 8/18, sequencer down, grace window. Property: rounding never underpays the seller by more than 1 base unit. Fork/testnet test against each real feed before `verified:true`.

## 5. Acceptance
- [ ] Stage A shipped and tested. - [ ] Registry lint in CI. - [ ] Every enabled fiat path has fork test. - [ ] Relayer pricing reads registry; static constants removed for mainnet profiles. - [ ] ADR-0012 status updated.
