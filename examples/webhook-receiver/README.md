# webhook-receiver

Node HTTP receiver for GhostPay order webhooks (spec: `specs/webhooks.md`).

```
umask 077; node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > webhook.secret
WEBHOOK_SECRET_FILE=./webhook.secret node examples/webhook-receiver/server.mjs
node examples/webhook-receiver/selftest.mjs      # fake secret, in-process server
```
What it does: POST `/webhooks/ghostpay` only; body capped at 64 KiB; verifies `GhostPay-Signature` over the raw bytes (timestamp window, constant-time HMAC, nonce replay store) before parsing JSON; strict event schema; idempotent per event id (a handler failure releases the id so the sender's retry can succeed); every verification failure returns the same 400.
Limits: nonce and idempotency stores are in memory, so a restart forgets them (the timestamp window still bounds replays; make your handler idempotent on `invoiceId`). Run behind TLS. `amountMinor` is a decimal string: use BigInt.
Status: selftest passes. Not load-tested.
