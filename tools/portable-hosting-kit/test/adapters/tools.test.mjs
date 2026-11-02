// @ts-check
// Validation of generated profiles with the real tools, without activating anything:
// - tor --verify-config (all paths inside a temp dir; tor does not create HiddenServiceDir/keys in verify mode),
// - i2pd parsing the tunnel file inside `unshare -n` (no network) with a temp datadir, killed right away,
// - docker compose config (never up/build/pull).
// Each test skips with an explicit reason when the tool (or network namespaces) is unavailable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { generateTorProfile } from '../../src/adapters/tor.mjs';
import { generateI2pProfile } from '../../src/adapters/i2p.mjs';
import { onionHost, i2pHost, text } from './fixtures.mjs';

/**
 * @param {string} cmd
 * @param {string[]} args
 */
function runs(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000 });
  return r.status === 0;
}

const HAVE_TOR = runs('tor', ['--version']);
const HAVE_I2PD = runs('i2pd', ['--version']);
const HAVE_NETNS = runs('unshare', ['-n', 'true']);
const HAVE_COMPOSE = runs('docker', ['compose', 'version']);

/** @param {string} prefix */
function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * @param {string} dir
 * @param {string} torrc
 */
function verifyTorrc(dir, torrc) {
  const defaults = path.join(dir, 'empty-defaults');
  fs.writeFileSync(defaults, '');
  const r = spawnSync('tor', ['--defaults-torrc', defaults, '--verify-config', '-f', torrc], { encoding: 'utf8', timeout: 60000 });
  assert.notEqual(r.status, null, 'tor did not exit on its own');
  return r;
}

