# @ghostpay/ux-fees

Pure, UI-free, network-free fee logic for the GhostPay client. Specs: `docs/remote/usability/specs/{cheapest-chain,sweep-timing,fee-privacy-preview}.md`. Wiring: `docs/remote/usability/wiring/ux-fees.md`. Audit: `docs/remote/usability/audit-ux-fees.md`.

| Export | Purpose |
|---|---|
| `suggestCheapestChain(quotes, payment, opts, rates?)` | Compare per-chain fee quotes (bigint, optional injected fiat rates, tie-breaks, staleness, explain-why keys). |
| `adviseSweepTiming(input)` | `now` / `wait` / `ok` from a local gas-price history, with confidence, honest limits and a privacy note. |
| `buildFeePrivacyPreview(input)` | Itemised fee lines, per-asset totals, privacy notes and warnings shown before every payment. |
| `DEFAULT_FEE_SCHEDULE` | Copy of docs/FEE_SCHEDULE.md numbers (drift-tested by text). |

Rules: no clock, no randomness, no network, no storage; times and rates are injected; messages are `{ key, params }` for ux-i18n. Input shapes mirror `packages/chain-adapters` (`ChainConfig`, `FeeCapability`, `FEE_SCHEDULE`) but nothing is imported from it.

Scripts: `npm run typecheck && npm run lint && npm test`.
