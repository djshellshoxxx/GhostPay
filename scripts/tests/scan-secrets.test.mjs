import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'scan-secrets.sh');
const hex = (n, c = 'ab') => c.repeat(n / 2);
const rep = (n, c) => c.repeat(n);

// Fixtures are built at runtime so this file does not itself match the scanner patterns.
const positives = {
  'name before value': `PRIVATE_KEY = "0x${hex(64)}"\n`,
  'mnemonic then key': `mnemonic: 0x${hex(64, 'cd')}\n`,
  'github classic token': `t = "${'gh' + 'p_'}${rep(36, 'A')}"\n`,
  'github fine-grained token': `t = "${'github' + '_pat_'}${rep(70, 'B')}"\n`,
  'openai key': `k = "${'s' + 'k-'}${rep(30, 'x')}"\n`,
  'openai project key': `k = "${'s' + 'k-proj-'}${rep(30, 'x')}"\n`,
  'aws key id': `k = "${'AK' + 'IA'}${rep(16, 'Z')}"\n`,
  'slack token': `k = "${'xo' + 'xb-'}${rep(12, '1')}"\n`,
};

function scan(files) {
  const dir = mkdtempSync(join(tmpdir(), 'scan-secrets-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    mkdirSync(join(dir, 'scripts'));
    copyFileSync(script, join(dir, 'scripts', 'scan-secrets.sh'));
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
    execFileSync('git', ['add', '-A'], { cwd: dir });
    return spawnSync('bash', ['scripts/scan-secrets.sh'], { cwd: dir, encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const [name, body] of Object.entries(positives)) {
  test(`flags ${name} (A5-3)`, () => {
    const r = scan({ 'app.ts': body });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /possible secret/);
  });
}

test('passes clean content and public hash-like values', () => {
  const r = scan({
    'app.ts': `const txHash = "0x${hex(64)}";\nconst note = "sk-short";\nconst id = "AKIA123";\n`,
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('flags PEM private key block', () => {
  const r = scan({ 'k.txt': `-----BEGIN ${'PRIVATE'} KEY-----\n` });
  assert.equal(r.status, 1);
});

test('allowlists only the public anvil dev key (A5-3)', () => {
  const anvil0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const ok = scan({ 'app.ts': `const privateKey = "${anvil0}";\n` });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const bad = scan({ 'app.ts': `const privateKey = "0x${hex(64, '12')}";\n` });
  assert.equal(bad.status, 1);
});

test('allowlisted dev key does not mask another secret on the same line (A5-3)', () => {
  const anvil0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const tok = 'gh' + 'p_' + rep(36, 'A');
  const r = scan({ 'app.ts': `const privateKey = "${anvil0}"; const t = "${tok}";\n` });
  assert.equal(r.status, 1, r.stdout + r.stderr);
});
