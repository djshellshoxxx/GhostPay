# Privacy spec: Amount and timing blurring (`@ghostpay/amount-blur`)

Status: spec only, 2026-10-21. Branch `claude/remote-extensions-1`. Testnet PoC only (Ethereum Sepolia, Base Sepolia). Effort: M. Maps to `docs/remote/anonymization-research.md` 4.2 (denominations), 4.3 (delays), 10.2 (anonymity-set model), L10/L11.

Legal: deferred by the owner (ADR-0006, research section 11). Noted once, not a blocker. This spec adds no custody, no fee and no pooled funds. One fee-relevant point is flagged in 5.4 (splitting below the dust threshold) because it touches F-PAY enforcement, not legality.

Evidence tags: [R] read in this repo, [P] primary source, [S] secondary source, [U] unverified or derived. No standard is invented. Web access in this session was blocked by the sandbox proxy (HTTP 403 on arxiv.org and eips.ethereum.org, 2026-10-21), so every external claim below is carried from `anonymization-research.md` and is tagged [S] or [U], not [P]. Re-fetch before relying on them.

## 1. Goal

Provide user-selectable amount and timing "blur" for the payer and the seller, honestly labelled as friction with measurable limits, in four independent modes:

| Mode ID | Name | Who acts | What changes |
|---|---|---|---|
| AB-ROUND | Rounded amounts | Seller (invoice) and payer | Gross is snapped onto a coarse grid so fewer distinct amounts exist on-chain |
| AB-SPLIT | Split payment | Payer | One invoice paid by k router calls to k distinct stealth addresses over time |
| AB-DENOM | Fixed denominations | Payer (and seller exit planner) | Parts are drawn from a small shared denomination set |
| AB-DELAY | Randomized delay | Payer, and seller (sweep) | Existing Feature 6 jitter, generalised to schedules of several steps |

Plus one non-mode deliverable: an **honesty meter** (AB-HON) that computes and shows the crowd-size estimate of research 10.2 and the plain statement "this does not make you anonymous" next to every mode.

Non-goals: pools, mixers, decoy transactions, dummy payments, cover traffic, multi-output router, any contract change. "Decoy-free" is deliberate: a decoy is a payment of real funds that the user did not need to make, and without a crowd it is a recognisable pattern too (4.4).

## 2. Threat addressed, and what it does NOT protect

Addressed (research ids):

| ID | Leak | Observer | Effect of this spec |
|---|---|---|---|
| L11 | Amounts are invoice-specific; `net` is in announcement metadata; gross is reconstructible from `FeeCollected` and `gross = net + fee` [R] | Everyone | AB-ROUND/AB-DENOM make amounts collide across invoices, shrinking amount-based matching |
| L10 | Payment shortly after invoice view; seller sweep shortly after receipt [R] | Host, chain observers | AB-DELAY widens the time window |
| amount-uniqueness heuristic | Kovacs and Seres, Umbra analysis (arXiv 2308.01703), behavioural heuristics identified 48.5 % / 25.8 % / 65.7 % / 52.6 % of recipients on Ethereum / Polygon / Arbitrum / Optimism [S via research 10.1; the paper was not re-read; the exact heuristics set is [U]] | Analysts | Only the amount and timing parts of such heuristics are touched |
| mixer-heuristic evidence | Wang et al., WWW '23, doi:10.1145/3543507.3583217: heuristics raised deposit-withdraw linking probability ~52 % (ETH) / ~109 % (BSC) [S via research 5.4] | Analysts | Supports "behaviour defeats naive blur"; used for the honesty text only |

NOT protected (must appear in UI copy and `docs/user/privacy-limits.md`; this list is normative):

