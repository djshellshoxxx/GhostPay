# Relayer stress test report (apps/relayer)

Scope: in-process relayer (`buildRelayer` + real `node:http` server on 127.0.0.1:0), FakeChain replacing the RPC client (no anvil; chain I/O is simulated, so numbers measure relayer CPU/queueing, not RPC). Node v22.22.0, Linux, single box, load generator in the same process unless noted (so rps is a lower bound). `ulimit -n` 20000. Git state not modified; no source edited.

## How to reproduce

Scripts live outside the repo in `/tmp/claude-0/stress` (lib.mjs = FakeChain + client helpers, s1..s9.mjs = scenarios, *.out = raw output).

```
cd /home/user/ghostpay/apps/relayer
npx tsc -p tsconfig.build.json --outDir /tmp/claude-0/stress/dist     # compile relayer to scratch
ln -sfn /home/user/ghostpay/node_modules /tmp/claude-0/stress/node_modules
cd /tmp/claude-0/stress
node --expose-gc s1.mjs   # throughput, sweep concurrency
node s2.mjs               # queue_full, breaker transitions, half_open wedge
node --expose-gc s3.mjs   # rate limiter
node s4.mjs               # malformed/oversized bodies
node s6.mjs; node s8.mjs  # slowloris / connection exhaustion (~3 min)
node --expose-gc s7.mjs; node --expose-gc s9.mjs   # memory, event-loop
```
Test config = harness `testConfig` equivalents: maxPending 4 unless stated, breaker window 10/minSamples 3/ratio .5/cooldown 60s, limiter raised to effectively unlimited except in s3. Breaker/limiter time is moved with an injected clock offset (`L.clock.off`), not real sleeps.

## Numbers

Quote (POST /v1/quote, keep-alive, 20k reqs): conc1 1427 rps p99 5.4ms; conc16 2796 rps p99 16.8ms; conc64 2911 rps p50 19ms p99 54ms; conc256 3098 rps p99 125ms but max 4985ms (one outlier, see N1). GET /healthz conc64: 4092 rps p99 63ms. All 200.

Sweep (400 pre-signed sweeps, conc 200, FakeChain latency per RPC call):
| maxPending | rpc lat | sent | queue_full | wall | maxInFlight | p50 / p99 |
|---|---|---|---|---|---|---|
| 4 | 0ms | 400 | 0 | 2.0s | 1 | 157ms / 2015ms |
| 4 | 5ms | 74 | 326 | 2.6s | 1 | 1197 / 1524 |
| 64 | 5ms | 140 | 260 | 4.8s | 1 | 1426 / 3251 |
| 1000 | 5ms | 400 | 0 | 10.1s | 1 | 4633 / 6125 |
Serial lane holds: maxInFlight==1 in every run. Sustained sweep rate with 5ms-per-call fake RPC ~40/s (lane is serial; each job = gasPrice+balance+simulate+send+receipt). Slot is held until receipt settles, so maxPending=64 still shed 260/400 (queue_full is about in-flight txs, not HTTP concurrency).

queue_full (sendGate held, maxPending 4, 12 parallel): 4 x 200, 8 x 503 queue_full, `Retry-After: 5`, 1 simulation, lane.pending=4; after release a new sweep returns 200 (no slot leak). With receiptGate held (maxPending 2, 4 parallel): 2 answered 200, 2 x queue_full, immediately.

Rate limiter (defaults ip 30/min burst 10; owner 6/min burst 3): sequential 100 reqs -> 10 ok / 90 429 `rate_limited_ip`, Retry-After 2; after +2s clock -> 1 token; after +60s -> 10 ok. 500 parallel from one IP -> exactly 10 ok (no race). Owner: 3 ok then `rate_limited_owner` x5. Limiter micro-benchmark: 1M distinct keys 55.7k ops/s (18s), map bounded at 10000, rss 109->148MB, heap 18.9->21MB. 429 precedes content-type/body validation, so malformed requests spend tokens (by design).

