# Wiring: developer donation (`@ghostpay/donation`)

For the UI/web integration swarm. The package is a library and is **not wired in**. Do not edit contracts.

## 1. Settings page
- Toggle `enabled` (default ON) and a rate field (percent text, parse with `parsePercentInput`, show errors by `reason`; display with `formatPercent`). A "set to 0" button maps to `ppm = 0`.
- Persist locally as `{ enabled, ppm }` in the encrypted local store (`docs/remote/usability/specs/local-store.md`), a `settings` record; validate with `validatePpm` on load and fall back to the defaults if invalid. Localisation of the number format is display-only; always parse the canonical `.` form.

## 2. Manifest/config field `donationRecipient` (LATER task, not now)
Optional address in the deployments schema/config (the authenticated manifest, same trust path as router/announcer addresses). A later task must add it to the schema and loader; until then `resolveDonation` returns `unavailable` and no donation line appears. Never hardcode an address in `apps/web`.

## 3. Pay-review line
Call `buildDonationLines({ settings, config, gross, decimals, token, symbol })`. Render nothing for `null`. Render the donation as its own row, visually separate from the 0.25% router fee and the net; show the amount, percent, the toggle, the editable rate and the "zero it" action; show both warning keys near the row. The row's amount must also be included in the tx-review expected intent for the donation transfer.

## 4. Calling order
1. Build and review the main payment (existing flow).
2. Preferred, sequential: send the main payment; wait for confirmation; then `beginAttempt(existing, { paymentTxHash, ... key: donationKey(...) })`; if `canSendDonation`, build with `buildDonationCall`, review, send; `reduceAttempt` with `sent`/`failed`/`skipped`. Persist attempts (local store) keyed by `donationKey`.
3. Optional batch: if `supportsSendCalls(caps, chainId)`, `buildSendCallsBatch(chainId, mainCalls, donationCall)` for one prompt. Donation is last and `atomicRequired: false`; a wallet may still run it atomically, so the sequential path is the one with the "donation cannot revert payment" guarantee.
4. Donation failure shows a quiet note only; never retry or fail the main payment.

## 5. E2E test ideas
Default ON shows the line with 0.0965%; set 0 removes the transfer; set 5.0001 shows an error; no `donationRecipient` shows no line; reload keeps the rate; donation sent once after reload mid-flow (idempotency); rejecting the donation prompt leaves the payment confirmed; wallet without `wallet_sendCalls` uses the sequential path; tiny payment below dust shows 0 and sends nothing.

## 6. Accessibility and i18n keys
Keys (copy owned by the i18n catalog): `donation.line.title` ("Developer donation"), `donation.line.amount`, `donation.line.rate`, `donation.toggle.label`, `donation.rate.label`, `donation.rate.error.*` (one per reason), `donation.action.zero`, `donation.warning.publicLink`, `donation.notBundledWithRouterFee`, `donation.belowDust`, `donation.status.pending|sent|failed|skipped`. The toggle needs an accessible name and state; the rate error uses `aria-describedby`; amounts are announced with the token symbol; the warning is text, not colour only.
