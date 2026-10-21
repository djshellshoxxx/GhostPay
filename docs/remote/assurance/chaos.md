# Chaos / failure testing: relayer, chain-adapters, web scanner

Scope: `packages/chain-adapters` (`rpc.ts`, `logs.ts`), `apps/relayer` (`service.ts`, `lane.ts`, `budget.ts`, `limiter.ts`, `server.ts`, `main.ts`, built `dist/main.js`), `apps/web/src/lib/scanClient.ts` + `scannerCore.ts`. No repo file edited. Only what is listed under "Ran" was run.

Harness (outside repo): `/tmp/claude-0/assure-chaos/`. Run any file with
`cd /tmp/claude-0/assure-chaos && /home/user/ghostpay/node_modules/.bin/vitest run <file> --disableConsoleIntercept [-t <ID>]`
(`vitest.config.ts` aliases `@ghostpay/*` to repo `src`; output of each probe is a `console.log` line prefixed with the ID below). Real chain = anvil 1.8.5 (`/root/.local/bin/anvil`, chain id 31337) with the repo's `GhostPaySweepRelayer` + `PermitToken` artifacts (`packages/contracts/out-b`), fronted by a fault-injecting JSON-RPC proxy (`lib.ts: startProxy`; verdicts: forward, canned result/error, HTTP status, hang, drop, forward-then-drop, delay). Relayer service chaos also uses the repo's own `FakeChain`/`startHarness` (`harness.testutil.ts`, imported read-only).

| file | covers |
|---|---|
| `rpc.chaos.ts` | `createClient` + real `fetchTransport` vs hostile HTTP server (R*) |
| `scan.anvil.chaos.ts` | `fetchAnnouncements` on anvil: snapshot/revert reorgs, dropped logs, 429, range limit, lagging node (S*) |
| `web.chaos.ts` | `runScan` with fake worker death/stall, reorg, resume (W*) |
| `relayerfake.chaos.ts` | `RelayerService` with `FakeChain`: budget, restart, clock, shutdown (F*) |
| `relayer.anvil.chaos.ts`, `env.ts` | relayer in-process on anvil via proxy (A*) |
| `proc.chaos.ts` | built `apps/relayer/dist/main.js` as a child process: SIGTERM, SIGKILL, /dev/full, EPIPE, startup failures (P*) |
| `cp.chaos.ts` | `localCheckpointStore` with quota/corrupt storage |

## Findings (ordered by severity)

### C-1 MEDIUM: `runScan` hangs forever if the worker dies or stalls; Cancel cannot unstick it
Evidence: `scanClient.ts:79-89` `failed` is only the reject of the *current* `wait()`; `worker.onerror` fired while the main thread is awaiting RPC (no pending wait) is lost, and the next `wait()` posts to a dead worker. There is no timeout on any `wait()`, and `signal.aborted` is only polled between pages (lines 97, 99), never while awaiting the worker. A browser-killed worker (OOM) fires no `onerror` at all.
Probes (3 s race): W1 error event during RPC fetch then next batch: `HUNG`. W2 worker swallows `batch`, user aborts at 300 ms: still `HUNG` after 3 s, `worker.terminated=false` (so `finally` never runs, viewing-key copy not zeroized, worker alive). W3 reply with wrong `batchId`: `HUNG`. In `views/Scan.tsx` `running` stays true forever (Start disabled, Cancel does nothing).
Repro: `vitest run web.chaos.ts -t "W1|W2|W3"`.
Fix: make `failed` sticky (`dead = true` on error/messageerror; `wait()` rejects immediately if dead); race every `wait()` against `signal` abort and a per-batch timeout (e.g. 30 s); terminate in `finally` regardless.

