# Audit 05: relayer (apps/relayer, packages/relayer-guard, packages/ops-monitor)

Snapshot: commit 88de0018b86884d49d70d269c430bdcbb39a0b4f (frozen worktree). AI-assisted review, not an independent professional audit. Static review only; no code executed except three one-line `node -e` checks of `new URL(...)` and `net.isIPv4/6` behaviour. No forge PoCs, no live RPC, no running relayer.

## Summary

No finding gives a remote, unauthenticated party a direct path to user funds or to the hot key. Authn of sweeps (EIP-712 recovery against `owner`, contract nonce, MAC-bound quote), quote-token forging, SSRF, log leakage, HTTP parsing and XFF/IPv6 keying held up. The remaining risk is availability and operator economics:

1. The new global quote budget can be drained by ~20 IPv4 addresses (or one IPv6 /48), which denies every sweep (a sweep needs a quote token). RELAYER-01.
2. Fee adequacy is still never re-checked at send time; stale quotes + fixed native price are an attacker-timeable operator loss (prior RL-03, open). RELAYER-02.
3. Serial lane + free-to-mint owners: cheap reverting sweeps (and replays of public orders) occupy the lane and RPC. RELAYER-03.
4. Loss budget mis-charges third-party front-runs (where the fee WAS paid) to innocent keys and to the global cap, giving a cheap lock-out lever. RELAYER-04.
5. Stuck-chain / ambiguous-send handling leaks budget and the breaker is blind to it; RPC outage never opens the breaker. RELAYER-05, RELAYER-06.
6. ops-monitor fails silent (stale green metrics, no alert on its own failure) and several probes trust one RPC. RELAYER-07 to 09.

Counts: 0 critical, 0 high, 6 medium (01 to 05, 07), 8 low (06, 08 to 14), 2 info (15, 16). Prior-audit items still open are marked STILL OPEN; none re-opened a fixed item (no regressions found). Fixed since prior audits (verified in code): half-open latch (S3-05/RL-01), XFF trust and IPv6 /64 keying (S3-07/RL-05), monotonic clocks, LRU-eviction reset of buckets, breaker poisoning by attacker reverts (neutral outcomes), fee leading zeros (S3-20, fee part only).

## Method

- Full line read of apps/relayer/src (non-test), relayer-guard src (ip, client, limiter, breaker, challenge), ops-monitor src, deploy units, Dockerfile, example configs, README/PRIVACY/DEVIATIONS.
- Cross-read prior reports: docs/audits/03 (S3-xx), docs/remote/round-audits/relayer.md (RL-xx) and guards.md (M-/L-/I-), threat model s4.4/6.3. IDs below map to them where relevant.
- Contract side read only for permit try/catch and nonce bitmap (`GhostPaySweepRelayer.sol:46-70`).
- Confidence tags: high = follows directly from code; medium = depends on deployment/chain behaviour not exercised.

## Findings

### RELAYER-01 (Medium): global quote budget is a cheap kill switch for the whole service
- Where: apps/relayer/src/server.ts:120-123 (global bucket, defaults 600/min, burst 100 via config.ts:369-370), :272-278 (per-IP limit then global take), :279-281 (content-type/body checks come AFTER the global token is spent), service flow requires `quoteToken` (service.ts:275-285, validate.ts:157).
- Exploit: per-IP bucket is 30/min, burst 10 (config.ts:363-364). A single attacker with ~20 IPv4 addresses, or one IPv6 /48 (65 536 distinct /64 keys), sends 10 requests/s of anything (even `Content-Type: text/plain`, rejected at :280 after the token is gone). `/v1/quote` returns 429 `rate_limited_global` to everyone; no new quote token, so no new sweep. Existing tokens work for at most `quoteTtlSeconds` (default 120).
- Fix: charge the global bucket only after body parse/validation; reserve a share per source class; make the sweep path able to proceed without a prior server-issued token (recompute the fee deterministically at sweep time, which also fixes RELAYER-02); alert on `rate_limited_global`.
- Confidence: high (code), medium on attacker cost.

