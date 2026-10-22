# 09 Chain, token, announcer/registry matrix and version pins

Priority P1 | Effort M (3-4 d docs+code) | Owner: chain-adapters + docs | Deps: network access for primary-source verification (owner/operator)
Sources: research DOC-3, DOC-5, DOC-7, DOC-14, DOC-19; ADR-0011; MULTICHAIN s2; DEV P6/R6.

## 1. Deliverables
1. `docs/operators/chain-matrix.md` + machine-readable `packages/chain-adapters/config/matrix.json`:
```json
{ "chainId": 8453, "announcer": {"address":"0x5564...","codehash":null,"verified":false,"source":null,"retrieved":null},
  "registry": {...}, "gasToken":"ETH", "getLogsMaxRange": null, "finalityDepth": null,
  "tokens":[{"symbol":"USDC","address":null,"decimals":6,"permit":"erc2612|dai|none|unknown","eip3009":"unknown","blacklist":"unknown","verified":false}] }
```
Every cell is tri-state (`verified`, `unverified`, `n/a`) with source URL and retrieval date. Initial values from research: ScopeLift README lists Ethereum, Arbitrum, Base, Gnosis, Optimism, Polygon, Scroll for announcer/registry (retrieved 2026-10-21); BNB Chain and Avalanche **UNVERIFIED**; DAI-style permit and USDT no-permit **UNVERIFIED** at token-source level.
2. CI check: a chain with `enabled:true` requires all its announcer/registry/token cells `verified:true` (ADR-0011 checklist link).
3. **Pin record** (DOC-19) per deployment: `(chainId, factory, implementationCodehash, policyRouter, router, relayer, announcer)` stored in manifest and compiled into scanner config; scanner ignores policy-scheme announcements whose pins don't match.
4. Re-run research for DOC-5 (eips.ethereum.org, magicians) when reachable; record outcome in `docs/remote/research-addendum.md`.
5. ADR-0016 "ScopeLift reference contracts used as deployed; no published audit" (shared with spec 06).
6. Checklist items: no `tx.origin`; domain separator rebuilt on chainId change (verify vendored OZ 5.6.1 source; claim **UNVERIFIED** until read).

## 2. Threats
Wrong token address typo (two-person verification, fork test of `decimals/symbol/permit`); announcer address collision/impostor (codehash gate, spec 01); stale matrix (nightly job re-reads codehashes via RPC and fails).

## 3. Tests / acceptance
Schema validation test; lint that enabled chains are fully verified; nightly codehash job (mock in CI). Acceptance: [ ] matrix covers all 9 chains in `chains.ts` with honest tri-state; [ ] no `verified:true` without source+date; [ ] ADR-0016 merged.