1. **No anonymity.** Payer address, token, every part's amount, fee and block time remain public. The payer still knows every stealth address it paid (D1, L3). Blur never hides payer-to-stealth links.
2. **No crowd, no gain.** Per research 10.2, with the GhostPay-only crowd of the example (10 payments/day, 3-day window, ~20 buckets) |A| is ~1.5 before blur. Blur reduces the denominator (buckets) and widens the window; with a small crowd both effects are near zero. The research's own verdict: "Delaying one transaction is not a proper anonymity set" [R, quoted there from the roadmap]; splitting without a crowd "creates a recognisable fan-out" (4.2 [U]). This spec therefore ships a quantified meter (AB-HON) instead of a claim.
3. **Fan-out is itself a fingerprint.** k router calls from one payer within a short window, sum equal to a known invoice amount, are linkable to each other by sender, token, router, and time. Splitting hides which single amount was the invoice, not that an invoice-sized payment was made.
4. **Rounding up leaks nothing but costs money; rounding down is not offered.** The grid snap is a function of public inputs, so an observer who knows the grid can invert it to a bucket (not to the exact invoice amount).
5. **Seller side:** the seller's sweep of each part (relayer path) re-links per-part unless AB-DENOM/AB-DELAY feed an actual shared exit; the relayer sees owner, destination, amount, timing (PA-ADV3 [R]). Sweep blur is bounded by hygiene (`privacy-specs/hygiene.md`: fresh destination per sweep, no consolidation) and does not replace it.
6. **Browser-bound timing.** AB-DELAY runs in the open tab; it does not hide the IP from RPC/relayer/host (use `onion-i2p-research.md` transports). A closed tab cancels the schedule.
7. **No hidden amounts.** Nothing here is confidential-amount tech (research 5.6: recommendation no).

## 3. User-visible options

Location: Pay view "Options" fieldset (`apps/web/src/views/Pay.tsx` ~line 446, existing "Wait a random time first" checkbox) and Settings. New selector "Amount and timing" with exactly these choices, default **Off**:

| Option | Payer sees | Seller sees |
|---|---|---|
| Off | Current behaviour | Current behaviour |
| Delay only | Existing checkbox, unchanged (120-900 s default, `settings.delayMinSec/MaxSec`) | n/a |
| Rounded amount | "Pay 105.00 USDC instead of 104.37 (+0.6 %). The seller receives the extra." Requires explicit confirm. | Invoice creation toggle "Round the requested token amount to a grid" (AB-ROUND at creation) |
| Split | "Pay in k parts over about T minutes. Cost: k times gas; fee changes by -X base units" with a per-part schedule table and a cancel button | Scan view "Expected split group" aggregation (5.3) |
| Denominations | As Split, but parts chosen from the denomination set; remainder shown | Same |
| Honesty meter | Always shown with any non-Off mode: estimated crowd size, plus fixed text "This does not make you anonymous. See what it does not hide." | n/a |

Fixed copy keys (testable, `ABCopy`): `AB_NOT_ANONYMOUS`, `AB_COST_GAS`, `AB_FEE_DELTA`, `AB_ROUND_UP`, `AB_FANOUT_LINKABLE`, `AB_TAB_OPEN`.

## 4. Architecture

### 4.1 Layers

```
@ghostpay/amount-blur  (pure TS, no I/O, no storage, no clock except injected)
  grid.ts        snapUp, gridFor(decimals), denominationSet
  split.ts       planSplit -> SplitPlan (k parts, gross each, fee/net each, delays)
  schedule.ts    planSchedule: CSPRNG delays for k steps, bounded, monotone-safe
  fees.ts        thin wrappers over @ghostpay/chain-adapters routerSplit/grossForNet; aggregate invariants
  meter.ts       estimateCrowd (research 10.2 formula), honesty text selector
  group.ts       seller-side grouping: matchSplitGroup(announcements, expected) (5.3)
apps/web (edits listed in 5.2)  consumes the plan; reuses DelayScheduler per part
```

Each part is an ordinary router call (`payERC20` / `payERC20WithPermit` / `payNative` / `payERC20WithBuffer` [R, CONTRACTS_SPEC 1]) with its **own** stealth address and ephemeral key (derive once per part via existing `core-crypto` derivation; never reuse an ephemeral key across parts). No contract change.

### 4.2 AB-ROUND

Grid by decimals `d` of the token: 1-2-5 series (1, 2, 5, 10, 20, 50, ...) times `10^(d-2)` base units, i.e. whole cents of the token at the lowest, extended upward. `snapUp(gross, grid)` returns the smallest grid value `>= gross`. Round **up only**: the seller must receive at least the invoiced net. Cap: increase `<= roundMaxBps` (default 100 bps = 1 %, user range 0-500); if the cap would be exceeded, use the next finer grid step, and if none fits return the unrounded amount with reason `ROUND_CAP`.

