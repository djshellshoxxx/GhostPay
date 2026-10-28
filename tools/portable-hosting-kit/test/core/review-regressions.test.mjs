// @ts-check
// Regression tests for the independent review (PoCs in /tmp/hk-review/poc*.mjs, findings 1-5 of the core).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { buildManifest, parseManifest, serializeManifest } from '../../src/core/manifest.mjs';
import { packageSite } from '../../src/core/package.mjs';
import { validateSite } from '../../src/core/validate.mjs';
import { extractArchive, verifyArchive } from '../../src/core/verify.mjs';
import { createZip, readZip } from '../../src/core/zip.mjs';
import { DEFAULT_LIMITS } from '../../src/policy.mjs';
import { faultyFs, forgeEntries, rejectsCode, snapshot, throwsCode, tmpDir, writeTree } from './helpers.mjs';
import { buildZip } from './zip-builder.mjs';

/** @typedef {import('../../src/types.mjs').Provenance} Provenance */
/** @type {Provenance} */
const PROVENANCE = { label: 'v1', sourceDateEpoch: null, source: { kind: 'directory' }, notes: [] };
const ESC = '\u001b';

// ---------------------------------------------------------------------------------------------------------------
// Finding 1 (poc2-3.mjs): extractArchive must never replace a directory whose name the archive chooses.

/**
 * A forged, self-consistent archive whose top directory is "tor-ghostpay-site" (the CLI's default Tor data dir name).
 * @param {string} dir
 */
async function forgedTorArchive(dir) {
  const file = path.join(dir, 'evil.zip');
  await fsp.writeFile(file, createZip(await forgeEntries({ appId: 'tor', label: 'ghostpay-site', site: { 'index.html': '<!doctype html>' } }), { compression: 'store' }));
  return file;
}

test('poc3: extractArchive refuses when <destDir>/<topDir> already exists and leaves it untouched', async (t) => {
  const dir = await tmpDir(t);
  const evil = await forgedTorArchive(dir);
  assert.equal((await verifyArchive(evil)).ok, true, 'the forgery is self-consistent');
  const dest = path.join(dir, 'srv');
  const victim = path.join(dest, 'tor-ghostpay-site');
  await fsp.mkdir(path.join(victim, 'hs'), { recursive: true });
  await fsp.writeFile(path.join(victim, 'hs', 'hs_ed25519_secret_key'), 'IDENTITY');
  const before = await snapshot(dest);
  await rejectsCode(extractArchive(evil, dest), 'E_USAGE', /already exists/);
  assert.deepEqual(await snapshot(dest), before);

  // An empty directory, a file or a symlink with that name are refused too.
  await fsp.rm(victim, { recursive: true });
  for (const make of [() => fsp.mkdir(victim), () => fsp.writeFile(victim, 'x'), () => fsp.symlink(path.join(dir, 'elsewhere'), victim)]) {
    await make();
    const snap = await snapshot(dest);
    await rejectsCode(extractArchive(evil, dest), 'E_USAGE', /already exists/);
    assert.deepEqual(await snapshot(dest), snap);
    await fsp.rm(victim, { recursive: true, force: true });
  }
});

test('poc3 race: a directory created at the target while extracting is never replaced', async (t) => {
  const dir = await tmpDir(t);
  const evil = await forgedTorArchive(dir);
  const dest = path.join(dir, 'srv');
  await fsp.mkdir(dest);
  const victim = path.join(dest, 'tor-ghostpay-site');
  const base = faultyFs();
  /** @type {typeof import('node:fs/promises')} */
  const racing = new Proxy(base.fs, {
    get(target, prop) {
      const v = Reflect.get(target, prop);
      if (prop !== 'mkdtemp') return v;
      return async (/** @type {any[]} */ ...a) => {
        // After the existence check, before the extracted tree is moved into place.
        await fsp.mkdir(path.join(victim, 'hs'), { recursive: true });
        await fsp.writeFile(path.join(victim, 'hs', 'hs_ed25519_secret_key'), 'IDENTITY');
        return v.apply(target, a);
      };
    },
  });
  await rejectsCode(extractArchive(evil, dest, { fs: racing }), 'E_USAGE', /already exists/);
  assert.equal(await fsp.readFile(path.join(victim, 'hs', 'hs_ed25519_secret_key'), 'utf8'), 'IDENTITY');
  assert.deepEqual(await fsp.readdir(dest), ['tor-ghostpay-site']);
  assert.deepEqual(await fsp.readdir(victim), ['hs']);
});

