// The deterministic Tor double checks the orchestration boundary only. The
// optional real-binary cases below separately exercise Tor's actual key loader.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, copyFile, link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const checker = fileURLToPath(new URL('../../deploy/tor-static/identity-check.sh', import.meta.url));
const HOST = '2gzyxa5ihm7nsggfxnu52rck2vv4rvmdlkiu3zzui5du4xyclen53wid.onion';
const OTHER = `${'b'.repeat(56)}.onion`;
const SECRET = 'synthetic-private-key-never-log';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'ghostpay-identity-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const data = join(root, 'data');
  const pin = join(root, 'expected-hostname');
  const tor = join(root, 'fake-tor');
  const calls = join(root, 'calls');
  await mkdir(data, { mode: 0o700 });
  await writeFile(pin, '', { mode: 0o600 });
  await writeFile(tor, `#!${process.execPath}
import fs from 'node:fs';
const args = process.argv.slice(2);
const config = fs.readFileSync(args[args.indexOf('-f') + 1], 'utf8');
fs.appendFileSync(process.env.TEST_TOR_CALLS, config + '\\n');
const line = (name) => config.split('\\n').find((value) => value.startsWith(name + ' ')).slice(name.length + 1);
if (line('DisableNetwork') !== '1' || line('HiddenServicePort') !== '80 127.0.0.1:9' || line('SocksPort') !== '0' || line('ControlPort') !== '0') process.exit(9);
if (process.env.TEST_TOR_MODE === 'fail') process.exit(3);
const dir = line('HiddenServiceDir');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
for (const [name, value] of [['hs_ed25519_secret_key', ${JSON.stringify(SECRET)}], ['hs_ed25519_public_key', 'synthetic-public-key']]) {
  if (!fs.existsSync(dir + '/' + name) || process.env.TEST_TOR_MODE === 'replace') fs.writeFileSync(dir + '/' + name, value, { mode: 0o600 });
}
fs.writeFileSync(dir + '/hostname', ${JSON.stringify(`${HOST}\n`)}, { mode: 0o600 });
const ready = () => {
  process.on('SIGTERM', () => process.exit(process.env.TEST_TOR_MODE === 'reject-stop' ? 3 : 0));
  console.error('[notice] Bootstrapped 0% (starting): Starting');
};
if (process.env.TEST_TOR_MODE === 'early-hostname') setTimeout(ready, 350);
else if (process.env.TEST_TOR_MODE === 'exit-before-ready') setTimeout(() => process.exit(3), 350);
else if (process.env.TEST_TOR_MODE === 'no-ready-marker') {
  process.on('SIGTERM', () => process.exit(0));
  setTimeout(() => process.exit(0), 350);
}
else ready();
setInterval(() => {}, 1000);
`, { mode: 0o700 });
  return { root, data, pin, tor, calls };
}

function run(f, mode, env = {}) {
  return spawnSync('sh', ['-c', '. "$1"; check_tor_identity "$2" "$3" "$4" "$5"', '_', checker, mode, f.data, f.pin, f.tor], {
    encoding: 'utf8', timeout: 20000,
    env: { ...process.env, TEST_TOR_CALLS: f.calls, ...env },
  });
}

async function initialized(t) {
  const f = await fixture(t);
  const result = run(f, 'initialize');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), HOST);
  await writeFile(f.pin, `${HOST}\n`);
  return f;
}

async function identityBytes(f) {
  const files = ['hostname', 'hs_ed25519_secret_key', 'hs_ed25519_public_key'];
  return Promise.all(files.map((name) => readFile(join(f.data, 'ghostpay', name))));
}

test('ordinary verification refuses an unpinned or missing identity without invoking Tor', async (t) => {
  const f = await fixture(t);
  let result = run(f, 'verify');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /configured onion hostname/);
  await writeFile(f.pin, `${HOST}\n`);
  result = run(f, 'verify');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /identity/);
  assert.deepEqual((await readdir(f.root)).sort(), ['data', 'expected-hostname', 'fake-tor']);
  assert.deepEqual(await readdir(f.data), []);
});

