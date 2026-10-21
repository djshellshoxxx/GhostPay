# Spec: a11y-pass: Accessibility audit and accessible options
Impact 4/5 | Effort M | Score 2 | Build wave 0 | Depends on: none

## Problem
No axe or screen-reader audit has been run (apps/web/DEVIATIONS.md Unverified); no text-size, motion or contrast options beyond system theme.

## Exists today (verified in repo) vs missing
- apps/web/src/App.tsx skip link, main focus on view change, sr-only live region.
- apps/web/src/components/Common.tsx:5 Notice role="alert" for errors.
- apps/web/src/styles/app.css:130,149,163,196,208,250,252 focus ring, 44 px targets, reduced motion.
- docs/remote/pages-theme/README.md contrast ratios (theme only).
- Missing: everything described under Design.

## Design
(1) CI axe-core run in Playwright over every view and key states (fixed list). (2) Accessible-options settings: text size (100/125/150 %), high-contrast theme tokens, reduce motion override, "simple layout" (single column). (3) Pure helpers: contrast ratio calculator for theme token validation; heading-order and label checker used in tests. (4) Document keyboard map.

## Privacy and security impact
Settings stored with other preferences; no assistive-tech detection or fingerprinting (never read matchMedia results into storage beyond the user's explicit choice).

## Build ownership
- NEW package: `packages/a11y-kit` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/a11y-kit`.
- Public API (exports from `src/index.ts`):
- `contrastRatio(fg: string, bg: string): number`
- `validateTokens(tokens): Violation[]  // min 4.5 text, 3 non-text`
- `headingOrder(html: string): Violation[]`
- `TEXT_SCALES`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/styles/app.css (tokens, scale class)
- apps/web/src/views/Settings.tsx (Accessibility fieldset)
- apps/web/src/lib/settings.ts (new fields via sanitizeSettings)
- apps/web/e2e (axe spec)
- Add `@ghostpay/a11y-kit` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **AYPAS-1** MUST Zero axe "serious/critical" violations on all listed views.
2. **AYPAS-2** MUST All token pairs pass WCAG 2.2 AA contrast (computed by the package).
3. **AYPAS-3** MUST Text scale up to 200 % causes no horizontal scroll at 320 px.
4. **AYPAS-4** MUST New settings sanitised with defaults on bad input.
5. **AYPAS-5** SHOULD Document screen-reader walkthrough results (NVDA/VoiceOver) as manual evidence.

## Acceptance tests
1. **T-1** contrastRatio("#000","#fff")==21 within 0.01.
2. **T-2** validateTokens flags a 3.9:1 pair.
3. **T-3** Playwright axe over 8 views: no serious+.
4. **T-4** 320 px viewport + scale 200 % : document.scrollWidth<=innerWidth.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
