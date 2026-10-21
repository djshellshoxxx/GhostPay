# Spec: self-hosted order webhooks (@ghostpay/merchant-hooks)
## Requirements
- R1 Header `GhostPay-Signature: t=<unix>,n=<nonce hex 16..64>,v1=<hex HMAC-SHA256(secret, "t.n.body")>`. Secret >= 32 bytes else throw.
- R2 Verify: parse strictly (exactly t,n,v1; no dupes) -> |now-t| <= tolerance (default 300s) -> constant-time HMAC compare -> nonce replay check; nonce recorded ONLY after a valid signature.
- R3 Reasons are coarse enum (`malformed`,`stale`,`bad-signature`,`replay`); no oracle detail.
- R4 Replay store interface; in-memory impl with expiry pruning and hard size cap (fail closed when full).
- R5 Retry schedule pure fn: delay = min(base*factor^(attempt-1), max), jitter 50..100% via injected permille; null after maxAttempts. Defaults 30s,x2,3600s,8 attempts.
- R6 Idempotency: event id is the key; guard `claim(id)` true once; bounded.
- R7 Event schema strict: id, type in {invoice.paid, invoice.partial, invoice.over, invoice.expired}, createdAt, data {invoiceId, currency, amountMinor(string int), paymentId?}. Unknown keys rejected.
## Acceptance tests
roundtrip; tampered body; wrong secret; stale/future ts; replayed nonce; invalid-sig does not poison nonce store; malformed headers (dupes, missing, uppercase hex, short nonce); short secret; retry vectors; jitter bounds; idempotency; event schema negatives; store full fails closed.