Invoice interplay [R, `invoice-schema/src/schema.ts`]: `amountPolicy` is `fiat_quote` or `fixed_token` with `tokenAmount` string. Fiat-quote invoices are disabled in practice (no oracle feeds, ADR-0012 [R]), so the PoC acts on `fixed_token`: at creation the seller may set `tokenAmount` to a grid value (no schema change; the signed invoice already commits to it). Payer-side rounding of a fixed invoice is **only upward and only with explicit confirm**, because the payer pays more than the signed amount.

### 4.3 AB-DENOM and AB-SPLIT

Denomination set `D(d)`: for decimals `d`, default `{1, 2, 5} x 10^e` for `e` from `d-2` to `d+4` (so 0.01..500,000 units for stablecoins; configurable). `planSplit(total, mode, opts)`:

1. Choose target `k` in `[kMin, kMax]` (defaults 2..5; hard max 8) by CSPRNG.
2. DENOM: greedy decompose `total` into elements of `D`, then merge or split greedily to reach k parts; remainder `r < smallest allowed part` is absorbed into the largest part (rounded up, see 4.2) so the seller never receives less than the invoice net. SPLIT (free): k random positive parts summing to `total`, each `>= minPartBase` (5.4), parts rounded to `D` only if the cap holds.
3. Shuffle parts with CSPRNG (Fisher-Yates over rejection-sampled indices; reuse the `randomDelayMs` sampler design in `apps/web/src/lib/jitter.ts` [R]; no `Math.random`).
4. Assign delays (`planSchedule`): `delay_0 = 0` or a payer-chosen start offset; subsequent gaps iid uniform in `[gapMinSec, gapMaxSec]` (default 120-900 s, same as Feature 6), total horizon `<= horizonSec` (default 3600; never beyond the invoice `expiresAt`, see R-INV-4).
5. Output `SplitPlan` (6.1) with per-part `{gross, fee, net, dueOffsetMs}` and totals `{grossTotal, feeTotal, netTotal}`.

Execution: per part, `DelayScheduler` (existing) waits; at due time the existing prepare/review path (`payExec.ts`, `pay.ts`) re-builds calldata, **re-runs `assertPreviewMatchesCalldata`**, and the wallet prompts. Nothing is pre-signed or pre-broadcast (Feature 6 rule [R]). Each part is a separate wallet confirmation (k prompts); this is a UX cost, stated in the UI.

### 4.4 Why no decoys

Decoy payments (random extra transfers) are excluded: (a) they cost real fees at 25 bps plus gas and the fee-bypass analysis in 5.4 shows a decoy below 400 base units is free but trivially recognisable by size; (b) with a crowd of ~1.5 candidate events a handful of decoys are statistically identifiable by sender and timing; (c) they would be "cover traffic" that the research only endorses at the network layer (Nym, `onion-i2p-research.md`), not on-chain [R/U].

### 4.5 Seller side (AB-SPLIT aggregation)

Facts [R]: router metadata carries `viewTag | selector | token | net` and no invoice id; the seller's scanner (`apps/web/src/lib/scannerCore.ts`, `tags.ts`) matches announcements to the seller's keys, with an optional local encrypted tag `invoiceLabel`. There is no automatic "invoice paid" match by amount in the code I read (grep for match/paid/settle found only UI and pay-side files; **[U] confirm in `Scan.tsx`**).

PoC approach, no schema or contract change: `group.ts` offers `matchSplitGroup(found, {token, expectedNet, windowSec})`: given the scanner's found payments for one `(chain, token)`, find a subset of unassigned payments whose `net` sum is `>= expectedNet` and `<= expectedNet * (10000 + toleranceBps)/10000`, all with block time within `windowSec`. Subset-sum is bounded (n <= 16 candidates, k <= 8) so exact search is cheap. The UI proposes the group; the seller confirms and the local tag `invoiceLabel` is applied to all parts. Ambiguity (two valid subsets) is shown, never auto-resolved.

## 5. Package and directory ownership for the build

### 5.1 New (owned by this spec; nothing else writes here)

```
packages/amount-blur/
  package.json              name @ghostpay/amount-blur; mirror packages/secret-box/package.json scripts and devDeps
                            (build tsc -p tsconfig.build.json, test vitest run --coverage, lint eslint)
  tsconfig.json, tsconfig.build.json, vitest.config.ts   copy from packages/secret-box
  README.md, DEVIATIONS.md
  src/index.ts
  src/grid.ts, src/grid.test.ts
  src/split.ts, src/split.test.ts
  src/schedule.ts, src/schedule.test.ts
  src/fees.ts, src/fees.test.ts
  src/meter.ts, src/meter.test.ts
  src/group.ts, src/group.test.ts
  src/properties.test.ts    fast-check
  src/copy.ts               ABCopy constants
```

