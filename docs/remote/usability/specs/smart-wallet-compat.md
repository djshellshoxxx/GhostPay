# Spec: smart-wallet-compat: Smart-contract wallet (Safe) payer compatibility
Impact 3/5 | Effort M | Score 1.5 | Build wave 0 | Depends on: none

## Problem
Payer flows assume an EOA: ERC-2612 permit uses ecrecover signatures (docs/DEPLOYMENT notes; DEVIATIONS item 13 verifies recovery to the payer) which contract wallets cannot produce; multisigs also confirm asynchronously so a receipt poll may take days.

## Exists today (verified in repo) vs missing
- apps/web/src/lib/payExec.ts ensureAllowance + permit path.
- apps/web/src/lib/wallet.ts:263-295 pollReceipt (finite timeout).
- Missing: everything described under Design.

## Design
Detect contract-wallet accounts (eth_getCode on the connected account via user RPC) and switch to the approve + pay path (no permit), extend polling to "pending approval" state with no timeout error, show Safe-specific guidance (needs other signers). Pure decision helpers in the package; wallet session code only calls them.

## Privacy and security impact
eth_getCode on payer address goes to the user RPC (payer address already revealed there by wallet flow); noted in disclosure.

## Build ownership
- NEW package: `packages/wallet-compat` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/wallet-compat`.
- Public API (exports from `src/index.ts`):
- `isContractAccount(code: string): boolean`
- `choosePath(info: {isContract; tokenPermit: boolean}): "permit"|"approve"|"direct"`
- `pollPolicy(isContract): {timeoutMs: number|null; label: string}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/lib/payExec.ts (use choosePath)
- apps/web/src/views/Pay.tsx (pending-signers message)
- Add `@ghostpay/wallet-compat` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **SMART-1** MUST Contract wallets never take the permit path.
2. **SMART-2** MUST Polling for contract wallets has no hard failure timeout; user can cancel waiting.
3. **SMART-3** MUST Chain/submission verification unchanged.
4. **SMART-4** MUST "0x" and "0x0" code treated as EOA.
5. **SMART-5** SHOULD Explain approval + pay are two transactions.

## Acceptance tests
1. **T-1** isContractAccount("0x")==false, ("0x6080..")==true.
2. **T-2** choosePath({isContract:true,tokenPermit:true})=="approve".
3. **T-3** pollPolicy(true).timeoutMs===null.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
