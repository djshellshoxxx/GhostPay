#!/usr/bin/env node
// UNWIRED: this helper never clears the strict production runner. Activating finding exceptions is a separate
// owner decision. A source-controlled approval record is review evidence, not cryptographic proof of its author;
// the authenticated review and its exact records digest must be verified outside this offline helper.
//
// Usage: --dispositions file.json --report report.log --evidence capture/manifest.json
//        [--root repo] [--bytecode Contract=runtime.hex]...
// Evidence binds process/target coverage and compatibility telemetry for internal timeouts/exceptions.
// Known incomplete execution is rejected. Configured transaction/depth/solver bounds are not exhaustive proof.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUNNER_PATH = 'packages/contracts/scripts/run-mythril.sh';
export const WORKFLOW_PATH = '.github/workflows/contract-analysis.yml';
export const TARGETS = ['GhostPayRouter', 'GhostPaySweepRelayer', 'GhostPayPolicyRouter', 'PolicyAccount', 'PolicyAccountFactory'];
export const FIXED_INPUTS = [WORKFLOW_PATH, 'packages/contracts/foundry.toml', RUNNER_PATH,
  'packages/contracts/scripts/mythril-compat.py', 'packages/contracts/scripts/capture-mythril-evidence.py'];
export const SOURCE_DIRECTORIES = ['packages/contracts/src', 'packages/contracts/lib/openzeppelin-contracts/contracts'];
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const ALLOWED_DISPOSITIONS = new Set(['benign-intended', 'false-positive']);
const SHA256 = /^[0-9a-f]{64}$/;
export class InputError extends Error {}
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
const nonempty = (value) => typeof value === 'string' && value.trim() !== '';
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function readRegularFile(path) {
  const info = lstatSync(path);
  if (!info.isFile()) throw new InputError(`${path} is not a regular file`);
  if (info.size > MAX_INPUT_BYTES) throw new InputError(`${path} exceeds ${MAX_INPUT_BYTES} bytes`);
  return readFileSync(path);
}
function safeRelativePath(path) {
  return typeof path === 'string' && path !== '' && !isAbsolute(path) && !path.includes('\\')
    && normalize(path) === path && !path.split('/').some((part) => part === '..' || part === '.');
}
function localFile(root, path) {
  if (!safeRelativePath(path)) throw new InputError(`unsafe relative path: ${path}`);
  let current = root;
  for (const part of path.split('/')) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new InputError(`symlink input: ${path}`);
  }
  const resolved = realpathSync(current);
  if (!resolved.startsWith(`${realpathSync(root)}${sep}`)) throw new InputError(`input escapes root: ${path}`);
  return readRegularFile(current);
}

/** JSON.parse accepts duplicate keys. Reject them before they can erase a failure field or create ambiguous IDs. */
export function parseJson(text, label = 'JSON') {
  let value;
  try { value = JSON.parse(text); } catch { throw new InputError(`${label} is not valid JSON`); }
  const stack = [];
  for (const match of text.matchAll(/"(?:[^"\\]|\\.)*"|[{}]/g)) {
    if (match[0] === '{') stack.push(new Set());
    else if (match[0] === '}') stack.pop();
    else if (/^\s*:/.test(text.slice(match.index + match[0].length))) {
      const key = JSON.parse(match[0]);
      const keys = stack.at(-1);
      if (keys?.has(key)) throw new InputError(`${label} has duplicate object key ${JSON.stringify(key)}`);
      keys?.add(key);
    }
  }
  return value;
}

/** Strict aggregate parser retained for diagnostics; qualification uses captured target documents below. */
export function parseReport(text) {
  const analyses = [];
  for (const [index, raw] of text.split('\n').entries()) {
    const line = raw.trim();
    if (!line || /^::error::mythril: [A-Za-z_$][A-Za-z0-9_$]* reported issues or failed \(rc=[0-9]+\)$/.test(line)) continue;
    if (!line.startsWith('{')) throw new InputError(`report line ${index + 1}: unrecognized output`);
    const value = parseJson(line, `report line ${index + 1}`);
    if (!object(value)) throw new InputError(`report line ${index + 1} is not a JSON object`);
    analyses.push({ line: index + 1, value });
  }
  return analyses;
}

