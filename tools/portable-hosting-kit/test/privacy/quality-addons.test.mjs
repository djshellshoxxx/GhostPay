// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertSafeAbsolutePath } from '../../src/adapters/tor.mjs';
import { exportStatic } from '../../src/profiles/static-export.mjs';
import { kitHeaderNames, parseHeadersFile } from '../../src/serve/headers.mjs';
import { KIT_DEFAULT_HEADERS_FILE } from '../../src/policy.mjs';

test('Tor path trimming keeps normalized values, refusals and the existing input bound', () => {
  for (const raw of ['/var/lib/tor/site', '/var/lib/tor/site/', '/var/lib/tor/site////']) assert.equal(assertSafeAbsolutePath(raw, 'dir'), '/var/lib/tor/site');
  for (const raw of ['/', '////', '/a//b', '/a/../b', '/bad path', 'relative', `/${'a'.repeat(1024)}`]) assert.throws(() => assertSafeAbsolutePath(raw, 'dir'));
  assert.equal(assertSafeAbsolutePath(`/${'a'.repeat(1023)}`, 'dir').length, 1024);
});

test('header-name inventory keeps ordinal punctuation order', () => {
  const policy = /** @type {import('../../src/types.mjs').HeaderPolicy} */ ({ source: 'site', rules: parseHeadersFile('/*\n  X-Z: a\n  X-A: b\n  X--A: c\n  X1: d\n') });
  assert.deepEqual(kitHeaderNames(policy, null).filter((n) => n.startsWith('x')), ['x--a', 'x-a', 'x-z', 'x1']);
});

test('static export retains ordinal non-ASCII ordering without changing bytes', async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), 'hk-quality-order-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const site = join(root, 'site');
  await fs.mkdir(site);
  const files = ['\ue000.html', '😀.html', 'ä.html', 'index.html', 'a.html', 'Z.html'];
  for (const name of files) await fs.writeFile(join(site, name), '<p>fixture</p>');
  const host = /** @type {import('../../src/types.mjs').HostConfig} */ ({ schemaVersion: 1, transport: 'clearnet', publicOrigin: null, basePath: '/', listen: { kind: 'tcp', host: '127.0.0.1', port: 8088 }, mirrorLabel: 'quality', onionLocation: null });
  const policy = /** @type {import('../../src/types.mjs').HeaderPolicy} */ ({ source: 'kit-default', rules: parseHeadersFile(KIT_DEFAULT_HEADERS_FILE) });
  const result = await exportStatic({ siteDir: site, files, entrypoint: 'index.html', hostConfig: host, policy, outDir: join(root, 'out') });
  assert.deepEqual(result.files, ['Z.html', 'a.html', 'index.html', 'ä.html', '😀.html', '\ue000.html']);
  for (const name of files) assert.equal(await fs.readFile(join(result.wwwRoot, name), 'utf8'), '<p>fixture</p>');
});
