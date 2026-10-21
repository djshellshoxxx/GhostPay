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

## 8. Challenge module (plain-text question)

Purpose: raise the cost of scripted abuse of the sweep endpoint. **It is not a security boundary.** A bot solves a plain-text question trivially; the module only forces it to ship a solver and spend a round trip. It must sit behind the per-owner `TokenBucketLimiter` and the gas `LossBudget`. Client-side checks are worthless; the relayer must verify.

### 8.1 Design

- `createChallengeService({ secrets, ttlMs = 120_000 (max 900_000), difficulty = 1|2|3, now = Date.now, randomBytes, replayStore, attemptLimiter, maxAttempts = 3 })`. Bad config throws `GuardError('INVALID_CONFIG')`. Node `crypto` only; no network, no third-party code, nothing secret is logged.
- `issue(context)` returns `{ question, token, expiresAt }`. `context` is caller supplied, 1..256 chars (e.g. `${chainId}:${owner}`), never an IP.
- Token: base64url of `v1.<expiryMs>.<nonce16 b64url>.<mac b64url>`. `mac = HMAC-SHA256(signKey, len-prefixed(version, expiry, nonce, difficulty, context))`. `signKey` and `questionKey` are independent subkeys of each secret (HMAC with distinct labels).
- Stateless: question and answer are regenerated on verify from an HMAC-SHA256 counter-mode PRF keyed by `questionKey` over `nonce | difficulty`. The token carries no answer.
- `verify({ token, answer, context })` order: parse (token <= 200 chars, canonical base64url fields) -> MAC against every secret with `timingSafeEqual` -> expiry (`now >= expiresAt` is expired) -> attempt counter (id = nonce) -> normalised answer compared as SHA-256 digests with `timingSafeEqual` -> `replayStore.markUsed(nonce, expiresAt)` on success. Returns `{ ok: true }` or `{ ok: false, reason }` with `malformed | bad_signature | expired | wrong_answer | too_many_attempts | replayed | replay_store_full`. It never throws on attacker input.
- `context_mismatch` is intentionally **not** a reason: the context is inside the MAC, so a wrong context is indistinguishable from a forgery and reports `bad_signature`. Telling them apart would be an oracle.
- Wrong answers consume attempts and do not mark the token used. Attempt limiter or replay store failure or fullness fails **closed** (`too_many_attempts` / `replay_store_full`).
- `normalizeAnswer`: NFKC, trim, lowercase, collapse whitespace, any `\p{Nd}` digit to ASCII, strip leading `+` and zeros on numeric answers, reject > 64 chars (before and after NFKC).
- Question bank: fixed local tables, chosen deterministically from PRF bytes (no `Math.random`). Arithmetic (add, non-negative subtract, multiply, multiply-add) with operands scaling by difficulty; words/patterns (nth letter, reversed word, next number in a sequence, letter count, longest/shortest, alphabetical first/last). Prompts use ASCII digits.
- Stores: `ReplayStore.markUsed(id, expiresAt)` and `AttemptLimiter.increment(id, expiresAt)` (sync or async). `MemoryReplayStore` / `MemoryAttemptLimiter` are bounded (`maxEntries` 10_000), purge expired entries first, never evict live ones; when full the replay store throws `ReplayStoreFullError` and the attempt limiter returns `Infinity`.

### 8.2 Threats

| Threat | Handling |
|---|---|
| Bots solve questions trivially | Accepted. Only raises cost; per-owner limiter and `LossBudget` remain the real controls. |
| Token theft / replay | Single use via replay store; short TTL; wrong answers cannot mark it used, so a thief cannot burn a victim's token except by solving it. |
| Context binding | Context is inside the MAC; a token issued for owner A fails for owner B (`bad_signature`). |
| Secret rotation | First secret signs, all verify. Add the new secret first, drop the old after `ttlMs` has elapsed. Secrets >= 32 bytes, copied at construction. |
| Clock skew | Wall clock is required, since another process may verify. `monotonicNow` is wrong here (per-process origin). Keep hosts NTP-synced; skew shifts effective TTL by the skew. Changing `difficulty` invalidates outstanding tokens. |
| Multi-process replay | Memory stores are per process: a token can be replayed once per process. Production with more than one relayer process must supply a shared `ReplayStore` and `AttemptLimiter`. |
| DoS via verify cost | Token capped at 200 chars, context at 256, answer at 64; one HMAC per secret plus one for the question; rate limit before verify. |
| Answer oracle | Constant-time digest comparison; no answer or token in errors. Attempt cap (default 3) bounds guessing. |

### 8.3 Integration note (later `apps/relayer` wiring; not done here)

