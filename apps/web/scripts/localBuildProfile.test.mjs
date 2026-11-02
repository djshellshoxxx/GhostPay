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

function leanOutput(extra = {}) {
  return localBuildProfilePlugins({
    env: { GHOSTPAY_LOCAL_BUILD_PROFILE: 'lean' },
    leanAppPath: '/fixture/src/AppLean.tsx',
    publicDir: '/fixture/public',
    workerEvidence: [],
    ...extra,
  }).find((plugin) => plugin.name === 'ghostpay-local-profile-output');
}

function chunk(id, renderedLength = 1, renderedExports = []) {
  return { 'entry.js': { type: 'chunk', fileName: 'entry.js', modules: { [id]: { renderedLength, renderedExports } } } };
}

test('default full profile adds no output or entry behavior', () => {
  assert.deepEqual(localBuildProfilePlugins({ env: {}, leanAppPath: '/fixture/src/AppLean.tsx', publicDir: '/fixture/public' }), []);
});

test('lean entry redirection is bound to the configured web root, not another main.tsx', () => {
  assert.equal(selectAppEntry('lean', './App', '/other/src/main.tsx', '/fixture/src/AppLean.tsx'), undefined);
});

test('lean rejects rendered optional features even when no external report was requested', () => {
  for (const id of ['/fixture/src/App.tsx', '/fixture/src/features/btc/BtcView.tsx', '/fixture/src/features/solana/SolanaView.tsx',
    '/fixture/src/features/tron/TronView.tsx', '/fixture/src/features/policy/PolicyView.tsx', '/fixture/src/components/TagArchive.tsx',
    '/fixture/src/lib/tagArchive.ts', '/fixture/src/lib/embedProtocol.ts', '/fixture/packages/policy-scheme/src/index.ts']) {
    assert.throws(() => leanOutput().generateBundle({}, chunk(id)), /lean|deferred|excluded/i, id);
  }
});

test('lean requires real nonempty chunk-module facts without a report flag', () => {
  assert.throws(() => leanOutput().generateBundle({}, { 'entry.js': { type: 'chunk', fileName: 'entry.js' } }), /metadata/i);
  assert.throws(() => leanOutput().generateBundle({}, {}), /chunk|metadata/i);
  const missingExports = chunk('/fixture/src/AppLean.tsx');
  delete missingExports['entry.js'].modules['/fixture/src/AppLean.tsx'].renderedExports;
  assert.throws(() => leanOutput().generateBundle({}, missingExports), /export|metadata/i);
});

test('shared embed notification is admitted but embedding startup exports fail', () => {
  assert.doesNotThrow(() => leanOutput().generateBundle({}, chunk('/fixture/src/lib/embedHost.ts', 4, ['notifyEmbedDone'])));
  for (const name of ['startEmbedHost', 'readProfileFromSearch', 'fetchMerchantProfile']) {
    assert.throws(() => leanOutput().generateBundle({}, chunk('/fixture/src/lib/embedHost.ts', 4, [name])), /embed|lean|export/i);
  }
});

test('lean Worker hook rejects deferred modules and captures actual module facts', () => {
  const workerEvidence = [];
  const plugin = leanOutput({ worker: true, workerEvidence });
  assert.throws(() => plugin.generateBundle({}, chunk('/fixture/src/features/btc/scan.ts')), /lean|deferred|excluded/i);
  plugin.generateBundle({}, chunk('/fixture/src/lib/scanner.worker.ts', 80, ['scan']));
  assert.equal(workerEvidence.length, 1);
  assert.equal(workerEvidence[0].chunks[0].modules[0].id, 'src/lib/scanner.worker.ts');
});

test('lean final output refuses missing Worker proof', () => {
  const dir = tmp();
  const publicDir = join(dir, 'public');
  mkdirSync(publicDir);
  const plugin = leanOutput({ publicDir });
  plugin.configResolved({ root: dir, build: { outDir: 'dist' } });
  plugin.generateBundle({}, chunk('/fixture/src/AppLean.tsx'));
  assert.throws(() => plugin.writeBundle({}), /worker.*(proof|evidence)|missing.*worker/i);
});

