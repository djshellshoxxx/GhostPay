import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { signWebhook, serializeWebhookEvent } from '@ghostpay/merchant-hooks';
import { DurableWebhookStore } from './durable-store.mjs';
import { loadWebhookSecret } from './secret.mjs';
import { createReceiver, PATH } from './receiver.mjs';
const now = 1_800_000_000;
const secret = randomBytes(32);
const body = (id = 'evt_1') => serializeWebhookEvent({ id, type: 'invoice.paid', createdAt: now, data: { invoiceId: 'inv_1', currency: 'USD', amountMinor: '1250', paymentId: 'tx_1' } });
const header = (raw) => signWebhook(secret, raw, { now, nonce: randomBytes(16).toString('hex') });
function setup(t) { const dir = mkdtempSync(join(tmpdir(), 'ghostpay-webhook ')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; }
function worker(directory, raw, hold = false, phase) {
  const child = fork(new URL('./store-worker.mjs', import.meta.url), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('worker-timeout')); }, 10000);
    child.once('message', claim => { clearTimeout(timer); resolve({ child, claim }); });
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timer); if (code) reject(new Error('worker-exit')); });
  });
  child.send({ directory, body: raw, secret: [...secret], now, header: header(raw), hold, phase });
  return result;
}

test('accept defaults the optional clock to current unix seconds', t => {
  const store = new DurableWebhookStore(setup(t)); t.after(() => store.close());
  const clock = Math.floor(Date.now() / 1000);
  const sig = signWebhook(secret, body(), { now: clock, nonce: randomBytes(16).toString('hex') });
  assert.equal(store.accept(secret, body(), sig).kind, 'claimed');
});

test('durable nonce, body identity and completion survive reopen', t => {
  const dir = setup(t); const raw = body(); const sig = header(raw);
  let store = new DurableWebhookStore(dir); const c = store.accept(secret, raw, sig, { now });
  assert.equal(c.kind, 'claimed'); store.complete(c.event.id, c.token, now); store.close();
  store = new DurableWebhookStore(dir); t.after(() => store.close());
  assert.equal(store.accept(secret, raw, sig, { now }).kind, 'invalid');
  assert.equal(store.accept(secret, raw, header(raw), { now }).kind, 'done');
  assert.equal(store.accept(secret, raw + ' ', header(raw + ' '), { now }).kind, 'conflict');
  assert.throws(() => store.complete(c.event.id, c.token, now), /stale-claim/);
});

test('independent processes serialize claims and crash leaves unresolved work', async t => {
  const dir = setup(t); let store = new DurableWebhookStore(dir); store.close();
  const workers = await Promise.all(Array.from({ length: 6 }, () => worker(dir, body(), true)));
  t.after(() => workers.forEach(w => w.child.kill('SIGKILL')));
  assert.equal(workers.filter(w => w.claim.kind === 'claimed').length, 1);
  assert.equal(workers.filter(w => w.claim.kind === 'processing').length, 5);
  for (const w of workers) { if (w.child.exitCode === null && w.child.signalCode === null) { const exit = once(w.child, 'exit'); w.child.kill('SIGKILL'); await exit; } }
  store = new DurableWebhookStore(dir); t.after(() => store.close());
  assert.equal(store.accept(secret, body(), header(body()), { now: now + 1 }).kind, 'processing');
  const record = store.inspect('evt_1');
  assert.throws(() => store.reconcile('evt_1', { ...record, outcome: 'retry', now, originalHandlerStopped: false }), /bad-reconciliation/);
  assert.throws(() => store.reconcile('evt_1', { ...record, outcome: 'retry', now, originalHandlerStopped: 'false' }), /bad-reconciliation/);
  assert.throws(() => store.reconcile('evt_1', { ...record, token: 'stale', outcome: 'retry', now, originalHandlerStopped: true }), /stale-reconciliation/);
  store.reconcile('evt_1', { ...record, outcome: 'retry', now, originalHandlerStopped: true });
  const retried = store.accept(secret, body(), header(body()), { now });
  assert.equal(retried.kind, 'claimed'); assert.notEqual(retried.token, record.token);
  assert.throws(() => store.complete('evt_1', record.token, now), /stale-claim/);
  store.complete('evt_1', retried.token, now);
});

