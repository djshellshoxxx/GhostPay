# Spec: privacy score / hygiene coach (ux-privacy)

## Requirements
- Input `PrivacyFacts`: addressReuseCount, amountMatchCount, inOutAmountEqual, secondsBetweenInAndOut|null, gasFunding (unlinked|linked|unknown), relayerUsed, anonymitySetSize|null. Strictly validated (safe non-negative integers, bounded; else `UxPrivacyError INVALID_INPUT` naming the field only).
- Output: integer score, band (`exposed|weak|fair|careful`), raw score, six factors (weights 20/15/15/20/10/20 summing to 100, each 0-100 with explanation text and i18n key), caps, ranked advice, limits text.
- Caps: never above 90; never above 60 if anonymity set known and < 10.
- Unknown inputs scored cautiously and marked `known:false`.
- Advice only for factors scoring < 80, sorted by recoverable points, ties by factor order.
- Honesty: no "anonymous"/"private" wording in bands; limits list always returned.
- Deterministic, pure.

## Acceptance tests (score.test.ts)
Best case raw 96 -> 90; worst case 4 with factor scores [0,0,10,0,25,0]; small-crowd cap to 60; unknown handling; advice ranking and tie-break; tier boundaries; malformed-input rejection (NaN, Infinity, negatives, strings, undefined); fast-check: bounds, determinism, monotonic in reuse and crowd, advice sorted.
