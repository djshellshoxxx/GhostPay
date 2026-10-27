// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateI2pProfile } from '../../src/adapters/i2p.mjs';
import { JAVA_STREAMING_LIMITS } from '../../src/adapters/i2p-java.mjs';
import { i2pHost, B32, text, directives, throwsCode } from './fixtures.mjs';

/** @typedef {Parameters<typeof generateI2pProfile>[0]} I2pOpts */

/**
 * @param {Partial<I2pOpts>} [over]
 * @returns {I2pOpts}
 */
function opts(over = {}) {
  return { hostConfig: i2pHost(), router: 'i2pd', tunnelName: 'ghostpay-site', target: 'host-listener', keysFile: 'ghostpay-site.dat', ...over };
}

/**
 * Minimal reader with the Java I2P properties rules from the configuration spec: UTF-8, no escapes, "#" starts a
 * comment anywhere, ";" only in column 1, "=" is the only separator, values are trimmed, lines without "=" ignored.
 * @param {string} t
 * @returns {Array<[string, string]>}
 */
function readI2pProps(t) {
  /** @type {Array<[string, string]>} */
  const out = [];
  for (const raw of t.split('\n')) {
    if (raw.startsWith(';')) continue;
    const hash = raw.indexOf('#');
    const line = hash >= 0 ? raw.slice(0, hash) : raw;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    out.push([line.slice(0, eq), line.slice(eq + 1).trim()]);
  }
  return out;
}

test('i2pd: http server tunnel section with inport 80, router-relative keys and privacy options', () => {
  const r = generateI2pProfile(opts());
  assert.deepEqual(r.files.map((f) => f.name), ['i2p/i2pd/tunnels.d/ghostpay-site.conf', 'i2p/README-I2P.md']);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(directives(text(r.files, 'i2p/i2pd/tunnels.d/ghostpay-site.conf')), [
    '[ghostpay-site]',
    'type = http',
    'host = 127.0.0.1',
    'port = 8080',
    'inport = 80',
    'keys = ghostpay-site.dat',
    'signaturetype = 7',
    'inbound.length = 3',
    'outbound.length = 3',
    'enableuniquelocal = false',
    'i2pheaders = false',
    `hostoverride = ${B32}`,
  ]);
});

