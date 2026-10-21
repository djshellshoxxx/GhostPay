# Spec: theme-pack: Selectable themes incl. cypher and high-contrast
Impact 2/5 | Effort S | Score 2 | Build wave 1 | Depends on: none (originally a11y-pass; WCAG math is implemented in `theme.ts`)
Status: logic built in `packages/ux-core/src/theme.ts` (swarm 7). Applying CSS, the Settings select and the cypher stylesheet file are UI wiring.

## Problem
Theme setting offers system/light/dark only (settings.ts:11,129); the cypher theme exists only as a Pages overlay (docs/remote/pages-theme) and cannot be chosen in the app.

## Exists today (verified in repo)
settings.ts theme union; App.tsx data-theme effect; docs/remote/pages-theme/theme.css; apps/web/DEVIATIONS.md item 21 (bundle scan forbids @font-face in app output).

## Design
- Closed token set (11): `bg surface text text-muted primary primary-text border danger success link focus-ring`; values strictly `#rrggbb`.
- `ThemeDef {id, label, scheme, level: AA|AAA, motion: none|reduced-aware, tokens, cssFile?}`.
- `THEMES` = `light`, `dark`, `high-contrast` (AAA, motion none), `cypher` (AA, motion none, `cssFile: "/themes/cypher.css"`). `THEME_IDS` = `system` + those.
- `validateTheme(unknown) -> Violation[]` (never throws; violations carry static paths and numbers, never input text): id `^[a-z][a-z0-9-]{1,23}$`, label `^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$`, scheme, level, motion, tokens (unknown/missing/bad colour), `cssFile` must equal `/themes/<id>.css`, plus contrast. Only own properties are read.
- WCAG 2.x contrast: `relativeLuminance`, `contrastRatio` (unrounded, so 4.499 fails). 15 pair rules: text pairs (text, text-muted on bg/surface; primary-text on primary; link/danger/success on bg/surface) need 4.5 (AA) or 7 (AAA); UI parts (border/bg, focus-ring on bg and surface, primary/bg) need 3.
- `cssFor(theme)`: refuses any theme with violations; otherwise emits exactly `:root[data-theme="<id>"]{color-scheme:<scheme>;--gp-<token>:#rrggbb;...}` and the same variables as a map for `style.setProperty`. Values and ids are regex-validated before use, so no value can introduce a selector, `url()`, comment or `}`.
- `parseThemeJson(json)`: 4 KiB cap, validates, lower-cases colours, drops unknown top-level fields (for a future "import theme").
- `themeAttr(unknown)` returns a registered id or `system` (THEME-1). `themeCssHref(id)` returns the only stylesheet href the app may append; `isSameOriginThemeHref` is the guard to assert before appending.

## Privacy and security impact
No remote fonts or styles; selecting cypher fetches one same-origin file. Imported themes cannot carry URLs or arbitrary CSS.

## Requirements
1. **THEME-1** MUST Unknown or non-string stored theme -> `system`.
2. **THEME-2** MUST Every registered theme has zero violations (AA text 4.5, UI 3; high-contrast AAA 7).
3. **THEME-3** MUST Cypher `motion: "none"`; reduced-aware themes disable motion under `prefers-reduced-motion` (stylesheet rule, wiring).
4. **THEME-4** MUST Theme file only from `/themes/<id>.css`, same origin; exactly one `<link>` appended, never duplicated.
5. **THEME-5** SHOULD Preview swatch from `tokens` in Settings.
6. **THEME-6** MUST CSS output only for valid themes and only through the fixed template.

## Acceptance tests (`theme.test.ts`)
1. **T-1** `themeAttr` matrix (`evil`, `LIGHT`, `__proto__`, numbers, arrays) -> `system`.
2. **T-2** `validateTheme` on every THEMES entry is `[]`; hc text/bg and muted/surface >= 7.
3. **T-3** (e2e, wiring) selecting cypher appends exactly one same-origin `<link>`.
4. **T-4** injection payloads in tokens (`url(...)`, `#fff;}body{...`, newline, `@import`, objects) -> `BAD_COLOR`; `cssFile` variants (`//host`, `..`, query, backslash, other id) -> `BAD_CSS_FILE`.
5. **T-5** 4.5 boundary: `#767676` on white passes, `#777777` fails; AAA light fails; ui 3:1 checks.
6. **T-6** property (500 runs): `cssFor` output either refused or matches the fixed template regex.
