# Spec: ux-errors: Error recovery guidance
Impact 4/5 | Effort S | Score 4 | Build wave 0 | Depends on: none
Status: logic built in `packages/ux-core/src/errors.ts` (swarm 7). Package name for the app: `@ghostpay/ux-core` (supersedes the planned `@ghostpay/ux-errors`).

## Problem
Errors are generic ("Something went wrong. Nothing was sent.", "Blocked by a safety check (CODE)") and give no next step.

## Exists today (verified in repo)
- apps/web/src/lib/errors.ts:19-43 `userMessage` maps InvoiceError / ChainAdapterError / GhostPayCryptoError to fixed text; adapter and crypto codes are shown raw.
- docs/user/troubleshooting.md symptom table is not linked from the app.

## Design
Pure catalog keyed by stable code. `recover(code, ctx)` returns `Guidance`:
`{code, summary, cause, steps: Step[], severity, retrySafe, docAnchor}` where `Step = {key, text, action}`.
- `key` is a stable i18n key (`step.<name>`); `text` is static English; `action` is one of `open-settings-rpc | open-settings-relayer | reload | open-troubleshooting | go-online | none` so the UI can render a button.
- Catalog covers 11 invoice, 13 chain-adapter and 16 crypto codes (mirrored from source and diffed by a test) plus 10 app codes: `OFFLINE NO_RPC RPC_UNREACHABLE RELAYER_UNREACHABLE CLOCK_SKEW STORAGE_BLOCKED STORAGE_QUOTA STORAGE_CORRUPT WALLET_MISSING USER_REJECTED`.
- Context rules: network-class entries (and the generic entry) get `go-online` first when `ctx.online=false`, else `add RPC` first when `ctx.hasRpc=false`. `RELAYER_UNREACHABLE` with `hasRelayer=false` leads with the relayer step. Steps are de-duplicated, order stable.
- `ctx.phase` (`prepare|sign|broadcast|unknown`, default unknown) is how the caller proves progress. `retrySafe` is `yes` only if the entry is a pre-signing failure AND `phase==='prepare'`; `no` when the entry is `SIGNING_FAILED` or phase is `sign`/`broadcast`; otherwise `unknown`.
- `retryLine(g)` renders the one-line safety statement; "Nothing was sent" appears only for `yes`.
- `codeOf(thrown)` extracts a code from an unknown thrown value, accepting only `^[A-Z][A-Z0-9_]{1,39}$`; everything else is `UNKNOWN`.
- `diagnostics(code, appVersion)` returns the text for "Copy diagnostics": code and version only, each shape-checked.
- Unknown / malformed / prototype-name codes (`__proto__`, `constructor`) use the generic entry with steps `checkRpc, reload, docs`.

## Privacy and security impact
No telemetry; nothing leaves the device. Output is assembled from static strings only: no input is interpolated, so links, keys, addresses and RPC URLs cannot appear. Own-property lookup prevents prototype-key confusion.

## Requirements
1. **UXERR-1** MUST Every code in InvoiceErrorCode, AdapterErrorCode and CryptoErrorCode has an entry; a test parses the three unions from source and fails on any difference.
2. **UXERR-2** MUST No interpolation of user-supplied strings anywhere in Guidance.
3. **UXERR-3** MUST `retrySafe: "yes"` only for pre-signing errors with caller-proven `phase: "prepare"`.
4. **UXERR-4** MUST Pure and deterministic; no I/O, clock or randomness.
5. **UXERR-5** SHOULD Every entry has a `docAnchor` (lower-case slug) for a docs/user/troubleshooting.md row.
6. **UXERR-6** SHOULD Context-aware first step (offline, then no RPC).
7. **UXERR-7** MUST `diagnostics` output contains only a well-formed code and version.
8. **UXERR-8** MUST `recover` never throws, for any `code` value including non-strings.

## Acceptance tests (all in `errors.test.ts`)
1. **T-1** every code in the three unions plus app codes yields non-empty summary and at least one step; catalog equals the union of the lists.
2. **T-2** property (300 runs, arbitrary strings and contexts): JSON of the Guidance has no `0x`+40-hex and no `http(s)://`.
3. **T-3** `hasRpc=false`, `RPC_UNREACHABLE`: first step action is `open-settings-rpc` and text names Settings.
4. **T-4** unknown codes (`NOPE`, empty, `__proto__`, `constructor`, 500 chars, `0xabc`, non-string) return `code:"UNKNOWN"` with the three universal steps.
5. **T-5** retrySafe matrix: unknown phase -> unknown; prepare + pre-sign -> yes; sign -> no; `SIGNING_FAILED` -> no; `RPC_FAILURE`+prepare -> unknown.
6. **T-6** `diagnostics("0xabc https://x", "v1 https://evil")` gives UNKNOWN / unknown.
Gates: `npm run typecheck && npm run lint && npm test` (thresholds 95/90/95/95), bundle scan clean, no new network host.