/** Read the effective constants; the evidence also hashes the full runner, compatibility layer and workflow. */
export function readPins(root) {
  const runner = localFile(root, RUNNER_PATH).toString('utf8');
  const workflow = localFile(root, WORKFLOW_PATH).toString('utf8');
  const one = (name, values) => {
    if (!values.length || new Set(values).size !== 1) throw new InputError(`cannot read exactly one ${name} pin (found ${values.length})`);
    return values[0];
  };
  const compiler = {
    version: one('--solv', [...runner.matchAll(/--solv\s+([0-9]+\.[0-9]+\.[0-9]+)\b/g)].map((m) => m[1])),
    optimizerRuns: one('optimizer runs', [...runner.matchAll(/"optimizer":\s*\{\s*"enabled":\s*true,\s*"runs":\s*([0-9]+)\s*\}/g)].map((m) => Number(m[1]))),
    evmVersion: one('evmVersion', [...runner.matchAll(/"evmVersion":\s*"([a-z]+)"/g)].map((m) => m[1])),
  };
  const analyzerVersion = one('mythril==', [...workflow.matchAll(/'mythril==([0-9]+\.[0-9]+\.[0-9]+)'/g)].map((m) => m[1]));
  const transactionDepth = one('transaction depth', [...runner.matchAll(/(?:^|\s)-t\s+([0-9]+)\b/g)].map((m) => Number(m[1])));
  const executionTimeoutSeconds = one('execution timeout', [...runner.matchAll(/timeout="\$\{1:-([0-9]+)\}"/g)].map((m) => Number(m[1])));
  if (transactionDepth !== 3 || executionTimeoutSeconds !== 900) throw new InputError('analysis budget differs from reviewed depth 3 / 900 seconds');
  return { compiler, analyzerVersion, analysis: { transactionDepth, executionTimeoutSeconds, modules: 'default' } };
}

export function sourceInventory(root) {
  const paths = [...FIXED_INPUTS];
  function walk(path) {
    const names = readdirSync(join(root, path)).sort();
    for (const name of names) {
      const child = `${path}/${name}`;
      const stat = lstatSync(join(root, child));
      if (stat.isSymbolicLink()) throw new InputError(`symlink in analysis sources: ${child}`);
      if (stat.isDirectory()) walk(child);
      else if (name.endsWith('.sol')) paths.push(child);
    }
  }
  for (const directory of SOURCE_DIRECTORIES) {
    if (lstatSync(join(root, directory)).isSymbolicLink()) throw new InputError(`symlink source directory: ${directory}`);
    walk(directory);
  }
  return [...new Set(paths)].sort().map((path) => ({ path, sha256: sha256(localFile(root, path)) }));
}
export const configurationFromPins = (pins) => ({ compilerVersion: pins.compiler.version, optimizerEnabled: true,
  optimizerRuns: pins.compiler.optimizerRuns, evmVersion: pins.compiler.evmVersion, ...pins.analysis,
  remappings: ['@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/'] });
export const toolchainIdentity = (evidence) => sha256(canonical({ analyzerExecutable: evidence.tools?.mythril?.executableSha256, compilerExecutable: evidence.tools?.mythrilCompiler?.executableSha256, compilerResolver: evidence.tools?.mythrilCompiler?.resolverSha256, mythrilSelector: evidence.tools?.mythrilCompiler?.mythrilSelectorSha256 }));
const issueKey = (target, contract, fn, swcId, pc, severity) => JSON.stringify([target, contract, fn, swcId, pc, severity]);

