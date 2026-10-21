# Spec: net-status: Status and health
Impact 3/5 | Effort S | Score 3 | Build wave 0 | Depends on: none
Status: pure state machine built in `packages/ux-core/src/netstate.ts` (swarm 7). The probe runner (fetch, timeouts, storage/wallet probes) is NOT part of ux-core and stays in the wiring session.

## Problem
Failures (no RPC, wrong chain id, relayer down, wrong device clock) surface late and cryptically; invoice expiry depends on the device clock.

## Exists today (verified in repo)
- apps/web/src/views/Settings.tsx:47-60 per-chain RPC "Test" (chain id check only).
- apps/relayer/src/server.ts serves GET /healthz and /v1/info.
- apps/web/src/lib/settings.ts storage-failure tolerance.

## Design (split in two layers)
**Layer A, ux-core (built): reducer over injected probe results.**
- State: `browserOnline`, `configuredChains`, per-chain RPC `EndpointState`, relayer `EndpointState`, `config`. No URLs or hosts, only chain ids and the literal `relayer`.
- Events: `browser-online`, `browser-offline`, `configure {chainsWithRpc, hasRelayer}`, `probe {target, result, atMs}`.
- `ProbeResult = {ok:true, latencyMs, blockTimestampSec?} | {ok:false, reason: timeout|network|http|chain-mismatch|bad-response}`.
- Reachability: `unknown | reachable | degraded | unreachable | stale`. Unreachable after `failThreshold` (2) consecutive failures; one success recovers; latency over `slowMs` (3000) is degraded; successes older than `staleAfterMs` (300 s) read as stale.
- Offline: probe failures are not counted (the network is the cause). Returning online resets counters and results to unknown so the user re-checks.
- `clockSkewSec(localNowMs, blockTimestampSec)` = local minus block time, rounded; `|skew| > 120` raises `CLOCK_SKEW`.
- `summarize(state, nowMs)` -> `{overall, rpcDown, relayer, errorCode}`; overall priority: offline, no-rpc, rpc-down, rpc-degraded, relayer-down, clock-skew, unknown, ok. `errorCode` is a ux-core catalog code (`OFFLINE NO_RPC RPC_UNREACHABLE RELAYER_UNREACHABLE CLOCK_SKEW`).
- `backoffMs(failures, jitter01)` for a user-confirmed retry button; jitter injected.
- Hostile probe data (negative/NaN latency or timestamp, unconfigured chain, relayer probe with no relayer) is ignored or downgraded to `bad-response`. At most 64 chains tracked.

**Layer B, wiring (not built): check runner** `runChecks(env)` per original spec: RPC chain id and block age, relayer `/healthz` + `/v1/info`, manifest, storage, wallet, worker, secure context. Each check has an 8 s timeout and cannot throw; results feed `reduceNet` as `probe` events. Report text replaces hosts with "RPC for <chain name>" and contains no "http".

## Privacy and security impact
No third-party endpoints, no "is the internet up" ping. Probes only go to endpoints the user configured, only on a button press (label states that the relayer sees the IP). Results held in memory only.

## Requirements
1. **NETST-1** MUST No probe without a user action (runner contract; reducer has no timers).
2. **NETST-2** MUST Reducer never throws on any event sequence (property test).
3. **NETST-3** MUST Relayer state ignores probes when no relayer is configured.
4. **NETST-4** MUST Clock skew derives from the RPC block timestamp only.
5. **NETST-5** MUST State contains no URL (test).
6. **NETST-6** MUST Offline failures do not accumulate; online transition resets.
7. **NETST-7** SHOULD Summary maps to a ux-core error code for guidance.
8. **NETST-8** MUST Hostile probe numbers cannot produce `reachable`.

## Acceptance tests (`netstate.test.ts`)
1. **T-1** one failure tolerated, two -> `rpc-down` + `RPC_UNREACHABLE`, one success recovers.
2. **T-2** block timestamp 600 s behind local clock -> skew 600, overall `clock-skew`; exactly 120 -> ok.
3. **T-3** no relayer configured: probe returns same state object; summary relayer `not-configured`.
4. **T-4** `JSON.stringify(state)` has no `http` or `://`.
5. **T-5** offline/online transitions; stale after 400 s; degraded at 3001 ms; hostile data matrix; 300-run event-sequence property.
6. **T-6** backoff 1000..60000 with injected jitter; junk inputs sanitised.
Runner-level tests (chain-id mismatch -> "different chain"; zero fetch spies when relayerUrl is empty; report has no "http") belong to the wiring session.
