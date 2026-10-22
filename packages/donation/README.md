# @ghostpay/donation

Optional, itemised, user-changeable developer donation. Spec: [`docs/remote/usability/specs/dev-donation.md`](../../docs/remote/usability/specs/dev-donation.md). Wiring: [`docs/remote/usability/wiring/dev-donation.md`](../../docs/remote/usability/wiring/dev-donation.md).

- Rate: `DEFAULT_DONATION_PPM = 965` (ASSUMPTION: "0.0965" read as 0.0965%), `MAX_DONATION_PPM = 50_000` (5%, owner decision); `validatePpm`, `parsePercentInput`, `formatPercent`.
- `computeDonation`: bigint floor, dust floor, never above gross.
- `resolveDonation`: recipient only from config `donationRecipient`; unset or invalid means unavailable (no row, nothing sent).
- `buildDonationLines`: review row as text keys, separate from the router fee and net.
- `buildDonationCall`, `buildSendCallsBatch` (EIP-5792, donation last, non-atomic), `supportsSendCalls`.
- `donationKey`, `beginAttempt`, `reduceAttempt`, `canSendDonation`: idempotent post-payment state machine.

Runtime dependency: `viem` only. **Not wired in**: no app imports this package, and `donationRecipient` is not yet in any manifest schema. Nothing here has run against a wallet or network.

```bash
npm run typecheck && npm run lint && npm test   # from this directory
```