Dependencies: `@ghostpay/chain-adapters` (peer/workspace; imports `routerSplit`, `routerFee`, `grossForNet`, `FEE_SCHEDULE`, `MAX_ROUTER_GROSS`). No `@noble/*` of its own (CSPRNG is injected `Pick<Crypto,'getRandomValues'>`, same type as `RandomSource` in invoice-schema [R]). `bigint` throughout; no floats on amounts (floats only in `meter.ts` estimates).

Also new: `apps/web/e2e/amount-blur.spec.ts` is NOT planned (Playwright needs Chromium, not run by `npm test` [R]); use vitest + jsdom in the web edits below.

### 5.2 Edits to existing code (listed separately; each is small and reviewable)

| File | Edit | Reason |
|---|---|---|
| root `package.json` workspaces / `build:libs` order | add `packages/amount-blur` after `chain-adapters` | workspace resolves via `dist/` [R README] |
| `apps/web/package.json` | dependency on `@ghostpay/amount-blur` | consumer |
| `apps/web/src/lib/settings.ts` | add `blurMode`, `blurKMin/KMax`, `blurGapMinSec/MaxSec`, `blurRoundMaxBps`, `blurHorizonSec` with the same strict range parsing style as `checkDelayRange`; defaults Off | persistence, validation |
| `apps/web/src/views/Pay.tsx` | replace single checkbox block (~line 446-453) with the selector, plan table, per-part progress; reuse `DelayScheduler`/`randomDelayMs` | UI |
| `apps/web/src/lib/pay.ts`, `payExec.ts` | loop over `SplitPlan.parts`, one prepare/review/send per part, each with fresh stealth derivation | execution |
| `apps/web/src/views/CreateInvoice.tsx`, `lib/invoiceCreate.ts` | optional "round token amount to grid" using `snapUp` for `fixed_token` | AB-ROUND at creation |
| `apps/web/src/views/Scan.tsx`, `lib/scannerCore.ts` consumers | "Propose split group" action calling `matchSplitGroup`; apply `invoiceLabel` to all parts | seller aggregation |
| `docs/user/privacy-limits.md`, `docs/user/fees.md` | add the section-2 NOT-protected list and the fee table of 5.4 | honesty |

No edit to `packages/contracts`, `packages/core-crypto`, `packages/invoice-schema` schema, or `apps/relayer` is required for the PoC. Open question Q3 would edit the invoice schema; deferred.

### 5.3 Fee math and invoice effects (normative derivations)

Router: `fee(g) = floor(g * 25 / 10000)`, `net(g) = g - fee(g)`, dust `g < 400` pays 0 fee [R, FEE_SCHEDULE section 3; `routerFee` in `chain-adapters/src/fees.ts`].

