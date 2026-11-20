import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createIntegrationLock, LOCK_REF } from '../automation/integration-lock.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ghostpay-integration-lock-'));
  let verifyMain = () => {};
  t.after(() => {
    try { verifyMain(); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });
  const remote = join(root, 'remote.git');
  const a = join(root, 'a');
  const b = join(root, 'b');
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git(root, 'init', '--bare', remote);
  git(root, 'init', '-b', 'main', a);
  git(a, 'config', 'user.name', 'Lock test');
  git(a, 'config', 'user.email', 'lock-test@example.invalid');
  git(a, 'commit', '--allow-empty', '-m', 'fixture');
  git(a, 'remote', 'add', 'origin', remote);
  git(a, 'push', 'origin', 'main');
  git(remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(root, 'clone', remote, b);
  const main = git(remote, 'rev-parse', 'refs/heads/main');
  verifyMain = () => assert.equal(git(remote, 'rev-parse', 'refs/heads/main'), main, 'lock operations must never move main');
  return { root, remote, a, b, git };
}

function pushBarrier(f) {
  const arrivals = join(f.root, 'arrivals');
  mkdirSync(arrivals);
  const hook = join(f.remote, 'hooks', 'pre-receive');
  // The fixture path comes from mkdtemp (no user input). Both pushes must reach
  // receive-pack before either updates the shared ref.
  writeFileSync(hook, `#!/bin/sh\nset -eu\nmktemp '${arrivals}/arrival.XXXXXX' >/dev/null\ni=0\nwhile [ "$(find '${arrivals}' -type f | wc -l)" -lt 2 ]; do\n  i=$((i+1))\n  [ "$i" -lt 300 ] || exit 1\n  sleep 0.02\ndone\n`, { mode: 0o755 });
  return arrivals;
}

test('acquisition is durable across clones and release keeps the complete history', async (t) => {
  const f = fixture(t);
  const a = createIntegrationLock({ cwd: f.a });
  const b = createIntegrationLock({ cwd: f.b });
  assert.equal(await a.status(), null);
  const first = await a.acquire({ owner: 'cycle-a', ttlSeconds: 60 });
  assert.equal(first.state.status, 'held');
  assert.equal(first.state.generation, 1);
  assert.equal(first.state.base_sha, f.git(f.a, 'rev-parse', 'HEAD'));
  assert.deepEqual(await b.assertOwned({ owner: 'cycle-a', token: first.state.token }), first);
  const refreshed = await a.heartbeat({ owner: 'cycle-a', token: first.state.token, ttlSeconds: 120 });
  assert.equal(refreshed.state.token, first.state.token);
  const released = await b.release({ owner: 'cycle-a', token: first.state.token });
  assert.equal(released.state.status, 'released');
  const next = await b.acquire({ owner: 'cycle-b', ttlSeconds: 60 });
  assert.equal(next.state.generation, 2);
  assert.notEqual(next.state.token, first.state.token);
  assert.equal(f.git(f.remote, 'rev-list', '--count', LOCK_REF), '4');
  assert.equal(f.git(f.a, 'status', '--porcelain'), '');
});

test('wrong owner or fencing token cannot assert, renew, release, or steal an active lock', async (t) => {
  const f = fixture(t);
  const a = createIntegrationLock({ cwd: f.a });
  const held = await a.acquire({ owner: 'cycle-a' });
  const b = createIntegrationLock({ cwd: f.b });
  for (const identity of [{ owner: 'cycle-b', token: held.state.token }, { owner: 'cycle-a', token: 'wrong' }]) {
    await assert.rejects(b.assertOwned(identity), /ownership/);
    await assert.rejects(b.heartbeat(identity), /ownership/);
    await assert.rejects(b.release(identity), /ownership/);
  }
  await assert.rejects(b.acquire({ owner: 'cycle-b' }), /already held/);
  assert.equal((await b.status()).sha, held.sha);
});

test('expiry blocks integration and renewal but never permits another cycle to steal the lock', async (t) => {
  const f = fixture(t);
  let now = Date.parse('2026-11-19T08:00:00Z');
  const a = createIntegrationLock({ cwd: f.a, now: () => now });
  const b = createIntegrationLock({ cwd: f.b, now: () => now });
  const held = await a.acquire({ owner: 'interrupted-cycle', ttlSeconds: 1 });
  now += 1000;
  const identity = { owner: 'interrupted-cycle', token: held.state.token };
  await assert.rejects(a.assertOwned(identity), /expired/);
  await assert.rejects(a.heartbeat(identity), /expired/);
  await assert.rejects(b.acquire({ owner: 'next-cycle' }), /already held/);
  await a.release(identity);
  assert.equal((await b.acquire({ owner: 'next-cycle' })).state.generation, 2);
});

for (const existing of [false, true]) {
  test(`two simultaneous acquisitions have one winner (${existing ? 'released' : 'absent'} remote ref)`, async (t) => {
    const f = fixture(t);
    const a = createIntegrationLock({ cwd: f.a });
    const b = createIntegrationLock({ cwd: f.b });
    if (existing) {
      const first = await a.acquire({ owner: 'previous' });
      await a.release({ owner: 'previous', token: first.state.token });
    }
    const arrivals = pushBarrier(f);
    const outcomes = await Promise.allSettled([a.acquire({ owner: 'a' }), b.acquire({ owner: 'b' })]);
    assert.equal(readdirSync(arrivals).length, 2, 'both writers reached the Git server');
    assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter((r) => r.status === 'rejected').length, 1);
    const winner = outcomes.find((r) => r.status === 'fulfilled').value;
    assert.deepEqual(await a.status(), winner);
    assert.equal(winner.state.generation, existing ? 2 : 1);
  });
}

