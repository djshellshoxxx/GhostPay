# webhook-receiver

Optional local receiver for GhostPay's existing `t,n,v1` HMAC wire format. It authenticates the configured sender; it does **not** independently prove blockchain payment or finality. No email, payment broadcast, or production endpoint is involved.

## Setup

Requires Node with the built-in `node:sqlite` API (Node **22.13+**, tested here with **24.22.1**). This optional example has a stricter minor-version floor than the pure merchant-hooks package. SQLite may print its experimental API warning on Node 22; see the [official Node API history](https://nodejs.org/download/release/v22.23.0/docs/api/sqlite.html). Use a local filesystem, one private state directory per merchant/sender trust domain, and a fresh test secret:

```sh
npm ci --ignore-scripts
npm run build -w @ghostpay/core-crypto -w @ghostpay/invoice-schema -w @ghostpay/merchant-hooks
umask 077
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > webhook.secret
mkdir -m 700 webhook-state
WEBHOOK_SECRET_FILE=./webhook.secret WEBHOOK_STATE_DIR=./webhook-state node examples/webhook-receiver/server.mjs
node examples/webhook-receiver/selftest.mjs
node --test examples/webhook-receiver/durable.test.mjs
```

Default binding is loopback port 8788. Only `POST /webhooks/ghostpay`, `Content-Type: application/json` (optional UTF-8 charset), and identity encoding are accepted. Limit: 64 KiB. Invalid UTF-8 is refused; valid UTF-8 is decoded without removing a BOM before HMAC verification. Exact raw text is verified **before** JSON parsing. Malformed signatures, changed bodies, stale times, replayed nonces and conflicting bodies for an existing event ID get the same coarse `400`; unsupported format gets `415`. A storage error or unresolved event gets retryable `503`. Do not parse/reserialize upstream before verification.

Secret loading uses one regular, private, no-symlink file descriptor with a 4096-byte limit. The state directory and database must be owned by this process's user and private; the database must be a regular single-link file. Protect its parent directories too. No signing secret or body is stored in the database. Order/event/transaction references remain business data: keep state backups private. The sample handler prints event metadata, so replace it with suitable private operational logging before using customer data.

## Durable processing and recovery

`DurableWebhookStore` uses SQLite `BEGIN IMMEDIATE` transactions, WAL, `synchronous=FULL` and a 5-second busy timeout. Nonce insertion, event-body SHA-256 identity and the processing claim commit together. Each claim has a random token. Processes sharing the **same local state directory** serialize through SQLite. A completed event is acknowledged as a duplicate only after durable completion. Different body bytes for an existing event ID are refused, including alternate whitespace: redeliver the original bytes with a fresh signature nonce.

The identities have different meanings:

- `event.id`: immutable business event and handler idempotency key.
- Signature nonce: delivery attempt; a retry needs a fresh nonce and current timestamp.
- Claim token: ownership of one local processing attempt, preventing stale completion.
- `data.invoiceId` and `data.paymentId`: merchant/provider references, not proof of payment. Distinct event IDs for one payment are **not** automatically deduplicated by this store; your merchant transaction must enforce its own order/payment uniqueness.

The crash disposition is deliberate:

| Interruption | Durable result |
| --- | --- |
| Before transaction commit | SQLite rolls back uncommitted changes; no handler has run |
| After commit, before handler | Processing remains unresolved; no automatic takeover |
| During handler / after remote effect, before completion | Processing remains unresolved; never assume failure means no effect |
| After completion commit | Fresh-nonce redelivery returns `200` duplicate |
| Handler throws | Claim becomes unresolved and response is `503`; no automatic re-execution |

There is no exactly-once remote-side-effect promise. Forward `onEvent(event, { idempotencyKey })`'s key into a downstream transaction/idempotent handler. Stop or quiesce the original handler before recovery. Inspect the record locally with `store.inspect(eventId)`, reconcile the external effect, then call the operator-only API:

```js
store.reconcile(eventId, {
  token: record.token, digest: record.digest, now: Math.floor(Date.now() / 1000),
  originalHandlerStopped: true, outcome: 'done', // confirmed external completion
});
// Use outcome: 'retry' ONLY after proving no effect, or with downstream idempotency
// on the same event.id. The flag is an operator assertion, not an independent proof.
```

This API is **not** exposed over HTTP. Token/digest mismatch refuses stale recovery. It never steals a claim merely because time elapsed. Pending/unresolved work can therefore require operator intervention after a crash. A hanging handler stays unresolved; do not assume a Promise timeout cancels a remote effect. Stop it before reconciling.

Defaults: 100,000 event identities, 10,000 live nonces, 8 handling attempts per event. Expired nonces are pruned; completed events are **never automatically evicted**, because doing so could repeat effects. Full stores fail closed. Plan capacity/migration with the sender; deleting the database removes replay/processing history. SQLite size can retain freed pages; growth is bounded by these counts and fixed/bounded fields. Keep the directory on a supported local filesystem; this does not qualify NFS or a distributed database. Backups/rollback controlled by the same OS user are not independently detectable. Restoring an old snapshot can forget completed effects.

The lower-level `createReceiver()` without `store` retains the original in-memory mode for disposable examples/tests. It forgets history on restart, releases failed handlers, and is not the durable merchant workflow. The provided `server.mjs` requires durable state.

## Rotation and compatibility

Wire format is unchanged. Rotate using a coordinated stop/reconfigure of the sender and receiver, retain the same state directory and complete/reconcile in-flight work. There is no key-ID or dual-key overlap protocol in this example; old-secret attempts fail after replacement. Do not erase replay/event state on rotation. Independent Python HMAC fixtures live in `packages/merchant-hooks/test-vectors/webhooks.json` and are shared with the TypeScript/PHP conformance tests.

## Evidence and limits

`durable.test.mjs` exercises independent child processes, SIGKILL before handler/after a synthetic effect/after completion, reopen, stale tokens, immutable event identities, uncertain outcomes, bounds, corrupted databases, private file loading and real loopback HTTP. `selftest.mjs` covers the existing in-memory protocol journey. Package tests cover invalid runtime clocks/tolerances/retry policies and exact Unicode signatures. These are local fixtures, not real merchant fulfillment, MySQL/platform qualification, production load testing or chain verification.
