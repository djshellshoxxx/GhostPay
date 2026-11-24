import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import { validateSnapshot } from './state.mjs';
import { readPrivate, writeAtomic } from './store.mjs';
const runner=fileURLToPath(new URL('./run.mjs',import.meta.url));
const loader=fileURLToPath(new URL('./tests/fault-loader.mjs',import.meta.url));
const now=1790000000;
function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'ghostpay subscription ')); t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const state=join(dir,'state.json');
  const args=['run','--config',join(dir,'sub.json'),'--state',state,'--key-file',join(dir,'signing.key'),'--now',String(now)];
  const run=(a=args,extra={})=>{ const result=spawnSync(process.execPath,[runner,...a],{encoding:'utf8',timeout:10000,...extra}); assert.equal(result.error,undefined,'subprocess spawn/timeout failed'); return result; };
  assert.equal(run(['init-demo','--dir',dir,'--now',String(now)]).status,0);
  return {dir,state,args,run,read:()=>JSON.parse(readFileSync(state,'utf8')),rows:()=>readFileSync(`${state}.outbox.jsonl`,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)};
}
for(const point of ['state-open','state-partial','state-write','state-fsync','state-rename','outbox-open','outbox-partial','outbox-write','outbox-fsync','outbox-rename','state-dir-before','state-dir-after','outbox-dir-before','outbox-dir-after']) {
  test(`kill/restart at ${point} preserves committed issuance identity`,async t=>{
    const f=fixture(t);
    const killed=spawnSync(process.execPath,['--import',loader,runner,...f.args],{encoding:'utf8',timeout:10000,env:{...process.env,GHOSTPAY_TEST_STATE:f.state,GHOSTPAY_TEST_FAULT:point}});
    assert.equal(killed.error,undefined,'fault subprocess spawn/timeout failed');
    assert.equal(killed.signal,'SIGKILL');
    const committed=existsSync(f.state)?f.read():null;
    if(!committed)assert.equal(existsSync(`${f.state}.outbox.jsonl`),false);
    // The child has exited: simulate explicit operator confirmation before stale-lock removal.
    assert.equal(f.run().status,2); unlinkSync(`${f.state}.lock`);
    assert.equal(f.run().status,0);
    const invoices=f.rows().filter(r=>r.kind==='invoice');
    assert.equal(invoices.length,1);
    if(committed)assert.deepEqual(invoices,committed.outbox.filter(r=>r.kind==='invoice'));
    assert.equal(f.run().status,0);assert.equal(f.rows().filter(r=>r.kind==='invoice').length,1);
    await validateSnapshot(f.read());
  });
}
test('a live stale-looking lock refuses a competing process',async t=>{
  const f=fixture(t); const marker=join(f.dir,'paused');
  const child=spawn(process.execPath,['--import',loader,runner,...f.args],{stdio:'ignore',env:{...process.env,GHOSTPAY_TEST_STATE:f.state,GHOSTPAY_TEST_FAULT:'state-fsync',GHOSTPAY_TEST_PAUSE:marker}});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  for(let i=0;i<300&&!existsSync(marker);i++)await setTimeout(10);
  assert.ok(existsSync(marker));utimesSync(`${f.state}.lock`,new Date(0),new Date(0));
  assert.equal(f.run().status,2);
  const closed=new Promise(resolve=>child.once('close',resolve));child.kill('SIGCONT');assert.equal(await closed,0);
  assert.equal(f.run().status,0);assert.equal(f.rows().filter(r=>r.kind==='invoice').length,1);
});
test('recovery repairs a truncated outbox without changing signed link or nonce',t=>{
  const f=fixture(t);assert.equal(f.run().status,0);const before=f.rows();
  writeFileSync(`${f.state}.outbox.jsonl`,'{"partial":',{mode:0o600});
  assert.equal(f.run(['recover','--state',f.state]).status,0);assert.deepEqual(f.rows(),before);
});
test('corrupt state refuses issuance and leaves committed projection untouched',t=>{
  const f=fixture(t);assert.equal(f.run().status,0);const before=f.rows();
  writeFileSync(f.state,'{"version":',{mode:0o600});assert.equal(f.run().status,2);assert.deepEqual(f.rows(),before);
});
test('private files, symlinks, key mismatch, changed config, missing state and output alias are refused',t=>{
  const f=fixture(t); assert.equal(f.run().status,0);
  const original=readFileSync(join(f.dir,'signing.key'));
  writeFileSync(join(f.dir,'signing.key'),'01'.repeat(32));assert.equal(f.run().status,2);writeFileSync(join(f.dir,'signing.key'),original);
  chmodSync(join(f.dir,'signing.key'),0o644);assert.equal(f.run().status,2);chmodSync(join(f.dir,'signing.key'),0o600);
  const cfg=JSON.parse(readFileSync(join(f.dir,'sub.json'),'utf8'));cfg.plan.amountMinor='999';writeFileSync(join(f.dir,'sub.json'),JSON.stringify(cfg));assert.equal(f.run().status,2);
  assert.equal(f.run(['recover','--state',f.state,'--outbox',join(f.dir,'other')]).status,2);
  for(const suffix of ['.outbox.jsonl','.lock','.tmp']) assert.equal(f.run(['recover','--state',f.state+suffix]).status,2);
  const view=`${f.state}.outbox.jsonl`;unlinkSync(view);symlinkSync(f.state,view);assert.equal(f.run(['recover','--state',f.state]).status,2);
  unlinkSync(view);writeFileSync(view,'orphan');unlinkSync(f.state);assert.equal(f.run().status,2);
});
test('manual payment, pause/resume/cancel and reminders remain idempotent across restarts',t=>{
  const f=fixture(t);assert.equal(f.run().status,0);assert.equal(f.run().status,0);const count=f.rows().length;assert.equal(f.run().status,0);assert.equal(f.rows().length,count);
  const command=(cmd,extra=[])=>f.run([cmd,'--state',f.state,'--now',String(now),...extra]);
  assert.match(command('mark-paid',['--index','0']).stdout,/manually marked paid; no chain verification/);
  assert.equal(command('mark-paid',['--index','0']).status,0);assert.equal(command('pause').status,0);
  assert.equal(f.run().status,0);assert.equal(f.read().subscription.status,'paused');
  assert.equal(command('resume').status,0);assert.equal(command('cancel').status,0);assert.equal(f.run().status,0);assert.equal(f.read().subscription.status,'canceled');
});
test('strict persisted fields and signature binding reject malformed state',async t=>{
  const f=fixture(t);assert.equal(f.run().status,0);const good=f.read();
  for(const mutate of [s=>{s.subscription.nextIndex=-1;},s=>{s.subscription.periods[0].dueAt=NaN;},s=>{s.subscription.periods[0].invoice.fiat.minorUnits='1';},s=>{s.subscription.periods[0].paidAt=now;},s=>{s.outbox[0].nonce='00';},s=>{s.outbox=[];},s=>{s.config.template.signer='00';},s=>{s.subscription.periods.push(s.subscription.periods[0]);},s=>{s.subscription.extra=true;},s=>{s.subscription.periods[0].remindersSent=99;},s=>{s.subscription.periods[0].remindersSent=3;}]) {
    const s=structuredClone(good);mutate(s);await assert.rejects(validateSnapshot(s));
  }
});
test('bounded descriptor read and atomic overwrite retain private permissions',t=>{
  const f=fixture(t);const path=join(f.dir,'bounded');writeAtomic(path,'hello');assert.equal(readPrivate(path,5),'hello');assert.throws(()=>readPrivate(path,4));writeAtomic(path,'bye');assert.equal(readPrivate(path),'bye');
});
