import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const scripts = join(root, 'packages/contracts/scripts');

test('contract analysis is reusable and PR-scoped with read-only pinned tools and retained failing outcomes', () => {
  const workflow = readFileSync(join(root, '.github/workflows/contract-analysis.yml'), 'utf8');
  const nightly = readFileSync(join(root, '.github/workflows/nightly.yml'), 'utf8');
  assert.match(workflow, /^  pull_request:/m);
  assert.match(workflow, /^  workflow_call:/m);
  assert.match(workflow, /paths:\n(?:.*\n)*?\s+- 'packages\/contracts\/\*\*'/);
  assert.doesNotMatch(workflow, /pull_request_target|secrets:|contents: write|actions: write|id-token:|continue-on-error|--exclude-swc|--test-limit|fuzz-runs/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /fail-fast: false/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  for (const match of workflow.matchAll(/uses: ([^\s]+)/g)) {
    if (!match[1].startsWith('./')) assert.match(match[1], /@[0-9a-f]{40}$/);
  }
  assert.match(workflow, /ECHIDNA_VERSION: '2\.2\.7'/);
  assert.match(workflow, /d9f8c2e829cc35a4077f8c139863c9087a038262639febd1dcc69d93b79aa314/);
  assert.match(workflow, /mythril==0\.24\.8/);
  assert.match(workflow, /bash "scripts\/run-\$\{ANALYZER\}\.sh"/);
  assert.match(workflow, /exit "\$status"/);
  assert.equal([...workflow.matchAll(/if: always\(\)/g)].length, 2);
  assert.match(nightly, /uses: \.\/\.github\/workflows\/contract-analysis\.yml/);
  assert.doesNotMatch(nightly, /run-echidna\.sh|run-mythril\.sh/);
});

test('Mythril host compatibility preserves every argument and the CLI return code', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ghostpay-mythril-host-'));
  try {
    mkdirSync(join(directory, 'solcx'), { recursive: true });
    mkdirSync(join(directory, 'mythril/interfaces'), { recursive: true });
    for (const p of ['solcx/__init__.py', 'mythril/__init__.py', 'mythril/interfaces/__init__.py']) writeFileSync(join(directory, p), '');
    writeFileSync(join(directory, 'solcx/install.py'), 'BINARY_DOWNLOAD_BASE = "legacy"\n');
    writeFileSync(join(directory, 'mythril/interfaces/cli.py'), `import json, sys, solcx.install
def main():
    print(json.dumps({'host': solcx.install.BINARY_DOWNLOAD_BASE, 'args': sys.argv[1:]}))
    return 19
`);
    const args = ['analyze', 'src/PolicyAccount.sol', '--solv', '0.8.28', '--execution-timeout', '900', '-t', '3', '-o', 'json'];
    const result = spawnSync('python3', [join(scripts, 'mythril-compat.py'), ...args], {
      encoding: 'utf8', timeout: 10_000, env: { ...process.env, PYTHONPATH: directory },
    });
    assert.equal(result.status, 19, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { host: 'https://binaries.soliditylang.org/{}-amd64/{}', args });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('the workflow analysis shell records and rethrows both successful and abnormal runner exits', () => {
  const workflow = readFileSync(join(root, '.github/workflows/contract-analysis.yml'), 'utf8');
  const run = workflow.match(/name: Execute the unchanged full analyzer runner[\s\S]*?run: \|\n((?: {10}[^\n]*\n)+)/)?.[1];
  assert.ok(run);
  const shell = run.replace(/^ {10}/gm, '');
  const directory = mkdtempSync(join(tmpdir(), 'ghostpay-analysis-exit-'));
  try {
    mkdirSync(join(directory, 'scripts'));
    for (const code of [0, 137]) {
      writeFileSync(join(directory, 'scripts/run-echidna.sh'), `printf 'native report\\n'\nexit ${code}\n`);
      const result = spawnSync('bash', ['-c', shell], {
        cwd: directory, encoding: 'utf8', timeout: 10_000,
        env: { ...process.env, ANALYZER: 'echidna', RUNNER_TEMP: directory },
      });
      assert.equal(result.status, code, result.stdout + result.stderr);
      assert.equal(readFileSync(join(directory, 'ghostpay-contract-analysis/exit-code.txt'), 'utf8'), `${code}\n`);
      assert.equal(readFileSync(join(directory, 'ghostpay-contract-analysis/report.log'), 'utf8'), 'native report\n');
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('artifact collection bounds retained bytes, hashes the full report and preserves failure attribution', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ghostpay-analysis-report-'));
  try {
    const input = join(directory, 'input'); const output = join(directory, 'output');
    mkdirSync(input);
    const report = Buffer.alloc(9 * 1024 * 1024, 97); report.write('final finding', report.length - 13);
    writeFileSync(join(input, 'report.log'), report); writeFileSync(join(input, 'exit-code.txt'), '137\n');
    const result = spawnSync('python3', [join(scripts, 'collect-analysis-report.py'), input, output], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, ANALYZER: 'mythril', ANALYSIS_OUTCOME: 'failure', REQUESTED_COMMIT: 'a'.repeat(40) },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(readFileSync(join(output, 'report.log')), report.subarray(-8 * 1024 * 1024));
    const metadata = JSON.parse(readFileSync(join(output, 'metadata.json'), 'utf8'));
    assert.equal(metadata.runnerExitCode, 137); assert.equal(metadata.analysisOutcome, 'failure');
    assert.equal(metadata.fullReportSha256, createHash('sha256').update(report).digest('hex'));
    assert.equal(metadata.fullReportBytes, report.length); assert.equal(metadata.truncated, true);
    assert.equal(metadata.retainedBytes, 8 * 1024 * 1024);
    assert.match(metadata.checkoutCommit, /^[a-f0-9]{40}$/);
    assert.equal(metadata.requestedCommit, 'a'.repeat(40));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('missing reports and cancellation never acquire a successful exit code', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ghostpay-analysis-cancel-'));
  try {
    const output = join(directory, 'output');
    const result = spawnSync('python3', [join(scripts, 'collect-analysis-report.py'), join(directory, 'missing'), output], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, ANALYZER: 'echidna', ANALYSIS_OUTCOME: 'cancelled' },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const metadata = JSON.parse(readFileSync(join(output, 'metadata.json'), 'utf8'));
    assert.equal(metadata.reportPresent, false); assert.equal(metadata.runnerExitCode, null);
    assert.equal(metadata.analysisOutcome, 'cancelled'); assert.equal(metadata.fullReportSha256, null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
