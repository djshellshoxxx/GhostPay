// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { sha256Hex } from '../../src/core/hash.mjs';
import { parseManifest } from '../../src/core/manifest.mjs';
import { packageSite } from '../../src/core/package.mjs';
import { validateSite } from '../../src/core/validate.mjs';
import { readZip } from '../../src/core/zip.mjs';
import { DEFAULT_LIMITS } from '../../src/policy.mjs';
import { faultyFs, goodSite, rejectsCode, snapshot, tmpDir, writeTree } from './helpers.mjs';

/** @typedef {import('../../src/types.mjs').Provenance} Provenance */

/** @type {Provenance} */
const PROVENANCE = { label: 'v0.1.0', sourceDateEpoch: null, source: { kind: 'directory' }, notes: [] };
const EXTRA = [
  { name: 'OPERATOR.md', data: Buffer.from('# Operator\n') },
  { name: 'EXTERNAL-REFERENCES.json', data: Buffer.from('{"references":[]}\n') },
  { name: 'LICENSES/THIRD_PARTY.txt', data: Buffer.from('none\n') },
];

/**
 * @param {import('node:test').TestContext} t
 * @param {Record<string, string | Uint8Array>} [files]
 */
async function makeSite(t, files = goodSite()) {
  const site = await tmpDir(t, 'hk-core-site-');
  await writeTree(site, files);
  return site;
}

/**
 * @param {string} site
 * @param {string} outFile
 * @param {Partial<Parameters<typeof packageSite>[0]>} [over]
 */
async function pack(site, outFile, over = {}) {
  const report = await validateSite(site);
  assert.equal(report.ok, true, JSON.stringify(report.findings));
  return packageSite({ report, outFile, appId: 'ghostpay-web', provenance: PROVENANCE, extraFiles: EXTRA, limits: DEFAULT_LIMITS, allowSourceMaps: false, ...over });
}

test('packages the layout: site/, manifest, extra files, SHA256SUMS (not itself) and a sidecar', async (t) => {
  const site = await makeSite(t);
  const out = await tmpDir(t);
  const res = await pack(site, path.join(out, 'site.zip'));
  assert.equal(res.topDir, 'ghostpay-web-v0.1.0');
  assert.equal(res.archivePath, path.join(await fsp.realpath(out), 'site.zip'));
  const bytes = await fsp.readFile(res.archivePath);
  assert.equal(res.archiveSha256, sha256Hex(bytes));
  assert.equal(await fsp.readFile(res.sidecarPath, 'utf8'), `${res.archiveSha256}  site.zip\n`);
  assert.deepEqual((await fsp.readdir(out)).sort(), ['site.zip', 'site.zip.sha256']);

  const entries = readZip(bytes, { limits: DEFAULT_LIMITS }).entries;
  const names = entries.map((e) => e.name.slice(res.topDir.length + 1));
  const files = goodSite();
  for (const [rel, content] of Object.entries(files)) {
    const e = entries.find((x) => x.name === `${res.topDir}/site/${rel}`);
    assert.ok(e, rel);
    assert.deepEqual(Buffer.from(e.data), Buffer.from(content), `bytes preserved: ${rel}`);
  }
  assert.ok(names.includes('HOSTING-MANIFEST.json') && names.includes('OPERATOR.md') && names.includes('LICENSES/THIRD_PARTY.txt'));
  const sums = Buffer.from(/** @type {any} */ (entries.find((e) => e.name.endsWith('/SHA256SUMS'))).data).toString('utf8');
  const sumLines = sums.trimEnd().split('\n');
  assert.equal(sumLines.length, names.length - 1);
  assert.ok(!sums.includes('SHA256SUMS'));
  for (const line of sumLines) {
    const [hex, p] = line.split('  ');
    const e = entries.find((x) => x.name === `${res.topDir}/${p}`);
    assert.equal(sha256Hex(/** @type {any} */ (e).data), hex, String(p));
  }
  const manifest = parseManifest(/** @type {any} */ (entries.find((e) => e.name.endsWith('/HOSTING-MANIFEST.json'))).data);
  assert.deepEqual(manifest, res.manifest);
  assert.deepEqual(manifest.metadataFiles, ['EXTERNAL-REFERENCES.json', 'HOSTING-MANIFEST.json', 'LICENSES/THIRD_PARTY.txt', 'OPERATOR.md']);
  assert.deepEqual(manifest.trustSensitive, ['deployments/8453.json']);
  assert.ok(!bytes.includes(Buffer.from(site)), 'absolute input path must not appear in the archive');
});

