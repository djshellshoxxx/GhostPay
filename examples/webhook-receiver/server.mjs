#!/usr/bin/env node
// Minimal GhostPay webhook receiver. Secret comes from a file (hex, >= 32 bytes, mode 600), never from argv/env text.
//   WEBHOOK_SECRET_FILE=./webhook.secret node examples/webhook-receiver/server.mjs
// Listens on 127.0.0.1:8788 by default; put TLS + a reverse proxy in front. Replace `onEvent` with your order logic.
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createReceiver } from './receiver.mjs';

const file = process.env.WEBHOOK_SECRET_FILE;
if (!file) {
  console.error('set WEBHOOK_SECRET_FILE to a mode-600 file holding the hex secret (>= 64 hex chars)');
  process.exit(2);
}
if ((statSync(file).mode & 0o077) !== 0) {
  console.error('secret file must not be group/world accessible (chmod 600)');
  process.exit(2);
}
const hex = readFileSync(file, 'utf8').trim();
if (!/^(?:[0-9a-f]{2}){32,}$/.test(hex)) {
  console.error('secret must be lowercase hex, at least 32 bytes');
  process.exit(2);
}
const secret = Uint8Array.from(Buffer.from(hex, 'hex'));

const handler = createReceiver({
  secret,
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
