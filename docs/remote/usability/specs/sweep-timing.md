# Spec: sweep-timing (ux-fees)

Module: `packages/ux-fees/src/timing.ts`, `adviseSweepTiming`, `percentile`.

## Requirements
1. Input: local gas-price history `bigint[]` (wei, oldest first, 1..5000 samples, evenly spaced assumed), injected `now`, optional current price (defaults to newest sample), gas units, swept value, urgency, `receivedAt`, funding method, jitter flag.
2. Heuristic: nearest-rank percentiles p10/p25/p50/p75/p90; mid-rank of current in bps. `<= 2500` -> `now`; `>= 7500` -> `wait` (not if `urgent`); otherwise a >= 25 % trend (median of last quarter vs the previous quarter) nudges to `now` (rising) or `wait` (falling, not if urgent); else `ok`.
3. Overrides to `ok`: fewer than `minSamples` (24) samples (confidence forced `low`), flat history (p90 == p10), fee below 10 bps of the swept value.
4. Confidence `low|medium|high` from sample count (<24 / <96 / more), lowered one step each for volatility (p90 > 3x p50) and stale newest sample (> 900 s).
5. **Honest limits** always present: not a prediction, local history only (with sample count), window length when interval known, volatile, stale.
6. `typicalLowSavingNative` only for `wait`, defined as `(current - p25) * gasUnits`, documented as a comparison, not a promise.
7. **Privacy notes**: timing links receipt and sweep addresses; sweeping within 10 minutes of receipt correlates; jitter off; self-funded gas links addresses; sponsored relayer sees the sweep; waiting helps only incidentally; avoid fixed schedules.
8. Never changes amounts/destinations; never triggers a sweep.

## Acceptance tests (`timing.test.ts`)
Ramp 1..100 gwei: current 10 -> `now`, rank 950, p-values exact; current 90 -> `wait`, saving `65 gwei * gas`; urgent -> `ok`; rising/falling/flat trend cases; 3 samples -> `ok`/low; flat history; negligible fee (0 bps) vs 540 bps; volatility and staleness downgrade confidence; privacy keys in order; 16 invalid-input throws; fast-check on percentile order, rank range and advice/rank consistency.
