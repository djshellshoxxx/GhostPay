# @ghostpay/i18n

Pure-logic localisation: catalogs, ICU-lite (`{name}`, `{n, plural, ...}`), locale negotiation with fallback chain, BCP47 validation, RTL flag, missing-key detector, catalog completeness check. No network, no `eval`, no HTML parsing. Spec: `docs/remote/usability/specs/localisation.md`. Audit: `docs/remote/usability/audit-i18n.md`.

```ts
import { createI18n, sampleCatalogs, checkCatalogs, parseAcceptLanguage } from '@ghostpay/i18n';
const i18n = createI18n({ catalogs: sampleCatalogs, defaultLocale: 'en' });
const { locale } = i18n.negotiate(navigator.languages);          // read locally; never send it anywhere
const tr = i18n.translator(locale);                               // tr.dir -> 'ltr' | 'rtl'
el.textContent = tr.t('checkout.amount_due', { amount: '12.50', asset: 'USDC' }); // textContent, not innerHTML
checkCatalogs(sampleCatalogs, 'en').ok;                           // run in CI
```
Amounts are passed as pre-formatted strings (money is never a float here). Run `npm test -w @ghostpay/i18n`.