test('extractArchive into a fresh destination still works and leaves no temporaries', async (t) => {
  const dir = await tmpDir(t);
  const evil = await forgedTorArchive(dir);
  const dest = path.join(dir, 'fresh');
  const { topDir, result } = await extractArchive(evil, dest);
  assert.equal(result.ok, true);
  assert.deepEqual(await fsp.readdir(dest), ['tor-ghostpay-site']);
  assert.equal(topDir, path.join(await fsp.realpath(dest), 'tor-ghostpay-site'));
});

// ---------------------------------------------------------------------------------------------------------------
// Finding 2 (poc1-symlink-host.mjs): symlink modes are rejected for every made-by host.

for (const host of [0, 2, 3, 5, 10, 16, 19, 30]) {
  test(`poc1: a symlink entry with made-by host ${host} fails verification`, async (t) => {
    const dir = await tmpDir(t);
    const entries = await forgeEntries({ site: { 'index.html': '<!doctype html>', 'leak.txt': '../../../../../../etc/passwd' } });
    const raw = entries.map((e) => (e.name.endsWith('/leak.txt') ? { ...e, madeBy: (host << 8) | 20, externalAttr: (0o120777 << 16) >>> 0 } : e));
    const file = path.join(dir, 'a.zip');
    await fsp.writeFile(file, buildZip(raw));
    const r = await verifyArchive(file);
    assert.equal(r.ok, false);
    assert.equal(r.errors[0]?.code, 'E_ARCHIVE');
    assert.match(String(r.errors[0]?.message), /symlink/);
  });
}

test('special files, setuid/setgid/sticky bits and type/name mismatches are rejected for every host', () => {
  for (const host of [0, 2, 10, 30]) {
    const madeBy = (host << 8) | 20;
    throwsCode(() => readZip(buildZip([{ name: 'top/fifo', madeBy, externalAttr: (0o010644 << 16) >>> 0 }]), { limits: DEFAULT_LIMITS }), 'E_ARCHIVE', /special-file/);
    throwsCode(() => readZip(buildZip([{ name: 'top/suid', data: 'x', madeBy, externalAttr: (0o104755 << 16) >>> 0 }]), { limits: DEFAULT_LIMITS }), 'E_ARCHIVE', /setuid/);
    throwsCode(() => readZip(buildZip([{ name: 'top/d/', madeBy, externalAttr: (0o100644 << 16) >>> 0 }]), { limits: DEFAULT_LIMITS }), 'E_ARCHIVE', /type bits/);
  }
  // Plain DOS attributes (high word 0) remain acceptable.
  assert.equal(readZip(buildZip([{ name: 'top/a.txt', data: 'x', madeBy: 20, externalAttr: 0x20 }]), { limits: DEFAULT_LIMITS }).entries.length, 1);
});

// ---------------------------------------------------------------------------------------------------------------
// Finding 3 (poc4-race.mjs): packaging re-checks identity, parents and secrets on the exact stored bytes.

/**
 * @param {import('node:test').TestContext} t
 */
