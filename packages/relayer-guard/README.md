# @ghostpay/relayer-guard

Abuse and availability controls for the GhostPay sweep relayer. Spec: [`docs/remote/specs/relayer-guard.md`](../../docs/remote/specs/relayer-guard.md).

- `GuardedBreaker`: count-window circuit breaker with single-use permits, `neutral` outcomes, probe timeout and stale-permit rejection. A half-open probe can never wedge it (audit S3-05). `health()` reports half-open as `degraded`.
- `classifyRelayOutcome`: default table so user-attributable results (simulation revert, nonce used, caps, front-run reverts) never open the breaker (S3-06).
- `resolveClientIp` + `TrustedProxies`: `X-Forwarded-For` honoured only from trusted proxy networks, walked right to left (S3-07).
- `bucketKey`: canonical IPv4 /32 and IPv6 /64 bucket keys.
- `TokenBucketLimiter`: monotonic, clamped refill; flood-proof bounded table (haiku L6). Slot quota per abuse group; while the table is full, newcomers use their group's own overflow bucket (`maxOverflowGroups`, default 1024) and only then one shared bucket (M-3). Eviction scans the 8 oldest entries for an idle one (L-8). Alert on `stats().overflowHits` and `sharedOverflowHits` (counters only).
- `LossBudget`: per-key, per-group and global caps on gas the relayer paid without reimbursement (S3-06). `reserveAll` charges a loss attributed to several sources (destination and client network) to each key and group and to the global cap once; `cleanReserve` keeps part of the global cap for sources with no loss in the current window (L5-02). Keys and groups live in bounded tables that evict only entries from an earlier window; newcomers overflow per `kind` only while a table is full of live entries, and the reservation reports it (L5-04).

Runtime dependencies: none (Node built-ins). Wired into `apps/relayer` (breaker, trusted proxies, /64 buckets, limiter, loss budget); the challenge module is not. Nothing here has run against a real proxy or network.

```bash
npm run typecheck && npm run lint && npm test   # from this directory
```

## Challenge module

`createChallengeService`: stateless HMAC-signed plain-text question challenge (`issue(context)` / `verify`), with `MemoryReplayStore`, `MemoryAttemptLimiter` and `normalizeAnswer`. **Only raises bot cost; not a security boundary.** Keep it behind the per-owner limiter and `LossBudget`; use shared stores with more than one process. Spec section 8. Not wired into `apps/relayer`.

## Status and deviations

Imported by `apps/relayer` (all but the challenge module, which is unused); no external audit.
Differences from the spec and open items: [`DEVIATIONS.md`](./DEVIATIONS.md). Scripts (`package.json`): `build`, `typecheck`, `test` (`vitest run --coverage`), `lint`.
