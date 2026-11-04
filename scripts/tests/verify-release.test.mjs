// Regression tests for scripts/verify-release.sh (audit L7-M2): the expected commit is always compared with the
// commit recorded in release-manifest.json, and a run that cannot compare it fails instead of passing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../verify-release.sh', import.meta.url));
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const TARBALL = 'ghostpay-web-v1.0.0.tar.gz';

/** A release directory: tarball, SHA256SUMS and a manifest built from the tarball hash by `manifest`. */
function withRelease(manifest, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'gp-verify-release-'));
  try {
    mkdirSync(join(dir, 'src', 'ghostpay-web'), { recursive: true });
    writeFileSync(join(dir, 'src', 'ghostpay-web', 'index.html'), '<!doctype html><title>x</title>');
    execFileSync('tar', ['-czf', join(dir, TARBALL), '-C', join(dir, 'src'), 'ghostpay-web']);
    const sha = createHash('sha256').update(readFileSync(join(dir, TARBALL))).digest('hex');
    writeFileSync(join(dir, 'SHA256SUMS'), `${sha}  ${TARBALL}\n`);
    writeFileSync(join(dir, 'release-manifest.json'), JSON.stringify(manifest(sha)));
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const bash = execFileSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).trim();
const verify = (dir, args, env = process.env) => spawnSync(bash, [script, ...args], { cwd: dir, encoding: 'utf8', env });
const good = (sha) => ({ commit: COMMIT, artifacts: [{ kind: 'web-bundle-tarball', sha256: sha }] });

test('verify-release.sh requires the manifest: a 3-argument call is a usage error (audit L7-M2)', () => {
  withRelease(good, (dir) => {
    const r = verify(dir, [TARBALL, 'SHA256SUMS', COMMIT]);
    assert.equal(r.status, 2, r.stdout);
    assert.doesNotMatch(r.stdout, /RESULT: hash checks passed/);
  });
});

test('verify-release.sh compares the expected commit with the manifest', () => {
  withRelease(good, (dir) => {
    const ok = verify(dir, [TARBALL, 'SHA256SUMS', COMMIT, 'release-manifest.json']);
    assert.equal(ok.status, 0, ok.stdout);
    assert.match(ok.stdout, /PASS {2}manifest commit equals expected commit/);
    const wrong = verify(dir, [TARBALL, 'SHA256SUMS', 'a'.repeat(40), 'release-manifest.json']);
    assert.equal(wrong.status, 1);
    assert.match(wrong.stdout, /FAIL {2}manifest commit 0123456789abcdef0123456789abcdef01234567 != expected a{40}/);
  });
});

test('verify-release.sh fails when the manifest commit is empty instead of skipping the comparison', () => {
  withRelease((sha) => ({ ...good(sha), commit: '' }), (dir) => {
    const r = verify(dir, [TARBALL, 'SHA256SUMS', COMMIT, 'release-manifest.json']);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /FAIL {2}manifest commit could not be read/);
  });
});

test('verify-release.sh fails when neither node nor python3 can read the manifest', () => {
  withRelease(good, (dir) => {
    // A PATH with only the tools the script needs besides a JSON reader.
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    for (const tool of ['sha256sum', 'awk', 'basename', 'dirname', 'tar', 'gzip', 'grep', 'cut', 'sort', 'wc', 'tr', 'cat', 'sed']) {
      const at = spawnSync(bash, ['-c', `command -v ${tool}`], { encoding: 'utf8' }).stdout.trim();
      if (at !== '') symlinkSync(at, join(bin, tool));
    }
    const r = verify(dir, [TARBALL, 'SHA256SUMS', COMMIT, 'release-manifest.json'], { PATH: bin });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /FAIL {2}manifest commit could not be read \(needs node or python3\): expected commit NOT compared/);
  });
});