test('first use is explicit, network-disabled, numeric-targeted and refuses a second initialization', async (t) => {
  const f = await initialized(t);
  const before = await identityBytes(f);
  const config = await readFile(f.calls, 'utf8');
  assert.match(config, /^DisableNetwork 1$/m);
  assert.match(config, /^HiddenServicePort 80 127\.0\.0\.1:9$/m);
  assert.doesNotMatch(config, /web:|\.onion|ControlSocket/);
  await writeFile(f.pin, '');
  const retry = run(f, 'initialize');
  assert.notEqual(retry.status, 0);
  assert.match(retry.stderr, /already exists/);
  assert.deepEqual(await identityBytes(f), before);
  assert.deepEqual(await readdir(f.data), ['ghostpay']);
});

test('a matching pin verifies through Tor without modifying the stored identity or printing private bytes', async (t) => {
  const f = await initialized(t);
  const before = await identityBytes(f);
  const result = run(f, 'verify');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.doesNotMatch(result.stderr, new RegExp(SECRET));
  assert.deepEqual(await identityBytes(f), before);
  assert.deepEqual(await readdir(f.data), ['ghostpay']);
});

test('a hostname written before Tor installs signal handlers waits for startup readiness', async (t) => {
  const f = await fixture(t);
  const created = run(f, 'initialize', { TEST_TOR_MODE: 'early-hostname' });
  assert.equal(created.status, 0, created.stderr);
  assert.equal(created.stdout.trim(), HOST);
  await writeFile(f.pin, created.stdout);
  const before = await identityBytes(f);
  const verified = run(f, 'verify', { TEST_TOR_MODE: 'early-hostname' });
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(verified.stdout, '');
  assert.deepEqual(await identityBytes(f), before);
  assert.doesNotMatch(created.stderr + verified.stderr, new RegExp(SECRET));
  assert.deepEqual(await readdir(f.data), ['ghostpay']);
});

test('a complete temporary identity never bypasses a missing readiness marker or failed shutdown', async (t) => {
  for (const mode of ['exit-before-ready', 'no-ready-marker', 'reject-stop']) {
    await t.test(mode, async (t) => {
      const fresh = await fixture(t);
      const created = run(fresh, 'initialize', { TEST_TOR_MODE: mode });
      assert.equal(created.status, 1);
      assert.match(created.stderr, /Offline Tor/);
      assert.equal(created.stdout, '');
      assert.deepEqual(await readdir(fresh.data), []);
      const retained = await initialized(t);
      const before = await identityBytes(retained);
      const verified = run(retained, 'verify', { TEST_TOR_MODE: mode });
      assert.equal(verified.status, 1);
      assert.equal(verified.stdout, '');
      assert.deepEqual(await identityBytes(retained), before);
      assert.doesNotMatch(created.stderr + verified.stderr, new RegExp(SECRET));
      assert.deepEqual(await readdir(retained.data), ['ghostpay']);
    });
  }
});

test('a wrong stored hostname and a forged hostname over different keys both fail closed', async (t) => {
  const f = await initialized(t);
  await writeFile(f.pin, `${OTHER}\n`);
  const wrong = run(f, 'verify');
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /does not match/);
  await writeFile(join(f.data, 'ghostpay', 'hostname'), `${OTHER}\n`);
  const before = await identityBytes(f);
  const forged = run(f, 'verify');
  assert.notEqual(forged.status, 0);
  assert.match(forged.stderr, /derived onion hostname/);
  assert.deepEqual(await identityBytes(f), before);
});

