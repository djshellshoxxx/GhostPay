# @ghostpay/ux-i18n

Pure-logic i18n, accessibility and help/glossary helpers. No DOM, network, timers or analytics; `Intl` is injectable.

- Messages: `parseMessage`, `formatMessage`, `createTranslator` (ICU-lite plural/select/placeholders, values sanitised and HTML-escaped by default), `checkCatalogCompleteness`.
- Locale: `parseLocale`, `negotiateLocale`, `fallbackChain`, `parseAcceptLanguage`, `isRtl`.
- Formatting: `formatNumberParts`, `formatDateParts`.
- a11y: `buildAccessibleName`, `buildLiveRegionMessage`, `contrastRatio`/`rateContrast`, `validateFocusOrder`, `validateAriaLabels`.
- Help: `EN_CATALOG`, `EN_HELP` (glossary + topics), `lookupHelp`, `searchGlossary`, `linkGlossaryTerms`, `estimateReadingLevel`, `validateRegistry`.

Docs: docs/remote/usability/ (specs/ux-i18n-*.md, wiring/ux-i18n.md, audit-ux-i18n.md).
