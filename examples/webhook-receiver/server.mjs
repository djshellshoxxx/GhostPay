#!/usr/bin/env node
// Minimal GhostPay webhook receiver. Secret comes from a file (hex, >= 32 bytes, mode 600), never from argv/env text.
//   WEBHOOK_SECRET_FILE=./webhook.secret node examples/webhook-receiver/server.mjs
// Listens on 127.0.0.1:8788 by default; put TLS + a reverse proxy in front. Replace `onEvent` with your order logic.
import { createServer } from 'node:http';
import { createReceiver } from './receiver.mjs';
import { DurableWebhookStore } from './durable-store.mjs';
import { loadWebhookSecret } from './secret.mjs';

let secret, store;
try {
  if (!process.env.WEBHOOK_SECRET_FILE || !process.env.WEBHOOK_STATE_DIR) throw new Error();
  secret = loadWebhookSecret(process.env.WEBHOOK_SECRET_FILE);
  store = new DurableWebhookStore(process.env.WEBHOOK_STATE_DIR);
} catch {
  console.error('receiver setup failed: check private WEBHOOK_SECRET_FILE and WEBHOOK_STATE_DIR');
  process.exit(2);
}

const handler = createReceiver({
  secret,
  store,
  async onEvent(event) {
    // Amounts are decimal STRINGS in minor units: use BigInt, never Number.
    const amount = BigInt(event.data.amountMinor);
    console.log(`event ${event.id} ${event.type} invoice=${event.data.invoiceId} ${amount} ${event.data.currency} (minor)`);
  },
});

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 8788);
const server = createServer((req, res) => void handler(req, res));
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.listen(port, host, () => console.log(`listening on http://${host}:${port}/webhooks/ghostpay`));

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close(); secret.fill(0); }));
