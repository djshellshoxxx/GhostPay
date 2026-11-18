// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { walkSite } from '../../src/core/inventory.mjs';
import { validateSite } from '../../src/core/validate.mjs';
import { DEFAULT_LIMITS } from '../../src/policy.mjs';
import { PNG_BYTES, SMALL_LIMITS, faultyFs, goodSite, rejectsCode, snapshot, tmpDir, writeTree } from './helpers.mjs';

/** @typedef {import('../../src/types.mjs').ValidationReport} ValidationReport */

/**
 * @param {ValidationReport} report
 * @returns {Record<string, string[]>} path -> rules (error findings)
 */
function errorsByPath(report) {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const f of report.findings) {
    if (f.severity !== 'error') continue;
    const k = f.path ?? '';
    (out[k] ??= []).push(f.rule);
  }
  return out;
}

/**
 * @param {import('node:test').TestContext} t
 * @param {Record<string, string | Uint8Array>} extra
 */
async function siteWith(t, extra) {
  const dir = await tmpDir(t);
  await writeTree(dir, { ...goodSite(), ...extra });
  return dir;
}

test('a clean site validates with sorted entries, entrypoint and trust-sensitive files', async (t) => {
  const dir = await siteWith(t, {});
  const report = await validateSite(dir);
  assert.deepEqual(report.findings, []);
  assert.equal(report.ok, true);
  assert.equal(report.siteDir, await fsp.realpath(dir));
  assert.equal(report.entrypoint, 'index.html');
  assert.deepEqual(report.entries.map((e) => e.path), [
    '.well-known/security.txt', 'LICENSE', '_headers', 'assets/app.js', 'assets/style.css', 'deployments/8453.json', 'img/logo.png', 'index.html', 'locales/caf\u00e9.json',
  ]);
  assert.equal(report.totalBytes, report.entries.reduce((s, e) => s + e.size, 0));
  assert.deepEqual(report.trustSensitive, ['deployments/8453.json']);
});

test('the input directory may be given through a symlink; it is resolved once', async (t) => {
  const dir = await siteWith(t, {});
  const outer = await tmpDir(t);
  const link = path.join(outer, 'link-to-site');
  await fsp.symlink(dir, link);
  const report = await validateSite(link);
  assert.equal(report.ok, true);
  assert.equal(report.siteDir, await fsp.realpath(dir));
});

test('symlinks anywhere (file, directory, inside or outside) and special files are errors, never followed', async (t) => {
  const dir = await siteWith(t, {});
  const outside = await tmpDir(t);
  await fsp.writeFile(path.join(outside, 'secret.txt'), 'outside');
  await fsp.mkdir(path.join(outside, 'd'));
  await fsp.writeFile(path.join(outside, 'd', 'x.js'), 'x');
  await fsp.symlink(path.join(dir, 'index.html'), path.join(dir, 'inside-link.html'));
  await fsp.symlink(path.join(outside, 'secret.txt'), path.join(dir, 'assets', 'outside.txt'));
  await fsp.symlink(path.join(outside, 'd'), path.join(dir, 'linked-dir'));
  await fsp.symlink('/nonexistent/target', path.join(dir, 'dangling.js'));
  execFileSync('mkfifo', [path.join(dir, 'pipe.txt')]);
  const report = await validateSite(dir);
  const errs = errorsByPath(report);
  assert.deepEqual(errs['inside-link.html'], ['symlink']);
  assert.deepEqual(errs['assets/outside.txt'], ['symlink']);
  assert.deepEqual(errs['linked-dir'], ['symlink']);
  assert.deepEqual(errs['dangling.js'], ['symlink']);
  assert.deepEqual(errs['pipe.txt'], ['special-file']);
  assert.equal(report.ok, false);
  assert.ok(!report.entries.some((e) => e.path.startsWith('linked-dir') || e.path === 'assets/outside.txt' || e.path === 'pipe.txt'));
  assert.ok(report.findings.filter((f) => f.rule === 'symlink').every((f) => f.code === 'E_SYMLINK'));
});

