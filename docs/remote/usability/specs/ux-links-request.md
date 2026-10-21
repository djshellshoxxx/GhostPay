# ux-links-request: payment requests

## Requirements
- R1 A request has version 1, 32-hex local id (injected RNG, WebCrypto default), target, canonical amount > 0 with at most `decimals` fractional digits, asset, decimals 0..18, optional chainId and memo, createdAt, expiresAt.
- R2 `expiresAt > createdAt` and lifetime <= 365 days. Clock is injected.
- R3 `validatePaymentRequest` accepts only plain objects with exactly the known keys (no accessors, symbols, prototypes), canonical lowercase target.
- R4 `requestStatus(req, {paidAt?, cancelledAt?}, now)`: paid observed before expiry -> `paid`; at/after expiry -> `paid_late`; else cancelled; else `expired` iff `now >= expiresAt`; else `pending`. Future-dated events ignored. Expiry is exclusive.
- R5 `requestToUri` / `requestFromUri` bridge to `ghostpay:` links; the payer side requires amount+asset+exp and rejects expiry further than `maxLifetime` (default 365 d) in the future.

## Acceptance tests (request.test.ts)
deterministic creation vector; distinct default ids; 9 bad-argument cases; 17 tampered-object cases incl. `__proto__`, getter, symbol, inherited; status boundary at `now = expiresAt` and `-1`; precedence matrix; link round-trip; incomplete and far-future links rejected.
