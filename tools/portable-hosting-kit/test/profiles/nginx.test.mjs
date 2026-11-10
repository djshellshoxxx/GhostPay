// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as path from 'node:path';
import { KitError } from '../../src/errors.mjs';
import { KIT_DEFAULT_HEADERS_FILE, MIME_TYPES, UTF8_MIME_TYPES } from '../../src/policy.mjs';
import { parseHeadersFile } from '../../src/serve/headers.mjs';
import { exportStatic } from '../../src/profiles/static-export.mjs';
import { generateNginx, nginxListen } from '../../src/profiles/nginx.mjs';
import { GHOSTPAY_HEADERS_PATH, buildRequest, freePort, nginxAvailable, nginxTest, rawRequest, startNginx, tempDir, writeOutFiles, writeTree } from '../serve/helpers.mjs';

/** Escape every RegExp metacharacter, backslash included. @param {string} s */
const escapeRegExp = (s) => s.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');

/** @typedef {import('../../src/types.mjs').HostConfig} HostConfig */
/** @typedef {import('../../src/types.mjs').HeaderPolicy} HeaderPolicy */

const NGINX_SKIP = (await nginxAvailable()) ? false : 'nginx binary absent';
/** @type {HeaderPolicy} */
const POLICY = { rules: parseHeadersFile(KIT_DEFAULT_HEADERS_FILE), source: 'kit-default' };
const FILES = ['index.html', 'about/index.html', 'a.js', 'LICENSE'];

/**
 * @param {Partial<HostConfig>} [over]
 * @returns {HostConfig}
 */
function hc(over = {}) {
  return { schemaVersion: 1, transport: 'clearnet', publicOrigin: 'https://example.org', basePath: '/', listen: { kind: 'tcp', host: '127.0.0.1', port: 8080 }, mirrorLabel: 'x', onionLocation: null, ...over };
}

/**
 * @param {Partial<HostConfig>} [over]
 * @param {{ files?: string[], policy?: HeaderPolicy, wwwRoot?: string, entrypoint?: string }} [opts]
 */
function gen(over = {}, { files = FILES, policy = POLICY, wwwRoot = '/srv/www', entrypoint = 'index.html' } = {}) {
  const out = generateNginx({ files, entrypoint, hostConfig: hc(over), policy, wwwRoot });
  /** @param {string} n */
  const text = (n) => new TextDecoder().decode(/** @type {{ data: Uint8Array }} */ (out.files.find((f) => f.name === n)).data);
  return { out, main: text('nginx.conf'), http: text('hk-http.conf'), server: text('hk-server.conf') };
}

/**
 * @param {unknown} e
 * @param {string} code
 */
const isKit = (e, code) => e instanceof KitError && e.code === code;

test('listeners: loopback TCP and unix sockets only', () => {
  assert.equal(nginxListen({ kind: 'tcp', host: '127.0.0.1', port: 8080 }), 'listen 127.0.0.1:8080 default_server;');
  assert.equal(nginxListen({ kind: 'tcp', host: '::1', port: 8080 }), 'listen [::1]:8080 default_server;');
  assert.equal(nginxListen({ kind: 'unix', path: '/run/site/web.sock' }), 'listen unix:/run/site/web.sock default_server;');
  for (const host of ['0.0.0.0', '::', '192.168.0.2', 'localhost', '127.0.0.1 ', '[::1]']) {
    assert.throws(() => gen({ listen: { kind: 'tcp', host, port: 8080 } }), (e) => isKit(e, 'E_NETWORK_SCOPE'), host);
  }
  assert.throws(() => gen({ listen: { kind: 'tcp', host: '127.0.0.1', port: 0 } }), (e) => isKit(e, 'E_NETWORK_SCOPE'));
  assert.throws(() => gen({ listen: { kind: 'unix', path: 'web.sock' } }), (e) => isKit(e, 'E_NETWORK_SCOPE'));
  assert.throws(() => gen({ listen: /** @type {any} */ ({ kind: 'udp', host: '127.0.0.1', port: 1 }) }), (e) => isKit(e, 'E_NETWORK_SCOPE'));
});

test('refuses weak headers, uninterpolatable values and bad roots', () => {
  const weak = { rules: parseHeadersFile('/*\n  Referrer-Policy: no-referrer\n'), source: /** @type {const} */ ('site') };
  assert.throws(() => gen({}, { policy: weak }), (e) => isKit(e, 'E_HEADERS'));
  const dollar = { rules: parseHeadersFile(`${KIT_DEFAULT_HEADERS_FILE}/a.js\n  X-Price: $5\n`), source: /** @type {const} */ ('site') };
  assert.throws(() => gen({}, { policy: dollar }), (e) => isKit(e, 'E_UNSUPPORTED'));
  assert.throws(() => gen({}, { files: [...FILES, 'a$b/index.html'] }), (e) => isKit(e, 'E_UNSUPPORTED'));
  assert.throws(() => gen({}, { wwwRoot: 'relative/www' }), (e) => isKit(e, 'E_USAGE'));
  assert.throws(() => gen({}, { wwwRoot: '/srv/$x' }), (e) => isKit(e, 'E_UNSUPPORTED'));
  assert.match(gen({}, { wwwRoot: '/srv/a "b"\\c' }).main, /root "\/srv\/a \\"b\\"\\\\c";/, 'quotes and backslashes are escaped');
  assert.throws(() => gen({ basePath: 'nope' }), (e) => isKit(e, 'E_CONFIG'));
  assert.throws(() => gen({ onionLocation: 'http://example.org' }), (e) => isKit(e, 'E_CONFIG'));
});

