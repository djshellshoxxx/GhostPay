# Self security review: @ghostpay/amount-blur

AI self-review by the implementing agent, not an independent audit. Date 2026-10-21. Scope: `packages/amount-blur/src`.

## Threat model

Assets: seller receives at least the invoice net; payer never pays more than planned; users are not misled about privacy; no mainnet use; randomness not predictable. Adversaries: chain observers and analysts (fingerprinting, amount inversion), a malicious/buggy caller (bad options), a tampered plan object, a weak or failing RNG.

## Findings

| # | Sev | Finding | Status |
|---|---|---|---|
| 1 | Medium | Modulo bias in order/gap/part sampling would make plans guessable | Fixed: rejection sampling only (`random.ts`); chi-square tests with a power check (naive modulo is rejected by the same test) |
| 2 | Medium | Failing or stuck RNG could silently degrade | Fixed: throws `RANDOM_FAILED` after 256 attempts; no fallback source; no weak RNG calls (grep test AB-P1) |
| 3 | Medium | Tiny parts could dodge the 25 bps fee (dust < 400 pays 0) | Fixed: `minPartBase >= 400n` enforced in `planSplit` and `assertPlanInvariants` |
| 4 | Medium | Seller short-paid by rounding or splitting | Fixed: sum of nets checked `>= invoiceNet` and `<= invoiceNet + k + slack` on every plan; adversarial tests |
| 5 | Medium | Plan outliving invoice expiry | Fixed: horizon capped to `expiresInSec - deadlineMargin`; each `deadlineOffsetMs <= expiresInSec*1000` tested |
| 6 | Low | Mainnet misuse | Guard at `planSplit`, `planSchedule`, `snapUp`, `matchSplitGroup`; ids 1, 10, 137, 8453 tested. `gridFor`, `denominationSet`, `estimateCrowd`, `honestyMeter` carry no chain and are pure data |
| 7 | Low | Subset search DoS in seller matching | Fixed: max 16 candidates (2^16 subsets), size <= 8, output cap 256 |
| 8 | Low | Misleading copy | Mitigated: fixed strings, forbidden-word lint test, meter gives labels only, `A` documented as not a score. Residual: the UI owner can still write bad copy |
| 9 | Info | Fan-out fingerprint and zero crowd gain are inherent | Documented in README, copy and meter warning (`AB_FANOUT_LINKABLE`); not fixable here |
| 10 | Info | AB-R4 idempotence not guaranteed | Documented deviation |
| 11 | Info | Rounding grid is public: invertible to a bucket | Documented |
| 12 | Info | Plans for denom mode can fail with `CAP_EXCEEDED` at tight caps | By design; user raises `roundMaxBps` or uses split |

No secrets handled; no keys derived here; error messages are fixed text without amounts. Plans are frozen objects, but a caller can still mutate copies; the executing code must re-validate with `assertPlanInvariants` if it persists or transmits a plan.

## Verification status

Run: `npx vitest run --coverage` (96 tests pass; statements 98.2 %, branches 95.81 %, functions 100 %, lines 99.7 %), `npm run typecheck`, `npm run lint`, `tsc -p tsconfig.build.json --noEmit`. Includes fast-check properties for AB-R1, AB-S1..S3.

Not run: anvil differential test, contract-level and live-testnet tests, UI/jsdom tests (web owner), scheduler tests with `DelayScheduler`. Research statistics are carried from the repo research and not re-fetched. Crowd formula unvalidated.
