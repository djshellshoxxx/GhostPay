import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const data = join(root, 'docs/audits/data/24');
const run = (...args) => spawnSync('python3', [join(root, 'scripts/audit/gen-audit24-report.py'), ...args], { encoding: 'utf8', cwd: root });

test('audit report refuses an output outside its documentation directory without overwriting it', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ghostpay-audit-path-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = join(dir, 'keep.md');
  writeFileSync(out, 'preserve me');
  const result = run(out);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /must stay within/);
  assert.equal(readFileSync(out, 'utf8'), 'preserve me');
});

test('audit report refuses input and output symlinks escaping their allowed directories', (t) => {
  const dir = mkdtempSync(join(root, 'docs/audits/path-test-'));
  const outside = mkdtempSync(join(tmpdir(), 'ghostpay-audit-target-'));
  t.after(() => { rmSync(dir, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });
  const input = mkdtempSync(join(root, 'docs/audits/data/path-test-'));
  t.after(() => rmSync(input, { recursive: true, force: true }));
  const target = join(outside, 'keep.md');
  writeFileSync(target, 'preserve me');
  symlinkSync(target, join(dir, 'report.md'));
  assert.equal(run(join(dir, 'report.md')).status, 2);
  assert.equal(readFileSync(target, 'utf8'), 'preserve me');
  const result = run('--data', outside, join(dir, 'valid.md'));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /must stay within/);
  symlinkSync(target, join(input, 'all-verified.json'));
  const linkedInput = run('--data', input, join(dir, 'valid.md'));
  assert.equal(linkedInput.status, 2);
  assert.match(linkedInput.stderr, /must stay within/);
});

test('audit report still generates the same report within the documented boundary', (t) => {
  const dir = mkdtempSync(join(root, 'docs/audits/path-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = join(dir, 'report.md');
  const result = run('--data', data, out);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(out, 'utf8'), readFileSync(join(root, 'docs/audits/24-ai-assisted-security-audit-2026-10-28.md'), 'utf8'));
});
