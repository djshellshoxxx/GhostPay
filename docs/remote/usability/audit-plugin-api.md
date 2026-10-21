# Self-review: @ghostpay/plugin-api

Scope: `packages/plugin-api/src/*.ts`. Reviewer: the implementing agent (not
independent). Spec: `specs/plugin-api.md`.

## Threat model

| Actor | Capability | Goal |
|-------|------------|------|
| Malicious plugin author | Ships manifest + hook code that the merchant installs | Weaken privacy quietly, exfiltrate invoice data, phone home, break checkout |
| Buggy plugin | Throws, hangs, returns junk | (accidental) DoS or corrupted settings |
| Plugin vs plugin | Two plugins registered together | Override another plugin's restriction, read its storage |
| Host bug | Wrong grant or defaults | Over-grant permissions |

## Findings and fixes

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | High | A plugin could offer a weaker option (e.g. relay off) that the UI treats as normal. | Fixed: weaker-than-effective options need `downgrade: true` + reason + granted permission; listed in `downgrades`; applied only with per-key acknowledgement. |
| 2 | High | Restriction semantics could be abused to relax (e.g. `relayRequired: false`, `minDelaySeconds: 0`). | Fixed: only `true` for relay; merge is max/OR; property-tested. |
| 3 | High | Network allowlist bypass via suffix/subdomain/credentials/port tricks. | Fixed: WHATWG `URL` parse, exact hostname set, https, no port/credentials. Tests for each. |
| 4 | Medium | Storage traversal / cross-plugin reads. | Fixed: key regex (no `/`, `.`), namespace prefix, reserved index key outside regex. |
| 5 | Medium | Hanging hook blocks checkout; late calls after timeout. | Fixed: per-hook timeout; context revoked on settle/timeout (network response after revoke is not delivered). |
| 6 | Medium | Thrown error text (attacker controlled) reaching UI. | Fixed: only failure codes are recorded. |
| 7 | Medium | Getters/Proxies in plugin output returning different values per read. | Fixed: `readShape` copies own data properties once, rejects accessors/symbols/non-plain prototypes; any trap throw becomes `BAD_OUTPUT`. |
| 8 | Low | Concurrent `storage.set` lost index entries / overshot quota. | Fixed: per-context serialization; regression test. |
| 9 | Low | Result depended on registration order. | Fixed: sequential execution sorted by id; commutative merge; options sorted. |
| 10 | Low | Bidi/zero-width characters in labels for UI spoofing. | Fixed: `textRe` excludes control, bidi override, zero-width. |

## Honest limits (not fixed)

- **Not a JS sandbox.** Plugins run in the host realm. A malicious plugin can
  call `globalThis.fetch`, read DOM/IndexedDB, or monkey-patch built-ins; the
  capability context only constrains well-behaved code. Real isolation requires a
  Worker/sandboxed iframe + CSP (wiring doc step 7). Only install reviewed plugins
  until then.
- **Synchronous infinite loops** cannot be interrupted by a promise timeout; they
  freeze the thread. Only a Worker can be terminated.
- Plugins see `chainId`, `asset`, `amount`, `expiresAt`. Even with no network grant,
  a plugin that escapes (see first bullet) could leak them.
- A plugin's restrictions are lost if it fails (fail-open for that plugin) unless
  registered `required: true`.
- Storage quota is per key count and value length, not total bytes on disk; the
  index lives in the same host store and trusts it to be private to the app.
- `ctx.network` responses are passed through as strings; plugins must parse them
  defensively themselves.
- Uncovered: defensive re-throw branches for non-shape errors (manifest.ts:111 etc.).

## Verification run

`npm test -w @ghostpay/plugin-api` (35 tests, coverage 98.4/97.2/98.4/99.1),
`npm run typecheck`, `npm run lint`, `npm run build` — all pass. Not run: browser
(Worker/iframe) integration, mutation testing.
