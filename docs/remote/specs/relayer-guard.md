# Spec: `@ghostpay/relayer-guard`

Status: **implemented** in `packages/relayer-guard` (2026-10-21). Not wired into `apps/relayer`; nothing in this spec has run against a real proxy, RPC or chain.

## 1. Purpose

Library of availability and abuse controls for the sweep relayer that close audit 03 findings S3-05, S3-06 and S3-07 and haiku `bugs-btcapps.md` H1/L6 without changing the relayer's HTTP API. Runtime dependencies: Node built-ins only (`node:net` `isIPv4`/`isIPv6`, global `performance.now`).

## 2. Interface

```ts
// Circuit breaker
class GuardedBreaker {
  constructor(opts: { windowSize; minSamples; failureRatio; cooldownMs; probeTimeoutMs }, now?: () => number);
  get state(): 'closed' | 'open' | 'half_open';
  health(): 'ok' | 'degraded' | 'unhealthy';     // half_open is never 'ok'
  retryAfterMs(): number;
  tryAcquire(): Permit | null;                     // Permit = { probe, settled, settle(outcome): boolean }
  run<T>(fn: () => Promise<T>, classify: (r) => 'success' | 'failure' | 'neutral'): Promise<T>; // throws BreakerOpenError
  trip(): void; reset(): void;
}
function classifyRelayOutcome(c: RelayResultClass): Outcome;

// Client address
function parseIp(text: string): { family: 4 | 6; bytes: Uint8Array } | null;
function parseCidr(text: string): Cidr; function cidrContains(b: Cidr, ip): boolean;
class TrustedProxies { constructor(cidrs: string[]); has(ip): boolean }
function resolveClientIp({ peer, forwardedFor, trusted, maxEntries? }): { ip; source: 'socket' | 'forwarded' } | null;
function bucketKey(ip, { v4 = 32, v6 = 64 }?): string;

// Limits
class TokenBucketLimiter { constructor({ ratePerSecond, burst, maxKeys, overflowBurst? }, now?); take(key, cost = 1): { ok; retryAfterMs; overflow } }
class LossBudget { constructor({ windowMs, perKeyLimit: bigint, globalLimit: bigint, maxKeys }, now?); allows(key): boolean; charge(key, amount: bigint): bigint }
```

Errors: `GuardError` with `code` in `BREAKER_OPEN | INVALID_CONFIG | INVALID_ADDRESS`; fixed messages, never request data.

## 3. Semantics (normative)

Breaker:
1. Every admission is a single-use `Permit`. Only the first `settle` has an effect.
2. `neutral` outcomes are never counted. In `half_open`, a `neutral` probe result frees the probe slot (state stays `half_open`, the next `tryAcquire` gets a new probe). This is the S3-05 fix.
3. A probe not settled within `probeTimeoutMs` counts as a failure: the breaker re-opens, and the cooldown runs **from the expiry instant** (`issuedAt + probeTimeoutMs`), not from when the expiry is first observed. (The first implementation got this wrong; the property test found it.)
4. Each state change increments a generation; permits from an older generation are stale and their `settle` returns `false`.
5. `run` settles on every path; if the classifier throws, the permit is settled `neutral`.
6. `health()`: closed = `ok`; half-open, or open with the cooldown elapsed = `degraded`; open and cooling = `unhealthy`.

Relay classification (`classifyRelayOutcome`): `confirmed` = success; `rpc_error`, `send_failed`, `receipt_timeout`, `mined_revert_unexplained` = failure; `simulation_reverted`, `invalid_request`, `nonce_used`, `quote_invalid`, `budget_exhausted`, `gas_price_too_high`, `gas_limit_too_high`, `loss_budget_exhausted`, `mined_revert_state_changed` = neutral. A mined revert whose re-simulation shows the owner's state changed after the relayer's simulation is attacker-attributable (S3-06): neutral for the breaker, charged to `LossBudget`.

Client address (MDN trusted-proxy-list method): an untrusted socket peer is the client and headers are ignored; behind trusted proxies, walk the joined `X-Forwarded-For` list from the right, skip trusted entries, take the first untrusted one; all trusted = leftmost examined; an invalid literal before an untrusted entry, or a missing peer = `null` (caller answers 400; never a shared fallback bucket). At most `maxEntries` (default 16) entries from the right are examined. IPv4-mapped IPv6 is normalised to IPv4. Zone ids are rejected.

Buckets: IPv6 aggregated to /64 by default (one end-site, S3-07), IPv4 per address; canonical text so every spelling maps to one key.

Token bucket: elapsed time clamped at 0 and monotonic default clock (L6). A full table evicts only an idle (fully refilled) bucket, which is lossless; otherwise the newcomer is charged to one shared overflow bucket, so flooding keys cannot evict and refill a victim.