export function loadDispositions(value) {
  if (!object(value) || value.schemaVersion !== 2 || value.analyzer !== 'mythril') throw new InputError('dispositions must use mythril schemaVersion 2');
  if (value.expectedAnalyses !== TARGETS.length) throw new InputError('expectedAnalyses must cover all five production targets');
  if (!Array.isArray(value.records)) throw new InputError('records must be an array');
  const byKey = new Map();
  const ids = new Set();
  for (const [index, r] of value.records.entries()) {
    const where = `records[${index}]`;
    if (!object(r) || !nonempty(r.id) || ids.has(r.id)) throw new InputError(`${where}.id must be unique and nonempty`);
    ids.add(r.id);
    for (const field of ['contract', 'function', 'swcId', 'severity', 'disposition', 'evidence', 'analyzerVersion', 'sourceMap', 'residualRisk']) {
      if (!nonempty(r[field])) throw new InputError(`${where}.${field} must be a nonempty string`);
    }
    if (!TARGETS.includes(r.analysisTarget) || !safeRelativePath(r.sourceFile)) throw new InputError(`${where} must name a production analysisTarget and sourceFile`);
    if (!Number.isSafeInteger(r.pc) || r.pc < 0 || !/^\d{3}$/.test(r.swcId)) throw new InputError(`${where} needs a numeric PC and three-digit SWC`);
    if (!['Low', 'Medium', 'High'].includes(r.severity)) throw new InputError(`${where}.severity is unrecognized`);
    if (!SHA256.test(r.toolchainIdentity ?? '')) throw new InputError(`${where}.toolchainIdentity must bind the actual analyzer and native compiler`);
    if (!SHA256.test(r.sourceIdentity ?? '')) throw new InputError(`${where}.sourceIdentity must bind the whole captured source closure`);
    if (!object(r.review) || !nonempty(r.review.identity) || !nonempty(r.review.evidence) || r.review.sourceIdentity !== r.sourceIdentity) throw new InputError(`${where}.review must identify reviewer, evidence and reviewed source identity`);
    const c = r.compiler;
    if (!object(c) || !nonempty(c.version) || !Number.isSafeInteger(c.optimizerRuns) || !nonempty(c.evmVersion)) throw new InputError(`${where}.compiler is malformed`);
    if (!object(r.analysis) || !Number.isSafeInteger(r.analysis.transactionDepth) || !Number.isSafeInteger(r.analysis.executionTimeoutSeconds) || r.analysis.modules !== 'default') throw new InputError(`${where}.analysis is malformed`);
    if (!Array.isArray(r.sources) || !r.sources.length) throw new InputError(`${where}.sources must be nonempty`);
    const paths = new Set();
    for (const s of r.sources) {
      if (!object(s) || !safeRelativePath(s.path) || !SHA256.test(s.sha256 ?? '') || paths.has(s.path)) throw new InputError(`${where}.sources has malformed or duplicate identities`);
      paths.add(s.path);
    }
    if (!paths.has(r.sourceFile)) throw new InputError(`${where}.sources must include sourceFile`);
    const b = r.runtimeBytecode;
    if (!object(b) || b.contract !== r.analysisTarget || !SHA256.test(b.sha256 ?? '')) throw new InputError(`${where}.runtimeBytecode must identify the analyzed target`);
    if ('filename' in r && !nonempty(r.filename)) throw new InputError(`${where}.filename is malformed`);
    if ('lineno' in r && (!Number.isSafeInteger(r.lineno) || r.lineno < 1)) throw new InputError(`${where}.lineno is malformed`);
    if ('timeoutDependent' in r && typeof r.timeoutDependent !== 'boolean') throw new InputError(`${where}.timeoutDependent is malformed`);
    const key = issueKey(r.analysisTarget, r.contract, r.function, r.swcId, r.pc, r.severity);
    if (byKey.has(key)) throw new InputError(`${where} duplicates ${byKey.get(key).id}`);
    byKey.set(key, r);
  }
  return { file: value, byKey };
}

export function decodeBytecode(text, label) {
  const hex = text.trim().replace(/^0x/, '');
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) throw new InputError(`bytecode for ${label} is not hex`);
  return Buffer.from(hex, 'hex');
}

