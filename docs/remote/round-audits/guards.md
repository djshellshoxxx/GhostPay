# Security audit: packages/relayer-guard and packages/secret-box

Scope: `packages/relayer-guard/src/{breaker,limiter,ip,client,challenge,challenge-bank,errors,index}.ts`, `packages/secret-box/src/{secretBox,scope,index}.ts`. Findings only; no fixes applied. Reviewed at branch claude/remote-extensions-1, 2026-10-21. Existing suites pass (relayer-guard 137 tests, secret-box 31 tests via `npx vitest run`). PoC script: scratchpad `poc.mjs` run against a fresh `tsc --outDir` build of both packages (note: `packages/relayer-guard/dist/index.js` is older than `src/index.ts`, so dist may be stale; I did not use it).

Cross-check: `grep -rn "relayer-guard\|secret-box" docs/remote/audits docs/threat-model docs/reviews docs/audits` returns nothing, so the haiku audits never covered these packages; the only prior context is S3-05/06/07/08 (`docs/audits/03-security-review-client-relayer.md`) and `docs/remote/security-specs/relayer-abuse.md` (RA-CB-*, RA-RL-5, RA-FG-4). No file under `apps/` imports either package (grep), so every finding is latent until integrated.

## Threat model

Assets: relayer hot-key gas balance (unreimbursed gas), relayer availability, per-client fairness, key material held in the browser/worker/relayer process (private keys, seeds, AES keys), challenge HMAC secrets.

Trust boundaries: (1) public HTTP to relayer: peer socket, `X-Forwarded-For`, token/answer/context fields are attacker-controlled; (2) operator config (trusted proxy CIDRs, limits, secrets) trusted; (3) shared stores (`ReplayStore`, `AttemptLimiter`) trusted to be atomic; (4) JS realm: secret-box is a guardrail against accidental leaks, not against code in the same realm.

Adversaries: A1 anonymous remote client with many IPs/IPv6 /64s; A2 sweep-griefer who front-runs sweeps to cause mined reverts (S3-06); A3 bot solving challenges; A4 curious/buggy in-realm code (logging, structuredClone, postMessage); A5 malicious in-realm script (out of scope by design, noted).

## Summary

Critical 0, High 0, Medium 4, Low 8, Info 6. Medium findings are availability/budget issues that depend on the missing integration and on upstream rate limiting.

## Findings

### M-1 Challenge stores can be filled by anyone who can call `issue()`, denying all verifications (Medium)
Evidence: `challenge.ts` `ExpiringTable.set` (lines ~78-86 of file as numbered by `cat`: maxEntries default 10_000) returns false when full of live entries; `MemoryAttemptLimiter.increment` then returns `Infinity` and `verifyInner` returns `too_many_attempts` for every new token; `MemoryReplayStore.markUsed` throws `ReplayStoreFullError` -> `replay_store_full`. `issue()` is unauthenticated and stateless (no cap). An attacker needs only a valid-MAC token per slot: 10 000 `issue()` calls, one wrong answer each.
Reproduction: PoC block 1 (`node poc.mjs`): after 10 000 issued tokens each verified once with a wrong answer, a fresh victim token returns `{"ok":false,"reason":"too_many_attempts"}` for the full TTL (120 s default). The same works for the replay store by solving (solvable trivially, bots) 10 000 challenges.
Fix: cap `issue()` per client (document as MUST in integration), key attempt/replay state so one client cannot occupy all slots (per-bucket quota in the store), or use a shared store with eviction policy that evicts oldest-by-client instead of failing closed for everyone.

### M-2 `LossBudget` check-then-charge race: concurrent requests overshoot the cap (Medium)
Evidence: `limiter.ts:474-481` `allows()` is read-only and `charge()` (`:490`) is called only after the revert is mined; no reservation. PoC block 2: 50 `allows('k')` calls before any charge all return true with `perKeyLimit=10n`; after 50 charges of 5n the key total is `250n` (25x the limit; global limit 100n also exceeded).
Impact: A2 fires N parallel front-runnable sweeps; loss bounded only by concurrency and the token bucket, not by the budget the spec advertises (S3-06 / RA-FG-4).
Fix: add `reserve(key, estimate)`/`release`/`settle` (charge the estimate up front, refund on success), or serialize sends per key.