### RELAYER-02 (Medium, STILL OPEN prior RL-03/R-04): fee never re-validated against actual gas at send time
- Where: service.ts:286 (`s.fee < quote.fee` is the only floor), :436-459 (fresh `gasPrice`, `gasLimit` = estimate+20 %, reserved, sent; no `fee >= gasLimit*gasPrice` check), pricing.ts:496-506 (native USD price is a fixed operator constant).
- Exploit: request a quote while gas is low (example config: 1 gwei, 150 000 gas units, fee floor 50 bps), hold the signed order, submit inside `quoteTtlSeconds` (up to 600) when `eth_gasPrice` is higher but below `maxGasPriceWei` (example 5 gwei). Relayer pays 5x the gas it was reimbursed for. A native price move of 2x silently halves reimbursement for all quotes. Loss per sweep bounded by `maxGasPriceWei*maxGasLimit`; total by `dailyBudgetWei`, but systematic and timeable.
- Fix: at send time require token-denominated `fee >= nativeToTokenUnits(gasLimit*gasPrice)`; else 409/422 `requote`. Shorten TTL; add a price-staleness alarm.
- Confidence: high.

### RELAYER-03 (Medium, extends STILL OPEN RL-02): lane and RPC exhaustion by validly signed, cheaply reverting sweeps
- Where: service.ts:315 (owner limiter keyed by an address attackers mint for free), :318-331 (no balance/allowance/nonce pre-check before the lane), :436-448 (inside the serial lane: gasPrice, getBalance, simulate, estimateGas = 3-4 RPC round trips per job), lane.ts submit (single serial lane, `maxPending` 16 default), quoteToken not bound to nonce/deadline so one quote covers many sweeps of one owner (quoteToken.ts mac fields).
- Exploit: generate key K_i, get a quote for (K_i, d, amount) (any amount passes the quote; no balance needed), sign a sweep with K_i (valid signature, zero balance). It passes every pre-lane check, enters the lane, simulation reverts (`SafeERC20FailedOperation` etc.), classified neutral. ~6 IPs at 0.5 req/s each, plus quote budget, keep 16 slots occupied when a job takes about 0.5 s of RPC time; honest users get 503 `queue_full`. Also burns RPC quota. Related: public signed orders from the mempool can be replayed (while the deadline is open) to consume the victim owner's rate-limit bucket (6/min) and lane time (owner key is public identity once broadcast).
- Fix: run a cheap `eth_call` balance/nonce pre-check outside the lane under a separate concurrency cap; per-IP in-flight cap; per-chain admission rate below block throughput; dedupe in-flight `(owner,nonce)`.
- Confidence: medium (service time and RPC latency not measured).

### RELAYER-04 (Medium): loss budget charges third-party front-runs, where the fee was paid, to innocent keys and the global cap
- Where: service.ts:483-491 (any mined revert: `lossBudget.charge(k, spent)` for destination and network keys), relayer-guard limiter.ts:203-209 (`allows` false when global spent >= global limit), :218-234.
- Exploit: `GhostPaySweepRelayer.sweep` is permissionless and pays `feeTo` regardless of caller. An observer of the public mempool copies the relayer's pending calldata and calls it first with a higher gas price. The order executes (fee reaches the operator's `feeTo`); the relayer's own tx then reverts `NonceAlreadyUsed` and its revert gas is charged as "unreimbursed" to the victim's destination and network keys and to the global window. Default per-key 0.005, global 0.05 native per hour (config.ts:381-382): a few front-runs lock the victim out (`429 loss_budget_exhausted`), a few dozen (cost roughly 2-3x the charged amount to the attacker, who also pays the fee) lock out everyone for the window, repeatedly. The operator may in fact be net-positive on these, yet the guard trips.
- Fix: on a mined revert, check `nonceUsed(owner,nonce)` / receipts at the inclusion block; if the order executed, charge nothing. Send via a private/protected relay endpoint where available. Do not charge the destination key for reverts that did not originate from that order's own state change.
- Confidence: medium (not demonstrated on anvil; behaviour depends on mempool visibility).

