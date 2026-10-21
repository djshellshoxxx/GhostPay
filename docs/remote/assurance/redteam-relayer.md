# Red-team: relayer (apps/relayer)

Attacker model: network access to the HTTP API + ability to sign EIP-712 orders with keys the
attacker controls. Method: real `apps/relayer/dist` server (server.ts + service.ts + limiter +
breaker + lane) wired via `buildRelayer` to an in-memory `FakeChain`, driven over HTTP.
Scratch: `/tmp/claude-0/assure-relayer/poc/` (`harness.mjs`, `breaker_latch*.mjs`, `battery*.mjs`,
`rpc.mjs`). Each repro: `cd /tmp/claude-0/assure-relayer/poc && node <file>`.

## Findings

### F1 — Circuit breaker latches permanently in `half_open` → per-chain DoS (MEDIUM)
`breaker.allow()` moves `open → half_open` and lets exactly one probe through. The probe's outcome is
recorded only by the `op()` wrapper and the explicit trip/record calls in `runJob`. Several code paths
in `runJob` throw a `RelayerError` **between** `allow()` and any record call, recording nothing:
- `gasPrice()` → `gas_price_too_high` (service.ts:312) — not wrapped by `op()`, no record;
- `simulateSweep` `SimulationRevert` → `revertToError` (service.ts:344) — no record;
- `gasLimit > maxGasLimit` → `gas_limit_too_high` (service.ts:347);
- `budget.reserve` fail → `budget_exhausted` (service.ts:350).

After such a probe the breaker stays `half_open`. In that state `allow()` matches neither branch and
returns `false` for every subsequent call (breaker.ts:41-48), while `isBlocking()` returns `false`
(breaker.ts:37, state !== 'open'). So all later sweeps pass the pre-lane gate, enter the lane, then get
`503 breaker_open` in `runJob` — forever, until process restart. A transient incident becomes a
permanent outage for that chain.

Attacker leverage: `GET /healthz` publicly exposes per-chain breaker state, so an attacker can watch a
breaker recover and race a sweep whose **simulation reverts** (trivial: reuse a nonce →
`NonceAlreadyUsed`, or any failing order) into the single probe slot to latch it. Simulation reverts do
not themselves open the breaker, but they do latch one that is already mid-recovery.

Evidence (gas-spike probe variant):
```
step1 trip: 503 breaker_open [{"breaker":"open"}]
step3 probe: 503 gas_price_too_high [{"breaker":"half_open"}]
step4 healthy-traffic: served=0 blocked=6 firstErr=503 breaker_open [{"breaker":"half_open"}]
RESULT: VULNERABLE — breaker latched half_open; per-chain DoS until restart
```
Evidence (attacker-timed reverting-probe variant):
```
breaker after incident: [{"breaker":"open"}] (state is exposed via /healthz)
probe (reverting sweep): 422 token_transfer_failed [{"breaker":"half_open"}]
honest traffic (chain healthy): served=0 blocked=6 firstErr=503 breaker_open
RESULT: VULNERABLE — reverting probe latches breaker half_open; per-chain DoS
```
Repro: `node breaker_latch.mjs` and `node breaker_latch_sim.mjs`.
Suggested fix: make the probe outcome total. In `runJob`, once `allow()` grants a half-open probe,
wrap the remainder in try/finally so any exit without an explicit success/failure re-opens the breaker
(e.g. record failure → `trip()`); or in `allow()`, treat a `half_open` older than `cooldownMs` as due
for a fresh probe instead of a permanent `false`.

### F2 — Relayer accepts non-canonical (high-S) malleable signatures (LOW)
`parseHex(sweepSig, 65)` + `recoverTypedDataAddress` accept the malleable twin `(r, n−s, v^1)` of any
order signature; it recovers the same owner, so the relayer validates it and broadcasts
(`sendSweep`). The on-chain OZ `ECDSA` S-check (`ECDSAInvalidSignatureS`, mapped at service.ts:96) and
the sweep nonce are the real defense, so no double-execution — but at the relayer a malleated
resubmission passes all validation and consumes a lane slot / simulation / nonce acquisition before the
chain rejects it. Minor duplicate-submission griefing and a signature-uniqueness gap.
Evidence: `VULNERABLE: malleability: relayer ACCEPTS high-s malleable sig (status 200)`.
Repro: `node battery.mjs` (test 1). Fix: reject `s > n/2` during `parseSweepRequest`/recovery.