async function raceSite(t) {
  const dir = await tmpDir(t);
  const site = path.join(dir, 'site');
  await writeTree(site, { 'index.html': '<!doctype html>', 'assets/cfg.js': 'const k = "XXXXXXXXXXXXXXXXXXXX";\n' });
  const report = await validateSite(site);
  assert.equal(report.ok, true);
  const base = { report, outFile: path.join(dir, 'a.zip'), appId: 'ghostpay-web', provenance: PROVENANCE, limits: DEFAULT_LIMITS, allowSourceMaps: false };
  return { dir, site, report, base };
}
const SECRET_JS = 'const k = "AKIAABCDEFGHIJKLMNOP";\n';

test('poc4: a same-size rewrite after validation is refused', async (t) => {
  const { dir, site, base } = await raceSite(t);
  await fsp.writeFile(path.join(site, 'assets', 'cfg.js'), SECRET_JS);
  await assert.rejects(packageSite(base), (/** @type {any} */ e) => ['E_VERIFY', 'E_SECRET'].includes(e.code));
  assert.deepEqual(await fsp.readdir(dir), ['site']);
});

test('poc4: a rewrite that restores size and mtime is caught by ctime/inode identity', async (t) => {
  const { dir, site, base } = await raceSite(t);
  const f = path.join(site, 'assets', 'cfg.js');
  const st = await fsp.stat(f);
  await fsp.writeFile(path.join(site, 'assets', 'tmp.js'), SECRET_JS);
  await fsp.rename(path.join(site, 'assets', 'tmp.js'), f);
  await fsp.utimes(f, st.atime, st.mtime);
  await rejectsCode(packageSite(base), 'E_VERIFY', /changed since it was inventoried/);
  assert.deepEqual(await fsp.readdir(dir), ['site']);
});

test('poc4: secrets in the exact bytes read by packageSite are refused even if metadata looks unchanged', async (t) => {
  const { dir, base } = await raceSite(t);
  // Simulate a filesystem that changes content without updating metadata: reads of cfg.js return secret bytes.
  const real = faultyFs();
  /** @type {typeof import('node:fs/promises')} */
  const lying = new Proxy(real.fs, {
    get(target, prop) {
      const v = Reflect.get(target, prop);
      if (prop !== 'open') return v;
      return async (/** @type {any[]} */ ...a) => {
        const fh = await v.apply(target, a);
        if (!String(a[0]).endsWith('cfg.js')) return fh;
        return new Proxy(fh, {
          get(ht, hp) {
            const hv = Reflect.get(ht, hp);
            if (hp !== 'read') return typeof hv === 'function' ? hv.bind(ht) : hv;
            return async (/** @type {Buffer} */ buf, /** @type {number} */ off, /** @type {number} */ len, /** @type {number} */ pos) => {
              const r = await hv.call(ht, buf, off, len, pos);
              if (r.bytesRead > 0 && pos === 0) Buffer.from(SECRET_JS).copy(buf, off, 0, r.bytesRead);
              return r;
            };
          },
        });
      };
    },
  });
  await rejectsCode(packageSite({ ...base, fs: lying }), 'E_SECRET', /aws-access-key-id/);
  assert.deepEqual(await fsp.readdir(dir), ['site']);
});

test('poc4b: a parent directory swapped for a symlink after validation is not followed', async (t) => {
  const { dir, site, base } = await raceSite(t);
  const outside = path.join(dir, 'outside');
  await fsp.mkdir(outside);
  await fsp.writeFile(path.join(outside, 'cfg.js'), 'const k = "XXXXXXXXXXXXXXXXXXXX";\n');
  await fsp.rm(path.join(site, 'assets'), { recursive: true });
  await fsp.symlink(outside, path.join(site, 'assets'));
  await rejectsCode(packageSite(base), 'E_SYMLINK', /assets/);
  assert.deepEqual((await fsp.readdir(dir)).sort(), ['outside', 'site']);
  // Swapped for a different real directory (same names, new inodes): refused as changed.
  await fsp.rm(path.join(site, 'assets'));
  await fsp.mkdir(path.join(site, 'assets'));
  await fsp.writeFile(path.join(site, 'assets', 'cfg.js'), 'const k = "XXXXXXXXXXXXXXXXXXXX";\n');
  await rejectsCode(packageSite(base), 'E_VERIFY', /changed/);
});

