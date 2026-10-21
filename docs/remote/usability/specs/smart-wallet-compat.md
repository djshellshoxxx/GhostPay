# Spec: smart-wallet-compat: Smart-contract wallet (Safe / 4337) payer compatibility
Impact 3/5 | Effort M | Score 1.5 | Build wave 0 | Depends on: none

> Build note (swarm 7): all three connect specs are implemented as pure logic in `packages/ux-connect` (`@ghostpay/ux-connect`), not in the separate package names the first draft listed. Anything touching a network, relay, USB/BLE or a real wallet is UNVERIFIED; see [audit-ux-connect.md](../audit-ux-connect.md) and [wiring/ux-connect.md](../wiring/ux-connect.md).

## Problem
Payer flows assume an EOA. ERC-2612 permit verification in this app is ecrecover based (DEVIATIONS item 13 verifies recovery to the payer), which a contract wallet cannot produce. Multisigs also confirm asynchronously, so a receipt poll can take days and a fixed timeout would show a false failure. Some wallets return an off-chain proposal id (Safe `safeTxHash`, 4337 `userOpHash`) that is not a transaction hash.

## Exists today (verified in repo) vs missing
- apps/web/src/lib/payExec.ts ensureAllowance + permit path.
- apps/web/src/lib/wallet.ts:263-295 pollReceipt (finite timeout).
- Missing: account classification, path choice, no-timeout poll policy, proposal-id handling (now in `packages/ux-connect/src/compat.ts`; not yet wired).

## Design
Pure helpers, all chain data injected by the caller (the app obtains `eth_getCode` from the user's RPC and passes the string):
- `classifyAccount(code)` -> `eoa | contract | delegated-eoa | invalid`. `"0x"` and `"0x0"` are EOA. `0xef0100`+20 bytes (EIP-7702 delegation) is `delegated-eoa` (can still ecrecover, flagged). Non-hex or odd-length input is `invalid`, never EOA. `"0x00"` is a real (STOP) contract.
- `isContractAccount(code)`, `choosePath({isContract, tokenPermit, native?})` -> `permit | approve | direct`.
- `pollPolicy(isContract, eoaTimeoutMs=180000)` -> `{timeoutMs: null|n, intervalMs, label, cancellable: true}`.
- `evaluateWait(policy, elapsedMs, obs)` -> `waiting | awaiting-signers | confirmed | reverted | stopped | dropped | timed-out`.
- `parsePendingRef(kind, hash)` / `isVerifiable(ref)`: only `txHash` can go to the existing submission verification; `safeTxHash` / `userOpHash` must be resolved to a tx hash first.
- Compatibility matrix: `validateMatrix(json)` (strict schema, unique ids/rdns), `lookupProfile(matrix, rdns)` (exact rdns, case-insensitive; no fuzzy name match), `assessAccount({code, rdns, matrix, token})` -> `{accountKind, path, poll, profile, canBatch, warnings}`. Flags are tri-state (`true | false | 'unknown'`); `unknown` counts as `false`. On-chain code wins over the profile; a conflict adds `profile-kind-mismatch`. Invalid code selects the safe `approve` path with no timeout.
- Flags per profile: `eip1271`, `eip4337`, `eip5792` (batch), `typedDataV4`, `asyncConfirmation`.

## Privacy and security impact
`eth_getCode` on the payer address goes to the user's RPC (the payer address is already revealed there by the wallet flow); noted in disclosure. The matrix is static data shipped with the app, no lookups. Nothing here weakens chain/submission verification.

## Requirements
1. **SMART-1** MUST Contract wallets never take the permit path (also when code is invalid).
2. **SMART-2** MUST Polling for contract wallets has no hard failure timeout; the user can stop waiting (stopping does not cancel the on-chain proposal).
3. **SMART-3** MUST Chain/submission verification unchanged; a proposal id is never treated as proof of payment.
4. **SMART-4** MUST `"0x"` and `"0x0"` code treated as EOA; malformed code is never EOA.
5. **SMART-5** SHOULD Explain approval + pay are two transactions (`two-transactions` warning); offer batching only when the wallet flag `eip5792` is true.
6. **SMART-6** MUST A permit is chosen only when the token supports it AND the profile (if known) has `typedDataV4 === true`.
7. **SMART-7** MUST Matrix input is validated strictly (reject duplicates, unknown kinds, non-tri flags).

## Acceptance tests (implemented in `src/compat.test.ts`, `src/hex.test.ts`)
1. **T-1** isContractAccount("0x")==false, ("0x0")==false, ("0x6080..")==true, ("0x00")==true.
2. **T-2** choosePath({isContract:true,tokenPermit:true})=="approve"; property: contract never yields permit.
3. **T-3** pollPolicy(true).timeoutMs===null; evaluateWait for 3 days elapsed stays awaiting-signers; EOA times out at the limit.
4. **T-4** malformed code -> `invalid`, path approve, no timeout.
5. **T-5** delegated-eoa flagged, not contract.
6. **T-6** only txHash isVerifiable; 31-byte hash rejected.
7. **T-7** assessAccount: Safe row -> approve + canBatch; EOA with typedDataV4 unknown -> approve + no-typed-data; profile/code mismatch flagged.
8. **T-8** validateMatrix rejects 9 malformed shapes.
Plus package gates: typecheck, lint, vitest coverage thresholds 95/90/95/95. UNVERIFIED: any real Safe / 4337 / 7702 wallet behaviour (see audit).
