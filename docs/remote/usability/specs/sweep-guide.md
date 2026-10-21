# Spec: sweep-guide: Guided sweep with fee preview
Impact 5/5 | Effort M | Score 2.5 | Build wave 0 | Depends on: none

## Problem
Sweep screen is one long form: free-text destination, no direct-sweep gas estimate, no comparison of relayer vs direct, no confirmation tracking beyond a hash (Sweep.tsx:253,270-290).

## Exists today (verified in repo) vs missing
- apps/web/src/views/Sweep.tsx:204-231 quote and sweep handlers; 270-276 relayer fee display; 285-290 hash only.
- apps/web/src/lib/sweep.ts:54,171 balance/gas reads.
- docs/remote/privacy-specs/hygiene.md HY-DST/HY-CON/HY-BUF (fresh destination, no consolidation, rounding).
- docs/remote/specs/address-safety.md, tx-review.md.
- Missing: everything described under Design.

## Design
Step model: 1 balance & asset check -> 2 destination (derived fresh destination preferred per hygiene HY-DST; manual entry flagged "links your wallets") -> 3 method comparison table: relayer {fee, net, needs permit, relayer sees X} vs direct {est. gas, needs native coin at one-time address, net} computed with bigint, with the cheapest and the most private marked separately -> 4 review (reuse tx-review decoder when available) -> 5 submit -> 6 track (poll receipt via wallet.pollReceipt-style; show included/final per chain finalityDepth). Dust guard: net <= 0 or fee > 30 % of balance blocks with explanation.

## Privacy and security impact
Comparison text states exactly what each path reveals. No auto-selection of destination; no batching of several one-time addresses (hygiene HY-CON). Estimates come only from the user's RPC and the chosen relayer.

## Build ownership
- NEW package: `packages/sweep-guide` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/sweep-guide`.
- Public API (exports from `src/index.ts`):
- `compare(inputs: {balance; decimals; relayerQuote?; gasEstimate?; maxFeePerGas?}): MethodComparison`
- `dustVerdict(balance, fee): "ok"|"warn"|"block"`
- `stepFor(state): StepId`
- `netAfterFee(balance, fee): bigint`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Sweep.tsx (restructure into steps, reuse existing handlers)
- apps/web/src/lib/sweep.ts (expose gas estimate; read-only)
- Add `@ghostpay/sweep-guide` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **SWEEP-1** MUST Both methods shown whenever both are possible, with exact net amounts as bigint-derived strings.
2. **SWEEP-2** MUST Block when net<=0 or fee exceeds the 3 % relayer cap (existing client check) or 30 % dust threshold.
3. **SWEEP-3** MUST Destination equal to the one-time address is rejected (reuse checkDestination).
4. **SWEEP-4** MUST No step changes signing/broadcast logic; guide only orders and explains.
5. **SWEEP-5** MUST Finality shown from chain finalityDepth, not hard-coded.
6. **SWEEP-6** SHOULD Persist sweep state (ledger) after confirmation.
7. **SWEEP-7** SHOULD Explain gas funding privacy (link to hygiene wording).

## Acceptance tests
1. **T-1** Balance 1000 units, relayer fee 40 -> net 960, ratio 4 % -> warn.
2. **T-2** Fee > balance -> block, no submit button enabled.
3. **T-3** compare() with only relayer quote returns direct as "unavailable: no native coin".
4. **T-4** Step order test through a mocked happy path.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