### F3 — `X-Forwarded-For` IP rate-limit evasion when `trustProxyHops > 0` (LOW, config-dependent)
With the default `trustProxyHops: 0`, XFF is ignored and buckets key on the socket address — spoofing
does not help (confirmed: 5/5 extra requests → 429). With `trustProxyHops: 1` but no real fronting
proxy (or an attacker connecting directly / through fewer hops than configured), a forged
`X-Forwarded-For` yields unlimited distinct limiter buckets, fully bypassing the IP limit.
Evidence:
```
DEFENDED:   trustProxyHops=0: XFF ignored, all extra requests 429
VULNERABLE: XFF evasion with trustProxyHops=1 ... : 10/10 served by forging client IP
```
Repro: `node battery.mjs` (test 5). Not a code bug (`clientIp` is correct given the trust assumption),
but hazardous if `trustProxyHops` is set without a matching proxy chain. Fix: document loudly, and/or
only honor XFF from a configured trusted-proxy source range; the owner limiter (keyed on authenticated
owner) is unaffected.

## Attempts that FAILED (relayer defended)
- Quote-token forgery (bad MAC) → `400 invalid_quote`; HMAC-SHA256 + `timingSafeEqual` (quoteToken.ts).
- Quote reuse for a different order (amount A token vs order B) → `400 invalid_quote`; MAC binds
  chainId/token/owner/destination/amount/fee/feeTo/expiry.
- Fee-griefing: zero fee → `fee_below_quote`; ~99% fee → `fee_above_cap` (service.ts:242-243).
- Cross-chain / cross-contract replay: order signed with domain `chainId=1` submitted as the configured
  chain → `422 invalid_signature` (EIP-712 domain binds chainId + verifyingContract).
- Oversized body (20 KB) → `413 body_too_large` (MAX_BODY_BYTES=16 KiB, early Content-Length reject);
  server also sets `headersTimeout=10s`, `requestTimeout=15s` against slow requests.
- Log injection: 0 tainted lines. `log.ts` has no free-form field; `requestId` is a server UUID,
  `route` is from a fixed set, every value re-validated by regex. Injection impossible by construction.
- Lane: 5th concurrent sweep → `503 queue_full` (maxPending enforced); one in-flight tx/chain.
- SSRF via RPC URL (`validateRpcUrl`, rpc.mjs): `http://169.254.169.254`, `file://`, `http://10.0.0.1`,
  `user:pass@` creds, `gopher://` all REJECTED; `169.254.169.254` rejected even with
  `allowInsecureLocalhost`. (Config is operator-controlled, outside the network-only attacker model.)

## Lane / economic notes (not independently exploitable here)
- Lane starvation is a design property: the serial lane holds its slot until the receipt settles
  (lane.ts:40-52, `await out.settled`), so throughput is ~1 tx per receipt-settle per chain. Filling
  `maxPending` with valid owner-signed orders stalls honest sweeps on that chain. Mitigated by
  per-owner rate limit (keyed on authenticated owner, not spoofable) + `queue_full`; an attacker needs
  many funded owner keys and real on-chain orders, so cost is high.
- Fee vs gas drift: the quote fixes `fee` from the gas price at quote time, but `runJob` executes at the
  live price up to `maxGasPriceWei`. Within `quoteTtlSeconds` (10–600s) a gas rise lets the relayer pay
  more gas than the fee reimburses. Bounded by `maxGasPriceWei` and `dailyBudgetWei`; could not be
  turned into a concrete loss without a live gas oracle in the harness.

## Could not run
- Real anvil e2e (`apps/relayer/src/e2e.anvil.test.ts`): would exercise the real viem `ChainClient`,
  on-chain ECDSA S-rejection (confirming F2's on-chain defense) and nonce replay. Used `FakeChain`
  instead to drive server/service/breaker/lane logic over HTTP; `FakeChain.simulateSweep` does not model
  the contract's ECDSA S-check, which is why F2's malleated sig returns 200 in the harness.
- Full config loader / SSRF through live RPC dialing: `validateRpcUrl` probed directly (rpc.mjs); did
  not stand up a live malicious RPC endpoint.
