// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { demoSiteFiles, writeDemoSite } from '../../src/demo/demo-site.mjs';
import { buildMirrorOverlay, overlayCollides } from '../../src/overlay/mirror.mjs';
import { defaultHostConfig } from '../../src/config/host-config.mjs';
import { KitError } from '../../src/errors.mjs';

test('demo site is deterministic, relative and CSP-clean', () => {
  const a = demoSiteFiles();
  assert.deepEqual(a, demoSiteFiles());
  const index = a.find((f) => f.path === 'index.html')?.data ?? '';
  assert.match(index, /src="\.\/assets\/demo-[0-9a-f]{10}\.js"/);
  assert.doesNotMatch(index, /<script>(?!<)/, 'no inline script bodies');
  assert.doesNotMatch(index, /\sstyle=|\son[a-z]+=/i, 'no inline styles or handlers');
  assert.doesNotMatch(a.map((f) => f.data).join('\n'), /innerHTML|eval\(/);
  assert.ok(a.some((f) => f.path === '_headers'));
  assert.ok(a.some((f) => f.path === '.well-known/security.txt'));
  assert.ok(a.some((f) => f.path === 'about/index.html'));
});

test('writeDemoSite refuses a non-empty directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hk-demo-'));
  try {
    const written = await writeDemoSite(join(dir, 'site'));
    assert.equal(written.length, demoSiteFiles().length);
    assert.equal(await readFile(join(dir, 'site', 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow:\n');
    await writeFile(join(dir, 'other.txt'), 'x');
    await assert.rejects(writeDemoSite(dir), (e) => e instanceof KitError && e.code === 'E_USAGE');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mirror overlay carries the digest and authenticity caveat; reserved dir collisions detected', () => {
  const manifest = /** @type {import('../../src/types.mjs').HostingManifest} */ (/** @type {unknown} */ ({
    appId: 'x', provenance: { label: 'v1' }, content: { digest: `sha256:${'a'.repeat(64)}`, entrypoint: 'index.html', fileCount: 3 },
  }));
  const o = buildMirrorOverlay(manifest, defaultHostConfig('onion'), null);
  const doc = JSON.parse(new TextDecoder().decode(o.data));
  assert.equal(o.path, '_mirror/mirror.json');
  assert.equal(doc.contentDigest, `sha256:${'a'.repeat(64)}`);
  assert.equal(doc.mirror.transport, 'onion');
  assert.match(doc.notes.join(' '), /cannot prove authenticity/);
  assert.equal(overlayCollides(['index.html', '_mirror/x.json']), true);
  assert.equal(overlayCollides(['index.html', '_mirrors.json']), false);
});
