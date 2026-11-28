// Tests for scripts/contract-analysis/mythril-disposition-check.mjs (UNWIRED; see its header). Fixture repositories in
// temp dirs, synthetic reports in Mythril 0.24.8 `-o json` shape (Issue.as_dict: swc-id, contract, function, address,
// severity, sourceMap, filename, lineno). No network, no compiler, no analyzer.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkDispositions, decodeBytecode, InputError, parseReport, readPins, RUNNER_PATH, WORKFLOW_PATH } from '../contract-analysis/mythril-disposition-check.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const script = join(repo, 'scripts/contract-analysis/mythril-disposition-check.mjs');
const sha = (text) => createHash('sha256').update(text).digest('hex');

const RUNNER = `myth analyze "src/$f.sol" --solv 0.8.28 --solc-json "$conf" --execution-timeout "$timeout" -t 3 -o json
{"remappings": [], "optimizer": {"enabled": true, "runs": 200}, "evmVersion": "cancun"}
`;
const WORKFLOW = "python3 -m pip install --quiet 'mythril==0.24.8' 'solc-select==1.2.0'\n";
const SOURCE = 'contract A { function f() external { if (block.timestamp > 1) revert(); } }\n';
const RUNTIME = '0x6080604052';

function fixture({ runner = RUNNER, workflow = WORKFLOW, source = SOURCE } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ghostpay-myth-disp-'));
  const files = { [RUNNER_PATH]: runner, [WORKFLOW_PATH]: workflow, 'packages/contracts/src/A.sol': source };
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

const record = (overrides = {}) => ({
  id: 'EXP-1', contract: 'A', function: 'f()', swcId: '116', pc: 785, severity: 'Low',
  sourceMap: '4414:50', filename: 'src/A.sol', lineno: 1,
  sources: [{ path: 'packages/contracts/src/A.sol', sha256: sha(SOURCE) }],
  runtimeBytecode: { contract: 'A', sha256: sha(Buffer.from('6080604052', 'hex')) },
  compiler: { version: '0.8.28', optimizerRuns: 200, evmVersion: 'cancun' },
  analyzerVersion: '0.24.8', disposition: 'benign-intended', evidence: 'docs/audits/x.md',
  ...overrides,
});
const dispositions = (records = [record()], overrides = {}) => ({
  schemaVersion: 1, analyzer: 'mythril', expectedAnalyses: 2, ownerApproval: 'fixture approval reference',
  records, ...overrides,
});
const issue = (overrides = {}) => ({
  'swc-id': '116', contract: 'A', function: 'f()', address: 785, severity: 'Low',
  sourceMap: '4414:50', filename: 'src/A.sol', lineno: 1, title: 'Dependence on predictable environment variable',
  tx_sequence: {}, ...overrides,
});
const doc = (issues) => JSON.stringify({ error: null, issues, success: true });
const report = (issues = [issue()]) => `${doc(issues)}\n::error::mythril: A reported issues or failed (rc=1)\n${doc([])}\n`;
const bytecodes = () => new Map([['A', decodeBytecode(RUNTIME, 'A')]]);

function check(options = {}, files = {}) {
  const root = fixture(files);
  try {
    return checkDispositions({ dispositions: dispositions(), reportText: report(), root, bytecodes: bytecodes(), ...options });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const codes = (result) => result.failures.map((f) => f.code);

test('passes when every reported issue matches a record whose keys all still hold', () => {
  const result = check();
  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, true);
  assert.deepEqual(result.matched, ['EXP-1']);
});

test('a new or moved record is undispositioned: other PC, SWC, function, contract or severity', () => {
  for (const change of [{ address: 786 }, { 'swc-id': '107' }, { function: 'g()' }, { contract: 'B' }, { severity: 'Medium' }]) {
    const result = check({ reportText: report([issue(), issue(change)]) });
    assert.deepEqual(codes(result), ['UNDISPOSITIONED'], JSON.stringify(change));
  }
});

test('a recorded source location that moved fails even with the same PC', () => {
  assert.deepEqual(codes(check({ reportText: report([issue({ sourceMap: '4414:51' })]) })), ['LOCATION_CHANGED']);
  assert.deepEqual(codes(check({ reportText: report([issue({ lineno: 2 })]) })), ['LOCATION_CHANGED']);
});

test('any changed or missing source file fails every record that names it', () => {
  assert.deepEqual(codes(check({}, { source: `${SOURCE} ` })), ['SOURCE_CHANGED']);
  const missing = dispositions([record({ sources: [{ path: 'packages/contracts/src/Missing.sol', sha256: sha('') }] })]);
  assert.deepEqual(codes(check({ dispositions: missing })), ['SOURCE_MISSING']);
});

test('runtime bytecode must be supplied and must still hash to the recorded value', () => {
  assert.deepEqual(codes(check({ bytecodes: new Map() })), ['BYTECODE_UNVERIFIED']);
  assert.deepEqual(codes(check({ bytecodes: new Map([['A', decodeBytecode('0x6080604053', 'A')]]) })), ['BYTECODE_CHANGED']);
  assert.throws(() => decodeBytecode('0x608', 'A'), InputError);
  assert.throws(() => decodeBytecode('nothex', 'A'), InputError);
});

test('compiler version, optimizer runs, EVM version and analyzer version are read from the repository pins', () => {
  assert.deepEqual(codes(check({}, { runner: RUNNER.replace('--solv 0.8.28', '--solv 0.8.29') })), ['COMPILER_CHANGED']);
  assert.deepEqual(codes(check({}, { runner: RUNNER.replace('"runs": 200', '"runs": 1000') })), ['COMPILER_CHANGED']);
  assert.deepEqual(codes(check({}, { runner: RUNNER.replace('cancun', 'prague') })), ['COMPILER_CHANGED']);
  assert.deepEqual(codes(check({}, { workflow: WORKFLOW.replace('0.24.8', '0.24.9') })), ['ANALYZER_CHANGED']);
  const root = fixture({ runner: `${RUNNER}--solv 0.8.27\n` });
  try { assert.throws(() => readPins(root), /exactly one --solv/); } finally { rmSync(root, { recursive: true, force: true }); }
});

test('tool errors, a missing analysis and malformed documents never pass', () => {
  const failed = `${JSON.stringify({ error: 'Solc experienced a fatal error', issues: [], success: false })}\n${doc([issue()])}\n`;
  assert.deepEqual(codes(check({ reportText: failed })), ['TOOL_ERROR']);
  assert.deepEqual(codes(check({ reportText: `${doc([issue()])}\n` })), ['ANALYSIS_COUNT']);
  assert.deepEqual(codes(check({ reportText: `${doc([issue(), { contract: 'A' }])}\n${doc([])}\n` })), ['MALFORMED_ISSUE']);
  assert.throws(() => parseReport('{not json\n'), InputError);
  assert.throws(() => parseReport('[1]\n{"a":1}\n{1}\n'), InputError);
});

test('a record absent from this run is a note, not a failure, and is marked when timeout-dependent', () => {
  const r8 = record({ id: 'R8', swcId: '113', pc: 1781, timeoutDependent: true });
  const result = check({ dispositions: dispositions([record(), r8]) });
  assert.equal(result.ok, true);
  assert.deepEqual(result.notes, [{ code: 'NOT_REPORTED', message: 'R8 was not reported in this run (recorded as timeout-dependent)' }]);
});

test('only benign dispositions with an owner approval are accepted; ambiguous or unsafe files are rejected', () => {
  assert.deepEqual(codes(check({ dispositions: dispositions([record({ disposition: 'real' })]) })), ['NOT_DISPOSITIONABLE']);
  assert.deepEqual(codes(check({ dispositions: dispositions(undefined, { ownerApproval: ' ' }) })), ['NO_OWNER_APPROVAL']);
  const invalid = [
    dispositions([record(), record({ id: 'EXP-1b' })]),
    dispositions([record(), record()]),
    dispositions([record({ sources: [{ path: '../outside.sol', sha256: sha('') }] })]),
    dispositions([record({ sources: [{ path: '/etc/passwd', sha256: sha('') }] })]),
    dispositions([record({ pc: '785' })]),
    dispositions([record({ runtimeBytecode: { contract: 'A', sha256: 'abc' } })]),
    dispositions([]),
    dispositions(undefined, { schemaVersion: 2 }),
  ];
  for (const value of invalid) assert.throws(() => check({ dispositions: value }), InputError, JSON.stringify(value).slice(0, 120));
});

test('CLI exit codes: 0 pass, 1 mismatch, 2 unusable input', () => {
  const root = fixture();
  try {
    writeFileSync(join(root, 'disp.json'), JSON.stringify(dispositions()));
    writeFileSync(join(root, 'report.log'), report());
    writeFileSync(join(root, 'A.hex'), `${RUNTIME}\n`);
    const run = (...extra) => spawnSync(process.execPath, [script, '--root', root, '--dispositions', join(root, 'disp.json'), '--report', join(root, 'report.log'), ...extra], { encoding: 'utf8' });
    const ok = run('--bytecode', `A=${join(root, 'A.hex')}`);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /^ok EXP-1$/m);
    const unverified = run();
    assert.equal(unverified.status, 1, unverified.stdout);
    assert.match(unverified.stdout, /^FAIL BYTECODE_UNVERIFIED /m);
    writeFileSync(join(root, 'disp.json'), '{');
    assert.equal(run('--bytecode', `A=${join(root, 'A.hex')}`).status, 2);
    assert.equal(spawnSync(process.execPath, [script, '--report'], { encoding: 'utf8' }).status, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the checker stays unwired: no workflow or package script references it', () => {
  const workflows = join(repo, '.github/workflows');
  for (const name of readdirSync(workflows)) {
    assert.doesNotMatch(readFileSync(join(workflows, name), 'utf8'), /mythril-disposition-check/, name);
  }
  assert.doesNotMatch(readFileSync(join(repo, 'package.json'), 'utf8'), /mythril-disposition-check/);
  assert.doesNotMatch(readFileSync(join(repo, RUNNER_PATH), 'utf8'), /disposition-check/);
});