test('packaging never touches the input directory', async (t) => {
  const site = await makeSite(t);
  const before = await snapshot(site);
  const out = await tmpDir(t);
  await pack(site, path.join(out, 'a.zip'));
  assert.deepEqual(await snapshot(site), before);
});

test('deterministic: identical bytes regardless of mtimes, modes, creation order and absolute path', async (t) => {
  const files = goodSite();
  const order = Object.keys(files);
  const siteA = await tmpDir(t, 'hk-core-detA-');
  const siteB = await tmpDir(t, 'hk-core-detB-long-name-');
  await writeTree(siteA, files, order);
  await writeTree(siteB, files, [...order].reverse());
  for (const rel of order) {
    await fsp.utimes(path.join(siteA, rel), new Date('2001-02-03T04:05:06Z'), new Date('2001-02-03T04:05:06Z'));
    await fsp.utimes(path.join(siteB, rel), new Date('2030-12-31T23:59:59Z'), new Date('2030-12-31T23:59:59Z'));
    await fsp.chmod(path.join(siteB, rel), 0o600);
  }
  const out = await tmpDir(t);
  for (const compression of /** @type {const} */ (['deflate', 'store'])) {
    const a = await pack(siteA, path.join(out, `a-${compression}.zip`), { compression });
    const b = await pack(siteB, path.join(out, `b-${compression}.zip`), { compression });
    assert.deepEqual(await fsp.readFile(a.archivePath), await fsp.readFile(b.archivePath), compression);
    assert.equal(a.archiveSha256, b.archiveSha256);
  }
  const d = await pack(siteA, path.join(out, 'd.zip'), { compression: 'deflate' });
  const s = await pack(siteA, path.join(out, 's.zip'), { compression: 'store' });
  assert.equal(d.manifest.content.digest, s.manifest.content.digest);
  assert.notEqual(d.archiveSha256, s.archiveSha256);
});

test('python zipfile reads a packaged archive; extracted bytes equal the input', async (t) => {
  const site = await makeSite(t);
  const out = await tmpDir(t);
  const res = await pack(site, path.join(out, 'a.zip'));
  const dest = path.join(out, 'py');
  execFileSync('python3', ['-c', 'import sys, zipfile\nz = zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nz.extractall(sys.argv[2])', res.archivePath, dest]);
  for (const [rel, content] of Object.entries(goodSite())) {
    assert.deepEqual(await fsp.readFile(path.join(dest, res.topDir, 'site', ...rel.split('/'))), Buffer.from(content), rel);
  }
});

test('refuses a report with errors', async (t) => {
  const site = await makeSite(t, { ...goodSite(), '.env': 'X=1' });
  const report = await validateSite(site);
  assert.equal(report.ok, false);
  const out = await tmpDir(t);
  await rejectsCode(packageSite({ report, outFile: path.join(out, 'a.zip'), appId: 'ghostpay-web', provenance: PROVENANCE, limits: DEFAULT_LIMITS, allowSourceMaps: false }), 'E_POLICY', /report has errors/);
  // A report whose ok flag was forced but which still carries error findings is refused too.
  await rejectsCode(packageSite({ report: { ...report, ok: true }, outFile: path.join(out, 'a.zip'), appId: 'ghostpay-web', provenance: PROVENANCE, limits: DEFAULT_LIMITS, allowSourceMaps: false }), 'E_POLICY');
  assert.deepEqual(await fsp.readdir(out), []);
});

