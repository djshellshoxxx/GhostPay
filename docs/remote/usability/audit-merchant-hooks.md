# Audit: @ghostpay/merchant-hooks (self-review)

Scope: webhooks.ts, button.ts, pos.ts, nfc.ts, link.ts. Pure; clock/nonce/jitter injected; no network. Deps: invoice-schema, @noble/hashes (hmac, sha2) as pinned in core-crypto.

## Threat model
- Forged/tampered webhook: HMAC-SHA256 over `t.n.body`, constant-time compare, secret >= 32 bytes enforced.
- Replay: timestamp window (default 300s) + nonce store; nonce stored only after valid MAC (no store poisoning); store bounded and fails closed.
- Verify-before-parse: API takes raw body string; event parse is a separate strict allow-list step.
- XSS via button label/URL: escape of & < > " ' `, controls stripped, 40 cp cap, URL validated first; output is one static anchor, no script/iframe/remote asset/handler.
- Link leakage: https only (localhost opt-in), no userinfo, no query; secret only in fragment. Fragment is still a bearer secret.
- NFC/QR parsing: strict single-record NDEF, no chunk/ID, exact length, fatal UTF-8, link re-validated, size caps (QR 2953, NDEF 8192).
- POS replay/late events: terminal states absorb events; TTL 30..900s; wrong invoice/currency ignored.

## Findings and fixes
- F1 (fixed pre-test): NonceStore.add pruning used a derived timestamp; changed to explicit `now` argument.
- F2 (fixed): redundant/incorrect NDEF header check removed; header flags validated bit by bit.
- No other defects found by tests (28 tests, incl. adversarial headers/NDEF).

## Honest limits
- Webhook nonce store and IdempotencyGuard are in-memory, single-process; multi-instance receivers must supply a shared NonceStore (interface provided) and a shared idempotency store. Idempotency guard evicts oldest when full, so a very old event id could be re-accepted.
- HMAC timing: JS cannot guarantee constant time; comparison is branch-free per char but not hardware-verified. Length of hex digest is public.
- `retryDelaySeconds` uses Math.pow on small numbers; schedule only, no delivery loop/persistence here.
- No QR rendering (apps/web pins qrcode-generator 2.0.4; wiring is app work). Real invoice links (~1-2 KB) usually exceed NTAG213/215 capacity; encrypted links are larger. NFC "offline" means the tag carries the full link; the payer still needs network to pay.
- NFC tag content is readable by anyone in range and not revocable: it carries the decryption key.
- Embed snippet exposes the link in page HTML; only place it on pages meant for that payer.
- Not independently reviewed; no mutation testing. Branch coverage 99%.
