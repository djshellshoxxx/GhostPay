# Spec: `@ghostpay/secret-box`

Status: **implemented** in `packages/secret-box` (2026-10-21). Not wired into `core-crypto`, `btc-silent-payments` or `apps/web`.

## 1. Purpose

One small primitive for holding secret bytes (spending/viewing scalars, seeds, AES keys) that does not leak through the generic JavaScript copy paths audit 03 S3-08 found in `core-crypto`'s `SecretBytes extends Uint8Array`, plus a scope helper that wipes temporaries on every error path. Zero runtime dependencies; works in browsers, workers and Node 22 (uses Web Crypto `getRandomValues`, `WeakMap`, `Symbol.for('nodejs.util.inspect.custom')`). No new crypto library.

## 2. Interface

```ts
class SecretBox {
  static copyOf(source: Uint8Array, opts?: { label?: string; wipeSource?: boolean /* default true */ }): SecretBox;
  static random(length: number, opts?: { label?: string; rng?: RandomSource }): SecretBox;
  static isSecretBox(v: unknown): v is SecretBox;
  readonly length: number; readonly disposed: boolean; readonly label: string;
  use<T>(fn: (bytes: Uint8Array) => T): T;                 // lends a copy, wiped in finally; rejects thenables
  useAsync<T>(fn: (bytes: Uint8Array) => Promise<T>): Promise<T>;
  take(): Uint8Array;                                       // move out (for postMessage transfer), disposes
  equals(other: SecretBox | Uint8Array): boolean;           // no early exit
  dispose(): void;                                          // wipe, idempotent
  toJSON(): never;  toString(): string;  [Symbol.toPrimitive](): string;  [inspect.custom](): string;
}
function wipe(...buffers: (Uint8Array | null | undefined)[]): void;
function assertNoSecretBox(payload: unknown): void;          // before postMessage / IndexedDB / fetch / structured logs
class SecretScope { track<T extends Uint8Array>(b: T): T; box(bytes, label?): SecretBox; keep(box): SecretBox; close(): void }
function withScope<T>(fn: (s: SecretScope) => T): T;
function withScopeAsync<T>(fn: (s: SecretScope) => Promise<T>): Promise<T>;
```

Errors: `SecretBoxError.code` in `DISPOSED | SERIALIZE | ASYNC_IN_SYNC_USE | INVALID_INPUT | SECRET_IN_PAYLOAD`; fixed messages.

## 3. Design decisions

1. **Not a `Uint8Array` subtype.** Bytes are stored in a module-private `WeakMap` keyed by the frozen box; the box has no own data properties. Consequences (all tested): spread, `Object.entries/keys/assign` give nothing; `structuredClone` (and therefore `postMessage` and IndexedDB, which use the structured clone algorithm) yields `{}`, because class private state and the prototype chain are not cloned; array-like consumers (`Array.from`, `Uint8Array.from`, `new Uint8Array(box)`, `Buffer.from(box)`) see `length` but no indexed data and produce zeros; iteration throws; `TextDecoder.decode` throws; there is no `slice`/`subarray`, so the `Symbol.species` escape (haiku L-06) does not exist.
2. **Redact, do not throw, on string paths.** `String`, templates, `+`, `util.inspect`, `console.log`, `util.format` print `[SecretBox <label> redacted]`. S3-08 noted that `core-crypto`'s throwing inspect hook turns a log line into a crash; a redacted string is safe. **`JSON.stringify` throws** (`SERIALIZE`), because JSON is the transport/persistence path and silently writing a marker would lose data.
3. **Loans, not views.** `use` passes a fresh copy and wipes it in `finally`; a callback returning a thenable is rejected (the copy would be zero by the time awaited code ran). `useAsync` wipes after settlement.
4. **Move semantics for workers.** `take()` hands the internal buffer to the caller and disposes the box; `postMessage(b, [b.buffer])` then detaches the sender's copy (tested with `MessageChannel`).
5. **Scopes.** `withScope` closes on success, throw and the thenable misuse; `track` registers a buffer the moment it exists, which fixes the "throw before the `try`" pattern (S3-15 / haiku L8) and the "later step throws" pattern (haiku I-02). Late registration on a closed scope wipes and throws.
6. **Labels** are restricted to `[A-Za-z0-9_.-]{1,32}` so a label cannot itself carry data or control characters into logs.

