# Spec: templates: Invoice templates and duplicate invoice
Impact 4/5 | Effort M | Score 2 | Build wave 1 | Depends on: local-store

## Problem
Every invoice is re-typed (CreateInvoice.tsx:18-27 starts empty each visit).

## Exists today (verified in repo) vs missing
- apps/web/src/lib/invoiceCreate.ts InvoiceForm shape (lines 20-40).
- Missing: everything described under Design.

## Design
Template = InvoiceForm minus per-invoice fields (nonce, expiry timestamps) with name and version, stored encrypted in local-store. Operations: save as template, apply, duplicate issued invoice (copies lineItems/tax/token, fresh nonce and expiry), import/export inside backup. Placeholders: {{date}} and {{counter}} in description expanded locally by a safe tokenizer (no eval, no arbitrary expressions).

## Privacy and security impact
Templates are commercial data: encrypted at rest, excluded from analytics (none exist). Placeholder expansion is pure string replace of two fixed tokens.

## Build ownership
- NEW package: `packages/invoice-templates` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/invoice-templates`.
- Public API (exports from `src/index.ts`):
- `toTemplate(form: InvoiceForm, name: string): Template`
- `applyTemplate(t: Template, ctx: {nowSec; counter}): InvoiceForm`
- `expandPlaceholders(s, ctx): string`
- `codec: parse/migrate (for local-store)`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/CreateInvoice.tsx (template picker, Save as template)
- Add `@ghostpay/invoice-templates` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **TEMPL-1** MUST Applying a template always yields a fresh nonce and recomputed expiry.
2. **TEMPL-2** MUST Unknown placeholders are left literal and flagged, never evaluated.
3. **TEMPL-3** MUST Template parse rejects over-limit items (50) and descriptions (200 code points) as the schema does.
4. **TEMPL-4** MUST Stored only via local-store.
5. **TEMPL-5** SHOULD Duplicate keeps the original invoice nonce out of the new form.

## Acceptance tests
1. **T-1** applyTemplate twice -> different nonces after build.
2. **T-2** "{{date}}" expands to ISO date from injected nowSec.
3. **T-3** "{{constructor}}" untouched.
4. **T-4** Oversized template rejected.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
