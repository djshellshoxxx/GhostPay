# Spec: policy-undo: Cancel / undo UI for policy-account withdrawals
Impact 2/5 | Effort L | Score 0.5 | Build wave 1 | Depends on: sweep-guide

## Problem
Policy accounts allow a delayed withdrawal that the owner can cancel, but there is no client; the README says do not use them.

## Exists today (verified in repo) vs missing
- packages/contracts/src/PolicyAccount.sol:17-19,48-58 delay, MAX_DELAY, CancelWithdraw EIP-712.
- packages/policy-scheme (scheme 0x47500002 helpers).
- README: policy accounts contracts only, no client support, no recovery path.
- Missing: everything described under Design.

## Design
Library for building/decoding Withdraw and CancelWithdraw typed data, computing the cancel window (delay, 2*delay) and listing pending withdrawals from logs; UI shows a countdown and a Cancel button producing the EIP-712 cancel signature. Build only after the contracts are audited and a deployment manifest exists.

## Privacy and security impact
Pending-withdrawal reads go to the user RPC; no new data. Cancel is a public transaction.

## Build ownership
- NEW package: `packages/policy-ui-kit` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/policy-ui-kit`.
- Public API (exports from `src/index.ts`):
- `cancelWindow(w: Pending, delaySec): {opensAt; closesAt}`
- `buildCancelTypedData(id, chain): TypedData`
- `pendingFromLogs(logs): Pending[]`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Sweep.tsx or new Policy view
- Add `@ghostpay/policy-ui-kit` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **POLIC-1** MUST Typed data matches CANCEL_WITHDRAW_TYPEHASH in the contract (fixture test against forge output).
2. **POLIC-2** MUST Never offered unless a manifest lists the factory.
3. **POLIC-3** MUST Countdown uses block timestamps, not the local clock.
4. **POLIC-4** SHOULD Explain that cancelling needs the same key.

## Acceptance tests
1. **T-1** Typed-data hash equals Solidity-computed fixture.
2. **T-2** cancelWindow edge: exactly at closesAt -> closed.
3. **T-3** Feature hidden with no manifest entry.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
