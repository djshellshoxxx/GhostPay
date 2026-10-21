# @ghostpay/secret-box

Closure-held secret bytes for GhostPay key handling. Spec: [`docs/remote/specs/secret-box.md`](../../docs/remote/specs/secret-box.md).

- `SecretBox`: not a `Uint8Array`; bytes live in a module-private `WeakMap`. Spread, `structuredClone`/`postMessage`/IndexedDB, array-like copies and iteration see no secret bytes; string and inspect paths print `[SecretBox <label> redacted]`; `JSON.stringify` throws. Access through `use` / `useAsync` (lent copy, wiped afterwards) or `take` (move out, e.g. for a transferable `postMessage`).
- `SecretScope`, `withScope`, `withScopeAsync`: wipe every registered temporary on success and on every error path.
- `assertNoSecretBox`: fail loudly before a payload containing a box leaves the context.
- `wipe`: best-effort zeroization.

Closes the leaks listed in audit 03 S3-08 for code that adopts it. **Guardrail, not a boundary**: same-realm code can still read secrets, JavaScript strings and bigints cannot be wiped, and engines may copy buffers. Zero runtime dependencies. **Not wired into `core-crypto` or `apps/web`.**

```bash
npm run typecheck && npm run lint && npm test   # from this directory
```

## Status and deviations

Library only; not imported by any other workspace; no external audit.
Differences from the spec and open items: [`DEVIATIONS.md`](./DEVIATIONS.md). Scripts (`package.json`): `build`, `typecheck`, `test` (`vitest run --coverage`), `lint`.
