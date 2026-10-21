# Round 4 (relayer second pass): verify and fix nine findings

Branch `claude/remote-extensions-4`, `apps/relayer` only. Method: every finding got a test first and was run against the unfixed code (real runs). New tests: `apps/relayer/src/round4.test.ts` (30). Not run: `src/e2e.anvil.test.ts` (compiles; `queue.maxPerClient` added to its config literal), any live RPC. Sources: `round-audits/relayer.md` (RL-02/04/05), `stress/relayer.md` (S2, S4), `assurance/chaos.md` (C-5/6/7), `assurance/redteam-relayer.md` (F2/F3), `security-specs/relayer-abuse.md` (RA-CB-5, RA-FG-3).

## Numbers

| | Before | After |
|---|---|---|
| Tests (excl. e2e.anvil) | 209 | 239 (30 new in `round4.test.ts`; the R6 test was changed in place, none removed) |
| tsc `--noEmit` | clean | clean |
| lint | clean | clean |
| Coverage stmts / branch / funcs / lines | 98.41 / 96.41 / 99.34 / 98.97 | 98.35 / 96.13 / 99.39 / 98.94 |

Thresholds (95/90/95/95) untouched. Pre-fix run of the new file: 22 of 28 tests (the file then had 28) failed, 6 passed (the passes pin behaviour that was already right or prove the claim itself, e.g. high-S twin recovers the owner).

## Findings

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Gas-price / funding RPC failures never reach the breaker; all-RPC-down keeps `/healthz` 200 | VERIFIED, FIXED. `gasPrice()` and the pre-lane funding check now call `breaker.recordFailure()`; `/healthz` turns 503 `degraded`; recovers via probe after cooldown | `S2 RPC failures...` x3 (sweep gas price, funding, quote-time + recovery); failed before ("ok" health, `rpc_unavailable` forever) |
| 2 | Front-run reverts trip the breaker | VERIFIED (reproduced: with default `minSamples` 5 three third-party reverts trip it; test config two), FIXED. After a reverted receipt the order is re-simulated once; a `SimulationRevert` (consumed/expired) is user/third-party caused and not counted (RA-CB-5); passing or failing re-simulation still counts. Interaction with round 1: unchanged (half-open probe is closed by `recordSuccess` at broadcast; `releaseProbe` untouched). Griefing cost remains: relayer pays gas of each front-run, bounded by `dailyBudgetWei` only | `breaker and mined reverts` x3; existing `counts reverted and timed-out receipts` still passes (event name `sweep_reverted` kept, `errorClass` now `mined_revert` or `mined_revert_front_run`) |
| 3 | `X-Forwarded-For` spoof with `trustProxyHops>0` and no proxy | VERIFIED (garbage XFF values minted unlimited buckets over real HTTP), FIXED partly: `resolveClientIp` takes the rightmost-trusted entry, accepts only IP literals (mapped IPv6 folded), else socket address; config refuses `trustProxyHops>0` with a public-IP `listen.host`. UNFIXED: wildcard binds stay allowed (Docker), so a directly reachable port with hops>0 is still spoofable by a client giving a valid IP; IPv6 not bucketed per /64 | `X-Forwarded-For parsing...` x3 |
| 4 | Single IP saturates the lane | VERIFIED (RL-02), FIXED: `queue.maxPerClient` (default 3/4 `maxPending`), keyed by salted hash of the resolved IP, `client_queue_full` 429. Not solved: many IPs, or all users behind one proxy address | `per-client lane fairness` x3 |
| 5 | Budget not released on receipt timeout | VERIFIED (RL-04: second sweep `budget_exhausted` though first used 1e14 of 2.6e14), FIXED: off-lane reconciliation (2 more receipt waits; receipt releases unused, none releases all, `receipt_unresolved`); stops at shutdown; releases tagged with the UTC day so a late release cannot reduce a new day. Risk accepted: a tx landing after that is uncounted | `daily budget on receipt timeout` x4, `budget release across the UTC day boundary` |
| 6 | Fee vs gas at send time (R6) | VERIFIED, FIXED (spec: RA-FG-3 "If the fee is below cost at send time, refuse"). `fee_below_gas` 422 inside the lane before simulation, not a breaker failure. **Changed existing test**: the R6 characterization test in `hardening.test.ts` asserted 200 at 40x gas; it now asserts 422 `fee_below_gas` (stricter, documents the new rule). DEVIATIONS 19 rewritten. Web client should treat 422 `fee_below_gas` as "re-quote" (not my ownership, unchecked) | `fee must still cover gas` x4 |
| 7 | High-S signatures accepted | VERIFIED (twin recovers the owner and was sent, 200), FIXED: `isCanonicalSignature` (s <= n/2, v 27/28) matching OZ `ECDSA.recover` used by the contract (`GhostPaySweepRelayer.sol` header); 422 `invalid_signature` before any RPC call. v 0/1 also rejected (contract reverts on it). Check placed after typed-data build so the existing `invalid_order` test keeps its meaning | `high-S / non-canonical signatures` x3 |
| 8 | Log sink failure kills the relayer | VERIFIED (throwing sink propagated), FIXED: `createLogger` swallows sink exceptions; `createStdoutSink` registers a stream `'error'` handler and swallows write errors; `main.ts` uses it. Process-level ENOSPC/EPIPE run (chaos P2/P3) not repeated; unit level only, `main.ts` is outside coverage | `log sink failures are never fatal` x3 |
| 9 | Idle / slow sockets | VERIFIED for S4 (timeouts present but checked only every 30 s default; test with 300 ms timeouts: not closed within 6 s before fix), FIXED: `connectionsCheckingInterval` 1000 ms (closed within 3.5 s in test). `maxConnections` 1024 and `keepAliveTimeout` 5 s unchanged; no per-IP connection cap (UNFIXED, proxy/firewall duty, documented) | `connection timeouts are enforced promptly` x2 |

## Other test edits (inputs only, no assertion weakened)

`api.test.ts` queue-full test: config adds `maxPerClient: 2` (same scenario, same assertions). `config.test.ts` default: expected queue object gains `maxPerClient: 12`. `harness.testutil.ts` / `e2e.anvil.test.ts`: `maxPerClient` in config literals.

## Docs

`apps/relayer/DEVIATIONS.md` items 6, 19, 21-27; `README.md` (check order, error classes, proxy rules); `relayer.config.example.json` (`maxPerClient`).
