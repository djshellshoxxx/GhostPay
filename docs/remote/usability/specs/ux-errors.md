# Spec: ux-errors: Error recovery guidance
Impact 4/5 | Effort S | Score 4 | Build wave 0 | Depends on: none

## Problem
Errors are generic ("Something went wrong. Nothing was sent.", "Blocked by a safety check (CODE)") and give no next step.

## Exists today (verified in repo) vs missing
- apps/web/src/lib/errors.ts:19-43 userMessage maps InvoiceError/ChainAdapterError/GhostPayCryptoError to fixed text; chain-adapter codes are shown raw (errors.ts:38).
- docs/user/troubleshooting.md has a symptom table that the app does not link to.
- Missing: everything described under Design.

## Design
Pure map from stable error code (plus context: view, chain, has-RPC, has-relayer) to {summary, cause, steps[], severity, retrySafe, helpAnchor}. Steps are plain text keys, never interpolated user input. The app shows summary + "What to do" list + retry-safety line ("Nothing was sent" only when the caller proves it). Unknown codes fall back to a generic entry that still lists the three universal steps (check RPC, reload, see troubleshooting).

## Privacy and security impact
No telemetry; no error text leaves the device. Messages must never echo links, keys, RPC URLs (preserves errors.ts contract). "Copy diagnostics" button copies only code + app version, never state.

## Build ownership
- NEW package: `packages/ux-errors` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/ux-errors`.
- Public API (exports from `src/index.ts`):
- `recover(code: string, ctx: {view; chainId?; hasRpc; hasRelayer; online}): Guidance`
- `listCodes(): string[] (for coverage test)`
- `type Guidance = {summary; steps: string[]; retrySafe: "yes"|"no"|"unknown"; docAnchor?: string; severity: "info"|"warn"|"error"}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/lib/errors.ts (add code passthrough; keep userMessage signature)
- apps/web/src/components/Common.tsx (Notice gets optional steps list)
- each view that renders userMessage (Pay, Scan, Sweep, Settings, SellerKeys, CreateInvoice): replace text with <ErrorNotice error=...>
- Add `@ghostpay/ux-errors` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **UXERR-1** MUST Every ChainAdapterError, InvoiceError and GhostPayCryptoError code known to the app has a Guidance entry; a test enumerates the code unions and fails on a missing one.
2. **UXERR-2** MUST Guidance text contains no interpolation of user-supplied strings.
3. **UXERR-3** MUST "retrySafe: yes" only for errors raised before any signing or broadcast.
4. **UXERR-4** MUST Output is deterministic and pure (no I/O).
5. **UXERR-5** SHOULD Link each entry to the matching docs/user/troubleshooting.md row anchor.
6. **UXERR-6** SHOULD Offer context-aware first step (no RPC configured -> "Add an RPC in Settings" button).

## Acceptance tests
1. **T-1** Given every code in the three error enums, recover() returns non-empty summary and >=1 step.
2. **T-2** Property: no output contains a 0x-prefixed 40-hex run or "https://" for arbitrary ctx.
3. **T-3** With ctx.hasRpc=false and code=RPC_UNREACHABLE the first step names Settings.
4. **T-4** Unknown code returns the generic entry.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
