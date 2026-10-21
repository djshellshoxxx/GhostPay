# Spec: `@ghostpay/donation` (optional, itemised developer donation)

Status: **implemented as library, not wired in** (2026-10-21). Package: `packages/donation`. Wiring: `docs/remote/usability/wiring/dev-donation.md`.

## 1. Purpose

Let a payer, on the pay-review screen, add an optional donation to the developer. It is default ON, always shown as its own line, changeable to 0 or any value up to a cap, and never merged into the router fee (0.25%) or the payment net. It is sent as a separate transfer after the main payment. No contract change.

## 2. Interface

```ts
const DEFAULT_DONATION_PPM = 965;   // ASSUMPTION: owner wrote "0.0965" -> read as 0.0965% = 965 ppm = 0.000965
const MAX_DONATION_PPM = 50_000;    // 5%; owner decision (fat-finger cap)

validatePpm(x): { ok: true; ppm } | { ok: false; reason }          // integer 0..MAX
parsePercentInput(s: string): same                                    // '0.0965' -> 965
formatPercent(ppm): string                                            // 965 -> '0.0965'
computeDonation({ gross: bigint; decimals; ppm; minUnits? }): { amount; ppm; belowDust }
resolveDonation(settings, config): { status: 'active'|'disabled'|'unavailable', ... }
buildDonationLines(plan): DonationLine | null                         // text KEYS only
buildDonationCall({ chainId, token: Address|'native', recipient, amount }): { ok, call } | { ok: false, reason }
buildSendCallsBatch(chainId, mainCalls, donationCall?): EIP-5792 params
supportsSendCalls(capabilities, chainId): boolean
donationKey(paymentTxHash, recipient, token, amount): Hex
beginAttempt / reduceAttempt / canSendDonation: pure state machine
```

Settings: `{ enabled: boolean; ppm: number }`, default `{ enabled: true, ppm: DEFAULT_DONATION_PPM }`. The recipient is NOT a setting: it comes only from the optional config/manifest field `donationRecipient`.

## 3. Rules

1. Amount = `floor(gross * ppm / 1_000_000)` in bigint; never floats; never above `gross`; correct for uint256 `gross`.
2. Dust: if `ppm > 0` and the amount is below `minUnits` (default `10^(decimals-2)`, i.e. 0.01 token; `1` if decimals < 2) the donation is 0 and `belowDust = true`; nothing is sent.
3. `ppm` must be a safe integer in `0..MAX_DONATION_PPM`. 0 means "no donation" (no line sent, no call built).
4. Percent input grammar: `^\d{1,3}(\.\d{1,4})?$`, max 16 chars. Rejected: empty, sign, exponent, spaces, `NaN`, hex, more than 4 decimals (sub-ppm precision), values above the cap.
5. Recipient: strict `0x` + 40 hex; mixed case must pass EIP-55; all-lower or all-upper accepted; zero address rejected. Unset or invalid => `unavailable`: no line, no call, payment unaffected. No address is hardcoded in the package.
6. View model has its own line (`donation.line.title`), never merged into fee or net; it carries `donation.warning.publicLink` and `donation.notBundledWithRouterFee`.
7. Calls: ERC-20 `transfer(recipient, amount)` to the token, `value 0`; native: `to = recipient`, `data 0x`, `value = amount`. Amount 0, bad token, bad recipient => refusal reason, no call.
8. Batch (EIP-5792 `wallet_sendCalls`, version `2.0.0`, `atomicRequired: false`): main calls first, donation LAST. Non-atomic request so a failing donation does not have to revert the payment. Residual: a wallet may still execute an atomic batch when it can (the flag only says atomicity is not required); apps that need the guarantee must use the sequential path (rule 9).
9. Ordering: preferred path is sequential: send the main payment, wait for confirmation, then send the donation. The donation never marks the payment failed and never triggers a payment retry.
10. Idempotency: `donationKey = keccak256(abi.encode("ghostpay.donation.v1", paymentTxHash, recipient, token|0x0, amount))`. `beginAttempt` returns the existing attempt for a key; only a `pending` attempt may be sent; `sent` and `skipped` are terminal; `failed` -> `pending` needs an explicit retry event.
11. BTC (documented only, not built): the donation would be an extra output in the sender's own transaction. Implications: output must exceed dust (about 546 sats for P2PKH, 294 for P2WPKH) so the rate floor is higher; adds about 31-43 vbytes of fee; it links payer inputs to the developer address on-chain; no separate confirmation ordering exists (same tx), so "pay after confirmation" does not apply and the user must see it as a separate output line.

## 4. Threat and privacy model

| Threat | Control | Residual |
|---|---|---|
| Donation is a public on-chain link payer -> developer address | Warning key on the line; user can set 0; default amount is small | Link exists whenever the user donates; stealth-address donation is future work |
| Fat-finger rate | Cap 5%; strict parser; itemised amount shown before signing | Cap value is an owner decision |
| Hidden skimming (donation folded into fee or net) | Separate line and separate transfer; builders refuse amount 0; tx-review should decode it | A compromised bundle could lie (same as tx-review D7) |
| Malicious or mistyped recipient in config | Strict validation, EIP-55, zero rejected; unavailable otherwise | Manifest must be authentic |
| Double send on retry | Deterministic idempotency key and terminal states | Key store must persist (wiring); a `failed` whose broadcast status is unknown can still duplicate: only mark `failed` when definitely not broadcast |
| Donation failure breaks payment | Separate, after-confirmation, non-atomic | Wallet-chosen atomic execution (rule 8) |
| Rounding or overflow | bigint floor, property tests | None known |

## 5. Test plan

Floor rounding and dust boundary; uint256 max gross; ppm 0, MAX, MAX+1; percent table (`0.0965` -> 965, `0`, `5`, `5.0001` rejected, `1e-4` rejected, negatives, long strings); fast-check: amount <= gross, monotonic in gross, ppm 0 => 0; recipient validation (fake `0x000000000000000000000000000000000000d0d0` ok, bad checksum, zero, unset => unavailable and no calls); calldata decodes back with `decodeFunctionData`; batch ordering; idempotency key stability and sensitivity to each field; reducers incl. illegal transitions.

## 6. Acceptance criteria

- `tsc --noEmit`, eslint, `vitest run --coverage` pass at 95/90/95/95 (thresholds not lowered, no skipped tests).
- Only dependency: `viem` 2.57.7. No real address in source. No contract changes.
- Every claim of wiring is false until the web swarm lands it; README says "not wired in".

## 7. Sources and assumptions

- ASSUMPTION: "0.0965" = 0.0965% (965 ppm). Change `DEFAULT_DONATION_PPM` only if the owner meant otherwise (for example 0.0965 as a fraction = 96,500 ppm would exceed the 5% cap).
- ASSUMPTION: cap 5% and dust 0.01 token are owner decisions.
- EIP-5792 (`wallet_sendCalls`, `wallet_getCapabilities`, `atomicRequired`, version `2.0.0`), recalled from memory; not re-fetched in this session.
- EIP-55 checksum via `viem` `isAddress({ strict: true })`.
- Repository: `docs/remote/specs/tx-review.md` (review of the final bytes), `docs/remote/usability/specs/local-store.md` (persistence).
