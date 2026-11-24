import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { FixtureOperations, FIXTURE_META, FIXTURE_PAYMENT } from './refund-batch.mjs';

export const input = (key = 'refund-0001', amount = '600000') => ({ fixture: true,
  original: { ...FIXTURE_PAYMENT }, request: { idempotencyKey: key, amount, destinationMeta: FIXTURE_META } });
const moduleUrl = new URL('./refund-batch.mjs', import.meta.url).href;
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ghostpay merchant fixtures '));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const open = (dir, extra) => new FixtureOperations(dir, { fixture: true, ...extra });
function approved(db, request = input()) {
  const r = db.preview('refund', request);
  return db.approve(r.id, r.confirmation, request);
}

test('default refuses real payment authority, altered fixture evidence and malformed requests', (t) => {
  const dir = setup(t);
  assert.throws(() => new FixtureOperations(dir), /authority/);
  const db = open(dir); t.after(() => db.close());
  for (const change of [{ paidAmount: '2000000' }, { chainId: 1 }, { token: 'ETH' }, { invoiceNonce: 'different' }])
    assert.throws(() => db.preview('refund', { ...input(), original: { ...FIXTURE_PAYMENT, ...change } }));
  for (const value of ['0', '-1', '1.2', '01', '9'.repeat(79), 1, null])
    assert.throws(() => db.preview('refund', input('refund-0001', value)));
});

test('restart preserves exact reservation and changed input cannot reuse confirmation', (t) => {
  const dir = setup(t);
  let db = open(dir);
  const r = db.preview('refund', input()); db.close();
  db = open(dir); t.after(() => db.close());
  assert.deepEqual(db.preview('refund', input()), r);
  assert.throws(() => db.preview('refund', input('refund-0001', '600001')), /Changed/);
  assert.throws(() => db.approve(r.id, r.confirmation, input('refund-0001', '500000')), /mismatch/);
  assert.throws(() => db.preview('refund', input('refund-0002', '400001')), /exceeds/);
  assert.equal(db.preview('refund', input('refund-0002', '400000')).plan.amount, '400000');
});

test('unknown outcome stays reserved and timeout never frees funds', (t) => {
  const dir = setup(t); let db = open(dir);
  const r = approved(db);
  db.submitted(r.id, r.confirmation, 0, 'fixture-tx:one'); db.close(); db = open(dir); t.after(() => db.close());
  assert.throws(() => db.invalidate(r.id), /remain reserved/);
  assert.throws(() => db.reconcileFixture(r.id, 0, { fixture: true, reference: 'fixture-tx:one', outcome: 'timeout' }), /timeout/);
  assert.throws(() => db.preview('refund', input('refund-0002', '600000')), /exceeds/);
  db.reconcileFixture(r.id, 0, { fixture: true, reference: 'fixture-tx:one', outcome: 'unknown' });
  assert.throws(() => db.preview('refund', input('refund-0002', '600000')), /exceeds/);
  db.reconcileFixture(r.id, 0, { fixture: true, reference: 'fixture-tx:one', outcome: 'definitively-failed' });
  assert.equal(db.preview('refund', input('refund-0002', '600000')).phase, 'planned');
  assert.throws(() => db.reconcileFixture(r.id, 0, { fixture: true, reference: 'fixture-tx:one', outcome: 'confirmed' }), /Terminal/);
});

test('approval/submission guards, duplicate transaction refusal and immutable terminal outcomes', (t) => {
  const db = open(setup(t)); t.after(() => db.close());
  const r = db.preview('refund', input('refund-0001', '400000'));
  assert.throws(() => db.submitted(r.id, r.confirmation, 0, 'fixture-tx:one'));
  db.approve(r.id, r.confirmation, input('refund-0001', '400000'));
  assert.throws(() => db.submitted(r.id, 'old-hash', 0, 'fixture-tx:one'));
  db.submitted(r.id, r.confirmation, 0, 'fixture-tx:one');
  assert.throws(() => db.submitted(r.id, r.confirmation, 0, 'fixture-tx:two'), /already/);
  const other = approved(db, input('refund-0002', '400000'));
  assert.throws(() => db.submitted(other.id, other.confirmation, 0, 'fixture-tx:one'));
  db.reconcileFixture(r.id, 0, { fixture: true, reference: 'fixture-tx:one', outcome: 'confirmed' });
  assert.throws(() => db.preview('refund', input('refund-0003', '400000')), /exceeds/);
});

