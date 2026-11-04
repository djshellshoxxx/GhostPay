#!/usr/bin/env node
// Self-contained check of the receiver: valid, replay, tampered, stale, duplicate event, redelivery while the first
// delivery is still being handled, oversize, wrong path. Fake secret and fake events only. Exits non-zero on any
// failed expectation.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { serializeWebhookEvent, signWebhook } from '@ghostpay/merchant-hooks';
import { createReceiver, MAX_BODY_BYTES, PATH } from './receiver.mjs';

const secret = new Uint8Array(randomBytes(32));
let clock = 1_800_000_000;
const got = [];
const gates = new Map(); // event id -> promise its handler waits for (lets the test hold a delivery inside onEvent)
const receiver = createReceiver({
  secret,
  now: () => clock,
  onEvent: async (e) => {
    got.push(e.id);
    await gates.get(e.id);
  },
});
const server = createServer((q, s) => void receiver(q, s));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const event = (id) => serializeWebhookEvent({ id, type: 'invoice.paid', createdAt: clock, data: { invoiceId: 'inv_1', currency: 'USD', amountMinor: '1250' } });
const nonce = () => randomBytes(16).toString('hex');
const post = (body, sig, path = PATH) =>
  fetch(base + path, { method: 'POST', body, headers: sig ? { 'ghostpay-signature': sig } : {} });

const body = event('evt_1');
const sig = signWebhook(secret, body, { now: clock, nonce: nonce() });
assert.equal((await post(body, sig)).status, 200, 'valid');
assert.equal((await post(body, sig)).status, 400, 'replayed nonce rejected');
const dupSig = signWebhook(secret, body, { now: clock, nonce: nonce() });
const dup = await post(body, dupSig);
assert.equal(dup.status, 200);
assert.equal((await dup.json()).duplicate, true, 'same event id, new nonce: acknowledged, not reprocessed');
assert.equal((await post(body + ' ', signWebhook(secret, body, { now: clock, nonce: nonce() }))).status, 400, 'tampered body');
assert.equal((await post(body, signWebhook(new Uint8Array(randomBytes(32)), body, { now: clock, nonce: nonce() }))).status, 400, 'wrong secret');
assert.equal((await post(event('evt_2'), signWebhook(secret, event('evt_2'), { now: clock - 3600, nonce: nonce() }))).status, 400, 'stale');
assert.equal((await post(body, undefined)).status, 400, 'missing header');
const big = await post('x'.repeat(MAX_BODY_BYTES + 1), sig).then((r) => r.status, () => 'connection-reset');
assert.ok(big === 413 || big === 'connection-reset', `oversize body must be refused (got ${big})`);
assert.equal((await post(body, sig, '/other')).status, 404);
assert.deepEqual(got, ['evt_1'], 'handler ran exactly once');

// A redelivery that arrives while the first delivery of the same event is still inside onEvent() must not be
// acknowledged: the first attempt may still fail, and a 2xx stops the sender's retries, so the event would be lost.
const slow = event('evt_slow');
const fresh = () => signWebhook(secret, slow, { now: clock, nonce: nonce() });
let failFirst;
gates.set('evt_slow', new Promise((_, reject) => (failFirst = reject)));
const first = post(slow, fresh());
for (let i = 0; i < 500 && !got.includes('evt_slow'); i++) await new Promise((r) => setTimeout(r, 10));
assert.ok(got.includes('evt_slow'), 'first delivery is inside the handler');
const inFlight = await post(slow, fresh());
assert.equal(inFlight.status, 503, 'redelivery during the first attempt is retryable, not a 2xx duplicate');
assert.deepEqual(await inFlight.json(), { ok: false, retry: true });
failFirst(new Error('order update failed'));
assert.equal((await first).status, 500, 'first attempt failed and released the event');
gates.delete('evt_slow');
const retried = await post(slow, fresh());
assert.equal(retried.status, 200);
assert.deepEqual(await retried.json(), { ok: true }, 'the retry processes the event');
const afterDone = await post(slow, fresh());
assert.deepEqual([afterDone.status, await afterDone.json()], [200, { ok: true, duplicate: true }], 'acknowledged as a duplicate only once handled');
assert.deepEqual(got, ['evt_1', 'evt_slow', 'evt_slow'], 'the failed event was handled again, the duplicates were not');
server.close();
console.log('webhook-receiver selftest: ok');