Loss budget: fixed windows; per-key and global caps on unreimbursed loss; same no-live-eviction rule with an overflow entry.

## 4. Threat model

| Threat | Control | Residual |
|---|---|---|
| Probe ends with a user error, breaker latches half-open, `/healthz` says ok (S3-05) | rules 2, 3, 6 | None known in the library; integration must route every exit through `settle`/`run` |
| Attacker front-runs own sweeps to open the breaker (S3-06) | neutral classification + `LossBudget` | Relayer still pays gas up to the loss caps; needs correct re-simulation to tell `mined_revert_state_changed` from `mined_revert_unexplained` |
| Forged `X-Forwarded-For` picks a bucket (S3-07) | trusted-proxy list, right-to-left walk | A compromised trusted proxy can still lie |
| IPv6 /64 rotation mints buckets | /64 aggregation | Larger allocations (/48) need `v6: 48`; operator choice |
| Too many keys evict a victim's bucket | idle-only eviction + overflow | Overflow bucket shared by all newcomers during a flood: legitimate new clients are slowed (availability over fairness) |
| Clock step drains or refills buckets | monotonic clock, clamp | Injected clocks are the caller's responsibility |
| Hostile header size | `maxEntries`, 64-char literal cap | Node's own header-size limit applies first |

Out of scope: TLS, connection-level floods (S3-18a; needs the reverse proxy), quote pricing, signature checks.

## 5. Test plan (implemented)

- Breaker: config validation; ratio/minSamples/window; neutral never counts; single-use permits; S3-05 regression (neutral probe then success after 1 h); probe failure re-opens; probe expiry and ignored late settle; stale closed-era permit; `run` success/failure/`BreakerOpenError`/throwing classifier; property test over random outcome/time sequences (500 runs) that the breaker always admits again after `cooldown + probeTimeout + cooldown`.
- IP: IPv4, eight IPv6 expansion vectors including embedded IPv4, IPv4-mapped normalisation, 11 rejects, property round-trip of random 8-group addresses; CIDR masking/containment and rejects; bucket keys for /64, /24, /128 and prefix validation.
- Client: direct peer ignores header; right-to-left choice; 40 spoofed entries; empty header; all trusted; broken chain; missing/garbage peer; `maxEntries` bound and validation; empty trusted set; bad proxy config.
- Limiter: burst/refill; backwards clock; key flood vs drained victim; idle eviction; cost above capacity; config validation; property: admitted <= burst + rate x elapsed.
- Loss budget: per-key limit and window reset; global limit across fresh keys; overflow sharing and later idle eviction; validation.

## 6. Acceptance criteria

- [x] `npm run typecheck`, `npm run lint`, `npm test` pass in the package; coverage thresholds 95/90/95/95 met (results in `docs/remote/modules-needed.md` report / commit message).
- [x] No runtime dependency outside Node built-ins.
- [ ] Wired into `apps/relayer` (`service.ts` `runJob` through `GuardedBreaker.run`, `server.ts` client IP through `resolveClientIp` + `bucketKey`, `/healthz` through `health()`), with the PoC from audit 03 (`poc-11`) turned into a passing regression test. **Not done** (no edits to apps in this task).
- [ ] Re-simulation at the inclusion block to classify mined reverts. **Not done.**

## 7. Sources

- MDN, "X-Forwarded-For", <https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/http/reference/headers/x-forwarded-for/index.md>, retrieved 2026-10-21: "If the server can be directly connected to from the internet ... **no part** of the `X-Forwarded-For` IP list can be considered trustworthy"; "Any security-related use ... _must only_ use IP addresses added by a trusted proxy"; trusted proxy list method searches from the rightmost.
- Polly (App-vNext) circuit-breaker strategy docs, <https://raw.githubusercontent.com/App-vNext/Polly/main/docs/strategies/circuit-breaker.md>, retrieved 2026-10-21: state diagram "HalfOpen --> Closed: Passes the probe / HalfOpen --> Open: Fails the probe"; `ShouldHandle` predicate selects which results count (basis for `neutral`).
- Node.js v22 `net` docs, <https://raw.githubusercontent.com/nodejs/node/v22.x/doc/api/net.md>, retrieved 2026-10-21 (`net.isIPv4`/`isIPv6`, `BlockList` considered and not used so masking is explicit and testable).
- MDN "429 Too Many Requests" and "Retry-After", <https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/http/reference/status/429/index.md>, retrieved 2026-10-21 (`retryAfterMs` maps to `Retry-After` seconds, rounded up, by the caller).
- Primary RFCs (RFC 7239, RFC 6585, RFC 9110) could **not** be fetched from this session (proxy 403 for rfc-editor.org); not quoted.