### M-3 Table-full overflow bucket lets a many-/64 attacker starve all new legitimate clients (Medium)
Evidence: `limiter.ts:401-409` newcomers share one `overflowBucket` while the table holds non-idle entries; `BoundedTable.canInsert` (`:304-308`). PoC block 3: maxKeys=100, burst=2: after 100 attacker keys each take 1 token, legit new keys get `[true,true,false,false,false]` (overflow bucket drained by the first two).
Impact: A1 with an IPv6 /48 (65 536 /64 buckets, default `v6: 64` in `ip.ts` `bucketKey`) or a modest IPv4 botnet exceeds default `maxKeys` and keeps every first-time user throttled; known trade-off (DEVIATIONS.md item 4) but no mitigation hook (no per-/48 secondary aggregation, no metric/alert on `overflow: true`).
Fix: second-level aggregation (e.g. /48 key charged in parallel), expose overflow rate for alerting, size `maxKeys` guidance in the spec.

### M-4 Neutral-classified requests can hold the half-open probe slot indefinitely (Medium, depends on caller ordering)
Evidence: `breaker.ts:191-196` a probe settled `neutral` only clears `probeIssuedAt` and stays `half_open`; `tryAcquire` (`:117-127`) admits the next caller as the probe; other callers get `null` while a probe is in flight. PoC block 4: attacker probe acquired, legitimate `tryAcquire()` returns null, attacker settles `neutral`, state remains `half_open`, attacker re-acquires. Outcome table classes attacker-controllable as neutral: `invalid_request`, `simulation_reverted`, `nonce_used`, `quote_invalid` (`breaker.ts:249-257`).
Impact: if the relayer acquires the permit before cheap validation, an attacker with enough request rate keeps the slot occupied so the breaker never closes and honest users see BREAKER_OPEN (service availability). Also `retryAfterMs()` returns 0 while a probe is in flight (`:105-109`), inviting immediate retries.
Fix: acquire permits only after validation, or make a probe slot pass to the next arrival only for a bounded number of neutral releases; return a nonzero floor from `retryAfterMs` in half-open.

### L-1 `SecretScope.close()` aborts on a non-Uint8Array tracked value, leaving other secrets live (Low)
Evidence: `scope.ts:335-341` `wipe(...this.buffers)` throws for a non-buffer (`b?.fill is not a function`); `track<T extends Uint8Array>` is unchecked at runtime (`:298-305`). PoC block 7: `scope.track({})` then `close()` throws and a previously boxed secret has `disposed === false`; the `buffers`/`boxes` arrays are also not cleared. Called from `finally` in `withScope`, so the secret survives and the exception masks the original error.
Fix: validate in `track`, and make `close()` wipe each entry in its own try/catch, always disposing boxes.

### L-2 `wipe()` trusts `fill`; a Uint8Array subclass defeats zeroization (Low)
Evidence: `secretBox.ts:50-52` calls `b.fill(0)`. PoC block 9: subclass overriding `fill` leaves `[9,9,9]` after `SecretBox.copyOf(src)` (default `wipeSource: true`). Realistic only with attacker-supplied buffer types; fix: `Uint8Array.prototype.fill.call(b, 0)`.

### L-3 `SecretBox.prototype` and statics are mutable; in-realm hooking steals bytes (Low, documented guardrail)
Evidence: class is not frozen (`Object.freeze(this)` only freezes instances, `secretBox.ts:84`). PoC block 9: replacing `SecretBox.prototype.use` captured `[5,6]`. Documented as in-realm out of scope (`@security` on class), but cheap hardening: `Object.freeze(SecretBox.prototype)` and `Object.freeze(SecretBox)`, capture `Uint8Array.prototype.slice` at module load.

### L-4 `use()` with an async callback starts the work, then throws; the promise is orphaned (Low)
Evidence: `secretBox.ts:159-170`: callback runs, returned thenable detected after the fact, copy wiped while the async body may still read it (zeros) and its rejection is unhandled. PoC block 10: `unhandled "late"` printed. Fix: nothing guaranteed at runtime; at least attach a no-op catch to the thenable before throwing.

### L-5 `assertNoSecretBox` misses several containers and can throw non-SecretBoxError (Low)
Evidence: `secretBox.ts:259-273` walks `Object.values` / Map / Set only. PoC block 8: box under a symbol key, a non-enumerable property, a WeakMap, or a closure all return without throwing (documented as "own enumerable structure"); a throwing getter surfaces a raw `TypeError` (the walk invokes getters, a side effect on untrusted payload). Class instances with private fields holding boxes are also not inspectable. Fix: document precisely, catch getter errors and fail closed with INVALID_INPUT, include `Reflect.ownKeys`.

