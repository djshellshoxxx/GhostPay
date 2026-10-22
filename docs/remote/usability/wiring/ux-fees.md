# Wiring plan: ux-fees -> apps/web

Package is logic only. Nothing below exists yet; paths are proposals to match the current apps/web layout (verify before use).

## Components
- `components/pay/FeePreviewCard.tsx` (before every payment, blocks the Confirm button when `!canProceed`).
  Renders `lines` (label via `t(line.labelKey)`, `display` + symbol, "to GhostPay" badge from `goesToGhostPay`), `payerTotals`, `disclosure`, `privacyNotes` (collapsed "Privacy details"), `warnings` by severity (block = red, cannot dismiss).
- `components/pay/CheapestChainHint.tsx`: shown on the chain selector when more than one chain qualifies; lists `ranked` with fiat or native cost, `why` keys, "Use <chain>" button when `suggestion === 'switch'`. Never auto-switches.
- `components/sweep/SweepTimingHint.tsx`: chip `now|wait|ok` + confidence + "Why?" popover (`reasons`, `limits`, `privacy`). The limits list is always visible in the popover.

## State / data sources
- Quotes: build `ChainFeeQuote[]` in a hook `useFeeQuotes()` from chain-adapters (`CHAINS`, adapter `fees`, RPC `maxFeePerGas`, gas estimate) with `quotedAt = clock.now()`. Re-quote every 30 s while the card is visible; the 120 s staleness check is a backstop.
- Rates: from ux-fiat (already injected-rate based). Pass `undefined` if the user disabled fiat or offline.
- Fee schedule/recipient: from the verified deployment manifest loader; `recipientFromSignedManifest` is true only when signature verification succeeded in this session.
- Fee history: `useGasHistory(chainId)` keeps a ring buffer (<= 5000 bigint samples) in IndexedDB, sampled from the user's own RPC; no third-party gas oracle. Clear on "Clear local data".
- Clock: single injected `clock.now()` (unix seconds bigint).

## i18n keys (ux-i18n catalog additions; params are plain)
`fees.cheapest.{why,excluded,warn,note}.*`, `fees.timing.{reason,limit,privacy}.*`, `fees.preview.{line,note,disclosure,privacy,warn,info}.*` exactly as emitted (grep `'fees\.` in packages/ux-fees/src). Plural/number formatting of `display` values stays in the UI (`display` is a locale-free exact string).

## Flow integration
1. Payment screen builds `FeePreviewInput` -> `buildFeePrivacyPreview`; Confirm disabled unless `canProceed`; the preview is re-built on any amount/chain/mode change.
2. Signing path must NOT trust the preview: it recomputes with chain-adapters `routerFee`/`sponsorFee` and `assertSponsorFeeAcceptable`; a mismatch aborts.
3. Sweep screen: call `adviseSweepTiming` when opened and on each new sample; "Sweep now" always available.

## e2e ideas (Playwright)
- Preview shows 0.25 USDC on 100 USDC; edits to 399 base units show the dust note.
- Unsigned manifest -> Confirm disabled with the "unverified fee recipient" message.
- Switching `net` mode shows payer total > recipient amount.
- Chain hint: stale quote chain listed under "unavailable"; no auto switch.
- Sweep hint with < 24 samples shows low confidence and the limits popover; screen-reader reads chip + confidence.
- Accessibility: warnings use role=alert for `block`; no information by colour alone.