test('lean emitted evidence contains actual app/Worker facts with source-relative ids', () => {
  const dir = tmp();
  const publicDir = join(dir, 'public');
  mkdirSync(publicDir);
  writeFileSync(join(publicDir, '_headers'), 'headers\n');
  for (const sdk of EMBED_SDK_FILES) writeFileSync(join(publicDir, sdk), 'preserved source, excluded output');
  const workerEvidence = [];
  const opts = { publicDir, leanAppPath: join(dir, 'src', 'AppLean.tsx'), workerEvidence };
  leanOutput({ ...opts, worker: true }).generateBundle({}, chunk(join(dir, 'src', 'lib', 'scanner.worker.ts'), 80, ['scan']));
  const plugin = leanOutput(opts);
  plugin.configResolved({ root: dir, build: { outDir: 'dist' } });
  plugin.generateBundle({}, chunk(join(dir, 'src', 'AppLean.tsx'), 20, ['App']));
  plugin.writeBundle({});
  const text = readFileSync(join(dir, 'dist', 'ghostpay-lean-build.json'), 'utf8');
  const report = JSON.parse(text);
  assert.equal(report.profile, 'lean');
  assert.equal(report.chunks[0].modules[0].id, 'src/AppLean.tsx');
  assert.equal(report.workers[0].chunks[0].modules[0].id, 'src/lib/scanner.worker.ts');
  assert.equal(text.includes(dir), false);
  assert.deepEqual(report.publicCopied, ['_headers']);
  for (const sdk of EMBED_SDK_FILES) assert.equal(existsSync(join(dir, 'dist', sdk)), false);
});

test('lean refuses a newly added uninspected executable public asset', () => {
  const dir = tmp();
  const publicDir = join(dir, 'public');
  mkdirSync(publicDir);
  writeFileSync(join(publicDir, 'unreviewed.js'), 'not executed');
  const workerEvidence = [];
  const opts = { publicDir, leanAppPath: join(dir, 'src', 'AppLean.tsx'), workerEvidence };
  leanOutput({ ...opts, worker: true }).generateBundle({}, chunk(join(dir, 'src/lib/scanner.worker.ts'), 10, []));
  const plugin = leanOutput(opts);
  plugin.configResolved({ root: dir, build: { outDir: 'dist' } });
  plugin.generateBundle({}, chunk(join(dir, 'src/AppLean.tsx'), 10, ['App']));
  assert.throws(() => plugin.writeBundle({}), /executable|public.*asset/i);
});

test('external evidence is rechecked against the actual output override', () => {
  const dir = tmp();
  const publicDir = join(dir, 'public');
  mkdirSync(publicDir);
  const plugin = leanOutput({ publicDir, env: { GHOSTPAY_LOCAL_BUILD_PROFILE: 'lean', GHOSTPAY_LOCAL_MODULE_REPORT: join(dir, 'actual', 'proof.json') } });
  plugin.configResolved({ root: dir, build: { outDir: 'dist' } });
  assert.throws(() => plugin.writeBundle({ dir: join(dir, 'actual') }), /output directory/i);
});

test('nonempty lean chunks cannot omit all module provenance', () => {
  assert.throws(() => leanOutput().generateBundle({}, { 'entry.js': { type: 'chunk', fileName: 'entry.js', code: 'untracked()', modules: {} } }), /module|metadata/i);
});

function outputFixture() {
  const dir = tmp();
  const publicDir = join(dir, 'public');
  mkdirSync(publicDir);
  const workerEvidence = [];
  const opts = { publicDir, leanAppPath: join(dir, 'src/AppLean.tsx'), workerEvidence };
  leanOutput({ ...opts, worker: true }).generateBundle({}, chunk(join(dir, 'src/lib/scanner.worker.ts'), 10, []));
  const plugin = leanOutput(opts);
  plugin.configResolved({ root: dir, build: { outDir: 'dist' } });
  const bundle = chunk(join(dir, 'src/AppLean.tsx'), 10, ['App']);
  plugin.generateBundle({}, bundle);
  return { dir, plugin, bundle };
}

test('a later-emitted executable asset must also have Worker module proof', () => {
  const { plugin, bundle } = outputFixture();
  bundle['late.js'] = { type: 'asset', fileName: 'late.js', source: 'uninspected source, never executed' };
  assert.throws(() => plugin.writeBundle({}), /asset.*proof/i);
});

test('stale unreported output code is refused without deleting it', () => {
  const { dir, plugin } = outputFixture();
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist', 'stale.js'), 'unreported source, never executed');
  assert.throws(() => plugin.writeBundle({}), /output.*(module|proof|executable)/i);
  assert.equal(readFileSync(join(dir, 'dist', 'stale.js'), 'utf8'), 'unreported source, never executed');
});

test('unreported stale HTML and HTM output is refused without deleting it', () => {
  for (const name of ['stale.html', 'other.HTM']) {
    const { dir, plugin } = outputFixture();
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'dist', name), '<p>unreported inert document</p>');
    assert.throws(() => plugin.writeBundle({}), /output.*(module|proof|executable)/i);
    assert.equal(readFileSync(join(dir, 'dist', name), 'utf8'), '<p>unreported inert document</p>');
  }
});

test('actual bundle-reported index HTML remains admitted', () => {
  const { dir, plugin, bundle } = outputFixture();
  bundle['index.html'] = { type: 'asset', fileName: 'index.html', source: '<p>bundler entry</p>' };
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist', 'index.html'), '<p>bundler entry</p>');
  assert.doesNotThrow(() => plugin.writeBundle({}));
  assert.equal(readFileSync(join(dir, 'dist', 'index.html'), 'utf8'), '<p>bundler entry</p>');
});