// Only this known dependency deprecation is informational. New diagnostics require review; a stderr phrase
// matching no known warning never becomes accepted merely because its process emitted successful JSON.
function recognizedStderr(text) {
  if (text === '') return true;
  const lines = text.replace(/\n$/, '').split('\n');
  if (lines.length !== 2 || lines[1] !== '  import pkg_resources') return false;
  return /^[^\r\n]+\/site-packages\/(?:eth|mythril)\/__init__\.py:[1-9][0-9]*: UserWarning: pkg_resources is deprecated as an API\. See https:\/\/setuptools\.pypa\.io\/en\/latest\/pkg_resources\.html\. The pkg_resources package is slated for removal as early as 2025-11-30\. Refrain from using this package or pin to Setuptools<81\.$/.test(lines[0]);
}
function normalizeFilename(filename, capturedRoot, paths) {
  if (!nonempty(filename) || filename.includes('\\')) return null;
  let path = filename;
  if (isAbsolute(path)) {
    if (!path.startsWith(`${capturedRoot}/`)) return null;
    path = path.slice(capturedRoot.length + 1);
  } else if (!path.startsWith('packages/contracts/')) path = `packages/contracts/${path}`;
  return safeRelativePath(path) && paths.has(path) ? path : null;
}

function completeTelemetry(value) {
  const keys = ['schemaVersion', 'instrumentationReady', 'reportCount', 'executionTimeoutObserved', 'creationTimeoutObserved', 'exceptionCount', 'errorLogObserved'].sort();
  return object(value) && canonical(Object.keys(value).sort()) === canonical(keys) && value.schemaVersion === 1
    && value.instrumentationReady === true && value.reportCount === 1 && value.executionTimeoutObserved === false
    && value.creationTimeoutObserved === false && value.exceptionCount === 0 && value.errorLogObserved === false;
}