test('Tor repair or replacement of copied key files is refused and the originals remain untouched', async (t) => {
  const f = await initialized(t);
  await writeFile(join(f.data, 'ghostpay', 'hs_ed25519_secret_key'), 'corrupt-but-private');
  const before = await identityBytes(f);
  const result = run(f, 'verify', { TEST_TOR_MODE: 'replace' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /key files changed/);
  assert.deepEqual(await identityBytes(f), before);
  assert.doesNotMatch(result.stdout + result.stderr, /corrupt-but-private|synthetic-private-key/);
});

test('partial, linked and permissive identities fail before offline Tor is invoked', async (t) => {
  for (const problem of ['missing', 'symlink', 'hardlink', 'mode', 'directory']) {
    await t.test(problem, async (t) => {
      const f = await initialized(t);
      const key = join(f.data, 'ghostpay', 'hs_ed25519_secret_key');
      if (problem === 'missing') await rm(key);
      if (problem === 'symlink') {
        const moved = join(f.root, 'outside-key');
        await copyFile(key, moved);
        await rm(key);
        await symlink(moved, key);
      }
      if (problem === 'mode') await chmod(key, 0o644);
      if (problem === 'hardlink') await link(key, join(f.root, 'linked-key'));
      if (problem === 'directory') await chmod(join(f.data, 'ghostpay'), 0o755);
      const callsBefore = await readFile(f.calls, 'utf8');
      const result = run(f, 'verify');
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /private|identity/);
      assert.equal(await readFile(f.calls, 'utf8'), callsBefore);
    });
  }
});

test('malformed pins and configured first-use origins are refused', async (t) => {
  const f = await initialized(t);
  for (const value of [HOST, `${HOST}\n\n`, `${HOST.toUpperCase()}\n`, `http://${HOST}\n`, `${HOST}:80\n`]) {
    await writeFile(f.pin, value);
    assert.notEqual(run(f, 'verify').status, 0, value);
  }
  const fresh = await fixture(t);
  await writeFile(fresh.pin, `${HOST}\n`);
  const result = run(fresh, 'initialize');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /empty.*first-use|restore/);
  assert.deepEqual(await readdir(fresh.data), []);
});

test('a failed offline Tor process cannot replace an identity or leave a new one behind', async (t) => {
  const f = await initialized(t);
  const before = await identityBytes(f);
  const result = run(f, 'verify', { TEST_TOR_MODE: 'fail' });
  assert.notEqual(result.status, 0);
  assert.deepEqual(await identityBytes(f), before);
  const fresh = await fixture(t);
  assert.notEqual(run(fresh, 'initialize', { TEST_TOR_MODE: 'fail' }).status, 0);
  assert.deepEqual(await readdir(fresh.data), []);
});

test('an existing identity operation lock refuses concurrent initialization', async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.data, '.ghostpay-identity-lock'), { mode: 0o700 });
  const result = run(f, 'initialize');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /identity operation/);
  assert.deepEqual(await readdir(f.data), ['.ghostpay-identity-lock']);
});

test('actual Tor derives the pinned hostname and rejects a mismatched restored keypair', {
  skip: process.env.GHOSTPAY_REAL_TOR_BIN ? false : 'GHOSTPAY_REAL_TOR_BIN unavailable; deterministic tests are not real-Tor identity proof',
}, async (t) => {
  const f = await fixture(t);
  f.tor = process.env.GHOSTPAY_REAL_TOR_BIN;
  const generated = run(f, 'initialize');
  assert.equal(generated.status, 0, generated.stderr);
  assert.match(generated.stdout.trim(), /^[a-z2-7]{56}\.onion$/);
  await writeFile(f.pin, generated.stdout);
  const before = await identityBytes(f);
  assert.equal(run(f, 'verify').status, 0);
  const other = await fixture(t);
  other.tor = f.tor;
  assert.equal(run(other, 'initialize').status, 0);
  await copyFile(join(other.data, 'ghostpay', 'hs_ed25519_public_key'), join(f.data, 'ghostpay', 'hs_ed25519_public_key'));
  const mismatched = await identityBytes(f);
  assert.notEqual(run(f, 'verify').status, 0);
  assert.deepEqual(await identityBytes(f), mismatched);
  await writeFile(join(f.data, 'ghostpay', 'hs_ed25519_public_key'), before[2]);
  assert.equal(run(f, 'verify').status, 0);
});
