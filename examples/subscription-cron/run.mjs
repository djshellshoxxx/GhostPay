#!/usr/bin/env node
// Subscription cron job. Non-custodial: GhostPay cannot pull funds; each run only ISSUES merchant-signed invoices
// and reminder records for you to deliver (email, SMS, ...). Payers pay voluntarily.
//
//   node run.mjs run       --config sub.json --state state.json --key-file signing.key --outbox outbox.jsonl
//   node run.mjs mark-paid --state state.json --index 3          (only after you verified the payment!)
//   node run.mjs init-demo --dir ./demo                           (writes fake config + throwaway key into ./demo)
//
// Cron: see crontab.example. State file is rewritten atomically; a lock file stops overlapping runs.
// Verified manually against the built packages (init-demo, run twice, mark-paid, bad index); not run under real cron.
import { randomBytes } from 'node:crypto';
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { advance, createSubscription, markPaid } from '@ghostpay/merchant-billing';
import { signInvoice, signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { buildPaymentLink } from '@ghostpay/merchant-hooks';

const [cmd, ...rest] = process.argv.slice(2);
const { values: a } = parseArgs({
  args: rest,
  options: {
    config: { type: 'string' }, state: { type: 'string' }, 'key-file': { type: 'string' }, outbox: { type: 'string' },
    index: { type: 'string' }, dir: { type: 'string' }, now: { type: 'string' },
  },
});
const die = (m) => { console.error(`error: ${m}`); process.exit(2); };
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const now = a.now === undefined ? Math.floor(Date.now() / 1000) : Number(a.now); // --now only for testing

function writeAtomic(path, text) {
  const tmp = `${path}.${process.pid}.tmp`;
  const fd = openSync(tmp, 'wx', 0o600);
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}

function appendPrivateOutbox(path, text) {
  let fd;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0), 0o600);
    if (!fstatSync(fd).isFile()) die('outbox must be a regular file');
    fchmodSync(fd, 0o600);
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

async function withLock(path, fn) {
  const lock = `${path}.lock`;
  let fd;
  try { fd = openSync(lock, 'wx', 0o600); } catch { die(`another run holds ${lock} (delete it only if no run is active)`); }
  try { return await fn(); } finally { closeSync(fd); unlinkSync(lock); }
}

function loadKey(file) {
  if (!file) die('--key-file required');
  if ((statSync(file).mode & 0o077) !== 0) die('key file must be mode 600');
  const hex = readFileSync(file, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/.test(hex)) die('key file must hold 64 lowercase hex chars');
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

if (cmd === 'init-demo') {
  const dir = a.dir ?? die('--dir required');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const key = new Uint8Array(randomBytes(32));
  writeFileSync(join(dir, 'signing.key'), Buffer.from(key).toString('hex') + '\n', { mode: 0o600 });
  const cfg = readJson(new URL('./subscription.example.json', import.meta.url));
  const pub = () => signerPublicKeyHex(new Uint8Array(randomBytes(32)));
  cfg.template.signer = signerPublicKeyHex(key);
  cfg.template.metaAddress = `st:eth:0x${pub()}${pub()}`; // throwaway: never receive funds here
  cfg.plan.schedule.anchor = Math.floor(Date.now() / 1000) - 86_400;
  writeFileSync(join(dir, 'sub.json'), JSON.stringify(cfg, null, 2) + '\n');
  console.log(`wrote ${dir}/sub.json and ${dir}/signing.key (DEMO ONLY)`);
} else if (cmd === 'run') {
  const { config, state: statePath, outbox } = a;
  if (!config || !statePath || !outbox) die('--config, --state and --outbox are required');
  const cfg = readJson(config);
  const key = loadKey(a['key-file']);
  if (signerPublicKeyHex(key) !== cfg.template.signer) die('template.signer does not match the signing key');
  await withLock(statePath, async () => {
    let sub = existsSync(statePath) ? readJson(statePath) : createSubscription(cfg.subscriptionId, cfg.plan, now);
    const res = advance(sub, now, cfg.template);
    const lines = [];
    for (const inv of res.issued) {
      const signed = signInvoice(inv, key);
      const { url } = await buildPaymentLink(signed, { baseUrl: cfg.baseUrl });
      lines.push(JSON.stringify({ kind: 'invoice', subscriptionId: sub.id, nonce: inv.nonce, expiresAt: inv.expiresAt, link: url }));
    }
    for (const r of res.reminders) lines.push(JSON.stringify({ kind: 'reminder', ...r }));
    // Persist state first-then-outbox would lose messages on crash; outbox-then-state may duplicate. We choose
    // duplicates over loss: append to outbox, then commit state. Consumers de-duplicate on invoice nonce.
    if (lines.length > 0) appendPrivateOutbox(outbox, lines.join('\n') + '\n');
    writeAtomic(statePath, JSON.stringify(res.subscription, null, 2));
    console.log(`status=${res.subscription.status} issued=${res.issued.length} reminders=${res.reminders.length}`);
  });
} else if (cmd === 'mark-paid') {
  if (!a.state || a.index === undefined) die('--state and --index required');
  const idx = Number(a.index);
  if (!Number.isSafeInteger(idx) || idx < 0) die('--index must be a non-negative integer');
  await withLock(a.state, () => {
    writeAtomic(a.state, JSON.stringify(markPaid(readJson(a.state), idx, now), null, 2));
    console.log(`period ${idx} marked paid`);
  });
} else {
  die('usage: run.mjs <run|mark-paid|init-demo> [options]  (see header comment)');
}
