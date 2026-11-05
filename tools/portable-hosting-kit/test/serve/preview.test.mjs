// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as path from 'node:path';
import { KitError } from '../../src/errors.mjs';
import { KIT_DEFAULT_HEADERS_FILE } from '../../src/policy.mjs';
import { parseHeadersFile } from '../../src/serve/headers.mjs';
import { assertLoopbackListener, conditionalStatus, parseHttpDate, startPreview } from '../../src/serve/preview.mjs';
import { buildRequest, rawRequest, tempDir, writeTree } from './helpers.mjs';

/** @typedef {import('../../src/types.mjs').HeaderPolicy} HeaderPolicy */

/** @type {HeaderPolicy} */
const POLICY = { rules: parseHeadersFile(KIT_DEFAULT_HEADERS_FILE), source: 'kit-default' };

/**
 * @param {Record<string, string>} tree
 */
async function site(tree) {
  const dir = await tempDir('pv');
  await writeTree(dir, tree);
  return dir;
}

/**
 * @param {unknown} e
 * @param {string} code
 */
const isKit = (e, code) => e instanceof KitError && e.code === code;

test('refuses non-loopback hosts', async () => {
  const dir = await site({ 'index.html': '<p>x</p>' });
  try {
    for (const host of ['0.0.0.0', '::', '192.168.1.10', '10.0.0.1', 'localhost', 'example.org', '127.0.0.2']) {
      await assert.rejects(startPreview({ siteDir: dir, files: ['index.html'], entrypoint: 'index.html', basePath: '/', policy: POLICY, host }), (e) => isKit(e, 'E_NETWORK_SCOPE'), host);
    }
    assert.throws(() => assertLoopbackListener({ kind: 'unix', path: 'relative.sock' }), (e) => isKit(e, 'E_NETWORK_SCOPE'));
    assert.throws(() => assertLoopbackListener({ kind: 'unix', path: '/run/a b.sock' }), (e) => isKit(e, 'E_NETWORK_SCOPE'));
    assertLoopbackListener({ kind: 'unix', path: '/run/site/web.sock' });
    assertLoopbackListener({ kind: 'tcp', host: '::1', port: 8080 });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('refuses a header policy weaker than required', async () => {
  const dir = await site({ 'index.html': '<p>x</p>' });
  try {
    const weak = { rules: parseHeadersFile('/*\n  X-Content-Type-Options: nosniff\n'), source: /** @type {const} */ ('site') };
    await assert.rejects(startPreview({ siteDir: dir, files: ['index.html'], entrypoint: 'index.html', basePath: '/', policy: weak }), (e) => isKit(e, 'E_HEADERS'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('serves only listed regular files: no symlinks, no listings, no unlisted files, no logging', async () => {
  const dir = await site({ 'index.html': '<p>home</p>', 'a.js': 'a', 'real/b.js': 'b', 'unlisted.js': 'u', 'outside.txt': 'secret' });
  await fs.symlink(path.join(dir, 'outside.txt'), path.join(dir, 'link.txt'));
  await fs.symlink(path.join(dir, 'real'), path.join(dir, 'dirlink'));
  const files = ['index.html', 'a.js', 'real/b.js', 'link.txt', 'dirlink/b.js'];
  /** @type {unknown[]} */
  const logged = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  for (const k of /** @type {const} */ (['log', 'error', 'warn', 'info', 'debug'])) console[k] = (...a) => logged.push(a);
  const origWrite = process.stdout.write.bind(process.stdout);
  const origErrWrite = process.stderr.write.bind(process.stderr);
  const p = await startPreview({ siteDir: dir, files, entrypoint: 'index.html', basePath: '/', policy: POLICY });
  try {
    process.stdout.write = /** @type {typeof process.stdout.write} */ ((/** @type {unknown} */ c) => (logged.push(c), true));
    process.stderr.write = /** @type {typeof process.stderr.write} */ ((/** @type {unknown} */ c) => (logged.push(c), true));
    const get = (/** @type {string} */ t) => rawRequest({ port: p.port }, buildRequest('GET', t));
    assert.equal((await get('/a.js')).body.toString(), 'a');
    assert.equal((await get('/real/b.js')).body.toString(), 'b');
    assert.equal((await get('/link.txt')).status, 404, 'symlinked file is not served');
    assert.equal((await get('/dirlink/b.js')).status, 404, 'file below a symlinked directory is not served');
    assert.equal((await get('/unlisted.js')).status, 404, 'unlisted file is not served');
    const listing = await get('/real/');
    assert.equal(listing.status, 200);
    assert.equal(listing.body.toString(), '<p>home</p>', 'a directory request gets the SPA entrypoint, never a listing');
    const post = await rawRequest({ port: p.port }, buildRequest('POST', '/a.js', { 'Content-Length': '3' }).replace(/\r\n\r\n$/, '\r\n\r\nabc'));
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET, HEAD');
    const head = await rawRequest({ port: p.port }, buildRequest('HEAD', '/a.js'));
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), '1');
    assert.equal(head.body.length, 0);
  } finally {
    process.stdout.write = origWrite;
    process.stderr.write = origErrWrite;
    Object.assign(console, orig);
    await p.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
  assert.deepEqual(logged, [], 'the preview must not log requests');
  assert.ok(p.url.startsWith('http://127.0.0.1:'));
});

test('injected createServer and fs; I/O failures answer 500 with the security headers', async () => {
  const dir = await site({ 'index.html': '<p>x</p>', 'a.js': 'a' });
  let created = 0;
  /** @type {import('../../src/serve/preview.mjs').CreateServer} */
  const createServer = (l) => {
    created++;
    return http.createServer(l);
  };
  const failingFs = {
    lstat: fs.lstat,
    realpath: fs.realpath,
    /** @type {typeof fs.open} */
    open: async () => { throw Object.assign(new Error('boom'), { code: 'EIO' }); },
  };
  const p = await startPreview({ siteDir: dir, files: ['index.html', 'a.js'], entrypoint: 'index.html', basePath: '/', policy: POLICY, createServer, fs: failingFs, host: '127.0.0.1' });
  try {
    assert.equal(created, 1);
    const r = await rawRequest({ port: p.port }, buildRequest('GET', '/a.js'));
    assert.equal(r.status, 500);
    assert.ok(r.headers.get('content-security-policy'));
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  } finally {
    await p.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
  await assert.rejects(startPreview({ siteDir: path.join(dir, 'gone'), files: ['index.html'], entrypoint: 'index.html', basePath: '/', policy: POLICY }), (e) => isKit(e, 'E_IO'));
});

test('IPv6 loopback and base path mismatch', async () => {
  const dir = await site({ 'index.html': '<p>x</p>' });
  try {
    const p = await startPreview({ siteDir: dir, files: ['index.html'], entrypoint: 'index.html', basePath: '/m/', policy: POLICY, host: '::1' }).catch((e) => e);
    if (p instanceof Error) {
      assert.match(String(/** @type {NodeJS.ErrnoException} */ (p).code), /EADDRNOTAVAIL|EAFNOSUPPORT/, 'only an IPv6-less host may fail here');
    } else {
      assert.match(p.url, /^http:\/\/\[::1\]:\d+\/m\/$/);
      await p.close();
    }
    const hostConfig = { schemaVersion: /** @type {const} */ (1), transport: /** @type {const} */ ('onion'), publicOrigin: null, basePath: '/x/', listen: { kind: /** @type {const} */ ('tcp'), host: '127.0.0.1', port: 1 }, mirrorLabel: 'x', onionLocation: null };
    await assert.rejects(startPreview({ siteDir: dir, files: ['index.html'], entrypoint: 'index.html', basePath: '/m/', policy: POLICY, hostConfig }), (e) => isKit(e, 'E_USAGE'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('HTTP dates and conditional decisions follow nginx', () => {
  const t = Date.UTC(1994, 10, 6, 8, 49, 37) / 1000;
  assert.equal(parseHttpDate('Sun, 06 Nov 1994 08:49:37 GMT'), t);
  assert.equal(parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT'), t);
  assert.equal(parseHttpDate('Sun Nov  6 08:49:37 1994'), t);
  assert.equal(parseHttpDate('Sun, 06 Nov 1994 08:49:37'), t, 'zone is not checked');
  for (const bad of ['', 'garbage', 'Sun, 31 Feb 1994 08:49:37 GMT', 'Sun, 06 nov 1994 08:49:37 GMT', 'Sun, 06 Nov 1994 24:00:00 GMT', 'Sun 06 Nov 1994 08:49:37 GMT']) {
    assert.equal(parseHttpDate(bad), -1, bad);
  }
  assert.equal(parseHttpDate('Thu, 29 Feb 2024 00:00:00 GMT'), Date.UTC(2024, 1, 29) / 1000);
  assert.equal(parseHttpDate('Thu, 29 Feb 2023 00:00:00 GMT'), -1);
  const etag = '"6ae11b0f-4e"';
  const m = 0x6ae11b0f;
  const lm = new Date(m * 1000).toUTCString();
  assert.equal(conditionalStatus({}, etag, m), null);
  assert.equal(conditionalStatus({ ifNoneMatch: etag }, etag, m), 304);
  assert.equal(conditionalStatus({ ifNoneMatch: `W/${etag}` }, etag, m), 304);
  assert.equal(conditionalStatus({ ifNoneMatch: `"x", ${etag}` }, etag, m), 304);
  assert.equal(conditionalStatus({ ifNoneMatch: '"x"' }, etag, m), null);
  assert.equal(conditionalStatus({ ifModifiedSince: lm }, etag, m), 304);
  assert.equal(conditionalStatus({ ifModifiedSince: new Date((m + 1) * 1000).toUTCString() }, etag, m), null, 'exact match only');
  assert.equal(conditionalStatus({ ifModifiedSince: lm, ifNoneMatch: '"x"' }, etag, m), null);
  assert.equal(conditionalStatus({ ifMatch: etag }, etag, m), null);
  assert.equal(conditionalStatus({ ifMatch: `W/${etag}` }, etag, m), 412, 'If-Match is strong');
  assert.equal(conditionalStatus({ ifUnmodifiedSince: lm }, etag, m), null);
  assert.equal(conditionalStatus({ ifUnmodifiedSince: 'nonsense' }, etag, m), 412);
});
