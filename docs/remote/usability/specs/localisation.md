# Spec: `@ghostpay/i18n` (localisation)

Status: implemented in `packages/i18n`. Not wired into `apps/web` (see Wiring).

## 1. Requirements
- R1 Catalogs: flat `key -> message` maps per BCP47 locale; keys `[A-Za-z0-9_]+(.[A-Za-z0-9_]+)*`, <=128 chars; messages <=4000 chars. Prototype-poisoning keys are plain data (Map-backed), never looked up on objects.
- R2 Formatting (ICU-lite): `{name}` placeholders and `{n, plural, =0{..} one{..} other{# items}}` with `#`. Nested placeholders inside branches. `other` branch mandatory. Quoting with apostrophes (`'{'`, `''`). No `select`, no `number/date` types (rejected with `unsupported_type`). No eval, no `Function`, no HTML parsing.
- R3 Injection safety: output is plain text. Interpolated values: only string/number/bigint accepted (objects rejected); C0 controls and Unicode bidi controls (U+202A-202E, U+2066-2069, U+200E/F, U+061C) are stripped; optional `escape: 'html'` entity-escapes values; RTL locales isolate values with FSI/PDI. Values containing `{`, `}` or `'` are never re-parsed.
- R4 Resource limits: max nesting depth 4, max 500 AST nodes, max output 20 000 chars. Violations throw `I18nError`.
- R5 Negotiation: `fallbackChain('zh-Hant-TW','en') = [zh-Hant-TW, zh-Hant, zh, en]`; `negotiateLocale(requested[], supported[], default)` with exact -> truncation -> same-language -> default. `parseAcceptLanguage` caps header at 1000 chars / 32 entries, honours q-values, drops invalid tags.
- R6 BCP47: well-formed validation (language, script, region, variants, extensions, private use; no grandfathered, no extlang), canonical casing, max 35 chars.
- R7 RTL flag: `isRtl(tag)` by script (Arab, Hebr, Thaa, Syrc, Nkoo, ...) else language (ar, he, fa, ur, ps, sd, yi, dv, ug, ckb ...).
- R8 Missing-key detector: `t()` never throws on a missing key (unless `strict`), returns key, and reports `{kind, locale, key}` to `onMissing` and to a bounded `MissingKeyTracker`.
- R9 Completeness: `checkCatalogs(catalogs, base)` reports per locale: missing keys, extra keys, placeholder-set mismatches, syntax errors, HTML-looking messages (`<tag`), missing locale-required plural categories. `ok` only if all empty.

## 2. Acceptance tests (all in `src/*.test.ts`)
1. `formatMessage('{n, plural, one{# item} other{# items}}', {n:1})` = `1 item`; `n:0` -> `0 items`; `=0{none}` wins over `other`.
2. `{name}` with value `<img onerror=x>` and `escape:'html'` -> `&lt;img onerror=x&gt;`; value `{evil}` is not re-expanded.
3. Value with U+202E is stripped; RTL locale wraps in U+2068..U+2069.
4. Deeply nested (depth 5) plural throws `too_deep`; 10k-char message rejected.
5. `parseLocale('en_US')`, `'en-'`, `'x-foo'`, `'i-klingon'`, 36-char tag all rejected; `'EN-us'` -> `en-US`.
6. `negotiateLocale(['fr-CA','es-MX'], ['en','es'], 'en')` -> `es`; `['de-AT']` over `['de','en']` -> `de`; unknown -> default.
7. Missing key in `es` served from `en` reports `fallback`; absent everywhere reports `missing` and returns the key.
8. `checkCatalogs` flags a Spanish message that lost `{amount}`.
9. Shipped en/es/de samples pass `checkCatalogs` with `ok === true`.

## 3. Wiring (not done here)
`apps/web` must call `createI18n({catalogs: sampleCatalogs, defaultLocale:'en'})`, set `document.documentElement.lang/dir` from `i18n.locale(...)`, render results with `textContent` only. Locale is a UI preference; never include it in any invoice or network request (fingerprinting). Do not auto-send `Accept-Language` anywhere; read `navigator.languages` locally only.