test('case and Unicode-normalization collisions are errors (files and directories)', async (t) => {
  const dir = await siteWith(t, { 'A.html': 'x', 'a.html': 'y', 'Assets/z.js': 'z' });
  await fsp.writeFile(path.join(dir, 'cafe\u0301.html'), 'nfd');
  await fsp.writeFile(path.join(dir, 'caf\u00e9.html'), 'nfc');
  const report = await validateSite(dir);
  const errs = errorsByPath(report);
  assert.deepEqual(errs['A.html'], ['case-or-unicode-collision']);
  assert.deepEqual(errs['a.html'], ['case-or-unicode-collision']);
  assert.deepEqual(errs['Assets'], ['case-or-unicode-collision']);
  assert.deepEqual(errs['assets'], ['case-or-unicode-collision']);
  assert.deepEqual(errs['caf\u00e9.html'], ['case-or-unicode-collision']);
  assert.deepEqual(errs['cafe\u0301.html']?.sort(), ['case-or-unicode-collision', 'not-nfc']);
  assert.equal(report.ok, false);
  assert.ok(report.findings.filter((f) => f.rule === 'case-or-unicode-collision').every((f) => f.code === 'E_COLLISION'));
});

test('a lone NFD name is rejected as not NFC', async (t) => {
  const dir = await siteWith(t, {});
  await fsp.writeFile(path.join(dir, 'nai\u0308ve.txt'), 'x');
  const report = await validateSite(dir);
  assert.deepEqual(errorsByPath(report)['nai\u0308ve.txt'], ['not-nfc']);
});

test('unsafe names on disk become path findings', async (t) => {
  const names = {
    'q?.html': 'url-special-char', 'h#.html': 'url-special-char', 'p%41.html': 'url-special-char', 'ab:c.html': 'windows-invalid-char',
    'lt<.html': 'windows-invalid-char', 'dot.': 'trailing-dot-or-space', 'space ': 'trailing-dot-or-space', 'CON.html': 'windows-reserved-name',
    'back\\slash.html': 'backslash', 'new\nline.html': 'control-char', 'rlo\u202etxt.html': 'bidi-char',
  };
  const dir = await siteWith(t, {});
  for (const n of Object.keys(names)) await fsp.writeFile(path.join(dir, n), 'x');
  await fsp.writeFile(Buffer.concat([Buffer.from(`${dir}/bad-`), Buffer.from([0xff, 0xfe]), Buffer.from('.html')]), 'invalid utf-8 name');
  const report = await validateSite(dir);
  const errs = errorsByPath(report);
  for (const [n, r] of Object.entries(names)) assert.deepEqual(errs[n], [r], n);
  assert.deepEqual(errs['bad-\ufffd\ufffd.html'], ['replacement-char']);
  assert.equal(report.entries.length, Object.keys(goodSite()).length);
});

test('allowlist, deny reasons and hidden paths', async (t) => {
  const dir = await siteWith(t, {
    '.env': 'API_KEY=1',
    'onion/hs_ed25519_secret_key': '== ed25519v1-secret: type0 ==\u0000',
    'i2p/eepPriv.dat': 'binary',
    'data/app.sqlite': 'SQLite format 3\u0000',
    'keys/server.pem': 'x',
    '.git/config': '[core]',
    'node_modules/x/index.js': 'x',
    'cgi/contact.php': '<?php',
    'notes.rtf': '{\\rtf1 notes}',
    'deployments/README.md': '# readme',
    'README': 'readme',
    'tool.exe': 'MZ',
    '.hidden.js': 'x',
    'sub/.well-known/x.txt': 'x',
    'assets/app.js.map': '{}',
    '.DS_Store': 'x',
    'config/secrets.json': '{}',
    'assets/secret-box-3f9a.js': 'export const x = 1;\n',
  });
  const report = await validateSite(dir);
  const errs = errorsByPath(report);
  assert.deepEqual(errs['.env'], ['credentials-or-env']);
  assert.deepEqual(errs['onion/hs_ed25519_secret_key'], ['tor-onion-identity']);
  assert.deepEqual(errs['i2p/eepPriv.dat'], ['i2p-destination-keys']);
  assert.deepEqual(errs['data/app.sqlite'], ['database-or-backup']);
  assert.deepEqual(errs['keys/server.pem'], ['private-key-file']);
  assert.deepEqual(errs['.git/config'], ['vcs-or-dependencies']);
  assert.deepEqual(errs['node_modules/x/index.js'], ['vcs-or-dependencies']);
  assert.deepEqual(errs['cgi/contact.php'], ['server-side-code']);
  assert.deepEqual(errs['notes.rtf'], ['not-allowed']);
  assert.equal(errs['deployments/README.md'], undefined, 'markdown is allowlisted (GhostPay ships deployments/README.md)');
  assert.deepEqual(errs['README'], ['not-allowed']);
  assert.deepEqual(errs['tool.exe'], ['server-side-code']);
  assert.deepEqual(errs['.hidden.js'], ['hidden-path']);
  assert.deepEqual(errs['sub/.well-known/x.txt'], ['hidden-path']);
  assert.deepEqual(errs['assets/app.js.map'], ['source-map']);
  assert.deepEqual(errs['.DS_Store'], ['runtime-state']);
  assert.deepEqual(errs['config/secrets.json'], ['credentials-or-env']);
  assert.equal(errs['assets/secret-box-3f9a.js'], undefined);
  assert.equal(report.ok, false);
  const secretCodes = report.findings.filter((f) => ['tor-onion-identity', 'i2p-destination-keys', 'credentials-or-env'].includes(f.rule));
  assert.ok(secretCodes.every((f) => f.code === 'E_SECRET'));
  assert.ok(report.entries.every((e) => !errs[e.path]));
});