test('tor --verify-config accepts every generated torrc and creates no directories or keys', { skip: HAVE_TOR ? false : 'tor binary not found on PATH' }, () => {
  const dir = tmpDir('hkt-torverify-');
  try {
    const hs = path.join(dir, 'hs');
    /** @type {Array<[string, string]>} */
    const cases = [];

    const dedicated = generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: hs, target: 'host-listener', instance: { mode: 'dedicated', dataDirectory: path.join(dir, 'data') } });
    cases.push(['dedicated.torrc', text(dedicated.files, 'tor/torrc')]);

    const noPow = generateTorProfile({ hostConfig: onionHost({ listen: { kind: 'tcp', host: '::1', port: 8081 } }), hiddenServiceDir: hs, target: 'host-listener', powDefense: false, instance: { mode: 'dedicated', dataDirectory: path.join(dir, 'data') } });
    cases.push(['nopow.torrc', text(noPow.files, 'tor/torrc')]);

    const fragment = generateTorProfile({ hostConfig: onionHost({ listen: { kind: 'unix', path: path.join(dir, 'web.sock') } }), hiddenServiceDir: hs, target: 'host-listener', powDefense: { queueRate: 100, queueBurst: 1000 } });
    fs.writeFileSync(path.join(dir, 'fragment.conf'), text(fragment.files, 'tor/onion-service.torrc'));
    cases.push(['system-wrapper.torrc', `DataDirectory ${path.join(dir, 'data')}\nSocksPort 0\n%include ${path.join(dir, 'fragment.conf')}\n`]);

    // Container torrc: tor resolves "web" while parsing (hs_common.c -> tor_addr_port_lookup), so the name is
    // replaced by a literal here to avoid any DNS lookup; paths are moved into the temp dir.
    const container = generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: '/var/lib/tor/hidden_service', target: 'compose-service', instance: { mode: 'container' } });
    const ctr = text(container.files, 'tor/torrc').replaceAll('/var/lib/tor', path.join(dir, 'ctr')).replace(' web:8080', ' 127.0.0.1:8080');
    cases.push(['container.torrc', ctr]);

    for (const [name, body] of cases) {
      const file = path.join(dir, name);
      fs.writeFileSync(file, body);
      const r = verifyTorrc(dir, file);
      assert.equal(r.status, 0, `${name}: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout, /Configuration was valid/);
    }
    for (const p of ['hs', 'data', 'ctr']) assert.equal(fs.existsSync(path.join(dir, p)), false, `${p} was created by --verify-config`);

    // Control: tor really validates (burst < rate is rejected).
    const bad = path.join(dir, 'bad.torrc');
    fs.writeFileSync(bad, text(dedicated.files, 'tor/torrc').replace(/^HiddenServicePoWQueueBurst .*$/m, 'HiddenServicePoWQueueBurst 10'));
    const rb = verifyTorrc(dir, bad);
    assert.equal(rb.status, 1);
    assert.match(rb.stdout, /can not be smaller than the rate/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * @param {string} file
 * @param {RegExp} re
 * @param {number} ms
 */
async function waitFor(file, re, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fs.existsSync(file) && re.test(fs.readFileSync(file, 'utf8'))) return true;
    await sleep(200);
  }
  return false;
}

const I2PD_SKIP = !HAVE_I2PD ? 'i2pd binary not found on PATH'
  : !HAVE_NETNS ? 'cannot create a network namespace (unshare -n); refusing to start i2pd with network access'
    : false;

test('i2pd parses the generated tunnel file (no-network namespace, temp datadir, killed immediately)', { skip: I2PD_SKIP, timeout: 60000 }, async () => {
  const dir = tmpDir('hkt-i2pd-');
  try {
    const data = path.join(dir, 'data');
    const tunnels = path.join(dir, 'tunnels.d');
    fs.mkdirSync(data);
    fs.mkdirSync(tunnels);
    const r = generateI2pProfile({ hostConfig: i2pHost(), router: 'i2pd', tunnelName: 'ghostpay-site', target: 'host-listener', keysFile: 'ghostpay-site.dat' });
    fs.writeFileSync(path.join(tunnels, 'ghostpay-site.conf'), text(r.files, 'i2p/i2pd/tunnels.d/ghostpay-site.conf'));
    // Control: a section missing its mandatory port must be reported by i2pd.
    fs.writeFileSync(path.join(tunnels, 'broken.conf'), '[broken]\ntype = http\nhost = 127.0.0.1\nkeys = broken.dat\n');
    fs.writeFileSync(path.join(dir, 'i2pd.conf'), '');
    fs.writeFileSync(path.join(dir, 'tunnels.conf'), '');
    const log = path.join(dir, 'i2pd.log');
    const args = ['-n', 'i2pd', `--datadir=${data}`, `--conf=${path.join(dir, 'i2pd.conf')}`, `--tunconf=${path.join(dir, 'tunnels.conf')}`,
      `--tunnelsdir=${tunnels}`, `--pidfile=${path.join(dir, 'i2pd.pid')}`, '--log=file', `--logfile=${log}`, '--loglevel=debug',
      '--http.enabled=false', '--httpproxy.enabled=false', '--socksproxy.enabled=false', '--sam.enabled=false', '--i2cp.enabled=false',
      '--i2pcontrol.enabled=false', '--bob.enabled=false', '--upnp.enabled=false', '--nettime.enabled=false'];
    const child = spawn('unshare', args, { stdio: 'ignore' }); // unshare execs i2pd: same pid
    const exited = new Promise((resolve) => child.on('exit', resolve));
    let ok = false;
    try {
      ok = await waitFor(log, /I2P server tunnels created/, 20000);
    } finally {
      child.kill('SIGKILL');
      await exited;
    }
    assert.ok(ok, 'i2pd did not report tunnel creation in time');
    const out = fs.readFileSync(log, 'utf8');
    assert.match(out, /Tunnels extra config file: .*ghostpay-site\.conf/);
    assert.match(out, /1 I2P server tunnels created/);
    assert.match(out, /Disabling loopback address mapping/); // enableuniquelocal = false honoured
    assert.doesNotMatch(out, /Can't read tunnel ghostpay-site/);
    assert.match(out, /Can't read tunnel broken params/);
    // keys resolve inside the (temp) datadir: router-relative, as documented
    assert.ok(fs.existsSync(path.join(data, 'ghostpay-site.dat')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('docker compose config accepts the tor sidecar override (never up/build/pull)', { skip: HAVE_COMPOSE ? false : 'docker compose not available', timeout: 90000 }, () => {
  const dir = tmpDir('hkt-compose-');
  try {
    const r = generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: '/var/lib/tor/hidden_service', target: 'compose-service', instance: { mode: 'container' } });
    for (const f of r.files) {
      fs.mkdirSync(path.dirname(path.join(dir, f.name)), { recursive: true });
      fs.writeFileSync(path.join(dir, f.name), f.data);
    }
    // Stand-in for the container profile's compose file (owned by another module): web on internal site_internal.
    fs.writeFileSync(path.join(dir, 'compose.yml'), [
      'name: hkt-standin',
      'services:',
      '  web:',
      '    image: nginxinc/nginx-unprivileged:1.27-alpine',
      '    networks: [site_internal]',
      'networks:',
      '  site_internal:',
      '    internal: true',
      '',
    ].join('\n'));
    const out = spawnSync('docker', ['compose', '-f', 'compose.yml', '-f', 'tor/compose.tor.yml', 'config', '--format', 'json'], { cwd: dir, encoding: 'utf8', timeout: 60000 });
    assert.equal(out.status, 0, out.stderr);
    const cfg = JSON.parse(out.stdout);
    const tor = cfg.services.tor;
    assert.deepEqual(Object.keys(tor.networks).sort(), ['site_internal', 'tor_egress']);
    assert.equal(tor.ports, undefined);
    assert.equal(tor.read_only, true);
    assert.deepEqual(tor.cap_drop, ['ALL']);
    assert.equal(tor.build.context, path.join(dir, 'tor'));
    assert.match(tor.build.args.BASE_IMAGE, /@sha256:[a-f0-9]{64}$/);
    const bind = tor.volumes.find((/** @type {{ type: string }} */ v) => v.type === 'bind');
    assert.equal(bind.source, path.join(dir, 'tor', 'torrc'));
    assert.equal(bind.read_only, true);
    assert.equal(cfg.networks.site_internal.internal, true);
    assert.notEqual(cfg.networks.tor_egress.internal, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Java I2P runtime validation', { skip: 'Java I2P is not installed in this environment and has no non-activating config check; the i2ptunnel.config.d format is validated against the official spec and i2p.i2p source only (see i2p.test.mjs)' }, () => {});
