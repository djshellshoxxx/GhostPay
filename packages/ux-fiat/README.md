# @ghostpay/ux-fiat

Pure, BigInt-only fiat display logic. No floats, no network, no clock, no DOM. Rates are injected (`RateQuote`: decimal string + timestamp + source); this package never fetches them.

- `parseRate` / `classifyAge` / `checkRateJump`: strict quote validation (zero, negative, huge, tiny, stale, future-dated, bad labels).
- `toFiatMinor` / `fromFiatMinor`: exact conversion with a mandatory rounding mode (`trunc|away|floor|ceil|half-away|half-trunc|half-even`). Reverse direction is explicit: `ceil` to cover a fiat price, `floor` for a cap.
- `formatFiatParts` / `joinParts` / `parseFiatInput`: locale-neutral typed parts; symbol, separators, grouping supplied by caller.
- `parseUnits` / `formatUnits`: base units <-> canonical decimal strings.
- `computeFiatView`: state machine `no-rate | invalid | ok | stale` (offline-safe; stale values withheld unless `showStale`).

Spec: docs/remote/usability/specs/fiat-display.md. Wiring: docs/remote/usability/wiring/ux-fiat.md.