## 4. Threat model

| Threat | Control | Residual |
|---|---|---|
| Accidental logging of a key | redacted string paths | Code that calls `use()` and logs the loan still leaks |
| Accidental `postMessage`/IndexedDB/`fetch` of a key object | clone yields `{}`; `assertNoSecretBox` makes it loud | Raw bytes from `use`/`take` are indistinguishable from other bytes |
| Derived views share the buffer (`subarray`, species) | no such methods | None |
| Temporaries left after an exception | `SecretScope` / `withScope` | Values in JS strings and bigints cannot be wiped (core-crypto uses bigint arithmetic) |
| Memory disclosure (swap, core dump, GC copies) | `wipe` best-effort | Inherent to JavaScript; OWASP Secrets Management cheat sheet 2.5 advises threat-modelling in-memory protection rather than relying on it |
| Malicious same-realm code (extension, XSS, compromised bundle) | none | Total compromise (D7); this is a guardrail, not a boundary |
| Timing side channel in `equals` | no early exit | No constant-time guarantee in JS |

## 5. Test plan (implemented)

S3-08 regression list (spread, entries, keys, own names, assign, `structuredClone` direct and nested, iteration, `Array.from`, `Uint8Array.from`, `new Uint8Array`, `Array.prototype.join`, `TextDecoder`, absence of `slice`/`subarray`, six string paths and nested inspect, `Buffer.from`, `Number()`, `JSON.stringify` direct and nested, frozen object); lifecycle (`copyOf` wipe/no-wipe, input and label rejects, `use` wipe on return/throw and isolation, thenable rejection vs non-callable `then`, `useAsync` success/reject wipe, `take` + transfer detach, `dispose` idempotent and blocks use, `equals` box/bytes/length/empty, property test vs byte equality, `random` with injected rng and default Web Crypto, length bounds, `isSecretBox` on look-alike prototype objects); `wipe`; `assertNoSecretBox` on arrays, typed arrays, shared refs, `Map` keys/values, `Set`, cycles, depth > 16 and > 10 000 nodes fail closed; scopes on success, throw, thenable, async success/reject, closed-scope registrations.

## 6. Acceptance criteria

- [x] typecheck, lint, tests pass; coverage >= 95/90/95/95 (actual numbers in the task report).
- [x] No runtime dependency; no `Math.random`.
- [ ] `core-crypto` `SecretScalar` re-based on `SecretBox` or documented as superseded (API change, needs an ADR). **Not done.**
- [ ] `apps/web` `scanClient.runScan` and `session.ts` key paths use `withScope`; worker hand-off uses `take()` + transfer. **Not done.**
- [ ] ESLint rule banning `postMessage`/`structuredClone` of values typed `SecretScalar`/`SecretBox` (S3-08 fix item). **Not done.**

## 7. Sources

- MDN "The structured clone algorithm", <https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/web_workers_api/structured_clone_algorithm/index.md>, retrieved 2026-10-21: used for `structuredClone`, `postMessage` and IndexedDB; "The prototype chain is not walked or duplicated"; "Class private elements are not duplicated"; functions throw `DataCloneError`.
- MDN `structuredClone()` and "Transferable objects", <https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/window/structuredclone/index.md>, <https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/web_workers_api/transferable_objects/index.md>, retrieved 2026-10-21: "Transferring makes the original object unusable" (basis for `take()`).
- MDN `Symbol.species`, <https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/javascript/reference/global_objects/symbol/species/index.md>, retrieved 2026-10-21: copying methods use `constructor[Symbol.species]`; "may create security vulnerabilities ... Avoid relying on it".
- MDN `FinalizationRegistry`, <https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/javascript/reference/global_objects/finalizationregistry/index.md>, retrieved 2026-10-21: "best avoided"; GC timing is engine-specific. Hence no GC-triggered wiping.
- OWASP Secrets Management Cheat Sheet, section 2.5 "Handling Secrets in Memory", <https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/Secrets_Management_Cheat_Sheet.md>, retrieved 2026-10-21.
