# 03 Fiat price feeds and quote hardening

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
