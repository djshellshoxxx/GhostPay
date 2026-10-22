# Spec: i18n catalog, interpolation, locale, formatting (ux-i18n)

## Requirements
1. Catalog = flat `Record<dottedKey, template>`; keys match `^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)*$`; lookup via `Object.hasOwn` only.
2. ICU-lite: `{name}`, `plural` (`=N`, zero/one/two/few/many/other, `#`), `select`, apostrophe quoting. `other` mandatory. Limits: 2000 chars, depth 4.
3. Safe by default: interpolated string values are stripped of C0/C1 controls, bidi embeddings/overrides/isolates, zero-width chars and BOM, capped at 1000 chars, then HTML-escaped (`escape:'html'`); `escape:'text'` is opt-in for text-node sinks. Values are never re-parsed as templates.
4. Locale: strict subset BCP 47 (`lang[-Script][-REGION]`), canonical casing; `fallbackChain`, `negotiateLocale` (exact, language, sibling, default), `parseAcceptLanguage` (q-sorted, 1 KiB cap), `isRtl`/`textDirection`.
5. `createTranslator.t` never throws: missing key / bad template / bad params return the key and call `onIssue` (missing-key detection).
6. `checkCatalogCompleteness(base, target)`: missing, extra, param-set mismatch, invalid key/template, coverage; `checkCatalogSet`.
7. Formatting via injected `IntlLike`: `formatNumberParts`, `formatDateParts` (+ string helpers). Allow-listed options, finite numbers only, valid dates only, UTC default, locale fallback to `en`.

## Acceptance tests (implemented in `src/*.test.ts`)
- `{n, plural, =0 {No items} one {# item} other {# items}}` -> "No items", "1 item", "1,234,567 items"; Arabic n=0/2/3/11 -> zero/two/few/many; Russian 21/22/5 -> one/few/many.
- `<b>{v}</b>` with `<img src=x onerror=alert(1)>"'` + backtick + `&` -> fully escaped value; property: html-mode output of one arg has no `<`/`>`.
- `0x12‮34` loses the override; select with `__proto__` falls to `other`.
- Random/hostile template strings only ever throw `I18nError`.
- `pt-br` -> `pt-BR`; `en_US`, `en-US-u-ca-x`, `../../etc` rejected; chain `zh-Hant-TW` -> `[zh-Hant-TW, zh-Hant, zh, en]`.
- `fr;q=0.5, en-US, de;q=0.9, *;q=0.1, ja;q=0` -> `[en-US, de, fr]`.
- Completeness: missing/extra/mismatch/invalid detected; English catalog self-check passes.
- `formatNumber(1234567.891,'de')` = `1.234.567,891`; currency `$1,234.50` parts; NaN/Infinity/bad currency throw; `formatDate(Date.UTC(2024,1,29,13,5,9),'de',{dateStyle:'long'})` = `29. Februar 2024`.
