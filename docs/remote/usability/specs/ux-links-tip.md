# ux-links-tip: tipping / donation page model

## Requirements
- R1 `buildTipPageModel(config, {raised}, now)` returns pure data: text fields, 1..6 strictly ascending presets each with a ready `ghostpay:` URI, custom min/max, optional goal.
- R2 All amounts are compared as bigint atomic units. `percent = floor(raised*100/target)` capped at 100; `reached`, `remaining`, `overBy`, `secondsRemaining`, `closed` (deadline passed, informational).
- R3 Presets must lie within [min, max]; default min is one atomic unit.
- R4 No tracking: model has no viewer ids, referrers, pixels, timestamps of viewers; URIs carry no extra params. `raised` is supplied from the owner's local ledger.
- R5 `tipUri(model, amount)` enforces the custom range for payer-entered amounts.

## Acceptance tests (tip.test.ts)
25% of 200 with 50.25; 199.999999 -> 99; exact hit -> 100/closed at deadline; over-funded 250.5; minimal config defaults; tracking-key absence; 24 invalid configs with exact codes; tipUri range boundaries.
