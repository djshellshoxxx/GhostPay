# @ghostpay/relayer-guard

Abuse and availability controls for the GhostPay sweep relayer. Spec: [`docs/remote/specs/relayer-guard.md`](../../docs/remote/specs/relayer-guard.md).

- `GuardedBreaker`: count-window circuit breaker with single-use permits, `neutral` outcomes, probe timeout and stale-permit rejection. A half-open probe can never wedge it (audit S3-05). `health()` reports half-open as `degraded`.
- `classifyRelayOutcome`: default table so user-attributable results (simulation revert, nonce used, caps, front-run reverts) never open the breaker (S3-06).
- `resolveClientIp` + `TrustedProxies`: `X-Forwarded-For` honoured only from trusted proxy networks, walked right to left (S3-07).
- `bucketKey`: canonical IPv4 /32 and IPv6 /64 bucket keys.
- `TokenBucketLimiter`: monotonic, clamped refill; flood-proof bounded table (haiku L6).
- `LossBudget`: per-key and global caps on gas the relayer paid without reimbursement (S3-06).

Runtime dependencies: none (Node built-ins). **Not wired into `apps/relayer`.** Nothing here has run against a real proxy or network.

```bash
npm run typecheck && npm run lint && npm test   # from this directory
```

## Challenge module

`createChallengeService`: stateless HMAC-signed plain-text question challenge (`issue(context)` / `verify`), with `MemoryReplayStore`, `MemoryAttemptLimiter` and `normalizeAnswer`. **Only raises bot cost; not a security boundary.** Keep it behind the per-owner limiter and `LossBudget`; use shared stores with more than one process. Spec section 8. Not wired into `apps/relayer`.

## Status and deviations

Library only (breaker, limiter, IP resolution, loss budget, challenge module); not imported by `apps/relayer`; no external audit.
Differences from the spec and open items: [`DEVIATIONS.md`](./DEVIATIONS.md). Scripts (`package.json`): `build`, `typecheck`, `test` (`vitest run --coverage`), `lint`.

## Hardening notes (round audit)

- Challenge: pass `partition` (client bucket) to `verify()` and rate-limit `issue()` per client.
- `LossBudget`: use `reserve` / `settle` / `release`; `allows()` is advisory.
- `TokenBucketLimiter`: set `groupOf: groupOfBucketKey` and watch `stats().overflowHits`.
- Breaker: acquire after cheap validation with `tryAcquire({ validated: true })`.

See `docs/remote/specs/relayer-guard.md` section 9.
