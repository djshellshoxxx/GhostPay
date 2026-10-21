# Spec: theme-pack: Selectable themes incl. cypher and high-contrast
Impact 2/5 | Effort S | Score 2 | Build wave 1 | Depends on: a11y-pass

## Problem
Theme setting offers system/light/dark only (settings.ts:11,129); the cypher theme exists only as a Pages overlay (docs/remote/pages-theme) and cannot be chosen in the app.

## Exists today (verified in repo) vs missing
- apps/web/src/lib/settings.ts:11 theme union; App.tsx data-theme effect.
- docs/remote/pages-theme/theme.css, apply-theme.sh, Michroma OFL font.
- apps/web/DEVIATIONS.md item 21: bundle scan forbids @font-face in app output.
- Missing: everything described under Design.

## Design
Theme registry {id,label,tokens, optional cssFile}. Built-in tokens for light/dark/high-contrast live in the app CSS; cypher ships as a separate same-origin static CSS + font file loaded only when selected (link element appended by the app, CSP style-src/font-src self already allow). Scan-bundle allowlist extended for that one static file. All themes validated by a11y-pass contrast checker in CI.

## Privacy and security impact
No remote fonts; selecting a theme fetches one same-origin file (visible only to the host serving the app anyway).

## Build ownership
- NEW package: `packages/theme-pack` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/theme-pack`.
- Public API (exports from `src/index.ts`):
- `THEMES: readonly ThemeDef[]`
- `validateTheme(t): Violation[] (contrast via a11y-kit)`
- `themeAttr(id): string`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/lib/settings.ts (theme union widened, sanitised)
- apps/web/src/views/Settings.tsx (select)
- apps/web/src/App.tsx (apply + lazy link)
- apps/web/scripts/scan-bundle.mjs (allow theme file)
- Add `@ghostpay/theme-pack` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **THEME-1** MUST Unknown stored theme falls back to system.
2. **THEME-2** MUST Every theme passes AA contrast validation.
3. **THEME-3** MUST Cypher animation-free; honours prefers-reduced-motion.
4. **THEME-4** MUST Theme file loaded only from same origin.
5. **THEME-5** SHOULD Preview swatch in Settings.

## Acceptance tests
1. **T-1** sanitizeSettings({theme:"evil"}) -> "system".
2. **T-2** validateTheme(cypher) has no violations.
3. **T-3** Selecting cypher appends exactly one <link> to same-origin href.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
