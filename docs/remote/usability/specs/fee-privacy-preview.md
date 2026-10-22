# Spec: fee-privacy-preview (ux-fees)

Module: `packages/ux-fees/src/preview.ts`, `buildFeePrivacyPreview`, `DEFAULT_FEE_SCHEDULE`.

## Requirements
1. Shown before **every** payment (FEE_SCHEDULE principle 1). Output is a view-model: `lines`, `payerTotals`, `gross`, `recipientReceives`, `ghostPayFeeNow`, `disclosure`, `privacyNotes`, `warnings`, `canProceed`.
2. **Fee math identical to the router**: `fee = floor(gross * bps / 10_000)`, `net = gross - fee`; `gross < 400` at 25 bps pays 0. `net` mode finds the minimal gross with `gross - fee >= net` (may deliver 1 extra unit; info warning).
3. Lines: `F-PAY` (router, enforced), `NETWORK`, `BUFFER` (pass-through, no fee), `F-SECURE` (opt-in flat), `F-SPONSOR` (later, from swept funds; `max(gas*110/100, 50 bps)` capped at 300 bps; shows the cap). Each line: exact bigint, plain-decimal `display`, bearer, `goesToGhostPay`, notes.
4. **Never invent a zero fee**: `direct` route or `not_enforceable` checkout -> no F-PAY line; a disclosure key states why.
5. **Fail closed** (`canProceed = false`): amount 0, checkout `not_deployed`, fee recipient missing/malformed/zero, fee recipient not from a signed manifest, asset id reused with different decimals.
6. Warnings: schedule differs from default, > 100 bps, network fee > 10 % of amount, buffer on direct route (ignored), no stealth, dust no-fee.
7. Privacy notes: stealth hides/does not hide recipient, amount public, router event public, fee recipient public by design, buffer visible, sponsored relayer sees sweep vs self-funded gas link, jitter off.
8. Totals per asset id; symbols validated `[A-Za-z0-9.$_-]{1,12}` (untrusted token metadata).
9. Disclosure copy key `fees.preview.disclosure.router` carries `pct` ("0.25") and shortened recipient; UI shows the full address from the manifest.

## Acceptance tests (`preview.test.ts`)
100 USDC -> fee 250_000, receives 99_750_000; 399/400 vectors; totals with ETH buffer/gas and 3 USDC flat fee (103 USDC, 0.0046 ETH); native total merge; sponsored fee 500_000 / capped 3_000_000 / gas-dominated 1_100_000; net mode 99_750_000 -> gross 99_999_999 (fee 249_999); fast-check minimal-gross and `fee + net == gross`; direct/not_enforceable/not_deployed; 6 bad recipients; zero-bps schedule; high schedules; weak privacy profile; asset collision; 24 structural throws; text drift guard against docs/FEE_SCHEDULE.md and chain-adapters/src/fees.ts.
