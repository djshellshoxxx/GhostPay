// Offline synthetic evidence and approvals only. No fixture approval authorizes a real finding exception.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkDispositions, decodeBytecode, InputError, parseJson, parseReport, readPins, RUNNER_PATH, WORKFLOW_PATH,
  TARGETS, sourceInventory, configurationFromPins, canonical, sha256, toolchainIdentity } from '../contract-analysis/mythril-disposition-check.mjs';
const repo = fileURLToPath(new URL('../..', import.meta.url));
const script = join(repo, 'scripts/contract-analysis/mythril-disposition-check.mjs');
const RUNNER = readFileSync(join(repo, RUNNER_PATH), 'utf8');
const WORKFLOW = "python3 -m pip install --quiet 'mythril==0.24.8' 'solc-select==1.2.0'\n";
const SOURCE = 'contract A { function f() external { if (block.timestamp > 1) revert(); } }\n';
const RUNTIME = '0x6080604052';
const TARGET = 'GhostPaySweepRelayer';
const COMPLETE = { schemaVersion: 1, instrumentationReady: true, reportCount: 1, executionTimeoutObserved: false, creationTimeoutObserved: false, exceptionCount: 0, errorLogObserved: false };
const issue = (overrides = {}) => ({ 'swc-id': '116', contract: 'A', function: 'f()', address: 785, severity: 'Low',
  sourceMap: '4414:50', filename: 'src/A.sol', lineno: 1, title: 'Dependence on predictable environment variable', tx_sequence: {}, ...overrides });
