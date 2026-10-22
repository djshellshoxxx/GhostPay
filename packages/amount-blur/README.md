# @ghostpay/amount-blur

Pure TypeScript logic for amount and timing "blur" options. Testnet PoC only (chain ids 31337, 11155111, 84532). No network, storage, clock or timers inside the package; the CSPRNG is injected. All amounts are `bigint`.

This is friction, not anonymity. Default mode everywhere is **Off**.

## Modes

| Mode | What it does | API |
|---|---|---|
| AB-ROUND | Round a gross UP to a multiple of the coarsest 1-2-5 grid step within `roundMaxBps` (default 100 = 1 %, range 0-500). Never down. | `gridFor`, `snapUp` |
| AB-SPLIT | k random parts (default 2-5, hard max 8) summing to `grossForNet(invoiceNet)`, random order, random gaps | `planSplit({mode:'split'})`, `planSchedule` |
| AB-DENOM | Parts drawn from `{1,2,5} x 10^e`; one remainder part absorbs the sub-floor rest and is marked `isRemainder` | `planSplit({mode:'denom'})`, `denominationSet` |
| AB-DELAY | k due offsets, gaps uniform in `[gapMin, gapMax]` (default 120-900 s), horizon default 3600 s, capped by invoice expiry minus deadline margin (default 600 s) | `planSchedule` |
| AB-HON | Honesty meter: coarse crowd label (`unknown`/`none`/`tiny`/`small`/`larger`) plus fixed copy. No numeric score is exposed. | `honestyMeter`, `estimateCrowd` |

Seller side: `matchSplitGroup` proposes sets of found payments that could be the parts of one invoice (never applies a label, returns every candidate, searches at most the 16 most recent payments).

Helpers: `reviewPlan` (review screen figures), `remainingAfter` (paid/unpaid after a stop), `pickBufferPart` (the single part allowed to carry the gas buffer), `assertDistinctPartKeys` (one stealth address and ephemeral key per part), `defaultMinPartBase`, `ABCopy`, `AB_NOT_PROTECTED`, `findForbiddenWords`.

## Defaults and limits

- `minPartBase` default `max(400, 10^(d-2))`; values below 400 are refused (`PART_BELOW_FLOOR`) so splitting cannot dodge the router fee.
- Seller net `>= invoiceNet` always; overpay `<= k + snap slack` (AB-S1). Fee forgone by splitting is 0 to k-1 base units (AB-S3).
- Nothing is signed, queued or persisted. The caller waits per part, rebuilds calldata, re-runs its preview check, then prompts the wallet.

## What this does NOT protect (normative, shown in UI)

1. No anonymity. Payer, token, every part amount, fee and block time stay public; the payer knows every stealth address.
2. No crowd, no gain. With the research 10.2 example (10 events/day, 3 days, 20 buckets) the estimate is 1.5, label `none`.
3. Fan-out is a fingerprint: k payments from one wallet in a short window link to each other.
4. Rounding up costs money, is invertible to a bucket, and there is no refund. Rounding down is not offered.
5. Seller sweeps through a relayer re-link the parts (relayer sees owner, destination, amount, timing).
6. Timing runs in the open tab; it does not hide the IP. Closing the tab cancels remaining parts.
7. No hidden amounts.

The same text is exported as `AB_NOT_PROTECTED`.

## Unverified

- Research figures (Umbra heuristics 48.5 % etc., Wang et al. 52 %/109 %) are carried from `docs/remote/anonymization-research.md`, not re-read; the package uses none of them in output.
- The crowd formula (research 10.2) is a derived estimate, not validated on any testnet. Event rates are never defaulted.
- No contract-level (anvil) or live-testnet run was done; fee maths comes from `@ghostpay/chain-adapters` and is checked against its 399/400 vectors only.
- Scan.tsx behaviour (spec Q3) not checked here.

See `DEVIATIONS.md` for differences from the spec.