for (const phase of ['after-effect', 'after-completion']) test(`SIGKILL ${phase} retains the correct recovery disposition`, async t => {
  const dir = setup(t);
  const w = await worker(dir, body(), true, phase);
  t.after(() => w.child.kill('SIGKILL'));
  const exited = once(w.child, 'exit'); w.child.kill('SIGKILL'); await exited;
  const store = new DurableWebhookStore(dir); t.after(() => store.close());
  const result = store.accept(secret, body(), header(body()), { now });
  assert.equal(result.kind, phase === 'after-completion' ? 'done' : 'processing');
  if (phase === 'after-effect') {
    assert.equal(readFileSync(join(dir, 'synthetic-effect'), 'utf8'), 'evt_1');
    store.reconcile('evt_1', { ...w.claim, outcome: 'done', now, originalHandlerStopped: true });
    assert.equal(store.accept(secret, body(), header(body()), { now }).kind, 'done');
  }
});

test('uncertain side effect stays reserved; bounded retry and storage fail closed', t => {
  const store = new DurableWebhookStore(setup(t), { maxEvents: 1, maxAttempts: 2 }); t.after(() => store.close());
  let c = store.accept(secret, body(), header(body()), { now }); store.uncertain('evt_1', c.token, now);
  assert.equal(store.accept(secret, body(), header(body()), { now }).kind, 'processing');
  store.reconcile('evt_1', { ...c, outcome: 'retry', now, originalHandlerStopped: true });
  c = store.accept(secret, body(), header(body()), { now }); store.uncertain('evt_1', c.token, now);
  assert.throws(() => store.reconcile('evt_1', { ...c, outcome: 'retry', now, originalHandlerStopped: true }), /stale-reconciliation/);
  store.reconcile('evt_1', { ...c, outcome: 'done', now, originalHandlerStopped: true });
  assert.equal(store.accept(secret, body('evt_2'), header(body('evt_2')), { now }).kind, 'capacity');
  assert.equal(store.accept(secret, body(), header(body()), { now }).kind, 'done');
});

test('nonce capacity, invalid body, invalid policy and corrupted database are refused', t => {
  const dir = setup(t); const store = new DurableWebhookStore(dir, { maxNonces: 1 });
  const bad = '{"garbage":true}';
  assert.equal(store.accept(secret, bad, header(bad), { now }).kind, 'invalid');
  assert.equal(store.accept(secret, body(), header(body()), { now }).kind, 'invalid');
  assert.throws(() => store.accept(secret, body(), header(body()), { now: NaN }), /bad-time-policy/);
  store.close();
  writeFileSync(join(dir, 'webhooks.sqlite'), 'corrupted');
  assert.throws(() => new DurableWebhookStore(dir));
  assert.throws(() => new DurableWebhookStore(dir, { maxEvents: NaN }), /bad-store-limit/);
});

test('private descriptor-bound secret and state paths reject unsafe files', t => {
  const dir = setup(t); const file = join(dir, 'key'); writeFileSync(file, secret.toString('hex'), { mode: 0o600 });
  assert.deepEqual(Buffer.from(loadWebhookSecret(file)), secret);
  const link = join(dir, 'link'); symlinkSync(file, link); assert.throws(() => loadWebhookSecret(link));
  chmodSync(file, 0o644); assert.throws(() => loadWebhookSecret(file), /unsafe-secret-file/);
  chmodSync(file, 0o600); writeFileSync(file, 'aa'.repeat(3000)); assert.throws(() => loadWebhookSecret(file), /unsafe-secret-file/);
  assert.throws(() => loadWebhookSecret(dir), /unsafe-secret-file/);
  symlinkSync(file, join(dir, 'webhooks.sqlite')); assert.throws(() => new DurableWebhookStore(dir));
});

test('HTTP durable handler exception never acknowledges completion or repeats effects', async t => {
  const store = new DurableWebhookStore(setup(t)); let calls = 0;
  const handler = createReceiver({ secret, store, now: () => now, onEvent: () => { calls++; throw new Error('unknown outcome'); } });
  const server = createServer((q, s) => void handler(q, s));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const url = `http://127.0.0.1:${server.address().port}${PATH}`;
  const post = (raw, type = 'application/json', sig = header(typeof raw === 'string' ? raw : 'x')) => fetch(url, { method: 'POST', body: raw, headers: { 'content-type': type, 'ghostpay-signature': sig } });
  assert.equal((await post(body())).status, 503);
  assert.equal((await post(body())).status, 503);
  assert.equal(calls, 1);
  assert.equal((await post(body(), 'text/plain')).status, 415);
  assert.equal((await post(Buffer.from([0xff]))).status, 400);
  assert.equal((await post(body(), 'application/json', header('different'))).status, 400);
});
