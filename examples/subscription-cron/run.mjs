#!/usr/bin/env node
// Local, non-custodial invoice/reminder issuance. Never sends notifications or funds.
import { randomBytes } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { advance, cancel, createSubscription, markPaid, pause, resume } from '@ghostpay/merchant-billing';
import { parseStrictJson, signInvoice, signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { buildPaymentLink } from '@ghostpay/merchant-hooks';
import { checkTarget, readPrivate, withLock, writeAtomic } from './store.mjs';
import { configuration, logicalId, timestamp, validateSnapshot } from './state.mjs';

function readJson(path) { return parseStrictJson(readPrivate(path)); }
function readSnapshot(path) {
  try { return readJson(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
function loadKey(path) {
  if (!path) throw new Error('--key-file required');
  const hex = readPrivate(path, 128).trim();
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('invalid signing key file');
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}
function projection(snapshot) { return snapshot.outbox.map(r => JSON.stringify(r) + '\n').join(''); }
function publish(snapshot) { writeAtomic(snapshot.outboxPath, projection(snapshot)); }
async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { values: a } = parseArgs({ args: rest, options: {
    config: { type: 'string' }, state: { type: 'string' }, 'key-file': { type: 'string' }, outbox: { type: 'string' },
    index: { type: 'string' }, dir: { type: 'string' }, now: { type: 'string' }, 'at-period-end': { type: 'boolean' },
  } });
  const now = a.now === undefined ? Math.floor(Date.now() / 1000) : Number(a.now);
  timestamp(now);
  if (cmd === 'init-demo') {
    if (!a.dir) throw new Error('--dir required');
    const dir = resolve(a.dir);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const st = lstatSync(dir);
    if (!st.isDirectory() || (st.mode & 0o077) !== 0 || st.uid !== process.getuid?.()) throw new Error('demo directory must be owner-only');
    const key = new Uint8Array(randomBytes(32));
    try {
      const cfg = JSON.parse(readFileSync(new URL('./subscription.example.json', import.meta.url), 'utf8'));
      const pub = () => { const k = randomBytes(32); try { return signerPublicKeyHex(k); } finally { k.fill(0); } };
      cfg.template.signer = signerPublicKeyHex(key);
      cfg.template.metaAddress = `st:eth:0x${pub()}${pub()}`;
      cfg.plan.schedule.anchor = now - 86400;
      writeFileSync(join(dir,'signing.key'), Buffer.from(key).toString('hex')+'\n',{ flag:'wx',mode:0o600 });
      writeFileSync(join(dir,'sub.json'),JSON.stringify(cfg,null,2)+'\n',{ flag:'wx',mode:0o600 });
      console.log('created disposable demo config and signing key (DEMO ONLY)');
    } finally { key.fill(0); }
    return;
  }
  if (!['run','recover','mark-paid','pause','resume','cancel'].includes(cmd) || !a.state) throw new Error('usage: run.mjs <run|recover|mark-paid|pause|resume|cancel|init-demo> (see README)');
  const statePath = resolve(a.state);
  if (['.outbox.jsonl','.lock','.tmp'].some(suffix => statePath.endsWith(suffix))) throw new Error('state path uses a reserved suffix');
  // A fixed projection name prevents distinct states from overwriting one outbox.
  const outboxPath = `${statePath}.outbox.jsonl`;
  if (a.outbox !== undefined && resolve(a.outbox) !== outboxPath) throw new Error('--outbox must be STATE.outbox.jsonl');
  await withLock(statePath, async () => {
    let s = readSnapshot(statePath);
    const cfg = cmd === 'run' ? configuration(readJson(a.config ?? (()=>{throw new Error('--config required');})())) : undefined;
    if (s) {
      await validateSnapshot(s,cfg);
      if (s.outboxPath !== outboxPath) throw new Error('state path changed; reconcile explicitly before moving files');
      // Finish prior publication before taking any new action. A corrupt/truncated view is repaired from the committed snapshot.
      publish(s);
    } else {
      if (cmd !== 'run') throw new Error('state does not exist');
      try { lstatSync(outboxPath); throw new Error('outbox exists without its state; reconcile before issuing'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      s = { version:1,config:cfg,subscription:createSubscription(cfg.subscriptionId,cfg.plan,now),outbox:[],outboxPath };
    }
    if (cmd === 'recover') { console.log('committed outbox restored'); return; }
    if (now < s.subscription.createdAt || s.subscription.periods.some(p => now < p.issuedAt || now < (p.paidAt ?? 0)) || now < (s.subscription.pausedAt ?? 0) || now < (s.subscription.canceledAt ?? 0)) throw new Error('clock precedes committed activity');
    let issued = 0, reminders = 0;
    if (cmd === 'run') {
      const key = loadKey(a['key-file']);
      try {
        if (signerPublicKeyHex(key) !== cfg.template.signer) throw new Error('template signer does not match key');
        const res = advance(s.subscription,now,cfg.template);
        const rows = [];
        for (const inv of res.issued) {
          const p = res.subscription.periods.find(p => p.invoice.nonce === inv.nonce);
          const { url } = await buildPaymentLink(signInvoice(inv,key),{baseUrl:cfg.baseUrl});
          rows.push({kind:'invoice',eventId:logicalId(s.subscription.id,p.index),subscriptionId:s.subscription.id,periodIndex:p.index,nonce:inv.nonce,expiresAt:inv.expiresAt,link:url});
        }
        for (const r of res.reminders) rows.push({kind:'reminder',eventId:logicalId(r.subscriptionId,r.periodIndex,r.offsetIndex),...r});
        s = {...s,subscription:res.subscription,outbox:[...s.outbox,...rows]};
        issued = res.issued.length; reminders = res.reminders.length;
      } finally { key.fill(0); }
    } else if (cmd === 'mark-paid') {
      const index = Number(a.index);
      if (a.index === undefined || !Number.isSafeInteger(index) || index < 0) throw new Error('--index must be a non-negative integer');
      s = {...s,subscription:markPaid(s.subscription,index,now)};
    } else if (cmd === 'pause') s = {...s,subscription:pause(s.subscription,now)};
    else if (cmd === 'resume') s = {...s,subscription:resume(s.subscription,now)};
    else s = {...s,subscription:cancel(s.subscription,now,{atPeriodEnd:a['at-period-end'] ?? false})};
    await validateSnapshot(s);
    checkTarget(outboxPath);
    // Only commit authority: signed links and nextIndex/reminder markers are one atomic snapshot.
    writeAtomic(statePath,JSON.stringify(s)+'\n');
    publish(s);
    console.log(cmd === 'mark-paid' ? `period ${Number(a.index)} manually marked paid; no chain verification performed` : `status=${s.subscription.status} issued=${issued} reminders=${reminders}`);
  });
}
main().catch(() => {
  // Deliberately avoid raw library/OS errors: they may contain filenames, config or bearer links.
  console.error('error: operation refused; check private paths, config/state, key and lock (see README)');
  process.exitCode = 2;
});