### RELAYER-05 (Medium, STILL OPEN prior RL-04/S3-18f; new detail): chain stall leaks the daily budget while the breaker stays closed; ambiguous send released as failure
- Where: service.ts:471 (`confirmed` recorded as breaker success at broadcast), :476-481 (receipt timeout returns without `budget.release`, `receipt_timeout` class in relayer-guard breaker.ts OUTCOME_TABLE is never used), runtime.ts:65 (`retryCount: 1` on the shared transport also covers sends), service.ts:465-469 (any send exception: `budget.release(reserved)`, `send_failed`), budget.ts:42-46 (release after UTC rollover reduces the new day).
- Exploit/failure: legacy `gasPrice` fixed at send; if the base fee rises the tx sits in the mempool, `receiptTimeoutSeconds` (120 s) elapses, the lane moves on, the next tx gets nonce+1 and queues behind it. Each such sweep leaves its full reservation (example 150 000 x 5 gwei) spent for the day, the breaker never opens (outcome was success), `/healthz` stays `ok`. After `dailyBudgetWei / reservation` sweeps every request gets `503 budget_exhausted` until UTC midnight; restarting resets the cap (RL-12). Separately, a send whose first attempt reached the node but timed out is retried by viem, the retry errors ("already known"), the relayer reports `send_failed`, releases budget and invalidates the nonce while the tx is pending; the client may resubmit and duplicate (one reverts, RL-07).
- Fix: treat receipt timeout as breaker `failure`; keep a pending-reservation ledger reconciled by receipt; replace-by-fee/cancel for the head nonce; `retryCount: 0` for `eth_sendRawTransaction` and check by tx hash before reporting `send_failed`.
- Confidence: medium-high (code); chain behaviour not exercised.

### RELAYER-06 (Low): RPC outage never opens the breaker; `/healthz` stays `ok`
- Where: service.ts:436 (`await this.gasPrice(rt)` is outside the `op()` wrapper that sets the `rpc_error` outcome; `gasPrice()` converts failures to `RelayerError(503, 'rpc_unavailable')`, which `op` and the default outcome treat as neutral), runtime.ts:65 (10 s timeout x 2 attempts).
- Impact: with a dead RPC the first call in every job is `gasPrice`; each job holds the serial lane about 20 s, queue fills (`queue_full`), no breaker, no `breaker_open` alert, health `ok`. Self-inflicted outage amplification, not attacker-induced.
- Fix: route `gasPrice` through `op`, or set outcome `rpc_error` on this path; consider health to include last RPC success time.
- Confidence: high.

### RELAYER-07 (Medium): ops-monitor fails silent; stale green metrics, no signal on its own failure
- Where: packages/ops-monitor/src/output.ts:238-258 (no last-run timestamp or `up` metric), cli.ts:190-196 (any fatal returns 3 before the Prometheus file or webhook is touched), cli.ts:43 (`mode: 0o600` for the textfile), deploy/ghostpay-ops-monitor.service (`SuccessExitStatus=1 2`, `UMask=0077`).
- Failure: if the RPC env var is unset, an RPC is down at start, or config is broken, the previous `.prom` file stays on disk with the last (healthy) values; Prometheus keeps scraping them. No webhook is sent for a monitor failure. Only the systemd unit shows `failed`, which nothing alerts on by default. In addition, a 0600 file owned by `ghostpay-ops` is not readable by a node_exporter running under another user (not verified for the target host), in which case no metrics are ever exported and absence of alerts looks like health.
- Fix: emit `ghostpay_ops_last_run_timestamp_seconds` and `ghostpay_ops_up`; document an alert on its age and on `node_textfile_mtime_seconds`; send a webhook on exit 3; write the file 0644 (it contains no secrets) or document group access.
- Confidence: medium.

### RELAYER-08 (Low): ops-monitor trusts the first RPC for W1, W2, W5; W6 does not cover code or getters
- Where: w1.ts:103, w2.ts:25, w5.ts:47 (`const [rpc] = clientsFor(...)`), w6.ts compares only `eth_chainId`, block number and block hash.
- Impact: a lying or compromised first provider hides code-hash drift, `FEE_RECIPIENT` changes and spam counts; the probe reports green. The JSDoc ("run W6") overstates what W6 cross-checks.
- Fix: run W1 `eth_getCode`/getters against every client and require agreement.
- Confidence: high.