### C-2 MEDIUM: `runScan` ignores `FetchResult.reorg`; orphaned payments stay listed, rollbacks produce duplicates
Evidence: no reference to `reorg` anywhere in `apps/web/src` outside tests. W5: page 1 finds a payment at block 49950, chain reorgs (hashes >= 49900 change, tx gone), page 2 reports rollback, final `res.matches` still contains block 49950 (`reported: true`) and `onMatch` fired for it; the UI shows a payment that no longer exists. W6: a load-balanced node returns `null` once for the checkpoint block, `fetchAnnouncements` treats it as a reorg and rolls back 100 blocks, the same announcement is delivered twice (`c31e:0@49950` x2); `Scan.tsx` renders `key={m.announcement.id}` so duplicate React keys result.
Repro: `vitest run web.chaos.ts -t "W5|W6"`.
Fix: on `res.reorg` drop matches with `blockNumber >= rolledBackTo`; dedupe `all`/`onMatch` by `announcement.id`.

### C-3 MEDIUM: reorg deeper than `finalityDepth` makes the scanner MISS new canonical announcements (not only keep stale ones)
Extends stress finding S-9 with real-chain evidence. S3 (anvil snapshot/revert, finalityDepth 2, reorg depth 4, 5 new announcements at heights 2-6 after revert): first scan saw tags 1..5; after the reorg, `fetchAnnouncements` with the saved cursor returned only tags 14,15,16 (blocks 4-6), `rolledBackTo = 4`. The canonical announcements at blocks 2 and 3 (tags 12, 13) are never delivered and the cursor moves on; orphaned 2-5 stay in caller state. Shallow reorg (S2, depth 2 < finalityDepth 3) is detected (`rolledBackTo: 2`), new logs delivered; the adapter never retracts orphaned logs (3, 4) itself, only signals via `reorg`, which C-2 shows the web ignores.
Impact: missed payments (funds safe, visible only after a manual rescan from an earlier block).
Repro: `vitest run scan.anvil.chaos.ts -t "S2|S3"`. Fix: walk back by `parentHash`/stored hash window until a match; reject `finalityDepth < reorg depth` configs for L2s.

### C-4 MEDIUM: one faulty/hostile RPC can silently drop logs; the cursor advances and they are never re-fetched
S4: provider returns half the `eth_getLogs` entries (200 OK, valid shape). Adapter returns 2 of 4, `skipped 0`, cursor 5; a later honest provider returns 0 new. No completeness check exists. `requestWithFallbackCheck` (`rpc.ts`) exists but is referenced only by its own test (grep over `apps`/`packages`), i.e. no production path cross-checks providers.
Repro: `vitest run scan.anvil.chaos.ts -t S4`. Fix: two-provider agreement on `eth_getLogs` count/hash per range for high-value scans, or an overlapping periodic rescan; at minimum document single-RPC trust.

### C-5 MEDIUM: relayer crashes when its log sink fails (ENOSPC / EPIPE)
`main.ts:11` sink is `process.stdout.write` with no `'error'` handler. P2: stdout redirected to `/dev/full` -> `Error: ENOSPC ... Unhandled 'error' event`, exit code 1 within 479 ms, never serves. P3: log shipper closes the pipe while serving -> `Error: write EPIPE`, exit 1 at 536 ms, healthz refused. A full disk on a file-redirected stdout or a dead log pipe takes the relayer down, abandoning in-flight txs (budget/nonce state lost, see C-8).
Repro: `vitest run proc.chaos.ts -t "P2|P3"` (uses `dist/main.js` as built in the tree).
Fix: `process.stdout.on('error', () => {})` plus try/catch in the sink with a drop counter; keep serving.