test('i2pd: no inline comments (boost INI has none) and custom inport', () => {
  const r = generateI2pProfile(opts({ inport: 8000 }));
  const t = text(r.files, 'i2p/i2pd/tunnels.d/ghostpay-site.conf');
  for (const l of directives(t)) assert.doesNotMatch(l, /#|;/, l);
  assert.match(t, /^inport = 8000$/m);
});

test('i2pd: unknown public origin -> no hostoverride, with a warning', () => {
  const r = generateI2pProfile(opts({ hostConfig: i2pHost({ publicOrigin: null }) }));
  assert.doesNotMatch(text(r.files, 'i2p/i2pd/tunnels.d/ghostpay-site.conf'), /^hostoverride/m);
  assert.match(r.warnings.join('\n'), /publicOrigin not known/);
});

test('Java I2P: split-format i2ptunnel.config.d file without tunnel.N. prefixes', () => {
  const r = generateI2pProfile(opts({ router: 'java-i2p', keysFile: 'ghostpay-site-privKeys.dat' }));
  const name = 'i2p/java-i2p/i2ptunnel.config.d/90-ghostpay-site-i2ptunnel.config';
  assert.deepEqual(r.files.map((f) => f.name), [name, 'i2p/README-I2P.md']);
  const t = text(r.files, name);
  const props = readI2pProps(t);
  assert.ok(props.length > 0);
  for (const [k] of props) assert.ok(!k.startsWith('tunnel.'), `prefixed key ${k}`);
  const map = new Map(props);
  assert.equal(map.size, props.length, 'duplicate keys');
  assert.equal(map.get('type'), 'httpserver');
  assert.equal(map.get('name'), 'ghostpay-site');
  assert.equal(map.get('targetHost'), '127.0.0.1');
  assert.equal(map.get('targetPort'), '8080');
  assert.equal(map.get('privKeyFile'), 'ghostpay-site-privKeys.dat');
  assert.equal(map.get('spoofedHost'), B32);
  assert.equal(map.get('startOnLoad'), 'false');
  assert.equal(map.get('option.enableUniqueLocal'), 'false');
  assert.equal(map.get('option.rejectInproxy'), 'true');
  assert.equal(map.get('option.inbound.length'), '3');
  for (const [k, v] of Object.entries(JAVA_STREAMING_LIMITS)) assert.equal(map.get(`option.${k}`), String(v));
  // every non-comment line is exactly key=value with nothing the reader would strip
  for (const l of directives(t)) assert.match(l, /^[A-Za-z][A-Za-z0-9.]*=[^#]*$/, l);
});

test('Java I2P: "#" in the mirror label cannot truncate or inject properties', () => {
  const r = generateI2pProfile(opts({ router: 'java-i2p', hostConfig: i2pHost({ mirrorLabel: 'Mirror #1 =x' }) }));
  const map = new Map(readI2pProps(text(r.files, 'i2p/java-i2p/i2ptunnel.config.d/90-ghostpay-site-i2ptunnel.config')));
  assert.equal(map.get('description'), 'Mirror 1 x');
  const w = generateI2pProfile(opts({ router: 'java-i2p', inport: 81 })).warnings;
  assert.match(w.join('\n'), /inport is ignored for Java I2P/);
});

test('i2pd and Java I2P outputs differ in format (not renamed strings)', () => {
  const a = text(generateI2pProfile(opts()).files, 'i2p/i2pd/tunnels.d/ghostpay-site.conf');
  const b = text(generateI2pProfile(opts({ router: 'java-i2p' })).files, 'i2p/java-i2p/i2ptunnel.config.d/90-ghostpay-site-i2ptunnel.config');
  assert.match(a, /^\[ghostpay-site\]$/m);
  assert.doesNotMatch(b, /^\[/m);
  assert.match(b, /^targetHost=/m);
  assert.doesNotMatch(a, /targetHost|spoofedHost|privKeyFile/);
  assert.doesNotMatch(b, /^(host|keys|hostoverride|inport) ?=/m);
});

test('unix-socket listeners are unsupported by both routers', () => {
  for (const router of /** @type {const} */ (['i2pd', 'java-i2p'])) {
    throwsCode(() => generateI2pProfile(opts({ router, hostConfig: i2pHost({ listen: { kind: 'unix', path: '/run/ghostpay/web.sock' } }) })), 'E_UNSUPPORTED', /TCP host:port/);
  }
});

test('management ports of the selected router are refused; others warn; 7658 (Java eepsite) is allowed', () => {
  /** @param {number} port */
  const host = (port) => i2pHost({ listen: { kind: 'tcp', host: '127.0.0.1', port } });
  for (const port of [7070, 4444, 4447, 7656, 7654, 7650, 2827]) {
    throwsCode(() => generateI2pProfile(opts({ hostConfig: host(port) })), 'E_UNSUPPORTED', /management port/);
  }
  for (const port of [7657, 7667, 4444, 4445, 7654, 7656, 7650]) {
    throwsCode(() => generateI2pProfile(opts({ router: 'java-i2p', hostConfig: host(port) })), 'E_UNSUPPORTED', /management port/);
  }
  assert.match(generateI2pProfile(opts({ router: 'java-i2p', hostConfig: host(7070) })).warnings.join('\n'), /i2pd web console/);
  assert.match(generateI2pProfile(opts({ hostConfig: host(7657) })).warnings.join('\n'), /router console/);
  assert.match(generateI2pProfile(opts({ hostConfig: host(9051) })).warnings.join('\n'), /ControlPort/);
  assert.deepEqual(generateI2pProfile(opts({ router: 'java-i2p', hostConfig: host(7658) })).warnings, []);
});

test('key files are router-relative, safe and persistent', () => {
  for (const bad of ['/var/lib/i2pd/site.dat', '../site.dat', 'keys/../site.dat', './site.dat', 'site.key', 'transient-site.dat', 'keys\\site.dat', 'my site.dat', '', 'a//b.dat']) {
    throwsCode(() => generateI2pProfile(opts({ keysFile: bad })), 'E_PATH');
  }
  const r = generateI2pProfile(opts({ keysFile: 'keys/ghostpay.dat' }));
  assert.match(text(r.files, 'i2p/i2pd/tunnels.d/ghostpay-site.conf'), /^keys = keys\/ghostpay\.dat$/m);
});

test('forbidden roots: router dir and resolved key path must stay outside', () => {
  const forbiddenRoots = ['/srv/site', '/var/lib/i2pd/export'];
  throwsCode(() => generateI2pProfile(opts({ forbiddenRoots, routerDataDir: '/srv/site/i2pd' })), 'E_PATH', /routerDataDir/);
  throwsCode(() => generateI2pProfile(opts({ forbiddenRoots, routerDataDir: '/var/lib/i2pd', keysFile: 'export/site.dat' })), 'E_PATH', /overlaps forbidden root \/var\/lib\/i2pd\/export/);
  throwsCode(() => generateI2pProfile(opts({ forbiddenRoots, routerDataDir: '/srv' })), 'E_PATH');
  assert.deepEqual(generateI2pProfile(opts({ forbiddenRoots: ['/srv/site'], routerDataDir: '/var/lib/i2pd' })).warnings, []);
  assert.match(generateI2pProfile(opts({ forbiddenRoots })).warnings.join('\n'), /routerDataDir not given/);
  throwsCode(() => generateI2pProfile(opts({ routerDataDir: 'relative/dir' })), 'E_PATH');
});

test('wrong transport, router, tunnel name and target are refused', () => {
  throwsCode(() => generateI2pProfile(opts({ hostConfig: i2pHost({ transport: 'onion' }) })), 'E_CONFIG', /transport/);
  throwsCode(() => generateI2pProfile(opts({ hostConfig: i2pHost({ publicOrigin: `http://${'a'.repeat(56)}.onion` }) })), 'E_CONFIG');
  throwsCode(() => generateI2pProfile(opts({ router: /** @type {any} */ ('kovri') })), 'E_USAGE');
  for (const bad of ['', '-x', 'a b', 'x]\n[evil', 'a'.repeat(65), '../x']) {
    throwsCode(() => generateI2pProfile(opts({ tunnelName: bad })), 'E_USAGE');
  }
  throwsCode(() => generateI2pProfile(opts({ target: /** @type {any} */ ('localhost') })), 'E_USAGE');
  throwsCode(() => generateI2pProfile(opts({ inport: 0 })), 'E_USAGE');
  throwsCode(() => generateI2pProfile(opts({ hostConfig: i2pHost({ listen: { kind: 'tcp', host: '192.168.1.5', port: 8080 } }) })), 'E_NETWORK_SCOPE');
});

test('compose-service target points at web:8080 and warns that the router must share the network', () => {
  for (const router of /** @type {const} */ (['i2pd', 'java-i2p'])) {
    const r = generateI2pProfile(opts({ router, target: 'compose-service' }));
    const t = new TextDecoder().decode(/** @type {Uint8Array} */ (r.files[0]?.data));
    assert.match(t, router === 'i2pd' ? /^host = web\nport = 8080$/m : /^targetHost=web\ntargetPort=8080$/m);
    assert.match(r.warnings.join('\n'), /compose network/);
  }
});

test('deterministic output', () => {
  assert.deepEqual(generateI2pProfile(opts()), generateI2pProfile(opts()));
  assert.deepEqual(generateI2pProfile(opts({ router: 'java-i2p' })), generateI2pProfile(opts({ router: 'java-i2p' })));
});

test('review fix: router identity/state files cannot be used as tunnel keys', () => {
  for (const router of /** @type {const} */ (['i2pd', 'java-i2p'])) {
    for (const bad of ['router.keys.dat', 'router.info', 'router.keys', 'ntcp2.keys', 'ssu2.keys', 'sub/router.keys.dat']) {
      throwsCode(() => generateI2pProfile(opts({ router, keysFile: bad })), 'E_PATH', /router/);
    }
  }
  assert.ok(generateI2pProfile(opts({ keysFile: 'router-site.dat' })));
});

test('review fix: characters special in .properties / INI never reach a generated value or comment', () => {
  for (const label of ['demo \\', 'a\\nb', 'x=y:z', '[evil]', ';semi', '!bang', 'q"uote\'s', 'a#b']) {
    for (const router of /** @type {const} */ (['i2pd', 'java-i2p'])) {
      const r = generateI2pProfile(opts({ router, hostConfig: i2pHost({ mirrorLabel: label }) }));
      const t = new TextDecoder().decode(/** @type {Uint8Array} */ (r.files[0]?.data));
      assert.doesNotMatch(t, /\\/, `${router} ${label}`);
      for (const line of t.split('\n')) {
        // only the structural characters the renderer itself emits may appear
        const body = line.startsWith('#') ? line.slice(1) : line;
        assert.doesNotMatch(body, /[\\\t"'!;#]/, `${router} ${JSON.stringify(label)}: ${line}`);
      }
      const props = router === 'java-i2p' ? readI2pProps(t) : [];
      if (router === 'java-i2p') {
        const map = new Map(props);
        assert.equal(map.get('type'), 'httpserver');
        assert.match(/** @type {string} */ (map.get('description')), /^[A-Za-z0-9 ._,()/-]*$/);
      } else {
        assert.match(t, /^type = http$/m);
      }
    }
  }
  // a raw object with a control character or a non-ASCII label is still refused at the boundary
  for (const bad of ['a\nb', 'tab\there', 'caf\u00e9']) throwsCode(() => generateI2pProfile(opts({ hostConfig: i2pHost({ mirrorLabel: bad }) })), 'E_CONFIG');
});
