# webhook-receiver

Node HTTP receiver for GhostPay order webhooks (spec: `specs/webhooks.md`).

```
umask 077; node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > webhook.secret
WEBHOOK_SECRET_FILE=./webhook.secret node examples/webhook-receiver/server.mjs
node examples/webhook-receiver/selftest.mjs      # fake secret, in-process server
```
What it does: POST `/webhooks/ghostpay` only; body capped at 64 KiB; verifies `GhostPay-Signature` over the raw bytes (timestamp window, constant-time HMAC, nonce replay store) before parsing JSON; strict event schema; idempotent per event id: a redelivery is acknowledged as a duplicate (`200`) only after the first delivery's `onEvent` succeeded, a redelivery while it is still running gets a retryable `503` (that attempt may still fail, and a `2xx` stops the sender's retries), and a handler failure releases the id (`500`) so the sender's retry can succeed; every verification failure returns the same 400.
Limits: nonce and idempotency stores are in memory and per process, so a restart forgets them and several processes do not share them: production needs a durable shared store (the timestamp window still bounds replays; make your handler idempotent on `invoiceId`). `onEvent` must settle (time out rather than hang): while it runs, redeliveries of its event get `503`. Run behind TLS. `amountMinor` is a decimal string: use BigInt.
Status: selftest passes. Not load-tested.
