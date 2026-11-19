// Synthetic pinned-interface fixtures. No native symbolic results are claimed here.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
const repo = fileURLToPath(new URL('../..', import.meta.url));
const wrapper = join(repo, 'packages/contracts/scripts/mythril-compat.py');
const validator = join(repo, 'packages/contracts/scripts/capture-mythril-evidence.py');
const complete = { schemaVersion: 1, instrumentationReady: true, reportCount: 1, executionTimeoutObserved: false, creationTimeoutObserved: false, exceptionCount: 0, errorLogObserved: false };

function run(mode = 'clean', { rc = 0, command = 'analyze', sidecar = true, stale = false, exit = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'ghostpay-mythril-completeness-'));
  const output = join(directory, 'completeness.json');
  const calls = join(directory, 'calls.json');
  const put = (path, text) => { mkdirSync(dirname(join(directory, path)), { recursive: true }); writeFileSync(join(directory, path), text); };
  try {
    for (const name of ['solcx', 'mythril', 'mythril/interfaces', 'mythril/analysis', 'mythril/laser', 'mythril/laser/ethereum']) put(`${name}/__init__.py`, '');
    put('solcx/install.py', 'BINARY_DOWNLOAD_BASE = "legacy"\n');
    put('mythril/laser/ethereum/svm.py', `import os
class LaserEVM:
    def __init__(self):
        self.execution_calls = 0
        self.creation_calls = 0
    def _check_execution_termination(self):
        self.execution_calls += 1
        if os.environ["MODE"] == "invalid-timeout-type": return 1
        return os.environ["MODE"] == "execution-timeout"
    def _check_create_termination(self):
        self.creation_calls += 1
        return os.environ["MODE"] == "creation-timeout"
`);
    put('mythril/analysis/report.py', `import json, os
class Report:
    def __init__(self):
        self.exceptions = ["hidden internal failure"] if os.environ["MODE"] == "exception" else []
        if os.environ["MODE"] == "invalid-exceptions-type": self.exceptions = "hidden error"
        self.calls = 0
    def as_json(self):
        self.calls += 1
        return json.dumps({"success": True, "error": None, "issues": []}, separators=(",", ":"))
`);
    put('mythril/interfaces/cli.py', `import json, logging, os, sys, solcx.install
from mythril.laser.ethereum.svm import LaserEVM
from mythril.analysis.report import Report
def main():
    if sys.argv[1] == "version":
        print(json.dumps({"host": solcx.install.BINARY_DOWNLOAD_BASE, "args": sys.argv[1:]}))
        return int(os.environ["CLI_RC"])
    laser = LaserEVM()
    report = Report()
    outcome = {}
    try:
        outcome["execution_result"] = laser._check_execution_termination()
        outcome["creation_result"] = laser._check_create_termination()
        if os.environ["MODE"] == "logged-error": logging.getLogger("mythril.stub").error("lower-case analysis timeout")
        if os.environ["MODE"] == "interrupt-log": logging.getLogger("mythril.stub").critical("Keyboard Interrupt")
        if os.environ["MODE"] != "missing-report": print(report.as_json())
        if os.environ["MODE"] == "duplicate-report": report.as_json()
        if os.environ["MODE"] == "raise": raise RuntimeError("fixture crash")
        if os.environ["CLI_EXIT"] == "1": sys.exit(int(os.environ["CLI_RC"]))
        return int(os.environ["CLI_RC"])
    finally:
        outcome.update({"host": solcx.install.BINARY_DOWNLOAD_BASE, "args": sys.argv[1:], "execution_calls": laser.execution_calls, "creation_calls": laser.creation_calls, "serialization_calls": report.calls})
        with open(os.environ["CALLS"], "w") as f: json.dump(outcome, f)
`);
    if (mode === 'missing-hooks') put('mythril/laser/ethereum/svm.py', 'class LaserEVM: pass\n');
    if (stale) writeFileSync(output, JSON.stringify(complete));
    const args = command === 'analyze' ? ['analyze', 'src/PolicyAccount.sol', '--solv', '0.8.28', '--execution-timeout', '900', '-t', '3', '-o', 'json'] : ['version', '-o', 'json'];
    const env = { ...process.env, PYTHONPATH: directory, MODE: mode, CLI_RC: String(rc), CLI_EXIT: exit ? '1' : '0', CALLS: calls };
    delete env.MYTHRIL_COMPLETENESS_FILE;
    if (sidecar) env.MYTHRIL_COMPLETENESS_FILE = output;
    const result = spawnSync('python3', [wrapper, ...args], { encoding: 'utf8', timeout: 10_000, env });
    return { result, args, state: existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : null, calls: existsSync(calls) ? JSON.parse(readFileSync(calls, 'utf8')) : null };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('complete instrumentation observes original methods once and preserves exact CLI arguments/output/status', () => {
  for (const exit of [false, true]) for (const rc of [0, 1, 19]) {
    const { result, state, calls, args } = run('clean', { rc, exit });
    assert.equal(result.status, rc, result.stdout + result.stderr);
    assert.equal(result.stdout, '{"success":true,"error":null,"issues":[]}\n');
    assert.deepEqual(state, complete);
    assert.deepEqual(calls.args, args);
    assert.equal(calls.host, 'https://binaries.soliditylang.org/{}-amd64/{}');
    assert.equal(calls.execution_calls, 1); assert.equal(calls.creation_calls, 1); assert.equal(calls.serialization_calls, 1);
    assert.equal(calls.execution_result, false); assert.equal(calls.creation_result, false);
  }
});
test('version command remains unchanged without telemetry or analyzer instrumentation', () => {
  const { result, state, args } = run('clean', { command: 'version', sidecar: false, rc: 19 });
  assert.equal(result.status, 19, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { host: 'https://binaries.soliditylang.org/{}-amd64/{}', args });
  assert.equal(state, null);
});
for (const [mode, key] of [['execution-timeout', 'executionTimeoutObserved'], ['creation-timeout', 'creationTimeoutObserved']]) test(`internal ${mode} keeps original findings output but cannot exit successfully`, () => {
  const { result, state, calls } = run(mode);
  assert.equal(result.status, 124, result.stdout + result.stderr);
  assert.equal(result.stdout, '{"success":true,"error":null,"issues":[]}\n');
  assert.equal(state[key], true); assert.equal(state.reportCount, 1);
  assert.equal(calls.execution_calls, 1); assert.equal(calls.creation_calls, 1); assert.equal(calls.serialization_calls, 1);
});
test('Report.exceptions omitted by native JSON is preserved as a failed outcome', () => {
  const { result, state } = run('exception');
  assert.equal(result.status, 2, result.stdout + result.stderr); assert.equal(state.exceptionCount, 1);
  assert.equal(result.stdout, '{"success":true,"error":null,"issues":[]}\n');
});
test('missing/extra reports, logged errors and internally swallowed interrupts fail closed', () => {
  for (const mode of ['missing-report', 'duplicate-report', 'logged-error', 'interrupt-log']) {
    const { result, state } = run(mode);
    assert.equal(result.status, 2, `${mode}: ${result.stdout}${result.stderr}`);
    if (mode.endsWith('log') || mode === 'logged-error') assert.equal(state.errorLogObserved, true);
    else assert.notEqual(state.reportCount, 1);
  }
});
test('unknown hook interfaces, invalid observer data and crashes cannot produce passing telemetry', () => {
  for (const mode of ['missing-hooks', 'invalid-timeout-type', 'invalid-exceptions-type', 'raise']) {
    const { result } = run(mode);
    assert.notEqual(result.status, 0, `${mode}: ${result.stdout}${result.stderr}`);
  }
});
test('missing or preexisting telemetry path refuses analysis rather than accepting stale evidence', () => {
  const missing = run('clean', { sidecar: false }); assert.equal(missing.result.status, 2); assert.equal(missing.calls, null);
  const stale = run('clean', { stale: true }); assert.equal(stale.result.status, 2); assert.equal(stale.calls, null); assert.deepEqual(stale.state, complete);
});
test('strict telemetry validator rejects missing, empty, malformed, duplicate, extra and mistyped data', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ghostpay-mythril-telemetry-json-'));
  const path = join(directory, 'state.json');
  try {
    const runValidator = (value) => { if (value === null) rmSync(path, { force: true }); else writeFileSync(path, value); return spawnSync('python3', [validator, 'validate-completeness', path], { encoding: 'utf8', timeout: 10_000 }); };
    assert.equal(runValidator(JSON.stringify(complete)).status, 0);
    const invalid = [null, '', '{', '[]', 'null', JSON.stringify(complete).replace('"reportCount":1', '"reportCount":0,"reportCount":1'),
      ...[{ schemaVersion: true }, { reportCount: true }, { exceptionCount: false }, { exceptionCount: 1 }, { reportCount: 0 }, { reportCount: 2 },
        { executionTimeoutObserved: 'false' }, { creationTimeoutObserved: true }, { errorLogObserved: true }, { instrumentationReady: false }, { error: 'timeout' }].map((v) => JSON.stringify({ ...complete, ...v }))];
    for (const value of invalid) assert.notEqual(runValidator(value).status, 0, String(value));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