function checkEvidence(evidence, evidenceRoot, root, reportText, pins, fail) {
  if (!object(evidence) || evidence.schemaVersion !== 1 || evidence.analyzer !== 'mythril' || !evidenceRoot) throw new InputError('source-bound capture manifest and evidenceRoot are required');
  if (evidence.completed !== true || evidence.sourceUnchanged !== true) fail('PARTIAL_ANALYSIS', 'capture did not finish all targets with unchanged inputs');
  const actualSources = sourceInventory(root);
  const sourceIdentity = sha256(canonical(actualSources));
  if (canonical(evidence.sourceFiles) !== canonical(actualSources) || evidence.sourceIdentity !== sourceIdentity) fail('SOURCE_CHANGED', 'captured source inventory differs from the current complete input inventory');
  const configuration = configurationFromPins(pins);
  if (canonical(evidence.configuration) !== canonical(configuration)) fail('CONFIGURATION_CHANGED', 'captured analysis configuration differs from the reviewed runner');
  const configBytes = localFile(evidenceRoot, 'config.json');
  if (sha256(configBytes) !== evidence.configSha256) fail('CONFIGURATION_CHANGED', 'captured compiler configuration hash differs');
  const config = parseJson(configBytes.toString('utf8'), 'captured compiler configuration');
  const remap = config?.remappings;
  if (!object(config) || canonical(Object.keys(config).sort()) !== canonical(['evmVersion', 'optimizer', 'remappings']) || canonical(config.optimizer) !== canonical({ enabled: true, runs: pins.compiler.optimizerRuns }) || config.evmVersion !== pins.compiler.evmVersion
    || !Array.isArray(remap) || remap.length !== 1 || typeof remap[0] !== 'string'
    || !nonempty(evidence.sourceRoot) || !isAbsolute(evidence.sourceRoot)
    || remap[0] !== `@openzeppelin/contracts/=${evidence.sourceRoot}/packages/contracts/lib/openzeppelin-contracts/contracts/`) fail('CONFIGURATION_CHANGED', 'unrecognized compiler configuration');
  for (const [name, version] of [['mythril', pins.analyzerVersion], ['mythrilCompiler', pins.compiler.version]]) {
    const tool = evidence.tools?.[name];
    const escaped = version.replaceAll('.', '\\.');
    const pattern = name === 'mythril' ? new RegExp(`^Mythril version v?${escaped}\\s*$`, 'm') : new RegExp(`^Version: ${escaped}\\+commit\\.[0-9a-f]+`, 'm');
    if (!object(tool) || tool.exitCode !== 0 || !pattern.test(tool.stdout ?? '') || !SHA256.test(tool.executableSha256 ?? '')) fail('TOOL_VERSION', `actual ${name} version is unverified or changed`);
  }
  const native = evidence.tools?.mythrilCompiler;
  if (!object(native) || native.selection !== 'solcx.install.get_executable(0.8.28)' || !nonempty(native.executablePath) || !isAbsolute(native.executablePath)
    || canonical(native.argv) !== canonical([native.executablePath, '--version']) || !SHA256.test(native.resolverSha256 ?? '') || !SHA256.test(native.mythrilSelectorSha256 ?? '')) fail('TOOL_VERSION', 'actual Mythril compiler selection is unverified');
  if (!Array.isArray(evidence.analyses)) throw new InputError('capture analyses must be an array');
  if (canonical(evidence.analyses.map((a) => a?.target)) !== canonical(TARGETS)) fail('ANALYSIS_COVERAGE', 'missing, duplicate, reordered or unknown production target');
  const analyses = [];
  let expectedReport = '';
  let expectedRunnerExitCode = 0;
  for (const entry of evidence.analyses) {
    if (!object(entry) || !TARGETS.includes(entry.target)) throw new InputError('capture has an unknown target');
    const target = entry.target;
    if (canonical(entry.compiler) !== canonical(native)) fail('TOOL_VERSION', `${target}: selected native compiler identity changed or is missing`);
    if (entry.sourceFile !== `packages/contracts/src/${target}.sol`) fail('ANALYSIS_IDENTITY', `${target}: wrong source file`);
    const expectedArgv = ['analyze', `src/${target}.sol`, '--solv', pins.compiler.version, '--solc-json', 'config.json', '--execution-timeout', String(pins.analysis.executionTimeoutSeconds), '-t', String(pins.analysis.transactionDepth), '-o', 'json'];
    if (canonical(entry.argv) !== canonical(expectedArgv)) fail('CONFIGURATION_CHANGED', `${target}: actual analyzer arguments differ`);
    const streams = {};
    for (const [stream, suffix] of [['stdout', '.stdout.json'], ['stderr', '.stderr.log'], ['completeness', '.completeness.json']]) {
      const item = entry[stream];
      if (!object(item) || item.path !== `${target}${suffix}` || !SHA256.test(item.sha256 ?? '')) throw new InputError(`${target}: malformed ${stream} identity`);
      const bytes = localFile(evidenceRoot, item.path);
      if (sha256(bytes) !== item.sha256) fail('REPORT_CHANGED', `${target}: retained ${stream} hash differs`);
      streams[stream] = bytes.toString('utf8');
    }
    expectedReport += streams.stderr + streams.stdout;
    let telemetry;
    try { telemetry = parseJson(streams.completeness, `${target} completeness`); } catch (error) { fail('PARTIAL_ANALYSIS', error.message); }
    const complete = completeTelemetry(telemetry);
    if (!complete) fail('PARTIAL_ANALYSIS', `${target}: missing, malformed or incomplete symbolic execution telemetry`);
    // Routine Python deprecation warnings remain visible. Every explicit error/traceback/timeout is rejected,
    // independently of apparently successful JSON. Unknown stdout is rejected by strict JSON parsing.
    if (!recognizedStderr(streams.stderr)) fail('TOOL_ERROR', `${target}: unrecognized stderr, error or timeout output`);
    let value;
    try { value = parseJson(streams.stdout, `${target} stdout`); } catch (error) { fail('MALFORMED_REPORT', error.message); }
    const valid = object(value) && canonical(Object.keys(value).sort()) === canonical(['error', 'issues', 'success']) && value.success === true && value.error === null && Object.hasOwn(value, 'error') && Array.isArray(value.issues);
    if (!valid) fail('TOOL_ERROR', `${target}: not a successful complete JSON document`);
    const issues = valid ? value.issues : [];
    if (!Number.isSafeInteger(entry.exitCode) || !((entry.exitCode === 0 && valid && issues.length === 0) || (entry.exitCode === 1 && valid && issues.length > 0))) fail('RUNNER_ERROR', `${target}: abnormal or contradictory process outcome ${entry.exitCode}`);
    if (entry.exitCode !== 0 || !valid || issues.length || !complete) {
      expectedReport += `::error::mythril: ${target} reported issues or failed (rc=${entry.exitCode})\n`;
      expectedRunnerExitCode = 1;
    }
    analyses.push({ target, issues });
  }
  if (evidence.runnerExitCode !== expectedRunnerExitCode) fail('RUNNER_ERROR', 'aggregate runner exit does not match captured process outcomes');
  if (reportText !== expectedReport) fail('REPORT_MISMATCH', 'aggregate report contains missing, unrecognized or altered output/annotations');
  return { analyses, sourceIdentity, configuration, actualToolchainIdentity: toolchainIdentity(evidence), sourceRoot: evidence.sourceRoot, sourcePaths: new Set(actualSources.map((s) => s.path)) };
}

