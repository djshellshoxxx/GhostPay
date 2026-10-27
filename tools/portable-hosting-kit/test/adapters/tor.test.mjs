// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateTorProfile, DEFAULT_TOR_BASE_IMAGE } from '../../src/adapters/tor.mjs';
import { onionHost, text, directives, throwsCode } from './fixtures.mjs';

const HS = '/var/lib/tor/ghostpay';

test('system mode: fragment with v3 service, loopback target and DoS defenses', () => {
  const r = generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: HS, target: 'host-listener' });
  assert.deepEqual(r.files.map((f) => f.name), ['tor/onion-service.torrc', 'tor/README-TOR.md']);
  assert.deepEqual(r.warnings, []);
  const d = directives(text(r.files, 'tor/onion-service.torrc'));
  assert.deepEqual(d, [
    `HiddenServiceDir ${HS}`,
    'HiddenServiceVersion 3',
    'HiddenServicePort 80 127.0.0.1:8080',
    'HiddenServiceEnableIntroDoSDefense 1',
    'HiddenServiceEnableIntroDoSRatePerSec 25',
    'HiddenServiceEnableIntroDoSBurstPerSec 200',
    'HiddenServicePoWDefensesEnabled 1',
    'HiddenServicePoWQueueRate 250',
    'HiddenServicePoWQueueBurst 2500',
    'HiddenServiceMaxStreams 32',
    'HiddenServiceMaxStreamsCloseCircuit 1',
  ]);
});

test('no profile ever enables single-hop / non-anonymous mode or a client/control port', () => {
  for (const instance of [{ mode: 'system' }, { mode: 'dedicated', dataDirectory: '/srv/tor' }, { mode: 'container' }]) {
    const container = instance.mode === 'container';
    const r = generateTorProfile({
      hostConfig: onionHost(),
      hiddenServiceDir: container ? '/var/lib/tor/hs' : HS,
      target: container ? 'compose-service' : 'host-listener',
      instance: /** @type {any} */ (instance),
    });
    for (const f of r.files.filter((x) => x.name.endsWith('torrc'))) {
      const d = directives(new TextDecoder().decode(f.data)).join('\n');
      assert.doesNotMatch(d, /SingleHopMode|NonAnonymousMode/);
      assert.doesNotMatch(d, /^(SocksPort|ControlPort|MetricsPort|ORPort|DNSPort|TransPort) [1-9]/m);
    }
  }
});

test('ipv6 loopback and unix-socket listeners map to tor target syntax', () => {
  let r = generateTorProfile({ hostConfig: onionHost({ listen: { kind: 'tcp', host: '::1', port: 8081 } }), hiddenServiceDir: HS, target: 'host-listener', virtualPort: 8000 });
  assert.match(text(r.files, 'tor/onion-service.torrc'), /^HiddenServicePort 8000 \[::1\]:8081$/m);
  r = generateTorProfile({ hostConfig: onionHost({ listen: { kind: 'unix', path: '/run/ghostpay/web.sock' } }), hiddenServiceDir: HS, target: 'host-listener' });
  assert.match(text(r.files, 'tor/onion-service.torrc'), /^HiddenServicePort 80 unix:\/run\/ghostpay\/web\.sock$/m);
});

test('dedicated mode: complete torrc with SocksPort 0, ControlPort 0 and its own DataDirectory', () => {
  const r = generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: '/srv/onion/hs', target: 'host-listener', instance: { mode: 'dedicated', dataDirectory: '/srv/onion/data' } });
  const d = directives(text(r.files, 'tor/torrc'));
  assert.deepEqual(d.slice(0, 6), ['DataDirectory /srv/onion/data', 'SocksPort 0', 'ControlPort 0', 'RunAsDaemon 0', 'Log notice stderr', 'SafeLogging 1']);
  assert.ok(d.includes('HiddenServiceDir /srv/onion/hs'));
});