### L-6 Challenge and breaker secret hygiene: keys never wiped, no entropy check (Low)
Evidence: `challenge.ts:~264-270` copies each secret with `Uint8Array.from(s)` and derives two subkeys that live for the process lifetime in plain Buffers; the copy is not wiped and the package does not use `@ghostpay/secret-box` although it is the intended holder. `requireConfig` only checks length >= 32: PoC block 12 accepts `new Uint8Array(32)` (all zero). Tokens signed with a leaked old secret stay valid as long as it remains in `secrets` (no key id, no per-key expiry). Fix: entropy sanity check (reject all-equal bytes), accept `SecretBox`, wipe copy after derivation.

### L-7 `ExpiringTable.set` does an O(n) purge on every insert attempt when full (Low, DoS amplifier for M-1)
Evidence: `challenge.ts` `ExpiringTable.set` loops over all entries when `size >= maxEntries`. PoC: 200 verifications against a full 10 000-entry attempt table took ~186 ms (about 0.93 ms each, single thread; comparison baseline not measured). Fix: heap/ordered expiry or amortized purge.

### L-8 `BoundedTable.canInsert` only inspects the LRU entry (Low)
Evidence: `limiter.ts:304-308`. PoC block 3b: maxKeys=2, A drained and least-recently-used, B fully refilled: new key D still goes to overflow although B is idle and evictable. Needlessly pushes honest newcomers into the shared bucket (feeds M-3). Fix: scan a bounded number of oldest entries or maintain an idle index.

### I-1 Challenge is a bot-trivial plain-text puzzle and `issue()` is unauthenticated (Info)
Documented (`challenge.ts` header @security). A3 solves it by program. Tokens are not bound to a client, so solving can be outsourced. Correct posture only if limiter and LossBudget stay in front.

### I-2 `run()` replaces the operation's error when the classifier throws (Info)
`breaker.ts:159-162`: PoC block 5 prints `run err "classifier"`; original error lost (permit is still settled neutral). Fix: classify inside its own try and rethrow the original.

### I-3 IP parsing coverage (Info, verified)
PoC block 6: `::ffff:a.b.c.d` normalises to IPv4 (including hex form); leading-zero IPv4 and trailing-dot are rejected (`null`); zone ids rejected (`ip.ts:567`). Other embeddings of the same client (`::1.2.3.4` IPv4-compatible, NAT64 `64:ff9b::`, 6to4 `2002::`) stay distinct IPv6 keys (bucket evasion only across address families the attacker already controls). XFF entry with a port (`1.2.3.4:5555`) returns `null` (client must answer 400, so a proxy that appends ports would deny all traffic). `parseCidr('::ffff:10.0.0.0/8')` yields an IPv4 /8, which differs from IPv6 prefix semantics and could surprise an operator (`ip.ts:589-598`).

### I-4 Fixed windows in `LossBudget` allow a 2x burst at a window boundary; state is in-memory and lost on restart (`limiter.ts:512-514`) (Info).

### I-5 `SecretBox.random(len, {rng})` accepts any rng; a faulty rng yields an all-zero key without error (PoC block 11) (Info; test seam, but public option). `equals` is documented non-constant-time.

### I-6 Dependency risk (Info)
No runtime dependencies in either package.json (only `node:crypto`, `node:net`); devDependencies pinned exactly. I did not run `npm audit` (no registry access verified; unverified). Timing: `timingSafeEqual` used on equal-length 32-byte buffers for MAC and SHA-256 digests of the answer (`challenge.ts` verifyInner); no early-exit leaks found. Error handling: all error messages are fixed strings with no secrets or IPs (`errors.ts`, `secretBox.ts`).

## Verified-good controls (checked in code and by tests/PoC)
Token format is canonical and length-bounded (200 chars); MAC covers version, expiry, nonce, difficulty and context with length-prefixed framing; expiry and store TTL boundaries are consistent (`>=` vs `<=`); answers are regenerated from a separate PRF subkey so tokens do not reveal them; replay mark only after a correct answer, attempts counted before the answer check; fail-closed on store errors; trusted-proxy right-to-left XFF walk with `null` on broken chain; breaker permits are single-use, generation-stamped, and stale settlements are ignored.

## Not verified
Real integration behaviour (no consumer in `apps/`); multi-process stores; `npm audit`; mutation of production `dist`.