### C-6 MEDIUM: total RPC blackhole: lane held ~20 s per request, breaker never opens, `/healthz` stays 200 `ok`
A2 (all methods `hang` after startup, maxPending 3, 5 concurrent sweeps): outcomes `rpc_unavailable` at 20.2 s, 40.3 s, 60.5 s (served serially), 2x `queue_full`; `breaker` events 0; `/healthz` before and after: `200 {"status":"ok","breaker":"closed"}`. Cause: `runJob` calls `this.gasPrice(rt)` outside the `op()` wrapper (`service.ts:~331`) so its failure never reaches `breaker.recordFailure()`; the first `op`-wrapped call (`getBalance`) is never reached; viem client is `timeout 10 s, retryCount 1` (`runtime.ts:56`) = 20 s. A10: quote with `eth_gasPrice` hanging takes 20.2 s and returns `rpc_unavailable`. An LB sees a healthy relayer whose clients wait up to `maxPending x 20 s`.
Repro: `vitest run relayer.anvil.chaos.ts -t "A2 |A10"`.
Fix: wrap `gasPrice` in `op`; make health reflect time since last successful RPC; shorter per-call timeout with fail-fast when the breaker has seen N consecutive timeouts.

### C-7 MEDIUM: public-mempool front-run makes the relayer pay for reverted txs and opens the breaker after 2 (compounds known latch)
A5 (anvil automine off; third party copies the relayer tx calldata with 3x gas price; blocks mined): each of 2 attempts: HTTP 200, on-chain `status 0x0`, `gasUsed 40281` paid by the hot key; the 3rd request is `breaker_open`, a following honest sweep `breaker_open`, `/healthz` 503. Mechanism: `recordSuccess()` at broadcast then `recordFailure()` on mined revert (`service.ts` settled block) gives 1 success + 1 failure per reverted sweep; with window samples >= `minSamples` and ratio 0.5 two reverts trip it. Combined with redteam F1 (half-open latch), a griefer needs ~2 cheap txs to take a chain's relay offline until restart.
Repro: `vitest run relayer.anvil.chaos.ts -t "A5 "`.
Fix: on a mined revert, check `nonces(owner,nonce)` / re-simulate at the receipt block; if the order was consumed by another tx, do not count it as an operational failure; do not record success at broadcast, only at receipt; consider a private submission path.

### C-8 LOW-MEDIUM: ambiguous send outcome: tx accepted but client told `send_failed`; shutdown mid-send loses the hash
A1: proxy forwards `eth_sendRawTransaction` to anvil then destroys the socket: relayer answers `503 send_failed`, releases the budget reservation, records a breaker failure, but the tx is mined (hot nonce 1). P4: `SIGTERM` while the RPC send is delayed 4 s (grace 2 s): process exits ~2 s later, client gets a socket reset, the tx still lands (hot nonce 1). F6 reproduces the same with `FakeChain`. Client retry returns `409 nonce_used` (safe, but misleading). Budget is under-counted by the gas of landed txs in the `send_failed` case.
Repro: `vitest run relayer.anvil.chaos.ts -t "A1 "`; `proc.chaos.ts -t P4`; `relayerfake.chaos.ts -t F6`.
Fix: sign locally and compute the tx hash before sending; on send error poll `eth_getTransactionByHash`/pending nonce before declaring failure; keep the reservation until resolved.

### C-9 LOW-MEDIUM: daily budget and breaker are process memory; restart and wall-clock steps reset the budget
F2: budget exhausted after 4 sweeps (`budget_exhausted`), new process state, 4 more accepted; a breaker tripped by low balance is cleared by restart. F3: with the clock at +5 s / -5 s around UTC midnight, 4 sweeps are accepted at each of four positions (budget fits 4): `roll()` resets on any day change in either direction, so an NTP step across midnight, or a restart loop, multiplies `dailyBudgetWei`. F1: `receipt_timeout` never releases the reservation (`service.ts` settled block returns early): with 5e14 wei budget, 3 sweeps fit when receipts time out vs 4 when they return `success` (100k of 150k gas); reservations for dropped txs stay until the day rolls.
Repro: `vitest run relayerfake.chaos.ts -t "F1|F2|F3"`.
Fix: persist spent amount; roll forward-only using a monotonic clock; reconcile timed-out txs with a later receipt check.