test('refuses a hand-built report that smuggles a disallowed or misplaced entry', async (t) => {
  const site = await makeSite(t, { ...goodSite(), 'run.php': '<?php' });
  const report = await validateSite(site);
  const forged = { ...report, ok: true, findings: [], entries: [...report.entries, { path: 'run.php', size: 5, absPath: path.join(report.siteDir, 'run.php') }] };
  const out = await tmpDir(t);
  const base = { outFile: path.join(out, 'a.zip'), appId: 'ghostpay-web', provenance: PROVENANCE, limits: DEFAULT_LIMITS, allowSourceMaps: false };
  await rejectsCode(packageSite({ ...base, report: forged }), 'E_USAGE', /run\.php.*not inventoried/);
  // An inventoried entry is re-checked against the packaging policy (source maps allowed at validation only).
  const mapSite = await makeSite(t, { ...goodSite(), 'assets/app.js.map': '{"version":3}' });
  const mapReport = await validateSite(mapSite, { allowSourceMaps: true });
  assert.equal(mapReport.ok, true);
  await rejectsCode(packageSite({ ...base, report: mapReport }), 'E_POLICY', /app\.js\.map/);
  const elsewhere = { ...report, ok: true, findings: [], entries: report.entries.map((e) => (e.path === 'LICENSE' ? { ...e, absPath: '/etc/hostname' } : e)) };
  await rejectsCode(packageSite({ ...base, report: elsewhere }), 'E_USAGE', /does not lie at its path/);
});

test('refuses an outFile inside the site directory (also via a symlinked parent)', async (t) => {
  const site = await makeSite(t);
  const report = await validateSite(site);
  const base = { report, appId: 'ghostpay-web', provenance: PROVENANCE, limits: DEFAULT_LIMITS, allowSourceMaps: false };
  const before = await snapshot(site);
  await rejectsCode(packageSite({ ...base, outFile: path.join(site, 'site.zip') }), 'E_USAGE', /inside the site/);
  await rejectsCode(packageSite({ ...base, outFile: path.join(site, 'assets', 'x.zip') }), 'E_USAGE', /inside the site/);
  await rejectsCode(packageSite({ ...base, outFile: site }), 'E_USAGE', /inside the site/);
  const out = await tmpDir(t);
  await fsp.symlink(path.join(site, 'assets'), path.join(out, 'sneaky'));
  await rejectsCode(packageSite({ ...base, outFile: path.join(out, 'sneaky', 'a.zip') }), 'E_USAGE', /inside the site/);
  await rejectsCode(packageSite({ ...base, outFile: path.join(out, 'missing-dir', 'a.zip') }), 'E_USAGE', /does not exist/);
  assert.deepEqual(await snapshot(site), before);
});

test('refuses extra files under site/ or named SHA256SUMS / HOSTING-MANIFEST.json, and bad appId/label', async (t) => {
  const site = await makeSite(t);
  const report = await validateSite(site);
  const out = await tmpDir(t);
  const base = { report, outFile: path.join(out, 'a.zip'), appId: 'ghostpay-web', provenance: PROVENANCE, limits: DEFAULT_LIMITS, allowSourceMaps: false };
  const data = Buffer.from('x');
  for (const name of ['site/index.html', 'SITE/x.txt', 'SHA256SUMS', 'sha256sums', 'HOSTING-MANIFEST.json', 'SHA256SUMS/x']) {
    await rejectsCode(packageSite({ ...base, extraFiles: [{ name, data }] }), 'E_USAGE', undefined);
  }
  await rejectsCode(packageSite({ ...base, extraFiles: [{ name: '../escape.txt', data }] }), 'E_USAGE', /invalid/);
  await rejectsCode(packageSite({ ...base, extraFiles: [{ name: 'A.md', data }, { name: 'a.md', data }] }), 'E_USAGE', /collides/);
  await rejectsCode(packageSite({ ...base, appId: 'Not Valid' }), 'E_USAGE', /appId/);
  await rejectsCode(packageSite({ ...base, provenance: { ...PROVENANCE, label: 'x'.repeat(200) } }), 'E_USAGE', /label/);
  await rejectsCode(packageSite({ ...base, provenance: { ...PROVENANCE, label: 'release 1/2 ü' } }), 'E_USAGE', /label/);
  await rejectsCode(packageSite({ ...base, appId: 'a'.repeat(80), provenance: { ...PROVENANCE, label: 'b'.repeat(64) } }), 'E_USAGE', /top directory/);
});

