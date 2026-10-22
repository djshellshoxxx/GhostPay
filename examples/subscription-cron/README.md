# subscription-cron

Template for recurring billing without custody: GhostPay cannot pull funds. A cron job issues merchant-signed invoices (and reminder records) for each period; you deliver them; payers pay voluntarily (spec: `specs/subscriptions.md`).

```
node examples/subscription-cron/run.mjs init-demo --dir demo           # fake config + throwaway key
node examples/subscription-cron/run.mjs run --config demo/sub.json --state demo/state.json --key-file demo/signing.key --outbox demo/outbox.jsonl
node examples/subscription-cron/run.mjs mark-paid --state demo/state.json --index 0   # only after verifying the payment
```
`crontab.example` runs it hourly. `run` uses a lock file against overlapping runs, rewrites state atomically (mode 600), and appends to an outbox JSONL your mailer consumes (mode 600; it contains bearer payment links). Crash ordering: outbox is written before state, so a crash can duplicate a message but never lose one; de-duplicate on invoice `nonce`.
Edit `subscription.example.json` (metaAddress, signer, token, plan). Money is decimal strings in minor units. Dunning policy is the package default (`DEFAULT_DUNNING`).
Status: demo flow run OK against built packages; cron scheduling, mail delivery and a real meta-address NOT tested.