test('source maps are allowed when allowSourceMaps is set', async (t) => {
  const dir = await siteWith(t, { 'assets/app.js.map': '{"version":3}' });
  assert.equal((await validateSite(dir, { allowSourceMaps: true })).ok, true);
});

test('heuristic content scan: PEM key in JS, magic prefixes in binary files, tokens in JSON', async (t) => {
  const pem = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
  const dir = await siteWith(t, {
    'assets/vendor.js': `const k = \`${pem}\nMIIBVQ...\n\`;\n`,
    'img/photo.png': Buffer.concat([Buffer.from('SQLite format 3\u0000', 'latin1'), Buffer.alloc(64)]),
    'img/tor.webp': Buffer.from('== ed25519v1-secret: type0 ==\u0000\u0001', 'latin1'),
    'config.json': `{"deployer": {"privateKey": "0x${'ab'.repeat(32)}"}}`,
    'gh.txt': `token ghp_${'A'.repeat(36)}`,
  });
  const errs = errorsByPath(await validateSite(dir));
  assert.deepEqual(errs['assets/vendor.js'], ['pem-private-key']);
  assert.deepEqual(errs['img/photo.png'], ['sqlite-database']);
  assert.deepEqual(errs['img/tor.webp'], ['tor-secret-key-blob']);
  assert.deepEqual(errs['config.json'], ['labelled-hex-private-key']);
  assert.deepEqual(errs['gh.txt'], ['github-token']);
});

test('trust-sensitive detection is informational and content is never rewritten', async (t) => {
  const addr = `0x${'1a'.repeat(20)}`;
  const dir = await siteWith(t, {
    'config/chain.json': `{"chainId": 8453, "contracts": {"router": "${addr}"}}`,
    'config/nochain.json': `{"router": "${addr}"}`,
    'config/chainonly.json': '{"chainId": 1}',
    'sub/Deployments/x.json': '{}',
  });
  const before = await snapshot(dir);
  const report = await validateSite(dir);
  assert.equal(report.ok, true);
  assert.deepEqual(report.trustSensitive, ['config/chain.json', 'deployments/8453.json', 'sub/Deployments/x.json']);
  assert.ok(report.findings.every((f) => f.severity !== 'error'));
  assert.deepEqual(await snapshot(dir), before);
});

test('entrypoint must exist and be HTML; default index.html; overridable', async (t) => {
  const dir = await tmpDir(t);
  await writeTree(dir, { 'app.html': '<!doctype html>', 'main.js': 'x', 'page.htm': '<p>' });
  const missing = await validateSite(dir);
  assert.equal(missing.ok, false);
  assert.deepEqual(errorsByPath(missing)['index.html'], ['entrypoint-missing']);
  assert.equal(missing.findings.find((f) => f.rule === 'entrypoint-missing')?.code, 'E_ENTRYPOINT');
  assert.equal((await validateSite(dir, { entrypoint: 'app.html' })).ok, true);
  assert.equal((await validateSite(dir, { entrypoint: 'page.htm' })).ok, true);
  assert.deepEqual(errorsByPath(await validateSite(dir, { entrypoint: 'main.js' }))['main.js'], ['entrypoint-not-html']);
  assert.deepEqual(errorsByPath(await validateSite(dir, { entrypoint: '../app.html' }))['../app.html'], ['entrypoint-invalid']);
  // An entrypoint that exists but was rejected by policy is still not usable.
  await fsp.writeFile(path.join(dir, '.hidden.html'), 'x');
  assert.match(String((await validateSite(dir, { entrypoint: '.hidden.html' })).findings.find((f) => f.rule === 'entrypoint-missing')?.message), /rejected/);
});