- **Split never costs the seller or protocol more fee than a single payment.** Since `floor(a)+floor(b) <= floor(a+b)`, `sum fee(g_i) <= fee(sum g_i)`; so the seller's `sum net(g_i) >= net(sum g_i)`. The payer who splits a *fixed gross* receives rounding benefit of at most `k-1` base units to the seller. Equivalent: protocol fee revenue can drop by at most `k-1` base units per invoice from floor effects. Invariant R-FEE-1.
- **Invoice amount semantics.** Existing flow computes `gross` from the invoice and a payer-pays-fee policy via `grossForNet(net)` [R]. For a split, the planner works on **net**: target `netTotal >= invoiceNet`. Plan per part: choose `g_i`, compute `net_i = routerNet(g_i)`; accept iff `sum net_i >= invoiceNet`. Do NOT call `grossForNet(invoiceNet)` and split the result when the parts are pre-snapped; instead call `grossForNet(netTarget_i)` per part for non-snapped parts, then snap up, then recompute. Because `grossForNet` can overdeliver by 1 base unit per part [R, its remark], overdelivery is bounded by `k` base units; assert `sum net_i - invoiceNet <= k + snapSlack`.
- **minNet per part.** Each router call carries `minNet_i = net_i` (exact), `deadline_i = due_i + deadlineMarginSec` (default 600 s, MUST be `<= invoice.expiresAt`). Metadata `net` is the per-part net [R]; the announcement shows k nets, not their sum.
- **Dust and fee bypass (5.4 risk).** Parts below 400 base units pay zero fee. `minPartBase` defaults to `max(400n, 10^(d-2))` so splitting cannot be used to dodge F-PAY; user-lowering is not offered in the UI. Paying direct to the stealth address also bypasses the fee [R, by design]; this spec adds no new bypass above that, provided the floor holds.
- **Gas.** Each part costs one router call (gas `G_part`). Total extra gas is `(k-1) * G_part` (G_part from `estimateGas`, not hard-coded). With `payERC20WithBuffer` (buffer is not fee-bearing [R]) the buffer is attached to **at most one** part (the largest) to avoid k distinct fingerprint values; buffer rounding remains `hygiene.md` HY-BUF.
- **Native token parts.** Same bps; each part's `call` to recipient and stealth must succeed [R]; a reverting fee recipient reverts all parts (known D5).
- **Permit.** ERC-2612 `permit` value must cover the part's gross; one permit per part (nonce increments) or a prior approve. PoC: use per-part permit signing at due time; never pre-sign (Feature 6 rule).
- **Rounded amounts.** `gross' = snapUp(gross)`; extra `gross' - gross` is split by the router as `fee/net` like any amount; the seller's extra net is `net(gross') - net(gross)` (displayed). The fiat equivalent shown on the invoice is unchanged; the UI states "overpay by X (Y %)".
- **Refunds.** There is no on-chain refund (router has no state). A rounded-up or split overpayment is a gift to the seller; document it. [R: no function sweeps stray funds.]

## 6. Interfaces

### 6.1 TypeScript (`@ghostpay/amount-blur`)

```ts
export type BlurMode = 'off' | 'delay' | 'round' | 'split' | 'denom';

export interface Grid { readonly stepsBase: readonly bigint[]; }          // ascending, all > 0
export function gridFor(decimals: number): Grid;                           // 1-2-5 series, see 4.2
export function snapUp(gross: bigint, grid: Grid, maxBps: number):
  { readonly value: bigint; readonly rounded: boolean; readonly reason?: 'ROUND_CAP' };

export interface PlanOptions {
  readonly mode: 'split' | 'denom';
  readonly decimals: number;
  readonly invoiceNet: bigint;           // seller must receive >= this (sum of part nets)
  readonly kMin: number; readonly kMax: number;            // 2 <= kMin <= kMax <= 8
  readonly minPartBase: bigint;          // >= 400n enforced
  readonly gapMinSec: number; readonly gapMaxSec: number;  // 0 <= min <= max
  readonly horizonSec: number;           // <= invoiceExpiresAt - now
  readonly roundMaxBps: number;          // 0..500
  readonly random: Pick<Crypto, 'getRandomValues'>;
}
export interface PlannedPart {
  readonly index: number; readonly gross: bigint; readonly fee: bigint; readonly net: bigint;
  readonly dueOffsetMs: number;          // from plan start, monotonic clock domain
}
export interface SplitPlan {
  readonly parts: readonly PlannedPart[];
  readonly grossTotal: bigint; readonly feeTotal: bigint; readonly netTotal: bigint;
  readonly overpayNet: bigint;           // netTotal - invoiceNet, >= 0
  readonly extraGasParts: number;        // k - 1
}
export function planSplit(o: PlanOptions): SplitPlan;      // throws AmountBlurError(code)
export type AmountBlurErrorCode =
  'INVALID_INPUT' | 'PART_BELOW_FLOOR' | 'HORIZON_TOO_SHORT' | 'CAP_EXCEEDED' | 'RANDOM_FAILED';

export interface CrowdEstimateInput {
  readonly eventsPerDay: number;         // user-supplied or measured (Q4); never defaulted silently
  readonly windowDays: number; readonly amountBuckets: number;
}
export function estimateCrowd(i: CrowdEstimateInput): { readonly A: number; readonly label: 'none' | 'tiny' | 'small' | 'larger' };
// A = eventsPerDay * windowDays / amountBuckets  (research 10.2, [U]); label none if A < 2, tiny < 10, small < 100.

export interface FoundPayment { readonly id: string; readonly token: string; readonly net: bigint; readonly blockTime: number; }
export interface GroupQuery { readonly token: string; readonly expectedNet: bigint; readonly toleranceBps: number; readonly windowSec: number; }
export function matchSplitGroup(found: readonly FoundPayment[], q: GroupQuery):
  { readonly candidates: readonly (readonly string[])[] };   // each candidate is a set of ids; empty = no match