test('unsubmitted invalidation releases reservation but cannot reuse invalidated confirmation', (t) => {
  const db = open(setup(t)); t.after(() => db.close());
  const r = approved(db);
  db.invalidate(r.id);
  assert.throws(() => db.approve(r.id, r.confirmation, input()));
  assert.equal(db.preview('refund', input('refund-0002', '1000000')).phase, 'planned');
});

const batch = { fixture: true, chainId: 11155111, token: FIXTURE_PAYMENT.token, decimals: 6,
  csv: 'destination,amount,label\n0x1111111111111111111111111111111111111111,1.000001,First\n0x2222222222222222222222222222222222222222,2.000002,Second' };
test('batch identity binds source and exact amounts; per-item partial outcomes survive restart', (t) => {
  const dir = setup(t); let db = open(dir);
  const r = db.preview('batch', batch);
  assert.equal(r.plan.total, '3000003');
  for (const change of [{ decimals: 5 }, { chainId: 1 }, { token: '0x' + '3'.repeat(40) }, { csv: batch.csv.replace('First', 'Edited') }])
    assert.throws(() => db.approve(r.id, r.confirmation, { ...batch, ...change }));
  db.approve(r.id, r.confirmation, batch);
  db.submitted(r.id, r.confirmation, 0, 'fixture-tx:batch-0');
  db.reconcileFixture(r.id, 0, { fixture: true, reference: 'fixture-tx:batch-0', outcome: 'confirmed' });
  db.submitted(r.id, r.confirmation, 1, 'fixture-tx:batch-1');
  db.close(); db = open(dir); t.after(() => db.close());
  assert.deepEqual(db.snapshot()[0].items.map((i) => i.status), ['fixture-confirmed', 'submitted-unknown']);
  assert.throws(() => db.invalidate(r.id), /reserved/);
});

test('batch rejects duplicate destinations, formula labels and precision overflow', (t) => {
  const db = open(setup(t)); t.after(() => db.close());
  for (const csv of [batch.csv.replace('2'.repeat(40), '1'.repeat(40)), batch.csv.replace('First', '=SUM(A1)'),
    batch.csv.replace('1.000001', '1.0000001'), batch.csv.replace('1.000001', '9'.repeat(79))])
    assert.throws(() => db.preview('batch', { ...batch, csv }), /CSV/);
});

test('parallel processes serialize cumulative bounds', async (t) => {
  const dir = setup(t); open(dir).close();
  const run = (key) => {
    const code = `import {FixtureOperations} from ${JSON.stringify(moduleUrl)}; const d=new FixtureOperations(${JSON.stringify(dir)},{fixture:true}); try {d.preview('refund',${JSON.stringify(input(key))});process.exitCode=0;}catch{process.exitCode=2;}finally{d.close();}`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: 'ignore' });
    return once(child, 'exit').then(([code]) => code);
  };
  assert.deepEqual((await Promise.all([run('refund-race-a'), run('refund-race-b')])).sort(), [0, 2]);
  const db = open(dir); t.after(() => db.close()); assert.equal(db.snapshot().length, 1);
});

for (const boundary of ['before-commit', 'after-commit']) test(`SIGKILL ${boundary} recovers one consistent snapshot`, (t) => {
  const dir = setup(t); open(dir).close();
  const code = `import {FixtureOperations} from ${JSON.stringify(moduleUrl)}; const d=new FixtureOperations(${JSON.stringify(dir)},{fixture:true,fault(p){if(p===${JSON.stringify(boundary)})process.kill(process.pid,'SIGKILL')}}); d.preview('refund',${JSON.stringify(input())});`;
  const killed = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.equal(killed.signal, 'SIGKILL');
  const db = open(dir); t.after(() => db.close());
  assert.equal(db.snapshot().length, boundary === 'after-commit' ? 1 : 0);
  db.preview('refund', input());
  assert.equal(db.snapshot().length, 1);
});

test('corrupt persisted fields fail closed on reopen', (t) => {
  const dir = setup(t); const db = open(dir); const r = approved(db); db.close();
  const raw = new DatabaseSync(join(dir, 'fixture-operations.sqlite'));
  raw.prepare('UPDATE fixture_state SET data=?').run(JSON.stringify([{ ...r, plan: { ...r.plan, amount: '-100' } }])); raw.close();
  assert.throws(() => open(dir), /Invalid/);
});

test('rejects broad permissions and symlink database targets', (t) => {
  const dir = setup(t); chmodSync(dir, 0o755); assert.throws(() => open(dir), /private directory/); chmodSync(dir, 0o700);
  const target = setup(t); open(target).close();
  symlinkSync(join(target, 'fixture-operations.sqlite'), join(dir, 'fixture-operations.sqlite'));
  assert.throws(() => open(dir), /private regular file/);
});