test('global bounds throw E_LIMIT; per-file size and depth are findings', async (t) => {
  const dir = await tmpDir(t);
  await writeTree(dir, { 'index.html': 'x', 'big.txt': 'b'.repeat(SMALL_LIMITS.maxFileBytes + 1) });
  await writeTree(dir, { 'a/b/c/d/e/f.txt': 'ok', 'a/b/c/d/e/f/g.txt': 'too deep' });
  const report = await validateSite(dir, { limits: SMALL_LIMITS });
  const errs = errorsByPath(report);
  assert.deepEqual(errs['big.txt'], ['file-too-large']);
  assert.deepEqual(errs['a/b/c/d/e/f'], ['too-deep']);
  assert.ok(report.entries.some((e) => e.path === 'a/b/c/d/e/f.txt'));

  await rejectsCode(validateSite(dir, { limits: { ...SMALL_LIMITS, maxFiles: 2 } }), 'E_LIMIT', /files/);
  await rejectsCode(validateSite(dir, { limits: { ...SMALL_LIMITS, maxDirEntries: 5 } }), 'E_LIMIT', /directory entries/);
  const totals = await tmpDir(t);
  await writeTree(totals, Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`f${i}.txt`, 'x'.repeat(15000)])));
  await rejectsCode(validateSite(totals, { limits: SMALL_LIMITS }), 'E_LIMIT', /total size/);
});

test('bounds trigger early: a huge directory is not walked to the end', async (t) => {
  const dir = await tmpDir(t);
  await writeTree(dir, Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`f${i}.txt`, 'x'])));
  const counting = faultyFs();
  await rejectsCode(walkSite(dir, { limits: { ...DEFAULT_LIMITS, maxDirEntries: 20 }, fs: counting.fs }), 'E_LIMIT');
  assert.ok(counting.calls.filter((c) => c === 'lstat').length <= 2, `lstat calls: ${counting.calls.filter((c) => c === 'lstat').length}`);
  const files = faultyFs();
  await rejectsCode(walkSite(dir, { limits: { ...DEFAULT_LIMITS, maxFiles: 10 }, fs: files.fs }), 'E_LIMIT');
  assert.ok(files.calls.filter((c) => c === 'lstat').length <= 12);
});

test('validation never modifies the input', async (t) => {
  const dir = await siteWith(t, { '.env': 'X=1', 'img/p.png': PNG_BYTES });
  const before = await snapshot(dir);
  await validateSite(dir);
  assert.deepEqual(await snapshot(dir), before);
});

test('a file swapped for a symlink after the walk is caught when its content is read', async (t) => {
  const dir = await siteWith(t, {});
  const outside = await tmpDir(t);
  await fsp.writeFile(path.join(outside, 'x.js'), 'stolen');
  const realFs = faultyFs();
  /** @type {typeof import('node:fs/promises')} */
  const swapping = new Proxy(realFs.fs, {
    get(target, prop) {
      const v = Reflect.get(target, prop);
      if (prop !== 'open') return v;
      return async (/** @type {any[]} */ ...a) => {
        if (String(a[0]).endsWith(`${path.sep}app.js`)) {
          await fsp.rm(String(a[0]));
          await fsp.symlink(path.join(outside, 'x.js'), String(a[0]));
        }
        return v.apply(target, a);
      };
    },
  });
  const report = await validateSite(dir, { fs: swapping });
  assert.equal(report.ok, false);
  assert.deepEqual(errorsByPath(report)['assets/app.js'], ['changed-during-validation']);
  assert.equal(report.findings.find((f) => f.path === 'assets/app.js')?.code, 'E_SYMLINK');
});