### RELAYER-09 (Low): ops-monitor W4 loss check is dead and reports green
- Where: cli.ts:132 (`unreimbursedGasWeiToday: 0n`), w4.ts:54 (`'hot key balance, nonce gap and losses within limits'`).
- Impact: the "unreimbursed gas" arm can never fire, yet the info finding asserts losses are within limits. Known in DEVIATIONS 10, but the output text is misleading. Pair with RELAYER-04: the relayer's own `loss_budget_exhausted`/`mined_revert` alerts are the only signal.
- Fix: scrape the relayer `/metrics` (`relayer_mined_reverts_total`) or drop "losses" from the message when unmeasured.
- Confidence: high.

### RELAYER-10 (Low): ops-monitor W3/fetcher unbounded read and narrow coverage
- Where: fetcher.ts:22 (`await res.arrayBuffer()` then size check; the 10 s abort in cli.ts bounds time not bytes), ops-monitor.config.example.json (`files: ["index.html"]` only), w3.ts:37-42 (file not listed in SHA256SUMS is `warn`, not `page`).
- Impact: a compromised mirror can stream gigabytes in 10 s and OOM the oneshot (monitor outage, see RELAYER-07); an attacker who changes a script not listed in `files` is not seen.
- Fix: stream with a byte cap; list every served asset; treat unlisted configured files as `page`.
- Confidence: high.

### RELAYER-11 (Low, STILL OPEN prior RL-08): malformed request target yields 500 and error-level log
- Where: server.ts:223 (`new URL(req.url ?? '/', ...)` outside any validation). Verified: `new URL('//[', 'http://relayer.invalid')` throws `ERR_INVALID_URL`, caught at :208 as `internal_error`/500, logged `error`. Unmetered and pre-limiter (not behind `ipLimiter`). Also `//evil.com/v1/quote` resolves to `/v1/quote` (harmless).
- Fix: wrap, return 400.
- Confidence: high.

### RELAYER-12 (Low, STILL OPEN prior RL-09/S3-18b,c,d/RL-13/S3-21): key and secret handling residuals
- Where: secrets.ts:73-75 (`RELAYER_KEY`/`QUOTE_SECRET` value env vars accepted, stay in `process.env`); config.ts:219 (`feeTo` defaults to the hot key, so earned fee tokens sit on the signing key); relayer.config.example.json:15 (`feeTo` `0x...0001` burns fees if copied); main.ts has no `uncaughtException`/`unhandledRejection` handler; no check that the quote secret differs from the hot key or has entropy (all-zero 32 bytes accepted); deploy unit lacks `LimitCORE=0`, `ProtectProc`, `SystemCallFilter` (S3-18e); no root `.dockerignore`, `.gitignore` has no `*.key`/`relayer.config.json` pattern; base images by tag.
- Impact: hot-key exposure surface is larger than needed; fee income custody on the gas key.
- Fix: as in prior reports; require explicit `feeTo != hot key`, drop env-value form outside dev, add handlers and unit hardening.
- Confidence: high.

### RELAYER-13 (Low, STILL OPEN prior M-3/L-8): rate-limit overflow bucket can be forced by a many-/64 source
- Where: relayer-guard limiter.ts:32-36 (`canInsert` inspects only the LRU entry), :129-136 (newcomers share one overflow bucket of `burst` tokens), apps/relayer/src/limiter.ts:106,118 (whole limiter rebuilt on salt rotation, all clients get a simultaneous refill).
- Impact: with maxKeys 10 000 and burst 10, an actor with a /48 sending about 5 000 distinct-/64 requests per 2 s keeps the table full of non-idle keys; all first-time users share 10 tokens and are throttled. High effort; also see RELAYER-01.
- Fix: second-level aggregation (/48 charged in parallel), metric/alert on `overflow: true`.
- Confidence: medium.

