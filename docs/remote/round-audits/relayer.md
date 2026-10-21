# Round audit: apps/relayer (deep security audit)

Branch `claude/remote-extensions-1`, 2026-10-21. Scope: `apps/relayer/src/*.ts` (2219 lines, non-test), `Dockerfile`, `deploy/ghostpay-relayer.service`, `relayer.config.example.json`, README/PRIVACY/DEVIATIONS. Contract side read only for relay-relevant behaviour (`packages/contracts/src/GhostPaySweepRelayer.sol`).

Method: full line read; relayer built to a temporary outDir (removed afterwards, no repo files touched except this report); `vitest run` in apps/relayer (192 passed, 1 skipped); `docs/audits/poc/poc-11-relayer-breaker-stuck-half-open.mjs` re-run; own PoC harness (fake `ChainClient` over the real `buildRelayer` + HTTP server) for items marked EXECUTED; `npm audit --omit=dev --workspace @ghostpay/relayer` (0 vulnerabilities; registry reachable assumed, not independently confirmed). No on-chain/anvil run for this round, so on-chain behaviours are marked CODE-ONLY. Findings only; no fixes were applied.

Cross-checked: `docs/audits/03-security-review-client-relayer.md` (S3-05/06/07/18/20/21/27), `docs/remote/security-specs/review-relayer-app.md` (R-xx), `relayer-abuse.md` (RA-xx), `docs/threat-model/THREAT_MODEL.md` s4.4/6.3. The haiku reports in `docs/remote/audits/` contain no relayer-specific finding I relied on (unverified, not used).

## 1. Threat model

Assets: (A1) hot key (pays gas, default `feeTo` so also holds earned fees; `config.ts:197`); (A2) per-chain daily gas budget and hot-key balance; (A3) quote HMAC secret (forging it lets an attacker choose any fee at or below the 300 bps cap, never above); (A4) availability of the sponsorship service per chain; (A5) user metadata in flight (IP, owner stealth address, destination, amount, timing); (A6) operator RPC credentials (API key in URL).
Not an asset: user funds. The relayer never holds tokens; destination, amount, fee, feeTo are inside the owner's EIP-712 signature enforced on-chain (`GhostPaySweepRelayer.sol:36,83-109`).

Trust boundaries: Internet client / reverse proxy / relayer process / RPC provider (fully trusted for simulation, gas price, balance, nonce, receipts: single point of trust) / public mempool and chain / operator host (files, env, systemd/Docker).

Adversaries: (1) anonymous client with free addresses and tokens in them (sybil owners; can sign valid sweeps); (2) mempool observer / front-runner; (3) malicious or compromised RPC provider; (4) proxy-adjacent attacker bypassing the proxy; (5) local unprivileged user/co-tenant on host; (6) honest-but-curious operator (privacy); (7) supply chain.

## 2. Summary

| Severity | Count | IDs |
|---|---|---|
| High | 1 | RL-01 |
| Medium | 5 | RL-02 .. RL-06 |
| Low | 9 | RL-07 .. RL-15 |
| Info | 3 | RL-16 .. RL-18 |

