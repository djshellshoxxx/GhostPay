# Spec: embed-snippet: Embed snippet generator and checkout SDK helpers
Impact 3/5 | Effort S | Score 3 | Build wave 0 | Depends on: none

## Problem
Merchants hand-write the data-invoice attribute and script tag; the SDK is popup-only and takes only a full invoice link (DEVIATIONS item 6).

## Exists today (verified in repo) vs missing
- apps/web/public/ghostpay-embed-v1.js:1-40 usage and validLink rules (same-origin, https, fragment prefix, 22000 max).
- apps/web/src/embed.test.ts.
- Missing: everything described under Design.

## Design
Generator builds a copy-paste HTML snippet (button, script tag, link) and a plain-link fallback; validates exactly the same rules as the embed script (shared validLink implemented in the package and imported by tests of both). Optional styled button variants (no inline style; class names + a tiny same-origin CSS file). Output HTML-escaped; a "test the button" preview opens the real popup.

## Privacy and security impact
Snippet contains the invoice link (bearer): warn that embedding a per-invoice link in public HTML publishes it. Recommend per-order generation, not a static page.

## Build ownership
- NEW package: `packages/embed-kit` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/embed-kit`.
- Public API (exports from `src/index.ts`):
- `makeSnippet(link: string, appOrigin: string, opts: {label?: string}): string`
- `validateEmbedLink(link, appOrigin): "ok"|Reason`
- `escapeAttr(s): string`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/CreateInvoice.tsx (Embed tab after link creation)
- Add `@ghostpay/embed-kit` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **EMBED-1** MUST validateEmbedLink equals the rules in ghostpay-embed-v1.js (cross-test with identical vectors).
2. **EMBED-2** MUST Attribute and text output escapes & < > " '.
3. **EMBED-3** MUST Refuses links on a different origin than appOrigin.
4. **EMBED-4** MUST No inline style/script emitted (CSP-friendly).
5. **EMBED-5** SHOULD Include SRI-free note: script served from same origin as app.

## Acceptance tests
1. **T-1** Label `"><script>` is escaped.
2. **T-2** Link on other origin -> Reason "origin".
3. **T-3** Vectors shared with embed.test.ts all agree.
4. **T-4** Snippet round-trips through DOMParser with one button and one script.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