### RELAYER-14 (Low): ambiguous failure classes and unmatched revert handling
- Where: service.ts:483-491 and DEVIATIONS "relayer-guard wiring": every mined revert is neutral for the breaker and charged to sources, so a systematic relayer-side revert (contract paused, token blacklist of the hot key, gas misestimate) never opens the breaker; it only drains the loss budget and then blocks all users via the global cap (see RELAYER-04). The `mined_revert_unexplained` failure class exists but is unused.
- Fix: re-simulate at the inclusion block; classify "state unchanged but reverted" as breaker failure.
- Confidence: medium.

### RELAYER-15 (Info): documentation drift
- apps/relayer/PRIVACY.md:8 still cites `trustProxyHops` (removed, DEVIATIONS) and :41 says no third-party calls other than JSON-RPC, but `alertWebhookUrl` exists; the loss-budget table (hashed destination and network keys, retained for `lossBudget.windowSeconds`) is not in the retention table; `sweep_sent` log joins `requestId` to `txHash` (RL-11) is not warned about.

### RELAYER-16 (Info): quote token expiry accepts leading zeros
- validate.ts:48 `[0-9]{1,12}` for `expiresAt` (fee part fixed). Tokens are not unique strings; harmless today (MAC covers numeric values, replay stopped on-chain).

## Checked and found sound (evidence)

- Sweep authn: typed-data recovery must equal `owner` (service.ts:301-313), domain binds chainId and the configured contract (buildSweepTypedData), contract nonce bitmap, `deadline` window checked first, 65-byte signatures only. Quote token: HMAC-SHA-256, newline-framed fixed fields (chain, token, owner, destination, amount, fee, feeTo, expiry), constant-time compare, fee read from token and re-MACed; no forgery path without the secret. Fee floor `>= quote.fee`, cap 300 bps, `feeTo` equality enforced.
- SSRF: no outbound URL derives from a request. RPC and webhook URLs come from operator config/env; webhook is https-only without credentials and `redirect: 'error'` (alerts.ts); viem transport follows redirects but the RPC is a trusted peer.
- Input handling: strict key allowlists with prototype check, decimal-only integers bounded to uint256, checksummed addresses, `TextDecoder` fatal, 16 KiB cap on both declared and streamed bytes, JSON content type enforced, header and request timeouts, `maxHeaderSize`.
- Rate-limit keying: XFF honoured only from trusted peers, rightmost-untrusted walk, mapped-IPv4 normalised, zone ids rejected, IPv6 /64 buckets, monotonic clocks. IP parser reviewed for `::`, embedded IPv4, mapped forms (net.isIPv4 rejects leading zeros and hex forms in this Node).
- Logging: allowlisted fields only; metrics label charset and series cap; `/metrics` bearer compared in constant time (length leak only), disabled by default.
- Breaker: permits settle on every exit, probe timeout, stale-generation guard, attacker-attributable outcomes neutral.
- Budget/nonce: reservation before send, nonce acquired inside the serial lane, invalidated on failure.

## Not reviewed

- Live behaviour: no anvil/forge run, no real RPC, no mempool or reorg behaviour, no load or latency measurement (service-time estimates in RELAYER-03 are reasoning only).
- apps/relayer test files, e2e harness; chain-adapters internals (`buildSweepTypedData`, `sponsorFee`, `createClient`, `loadDeployment`) beyond the lines cited; contract `GhostPaySweepRelayer.sol` beyond permit/nonce handling.
- relayer-guard `challenge.ts`/`challenge-bank.ts` is not wired into the relayer; read once, no new issue beyond prior guards.md M-1/L-7 (still present: `issue()` unauthenticated, full-table purge on insert).
- Dependency tree and lockfile integrity (viem 2.57.7 and transitive), CI workflows, Docker image build (not built), systemd behaviour on a real host, reverse-proxy configuration, node_exporter permissions.
- ops-monitor w1-w6 numerical thresholds and test suites; behaviour against real contracts (Anvil e2e not done per its DEVIATIONS).
