# Wiring plan: ux-i18n in apps/web

No UI is built in this package; wiring below is a plan (unverified against the app tree).

## Files / components
- `apps/web/src/i18n/index.ts`: build `catalogs = { en: EN_CATALOG }`; `negotiateLocale(parseAcceptLanguage(navigator.languages.join(',')) , Object.keys(catalogs), 'en')` once at boot, user override persisted in local storage (validated through `parseLocale` on read).
- `I18nProvider` (React context): holds `Translator`, sets `<html lang dir>` from `textDirection(locale)`. `useT()` returns `t`. Always render with `escape:'text'` ONLY when output goes to React text nodes (React escapes); otherwise leave default `html`.
- `onIssue` -> dev: console.warn; test: fail the test (missing-key detection). Never send to a network.
- `<Amount/>`, `<DateTime/>`: use `formatNumberParts/formatDateParts` and render parts as `<span data-part=type>` (e.g. dim the fraction).
- `<LiveRegion/>`: one visually hidden `role=status` and one `role=alert`; update text from `buildLiveRegionMessage` (pass previous text).
- `<HelpButton topic="send-private"/>`: `lookupHelp` -> popover/dialog; terms rendered via `linkGlossaryTerms` as `<button>` that open the glossary entry. `<GlossarySearch/>` uses `searchGlossary` (debounce in component, not here).
- Design tokens: CI test calls `rateContrast` for every fg/bg token pair (text 4.5, UI 3).
- Dev/CI: run `validateAriaLabels`/`validateFocusOrder` over data extracted from the rendered tree in component tests.

## State
Locale (string), translator (derived), last live message (string), help popover state (topic id). No remote state.

## i18n keys
All keys in `EN_CATALOG` (`common.*`, `nav.*`, `send.*`, `receive.*`, `activity.*`, `relayer.*`, `recovery.*`, `settings.*`, `error.*`, `a11y.*`, `help.*`). Use `a11y.step` for wizards, `help.open` for help buttons.

## e2e ideas
- Switch to `ar`: `dir=rtl`, focus order matches visual order.
- Paste hostile label `<img onerror>` as recipient name: appears as text, no script runs.
- Screen-reader smoke: copy address triggers one polite announcement; repeated copy re-announces.
- Axe run on Send, Receive, Help dialog.
- Every `help.open` topic id exists (`lookupHelp` not undefined).