const doc = (issues = []) => ({ error: null, issues, success: true });
const codes = (result) => result.failures.map((f) => f.code);
function put(root, path, bytes) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); }
function setOutput(ctx, target, value, exitCode = undefined, stderr = '') {
  const entry = ctx.evidence.analyses.find((a) => a.target === target);
  const stdout = typeof value === 'string' ? value : `${JSON.stringify(value)}\n`;
  if (exitCode === undefined) exitCode = value?.issues?.length ? 1 : 0;
  put(ctx.evidenceRoot, `${target}.stdout.json`, stdout); put(ctx.evidenceRoot, `${target}.stderr.log`, stderr);
  const completeness = JSON.stringify(COMPLETE);
  put(ctx.evidenceRoot, `${target}.completeness.json`, completeness);
  Object.assign(entry, { completeness: { path: `${target}.completeness.json`, sha256: sha256(completeness) }, exitCode, stdout: { path: `${target}.stdout.json`, sha256: sha256(stdout) }, stderr: { path: `${target}.stderr.log`, sha256: sha256(stderr) } });
}
function render(ctx) {
  let report = ''; let runnerExitCode = 0;
  for (const entry of ctx.evidence.analyses) {
    const stdout = readFileSync(join(ctx.evidenceRoot, entry.stdout.path), 'utf8');
    report += readFileSync(join(ctx.evidenceRoot, entry.stderr.path), 'utf8') + stdout;
    let valid = false;
    try { const value = JSON.parse(stdout); valid = value.success === true && value.error === null && Array.isArray(value.issues) && value.issues.length === 0; } catch { /* malformed fixture */ }
    if (entry.exitCode !== 0 || !valid) { report += `::error::mythril: ${entry.target} reported issues or failed (rc=${entry.exitCode})\n`; runnerExitCode = 1; }
  }
  ctx.evidence.runnerExitCode = runnerExitCode; ctx.reportText = report;
}
function approveFixture(ctx) {
  ctx.dispositions.ownerApproval = { status: 'approved', identity: 'SYNTHETIC-TEST-OWNER', evidence: 'https://example.invalid/fixture-approval',
    recordsDigest: sha256(canonical(ctx.dispositions.records)), sourceIdentity: ctx.evidence.sourceIdentity,
    configurationDigest: sha256(canonical(ctx.evidence.configuration)) };
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ghostpay-myth-disp-'));
  const evidenceRoot = join(root, 'evidence'); mkdirSync(evidenceRoot);
  const files = { [RUNNER_PATH]: RUNNER, [WORKFLOW_PATH]: WORKFLOW, 'packages/contracts/src/A.sol': SOURCE,
    'packages/contracts/foundry.toml': '# fixture\n', 'packages/contracts/scripts/mythril-compat.py': '# fixture\n',
    'packages/contracts/scripts/capture-mythril-evidence.py': '# fixture\n',
    'packages/contracts/lib/openzeppelin-contracts/contracts/Fixture.sol': 'contract Fixture {}\n' };
  for (const target of TARGETS) files[`packages/contracts/src/${target}.sol`] = `contract ${target} {}\n`;
  for (const [path, bytes] of Object.entries(files)) put(root, path, bytes);
  const pins = readPins(root); const sourceFiles = sourceInventory(root); const sourceIdentity = sha256(canonical(sourceFiles));
  const config = JSON.stringify({ remappings: [`@openzeppelin/contracts/=${root}/packages/contracts/lib/openzeppelin-contracts/contracts/`], optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' });
  put(evidenceRoot, 'config.json', config);
  const ctx = { root, evidenceRoot, bytecodes: new Map([[TARGET, decodeBytecode(RUNTIME, TARGET)]]),
    evidence: { schemaVersion: 1, analyzer: 'mythril', completed: true, sourceUnchanged: true, sourceRoot: root, sourceCommit: 'a'.repeat(40),
      sourceFiles, sourceIdentity, configuration: configurationFromPins(pins), configSha256: sha256(config),
      tools: { mythril: { exitCode: 0, stdout: 'Mythril version v0.24.8\n', stderr: '', executableSha256: '1'.repeat(64) },
        solc: { exitCode: 0, stdout: 'solc, the solidity compiler commandline interface\nVersion: 0.8.28+commit.7893614a.Linux.g++\n', stderr: '', executableSha256: '2'.repeat(64) } },
      analyses: TARGETS.map((target) => ({ target, sourceFile: `packages/contracts/src/${target}.sol`,
        argv: ['analyze', `src/${target}.sol`, '--solv', '0.8.28', '--solc-json', 'config.json', '--execution-timeout', '900', '-t', '3', '-o', 'json'] })) },
    dispositions: { schemaVersion: 2, analyzer: 'mythril', expectedAnalyses: 5, records: [{
      id: 'EXP-1', analysisTarget: TARGET, contract: 'A', function: 'f()', swcId: '116', pc: 785, severity: 'Low',
      sourceMap: '4414:50', filename: 'packages/contracts/src/A.sol', lineno: 1, sourceFile: 'packages/contracts/src/A.sol',
      sources: [{ path: 'packages/contracts/src/A.sol', sha256: sha256(SOURCE) }], sourceIdentity,
      runtimeBytecode: { contract: TARGET, sha256: sha256(Buffer.from('6080604052', 'hex')) },
      compiler: pins.compiler, analysis: pins.analysis, analyzerVersion: '0.24.8', disposition: 'benign-intended', evidence: 'synthetic-review-only',
      residualRisk: 'Synthetic timestamp fixture only; no production disposition.', review: { identity: 'SYNTHETIC-TEST-REVIEWER', evidence: 'https://example.invalid/fixture-review', sourceIdentity },
    }] } };
  ctx.evidence.tools.mythrilCompiler = { ...ctx.evidence.tools.solc, argv: ['/fixture/native-solc', '--version'], selection: 'solcx.install.get_executable(0.8.28)', executablePath: '/fixture/native-solc', resolverSha256: '3'.repeat(64), mythrilSelectorSha256: '4'.repeat(64) };
  for (const entry of ctx.evidence.analyses) entry.compiler = structuredClone(ctx.evidence.tools.mythrilCompiler);
  ctx.dispositions.records[0].toolchainIdentity = toolchainIdentity(ctx.evidence);
  for (const target of TARGETS) setOutput(ctx, target, doc(target === TARGET ? [issue()] : []));
  render(ctx); approveFixture(ctx); return ctx;
}
function check(mutate = () => {}) {
  const ctx = fixture();
  try { mutate(ctx); return checkDispositions(ctx); } finally { rmSync(ctx.root, { recursive: true, force: true }); }
}
function rejectsCode(result, code) { assert.equal(result.ok, false); assert.ok(codes(result).includes(code), JSON.stringify(result)); }

test('passes when every reported issue matches a record whose keys all still hold', () => {
  const result = check(); assert.deepEqual(result.failures, []); assert.equal(result.ok, true); assert.deepEqual(result.matched, ['EXP-1']);
});
test('a new or moved record is undispositioned: other PC, SWC, function, contract or severity', () => {
  for (const change of [{ address: 786 }, { 'swc-id': '107' }, { function: 'g()' }, { contract: 'B' }, { severity: 'Medium' }]) {
    const result = check((ctx) => { setOutput(ctx, TARGET, doc([issue(), issue(change)])); render(ctx); });
    assert.deepEqual(codes(result), ['UNDISPOSITIONED'], JSON.stringify(change));
  }
});
test('a recorded source location that moved fails even with the same PC', () => {
  for (const change of [{ sourceMap: '4414:51' }, { lineno: 2 }, { filename: 'src/PolicyAccount.sol' }]) {
    const result = check((ctx) => { setOutput(ctx, TARGET, doc([issue(change)])); render(ctx); });
    assert.deepEqual(codes(result), ['LOCATION_CHANGED']);
  }
});
test('any changed or missing source file fails every record that names it', () => {
  rejectsCode(check((ctx) => put(ctx.root, 'packages/contracts/src/A.sol', `${SOURCE} `)), 'SOURCE_CHANGED');
  rejectsCode(check((ctx) => { ctx.dispositions.records[0].sources[0].path = 'packages/contracts/src/Missing.sol'; ctx.dispositions.records[0].sourceFile = 'packages/contracts/src/Missing.sol'; approveFixture(ctx); }), 'SOURCE_MISSING');
});
test('runtime bytecode must be supplied and must still hash to the recorded value', () => {
  assert.deepEqual(codes(check((ctx) => { ctx.bytecodes = new Map(); })), ['BYTECODE_UNVERIFIED']);
  assert.deepEqual(codes(check((ctx) => { ctx.bytecodes.set(TARGET, decodeBytecode('0x6080604053', TARGET)); })), ['BYTECODE_CHANGED']);
  assert.throws(() => decodeBytecode('0x608', 'A'), InputError); assert.throws(() => decodeBytecode('nothex', 'A'), InputError);
});
test('compiler version, optimizer runs, EVM version and analyzer version are read from repository pins', () => {
  for (const [change, code] of [[RUNNER.replaceAll('--solv 0.8.28', '--solv 0.8.29'), 'COMPILER_CHANGED'], [RUNNER.replace('"runs": 200', '"runs": 1000'), 'COMPILER_CHANGED'], [RUNNER.replace('cancun', 'prague'), 'COMPILER_CHANGED']]) rejectsCode(check((ctx) => put(ctx.root, RUNNER_PATH, change)), code);
  rejectsCode(check((ctx) => put(ctx.root, WORKFLOW_PATH, WORKFLOW.replace('0.24.8', '0.24.9'))), 'ANALYZER_CHANGED');
  assert.throws(() => check((ctx) => put(ctx.root, RUNNER_PATH, `${RUNNER}\n--solv 0.8.27\n`)), /exactly one --solv/);
});
test('tool errors, a missing analysis and malformed documents never pass', () => {
  rejectsCode(check((ctx) => { setOutput(ctx, TARGET, { error: 'Solc experienced a fatal error', issues: [], success: false }, 2); render(ctx); }), 'TOOL_ERROR');
  rejectsCode(check((ctx) => { ctx.evidence.analyses.pop(); render(ctx); }), 'ANALYSIS_COVERAGE');
  rejectsCode(check((ctx) => { setOutput(ctx, TARGET, doc([issue(), { contract: 'A' }])); render(ctx); }), 'MALFORMED_ISSUE');
  assert.throws(() => parseReport('{not json\n'), InputError); assert.throws(() => parseReport('[1]\n{"a":1}\n{1}\n'), InputError);
});
test('runner failures never become successful disposition checks because JSON looks valid', () => {
  for (const rc of [0, 2, 124, 126, 127, 137, 143]) rejectsCode(check((ctx) => { setOutput(ctx, TARGET, doc([issue()]), rc); render(ctx); }), 'RUNNER_ERROR');
  rejectsCode(check((ctx) => { setOutput(ctx, TARGET, doc([]), 1); render(ctx); }), 'RUNNER_ERROR');
});
test('malformed, unassociated, mislabeled and duplicate runner error annotations fail closed', () => {
  const annotation = `::error::mythril: ${TARGET} reported issues or failed (rc=1)`;
  for (const replacement of ['::error::mythril: A failed without a valid exit code', `${annotation}\n${annotation}`, '::error::analysis output was truncated', '::error::mythril: PolicyAccount reported issues or failed (rc=1)']) rejectsCode(check((ctx) => { ctx.reportText = ctx.reportText.replace(annotation, replacement); }), 'REPORT_MISMATCH');
  rejectsCode(check((ctx) => { ctx.reportText = `${annotation}\n${ctx.reportText}`; }), 'REPORT_MISMATCH');
});
test('a record absent from this run is a note and is marked when timeout-dependent', () => {
  const result = check((ctx) => { ctx.dispositions.records.push({ ...structuredClone(ctx.dispositions.records[0]), id: 'R8', swcId: '113', pc: 1781, timeoutDependent: true }); approveFixture(ctx); });
  assert.equal(result.ok, true); assert.deepEqual(result.notes, [{ code: 'NOT_REPORTED', message: 'R8 was not reported in this run (recorded as timeout-dependent)' }]);
});
test('only benign dispositions with an exact scoped owner approval are accepted', () => {
  assert.deepEqual(codes(check((ctx) => { ctx.dispositions.records[0].disposition = 'real'; approveFixture(ctx); })), ['NOT_DISPOSITIONABLE']);
  assert.deepEqual(codes(check((ctx) => { ctx.dispositions.ownerApproval = ' '; })), ['NO_OWNER_APPROVAL']);
  rejectsCode(check((ctx) => { ctx.dispositions.ownerApproval.status = 'pending'; }), 'NO_OWNER_APPROVAL');
  rejectsCode(check((ctx) => { ctx.dispositions.records[0].residualRisk += ' changed'; }), 'APPROVAL_SCOPE_CHANGED');
  for (const field of ['recordsDigest', 'sourceIdentity', 'configurationDigest']) rejectsCode(check((ctx) => { ctx.dispositions.ownerApproval[field] = '0'.repeat(64); }), 'APPROVAL_SCOPE_CHANGED');
});
test('ambiguous, unsafe or under-specified disposition records are rejected', () => {
  const invalid = [
    (ctx) => ctx.dispositions.records.push({ ...ctx.dispositions.records[0], id: 'EXP-1b' }),
    (ctx) => ctx.dispositions.records.push(ctx.dispositions.records[0]),
    (ctx) => { ctx.dispositions.records[0].sources[0].path = '../outside.sol'; },
    (ctx) => { ctx.dispositions.records[0].sources[0].path = '/etc/passwd'; },
    (ctx) => { ctx.dispositions.records[0].pc = '785'; },
    (ctx) => { ctx.dispositions.records[0].runtimeBytecode.sha256 = 'abc'; },
    (ctx) => { ctx.dispositions.schemaVersion = 1; },
    (ctx) => { ctx.dispositions.expectedAnalyses = 1; },
    (ctx) => { delete ctx.dispositions.records[0].sourceMap; },
    (ctx) => { delete ctx.dispositions.records[0].review.identity; },
    (ctx) => { ctx.dispositions.records[0].sources.push(ctx.dispositions.records[0].sources[0]); },
  ];
  for (const mutate of invalid) assert.throws(() => check(mutate), InputError);
});
test('CLI exit codes: 0 pass, 1 mismatch, 2 unusable input; repeated flags are refused', () => {
  const ctx = fixture();
  try {
    put(ctx.root, 'disp.json', JSON.stringify(ctx.dispositions)); put(ctx.root, 'report.log', ctx.reportText);
    put(ctx.evidenceRoot, 'manifest.json', JSON.stringify(ctx.evidence)); put(ctx.root, 'A.hex', `${RUNTIME}\n`);
    const args = [script, '--root', ctx.root, '--dispositions', join(ctx.root, 'disp.json'), '--report', join(ctx.root, 'report.log'), '--evidence', join(ctx.evidenceRoot, 'manifest.json')];
    const run = (...extra) => spawnSync(process.execPath, [...args, ...extra], { encoding: 'utf8' });
    const ok = run('--bytecode', `${TARGET}=${join(ctx.root, 'A.hex')}`); assert.equal(ok.status, 0, ok.stdout + ok.stderr); assert.match(ok.stdout, /^ok EXP-1$/m);
    const unverified = run(); assert.equal(unverified.status, 1, unverified.stdout); assert.match(unverified.stdout, /^FAIL BYTECODE_UNVERIFIED /m);
    assert.equal(run('--root', ctx.root).status, 2);
    put(ctx.root, 'disp.json', '{'); assert.equal(run('--bytecode', `${TARGET}=${join(ctx.root, 'A.hex')}`).status, 2);
    assert.equal(spawnSync(process.execPath, [script, '--report'], { encoding: 'utf8' }).status, 2);
  } finally { rmSync(ctx.root, { recursive: true, force: true }); }
});
test('the checker stays unwired: workflow triggers may cover it but no executable step invokes it', () => {
  for (const name of readdirSync(join(repo, '.github/workflows'))) {
    const text = readFileSync(join(repo, '.github/workflows', name), 'utf8');
    assert.doesNotMatch(text, /(?:node|bash|python\S*|npm[^\n]*)[^\n]*scripts\/contract-analysis\/mythril-disposition-check\.mjs/, name);
  }
  assert.doesNotMatch(readFileSync(join(repo, 'package.json'), 'utf8'), /mythril-disposition-check/);
  assert.doesNotMatch(readFileSync(join(repo, RUNNER_PATH), 'utf8'), /disposition-check/);
});
test('five anonymous clean documents cannot qualify without target-bound capture evidence', () => {
  assert.throws(() => check((ctx) => { delete ctx.evidence; ctx.reportText = Array.from({ length: 5 }, () => JSON.stringify(doc([]))).join('\n'); }), /capture manifest/);
});
test('duplicate, unknown and reordered target records cannot substitute for missing coverage', () => {
  rejectsCode(check((ctx) => { ctx.evidence.analyses[4] = structuredClone(ctx.evidence.analyses[0]); render(ctx); }), 'ANALYSIS_COVERAGE');
  rejectsCode(check((ctx) => { [ctx.evidence.analyses[0], ctx.evidence.analyses[2]] = [ctx.evidence.analyses[2], ctx.evidence.analyses[0]]; render(ctx); }), 'ANALYSIS_COVERAGE');
  assert.throws(() => check((ctx) => { ctx.evidence.analyses[0].target = 'Unexpected'; }), InputError);
});
test('duplicate findings and duplicate JSON keys are rejected', () => {
  assert.deepEqual(codes(check((ctx) => { setOutput(ctx, TARGET, doc([issue(), issue()])); render(ctx); })), ['DUPLICATE_ISSUE']);
  assert.throws(() => parseJson('{"success":false,"success":true}'), /duplicate object key/);
  assert.throws(() => parseJson('{"a":{"status":"error","status":"ok"}}'), /duplicate object key/);
  assert.throws(() => parseJson('{"a":1,"\\u0061":2}'), /duplicate object key/);
  rejectsCode(check((ctx) => { setOutput(ctx, TARGET, '{"success":false,"success":true,"error":null,"issues":[]}\n', 0); render(ctx); }), 'MALFORMED_REPORT');
});
test('lowered depth, timeout, module whitelist or changed invocation invalidates evidence', () => {
  for (const [field, value] of [['transactionDepth', 1], ['executionTimeoutSeconds', 30], ['modules', 'arbitrary']]) rejectsCode(check((ctx) => { ctx.evidence.configuration[field] = value; }), 'CONFIGURATION_CHANGED');
  rejectsCode(check((ctx) => { ctx.evidence.analyses[0].argv[7] = '30'; }), 'CONFIGURATION_CHANGED');
  rejectsCode(check((ctx) => { ctx.evidence.analyses[0].argv.push('-m', 'PredictableVariables'); }), 'CONFIGURATION_CHANGED');
  assert.throws(() => check((ctx) => put(ctx.root, RUNNER_PATH, RUNNER.replaceAll('-t 3', '-t 1'))), /analysis budget/);
  assert.throws(() => check((ctx) => put(ctx.root, RUNNER_PATH, RUNNER.replace('1:-900', '1:-30'))), /analysis budget/);
});
test('source closure, capture hashes, tool identities and unfinished campaigns fail closed', () => {
  rejectsCode(check((ctx) => put(ctx.root, 'packages/contracts/lib/openzeppelin-contracts/contracts/Fixture.sol', 'changed\n')), 'SOURCE_CHANGED');
  rejectsCode(check((ctx) => { ctx.evidence.sourceFiles.pop(); }), 'SOURCE_CHANGED');
  rejectsCode(check((ctx) => put(ctx.evidenceRoot, `${TARGET}.stdout.json`, '{}')), 'REPORT_CHANGED');
  rejectsCode(check((ctx) => { ctx.evidence.tools.mythril.stdout = 'Mythril version v0.24.9'; }), 'TOOL_VERSION');
  rejectsCode(check((ctx) => { ctx.evidence.tools.mythrilCompiler.exitCode = 127; }), 'TOOL_VERSION');
  rejectsCode(check((ctx) => { ctx.evidence.completed = false; }), 'PARTIAL_ANALYSIS');
  rejectsCode(check((ctx) => { ctx.evidence.sourceUnchanged = false; }), 'PARTIAL_ANALYSIS');
  rejectsCode(check((ctx) => { ctx.evidence.runnerExitCode = 0; }), 'RUNNER_ERROR');
});
test('unrecognized stdout, stderr and aggregate text cannot be hidden by valid JSON', () => {
  rejectsCode(check((ctx) => { setOutput(ctx, TARGET, `${JSON.stringify(doc([issue()]))}\nunknown text\n`, 1); render(ctx); }), 'MALFORMED_REPORT');
  for (const stderr of ['ERROR: analysis failed\n', 'Traceback (most recent call last):\n', 'unknown analyzer diagnostic\n', 'execution timeout\n']) rejectsCode(check((ctx) => { setOutput(ctx, TARGET, doc([issue()]), 1, stderr); render(ctx); }), 'TOOL_ERROR');
  rejectsCode(check((ctx) => { ctx.reportText += 'unknown output\n'; }), 'REPORT_MISMATCH');
});
test('the exact known pkg_resources deprecation is retained without erasing diagnostics', () => {
  const stderr = '/fixture/venv/lib/python3.12/site-packages/eth/__init__.py:1: UserWarning: pkg_resources is deprecated as an API. See https://setuptools.pypa.io/en/latest/pkg_resources.html. The pkg_resources package is slated for removal as early as 2025-11-30. Refrain from using this package or pin to Setuptools<81.\n  import pkg_resources\n';
  assert.equal(check((ctx) => { setOutput(ctx, TARGET, doc([issue()]), 1, stderr); render(ctx); }).ok, true);
  rejectsCode(check((ctx) => { setOutput(ctx, TARGET, doc([issue()]), 1, stderr + 'ERROR: something else\n'); render(ctx); }), 'TOOL_ERROR');
});
test('complete clean analysis succeeds without inventing exception records or owner approval', () => {
  const result = check((ctx) => { ctx.dispositions.records = []; delete ctx.dispositions.ownerApproval; setOutput(ctx, TARGET, doc([])); render(ctx); });
  assert.equal(result.ok, true); assert.deepEqual(result.matched, []); assert.deepEqual(result.failures, []);
});
test('absolute source filenames normalize only under the captured root and exact inventory', () => {
  assert.equal(check((ctx) => { setOutput(ctx, TARGET, doc([issue({ filename: `${ctx.root}/packages/contracts/src/A.sol` })])); render(ctx); }).ok, true);
  rejectsCode(check((ctx) => { setOutput(ctx, TARGET, doc([issue({ filename: '/untrusted/checkout/packages/contracts/src/A.sol' })])); render(ctx); }), 'LOCATION_CHANGED');
});
test('source and evidence symlinks are refused', () => {
  assert.throws(() => check((ctx) => { const path = join(ctx.evidenceRoot, `${TARGET}.stdout.json`); rmSync(path); symlinkSync(join(ctx.root, 'packages/contracts/src/A.sol'), path); }), /symlink/);
  assert.throws(() => check((ctx) => { symlinkSync(join(ctx.root, 'packages/contracts/src/A.sol'), join(ctx.root, 'packages/contracts/src/Alias.sol')); }), /symlink/);
});

test('actual native compiler identity is required even when PATH solc reports the expected version', () => {
  rejectsCode(check((ctx) => { delete ctx.evidence.tools.mythrilCompiler; }), 'TOOL_VERSION');
  rejectsCode(check((ctx) => { ctx.evidence.tools.mythrilCompiler.executableSha256 = '9'.repeat(64); }), 'TOOLCHAIN_CHANGED');
  rejectsCode(check((ctx) => { ctx.evidence.analyses[1].compiler.executableSha256 = '9'.repeat(64); }), 'TOOL_VERSION');
  assert.equal(check((ctx) => { ctx.evidence.tools.solc.stdout = 'PATH launcher is unrelated to actual native compiler'; }).ok, true);
});

test('unexpected analyzer error annotations cannot be ignored beside successful JSON fields', () => {
  rejectsCode(check((ctx) => { setOutput(ctx, TARGET, { ...doc([issue()]), exceptions: ['symbolic engine failed'] }, 1); render(ctx); }), 'TOOL_ERROR');
});

test('additional compiler settings cannot hide behind an updated config file hash', () => {
  for (const extra of [{ viaIR: true }, { metadata: { bytecodeHash: 'none' } }, { debug: { revertStrings: 'strip' } }]) {
    const result = check((ctx) => {
      const path = join(ctx.evidenceRoot, 'config.json');
      const config = { ...JSON.parse(readFileSync(path, 'utf8')), ...extra };
      const bytes = JSON.stringify(config);
      writeFileSync(path, bytes);
      ctx.evidence.configSha256 = sha256(bytes);
    });
    rejectsCode(result, 'CONFIGURATION_CHANGED');
  }
});

test('captured internal timeout, exceptions or missing instrumentation cannot be dispositioned', () => {
  for (const changes of [{ executionTimeoutObserved: true }, { creationTimeoutObserved: true }, { exceptionCount: 1 }, { errorLogObserved: true }, { reportCount: 0 }, { reportCount: 2 }, { instrumentationReady: false }, { executionTimeoutObserved: 'false' }, { unexpected: 'error' }]) {
    const result = check((ctx) => {
      const entry = ctx.evidence.analyses.find((a) => a.target === TARGET);
      const value = JSON.stringify({ ...COMPLETE, ...changes });
      put(ctx.evidenceRoot, entry.completeness.path, value);
      entry.completeness.sha256 = sha256(value);
    });
    rejectsCode(result, 'PARTIAL_ANALYSIS');
  }
  rejectsCode(check((ctx) => {
    const entry = ctx.evidence.analyses.find((a) => a.target === TARGET);
    const value = JSON.stringify(COMPLETE).replace('"exceptionCount":0', '"exceptionCount":1,"exceptionCount":0');
    put(ctx.evidenceRoot, entry.completeness.path, value); entry.completeness.sha256 = sha256(value);
  }), 'PARTIAL_ANALYSIS');
});
