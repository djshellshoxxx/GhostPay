import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  EMBED_SDK_FILES,
  collectChunkModules,
  copyPublicFiltered,
  localBuildProfilePlugins,
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

test('collectChunkModules fails honestly without module metadata', () => {
  assert.throws(() => collectChunkModules({ 'a.js': { type: 'chunk', fileName: 'a.js' } }), /module metadata/i);
  const ok = collectChunkModules({
    'a.js': { type: 'chunk', fileName: 'a.js', modules: { '/m.ts': { renderedLength: 5 } } },
    'a.css': { type: 'asset', fileName: 'a.css' },
  });
  assert.deepEqual(ok, [{ fileName: 'a.js', modules: [{ id: '/m.ts', renderedLength: 5 }] }]);
});

test('incomplete or nonfinite rendered lengths cannot become exclusion evidence', () => {
  for (const value of [undefined, NaN, Infinity, -Infinity, -1, '1', null]) {
    const data = value === undefined ? {} : { renderedLength: value };
    assert.throws(
      () => collectChunkModules({ 'x.js': { type: 'chunk', fileName: 'x.js', modules: { '/x.ts': data } } }),
      /renderedLength/,
    );
  }
  for (const entry of [null, undefined, 'x', 5]) {
    assert.throws(
      () => collectChunkModules({ 'x.js': { type: 'chunk', fileName: 'x.js', modules: { '/x.ts': entry } } }),
      /malformed|renderedLength/,
    );
  }
});

test('valid zero-length modules are kept as not rendered, distinct from absent evidence', () => {
  const ok = collectChunkModules({
    'a.js': { type: 'chunk', fileName: 'a.js', modules: { '/z.ts': { renderedLength: 0 }, '/m.ts': { renderedLength: 7 } } },
  });
  assert.deepEqual(ok, [{ fileName: 'a.js', modules: [{ id: '/m.ts', renderedLength: 7 }, { id: '/z.ts', renderedLength: 0 }] }]);
  assert.deepEqual(
    collectChunkModules({ 'e.js': { type: 'chunk', fileName: 'e.js', modules: {} } }),
    [{ fileName: 'e.js', modules: [] }],
  );
});

test('a symlink public ROOT is refused instead of reading outside it', () => {
  const temp = mkdtempSync(join(tmpdir(), 'gp-root-link-'));
  try {
    mkdirSync(join(temp, 'real'));
    writeFileSync(join(temp, 'real', 'private-fixture.txt'), 'synthetic');
    symlinkSync(join(temp, 'real'), join(temp, 'public'));
    assert.throws(() => copyPublicFiltered(join(temp, 'public'), join(temp, 'out'), []), /symlink|directory/i);
    assert.equal(existsSync(join(temp, 'out', 'private-fixture.txt')), false);
    writeFileSync(join(temp, 'plainfile'), 'x');
    assert.throws(() => copyPublicFiltered(join(temp, 'plainfile'), join(temp, 'out2'), []), /directory/i);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('module report cannot be emitted inside the resolved web output (relative and absolute outDir)', () => {
  const temp = mkdtempSync(join(tmpdir(), 'gp-report-path-'));
  try {
    const make = (report) => {
      const plugins = localBuildProfilePlugins({
        env: { GHOSTPAY_LOCAL_BUILD_PROFILE: 'full', GHOSTPAY_LOCAL_MODULE_REPORT: report },
        leanAppPath: join(temp, 'src', 'AppLean.tsx'),
        publicDir: join(temp, 'public'),
      });
      return plugins.find((x) => x.name === 'ghostpay-local-profile-output');
    };
    assert.throws(() => make(join(temp, 'dist', 'report.json')).configResolved({ root: temp, build: { outDir: 'dist' } }), /output/i);
    assert.throws(() => make(join(temp, 'abs-dist', 'r.json')).configResolved({ root: temp, build: { outDir: join(temp, 'abs-dist') } }), /output/i);
    assert.throws(() => make(join(temp, 'dist', '..local', 'r.json')).configResolved({ root: temp, build: { outDir: 'dist' } }), /output/i);
    assert.doesNotThrow(() => make(join(temp, 'external-report.json')).configResolved({ root: temp, build: { outDir: 'dist' } }));
    assert.doesNotThrow(() => make(join(temp, 'dist-sibling', 'r.json')).configResolved({ root: temp, build: { outDir: 'dist' } }));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