### C-10 LOW: clock step backwards locks rate-limit keys out for the length of the step
F4: ip bucket after a 1 h backward step (`Date.now()` jump): quote -> `429`, `Retry-After: 3591`; still 429 30 s later (`3561`). `limiter.ts` `take()` adds `(t - b.last) * rate` with negative elapsed and no floor, driving tokens far below zero. Affects every key active before the step (not just attackers).
Repro: `vitest run relayerfake.chaos.ts -t F4`. Fix: clamp elapsed to >= 0 or use a monotonic clock.

### C-11 LOW: chain id checked once at startup only
R: `createClient` verifies `eth_chainId` once; after the endpoint flips to chain 1, `blockNumber()` still returns data, `eth_chainId` calls = 1 (flip-after-start probe). S8: `fetchAnnouncements` while the proxy answers chain id `0x1` runs normally (1 `eth_chainId` call total). Relayer viem clients have no check at all after startup (signed txs carry chain id, so writes fail safe; reads such as gas price/balance/logs do not).
Repro: `vitest run rpc.chaos.ts -t "chain id flips"`; `scan.anvil.chaos.ts -t S8`. Fix: re-verify on reconnect/periodically, or pin genesis hash.

### C-12 LOW: web "resume" loses payments found before the checkpoint
W4: run 1 aborted after page 1 (found block 100, checkpoint saved after the page), run 2 from the checkpoint returns only block 50100. Matches are never persisted (`state.tsx` holds them in memory; `Scan.tsx` calls `app.setMatches([])` on start), so after cancel / tab close / crash the earlier payments vanish from the list although the checkpoint says "resume". Funds are not lost; user must Clear checkpoint and rescan from the original start block, which the UI no longer stores.
Repro: `vitest run web.chaos.ts -t W4`. Fix: persist matched announcement ids with the cursor, or store the scan origin and warn on resume.

### C-13 LOW: retry policy under rate limiting
`rpc.ts` `request`: 429 with `Retry-After: 60` is retried after <1 s (jittered 0..200*2^n ms; 429-recover probe recovered in 15 ms), i.e. `Retry-After` is ignored. 200 concurrent logical calls against a 503 endpoint produced 600 upstream calls (3x amplification, no shared backoff/limiter). HTTP 408 is not retried. JSON-RPC -32005 is retried, -32000 is not (correct).
Repro: `vitest run rpc.chaos.ts -t "429|retry storm|rate limit"`. Fix: honour `Retry-After`, shared token bucket/backoff per client.

### C-14 LOW: startup is all-or-nothing and slow to fail
P6: dead RPC -> exit 1 in 723 ms (`fatal: RPC_FAILURE: transport error or timeout`); wrong chain id -> exit 1 in 431 ms (`fatal: CHAIN_MISMATCH: ...`); hanging RPC -> exit 1 after 30.9 s. `buildChainClients` loops chains sequentially and throws on the first failure (`runtime.ts:51-60`, read, multi-chain not run): one chain's provider down at restart prevents serving the others. No in-process retry.
Repro: `vitest run proc.chaos.ts -t P6`.

### C-15 INFO / LOW: tx lost to a reorg after a 200 is not detected
A7 (anvil `evm_snapshot` before sweep a, `evm_revert` after it was mined): a had returned 200 txHash; after revert it has no receipt (`NO RECEIPT`), nothing re-broadcasts. The next sweep b used a stale local nonce (chain latest 0, pending 1), its response was 200 but the lane was held 5016 ms until `receipt_timeout` (default config 120 s) before `invalidate()`; b and c were both eventually mined (`0x1`, final nonce 2). Self-heals; cost is lane hold time; users must watch their receipt themselves.
Repro: `vitest run relayer.anvil.chaos.ts -t "A7 "`.

