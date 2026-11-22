import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXPECTED_TARGETS, summarizeMythrilLog } from '../audit/mythril-evidence.mjs';

const clean = () => ({ success: true, error: null, issues: [] });
const log = (reports) => `Mythril version v0.24.8\n${reports.map((v) => JSON.stringify(v)).join('\n')}\n`;
const valid = () => EXPECTED_TARGETS.map(() => clean());
function runCli(data, json = false) {
  const dir = mkdtempSync(join(tmpdir(), 'mythril-evidence-'));
  try {
    const file = join(dir, 'report.log');
    writeFileSync(file, data);
    return spawnSync(process.execPath, [fileURLToPath(new URL('../audit/mythril-evidence.mjs', import.meta.url)), file, ...(json ? ['--json'] : [])], { encoding: 'utf8' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('complete five-target clean report is accepted', () => {
  const result = summarizeMythrilLog(log(valid()));
  assert.equal(result.verdict, 'clean');
  assert.equal(result.totalFindings, 0);
  assert.deepEqual(result.targets.map((x) => x.target), EXPECTED_TARGETS);
  assert.equal(runCli(log(valid())).status, 0);
});
test('findings stay open and transaction traces are never emitted', () => {
  const reports = valid();
  reports[1].issues = [{ severity: 'Low', filename: 'src/A.sol', lineno: 9, 'swc-id': '116', description: 'secret RPC URL', tx_sequence: { input: 'sensitive payload' } }];
  reports[4].issues = [{ severity: 'Medium', filename: 'src/B.sol', lineno: 11, 'swc-id': '107', description: 'another secret' }];
  const result = summarizeMythrilLog(log(reports));
  assert.equal(result.totalFindings, 2);
  assert.equal(result.verdict, 'findings-open');
  assert.equal(result.severityCounts.Medium, 1);
  assert.equal(result.severityCounts.Low, 1);
  assert.equal(result.targets[4].findings[0].sourceFile, 'src/B.sol');
  assert.doesNotMatch(JSON.stringify(result), /secret|sensitive|tx_sequence/u);
  assert.equal(runCli(log(reports)).status, 1);
});
test('missing, duplicate or truncated target reports are rejected', () => {
  for (const reports of [valid().slice(1), [...valid(), clean()], [], valid().slice(0, 3)]) {
    assert.throws(() => summarizeMythrilLog(log(reports)), /expected 5 reports/u);
    assert.equal(runCli(log(reports)).status, 2);
  }
});
test('invalid JSON, missing fields, unknown severities and bad source locations fail closed', () => {
  const variants = [
    '{not JSON',
    JSON.stringify({ success: false, error: 'failed', issues: [] }),
    JSON.stringify({ success: true, issues: [] }),
    JSON.stringify({ success: true, error: null, issues: 'bad' }),
    JSON.stringify({ success: true, error: null, issues: [{ severity: 'Unknown' }] }),
    JSON.stringify({ success: true, error: null, issues: [{ severity: 'High', lineno: -1 }] }),
    JSON.stringify({ success: true, error: null, issues: [{ severity: 'Low', 'swc-id': 'x' }] }),
  ];
  for (const variant of variants) {
    const data = log(valid()).replace(JSON.stringify(clean()), variant);
    assert.throws(() => summarizeMythrilLog(data));
    assert.equal(runCli(data).status, 2);
  }
});
test('oversized input cannot masquerade as a clean report', () => {
  const data = 'X'.repeat(8 * 1024 * 1024 + 1);
  assert.throws(() => summarizeMythrilLog(data), /exceeds 8 MiB/u);
  assert.equal(runCli(data).status, 2);
});
