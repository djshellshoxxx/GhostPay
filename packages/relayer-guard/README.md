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