export function checkDispositions({ dispositions, reportText, evidence, evidenceRoot, root, bytecodes = new Map() }) {
  const { file, byKey } = loadDispositions(dispositions);
  const pins = readPins(root);
  const failures = [];
  const notes = [];
  const fail = (code, message) => failures.push({ code, message });
  const { analyses, sourceIdentity, configuration, actualToolchainIdentity, sourceRoot, sourcePaths } = checkEvidence(evidence, evidenceRoot, root, reportText, pins, fail);
  if (file.records.length) {
    const approval = file.ownerApproval;
    if (!object(approval) || approval.status !== 'approved' || !nonempty(approval.identity) || !nonempty(approval.evidence)) fail('NO_OWNER_APPROVAL', 'explicit approved owner identity and authenticated evidence reference are required');
    else if (approval.recordsDigest !== sha256(canonical(file.records)) || approval.sourceIdentity !== sourceIdentity || approval.configurationDigest !== sha256(canonical(configuration))) fail('APPROVAL_SCOPE_CHANGED', 'owner approval is not bound to these exact records, sources and configuration');
  }
  const matched = new Set();
  const seen = new Set();
  for (const { target, issues } of analyses) {
    for (const [n, issue] of issues.entries()) {
      const at = `${target} issues[${n}]`;
      if (!object(issue) || !nonempty(issue.contract) || !nonempty(issue.function) || !/^\d{3}$/.test(issue['swc-id'] ?? '') || !Number.isSafeInteger(issue.address) || issue.address < 0
        || !['Low', 'Medium', 'High'].includes(issue.severity) || !nonempty(issue.sourceMap)) {
        fail('MALFORMED_ISSUE', `${at}: missing contract/function/SWC/PC/severity/sourceMap`); continue;
      }
      const key = issueKey(target, issue.contract, issue.function, issue['swc-id'], issue.address, issue.severity);
      if (seen.has(key)) { fail('DUPLICATE_ISSUE', `${at}: duplicate or ambiguous finding`); continue; }
      seen.add(key);
      const record = byKey.get(key);
      if (!record) { fail('UNDISPOSITIONED', `${at}: ${issue.contract} ${issue.function} SWC-${issue['swc-id']} PC ${issue.address} ${issue.severity}`); continue; }
      for (const field of ['sourceMap', 'filename', 'lineno']) {
        const actual = field === 'filename' && Object.hasOwn(issue, field) ? normalizeFilename(issue[field], sourceRoot, sourcePaths) : issue[field];
        if (Object.hasOwn(record, field) !== Object.hasOwn(issue, field) || record[field] !== actual) fail('LOCATION_CHANGED', `${record.id}: ${field} changed`);
      }
      matched.add(record.id);
    }
  }
  for (const record of byKey.values()) {
    if (!ALLOWED_DISPOSITIONS.has(record.disposition)) fail('NOT_DISPOSITIONABLE', `${record.id}: real findings cannot be dispositioned`);
    if (record.toolchainIdentity !== actualToolchainIdentity) fail('TOOLCHAIN_CHANGED', `${record.id}: analyzer or actual native compiler identity changed`);
    if (record.sourceIdentity !== sourceIdentity) fail('SOURCE_CHANGED', `${record.id}: source closure identity changed`);
    for (const source of record.sources) {
      let bytes;
      try { bytes = localFile(root, source.path); } catch { fail('SOURCE_MISSING', `${record.id}: ${source.path} not a regular contained file`); continue; }
      if (sha256(bytes) !== source.sha256) fail('SOURCE_CHANGED', `${record.id}: ${source.path} changed`);
    }
    const bytes = bytecodes.get(record.runtimeBytecode.contract);
    if (!bytes) fail('BYTECODE_UNVERIFIED', `${record.id}: no runtime bytes for ${record.runtimeBytecode.contract}`);
    else if (sha256(bytes) !== record.runtimeBytecode.sha256) fail('BYTECODE_CHANGED', `${record.id}: compiled runtime bytes changed`);
    if (canonical(record.compiler) !== canonical(pins.compiler)) fail('COMPILER_CHANGED', `${record.id}: compiler settings changed`);
    if (canonical(record.analysis) !== canonical(pins.analysis)) fail('CONFIGURATION_CHANGED', `${record.id}: analysis settings changed`);
    if (record.analyzerVersion !== pins.analyzerVersion) fail('ANALYZER_CHANGED', `${record.id}: analyzer version changed`);
    if (!matched.has(record.id)) notes.push({ code: 'NOT_REPORTED', message: `${record.id} was not reported in this run${record.timeoutDependent ? ' (recorded as timeout-dependent)' : ''}` });
  }
  return { ok: failures.length === 0, failures, notes, matched: [...matched].sort() };
}