Verified-sound areas: strict request parsing (`codec.ts`, `validate.ts`: exact-key objects, proto check, canonical decimal strings, EIP-55 strict, 16 KiB body cap, deep-nesting and 10k-digit literal rejected 400 in 2 ms, EXECUTED); quote HMAC (fixed newline-delimited lower-cased canonical form, version prefix, `timingSafeEqual`, length-checked, MAC covers chain/token/owner/destination/amount/fee/feeTo/expiry); signature recovery before the owner limiter (nobody can burn another owner's quota); EIP-712 domain includes chainId and the configured contract; log schema is an allowlist re-validated by regex (`log.ts:43-54`, no free text path); error classes are fixed strings; CORS is exact-origin allowlist and `Content-Type: application/json` requirement forces a preflight; no SQL/shell/eval/path sinks (manifest path uses a validated safe integer, `config.ts:333`); no reentrancy surface in the process (the serial lane is the only shared-state coordinator; budget/nonce updates are synchronous between awaits except where noted below).

## 3. Findings

### RL-01 (High): circuit breaker latches in `half_open` forever; `/healthz` stays `ok`  [EXECUTED, matches S3-05 / R-01]
- Evidence: `breaker.ts:41-48` (`allow()` moves `open -> half_open`, then returns `false` for every later call while `half_open`); `service.ts:319` calls `breaker.allow()`; the probe only calls `recordSuccess()` at `service.ts:364`, `recordFailure()` only inside `op()`/send failure. Early exits leave it `half_open`: `SimulationRevert -> revertToError` (`:344`), `gas_price_too_high` (`:332`, `:312`), `gas_limit_too_high` (`:347`), `budget_exhausted` (`:350`). `isBlocking()` (`breaker.ts:36`) is false in `half_open` so requests keep entering the lane and fail instantly with `breaker_open`. `health()` (`service.ts:177`) only reports `degraded` when all chains are `open`, so `half_open` reads `ok`.
- Reproduction: `RELAYER_DIST=<built dist> node docs/audits/poc/poc-11-relayer-breaker-stuck-half-open.mjs`. Output observed: step 3 `409 nonce_used ... breaker=half_open`, steps 4 and 5 (one hour later) `503 breaker_open | healthz=ok breaker=half_open`.
- Trigger realism: any trip (low balance, RPC failures, mined reverts) followed by a single user-error first request after cooldown, including an attacker's deliberate replay of a used nonce (a valid signature is free). Trips are themselves inducible (RL-06). Impact: complete outage of that chain until process restart, undetected by the orchestrator health check.
- Suggested fix: guarantee every admitted probe ends in exactly one of success/failure/release (try/finally); revert `half_open` to `open` after cooldown; report `degraded` for non-`closed`; add a test per early-exit path (RA-CB-2/3/4).

### RL-02 (Medium): one source can saturate the serial lane; slot held until receipt while the client already got 200  [EXECUTED]
- Evidence: `lane.ts:35-52` admits at most `maxPending` jobs and `start` awaits `out.settled` (receipt, up to `receiptTimeoutSeconds`, default 120 s) before the next job runs; `service.ts:380` returns the HTTP value at broadcast. Default per-IP limit is 30/min, burst 10 (`config.ts:286-287`), while throughput is about one sweep per block per chain (DEVIATIONS 7). Owner limit (`ownerPerMinute` 6) is per minted address (free). PoC: `maxPending=4`, 8 distinct owners from one IP, receipts delayed 3 s: result `200 200 200 200 503 503 503 503` (`queue_full`).
- Impact: a single IP using a handful of self-funded stealth addresses (each sweep is legitimate and reimburses gas, so the attacker's cost is only the fee) keeps `queue_full` (503) for honest users on that chain. Not funds-at-risk.
- Suggested fix: per-chain global admission rate bound below block throughput, per-IP concurrent in-flight cap, cheap pre-lane checks (balance/allowance/nonce, RA-FG-1), optional priority for fee-paying size.

### RL-03 (Medium): fee adequacy is never checked against actual gas at send time  [EXECUTED, matches R-04]
- Evidence: `service.ts:242` only requires `s.fee >= quote.fee` (computed from configured `gasUnits` x `eth_gasPrice` at quote time, `service.ts:193-198`); at send time the relayer pays `gasLimit * gasPrice` (`:349`, `:357`) with `gasLimit` = estimate + 20 % (`chain.ts:122`) bounded only by `maxGasLimit`, price bounded only by `maxGasPriceWei`. PoC: quote at 1 gwei (fee 5.0 USDC on 1000 USDC, driven by the 50 bps floor), gas price then 50 gwei inside the 120 s TTL, sweep accepted `200`; gas cost at 50 gwei is 150000 x 50e9 = 7.5e15 wei, about 22.5 USD at the example 3000 USD/ETH, against 5 USDC earned. Also the native USD price is an operator constant (`nativeUsdPrice`), so any market move silently skews every fee.
- Impact: bounded loss per sweep and per day by `dailyBudgetWei`, but systematic and attacker-timeable (request quote during low gas, submit during a spike).
- Suggested fix: recompute required fee at send time from actual `gasLimit * gasPrice` and refuse (or re-quote) when `fee < cost`; shorten TTL; monitor price staleness.

### RL-04 (Medium): daily budget reservation leaks on receipt timeout; stuck transactions are never replaced  [EXECUTED (budget), CODE-ONLY (stuck tx)]
- Evidence (budget): `service.ts:369-373` on `r.status === 'timeout'` invalidates the nonce and returns without `budget.release`, while `reserved = gasLimit * gasPrice` was taken at `:350`. PoC: 40 sweeps whose receipts time out leave `budget.used = 6.0e15 wei` (40 x full reservation) versus 1.0e14 for one successful tx that used 100000 gas; with `dailyBudgetWei` 5e16 (example config) about 330 timeouts exhaust the day and every later request gets `503 budget_exhausted` until UTC midnight.
- Evidence (stuck tx): the transaction is legacy `gasPrice` fixed at send (`chain.ts:139`, `service.ts:357`), no replacement/cancel path exists; after the timeout `NonceManager` re-reads the pending count (`lane.ts:80-83`) which still includes the stuck tx, so later txs queue behind it and also time out (each leaking budget). Related: `DailyBudget.release` after UTC rollover reduces the new day's `spent` for the previous day's reservation (`budget.ts:43-46`, S3-18g).
- Impact: an RPC brownout or a gas spike converts directly into a budget lockout plus a nonce-stalled hot key. Budget is in-memory only (`budget.ts`), so a restart (which operators will do under the symptom) resets it, defeating the cap (see RL-12).
- Suggested fix: on timeout keep a pending-reservation record and reconcile later via the receipt; add replace-by-fee/cancel for the head nonce; persist or reconcile budget from chain on start.

### RL-05 (Medium): client-IP derivation and rate-limit keying are bypassable or collapse to one bucket  [EXECUTED for XFF, CODE-ONLY for IPv6/LRU]
- Evidence: `server.ts:167-176`. With `trustProxyHops > 0` and a listener reachable without the proxy, any client supplies its own `X-Forwarded-For`: PoC 60 requests with distinct spoofed XFF, `trustProxyHops=1`: 0 x 429; `trustProxyHops=0`: 50 x 429. Config accepts `listen.host` of any value together with `trustProxyHops` up to 5 (`config.ts:259,281`), and the example sets `trustProxyHops: 1`. With `trustProxyHops=0` behind a proxy every user shares the proxy's single bucket (one client exhausts it for all, 429 for everybody). The key is the full address string, so an IPv6 client rotates /64 addresses freely (S3-07). `LruMap` (`limiter.ts:26-33`) evicts oldest on insert, so spraying more than `maxKeys` (default 10 000) distinct keys resets victims' buckets (fail-open); owner keys are free to mint. Wall clock `Date.now` is used (`runtime.ts:72`); a forward clock step refills all buckets (RA-RL-6).
- Impact: the IP limiter, the only limiter on `/v1/quote` (which makes an RPC call per request, `service.ts:193`), is ineffective against a determined source; quote spam also burns RPC provider quota.
- Suggested fix: refuse `trustProxyHops > 0` unless bound to loopback/unix socket; bucket IPv6 by /64; monotonic clock; eviction that cannot be forced by one client (separate quotas, global ceiling); add a global per-chain quote/RPC budget.

### RL-06 (Medium): reverted-sweep griefing and breaker poisoning with free owners  [CODE-ONLY, matches S3-06 / R-05]
- Evidence: simulate then send (`service.ts:342`, `:357`) with the simulation at the node's latest state; the transaction is public in the mempool. An observer, or the owner, front-runs (move tokens out, consume the nonce via a direct call; for permit sweeps the contract's `try/catch` around `permit` already neutralises permit front-running, `GhostPaySweepRelayer.sol:54-58`, but balance moves and nonce consumption remain). The relayer's tx mines reverted: gas paid, no fee, and `recordFailure()` at `service.ts:376`. A few such events cross `failureRatio 0.5 / minSamples 5` and open the breaker for everyone; combined with RL-01 it is permanent. Per-owner limits (`service.ts:271`) do not bound attackers who mint owners.
- Impact: operator gas loss (bounded by budget) plus service denial. Attacker pays their own gas for the front-run.
- Suggested fix: do not count attributable mined reverts toward the global breaker; per-owner/per-destination failure caps; global unreimbursed-gas window cap (RA-FG-4, RA-RL-3). Verify with an anvil test before relying on severity.

### RL-07 (Low): duplicate broadcast of the same signed sweep after a receipt timeout  [CODE-ONLY]
- Evidence: after `timeout` (`service.ts:369`) the lane slot is released while the first tx may still be pending; a resubmission of the identical signed order passes `simulateContract` (latest state, `chain.ts:120`) and is broadcast with the next nonce. One of the two reverts `NonceAlreadyUsed` when mined, costing the relayer gas. While receipts arrive normally the lane serialisation prevents this (simulation then sees the mined nonce).
- Suggested fix: remember (owner, nonce) in-flight in memory until settled/expired and refuse duplicates (`409 nonce_used`).

### RL-08 (Low): malformed request target returns 500 and emits an error-level log  [EXECUTED]
- Evidence: `server.ts:207` `new URL(req.url ?? '/', 'http://relayer.invalid')`; raw request `GET //[ HTTP/1.1` produced `HTTP/1.1 500 Internal Server Error` (no RelayerError, goes to `internal_error`, `server.ts:193-195`, logged level `error` at `:197`). Any client can mint 500s/error logs and trip alerts keyed to 5xx. Also `//evil.com/healthz` is served as `/healthz` (host swallowed by the base-URL parse; harmless) and the pre-limiter OPTIONS and 404 paths are unmetered.
- Suggested fix: wrap the URL parse, return 400 `invalid_url`; classify by `req.url` prefix without URL parsing.

### RL-09 (Low): secret handling is permissive  [CODE-ONLY]
- `secrets.ts:37-70`: file mode checked but not owner or symlink (stat follows links, S3-18d); direct env values `RELAYER_KEY`/`QUOTE_SECRET` accepted and left in `process.env` for the process lifetime (visible in `/proc/<pid>/environ`, `docker inspect`); `main.ts:13` builds an immutable hex string of the key; no zeroization, no `LimitCORE=0` / `PR_SET_DUMPABLE` in `deploy/ghostpay-relayer.service`; no check that the quote secret differs from the hot key or has entropy (all-zero 32 bytes accepted, S3-21); fee income accumulates on the hot key because `feeTo` defaults to it (`config.ts:197`); `relayer.config.example.json:15` ships `feeTo` `0x...0001` (precompile, burns fees if copied). Error messages name variables only (verified: no value reaches `ConfigError`).
- Suggested fix: env-value form behind an explicit dev flag, delete from `process.env` after read, reject weak/identical secrets, require explicit `feeTo` distinct from the hot key, `LimitCORE=0`.

### RL-10 (Low): connection-level DoS  [CODE-ONLY here; prior PoC in S3-18a not re-run]
- `server.ts:113-116`: `maxConnections = 1024`, no per-IP connection cap, header timeout 10 s, request timeout 15 s. A single client can hold the pool and starve `/healthz` and users. README mandates a proxy only softly (`README.md:82`).

### RL-11 (Low): metadata exposure paths  [CODE-ONLY]
- The process sees IP + owner + destination + amount + timing together (inherent, PRIVACY.md). Logs link `requestId` to `txHash` (`service.ts:365`, `sweep_sent`) with ms timestamps; combined with proxy/CDN access logs (IP, time, path) an operator or log-store reader can join IP to txHash, owner and destination. PRIVACY.md says IPs are not logged by the relayer (true) but does not warn that `sweep_sent` plus proxy logs is a join. `/healthz` and `/v1/info` expose per-chain breaker state and config to anyone (breaker state tells an attacker when a poisoning attempt succeeded). The RPC provider sees the hot-key address and every simulation `eth_call` with the full order (acknowledged in PRIVACY.md). Rate-limit salt rotates lazily on the next request (`limiter.ts:74-82`, S3-27), so quiet instances keep old buckets past 24 h; hash is an HMAC under an in-memory salt the operator can read, so it protects against disk/log disclosure only.
- Suggested fix: coarsen log timestamps for `sweep_sent` or drop `requestId` there, document the proxy-log join, serve `/healthz` detail only on a private listener.

### RL-12 (Low): daily budget and nonce state are process-local  [CODE-ONLY]
- `budget.ts`, `lane.ts:67-84`: restart resets spend; a crash loop or operator restart removes the cap. Shutdown (`main.ts:23-26`) calls `process.exit(0)` after the grace period even when sweeps are unsettled, reporting success.
- Suggested fix: reconcile budget from recent on-chain hot-key spend on start; non-zero exit on forced close.

### RL-13 (Low): no global handlers; stack traces may carry the RPC URL  [CODE-ONLY]
- `main.ts` has no `unhandledRejection`/`uncaughtException` handler. All examined async paths catch, but a future escape prints a viem error whose message embeds `URL: https://.../<api-key>` to stderr (S3-18h). RPC URLs from `rpcUrlEnv` are validated to carry no userinfo (`rpc.ts:84`) but path/query keys are allowed.
- Suggested fix: install handlers that log a fixed event and exit non-zero; scrub URLs.

### RL-14 (Low): RPC is a single trust point  [CODE-ONLY, R-13]
- Simulation, gas price, balance, pending nonce and receipts all come from one endpoint (`runtime.ts:55-60`; chain id verified only once at startup). A malicious/faulty RPC can return low gas prices (underpriced stuck txs), forge passing simulations (gas burned on reverts), or hide receipts (budget leak, RL-04). `redirect: 'error'` is set only in the adapters' fetch transport, not in viem's `http()` transport used for operation. `wss` URLs pass `validateRpcUrl` but fail at startup (`fetchTransport` accepts only http(s), `rpc.ts:95`): fails closed, but is misleading.
- Suggested fix: second RPC for simulation cross-check or `eth_chainId` re-check on each client, document trust.

### RL-15 (Low): unverified mainnet token parameters  [CODE-ONLY, DEVIATIONS 10]
- Tokens outside the adapter allowlist take `decimals`/`permit` from config unchecked (`config.ts:148-153`, up to 36 decimals). A wrong `decimals` mis-scales the fee by powers of ten (`pricing.ts:76`): too low undercharges (loss per sweep), too high pushes every quote to the 300 bps cap or `amount_too_small`.
- Suggested fix: read `decimals()` on-chain at startup and compare.

### RL-16 (Info): quote token is not a unique string  [EXECUTED, S3-20]
- `v1.001900000000...` (leading zeros in expiry) verifies identically to `v1.1900000000...` (`validate.ts:48` `[0-9]{1,12}`, `quoteToken.ts:72`). Harmless (replay is stopped by the sweep nonce on-chain, and the MAC binds fee and expiry numerically), but breaks any future dedup/cache-by-token logic.

### RL-17 (Info): quote tokens are bearer, not bound to the requester; no key id or rotation window  [CODE-ONLY, S3-21]
- Anyone who learns a token can submit it, but cannot alter the order (MAC), so this only matters for unsigned-order privacy: quotes put owner and destination into a request before any commitment.

### RL-18 (Info): deployment hardening gaps  [CODE-ONLY, S3-18e/S3-17e]
- Dockerfile base images pinned by tag, not digest; no `HEALTHCHECK`; systemd unit lacks `SystemCallFilter`, `ProtectProc`, `ProcSubset`, `PrivateUsers`, `RestrictSUIDSGID`, `IPAddressAllow`, `LimitCORE=0`, `MemoryMax` (`MemoryDenyWriteExecute=false` is required for V8). `apps/relayer/.dockerignore` is not read when building with `-f apps/relayer/Dockerfile` from the repo root. Dependencies: only `viem` 2.57.7 and the workspace package; `npm audit --omit=dev` found 0; `@types/node` 26 vs `engines` 22 mismatch (DEVIATIONS 13) is a dev-only type skew.

## 4. Comparison with prior reports
- Reproduced/confirmed at HEAD: S3-05 (RL-01), S3-06 (RL-06, code-level), S3-07 (RL-05 XFF part), S3-18 (RL-09/10/12/13/18), S3-20 (RL-16), S3-27 (RL-11), R-04 (RL-03), R-02 (RL-02).
- New or sharpened here: RL-04 budget leak on `timeout` with measured numbers (not in S3-18g, which covers only the rollover); RL-08 (500 on malformed target); RL-07 duplicate broadcast after timeout; RL-02 quantified (`200` returned while the slot is held).
- Not reproduced: S3-18a connection exhaustion (code-confirmed only).

## 5. Unverified / not done
- No anvil end-to-end run this round (the on-chain behaviours in RL-06/07 rest on code reading and the contract source).
- RL-10, RL-14 behaviours of a hostile RPC, and Docker/systemd items were not executed.
- `npm audit` reachability of the registry was assumed from the zero-vulnerability result.
