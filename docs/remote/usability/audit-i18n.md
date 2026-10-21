# Self-review: @ghostpay/i18n

## Threat model
Inputs: locale tags (browser, header, URL), message arguments (merchant names, addresses, memos: attacker-controlled), catalog files (translator-contributed, semi-trusted). Assets: UI integrity (no HTML/script injection, no address spoofing through bidi tricks), availability (no ReDoS / memory blowup).

## Findings and fixes
- Output is text only; no HTML is ever parsed. `escape:'html'` available for callers that must embed in markup. Documented `textContent` rule.
- Bidi/trojan-source: bidi controls and C0/C1 controls stripped from arguments; RTL locales isolate arguments with FSI/PDI. Template text itself is not stripped (translator-trusted); `checkCatalogs` does not yet flag bidi controls in templates (honest gap).
- Values are never re-parsed (tested with `{b}` and plural syntax inside values).
- Prototype pollution: catalogs live in `Map`s; arguments read with `Object.hasOwn` (tested with `__proto__`, `constructor`).
- DoS: message length 4000, depth 4, nodes 500, output 20 000, Accept-Language 1000 chars / 32 entries, tracker bounded to 1000, plural bigint handled without float overflow.
- Missing keys never crash the UI by default; `strict` for CI. Catalogs parse eagerly, so a broken translation fails at startup, not at checkout.
- No locale leakage: no network code; spec forbids putting locale in invoices or requests.

## Honest limits
- BCP47: well-formedness only (no registry, no grandfathered/extlang).
- Plural rules rely on the runtime `Intl.PluralRules` (CLDR from the JS engine; browsers/Node may differ slightly in version). Only cardinal plurals; no `select`, ordinals, number/date/currency formatting.
- Translation quality of es/de samples is unreviewed machine-style text; samples are for testing the framework only.
- Not wired into apps/web.
- Coverage 100/97.8/100/100 (thresholds 95/90/95/95 unchanged). Not run: browser tests.