function parseArgs(argv) {
  const options = { root: fileURLToPath(new URL('../..', import.meta.url)), bytecodes: new Map() };
  const seen = new Set();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!['--dispositions', '--report', '--evidence', '--root', '--bytecode'].includes(flag) || value === undefined || value.startsWith('--')) throw new InputError('usage: --dispositions file --report log --evidence manifest [--root repo] [--bytecode Contract=file]...');
    if (flag === '--bytecode') {
      const at = value.indexOf('=');
      if (at <= 0 || at === value.length - 1) throw new InputError('--bytecode takes Contract=file');
      const name = value.slice(0, at);
      if (options.bytecodes.has(name)) throw new InputError(`duplicate --bytecode ${name}`);
      options.bytecodes.set(name, decodeBytecode(readRegularFile(value.slice(at + 1)).toString('utf8'), name));
    } else {
      if (seen.has(flag)) throw new InputError(`duplicate ${flag}`);
      seen.add(flag); options[flag.slice(2)] = value;
    }
  }
  if (!options.dispositions || !options.report || !options.evidence) throw new InputError('--dispositions, --report and --evidence are required');
  return options;
}
export function main(argv) {
  try {
    const options = parseArgs(argv);
    const result = checkDispositions({ dispositions: parseJson(readRegularFile(options.dispositions).toString('utf8'), 'dispositions'),
      reportText: readRegularFile(options.report).toString('utf8'), evidence: parseJson(readRegularFile(options.evidence).toString('utf8'), 'evidence'),
      evidenceRoot: dirname(options.evidence), root: options.root, bytecodes: options.bytecodes });
    for (const id of result.matched) console.log(`ok ${id}`);
    for (const note of result.notes) console.log(`note ${note.code} ${note.message}`);
    for (const failure of result.failures) console.log(`FAIL ${failure.code} ${failure.message}`);
    console.log(result.ok ? 'mythril dispositions: complete captured target coverage and exact reviewed findings; symbolic completeness is not implied' : `mythril dispositions: ${result.failures.length} failure(s)`);
    return result.ok ? 0 : 1;
  } catch (error) { console.error(`mythril-disposition-check: ${error instanceof InputError ? error.message : String(error)}`); return 2; }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