```

All amounts `bigint`; functions pure and deterministic given `random`. Errors extend the package's own `AmountBlurError`; none include amounts beyond what the UI already shows.

### 6.2 On-chain ABIs used (unchanged) [R]

`payERC20(IERC20,address,uint256 gross,uint256 minNet,uint256 deadline,bytes,bytes)`, `payERC20WithPermit(...)`, `payNative(address,uint256,uint256,bytes,bytes) payable`, `payERC20WithBuffer(...)`; event `FeeCollected(address indexed token, uint256 amount)`; errors `SlippageExceeded`, `Expired`. No new ABI.

## 7. Requirements (numbered, testable)

Grid and rounding
- AB-R1 (MUST): `snapUp(g)` returns a grid value `>= g`; never lower. Property: for all `g` in `[1, 2^200]`, result `>= g` and `<= g*(10000+maxBps)/10000` or `rounded=false, reason='ROUND_CAP'`.
- AB-R2 (MUST): `gridFor(d)` is strictly ascending, all values positive, and contains `10^d` (one whole token) for `d` in `[0,36]`.
- AB-R3 (MUST): rounding is never applied silently to a signed invoice amount; payer path requires an explicit confirm event (UI test).
- AB-R4 (SHOULD): idempotent: `snapUp(snapUp(g)) == snapUp(g)`.

Split and denominations
- AB-S1 (MUST): for every plan, `sum(part.net) >= invoiceNet` and `sum(part.net) - invoiceNet <= k + snapSlack` where `snapSlack = sum of snap increments` (5.3).
- AB-S2 (MUST): every part `gross >= minPartBase >= 400n`; `fee_i == routerFee(gross_i)`, `net_i == gross_i - fee_i` exactly as `chain-adapters` computes; `fee + net == gross`.
- AB-S3 (MUST): `feeTotal <= routerFee(grossTotal)` (floor superadditivity) and `routerFee(grossTotal) - feeTotal <= k - 1`.
- AB-S4 (MUST): `2 <= k <= 8`, `kMin <= k <= kMax`; `HORIZON_TOO_SHORT` if the schedule cannot fit before `invoice.expiresAt - deadlineMarginSec`.
- AB-S5 (MUST): in `denom` mode every part except the single remainder-absorbing part is an element of `D(d)`; the remainder part is marked `isRemainder`.
- AB-S6 (MUST): part order and gaps come only from the injected CSPRNG with rejection sampling; a statistical test (chi-square, 100k samples, p > 0.001, seeded deterministic stream) shows no modulo bias for spans that do not divide 2^32.
- AB-S7 (MUST): each part uses a distinct stealth address and distinct ephemeral public key (test: derive k parts, assert pairwise distinct).
- AB-S8 (MUST): if one part fails (wallet reject, revert, expiry) the UI stops, shows paid parts and the unpaid remainder, and offers to resume or cancel; it never auto-retries a rejected part and never pays more than `grossTotal`.

Timing
- AB-T1 (MUST): delays use `DelayScheduler` semantics: monotonic due time, `visibilitychange` re-check, expiry check against wall clock [R].
- AB-T2 (MUST): while waiting, nothing is signed, queued or broadcast; at due time calldata is rebuilt and `assertPreviewMatchesCalldata` runs before the wallet prompt (spy test).
- AB-T3 (MUST): gaps `>= gapMinSec` and `<= gapMaxSec`; consecutive due times strictly increasing; first part's offset in `[0, gapMaxSec]`.
- AB-T4 (SHOULD): schedule persisted only in memory; closing the tab cancels remaining parts (copy `AB_TAB_OPEN` shown).

Fee and invoice
- AB-F1 (MUST): `deadline_i <= invoice.expiresAt` for every part; plan creation fails otherwise (`HORIZON_TOO_SHORT`).
- AB-F2 (MUST): the review screen shows per-part and total gross, fee, net, number of wallet prompts, estimated extra gas, and the overpay amount before the first prompt.
- AB-F3 (MUST): buffer, if used, is attached to exactly one part and is not added to any fee computation.
- AB-F4 (MUST): `minPartBase` cannot be set below 400n by settings parsing (value rejected with `UserFacingError`, same style as `checkDelayRange`).

Honesty
- AB-H1 (MUST): any non-Off mode shows `AB_NOT_ANONYMOUS` and the meter result; copy snapshot test.
- AB-H2 (MUST): UI strings and docs MUST NOT contain "anonymous", "untraceable", "hidden" or "private" as a property of blurred payments (negated phrases allowed); lint test over `copy.ts` and the new view strings.
- AB-H3 (MUST): `estimateCrowd` input `eventsPerDay` has no default; with no user-supplied or measured value the meter shows "unknown, assume none".
- AB-H4 (SHOULD): split mode warns `AB_FANOUT_LINKABLE` when `k > 1` and window `< 24 h`.

Seller grouping
- AB-G1 (MUST): `matchSplitGroup` returns only subsets with `expectedNet <= sum <= expectedNet*(10000+tol)/10000`, same token, spread `<= windowSec`; `n > 16` candidates -> truncated to the 16 most recent with a flag, never exponential time.
- AB-G2 (MUST): never auto-applies a label; multiple candidates are all returned.

Package hygiene
- AB-P1 (MUST): no network, filesystem, storage, `Date.now`, `Math.random` or timers inside `@ghostpay/amount-blur` (grep test over `src/*.ts` excluding tests).
- AB-P2 (MUST): coverage thresholds same as sibling packages (check `vitest.config.ts` of `secret-box`); lint and typecheck clean.

## 8. Test plan

| Layer | Content | Maps to |
|---|---|---|
| Unit | Boundaries: gross 399, 400, 401, 10^d, `MAX_ROUTER_GROSS`; d = 0, 2, 6, 18; snap at exact grid points | AB-R1..R4, AB-S2 |
| Property (fast-check) | Random `invoiceNet`, k: sum-net, fee superadditivity gap `<= k-1`, floor, order permutation preserves totals | AB-S1..S3 |
| Differential | Reuse `chain-adapters` router vectors (399/400 from `GhostPayRouter.t.sol` [R]); when anvil is present, compare `routerFee` per part with the deployed router via the existing `router.anvil.test.ts` pattern (skip without anvil; CI must set `REQUIRE_ANVIL=1` to count) | AB-S2 |
| Statistical | Deterministic seeded `getRandomValues` double, chi-square on gaps and shuffles | AB-S6, AB-T3 |
| Scheduler | Fake `SchedulerDeps` (as `jitter.test.ts` [R]) with k parts, expiry mid-plan, tab hidden | AB-T1, AB-T2, AB-S8, AB-F1 |
| UI (vitest + jsdom, mirrors `Pay.test.tsx`) | Mode selector, plan table, per-part prompt count, confirm-before-round, copy snapshots, forbidden-word lint | AB-R3, AB-F2, AB-H1/H2 |
| Seller | Found-payment fixtures: exact split, ambiguous, with unrelated payments, n=17 | AB-G1/G2 |
| Contract-level (anvil, optional) | Pay k parts on a local router; assert k `Announcement` events, k distinct stealth addresses, `sum FeeCollected.amount == feeTotal` | AB-S3, AB-S7 |
| Testnet manual (Sepolia, Base Sepolia, test tokens) | One 3-part split, one denom plan, one rounded invoice; record gas and blocks | PoC acceptance |
| Measurement | Script that reads public testnet `FeeCollected`/announcements and prints amount-bucket histogram and `estimateCrowd`; research gap D-13 | AB-H3, Q4 |

## 9. PoC acceptance criteria

1. `npm run build:libs && npm test` passes with the new package; AB-R*, AB-S*, AB-T*, AB-F*, AB-H*, AB-G*, AB-P* tests all present and green.
2. On Sepolia or Base Sepolia (after another contributor deploys a manifest; no contract is deployed today [R]), a payer completes a 3-part split of a fixed-token invoice with random gaps, k wallet prompts, no pre-signed transactions; the seller's Scan view proposes the group and the label applies to all three.
3. The review screen displays gross, fee, net per part, total fee delta (`routerFee(total) - feeTotal`, 0 to k-1 base units), extra gas, and the not-anonymous text. Screenshot or recorded transcript attached to the PR.
4. A rounded invoice and a denomination plan demonstrated once each; overpay shown and confirmed.
5. The measurement script runs against the live testnet and its output is committed under the PR description (not as a repo doc), including the statement of the resulting `estimateCrowd.label`. Expected honest outcome is `none` or `tiny`; that is a pass, not a failure.
6. `docs/user/privacy-limits.md` updated with section 2's list.

## 10. Effort

M overall: package S-M (pure logic, many property tests), web integration M (multi-step payment state machine and k prompts), seller grouping S. Roughly 8-12 working days for one engineer; the state machine for partial failure (AB-S8) is the schedule risk.

## 11. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| False sense of privacy | Users believe blur anonymises | AB-H1/H2/H3, quantified meter, default Off, never in marketing copy |
| Fan-out fingerprint | Splits make the payer more recognisable | AB-H4 warning; denominations reduce but do not remove; document |
| Fee dodge via tiny parts | F-PAY revenue loss | `minPartBase >= 400n`, AB-F4; note direct pay already bypasses by design [R] |
| Partial completion | Seller receives less than invoiced; invoice never "complete" | AB-S8, seller group matching with tolerance, explicit unpaid-remainder UI |
| Browser tab closed or throttled | Schedule stalls | `visibilitychange` re-check [R], AB-T4 copy, expiry guard |
| Invoice expires mid-plan | Later parts revert `Expired` | AB-F1 deadline cap, plan-time horizon check |
| Seller matching ambiguity | Wrong group labelled | AB-G2 no auto-apply, show all candidates |
| Gas multiplication | k times router gas | Display `extraGasParts`, kMax 8, default k 2-5 |
| Rounded overpayment unrecoverable | Payer loses up to `roundMaxBps` | Cap default 1 %, explicit confirm, no refund path documented |
| Reliance on [S]/[U] research numbers | Wrong claims | Section 13 lists what must be re-fetched; copy uses no numbers from them |
| Non-Final standard drift | Not applicable: no new standard used | n/a |

## 12. Open questions

- Q1. Default `roundMaxBps` (1 % proposed) and grid choice: owner/UX decision; the 1-2-5 series is a proposal, not a standard.
- Q2. Should the seller's invoice optionally declare "split accepted, tolerance X bps, window Y" so the payer app can refuse unsupported splits? Needs an `invoice-schema` change (strict parser rejects unknown fields [R]); deferred, PoC uses local tolerance.
- Q3. Does `apps/web/src/views/Scan.tsx` already match payments to invoices anywhere (4.5 marks this [U])? Check before building `group.ts` UI.
- Q4. What event rate is actually observed on the target testnets? Needed for any honest `estimateCrowd`; research gap D-13.
- Q5. Interaction with the Feature 6 default (120-900 s) when k parts each use the same range: total horizon up to `k * 900 s`; confirm the 3600 s default horizon.
- Q6. Should sweeps of split parts be forced to different times and destinations (ties to `hygiene.md` HY-CON and PO-COR-7 sweep-window default, Q5 there)? Proposed yes; owner confirms.
- Q7. Legal: deferred by the owner; noted once above.

## 13. Sources

Read in repo (retrieved from the working tree 2026-10-21): `README.md`; `docs/CONTRACTS_SPEC.md` sections 1, 3; `docs/FEE_SCHEDULE.md` sections 2-3; `docs/remote/anonymization-research.md` sections 4.2, 4.3, 4.4, 10.1, 10.2; `docs/remote/onion-i2p-research.md` section 2.6 summary (timing lines); `docs/remote/modules-needed.md`; `docs/remote/security-specs/privacy-ops.md` (PA-ADV3, PO-COR-7, Q5); `docs/remote/privacy-specs/hygiene.md`; `packages/chain-adapters/src/fees.ts`; `packages/invoice-schema/src/schema.ts`; `apps/web/src/lib/jitter.ts`, `settings.ts`, `views/Pay.tsx`.

External, NOT re-fetched in this session (proxy 403 on 2026-10-21; carried from the repo research, tagged [S]/[U]; re-verify before citing):
- Kovacs, Seres, "Anonymity Analysis of the Umbra Stealth Address Scheme on Ethereum", arXiv 2308.01703 (https://arxiv.org/abs/2308.01703).
- Wang et al., "On How Zero-Knowledge Proof Blockchain Mixers Improve, and Worsen User Privacy", WWW '23, doi:10.1145/3543507.3583217; arXiv 2201.09035 (https://arxiv.org/abs/2201.09035).
- ERC-5564 Security Considerations, status Final (https://eips.ethereum.org/EIPS/eip-5564): funding rule; used only via hygiene.md.
