import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { approvalFixture } from './approvals-fixture.mjs';
import { initializeApprovals, inspectApprovals, updateApprovals } from './approvals-store.mjs';

const storeUrl = new URL('./approvals-store.mjs', import.meta.url).href;
async function setup(t) {
  const temp = await mkdtemp(join(tmpdir(), 'ghostpay approval test '));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const directory = join(temp, 'account');
  const fixture = approvalFixture();
  await initializeApprovals(directory, fixture.policy);
  return { temp, directory, fixture };
}
function child(source, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['--input-type=module', '-e', source, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    proc.stdout.on('data', data => { out += data; }); proc.stderr.on('data', data => { err += data; });
    proc.on('error', reject); proc.on('close', code => resolve({ code, out, err }));
  });
}

test('queue, reopen, timelock, local execute and stale retries', async t => {
  const { directory, fixture } = await setup(t);
  assert.equal((await stat(join(directory, 'account.json'))).mode & 0o777, 0o600);
  const q = await updateApprovals(directory, 0, { kind: 'queue', exchange: fixture.exchange }, fixture.now);
  await assert.rejects(updateApprovals(directory, 0, { kind: 'prune' }, fixture.now), { code: 'STALE_SNAPSHOT' });
  await assert.rejects(updateApprovals(directory, 1, { kind: 'execute', digest: q.queued.digest }, fixture.now), { code: 'TIMELOCK' });
  const restored = await inspectApprovals(directory);
  assert.equal(restored.revision, 1);
  const ex = await updateApprovals(directory, 1, { kind: 'execute', digest: q.queued.digest }, fixture.now + 60);
  assert.equal(ex.executed.amount, '100');
  assert.equal((await inspectApprovals(directory)).state.queued.length, 0);
  await assert.rejects(updateApprovals(directory, 2, { kind: 'execute', digest: q.queued.digest }, fixture.now + 60), { code: 'STATE' });
});

test('two processes cannot queue or execute twice from the same revision', async t => {
  const { directory, fixture } = await setup(t);
  const source = `import {updateApprovals} from ${JSON.stringify(storeUrl)}; try { await updateApprovals(process.argv[1], Number(process.argv[2]), JSON.parse(process.argv[3]), Number(process.argv[4])); console.log('applied'); } catch(e) { console.log(e.code); process.exitCode=2; }`;
  const args = [directory, '0', JSON.stringify({ kind: 'queue', exchange: fixture.exchange }), String(fixture.now)];
  const results = await Promise.all([child(source, args), child(source, args)]);
  assert.equal(results.filter(r => r.code === 0).length, 1);
  assert.match(results.find(r => r.code !== 0).out, /LOCKED|STALE_SNAPSHOT/);
  const snapshot = await inspectApprovals(directory);
  const execute = [directory, '1', JSON.stringify({ kind: 'execute', digest: snapshot.state.queued[0].digest }), String(fixture.now + 60)];
  const executions = await Promise.all([child(source, execute), child(source, execute)]);
  assert.equal(executions.filter(r => r.code === 0).length, 1);
  assert.equal((await inspectApprovals(directory)).revision, 2);
});

test('retained lock after killed owner is never stolen based on age', async t => {
  const { directory, fixture } = await setup(t);
  const lock = join(directory, '.lock');
  const outcome = await child(`import {mkdir} from 'node:fs/promises'; await mkdir(process.argv[1],{mode:0o700}); process.kill(process.pid,'SIGKILL');`, [lock]);
  assert.equal(outcome.code, null);
  await assert.rejects(updateApprovals(directory, 0, { kind: 'queue', exchange: fixture.exchange }, fixture.now + 1000000), { code: 'LOCKED' });
  assert.equal((await inspectApprovals(directory)).revision, 0);
});

test('refuses corrupt, broad-readable and symlink snapshots', async t => {
  const { temp, directory } = await setup(t);
  const path = join(directory, 'account.json');
  const original = await readFile(path);
  await writeFile(path, original.subarray(0, 20));
  await assert.rejects(inspectApprovals(directory));
  await writeFile(path, original);
  await chmod(path, 0o644);
  await assert.rejects(inspectApprovals(directory), { code: 'UNSAFE_SNAPSHOT' });
  await chmod(path, 0o600);
  const target = join(temp, 'target');
  await writeFile(target, original, { mode: 0o600 });
  await rm(path); await symlink(target, path);
  await assert.rejects(inspectApprovals(directory));
  assert.deepEqual(await readFile(target), original);
});

test('refuses unsafe directories, replacement initialization and unknown actions', async t => {
  const { directory, fixture } = await setup(t);
  await assert.rejects(initializeApprovals(directory, fixture.policy), { code: 'EEXIST' });
  await assert.rejects(updateApprovals(directory, NaN, { kind: 'prune' }, fixture.now), { code: 'INVALID_REVISION' });
  await assert.rejects(updateApprovals(directory, 0, { kind: 'broadcast' }, fixture.now), { code: 'INVALID_ACTION' });
  await chmod(directory, 0o755);
  await assert.rejects(inspectApprovals(directory), { code: 'UNSAFE_DIRECTORY' });
});


test('kill/restart at every snapshot persistence boundary preserves one state and retained lock', async t => {
  const points = ['before-write', 'after-write', 'before-file-sync', 'after-file-sync', 'before-rename', 'after-rename', 'before-directory-sync', 'after-directory-sync'];
  for (const point of points) {
    const { directory, fixture } = await setup(t);
    const source = `
      import fs from 'node:fs/promises';
      import {syncBuiltinESMExports} from 'node:module';
      const point = process.argv[2];
      const die = at => { if (point === at) process.kill(process.pid, 'SIGKILL'); };
      const originalOpen = fs.open;
      fs.open = async (...args) => {
        const handle = await originalOpen(...args);
        const temporary = String(args[0]).includes('.account-');
        const directory = String(args[0]) === process.argv[1];
        return new Proxy(handle, {get(target, prop) {
          const value = Reflect.get(target, prop);
          if (prop === 'writeFile' && temporary) return async (...a) => {die('before-write'); await value.apply(target,a); die('after-write');};
          if (prop === 'sync' && (temporary || directory)) return async (...a) => {
            const boundary = temporary ? 'file-sync' : 'directory-sync';
            die('before-' + boundary); await value.apply(target,a); die('after-' + boundary);
          };
          return typeof value === 'function' ? value.bind(target) : value;
        }});
      };
      const originalRename = fs.rename;
      fs.rename = async (...args) => {die('before-rename'); await originalRename(...args); die('after-rename');};
      syncBuiltinESMExports();
      const {updateApprovals} = await import(${JSON.stringify(storeUrl)});
      await updateApprovals(process.argv[1], 0, {kind:'queue',exchange:process.argv[3]}, Number(process.argv[4]));
    `;
    const outcome = await child(source, [directory, point, fixture.exchange, String(fixture.now)]);
    assert.equal(outcome.code, null, point + ': ' + outcome.err);
    const restored = await inspectApprovals(directory);
    const committed = ['after-rename', 'before-directory-sync', 'after-directory-sync'].includes(point);
    assert.equal(restored.revision, committed ? 1 : 0, point);
    assert.equal(restored.state.queued.length, committed ? 1 : 0, point);
    await assert.rejects(updateApprovals(directory, restored.revision, { kind: 'prune' }, fixture.now), {code:'LOCKED'});
  }
});
