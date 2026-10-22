# 13 Feature 1 gas buffer v2 (fiat estimate, simulation, permit+buffer)

Priority P3 | Effort M (4 d client) + L (contract, needs audit) | Owner: web, chain-adapters, contracts | Deps: 03, 04, 09; CONTRACTS_SPEC first for any contract change
Sources: Roadmap Feature 1; CONTRACTS_SPEC s1/s3; gap-analysis table (Feature 1 partial).

## 1. Client (no contract change)
- `GasBufferQuote` per Roadmap; `estimatedSweepGas` from token-specific simulation (anvil/`eth_estimateGas` of a sweep from a funded dummy) with per-token default table, fail closed when simulation unavailable and token has hooks.
- Fiat estimate from spec 03 native/USD feed (hidden when feed unverified).
- Re-estimate at confirm; reject quote older than 60 s; cap at invoice `maxBufferWei`; show native + fiat + public-linkage notice; never auto-submit.
- Invoice schema addition (new schema version, ADR): `bufferPolicy {accepted: bool, maxWei: string, minWei: string, refund: 'none'}`; refund fixed at none (Roadmap: no silent refunds).
## 2. Permit + buffer (contract change, deferred)
Propose `payERC20WithPermitAndBuffer(...)` = permit then buffer path in one call. Must follow router rules (nonReentrant, try/catch permit per spec 04, `msg.value <= maxBufferWei`, no fee on buffer, metadata strict). Requires spec change, fuzz/invariant additions (router holds zero tokens and zero ETH), re-audit, new manifest version. Alternative without contract change: two-step (approve/permit via separate tx) - rejected as extra linkage.
## 3. Threats
Underfunded buffer (conservative multiplier, clear message); buffer dust griefing (min policy); fee spike after inclusion (documented); simulated vs actual gas drift (calibration test); native-transfer failure to stealth contract (stealth is EOA; revert atomically).
## 4. Tests
Table: buffer omitted/exact/over-max/stale/fee spike/unsupported token/sweep estimate failure; calldata equals preview; anvil e2e sweep using only buffered gas.
## 5. Acceptance
- [ ] Client items shipped with tests. - [ ] Contract item only after CONTRACTS_SPEC edit + audit. - [ ] Release checklist of Roadmap F1 ticked.
