# Spec: split payouts and payroll

Package: `@ghostpay/merchant-billing` (`money.ts`, `payouts.ts`). Status: implemented.

## Requirements
1. `splitByBps(total, shares)`: shares sum to exactly 10000 bps, unique ids; floor allocation, leftover units to the largest fractional remainders (ties by input order). Result sums to total exactly.
2. `splitEqual` for installments.
3. Limits per recipient (min and max), max recipients, max total.
4. `chunkBatches(plan, maxPerBatch, maxBatchTotal)`: greedy, order preserving, deterministic batch ids from the plan id and index (retries are idempotent). A single item above batch total is rejected.
5. Input amounts are decimal strings parsed to bigint with the token's decimals; excess precision is rejected, never rounded.

## Acceptance tests (`money.test.ts`, `payouts.test.ts`)
- 100 units at 3333/3333/3334 bps -> 33, 33, 34; 10 units -> 3, 3, 4.
- 1_000_000 at 70/20/10 -> 700000, 200000, 100000.
- 1 unit at 50/50 -> 1, 0.
- Property test: sum always equals total and each share is within 1 unit of exact.
- Five payouts 10..50 USDC, batch cap 60: batches of 60, 40, 50 (base units 6 decimals).
