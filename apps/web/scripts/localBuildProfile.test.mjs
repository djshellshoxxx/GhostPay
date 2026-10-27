import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  EMBED_SDK_FILES,
  copyPublicFiltered,
  parseProfile,
  selectAppEntry,
  writeReportExclusive,
} from './localBuildProfile.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'gp-profile-'));
}

test('parseProfile defaults to full and rejects anything else', () => {
  assert.equal(parseProfile(undefined), 'full');
  assert.equal(parseProfile('full'), 'full');
  assert.equal(parseProfile('lean'), 'lean');
  for (const bad of ['', 'Lean', 'LEAN', 'lean ', 'minimal', '1']) {
    assert.throws(() => parseProfile(bad), /GHOSTPAY_LOCAL_BUILD_PROFILE/);
  }
});

test('selectAppEntry only redirects ./App from main.tsx in lean', () => {
  const lean = '/x/src/AppLean.tsx';
  assert.equal(selectAppEntry('lean', './App', '/x/src/main.tsx', lean), lean);
  assert.equal(selectAppEntry('full', './App', '/x/src/main.tsx', lean), undefined);
  assert.equal(selectAppEntry('lean', './App', '/x/src/other.tsx', lean), undefined);
  assert.equal(selectAppEntry('lean', './AppShell', '/x/src/main.tsx', lean), undefined);
  assert.equal(selectAppEntry('lean', './App', undefined, lean), undefined);
});

test('copyPublicFiltered drops only embed SDKs and keeps every other byte', () => {
  const src = tmp();
  const out = tmp();
  mkdirSync(join(src, 'deployments'));
  writeFileSync(join(src, '_headers'), 'h\n');
  writeFileSync(join(src, 'deployments', 'README.md'), 'r\n');
  writeFileSync(join(src, 'ghostpay-embed-v1.js'), 'v1');
  writeFileSync(join(src, 'ghostpay-embed-v2.js'), 'v2');
  const copied = copyPublicFiltered(src, out, EMBED_SDK_FILES);
  assert.deepEqual([...copied].sort(), ['_headers', 'deployments/README.md']);
  assert.equal(readFileSync(join(out, '_headers'), 'utf8'), 'h\n');
  assert.equal(readFileSync(join(out, 'deployments', 'README.md'), 'utf8'), 'r\n');
  assert.equal(existsSync(join(out, 'ghostpay-embed-v1.js')), false);
  assert.equal(existsSync(join(out, 'ghostpay-embed-v2.js')), false);
  assert.deepEqual(readdirSync(out).sort(), ['_headers', 'deployments']);
});

test('copyPublicFiltered refuses symlinks without following them', () => {
  const src = tmp();
  const out = tmp();
  const outside = tmp();
  writeFileSync(join(outside, 'secret.txt'), 's');
  symlinkSync(outside, join(src, 'linkdir'));
  assert.throws(() => copyPublicFiltered(src, out, EMBED_SDK_FILES), /symlink|special/i);
  assert.equal(existsSync(join(out, 'linkdir')), false);
  const src2 = tmp();
  symlinkSync(join(outside, 'secret.txt'), join(src2, 'f.txt'));
  assert.throws(() => copyPublicFiltered(src2, tmp(), EMBED_SDK_FILES), /symlink|special/i);
});

test('writeReportExclusive requires an absolute path and never overwrites', () => {
  const dir = tmp();
  const file = join(dir, 'report.json');
  assert.throws(() => writeReportExclusive('relative/report.json', { a: 1 }), /absolute/i);
  writeReportExclusive(file, { a: 1 });
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { a: 1 });
  assert.throws(() => writeReportExclusive(file, { a: 2 }), /EEXIST/);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { a: 1 });
});

test('collectChunkModules fails honestly without module metadata', async () => {
  const { collectChunkModules } = await import('./localBuildProfile.mjs');
  assert.throws(() => collectChunkModules({ 'a.js': { type: 'chunk', fileName: 'a.js' } }), /module metadata/i);
  const ok = collectChunkModules({
    'a.js': { type: 'chunk', fileName: 'a.js', modules: { '/m.ts': { renderedLength: 5 } } },
    'a.css': { type: 'asset', fileName: 'a.css' },
  });
  assert.deepEqual(ok, [{ fileName: 'a.js', modules: [{ id: '/m.ts', renderedLength: 5 }] }]);
});
