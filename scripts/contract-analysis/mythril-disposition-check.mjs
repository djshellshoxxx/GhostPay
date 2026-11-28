#!/usr/bin/env node
// UNWIRED: no workflow, release gate or npm script calls this file. Wiring it into any gate is an owner decision
// (docs/audits/security-remediation-20261118.md, "Mythril gate policy"). It never changes the Mythril gate itself:
// scripts/run-mythril.sh stays red on every reported issue.
//
// Validates a finding-specific Mythril disposition file against one runner report (report.log of
// packages/contracts/scripts/run-mythril.sh) and the current repository. It exits 0 only when
//   - the report holds exactly `expectedAnalyses` analysis documents, each `success: true, error: null`;
//   - every reported issue matches exactly one disposition record by (contract, function, SWC id, PC, severity),
//     and the record's optional sourceMap / filename / lineno still equal the issue's;
//   - for EVERY record: each listed source file still has the recorded sha256; the runtime bytecode of the named
//     contract (supplied with --bytecode, compiled with the runner's settings) still has the recorded sha256; and the
//     record's compiler (version, optimizer runs, EVM version) and analyzer version equal what the runner script and
//     the analysis workflow pin today;
//   - every record is dispositioned "benign-intended" or "false-positive" (a real finding must be fixed, never
//     dispositioned) and the file names an owner approval.
// Records the report does not contain are listed as notes (symbolic search under a timeout is not deterministic) and
// do not fail the check. Exit codes: 0 pass, 1 a key no longer matches, 2 unusable input.
//
// Usage: node scripts/contract-analysis/mythril-disposition-check.mjs --dispositions <file.json> --report <report.log>
//          [--root <repository root>] [--bytecode <Contract>=<file with runtime bytecode hex>]...
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUNNER_PATH = 'packages/contracts/scripts/run-mythril.sh';
export const WORKFLOW_PATH = '.github/workflows/contract-analysis.yml';
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const ALLOWED_DISPOSITIONS = new Set(['benign-intended', 'false-positive']);
const SHA256 = /^[0-9a-f]{64}$/;

export class InputError extends Error {}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function readRegularFile(path) {
  const info = lstatSync(path);
  if (!info.isFile()) throw new InputError(`${path} is not a regular file`);
  if (info.size > MAX_INPUT_BYTES) throw new InputError(`${path} exceeds ${MAX_INPUT_BYTES} bytes`);
  return readFileSync(path);
}

/** Splits runner output into analysis documents; non-JSON lines (annotations, warnings) are ignored. */
export function parseReport(text) {
  const analyses = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line.startsWith('{')) continue;
    let value;
    try { value = JSON.parse(line); } catch { throw new InputError(`report line ${index + 1} is not valid JSON`); }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new InputError(`report line ${index + 1} is not a JSON object`);
    }
    analyses.push({ line: index + 1, value });
  }
  return analyses;
}

/** Reads the pins the analysis actually uses today from the runner script and the analysis workflow. */
export function readPins(root) {
  const runner = readRegularFile(join(root, RUNNER_PATH)).toString('utf8');
  const workflow = readRegularFile(join(root, WORKFLOW_PATH)).toString('utf8');
  const solv = [...runner.matchAll(/--solv\s+([0-9]+\.[0-9]+\.[0-9]+)\b/g)].map((m) => m[1]);
  const runs = [...runner.matchAll(/"optimizer":\s*\{\s*"enabled":\s*true,\s*"runs":\s*([0-9]+)\s*\}/g)].map((m) => Number(m[1]));
  const evm = [...runner.matchAll(/"evmVersion":\s*"([a-z]+)"/g)].map((m) => m[1]);
  const mythril = [...workflow.matchAll(/'mythril==([0-9]+\.[0-9]+\.[0-9]+)'/g)].map((m) => m[1]);
  for (const [name, values] of [['--solv', solv], ['optimizer runs', runs], ['evmVersion', evm], ['mythril==', mythril]]) {
    if (new Set(values).size !== 1) throw new InputError(`cannot read exactly one ${name} pin (found ${values.length})`);
  }
  return { compiler: { version: solv[0], optimizerRuns: runs[0], evmVersion: evm[0] }, analyzerVersion: mythril[0] };
}

function safeRelativePath(path) {
  if (typeof path !== 'string' || path === '' || isAbsolute(path) || path.includes('\\')) return false;
  const normal = normalize(path);
  return normal === path && !normal.split(sep).includes('..');
}

const issueKey = (contract, fn, swcId, pc, severity) => JSON.stringify([contract, fn, swcId, pc, severity]);