test('detects a file that changed between validation and packaging', async (t) => {
  const site = await makeSite(t);
  const report = await validateSite(site);
  const out = await tmpDir(t);
  await fsp.appendFile(path.join(site, 'assets', 'app.js'), '// changed');
  const base = { report, outFile: path.join(out, 'a.zip'), appId: 'ghostpay-web', provenance: PROVENANCE, limits: DEFAULT_LIMITS, allowSourceMaps: false };
  await rejectsCode(packageSite(base), 'E_VERIFY', /changed since it was inventoried/);
  await fsp.writeFile(path.join(site, 'assets', 'app.js'), goodSite()['assets/app.js'] ?? '');
  await fsp.rm(path.join(site, 'LICENSE'));
  await fsp.symlink('/etc/hostname', path.join(site, 'LICENSE'));
  await rejectsCode(packageSite(base), 'E_SYMLINK');
  assert.deepEqual(await fsp.readdir(out), []);
});

test('interrupted writes: a failure at any fs call leaves the previous archive and sidecar intact, no temporaries', async (t) => {
  const site = await makeSite(t);
  const report = await validateSite(site);
  const out = await tmpDir(t);
  const outFile = path.join(out, 'a.zip');
  const base = { report, outFile, appId: 'ghostpay-web', provenance: PROVENANCE, extraFiles: EXTRA, limits: DEFAULT_LIMITS, allowSourceMaps: false };
  const old = await packageSite({ ...base, provenance: { ...PROVENANCE, notes: ['old build'] } });
  const oldArchive = await fsp.readFile(old.archivePath);
  const oldSidecar = await fsp.readFile(old.sidecarPath);
  const probe = faultyFs();
  const fresh = await packageSite({ ...base, fs: probe.fs });
  assert.notEqual(fresh.archiveSha256, old.archiveSha256);
  const total = probe.calls.length;
  let threwCount = 0;
  for (let k = 1; k <= total; k++) {
    await fsp.writeFile(outFile, oldArchive);
    await fsp.writeFile(`${outFile}.sha256`, oldSidecar);
    const faulty = faultyFs(k);
    let threw = false;
    try {
      await packageSite({ ...base, fs: faulty.fs });
    } catch {
      threw = true;
      threwCount++;
    }
    const op = faulty.failed();
    const archive = await fsp.readFile(outFile);
    const sidecar = await fsp.readFile(`${outFile}.sha256`, 'utf8');
    if (threw) {
      assert.deepEqual(archive, oldArchive, `archive after failing ${op} (#${k})`);
      assert.deepEqual(Buffer.from(sidecar), oldSidecar, `sidecar after failing ${op} (#${k})`);
    } else {
      assert.equal(sidecar, `${sha256Hex(archive)}  a.zip\n`, `consistent pair after failing ${op} (#${k})`);
      assert.equal(sha256Hex(archive), fresh.archiveSha256);
    }
    if (op !== 'rm') assert.deepEqual((await fsp.readdir(out)).sort(), ['a.zip', 'a.zip.sha256'], `leftovers after failing ${op} (#${k})`);
    else for (const n of await fsp.readdir(out)) if (n.startsWith('.')) await fsp.rm(path.join(out, n));
  }
  assert.ok(threwCount > 10, `only ${threwCount} of ${total} injected failures propagated`);
});

test('coreutils sha256sum accepts the sidecar and SHA256SUMS formats', async (t) => {
  try {
    execFileSync('sha256sum', ['--version'], { stdio: 'ignore' });
  } catch {
    t.skip('sha256sum not installed');
    return;
  }
  const site = await makeSite(t);
  const out = await tmpDir(t);
  const res = await pack(site, path.join(out, 'a.zip'));
  execFileSync('sha256sum', ['--check', '--strict', 'a.zip.sha256'], { cwd: out, stdio: 'pipe' });
  const dest = path.join(out, 'x');
  execFileSync('python3', ['-c', 'import sys, zipfile\nzipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', res.archivePath, dest]);
  const outText = execFileSync('sha256sum', ['--check', '--strict', 'SHA256SUMS'], { cwd: path.join(dest, res.topDir), encoding: 'utf8' });
  assert.equal(outText.trimEnd().split('\n').length, Object.keys(goodSite()).length + EXTRA.length + 1);
});
