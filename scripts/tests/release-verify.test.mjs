// Tests for scripts/verify-release.sh and scripts/gen-release-manifest.mjs using a tiny fake release built in a
// temp directory (no web build). Run: node --test scripts/tests/release-verify.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERIFY = join(repo, 'scripts', 'verify-release.sh');
const GEN = join(repo, 'scripts', 'gen-release-manifest.mjs');
const COMMIT = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const VERSION = 'v1.2.3';
const EPOCH = 1700000000;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// Minimal ustar writer so the tests can craft hostile archives without depending on the host tar's behavior.
function tarEntry({ name, type = '0', data = Buffer.alloc(0), linkname = '' }) {
  const h = Buffer.alloc(512, 0);
  const put = (str, off, len) => h.write(str, off, Math.min(Buffer.byteLength(str), len), 'utf8');
  const oct = (n, len) => `${n.toString(8).padStart(len - 1, '0')}\0`;
  put(name, 0, 100);
  put(oct(type === '5' ? 0o755 : 0o644, 8), 100, 8);
  put(oct(0, 8), 108, 8);
  put(oct(0, 8), 116, 8);
  put(oct(type === '0' ? data.length : 0, 12), 124, 12);
  put(oct(EPOCH, 12), 136, 12);
  h.fill(0x20, 148, 156);
  put(type, 156, 1);
  put(linkname, 157, 100);
  put('ustar\0', 257, 6);
  put('00', 263, 2);
  let sum = 0;
  for (const b of h) sum += b;
  put(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
  const body = type === '0' ? Buffer.concat([data, Buffer.alloc((512 - (data.length % 512)) % 512, 0)]) : Buffer.alloc(0);
  return Buffer.concat([h, body]);
}
const makeTarGz = (entries) => gzipSync(Buffer.concat([...entries.map(tarEntry), Buffer.alloc(1024, 0)]));

const GOOD_ENTRIES = [
  { name: 'ghostpay-web/', type: '5' },
  { name: 'ghostpay-web/assets/', type: '5' },
  { name: 'ghostpay-web/assets/app.js', data: Buffer.from('console.log("ghostpay")\n') },
  { name: 'ghostpay-web/index.html', data: Buffer.from('<!doctype html><title>GhostPay</title>\n') },
];

function writeSums(dir, files) {
  writeFileSync(join(dir, 'SHA256SUMS'), files.map((f) => `${sha256(readFileSync(join(dir, f)))}  ${f}\n`).join(''));
}

function genManifest(dir, { tarball, version = VERSION, commit = COMMIT, treeClean = '1', tagCommit = commit }) {
  const r = spawnSync(process.execPath, [GEN, '--out-dir', dir, '--tarball', tarball, '--version', version, '--commit', commit,
    '--source-date-epoch', String(EPOCH), '--lockfile', join(repo, 'package-lock.json'), '--sbom', 'sbom.cdx.json',
    '--tree-clean', treeClean, '--tag-commit', tagCommit], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  writeFileSync(join(dir, 'release-manifest.json'), r.stdout);
  return JSON.parse(r.stdout);
}

// Builds a consistent fake release; options control what is (deliberately) wrong in it.
function makeRelease(opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gp-relv-'));
  const version = opts.version ?? VERSION;
  const tarball = opts.tarballName ?? `ghostpay-web-${version}.tar.gz`;
  writeFileSync(join(dir, tarball), makeTarGz(opts.entries ?? GOOD_ENTRIES));
  writeFileSync(join(dir, 'sbom.cdx.json'), `${JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.5', components: [] }, null, 2)}\n`);
  const manifest = genManifest(dir, { tarball, version, ...opts.manifest });
  writeSums(dir, opts.sums ?? [tarball, 'sbom.cdx.json', 'release-manifest.json']);
  return { dir, tarball, manifest };
}

function verify({ dir, tarball }, { commit = COMMIT, env = {}, manifestArg = true } = {}) {
  const args = [VERIFY, join(dir, tarball), join(dir, 'SHA256SUMS'), commit];
  if (manifestArg) args.push(join(dir, 'release-manifest.json'));
  const r = spawnSync('bash', args, { encoding: 'utf8', env: { ...process.env, ...env } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

function withRelease(opts, fn) {
  const rel = makeRelease(opts);
  try { fn(rel); } finally { rmSync(rel.dir, { recursive: true, force: true }); }
}

const expectFail = (res, pattern) => {
  assert.equal(res.status, 1, res.out);
  assert.match(res.out, /RESULT: FAILED/);
  assert.match(res.out, pattern);
};

test('good path: consistent release-channel artifacts pass (node reader)', () => {
  withRelease({}, (rel) => {
    assert.equal(rel.manifest.channel, 'release');
    assert.equal(rel.manifest.tag, VERSION);
    const res = verify(rel);
    assert.equal(res.status, 0, res.out);
    assert.match(res.out, /RESULT: hash checks passed/);
    assert.doesNotMatch(res.out, /^FAIL/m);
  });
});

test('good path: python3 manifest reader agrees', (t) => {
  if (spawnSync('python3', ['--version']).status !== 0) { t.skip('python3 not installed'); return; }
  withRelease({}, (rel) => {
    const res = verify(rel, { env: { GP_VERIFY_JSON: 'python3' } });
    assert.equal(res.status, 0, res.out);
  });
});

test('the manifest must be named: a 3-argument call is a usage error, never a pass (audit L7-M2)', () => {
  withRelease({}, (rel) => {
    const res = verify(rel, { manifestArg: false });
    assert.equal(res.status, 2, res.out);
    assert.doesNotMatch(res.out, /RESULT: hash checks passed/);
  });
});

test('tampered tarball (after SHA256SUMS was written) is rejected', () => {
  withRelease({}, (rel) => {
    writeFileSync(join(rel.dir, rel.tarball), makeTarGz([...GOOD_ENTRIES, { name: 'ghostpay-web/evil.js', data: Buffer.from('x') }]));
    expectFail(verify(rel), /tarball sha256 .* != SHA256SUMS/);
  });
});

test('tampered tarball with a regenerated SHA256SUMS still fails against the manifest', () => {
  withRelease({}, (rel) => {
    writeFileSync(join(rel.dir, rel.tarball), makeTarGz([...GOOD_ENTRIES, { name: 'ghostpay-web/evil.js', data: Buffer.from('x') }]));
    writeSums(rel.dir, [rel.tarball, 'sbom.cdx.json', 'release-manifest.json']);
    expectFail(verify(rel), /manifest tarball sha256 .* != /);
  });
});

test('tampered manifest is rejected', () => {
  withRelease({}, (rel) => {
    const p = join(rel.dir, 'release-manifest.json');
    const m = JSON.parse(readFileSync(p, 'utf8'));
    m.chains = { deploymentManifests: [{ router: '0x000000000000000000000000000000000000dEaD' }] };
    writeFileSync(p, JSON.stringify(m, null, 2));
    expectFail(verify(rel), /release-manifest\.json hash does not match SHA256SUMS/);
  });
});

test('tampered SBOM is rejected', () => {
  withRelease({}, (rel) => {
    writeFileSync(join(rel.dir, 'sbom.cdx.json'), '{"bomFormat":"CycloneDX","components":[{"name":"evil"}]}\n');
    expectFail(verify(rel), /sbom\.cdx\.json hash does not match SHA256SUMS/);
  });
});

test('SBOM missing from the download is rejected', () => {
  withRelease({}, (rel) => {
    rmSync(join(rel.dir, 'sbom.cdx.json'));
    expectFail(verify(rel), /sbom\.cdx\.json \(sbom\) is missing/);
  });
});

test('SHA256SUMS that omits release-manifest.json is rejected', () => {
  withRelease({ sums: [`ghostpay-web-${VERSION}.tar.gz`, 'sbom.cdx.json'] }, (rel) => {
    expectFail(verify(rel), /SHA256SUMS does not cover release-manifest\.json/);
  });
});

test('SHA256SUMS that omits the SBOM is rejected', () => {
  withRelease({ sums: [`ghostpay-web-${VERSION}.tar.gz`, 'release-manifest.json'] }, (rel) => {
    expectFail(verify(rel), /SHA256SUMS does not cover the SBOM sbom\.cdx\.json/);
  });
});

test('malformed or duplicated SHA256SUMS lines are rejected', () => {
  withRelease({}, (rel) => {
    const p = join(rel.dir, 'SHA256SUMS');
    writeFileSync(p, `${readFileSync(p, 'utf8')}${'0'.repeat(64)}  ../etc/passwd\n`);
    expectFail(verify(rel), /malformed SHA256SUMS line/);
  });
  withRelease({}, (rel) => {
    const p = join(rel.dir, 'SHA256SUMS');
    const first = readFileSync(p, 'utf8').split('\n')[0];
    writeFileSync(p, `${readFileSync(p, 'utf8')}${first}\n`);
    expectFail(verify(rel), /listed twice in SHA256SUMS/);
  });
});

test('missing manifest is rejected (fail closed)', () => {
  withRelease({}, (rel) => {
    rmSync(join(rel.dir, 'release-manifest.json'));
    expectFail(verify(rel), /release manifest not found/);
  });
});

test('manifest commit != expected commit is rejected', () => {
  withRelease({}, (rel) => {
    expectFail(verify(rel, { commit: OTHER }), /manifest commit '.*' != expected b{40}/);
  });
});

test('manifest version != tarball name version is rejected', () => {
  withRelease({}, (rel) => {
    const renamed = 'ghostpay-web-v9.9.9.tar.gz';
    renameSync(join(rel.dir, rel.tarball), join(rel.dir, renamed));
    writeSums(rel.dir, [renamed, 'sbom.cdx.json', 'release-manifest.json']);
    const res = verify({ dir: rel.dir, tarball: renamed });
    expectFail(res, /tarball name ghostpay-web-v9\.9\.9\.tar\.gz != ghostpay-web-v1\.2\.3\.tar\.gz/);
  });
});

test('development-channel manifests are rejected: dirty tree, untagged version, tag on another commit', () => {
  for (const [opts, reason] of [
    [{ manifest: { treeClean: '0' } }, /source tree was dirty/],
    [{ manifest: { treeClean: 'unknown' } }, /tree state unknown/],
    [{ version: 'fc57154', manifest: { tagCommit: 'none' } }, /not a release tag name/],
    [{ manifest: { tagCommit: OTHER } }, /points at b{40}, not the built commit/],
  ]) {
    withRelease(opts, (rel) => {
      assert.equal(rel.manifest.channel, 'development');
      assert.equal(rel.manifest.tag, null);
      assert.ok(rel.manifest.channelReasons.some((r) => reason.test(r)), JSON.stringify(rel.manifest.channelReasons));
      expectFail(verify(rel), /DEVELOPMENT build/);
    });
  }
});

test('manifest without a channel field (pre-channel or edited) is rejected', () => {
  withRelease({}, (rel) => {
    const p = join(rel.dir, 'release-manifest.json');
    const m = JSON.parse(readFileSync(p, 'utf8'));
    delete m.channel;
    writeFileSync(p, JSON.stringify(m, null, 2));
    writeSums(rel.dir, [rel.tarball, 'sbom.cdx.json', 'release-manifest.json']);
    expectFail(verify(rel), /manifest has no channel field/);
  });
});

test('archives with absolute paths, parent paths, symlinks or hardlinks are rejected', () => {
  const cases = [
    [[...GOOD_ENTRIES, { name: '/tmp/ghostpay-evil', data: Buffer.from('x') }], /absolute or parent paths/],
    [[...GOOD_ENTRIES, { name: 'ghostpay-web/../evil', data: Buffer.from('x') }], /absolute or parent paths/],
    [[...GOOD_ENTRIES, { name: 'ghostpay-web/pivot', type: '2', linkname: '../../../etc' }], /links or special files/],
    [[...GOOD_ENTRIES, { name: 'ghostpay-web/same', type: '2', linkname: 'index.html' }], /links or special files/],
    [[...GOOD_ENTRIES, { name: 'ghostpay-web/hard', type: '1', linkname: 'ghostpay-web/index.html' }], /links or special files/],
    [[...GOOD_ENTRIES, { name: 'other-top/x.js', data: Buffer.from('x') }], /top-level entries are not exactly ghostpay-web/],
    [[...GOOD_ENTRIES, { name: 'ghostpay-web/assets/app.js.map', data: Buffer.from('{}') }], /source maps present/],
    [GOOD_ENTRIES.filter((e) => !e.name.endsWith('index.html')), /index\.html missing/],
  ];
  for (const [entries, pattern] of cases) {
    withRelease({ entries }, (rel) => {
      expectFail(verify(rel), pattern);
    });
  }
});

// Ported from the audit L7-M2 regression suite (scripts/tests/verify-release.test.mjs on the combined beta head):
// the same fail-closed cases, built on strict release-channel fixtures so they cannot pass by tripping another check.

/** Rewrites the manifest (and then SHA256SUMS) so only the mutated field is inconsistent. */
function mutateManifest(rel, mutate) {
  const p = join(rel.dir, 'release-manifest.json');
  writeFileSync(p, `${JSON.stringify(mutate(JSON.parse(readFileSync(p, 'utf8'))), null, 2)}\n`);
  writeSums(rel.dir, [rel.tarball, 'sbom.cdx.json', 'release-manifest.json']);
}

/** Replaces the tarball bytes and regenerates manifest + SHA256SUMS so every outer hash stays consistent. */
function replaceTarball(rel, bytes) {
  writeFileSync(join(rel.dir, rel.tarball), bytes);
  genManifest(rel.dir, { tarball: rel.tarball });
  writeSums(rel.dir, [rel.tarball, 'sbom.cdx.json', 'release-manifest.json']);
}

test('L7-M2: an empty manifest commit fails instead of skipping the comparison', () => {
  withRelease({}, (rel) => {
    mutateManifest(rel, (m) => ({ ...m, commit: '' }));
    expectFail(verify(rel), /FAIL {2}manifest commit '' != expected/);
  });
});

test('L7-M2: with neither node nor python3 available the run fails closed', () => {
  withRelease({}, (rel) => {
    const bin = join(rel.dir, 'bin');
    mkdirSync(bin);
    for (const tool of ['sha256sum', 'shasum', 'awk', 'basename', 'dirname', 'tar', 'gzip', 'grep', 'cut', 'sort', 'wc', 'tr', 'cat', 'sed']) {
      const at = spawnSync('bash', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).stdout.trim();
      if (at !== '') symlinkSync(at, join(bin, tool));
    }
    const bash = spawnSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim();
    const r = spawnSync(bash, [VERIFY, join(rel.dir, rel.tarball), join(rel.dir, 'SHA256SUMS'), COMMIT, join(rel.dir, 'release-manifest.json')],
      { encoding: 'utf8', env: { PATH: bin } });
    expectFail({ status: r.status, out: `${r.stdout}${r.stderr}` }, /node or python3 is required to read the manifest/);
  });
});

test('L7-M2: a checksum-consistent empty archive is rejected', () => {
  withRelease({}, (rel) => {
    replaceTarball(rel, makeTarGz([]));
    expectFail(verify(rel), /FAIL {2}tarball is empty/);
  });
});

test('L7-M2: corrupt archive bytes are rejected even when outer hashes match', () => {
  withRelease({}, (rel) => {
    replaceTarball(rel, Buffer.from('not a gzip archive'));
    expectFail(verify(rel), /FAIL {2}tarball is not a readable \.tar\.gz/);
  });
});

test('L7-M2: a nonempty archive without index.html is rejected', () => {
  withRelease({ entries: GOOD_ENTRIES.filter((e) => !e.name.endsWith('index.html')) }, (rel) => {
    expectFail(verify(rel), /FAIL {2}ghostpay-web\/index\.html missing/);
  });
});
