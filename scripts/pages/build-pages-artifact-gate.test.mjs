// Execute the real builder's final promotion block against staged artifacts.
// This avoids rebuilding Vite for every fault while retaining the real verifier,
// shell fail-closed behavior, exact source binding and final output moves.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const COMMIT = 'a'.repeat(40);
const script = readFileSync(new URL('./build-pages.sh', import.meta.url), 'utf8');
const marker = 'cp "$log" "$evidence/build.log"';
assert.equal(script.split(marker).length, 2, 'exactly one final promotion block');
const promote = script.slice(script.indexOf(marker));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ghostpay-pages-gate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const site = join(root, '.work', 'site');
  const evidence = join(root, '.work', 'evidence');
  const out = join(root, 'output');
  for (const path of [site, evidence, out]) mkdirSync(path, { recursive: true });
  const contents = {
    '.nojekyll': '',
    'app.js': 'export const example = 1;\n',
    'build-info.json': JSON.stringify({ app: 'ghostpay-web', commit: COMMIT }),
    'index.html': '<!doctype html><title>GhostPay gate fixture</title>',
  };
  for (const [path, bytes] of Object.entries(contents)) writeFileSync(join(site, path), bytes);
  const sums = join(evidence, 'SHA256SUMS');
  const writeSums = () => writeFileSync(sums, Object.keys(contents).sort().map((path) =>
    createHash('sha256').update(readFileSync(join(site, path))).digest('hex') + '  ./' + path,
  ).join('\n') + '\n');
  writeSums();
  const log = join(root, '.work', 'build.log');
  writeFileSync(log, 'synthetic build-stage evidence\n');
  const run = () => spawnSync('bash', ['-c', 'set -euo pipefail\n' + promote], {
    cwd: ROOT,
    env: { ...process.env, ROOT, site, evidence, out, log, commit: COMMIT, PATH: dirname(process.execPath) + ':' + process.env.PATH },
    encoding: 'utf8',
    timeout: 10_000,
  });
  return { site, evidence, out, sums, writeSums, run };
}

test('the builder promotes an intact exact-source artifact after independent verification', (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Pages artifact verified: 4 files match trusted SHA256SUMS\./);
  assert.equal(existsSync(join(f.out, 'site', 'index.html')), true);
  assert.equal(existsSync(join(f.out, 'evidence', 'SHA256SUMS')), true);
  assert.match(readFileSync(join(f.out, 'evidence', 'artifact-verification.log'), 'utf8'), /4 files match/);
});

for (const [name, corrupt, reason] of [
  ['modified bytes', (f) => writeFileSync(join(f.site, 'app.js'), 'changed after checksum generation'), /SHA-256 mismatch/],
  ['unlisted file', (f) => writeFileSync(join(f.site, 'unexpected.js'), 'unreviewed'), /unlisted artifact file/],
  ['missing file', (f) => unlinkSync(join(f.site, 'app.js')), /listed file missing/],
  ['symlink', (f) => symlinkSync('app.js', join(f.site, 'alias.js')), /symlink refused/],
  ['duplicate checksum', (f) => {
    const text = readFileSync(f.sums, 'utf8');
    writeFileSync(f.sums, text + text.split('\n')[0] + '\n');
  }, /duplicate SHA256SUMS record/],
  ['wrong source with matching checksums', (f) => {
    writeFileSync(join(f.site, 'build-info.json'), JSON.stringify({ app: 'ghostpay-web', commit: 'b'.repeat(40) }));
    f.writeSums();
  }, /unexpected source commit/],
]) {
  test(`the builder refuses promotion for ${name}`, (t) => {
    const f = fixture(t);
    corrupt(f);
    const result = f.run();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, reason);
    assert.equal(existsSync(join(f.out, 'site')), false, 'rejected site must not be promoted');
    assert.equal(existsSync(join(f.out, 'evidence')), false, 'rejected evidence must not be promoted');
    assert.doesNotMatch(result.stdout, /build-pages: OK/);
  });
}