test('structure: headers only at server level with "always"; no add_header inside any block', () => {
  const { server, http: h, main } = gen({ basePath: '/m/' });
  let depth = 0;
  for (const line of server.split('\n')) {
    const code = line.replace(/#.*$/, '');
    if (/^\s*add_header\b/.test(code)) {
      assert.equal(depth, 0, `add_header inside a block: ${line}`);
      assert.match(code, /\balways;\s*$/, line);
    }
    depth += (code.match(/\{/g) ?? []).length - (code.match(/\}/g) ?? []).length;
  }
  assert.equal(depth, 0);
  for (const name of ['Content-Security-Policy', 'Referrer-Policy', 'X-Content-Type-Options', 'Cache-Control', 'Strict-Transport-Security', 'Allow']) {
    assert.match(server, new RegExp(`^add_header ${name} `, 'm'));
  }
  assert.ok(!/add_header/.test(h) && !/add_header/.test(main));
  // MIME: exactly the policy table, utf-8 for the text types, and a default that cannot be sniffed into HTML.
  for (const [ext, type] of Object.entries(MIME_TYPES)) assert.match(h, new RegExp(`^ {2}${escapeRegExp(type)} [^;]*\\b${escapeRegExp(ext)}\\b`, 'm'), ext);
  assert.match(h, /^default_type text\/plain;$/m);
  assert.match(h, /^charset utf-8;$/m);
  const charsetTypes = /^charset_types (.*);$/m.exec(h)?.[1]?.split(' ') ?? [];
  assert.deepEqual([...charsetTypes, 'text/html'].sort(), [...UTF8_MIME_TYPES].sort());
  // Unprivileged operation, privacy and limits.
  assert.ok(!/^\s*user\s/m.test(main), 'no user directive');
  assert.match(main, /^pid "nginx.pid";$/m);
  assert.match(main, /^error_log stderr error;$/m);
  assert.match(main, /client_body_temp_path "client_body_temp";/);
  for (const d of ['access_log off;', 'server_tokens off;', 'log_not_found off;', 'autoindex off;', 'disable_symlinks on;', 'client_max_body_size 64k;', 'client_header_timeout 10s;']) {
    assert.ok(h.includes(d), d);
  }
  assert.match(main, /listen 127\.0\.0\.1:8080 default_server;/);
  assert.match(main, /root "\/srv\/www";/);
});

test('nginx -t accepts generated configs (root, subpath, IPv6, unix socket, GhostPay _headers)', { skip: NGINX_SKIP }, async () => {
  const ghostpay = { rules: parseHeadersFile(await fs.readFile(GHOSTPAY_HEADERS_PATH, 'utf8')), source: /** @type {const} */ ('site') };
  const dir = await tempDir('ngt');
  try {
    const variants = [
      gen({}), gen({ basePath: '/mirror/app/' }), gen({ listen: { kind: 'tcp', host: '::1', port: 8443 } }),
      gen({ listen: { kind: 'unix', path: path.join(dir, 'web.sock') }, transport: 'onion', publicOrigin: null }),
      gen({ onionLocation: `http://${'a'.repeat(56)}.onion` }, { policy: ghostpay, files: [...FILES, '_headers', 'assets/x-1.js', 'deployments/1.json'] }),
    ];
    for (const [i, v] of variants.entries()) {
      const confDir = path.join(dir, `v${i}`);
      await writeOutFiles(confDir, v.out.files);
      const r = nginxTest(path.join(confDir, 'nginx.conf'), dir);
      // nginx -t also opens listening sockets; a host without IPv6 fails that step after the syntax check.
      const noIpv6 = /syntax is ok/.test(r.output) && /\[::1\]:\d+ failed \(97: Address family not supported/.test(r.output);
      assert.ok(r.ok || noIpv6, `variant ${i}: ${r.output}`);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

/**
 * Export a tiny site and write a config. Directories are world-readable so an unprivileged nginx can read them.
 * @param {Partial<HostConfig>} over
 */
async function deploy(over) {
  const root = await tempDir('ngd');
  await fs.chmod(root, 0o755);
  const siteDir = path.join(root, 'site');
  await writeTree(siteDir, { 'index.html': '<p>home</p>', 'about/index.html': '<p>about</p>', 'a.js': 'a', LICENSE: 'MIT' });
  const { wwwRoot } = await exportStatic({ siteDir, files: FILES, entrypoint: 'index.html', hostConfig: hc(over), policy: POLICY, outDir: path.join(root, 'out') });
  const confDir = path.join(root, 'conf');
  await writeOutFiles(confDir, generateNginx({ files: FILES, entrypoint: 'index.html', hostConfig: hc(over), policy: POLICY, wwwRoot }).files);
  const runDir = path.join(root, 'run');
  await fs.mkdir(runDir, { mode: 0o755 });
  await fs.chmod(path.join(root, 'out'), 0o755);
  return { root, conf: path.join(confDir, 'nginx.conf'), runDir };
}

test('runs fully unprivileged (as nobody) from a writable runtime directory', {
  skip: NGINX_SKIP || (process.getuid?.() !== 0 ? 'needs root to switch to an unprivileged user' : false),
}, async () => {
  const port = await freePort();
  const { root, conf, runDir } = await deploy({ listen: { kind: 'tcp', host: '127.0.0.1', port } });
  try {
    await fs.chown(runDir, 65534, 65534);
    const n = await startNginx({ confFile: conf, prefixDir: runDir, port, wrap: ['setpriv', '--reuid=65534', '--regid=65534', '--clear-groups'] });
    try {
      const r = await rawRequest({ port }, buildRequest('GET', '/deep/link'));
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(r.headers.get('strict-transport-security'), 'max-age=63072000; includeSubDomains');
      const pid = Number((await fs.readFile(path.join(runDir, 'nginx.pid'), 'utf8')).trim());
      const status = await fs.readFile(`/proc/${pid}/status`, 'utf8');
      assert.match(status, /^Uid:\s+65534\b/m, 'master runs as nobody');
    } finally {
      await n.stop();
    }
    assert.deepEqual((await fs.readdir(runDir)).filter((f) => /log/.test(f)), [], 'no log files written');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('serves over a unix socket listener', { skip: NGINX_SKIP }, async () => {
  const sockDir = await tempDir('sock');
  await fs.chmod(sockDir, 0o755);
  const socketPath = path.join(sockDir, 'web.sock');
  const { root, conf, runDir } = await deploy({ basePath: '/m/', listen: { kind: 'unix', path: socketPath } });
  try {
    const n = await startNginx({ confFile: conf, prefixDir: runDir, socketPath });
    try {
      const r = await new Promise((resolve, reject) => {
        http.get({ socketPath, path: '/m/about', headers: { Host: 'x' } }, (res) => { res.resume(); resolve(res); }).on('error', reject);
      });
      assert.equal(/** @type {http.IncomingMessage} */ (r).statusCode, 301);
      assert.equal(/** @type {http.IncomingMessage} */ (r).headers.location, '/m/about/');
      assert.ok(/** @type {http.IncomingMessage} */ (r).headers['content-security-policy']);
    } finally {
      await n.stop();
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(sockDir, { recursive: true, force: true });
  }
});

test('R2-A: every add_header line is well-formed and each required header appears exactly once', async () => {
  const ghostpay = { rules: parseHeadersFile(await fs.readFile(GHOSTPAY_HEADERS_PATH, 'utf8')), source: /** @type {const} */ ('site') };
  for (const v of [gen({}), gen({ basePath: '/m/', onionLocation: `http://${'a'.repeat(56)}.onion` }, { policy: ghostpay, files: [...FILES, '_headers'] })]) {
    const code = v.server.split('\n').filter((l) => !/^\s*#/.test(l));
    const lines = code.filter((l) => /\badd_header\b/.test(l));
    assert.ok(lines.length >= 5);
    /** @type {Map<string, number>} */
    const count = new Map();
    for (const l of lines) {
      const m = /^add_header ([A-Za-z0-9-]+) (\$hk_h\d+|\$hk_allow|"(?:[^"\\$]|\\.)*(?:\$request_uri)?") always;$/.exec(l);
      assert.ok(m, `malformed add_header line: ${l}`);
      const name = /** @type {string} */ (m[1]).toLowerCase();
      count.set(name, (count.get(name) ?? 0) + 1);
    }
    for (const name of ['content-security-policy', 'x-content-type-options', 'referrer-policy', 'cache-control', 'allow']) {
      assert.equal(count.get(name), 1, `${name} must be added exactly once`);
    }
    assert.ok([...count.values()].every((c) => c === 1));
  }
  // A policy built without the parser cannot smuggle a name with nginx metacharacters into the config.
  const smuggled = { rules: [...POLICY.rules, { pattern: '/x', set: /** @type {Array<[string, string]>} */ ([["'a", '1'], ["D'", '2']]), detach: [] }], source: /** @type {const} */ ('site') };
  assert.throws(() => gen({}, { policy: smuggled }), (e) => isKit(e, 'E_HEADERS') || isKit(e, 'E_UNSUPPORTED'));
});

test('R2-D: profiles refuse a policy that detaches CSP or nosniff for SVG/XML', () => {
  const p = { rules: parseHeadersFile(`${KIT_DEFAULT_HEADERS_FILE}/*.svg\n  ! Content-Security-Policy\n  ! X-Content-Type-Options\n`), source: /** @type {const} */ ('site') };
  assert.throws(() => gen({}, { policy: p, files: [...FILES, 'evil.svg'] }), (e) => isKit(e, 'E_HEADERS'));
});