/** Validates the disposition file's shape and returns its records indexed by match key. */
export function loadDispositions(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InputError('dispositions must be a JSON object');
  if (value.schemaVersion !== 1) throw new InputError('unsupported dispositions schemaVersion');
  if (value.analyzer !== 'mythril') throw new InputError('dispositions analyzer must be "mythril"');
  if (!Number.isInteger(value.expectedAnalyses) || value.expectedAnalyses < 1) throw new InputError('expectedAnalyses must be a positive integer');
  if (!Array.isArray(value.records) || value.records.length === 0) throw new InputError('records must be a non-empty array');
  const byKey = new Map();
  const ids = new Set();
  for (const [index, r] of value.records.entries()) {
    const where = `records[${index}]`;
    if (r === null || typeof r !== 'object') throw new InputError(`${where} must be an object`);
    if (typeof r.id !== 'string' || r.id === '' || ids.has(r.id)) throw new InputError(`${where}.id must be a unique non-empty string`);
    ids.add(r.id);
    for (const field of ['contract', 'function', 'swcId', 'severity', 'disposition', 'evidence', 'analyzerVersion']) {
      if (typeof r[field] !== 'string' || r[field] === '') throw new InputError(`${where}.${field} must be a non-empty string`);
    }
    if (!Number.isInteger(r.pc) || r.pc < 0) throw new InputError(`${where}.pc must be a non-negative integer`);
    const c = r.compiler;
    if (c === null || typeof c !== 'object' || typeof c.version !== 'string' || !Number.isInteger(c.optimizerRuns) || typeof c.evmVersion !== 'string') {
      throw new InputError(`${where}.compiler must be {version, optimizerRuns, evmVersion}`);
    }
    if (!Array.isArray(r.sources) || r.sources.length === 0) throw new InputError(`${where}.sources must be a non-empty array`);
    for (const s of r.sources) {
      if (s === null || typeof s !== 'object' || !safeRelativePath(s.path) || typeof s.sha256 !== 'string' || !SHA256.test(s.sha256)) {
        throw new InputError(`${where}.sources entries must be {path (relative, normalized), sha256}`);
      }
    }
    const b = r.runtimeBytecode;
    if (b === null || typeof b !== 'object' || typeof b.contract !== 'string' || b.contract === '' || typeof b.sha256 !== 'string' || !SHA256.test(b.sha256)) {
      throw new InputError(`${where}.runtimeBytecode must be {contract, sha256}`);
    }
    if ('sourceMap' in r && typeof r.sourceMap !== 'string') throw new InputError(`${where}.sourceMap must be a string`);
    if ('filename' in r && typeof r.filename !== 'string') throw new InputError(`${where}.filename must be a string`);
    if ('lineno' in r && !Number.isInteger(r.lineno)) throw new InputError(`${where}.lineno must be an integer`);
    if ('timeoutDependent' in r && typeof r.timeoutDependent !== 'boolean') throw new InputError(`${where}.timeoutDependent must be a boolean`);
    const key = issueKey(r.contract, r.function, r.swcId, r.pc, r.severity);
    if (byKey.has(key)) throw new InputError(`${where} duplicates the match key of ${byKey.get(key).id}`);
    byKey.set(key, r);
  }
  return { file: value, byKey };
}

/** Decodes runtime bytecode hex (optional 0x, surrounding whitespace) to bytes. */
export function decodeBytecode(text, label) {
  const hex = text.trim().replace(/^0x/, '');
  if (hex === '' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) throw new InputError(`bytecode for ${label} is not hex`);
  return Buffer.from(hex, 'hex');
}

/**
 * Core check. `bytecodes` maps contract name -> runtime bytecode bytes. Returns failures (each fails the check) and
 * notes (informational). Never throws for a key mismatch; throws InputError for unusable input.
 */
