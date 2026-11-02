// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanExternalReferences } from '../../src/privacy/external-refs.mjs';
import { servableFiles } from '../../src/serve/routing.mjs';
import { transportHeaders } from '../../src/serve/headers.mjs';
import { generateContainer } from '../../src/profiles/container.mjs';
import { NGINX_HTTP_FILE, NGINX_SERVER_FILE } from '../../src/profiles/nginx.mjs';

/** @param {Record<string, string>} files */
function scan(files) {
  const enc = new TextEncoder();
  return scanExternalReferences(Object.keys(files).map((path) => ({ path })), async (path) => enc.encode(files[path] ?? ''));
}
/** @returns {import('../../src/types.mjs').HostConfig} */
const host = () => ({ schemaVersion: 1, transport: 'clearnet', publicOrigin: null, basePath: '/', listen: { kind: 'tcp', host: '127.0.0.1', port: 8088 }, mirrorLabel: 'quality', onionLocation: null });

test('relative literals preserve context, legacy quotes and later matches', async () => {
  const r = await scan({ 'index.html': `<script SRC${' '.repeat(2048)} = '//long.example.invalid/x"> url(//broken.invalid/no-close href="//later.example.invalid/x"`, 'style.css': '@import url( "//style.example.invalid/a.css" );' });
  const byHost = new Map(r.references.map((x) => [x.host, x]));
  assert.equal(byHost.get('long.example.invalid')?.category, 'script');
  assert.equal(byHost.get('long.example.invalid')?.url, '//long.example.invalid');
  assert.equal(byHost.get('style.example.invalid')?.category, 'style');
  assert.equal(byHost.has('later.example.invalid'), true);
});

test('ordinal sorting preserves UTF-16 behavior rather than locale or UTF-8 order', async () => {
  const paths = ['\ue000.js', '😀.js', 'ä.js', 'a.js', 'Z.js'];
  const expected = ['Z.js', 'a.js', 'ä.js', '😀.js', '\ue000.js'];
  assert.deepEqual(servableFiles(paths), expected);
  const r = await scan(Object.fromEntries(paths.map((path) => [path, 'const u="https://same.example.invalid/x";'])));
  assert.deepEqual(r.references[0]?.files, expected);
});

test('container temporary state belongs to private uid/gid101 tmpfs', () => {
  const enc = new TextEncoder();
  const files = [NGINX_HTTP_FILE, NGINX_SERVER_FILE].map((name) => ({ name, data: enc.encode('') }));
  const out = generateContainer({ hostConfig: host(), nginxFiles: files });
  const text = out.files.map((f) => new TextDecoder().decode(f.data)).join('\n');
  assert.ok(text.includes('/run/ghostpay-nginx:size=16m,mode=0700,uid=101,gid=101,noexec,nosuid,nodev'));
  assert.equal(text.includes('mode=1777'), false);
  assert.ok(text.includes('pid "/run/ghostpay-nginx/nginx.pid";'));
  for (const name of ['client_body_temp', 'proxy_temp', 'fastcgi_temp', 'uwsgi_temp', 'scgi_temp']) assert.ok(text.includes(`"/run/ghostpay-nginx/${name}"`));
});

test('nullish transport configuration stays absent while malformed values refuse', () => {
  const hc = host();
  assert.deepEqual(transportHeaders(hc), []);
  delete /** @type {Partial<import('../../src/types.mjs').HostConfig>} */ (hc).onionLocation;
  assert.deepEqual(transportHeaders(hc), []);
  for (const bad of ['', 0, false]) assert.throws(() => transportHeaders({ ...hc, onionLocation: /** @type {any} */ (bad) }), { code: 'E_CONFIG' });
});
