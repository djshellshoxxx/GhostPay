# Spec: POS / QR terminal mode (@ghostpay/merchant-hooks)
## Requirements
- R1 `buildQrPayload(link)`: validated link string (https, fragment `#gpi=v1.`), UTF-8 byte length <= 2953 (QR v40-L byte mode) else throw; returns `{payload, bytes}`. Rendering is done by the app (apps/web already pins qrcode-generator 2.0.4); this package has no QR lib.
- R2 POS session reducer, pure: states idle -> awaiting -> paid | expired | cancelled. TTL 30..900s. Partial payments accumulate (bigint); paid when sum >= due. Wrong invoiceId events rejected. Terminal states absorb all events (`accepted:false`). `tick` expires at now >= expiresAt. Session id from injected random.
## Acceptance tests
each transition; TTL bounds; partial then full; overpay counts paid; wrong invoice; late event after expiry; terminal absorb; payload size limit; non-https; bigint amounts.

A session requires a nonblank session ID, invoice ID and currency. The start time
and computed deadline must be nonnegative safe integers in Unix seconds. A due
amount is a positive bigint. Each matching payment contributes one positive
bigint delta. A different invoice or currency and a nonpositive delta are ignored.
A malformed amount on a matching, unexpired payment raises `bad-amount`.

Payment observations and ticks require a valid clock and stored deadline. At the
deadline a payment returns `accepted: false` with an expired state and unchanged
total. Callers must use the returned state even for that rejected payment.
Cancellation does not need a clock and omits a corrupt deadline while preserving
the partial total. A corrupt awaiting balance cannot be carried into a new state.
After a terminal result the caller starts a separate sale from `INITIAL_POS_STATE`.