Breaker (sendFails): seq send_failed x3 -> breaker_open (minSamples 3) , health `degraded` 503-class status via /healthz only when ALL chains open. After +61s the state still reads `open` until a request arrives; probe failing -> `open` again, next request breaker_open `Retry-After: 60`; probe success -> `closed`, next sweep ok. Burst of 6 right after cooldown with 20ms RPC latency: 4 ok / 2 queue_full, ends `closed` (only lane serialisation admits one probe; fine). User-class errors (30 replays, nonce_used) never trip the breaker. Low balance trips on the first job.

Malformed (s4; raw sockets): body 16384 passes size gate (then 400 on schema); 16385 -> 413 `body_too_large`, connection closed; Content-Length 10MB -> 413 in 2ms; chunked 160KiB -> 413 after 13ms; invalid JSON/empty/invalid UTF-8/16k-deep `[`/`__proto__` -> 400; text/plain, charset=latin1, boundary, no CT -> 415; CL mismatch and CL+TE smuggling -> 400 and close; 9000-char URL, 9000-byte header, 2000 headers -> 431; garbage -> 400; TRACE -> 405; foreign Origin -> 403; amount of 5000 digits / 1e999 -> 400 invalid_amount. Flood 10000 malformed (half 20KB bodies -> 413 with forced connection close) @128 conc: 962 rps, p99 610ms, max event-loop lag 74ms; /healthz 200 afterwards. No crash, no 500 observed.

Memory (heap after forced gc): 4 x 50k quotes heap 18.8 -> 19.6MB (flat), rss 130 -> 194MB then plateau (+1.3MB last round); 2000 sweeps heap 24.3 -> 23.7MB; 120k distinct XFF IPs (maxKeys 10000) heap 16.3 -> 19.6MB; 4 x 4000 forged-signature sweeps heap 20.5 -> 22.1MB (rss flat ~152MB). An earlier 30k-request run showed heap 47.5MB after double gc; not reproduced in the later run (unresolved noise, unverified cause). No unbounded growth found in relayer structures (LruMap bounded). FakeChain.used Set grows by design (harness only).

Event-loop: 3000 sweeps with well-formed but wrong signatures, conc 64: ~305 rps; concurrent /healthz p50 193ms, p99 550ms (secp256k1 recover in JS on the main thread, `recoverTypedDataAddress`, service.ts sweep path). Only the IP limiter (default 10 burst/30 min per IP) stands in front of it.

## Findings

### S1 HIGH: breaker wedges in `half_open` forever (confirmed, reproduced)
Evidence: breaker.ts `allow()` returns false in `half_open` (only `closed` and elapsed `open` return true) and `isBlocking()` is false in `half_open`; in service.ts `runJob` the probe passes `allow()` (line 319) and then can exit through paths that call neither `recordSuccess` nor `recordFailure`: simulation revert -> `revertToError` (344), `gas_limit_too_high` (347), `budget_exhausted` (350), `gasPrice()` throwing `gas_price_too_high`/`rpc_unavailable` (332). State stays `half_open`; every later `allow()` is false so all sweeps get 503 `breaker_open` indefinitely, and `trip()` (the only way out) is unreachable. Only a process restart recovers.
Repro: `node s2.mjs`, lines `D2.*`: trip via balance 0, +61s, probe with simulateError=SimulationRevert('InvalidSignature') -> probe `invalid_signature`, state `half_open`; 3 further requests each an hour later with fault removed -> all `breaker_open`, final `half_open`. Same for gas_limit_too_high, gas_price_too_high, budget_exhausted. A user-triggerable path: any user-caused revert (e.g. replayed nonce) that happens to be the first job after cooldown wedges the relayer.
Also `health()` (service.ts:177) reports `degraded` only when state is `open`, so a wedged `half_open` chain reports `ok` (200) to load balancers while serving 100% 503. (State reading confirmed by test output `finalState half_open`; the /healthz status in that state is derived from code at line 177, not separately captured.)
Suggested fix: make the probe resolve the state on every exit (treat user-class/non-operational exits as release of the probe: return to `open` with fresh cooldown or `closed`), add a probe timeout, and make health report non-ok for `half_open`.