export function checkDispositions({ dispositions, reportText, root, bytecodes = new Map() }) {
  const { file, byKey } = loadDispositions(dispositions);
  const pins = readPins(root);
  const failures = [];
  const notes = [];
  const fail = (code, message) => failures.push({ code, message });

  if (typeof file.ownerApproval !== 'string' || file.ownerApproval.trim() === '') {
    fail('NO_OWNER_APPROVAL', 'the disposition file names no owner approval');
  }

  const analyses = parseReport(reportText);
  if (analyses.length !== file.expectedAnalyses) {
    fail('ANALYSIS_COUNT', `report holds ${analyses.length} analysis documents, expected ${file.expectedAnalyses}`);
  }
  const matched = new Set();
  for (const { line, value } of analyses) {
    if (value.success !== true || !('error' in value) || value.error !== null || !Array.isArray(value.issues)) {
      fail('TOOL_ERROR', `report line ${line}: analysis is not {success: true, error: null, issues: [...]}`);
      continue;
    }
    for (const [n, issue] of value.issues.entries()) {
      const at = `report line ${line} issues[${n}]`;
      if (issue === null || typeof issue !== 'object' || typeof issue.contract !== 'string' || typeof issue.function !== 'string'
        || typeof issue['swc-id'] !== 'string' || !Number.isInteger(issue.address) || typeof issue.severity !== 'string') {
        fail('MALFORMED_ISSUE', `${at} lacks contract/function/swc-id/address/severity`);
        continue;
      }
      const key = issueKey(issue.contract, issue.function, issue['swc-id'], issue.address, issue.severity);
      const record = byKey.get(key);
      if (!record) {
        fail('UNDISPOSITIONED', `${at}: ${issue.contract} ${issue.function} SWC-${issue['swc-id']} PC ${issue.address} ${issue.severity}`);
        continue;
      }
      for (const field of ['sourceMap', 'filename', 'lineno']) {
        if (field in record && issue[field] !== record[field]) {
          fail('LOCATION_CHANGED', `${record.id}: ${field} is ${JSON.stringify(issue[field])}, recorded ${JSON.stringify(record[field])}`);
        }
      }
      matched.add(record.id);
    }
  }

  for (const record of byKey.values()) {
    if (!ALLOWED_DISPOSITIONS.has(record.disposition)) {
      fail('NOT_DISPOSITIONABLE', `${record.id}: disposition "${record.disposition}" (a real finding must be fixed, not dispositioned)`);
    }
    for (const source of record.sources) {
      let actual;
      try { actual = sha256(readRegularFile(join(root, source.path))); } catch { actual = null; }
      if (actual === null) fail('SOURCE_MISSING', `${record.id}: ${source.path} is not a readable regular file`);
      else if (actual !== source.sha256) fail('SOURCE_CHANGED', `${record.id}: ${source.path} sha256 ${actual}, recorded ${source.sha256}`);
    }
    const bytes = bytecodes.get(record.runtimeBytecode.contract);
    if (!bytes) fail('BYTECODE_UNVERIFIED', `${record.id}: no --bytecode supplied for ${record.runtimeBytecode.contract}`);
    else if (sha256(bytes) !== record.runtimeBytecode.sha256) {
      fail('BYTECODE_CHANGED', `${record.id}: ${record.runtimeBytecode.contract} runtime sha256 ${sha256(bytes)}, recorded ${record.runtimeBytecode.sha256}`);
    }
    const c = record.compiler;
    if (c.version !== pins.compiler.version || c.optimizerRuns !== pins.compiler.optimizerRuns || c.evmVersion !== pins.compiler.evmVersion) {
      fail('COMPILER_CHANGED', `${record.id}: recorded ${JSON.stringify(c)}, runner pins ${JSON.stringify(pins.compiler)}`);
    }
    if (record.analyzerVersion !== pins.analyzerVersion) {
      fail('ANALYZER_CHANGED', `${record.id}: recorded mythril ${record.analyzerVersion}, workflow pins ${pins.analyzerVersion}`);
    }
    if (!matched.has(record.id)) {
      notes.push({ code: 'NOT_REPORTED', message: `${record.id} was not reported in this run${record.timeoutDependent ? ' (recorded as timeout-dependent)' : ''}` });
    }
  }
  return { ok: failures.length === 0, failures, notes, matched: [...matched].sort() };
}

function parseArgs(argv) {
  const options = { root: fileURLToPath(new URL('../..', import.meta.url)), bytecodes: new Map() };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!['--dispositions', '--report', '--root', '--bytecode'].includes(flag) || value === undefined) {
      throw new InputError('usage: mythril-disposition-check.mjs --dispositions <file> --report <report.log> [--root <dir>] [--bytecode <Contract>=<hexfile>]...');
    }
    i++;
    if (flag === '--bytecode') {
      const at = value.indexOf('=');
      if (at <= 0 || at === value.length - 1) throw new InputError('--bytecode takes <Contract>=<file>');
      const name = value.slice(0, at);
      if (options.bytecodes.has(name)) throw new InputError(`--bytecode ${name} given twice`);
      options.bytecodes.set(name, decodeBytecode(readRegularFile(value.slice(at + 1)).toString('utf8'), name));
    } else {
      options[flag.slice(2)] = value;
    }
  }
  if (!options.dispositions || !options.report) throw new InputError('--dispositions and --report are required');
  return options;
}

export function main(argv) {
  try {
    const options = parseArgs(argv);
    let dispositions;
    try { dispositions = JSON.parse(readRegularFile(options.dispositions).toString('utf8')); } catch (error) {
      if (error instanceof InputError) throw error;
      throw new InputError('dispositions file is not valid JSON');
    }
    const result = checkDispositions({
      dispositions, reportText: readRegularFile(options.report).toString('utf8'), root: options.root, bytecodes: options.bytecodes,
    });
    for (const id of result.matched) console.log(`ok ${id}`);
    for (const note of result.notes) console.log(`note ${note.code} ${note.message}`);
    for (const failure of result.failures) console.log(`FAIL ${failure.code} ${failure.message}`);
    console.log(result.ok ? 'mythril dispositions: every reported issue matches a current disposition'
      : `mythril dispositions: ${result.failures.length} failure(s)`);
    return result.ok ? 0 : 1;
  } catch (error) {
    console.error(`mythril-disposition-check: ${error instanceof InputError ? error.message : String(error)}`);
    return 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