test('container mode: web:8080 target, digest-pinned Dockerfile, compose override on site_internal + egress', () => {
  const r = generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: '/var/lib/tor/hidden_service', target: 'compose-service', instance: { mode: 'container' } });
  assert.deepEqual(r.files.map((f) => f.name), ['tor/torrc', 'tor/Dockerfile', 'tor/compose.tor.yml', 'tor/README-TOR.md']);
  const torrc = text(r.files, 'tor/torrc');
  assert.match(torrc, /^HiddenServicePort 80 web:8080$/m);
  assert.match(torrc, /^DataDirectory \/var\/lib\/tor$/m);
  const dockerfile = text(r.files, 'tor/Dockerfile');
  assert.ok(dockerfile.includes(`ARG BASE_IMAGE=${DEFAULT_TOR_BASE_IMAGE}`));
  assert.match(DEFAULT_TOR_BASE_IMAGE, /@sha256:[a-f0-9]{64}$/);
  const compose = text(r.files, 'tor/compose.tor.yml');
  assert.match(compose, /networks: \[site_internal, tor_egress\]/);
  assert.match(compose, /- \.\/tor\/torrc:\/etc\/tor\/torrc:ro/);
  assert.doesNotMatch(compose, /^\s+ports:/m);
});

test('container mode accepts an operator digest and refuses an unpinned image', () => {
  const baseImage = `debian:trixie-slim@sha256:${'0'.repeat(64)}`;
  const r = generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: '/var/lib/tor/hs', target: 'compose-service', instance: { mode: 'container', baseImage } });
  assert.match(text(r.files, 'tor/Dockerfile'), new RegExp(`ARG BASE_IMAGE=${baseImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  for (const bad of ['debian:trixie-slim', 'debian@sha256:abc', `debian:x@sha256:${'A'.repeat(64)}`]) {
    throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: '/var/lib/tor/hs', target: 'compose-service', instance: { mode: 'container', baseImage: bad } }), 'E_USAGE', /digest/);
  }
});

test('powDefense: disable (with warning), custom rates, and tor\'s burst >= rate rule', () => {
  let r = generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: HS, target: 'host-listener', powDefense: false });
  assert.match(text(r.files, 'tor/onion-service.torrc'), /^HiddenServicePoWDefensesEnabled 0$/m);
  assert.equal(r.warnings.length, 1);
  r = generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: HS, target: 'host-listener', powDefense: { queueRate: 100, queueBurst: 400 } });
  const t = text(r.files, 'tor/onion-service.torrc');
  assert.match(t, /^HiddenServicePoWQueueRate 100$/m);
  assert.match(t, /^HiddenServicePoWQueueBurst 400$/m);
  throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: HS, target: 'host-listener', powDefense: { queueRate: 300, queueBurst: 10 } }), 'E_USAGE', /queueBurst/);
  throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: HS, target: 'host-listener', powDefense: { queueRate: 0 } }), 'E_USAGE');
  throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: HS, target: 'host-listener', powDefense: /** @type {any} */ ('yes') }), 'E_USAGE');
});

test('wrong transport and malformed host configs are refused', () => {
  throwsCode(() => generateTorProfile({ hostConfig: onionHost({ transport: 'i2p' }), hiddenServiceDir: HS, target: 'host-listener' }), 'E_CONFIG', /transport/);
  throwsCode(() => generateTorProfile({ hostConfig: onionHost({ transport: 'clearnet' }), hiddenServiceDir: HS, target: 'host-listener' }), 'E_CONFIG');
  throwsCode(() => generateTorProfile({ hostConfig: onionHost({ publicOrigin: 'https://example.org' }), hiddenServiceDir: HS, target: 'host-listener' }), 'E_CONFIG');
  throwsCode(() => generateTorProfile({ hostConfig: onionHost({ listen: { kind: 'tcp', host: '0.0.0.0', port: 8080 } }), hiddenServiceDir: HS, target: 'host-listener' }), 'E_NETWORK_SCOPE');
  throwsCode(() => generateTorProfile({ hostConfig: onionHost({ mirrorLabel: 'evil\nHiddenServiceSingleHopMode 1' }), hiddenServiceDir: HS, target: 'host-listener' }), 'E_CONFIG');
  throwsCode(() => generateTorProfile(/** @type {any} */ ({ hiddenServiceDir: HS, target: 'host-listener' })), 'E_USAGE');
  const ok = generateTorProfile({ hostConfig: onionHost({ publicOrigin: `http://${'a'.repeat(56)}.onion` }), hiddenServiceDir: HS, target: 'host-listener' });
  assert.match(text(ok.files, 'tor/README-TOR.md'), /aaaa\.onion|a{56}\.onion/);
});

