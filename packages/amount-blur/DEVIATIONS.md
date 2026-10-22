# Deviations from docs/remote/privacy-specs/amount-blurring.md

1. `snapUp` takes a 4th argument `chainId` and `PlanOptions`/`GroupQuery` take `chainId` (testnet guard at every entry point, shared build rule).
2. `PlanOptions` adds `expiresInSec` (required, caller derives from its own clock, since the package has no clock), optional `deadlineMarginSec` (default 600) and `firstOffsetSec` (default 0). `horizonSec` is capped to `expiresInSec - deadlineMarginSec`.
3. `PlannedPart` adds `deadlineOffsetMs` and `isRemainder`; `SplitPlan` adds `snapSlackGross` (needed to state AB-S1).
4. AB-R4 (idempotent snap, SHOULD) is not guaranteed: the cap is relative to the new base, so a second call can round further (1_234_567 -> 1_240_000 -> 1_250_000 at 1 %). Documented in a test. Per-grid-step semantics: grid values are step sizes, snap goes to a multiple (spec example 104.37 -> 105.00 holds).
5. Free split sums to `grossForNet(invoiceNet)` (not per-part `grossForNet`), which satisfies AB-S1 by floor superadditivity; optional per-part snap uses `roundMaxBps`.
6. Honesty meter shows only a label, never the number `A` (brief: no numeric anonymity scores). `estimateCrowd` still returns `A` per spec interface; UIs must not display it as a score.
7. `matchSplitGroup` returns `{candidates, truncated, capped}`, default `minParts = 2`, and only minimal subsets (dropping the smallest part would fall below expected net). Max group size 8, max 256 candidates.
8. AB-T1/T2/S8/R3/F2/H1/H2 UI and scheduler tests (jsdom, DelayScheduler, spies) belong to the web wiring and are not in this package; pure helpers (`reviewPlan`, `remainingAfter`, copy lint) are provided. AB-S7 is covered by `assertDistinctPartKeys` only (no core-crypto dependency here).
9. Differential anvil test not built.
