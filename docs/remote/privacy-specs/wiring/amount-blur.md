# Wiring: @ghostpay/amount-blur

For the apps/web owner. All edits are small; no contract, core-crypto, invoice-schema or relayer change. Everything default Off.

| File | Edit |
|---|---|
| root `package.json` | add `packages/amount-blur` to workspaces and `build:libs` after `chain-adapters` |
| `apps/web/package.json` | dependency `"@ghostpay/amount-blur": "0.1.0"` |
| `apps/web/src/lib/settings.ts` | add `blurMode` (`off` default), `blurKMin/KMax` (2/5), `blurGapMinSec/MaxSec` (120/900), `blurRoundMaxBps` (100, 0-500), `blurHorizonSec` (3600), with `checkDelayRange`-style strict parsing. No setting for `minPartBase`: always `defaultMinPartBase(decimals)` (AB-F4); a stored value below 400 must be rejected with `UserFacingError` |
| `apps/web/src/views/Pay.tsx` (~446) | replace the single delay checkbox with an "Amount and timing" selector (Off, Delay only, Rounded, Split, Denominations). Non-Off: render `honestyMeter({mode,crowd,k,windowSec})` lines (`AB_NOT_ANONYMOUS` first) and `notProtected` behind a link. Pass `crowd` only when the user entered or a measurement supplied rates; else the meter says "unknown, assume none". Show `reviewPlan(plan)` (per-part and total gross/fee/net, prompts, extra gas parts, fee delta, overpay) before the first wallet prompt. Rounded mode: show old and new amount, percent, `AB_ROUND_UP`, require explicit confirm event |
| `apps/web/src/lib/pay.ts`, `payExec.ts` | `planSplit({...,chainId, expiresInSec: invoice.expiresAt - now, random: crypto})`; for each part: wait via existing `DelayScheduler` until `dueOffsetMs`, derive a fresh stealth address + ephemeral key (call `assertDistinctPartKeys` on the set), rebuild calldata, run `assertPreviewMatchesCalldata`, then wallet prompt, with router `minNet = part.net` and `deadline = start + part.deadlineOffsetMs`. Attach the gas buffer only to `parts[pickBufferPart(parts)]`. On reject/revert/expiry stop, show `remainingAfter(plan, paid)`, offer resume or cancel; never auto-retry. Never pre-sign. Keep the plan in memory only; show `AB_TAB_OPEN` |
| `apps/web/src/views/CreateInvoice.tsx`, `lib/invoiceCreate.ts` | optional "Round the requested token amount" for `fixed_token`: `snapUp(amount, gridFor(decimals), roundMaxBps, chainId)`; show `reason === 'ROUND_CAP'` as "not rounded" |
| `apps/web/src/views/Scan.tsx` | "Propose split group" action: `matchSplitGroup(found, {chainId, token, expectedNet, toleranceBps, windowSec})`; list ALL candidates (and `truncated`/`capped` notes); apply local `invoiceLabel` only after seller confirms |
| `docs/user/privacy-limits.md`, `docs/user/fees.md` | paste `AB_NOT_PROTECTED`; fee table: split fee delta 0..k-1 base units, floor 400 |

Tests to add in web (not possible in the package): mode selector, confirm-before-round, per-part prompt count, scheduler/spy tests for AB-T1/T2/S8, forbidden-word lint over new view strings with `findForbiddenWords`.

Open: Q3 (does Scan.tsx already match payments to invoices) is unchecked; Q5 (3600 s horizon default) needs owner confirmation.