test('packageSite refuses report entries that validateSite did not inventory in this process', async (t) => {
  const { base, report } = await raceSite(t);
  const copied = { ...report, entries: report.entries.map((e) => ({ ...e })) };
  await rejectsCode(packageSite({ ...base, report: copied }), 'E_USAGE', /not inventoried/);
});

// ---------------------------------------------------------------------------------------------------------------
// Finding 4 (poc2-3.mjs): an archive with only directory entries yields a failed result, not a crash.

test('poc2: an archive with only directory entries fails verification with E_ARCHIVE', async (t) => {
  const dir = await tmpDir(t);
  const file = path.join(dir, 'dirs.zip');
  await fsp.writeFile(file, buildZip([{ name: 'top/', externalAttr: (0o40755 << 16) >>> 0 }, { name: 'top/site/', externalAttr: (0o40755 << 16) >>> 0 }]));
  const r = await verifyArchive(file);
  assert.equal(r.ok, false);
  assert.equal(r.errors[0]?.code, 'E_ARCHIVE');
  assert.match(String(r.errors[0]?.message), /no files/);
  await rejectsCode(extractArchive(file, path.join(dir, 'x')), 'E_VERIFY');
});

// ---------------------------------------------------------------------------------------------------------------
// Finding 5 (poc9-esc.mjs): no raw control characters in messages; strict provenance label and notes.

const EVIL_NAME = `top/a.txt${ESC}[1A${ESC}[2K\rOK: release.zip\n${ESC}[8m\u009b\u202e`;

/** @param {string} message */
function assertNoRawControls(message) {
  // eslint-disable-next-line no-control-regex
  assert.doesNotMatch(message, /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/, JSON.stringify(message));
}

test('poc9: raw entry names never reach error messages unescaped', () => {
  const cases = [
    buildZip([{ name: EVIL_NAME, data: 'x', both: { flags: 0x0801 } }]),
    buildZip([{ name: EVIL_NAME, data: 'x', both: { flags: 0x0810 } }]),
    buildZip([{ name: EVIL_NAME, data: 'x', both: { flags: 0x0808 } }]),
    buildZip([{ name: EVIL_NAME, data: 'x', externalAttr: (0o120777 << 16) >>> 0 }]),
    buildZip([{ name: EVIL_NAME, data: 'x', method: 12 }]),
    buildZip([{ name: EVIL_NAME, data: 'x', both: { versionNeeded: 45 } }]),
    buildZip([{ name: EVIL_NAME, data: 'x', both: { extra: Buffer.from([1, 0, 0, 0]) } }]),
    buildZip([{ name: EVIL_NAME, data: 'x', comment: Buffer.from('c') }]),
    buildZip([{ name: `${EVIL_NAME}/`, data: 'x', externalAttr: (0o40755 << 16) >>> 0 }]),
    buildZip([{ name: EVIL_NAME, data: Buffer.alloc(DEFAULT_LIMITS.maxFileBytes + 1), method: 8 }]),
    buildZip([{ name: EVIL_NAME, data: 'x' }]),
    buildZip([{ name: EVIL_NAME, data: 'x', local: { crc: 1 } }]),
  ];
  for (const zip of cases) {
    try {
      readZip(zip, { limits: DEFAULT_LIMITS });
      assert.fail('expected rejection');
    } catch (e) {
      assertNoRawControls(/** @type {Error} */ (e).message);
    }
  }
});

test('poc9: finding messages about on-disk names are escaped', async (t) => {
  const dir = await tmpDir(t);
  await writeTree(dir, { 'index.html': '<!doctype html>' });
  await fsp.writeFile(path.join(dir, `x${ESC}[2J.html`), 'a');
  await fsp.writeFile(path.join(dir, `X${ESC}[2J.html`), 'b');
  const report = await validateSite(dir);
  assert.equal(report.ok, false);
  for (const f of report.findings) assertNoRawControls(f.message);
});

