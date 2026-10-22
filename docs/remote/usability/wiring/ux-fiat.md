# Wiring plan: ux-fiat in apps/web

Files (proposed): `apps/web/src/fiat/rateStore.ts` (holds latest user-approved `RateQuote` per asset/fiat; the ONLY place that obtains rates, via a user-configured source or manual entry; this package never fetches), `apps/web/src/fiat/useFiatView.ts`, `apps/web/src/components/FiatAmount.tsx`, `FiatInput.tsx`, `RateBadge.tsx`.

State: `{fiatCode, quotes: Record<"ASSET/FIAT", RateQuote>, showStale: boolean}`; clock injected via `Date.now` wrapper in the store. Locale `FiatFormat` is derived in the i18n layer (ux-i18n) from the active locale, passed in.

Components:
- `FiatAmount`: calls `computeFiatView`; renders parts with `<span>` per type; prefix "~" (i18n `fiat.approx`). `no-rate` renders nothing/"--" (`fiat.noRate`); `stale` renders `fiat.stale` with age; `invalid` renders `fiat.unavailable` (log code locally only).
- `RateBadge`: shows `source` label (text only, never HTML) and age; aging gets a warning style.
- `FiatInput`: `parseFiatInput` -> `fromFiatMinor` with `ceil` when funding a payment amount ("send at least $X"), `floor` for spend limits; show resulting token amount via `formatUnits` and let user confirm the TOKEN amount (fiat is advisory; signed amount is always the token amount).

i18n keys: `fiat.approx`, `fiat.noRate`, `fiat.stale`, `fiat.aging`, `fiat.unavailable`, `fiat.source`, `fiat.ageMinutes`, `fiat.error.<code>` for each FiatErrorCode.

E2E ideas: offline load shows no fiat and no errors; stale quote hides value; toggling locale re-groups digits; entering `1.234` USD shows precision error; extreme rate injected shows unavailable; policy never lets fiat figure appear on the final signing confirmation without token amount.