### C-16 LOW (UNVERIFIED by run): cached IndexedDB open failure
`idbStore.ts:23` `this.dbPromise ??=` caches a rejected promise, so one transient `indexedDB.open` failure disables the tag store until reload; no `onversionchange`/`onclose` handling. Read from code only (no IndexedDB in this environment).

## Recovers gracefully (ran, held)

- Hostile RPC shapes all fail closed with sanitized `ChainAdapterError`, no hang, no unhandled rejection: wrong chain id at startup (`CHAIN_MISMATCH`), timeout (bounded: 3 attempts, 615 ms at 200 ms timeout), hang at startup (304 ms), truncated body (socket destroyed), cut JSON (not retried), slow-drip body (aborted at the per-request timeout, 304 ms at 300 ms), oversize body (`RESPONSE_TOO_LARGE`, 1 attempt), 302 redirect (refused), empty 200, batch response, wrong `id`, non-canonical/uppercase quantities, connection refused, reset on accept, `wss://` (rejected by fetch transport).
- 429/5xx and JSON-RPC -32005 retried and recover (R probes); persistent 429 on `eth_getLogs` -> `RPC_FAILURE: http status 429` (S5); provider block-range limit (-32005 at >= 10 blocks) handled by window halving (S6, 27 calls for head 41, window not remembered across calls: stress S-8).
- Lagging/stale backend (S7): `blockNumber` regresses and `getBlock` null -> cursor rolls back (5 -> 3), logs re-delivered, no crash; heals when the node catches up. A null block right after processing -> `RPC_FAILURE: processed block vanished`, checkpoint not advanced.
- Scan worker side: RPC error mid-scan (W7) -> worker terminated, viewing key zeroized, checkpoint kept at the last good page (50000). Checkpoint store survives quota-exceeded `setItem`/`removeItem` and corrupt/truncated JSON (returns `undefined`, no throw).
- Relayer: external bump of the hot key nonce -> exactly one `send_failed` then `ok,ok` (A6); drained hot-key balance -> `send_failed` x3 then `breaker_open`, health 503 (A9); low balance trips breaker on first job, recovers after refill + cooldown (F2); `eth_gasPrice` garbage/error -> `rpc_unavailable`, above cap -> `gas_price_too_high`, `0` -> min fee 2500000 (A10, no div-by-zero); chain clock +2 h -> `422 expired` from simulation (A8a); `SIGKILL` after broadcast then restart -> nonce re-synced from pending, retry of same order `409 nonce_used`, new order 200 (P5); `SIGTERM` idle exits 0 in 15 ms; with work in flight exit follows `shutdownGraceSeconds` (~2 s observed, P4); during close new connections are refused, admitted-but-unstarted sweeps still run until the grace cuts the client connection (F5: second job broadcast after its connection was cut, client sees reset).
- Paid revert when the deadline passes while the tx waits in the mempool (A8b: `status 0x0`, 30481 gas) is inherent; margin is `minSeconds` vs inclusion delay.

## Could not run / not verified

- Duplicate broadcast of the same order while the first is unmined (A4): anvil's `eth_call` at `latest` saw the pending tx's nonce use, so the second request got `409 nonce_used`; on geth/Erigon (state at `latest`) this may differ. UNVERIFIED.
- Underpriced-stuck-tx blocking subsequent nonces and absence of replace-by-fee: no gas bump code exists in `service.ts`/`chain.ts` (read), but base-fee spikes were not simulated (anvil rejects underpriced txs at submit).
- Real browser Worker lifecycle (OOM kill, `messageerror`), real IndexedDB/localStorage quota, Web Crypto failures: only fake workers/in-memory storage in vitest.
- Permit path under chaos (token configured `permit:false` with a one-time approve); policy gate failure path (`policy_unavailable`); multi-chain relayer; Docker/deploy files; websocket transports; DNS failure; long soak.
- `dist/main.js` was used as found in the tree (`apps/relayer/dist`); not rebuilt, freshness vs `src` not checked. chain-adapters/web code ran from `src` via alias.
