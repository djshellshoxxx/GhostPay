# Spec: quick-request: Quick payment request (amount + memo in three fields)
Impact 4/5 | Effort S | Score 4 | Build wave 0 | Depends on: none

## Problem
Create invoice needs chain, token, currency, line items, tax, fee policy, slippage, quote TTL (CreateInvoice.tsx:84-181) even for "send me 25 USDC".

## Exists today (verified in repo) vs missing
- apps/web/src/lib/invoiceCreate.ts:87 buildInvoiceLink (full form -> signed link).
- apps/web/src/views/CreateInvoice.tsx:10-30 form state with defaults.
- Missing: everything described under Design.

## Design
A preset layer that expands {amount, token, chain?, note?, validFor?} into a full InvoiceForm using safe defaults (fixed_token mode, one line item "Payment request" or the note, tax 0, seller_pays, expiry 24 h, no quote). Presets are data: "Simple request", "Tip jar (no amount)" is NOT included (schema needs amount). UI: collapsed "Simple / Advanced" toggle; Simple shows three fields and the resulting preview total; Advanced is the current form pre-filled from the preset.

## Privacy and security impact
Pure local transformation. Defaults must not add identifying fields (no seller name, no email). Note text is encrypted by default in simple mode (flag on) but UI still warns the key is in the link.

## Build ownership
- NEW package: `packages/request-kit` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/request-kit`.
- Public API (exports from `src/index.ts`):
- `expandRequest(r: SimpleRequest, nowSec: number): InvoiceForm`
- `validateRequest(r): RequestProblem[]`
- `SIMPLE_DEFAULTS: Readonly<InvoiceFormDefaults>`
- `type SimpleRequest = {chainId; token: "native"|Address; amount: string; note?: string; validForHours?: number}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/CreateInvoice.tsx (mode toggle; call expandRequest; reuse buildInvoiceLink)
- Add `@ghostpay/request-kit` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **QUICK-1** MUST expandRequest output passes the existing buildInvoiceLink validation without edits to invoice-schema.
2. **QUICK-2** MUST Amount parsed with parseUnits semantics (no float, no rounding); invalid -> RequestProblem, never throws.
3. **QUICK-3** MUST Defaults: fixed_token, tax 0, seller_pays, validFor 24 h (max 90 days as today).
4. **QUICK-4** MUST No default may enable fiat_quote while FEEDS is empty.
5. **QUICK-5** SHOULD Remember last-used chain/token in localStorage via try/catch (per-viewer convenience).
6. **QUICK-6** SHOULD Show the exact total and fee the payer will see.

## Acceptance tests
1. **T-1** expandRequest({amount:"25.5",token:"native"}) -> tokenAmount 25.5 ETH-units string and totals consistent with Pay recomputation (lib/pay.ts:80).
2. **T-2** Amount "1e3", "-1", "0", "1.0000000000000000001" (19 dp) each produce a RequestProblem.
3. **T-3** Round trip: build link, parse with parseFragment, signature valid, lineItems length 1.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