1. Call `issue(`${chainId}:${owner}`)` on a GET and return `question` and `token`.
2. On the sweep request, call `verify` **before** simulation or any gas spend; reject on any `ok: false` (HTTP 4xx, or 429/503 for `too_many_attempts` / `replay_store_full`).
3. Keep the per-owner `TokenBucketLimiter` and the `LossBudget` in front of both endpoints.
4. Context is `chainId:owner`, never the client IP.
5. Load secrets from the environment (>= 32 random bytes each); never commit them.
6. Use a shared replay store and attempt limiter if more than one relayer process runs.

## 9. Round-audit hardening (M-1..M-4, L-7, L-8)

### 9.1 Design

- **Challenge stores (M-1).** `verify({ token, answer, context, partition })`; `partition` is the caller's client bucket (for example `bucketKey` of the resolved IP, 1..256 chars, never logged). `ReplayStore.markUsed(id, expiresAt, partition?)` and `AttemptLimiter.increment(id, expiresAt, partition?)`. Memory stores keep a per-partition quota (`maxPerPartition`, default `maxEntries/8`). Attempt limiter: partition at quota -> `Infinity` for that partition only; table globally full -> evict the oldest entry of the largest partition (the evicted token only gets fresh attempts). Replay store: never evicts a live entry (that would permit replay of a solved token); throws `ReplayStoreFullError` for the over-quota partition, or for everyone only once the whole table is full of solved tokens. Expired entries are reclaimed from the front in O(1) amortised, with at most one full scan per second (L-7).
- **LossBudget (M-2).** `reserve(key, estimate)` checks key and global limits and charges the estimate in one synchronous step (`key + estimate <= perKeyLimit`, `global + estimate <= globalLimit`), returning `null` when it would exceed. `settle(reservation, actual)` replaces the estimate by the actual cost (floored at 0, idempotent), `release` refunds fully. `allows()` is advisory only.
- **TokenBucketLimiter (M-3, L-8).** Optional `groupOf` (see `groupOfBucketKey`: IPv6 /48, IPv4 /24), `maxPerGroup` (default `maxKeys/4`), `maxOverflowGroups` (1024). A group cannot exceed `maxPerGroup` slots; when a group is saturated or the table is full, newcomers use their own group's overflow bucket; the single global overflow bucket is the last resort. `stats()` returns `{ overflowHits, tableSize, overflowGroups }` for alerting. Eviction looks at the 8 oldest entries for an idle (refilled) one.
- **Breaker (M-4).** `tryAcquire({ validated })`: in `half_open`, `validated: false` is refused without consuming the slot. `maxNeutralProbes` (default 5): after that many consecutive neutral probe settles in one half-open episode only `validated: true` callers may take the probe. `retryAfterMs()` returns a floor of 1..1000 ms while a probe is in flight. The S3-05 never-wedge guarantee (neutral frees the slot, unsettled probes expire and re-open) is unchanged.

### 9.2 Threat notes

| Threat | Handling / residual risk |
|---|---|
| Flood `issue()` and fail one answer each to fill the stores | Per-partition quota; victim in another partition verifies. Residual: an attacker with >= 8 partitions (default quota) can still fill the replay store by solving challenges, or force attempt-limiter evictions among their own partitions; cap `issue()` per client. |
| Parallel sweeps overshoot the loss cap | `reserve` before sending. Residual: actual loss above the estimate is recorded after the fact; use worst-case estimates. |
| Many-/64 attacker drains the shared overflow bucket | Group slots and per-group overflow. Residual: an attacker owning many /48 or /24 groups can still fill the table and share the global last-resort bucket once `maxOverflowGroups` groups overflow; alert on `stats().overflowHits`. |
| Attacker-controlled neutral outcomes pin the half-open probe | Validated-only acquisition and the neutral bound. Residual: a legacy caller that never passes `validated` can lose the probe to unvalidated traffic after 5 neutral settles until a validated caller takes it (breaker stays half-open, degraded, not wedged). |

### 9.3 Integration MUSTs

1. Rate-limit `ChallengeService.issue()` per client (it is stateless and unauthenticated) and pass `partition` (the client bucket key) to every `verify()`.
2. Use a shared store with per-client quotas if more than one process runs.
3. Call `LossBudget.reserve` with a worst-case estimate before spending gas, then `settle` with the actual unreimbursed loss (0n if reimbursed) or `release`; do not rely on `allows()`.
4. Build the per-client `TokenBucketLimiter` with `groupOf: groupOfBucketKey`, size `maxKeys` well above the expected concurrent honest clients, and alert on `stats().overflowHits`.
5. Acquire a breaker permit only after cheap validation (schema, quote, signature, rate limit) and pass `{ validated: true }`.