test('HiddenServiceDir must be absolute, normalized and injection-free', () => {
  for (const bad of ['var/lib/tor/hs', '/var/lib/tor/../hs', '/var/lib//tor', '/', '/var/lib/tor/my hs', '/var/lib/tor/hs\nSocksPort 9050', '/var/lib/tor/"hs"', '', '/var/./lib']) {
    throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: bad, target: 'host-listener' }), 'E_PATH');
  }
  throwsCode(() => generateTorProfile({ hostConfig: onionHost({ listen: { kind: 'unix', path: 'relative.sock' } }), hiddenServiceDir: HS, target: 'host-listener' }), 'E_PATH');
  const r = generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: `${HS}/`, target: 'host-listener' });
  assert.match(text(r.files, 'tor/onion-service.torrc'), new RegExp(`^HiddenServiceDir ${HS}$`, 'm'));
});

test('identity directories may not overlap site, export or archive roots', () => {
  const forbiddenRoots = ['/srv/site', '/srv/export/', '/srv/archive'];
  for (const bad of ['/srv/site/onion', '/srv/export', '/srv/archive/a/b', '/srv']) {
    throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: bad, target: 'host-listener', forbiddenRoots }), 'E_PATH', /forbidden root/);
  }
  assert.ok(generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: '/srv/site-onion', target: 'host-listener', forbiddenRoots }));
  throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: '/srv/onion/hs', target: 'host-listener', forbiddenRoots, instance: { mode: 'dedicated', dataDirectory: '/srv/export/tor' } }), 'E_PATH', /dataDirectory/);
  throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: HS, target: 'host-listener', forbiddenRoots: ['relative/site'] }), 'E_USAGE');
  throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: HS, target: 'host-listener', forbiddenRoots: /** @type {any} */ ('/srv/site') }), 'E_USAGE');
  throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: '/srv/onion', target: 'host-listener', instance: { mode: 'dedicated', dataDirectory: '/srv/onion' } }), 'E_PATH');
});

test('Tor management ports are refused as targets; other stacks\' ports only warn', () => {
  for (const port of [9050, 9051, 9150, 9151]) {
    throwsCode(() => generateTorProfile({ hostConfig: onionHost({ listen: { kind: 'tcp', host: '127.0.0.1', port } }), hiddenServiceDir: HS, target: 'host-listener' }), 'E_UNSUPPORTED', /management port/);
  }
  const r = generateTorProfile({ hostConfig: onionHost({ listen: { kind: 'tcp', host: '127.0.0.1', port: 7657 } }), hiddenServiceDir: HS, target: 'host-listener' });
  assert.match(r.warnings.join('\n'), /7657.*Java I2P router console/);
  throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: HS, target: 'host-listener', virtualPort: 0 }), 'E_USAGE');
  throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: HS, target: 'host-listener', virtualPort: 70000 }), 'E_USAGE');
});

test('network-namespace topology rules', () => {
  throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: HS, target: 'compose-service' }), 'E_UNSUPPORTED', /host loopback/);
  throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: HS, target: 'compose-service', instance: { mode: 'dedicated', dataDirectory: '/srv/t' } }), 'E_UNSUPPORTED');
  throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: '/var/lib/tor/hs', target: 'host-listener', instance: { mode: 'container' } }), 'E_UNSUPPORTED', /127\.0\.0\.1 inside the tor container/);
  throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: '/srv/hs', target: 'compose-service', instance: { mode: 'container' } }), 'E_PATH', /tor-data/);
  throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: HS, target: /** @type {any} */ ('web') }), 'E_USAGE');
  throwsCode(() => generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: HS, target: 'host-listener', instance: /** @type {any} */ ({ mode: 'bridge' }) }), 'E_USAGE');
});

test('system mode warns when HiddenServiceDir is outside the AppArmor-allowed /var/lib/tor', () => {
  const r = generateTorProfile({ hostConfig: onionHost(), hiddenServiceDir: '/srv/onion/hs', target: 'host-listener' });
  assert.match(r.warnings.join('\n'), /AppArmor/);
});

test('generator is deterministic and pure (creates nothing on disk)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hkt-pure-'));
  try {
    const hs = path.join(tmp, 'not-created', 'hs');
    const opts = { hostConfig: onionHost(), hiddenServiceDir: hs, target: /** @type {const} */ ('host-listener'), instance: /** @type {const} */ ({ mode: 'dedicated', dataDirectory: path.join(tmp, 'data') }) };
    const a = generateTorProfile(opts);
    const b = generateTorProfile(opts);
    assert.deepEqual(a, b);
    assert.deepEqual(fs.readdirSync(tmp), []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
