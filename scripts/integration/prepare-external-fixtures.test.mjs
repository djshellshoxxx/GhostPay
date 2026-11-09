import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { verifyCheckout, verifyCircuitArtifacts, verifyIntegrity } from './prepare-external-fixtures.mjs';

function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), 'ghostpay-fixture-check-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('integrity validation refuses modified cache files, missing files and symlinks', (t) => {
  const directory = temporary(t);
  const file = join(directory, 'fixture');
  writeFileSync(file, 'pinned fixture');
  const integrity = `sha512-${createHash('sha512').update('pinned fixture').digest('base64')}`;
  verifyIntegrity(file, integrity);
  const link = join(directory, 'link');
  symlinkSync(file, link);
  assert.throws(() => verifyIntegrity(link, integrity), /regular fixture file/);
  writeFileSync(file, 'tampered fixture');
  assert.throws(() => verifyIntegrity(file, integrity), /checksum mismatch/);
  assert.throws(() => verifyIntegrity(join(directory, 'missing'), integrity), /ENOENT/);
  assert.throws(() => verifyIntegrity(file, 'md5-not-a-pin'), /Unsupported integrity/);
});

test('checkout validation refuses wrong revisions and modified upstream source', (t) => {
  const directory = temporary(t);
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init');
  writeFileSync(join(directory, 'source'), 'upstream');
  writeFileSync(join(directory, '.gitignore'), '*.ignored\n');
  git('add', 'source', '.gitignore');
  git('-c', 'user.name=Fixture Test', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
  const revision = git('rev-parse', 'HEAD');
  verifyCheckout(directory, revision);
  assert.throws(() => verifyCheckout(directory, '0'.repeat(40)), /Wrong upstream revision/);
  writeFileSync(join(directory, 'extra.ignored'), 'untracked compiler input');
  assert.throws(() => verifyCheckout(directory, revision), /not clean/);
  rmSync(join(directory, 'extra.ignored'));
  writeFileSync(join(directory, 'source'), 'modified');
  assert.throws(() => verifyCheckout(directory, revision), /not clean/);
});

test('all six artifacts must match unique existing runtime pins', (t) => {
  const directory = temporary(t);
  const files = ['commitment.wasm', 'commitment.vkey', 'commitment.zkey', 'withdraw.wasm', 'withdraw.vkey', 'withdraw.zkey'];
  const pins = files.map((name) => {
    writeFileSync(join(directory, name), name);
    return `'${name}': '${createHash('sha256').update(name).digest('hex')}'`;
  });
  verifyCircuitArtifacts(directory, pins.join(',\n'));
  assert.throws(() => verifyCircuitArtifacts(directory, pins.slice(0, -1).join(',\n')), /Missing or ambiguous circuit pin/);
  assert.throws(() => verifyCircuitArtifacts(directory, [...pins, pins[0]].join(',\n')), /Missing or ambiguous circuit pin/);
  writeFileSync(join(directory, 'withdraw.zkey'), 'replacement proving key');
  assert.throws(() => verifyCircuitArtifacts(directory, pins.join(',\n')), /checksum mismatch/);
});
