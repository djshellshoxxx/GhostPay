// node --test scripts/pages/verify-pages-artifact.test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { verifyPagesArtifact } from './verify-pages-artifact.mjs';

const COMMIT = 'a'.repeat(40);
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gp-pages-verify-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const site = join(root, 'site');
  mkdirSync(join(site, 'assets'), { recursive: true });
  writeFileSync(join(site, '.nojekyll'), '');
  writeFileSync(join(site, 'build-info.json'), JSON.stringify({ app: 'ghostpay-web', commit: COMMIT }));
  writeFileSync(join(site, 'index.html'), '<html></html>');
  writeFileSync(join(site, 'assets', 'app.js'), 'console.log(1)');
  const sums = join(root, 'SHA256SUMS');
  const paths = ['.nojekyll', 'assets/app.js', 'build-info.json', 'index.html'];
  const produce = () => writeFileSync(sums, paths.map((p) => createHash('sha256').update(readFileSync(join(site, p))).digest('hex') + '  ./' + p).join('\n') + '\n');
  produce();
  return { site, sums, paths, produce };
}

test('accepts a complete intact Pages artifact with an exact commit', (t) => {
  const { site, sums } = fixture(t);
  assert.deepEqual(verifyPagesArtifact(site, sums, { expectedCommit: COMMIT }), { problems: [], verified: 4 });
});

test('fails on modified, missing or unlisted files', (t) => {
  const { site, sums } = fixture(t);
  writeFileSync(join(site, 'assets', 'app.js'), 'tampered');
  assert.ok(verifyPagesArtifact(site, sums).problems.some((p) => p.includes('SHA-256 mismatch')));
  unlinkSync(join(site, 'assets', 'app.js'));
  assert.ok(verifyPagesArtifact(site, sums).problems.some((p) => p.includes('listed file missing')));
  writeFileSync(join(site, 'unexpected.js'), 'extra');
  assert.ok(verifyPagesArtifact(site, sums).problems.some((p) => p.includes('unlisted artifact file')));
});

test('rejects path traversal, duplicate, noncanonical and unsorted checksum records', (t) => {
  const { site, sums } = fixture(t);
  const original = readFileSync(sums, 'utf8');
  for (const bad of [
    '0'.repeat(64) + '  ./../escape\n',
    '0'.repeat(64) + '  .//tmp/path\n',
    '0'.repeat(64) + '  ./assets\\app.js\n',
    '0'.repeat(64) + '  ././assets/app.js\n',
    '0'.repeat(64) + '  ./assets/app.js\n' + '0'.repeat(64) + '  ./assets/app.js\n',
    original.split('\n').filter(Boolean).reverse().join('\n') + '\n',
    original.replaceAll('\n', '\r\n'),
    original.slice(0, -1),
    '',
  ]) {
    writeFileSync(sums, bad);
    assert.notEqual(verifyPagesArtifact(site, sums).problems.length, 0, JSON.stringify(bad));
  }
});

test('refuses symlinks in the release and symlinked checksum manifests', (t) => {
  const { site, sums } = fixture(t);
  symlinkSync('/etc/passwd', join(site, 'public.txt'));
  assert.ok(verifyPagesArtifact(site, sums).problems.some((p) => p.includes('symlink refused')));
  const alias = sums + '.link';
  symlinkSync(sums, alias);
  assert.ok(verifyPagesArtifact(site, alias).problems.some((p) => p.includes('must be a regular file')));
});

test('enforces required Pages files and exact build source', (t) => {
  const { site, sums } = fixture(t);
  assert.ok(verifyPagesArtifact(site, sums, { expectedCommit: 'b'.repeat(40) }).problems.some((p) => p.includes('unexpected source commit')));
  assert.ok(verifyPagesArtifact(site, sums, { expectedCommit: 'short' }).problems.some((p) => p.includes('full 40-hex')));
  unlinkSync(join(site, '.nojekyll'));
  assert.ok(verifyPagesArtifact(site, sums).problems.some((p) => p.includes('required Pages file missing')));
});