### S2 MEDIUM: gas-price RPC failures do not feed the breaker; outage invisible to /healthz (confirmed)
Evidence: service.ts:332 `await this.gasPrice(rt)` runs outside the `op()` wrapper (which only wraps getBalance/simulate), and `gasPrice()` maps errors to 503 `rpc_unavailable` without `recordFailure`. Repro `s2.mjs` D3: rpcDown, 6 sweeps -> 6 x `rpc_unavailable`, breaker stays `closed`, `/healthz` 200 `status:"ok"`, quotes also `rpc_unavailable`. The breaker therefore never opens during a pure RPC outage and health stays green. (Whether gas-price source caching masks this in production: unverified, FakeChain has none.)
Fix: route gasPrice through the same failure accounting; expose RPC health in /healthz.

### S3 MEDIUM: 1024 idle sockets deny service for ~32s, repeatable (confirmed)
Evidence: server.ts:116 `maxConnections = 1024`; with 1030 idle sockets (no bytes) server reports 1024 connections and a fresh `GET /healthz` gets ECONNRESET at t=1..23s; connections only vanish at ~32s (`s8.mjs`). One host with an fd limit of 20000 can hold this indefinitely by reconnecting. Includes healthz, so orchestrator probes fail too.
Fix: per-IP connection cap at the proxy/LB, lower `connectionsCheckingInterval`, shorter header timeout, keep maxConnections behind a reverse proxy.

### S4 LOW: configured timeouts are enforced late (confirmed)
`headersTimeout` 10s / `requestTimeout` 15s are only checked every `connectionsCheckingInterval` (Node default 30s, not set in server.ts:113-116). Measured: 300 sockets dripping headers every 2s closed at 32.18s (not 10s); slow body drip (CL 100, 1 byte/2s) got `408` at 22.95s (not 15s); idle sockets reaped at ~32s. Fix: set `server.connectionsCheckingInterval` (e.g. 1000).

### S5 LOW: rate-limit bypass by LRU eviction and IPv6 (eviction confirmed for IP and owner, IPv6 code-read only)
- Owner bucket eviction (E5, maxKeys 16): victim exhausted 3-burst, 17 fresh signed owners later victim gets 3 more ok. Default maxKeys 10000 raises the cost to ~10k distinct valid signers plus a quote each, and quotes are IP limited, so impractical for one IP but cheap for a distributed attacker. IP-bucket eviction (E4, trustProxyHops 1, maxKeys 16): victim IP exhausted (10 ok / 2 429); after 17 distinct XFF keys the victim again gets 10 ok / 2 429, i.e. burst reset (confirmed); needs more than maxKeys (default 10000) distinct client keys.
- IPv6: `clientIp` (server.ts:175) keys on the full address (`remoteAddress`), no /64 aggregation; one /64 owner has 2^64 keys. Not tested (no IPv6 listener run). Unverified by execution.
- XFF with `trustProxyHops: 1` and no proxy in front is attacker controlled (30/30 ok with rotating XFF). Deployment concern, documented behaviour; hops=0 correctly ignores XFF (10 ok / 20 429).

### S6 LOW: CPU-bound signature recovery blocks the event loop (confirmed)
~3ms per forged-signature sweep on the main thread; at ~305 rps /healthz p50 193ms, p99 550ms. Per-IP limiter is the only guard; a botnet bypasses it. Fix: worker pool or cheaper pre-checks, global concurrency cap on pre-lane verification.

### Notes (informational)
- N1: single 4985ms quote outlier at conc 256 (one of 20000); not reproduced or explained (possible TCP accept backlog/GC); unverified.
- N2: Duplicate JSON keys are last-wins (`{"amount":"1", ... "amount":"100000000"}` -> 200) and a UTF-8 BOM is accepted; harmless here but worth knowing.
- N3: 413 responses force `Connection: close` + `req.destroy()`, so oversized floods are cheap (5ms) but cost a new TCP connection each (962 rps flood).
- N4: Queued sweeps wait for the previous tx's receipt (lane releases only on `settled`), so a queued request's HTTP latency can reach (maxPending-1) x receiptTimeoutSeconds (30s default); client timeouts shorter than that cause retries on already-queued work (not exercised against real block times).
- Not done: real anvil end to end (FakeChain used; `e2e.anvil.test.ts` covers that path), TLS/proxy behaviour, SIGTERM drain under load (`close()` grace behaviour), receipt_timeout budget accounting.