test('poc9: provenance label and notes are restricted (build and parse)', () => {
  const input = {
    appId: 'ghostpay-web', entrypoint: 'index.html', records: [{ path: 'index.html', size: 1, sha256: 'a'.repeat(64) }], limits: DEFAULT_LIMITS,
    allowSourceMaps: false, provenance: PROVENANCE, trustSensitive: [], metadataFiles: ['HOSTING-MANIFEST.json'],
  };
  for (const label of [`v1${ESC}[2J`, 'v1\n', '-v1', '', 'a b', 'x'.repeat(65), 'r\u00e9lease']) {
    throwsCode(() => buildManifest({ ...input, provenance: { ...PROVENANCE, label } }), 'E_USAGE', /label/);
  }
  for (const note of [`a${ESC}[2J`, 'line\nbreak', 'tab\there', 'x'.repeat(501), 'bidi\u202e', 'c1\u0085']) {
    throwsCode(() => buildManifest({ ...input, provenance: { ...PROVENANCE, notes: [note] } }), 'E_USAGE', /notes/);
  }
  assert.equal(buildManifest({ ...input, provenance: { ...PROVENANCE, label: 'v0.1.0-rc_1', notes: ['x'.repeat(500), 'built by ci \u00e9'] } }).provenance.label, 'v0.1.0-rc_1');
  const good = Buffer.from(serializeManifest(buildManifest(input))).toString('utf8');
  throwsCode(() => parseManifest(Buffer.from(good.replace('"label": "v1"', '"label": "v1\\u001b[2J"'))), 'E_VERIFY', /label/);
  // Unknown field names from a hostile manifest are escaped in messages.
  try {
    parseManifest(Buffer.from(good.replace('"appId":', '"x\\u001b[2J": 1,\n  "appId":')));
    assert.fail('expected rejection');
  } catch (e) {
    assertNoRawControls(/** @type {Error} */ (e).message);
  }
});

test('packageSite refuses a label outside [A-Za-z0-9._-] early', async (t) => {
  const { base } = await raceSite(t);
  await rejectsCode(packageSite({ ...base, provenance: { ...PROVENANCE, label: `v1${ESC}[2J` } }), 'E_USAGE', /label/);
});

// ---------------------------------------------------------------------------------------------------------------
// Second review pass (r2-pocBCD.mjs C2): "$" starts an nginx variable, so it is rejected in every path.

test('r2 C2: a site file or directory named with "$" is rejected by validation', async (t) => {
  const dir = await tmpDir(t);
  await writeTree(dir, { 'index.html': '<!doctype html>', 'pay$/index.html': 'x', 'a$b.js': 'x' });
  const report = await validateSite(dir);
  assert.equal(report.ok, false);
  const byPath = Object.fromEntries(report.findings.map((f) => [f.path, f]));
  assert.equal(byPath['pay$']?.rule, 'nginx-special-char');
  assert.equal(byPath['a$b.js']?.rule, 'nginx-special-char');
  assert.equal(byPath['a$b.js']?.code, 'E_PATH');
  assert.match(String(byPath['a$b.js']?.message), /nginx/);
  assert.deepEqual(report.entries.map((e) => e.path), ['index.html']);
  assert.deepEqual((await validateSite(dir, { entrypoint: 'pay$/index.html' })).findings.find((f) => f.rule === 'entrypoint-invalid')?.path, 'pay$/index.html');
});

test('r2 C2: readZip rejects an entry named with "$"', () => {
  throwsCode(() => readZip(buildZip([{ name: 'top/site/pay$/index.html', data: 'x' }]), { limits: DEFAULT_LIMITS }), 'E_PATH', /nginx/);
  throwsCode(() => readZip(buildZip([{ name: 'top$/a.txt', data: 'x' }]), { limits: DEFAULT_LIMITS }), 'E_PATH', /nginx/);
});
