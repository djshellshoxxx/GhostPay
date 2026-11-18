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
const noJq = spawnSync('jq', ['--version']).status === 0 ? false : 'jq not installed';

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

// No YAML dependency is declared: read top-level jobs by indentation, ignoring comment lines (the disabled stub).
function jobBlocks(workflow) {
  const blocks = {};
  let current;
  for (const line of workflow.slice(workflow.indexOf('\njobs:\n') + 7).split('\n')) {
    if (/^\S/.test(line)) break;
    if (/^\s*#/.test(line)) continue;
    const id = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line)?.[1];
    if (id) { current = id; blocks[id] = ''; } else if (current) blocks[current] += `${line}\n`;
  }
  return blocks;
}
const needsOf = (block) => {
  const value = /^    needs: (.+)$/m.exec(block)?.[1];
  return value === undefined ? [] : value.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim());
};
const releaseJobs = () => jobBlocks(readFileSync(join(root, '.github/workflows/release.yml'), 'utf8'));
const analysisGate = () => releaseJobs().build.match(/- name: [^\n]*\n {8}id: analysis-gate\n {8}run: \|\n((?: {10}[^\n]*\n)+)/)?.[1]
  ?.replace(/^ {10}/gm, '');

test('release builds and drafts only after Echidna and Mythril ran on the tagged commit in the same run', () => {
  const release = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8');
  const analysis = readFileSync(join(root, '.github/workflows/contract-analysis.yml'), 'utf8');
  const jobs = releaseJobs();
  assert.deepEqual(Object.keys(jobs), ['verify', 'contract-analysis', 'build', 'draft-release']);
  for (const [id, block] of Object.entries(jobs)) {
    for (const need of needsOf(block)) assert.ok(need in jobs, `${id} needs unknown job ${need}`);
  }
  // The reusable workflow from the tagged commit, read-only, no secrets; it starts only after the signed-tag check.
  assert.match(jobs['contract-analysis'], /^    uses: \.\/\.github\/workflows\/contract-analysis\.yml\n/m);
  assert.match(jobs['contract-analysis'], /^    permissions:\n      contents: read\n/m);
  assert.doesNotMatch(jobs['contract-analysis'], /secrets|with:|^    if:/m);
  assert.deepEqual(needsOf(jobs['contract-analysis']), ['verify']);
  // Default success() semantics: a failed, cancelled or skipped need skips build, and with it draft-release.
  assert.deepEqual(needsOf(jobs.build).sort(), ['contract-analysis', 'verify']);
  assert.deepEqual(needsOf(jobs['draft-release']), ['build']);
  for (const id of ['build', 'draft-release']) assert.doesNotMatch(jobs[id], /^    if:|continue-on-error/m, id);
  assert.doesNotMatch(release, /cancel-in-progress: (?!false\n)/);
  // A matrix the release relies on: exactly these analyzers, uploading under the requested commit.
  assert.match(analysis, /analyzer: \[echidna, mythril\]/);
  assert.match(analysis, /name: contract-analysis-\$\{\{ matrix\.analyzer \}\}-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  // Only pull requests cancel superseded analysis; a release or nightly caller is never cancelled by another run.
  assert.match(analysis, /concurrency:\n  group: .*\n  cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}\n/);
  // build re-checks this run's own evidence (no run-id or token: never another run's) before it builds or attests.
  const build = jobs.build;
  const order = [
    'id: tagcheck',
    'name: contract-analysis-echidna-${{ github.sha }}',
    'name: contract-analysis-mythril-${{ github.sha }}',
    'id: analysis-gate',
    'bash scripts/release-build.sh',
    'uses: actions/attest-build-provenance@',
    'name: release-artifacts',
  ].map((needle) => build.indexOf(needle));
  assert.ok(order.every((at) => at >= 0), `missing build step: ${JSON.stringify(order)}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'tag check, analysis evidence, then build and attest');
  assert.doesNotMatch(build, /run-id:|github-token:|pattern:/);
  assert.ok(analysisGate(), 'analysis gate script');
});

test('the release analysis gate accepts only successful evidence of both analyzers for the built commit', { skip: noJq }, () => {
  const gate = analysisGate();
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  assert.match(head, /^[0-9a-f]{40}$/);
  const directory = mkdtempSync(join(tmpdir(), 'ghostpay-release-analysis-'));
  const evidence = (analyzer) => join(directory, 'contract-analysis', analyzer, 'metadata.json');
  // Produce evidence with the real collector, as the contract-analysis job does after a run.
  const collect = (analyzer, outcome, code) => {
    const input = join(directory, `input-${analyzer}`);
    rmSync(input, { recursive: true, force: true }); mkdirSync(input);
    writeFileSync(join(input, 'report.log'), `${analyzer} report\n`);
    if (code !== undefined) writeFileSync(join(input, 'exit-code.txt'), `${code}\n`);
    const result = spawnSync('python3', [join(scripts, 'collect-analysis-report.py'), input, join(directory, 'contract-analysis', analyzer)], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, ANALYZER: analyzer, ANALYSIS_OUTCOME: outcome, REQUESTED_COMMIT: head },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  };
  const run = (sha = head) => spawnSync('bash', ['-c', gate], {
    cwd: root, encoding: 'utf8', timeout: 10_000, env: { ...process.env, RUNNER_TEMP: directory, GITHUB_SHA: sha },
  });
  const passes = () => { collect('echidna', 'success', 0); collect('mythril', 'success', 0); };
  try {
    passes();
    const ok = run();
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, new RegExp(`echidna passed on ${head}\\nmythril passed on ${head}\\n`));
    assert.notEqual(run('b'.repeat(40)).status, 0, 'evidence requested for another commit');
    for (const analyzer of ['echidna', 'mythril']) {
      const rejects = (why) => {
        const result = run();
        assert.notEqual(result.status, 0, `${analyzer}: ${why}`);
        assert.match(result.stdout, new RegExp(`::error::${analyzer} `), `${analyzer}: ${why}`);
        passes();
      };
      collect(analyzer, 'failure', 1); rejects('failed analyzer');
      collect(analyzer, 'cancelled'); rejects('cancelled analyzer without exit code');
      collect(analyzer, 'skipped'); rejects('skipped analyzer');
      collect(analyzer, 'success', 1); rejects('nonzero exit despite success outcome');
      collect(analyzer, 'failure', 0); rejects('failed outcome despite zero exit');
      rmSync(join(directory, 'contract-analysis', analyzer), { recursive: true }); rejects('absent evidence');
      const edits = {
        'another checkout': { checkoutCommit: 'c'.repeat(40) },
        'another requested commit': { requestedCommit: 'd'.repeat(40) },
        'another analyzer label': { analyzer: analyzer === 'echidna' ? 'mythril' : 'echidna' },
        'missing report': { reportPresent: false },
        'string exit code': { runnerExitCode: '0' },
        'unknown schema': { schemaVersion: 2 },
      };
      for (const [why, edit] of Object.entries(edits)) {
        const metadata = JSON.parse(readFileSync(evidence(analyzer), 'utf8'));
        writeFileSync(evidence(analyzer), JSON.stringify({ ...metadata, ...edit }));
        rejects(why);
      }
      const good = readFileSync(evidence(analyzer), 'utf8');
      writeFileSync(evidence(analyzer), `${JSON.stringify({ ...JSON.parse(good), analysisOutcome: 'failure' })}\n${good}`);
      rejects('a second JSON document');
      writeFileSync(evidence(analyzer), '{'); rejects('malformed metadata');
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