test('a rejected push never reports ownership or changes remote state', async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.remote, 'hooks', 'pre-receive'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const lock = createIntegrationLock({ cwd: f.a });
  await assert.rejects(lock.acquire({ owner: 'rejected' }), /rejected/);
  assert.equal(await lock.status(), null);
});

test('lock updates never publish annotated tags when push.followTags is enabled', async (t) => {
  const f = fixture(t);
  const lock = createIntegrationLock({ cwd: f.a });
  const held = await lock.acquire({ owner: 'tag-isolation' });
  const refsBefore = f.git(f.remote, 'for-each-ref', '--format=%(refname)');
  f.git(f.a, 'config', 'push.followTags', 'true');
  f.git(f.a, 'tag', '-a', 'v0.0.0-unpublished-test', held.sha, '-m', 'must remain local');
  await lock.heartbeat({ owner: 'tag-isolation', token: held.state.token });
  await lock.release({ owner: 'tag-isolation', token: held.state.token });
  assert.equal(f.git(f.remote, 'for-each-ref', '--format=%(refname)'), refsBefore);
  assert.equal(f.git(f.remote, 'tag', '--list'), '');
  assert.equal(f.git(f.a, 'tag', '--list'), 'v0.0.0-unpublished-test');
});

test('heartbeat refuses expiry or clock rollback between ownership check and renewal', async (t) => {
  const f = fixture(t);
  let time = Date.parse('2026-11-19T08:00:00Z');
  let reads;
  const lock = createIntegrationLock({ cwd: f.a, now: () => reads?.length ? reads.shift() : time });
  const held = await lock.acquire({ owner: 'clock-boundary', ttlSeconds: 60 });
  const identity = { owner: 'clock-boundary', token: held.state.token };
  time += 1000;
  const renewed = await lock.heartbeat(identity);
  const expires = Date.parse(renewed.state.expires_at);
  reads = [expires - 1, expires + 1];
  await assert.rejects(lock.heartbeat(identity), /expired/);
  assert.equal((await lock.status()).sha, renewed.sha);
  reads = [time, time - 1];
  await assert.rejects(lock.heartbeat(identity), /backwards/);
  assert.equal((await lock.status()).sha, renewed.sha);
});

test('invalid state and differing read/write destinations fail closed', async (t) => {
  const f = fixture(t);
  const lock = createIntegrationLock({ cwd: f.a });
  f.git(f.a, 'push', 'origin', `HEAD:${LOCK_REF}`);
  await assert.rejects(lock.status(), /state/);
  await assert.rejects(lock.acquire({ owner: 'a' }), /state/);
  f.git(f.a, 'remote', 'set-url', '--push', 'origin', join(f.root, 'other.git'));
  await assert.rejects(createIntegrationLock({ cwd: f.a }).status(), /same single destination/);
});

test('CLI supports readback and rejects invalid arguments before mutation', async (t) => {
  const f = fixture(t);
  const script = resolve(import.meta.dirname, '../automation/integration-lock.mjs');
  const run = (...args) => JSON.parse(execFileSync(process.execPath, [script, ...args], { cwd: f.a, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  assert.equal(run('status'), null);
  const acquired = run('acquire', '--owner', 'cli-cycle', '--ttl-seconds', '60');
  assert.equal(run('assert', '--owner', 'cli-cycle', '--token', acquired.state.token).sha, acquired.sha);
  assert.throws(() => run('release', '--owner', 'cli-cycle', '--token', acquired.state.token, '--force'));
  assert.equal(run('status').sha, acquired.sha);
  assert.equal(run('release', '--owner', 'cli-cycle', '--token', acquired.state.token).state.status, 'released');
});
