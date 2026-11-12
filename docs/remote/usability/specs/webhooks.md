# Spec: self-hosted order webhooks (@ghostpay/merchant-hooks)
## Requirements
- R1 Header `GhostPay-Signature: t=<unix>,n=<nonce hex 16..64>,v1=<hex HMAC-SHA256(secret, "t.n.body")>`. Secret >= 32 bytes else throw.
- R2 Verify: parse strictly (exactly t,n,v1; no dupes) -> |now-t| <= tolerance (default 300s) -> constant-time HMAC compare -> nonce replay check; nonce recorded ONLY after a valid signature.
- R3 Reasons are coarse enum (`malformed`,`stale`,`bad-signature`,`replay`); no oracle detail.
- R4 Replay store interface; in-memory impl with expiry pruning and hard size cap (fail closed when full).
- R5 Retry schedule pure fn: delay = min(base*factor^(attempt-1), max), jitter 50..100% via injected permille; null after maxAttempts. Defaults 30s,x2,3600s,8 attempts.
- R6 Idempotency: event id is the key; bounded. Guard `begin(id)` returns `claimed` (handle the event, then `complete(id)`; after a failure `release(id)` so a redelivery can retry), `processing` (an earlier delivery is still handling it: answer a retryable `503 {ok:false,retry:true}`, never a 2xx, because that attempt may still fail) or `done` (acknowledge as a duplicate, 200). `release()` frees only an in-flight id; a done id stays done. When full it evicts the oldest done id, never an in-flight one, and answers `processing` while every entry is in flight (fail closed).
- R7 Event schema strict: id, type in {invoice.paid, invoice.partial, invoice.over, invoice.expired}, createdAt, data {invoiceId, currency, amountMinor(string int), paymentId?}. Unknown keys rejected. The meaning of `amountMinor` is defined in R8.
- R8 Meaning of `data.amountMinor` (normative; the JSON schema, the OpenAPI document and the `@ghostpay/merchant-hooks` doc comments refer here):
  - Value: the **cumulative** amount received so far for the invoice `data.invoiceId`, as of the event. It is never the amount of a single payment, and a sender must not mix the two readings.
  - Unit: a non-negative integer, as a decimal string without sign or leading zeros (`0` or `[1-9][0-9]{0,29}`), in minor units of the invoice currency `data.currency` (the currency's ISO 4217 minor-unit exponent: `1250` with `USD` is 12.50 USD). It is not in token base units and not in wei.
  - Per event type (all four carry it; each is a running total, not a delta):
    - `invoice.partial`: total received so far; below the amount due.
    - `invoice.paid`: total received; equal to the amount due.
    - `invoice.over`: total received; above the amount due (the excess is `amountMinor - due`).
    - `invoice.expired`: total received before the invoice expired (`0` when nothing arrived).
  - Successive events for one invoice never report a smaller `amountMinor`. `paymentId`, when present, names the payment that triggered the event; it does not change the meaning of `amountMinor`.
  - Consumers that need per-payment amounts (for example the POS reducer `posReduce`, whose own `payment` events add up) compute the delta themselves: `delta = amountMinor - previously recorded total`, and ignore a non-positive delta.
  - A webhook is a notification, never payment proof. The HMAC only shows the merchant's own sender produced the body; it says nothing about the chain. Before shipping goods or marking an order paid, confirm the payment with the canonical on-chain verifier (`@ghostpay/chain-adapters` payment verification).
## Acceptance tests
roundtrip; tampered body; wrong secret; stale/future ts; replayed nonce; invalid-sig does not poison nonce store; malformed headers (dupes, missing, uppercase hex, short nonce); short secret; retry vectors; jitter bounds; idempotency; event schema negatives; store full fails closed.
