#!/usr/bin/env node
/** Read-only, fail-closed summary of the five-contract Mythril runner's report.log.
 * Never substitutes for Mythril, its exit code, or a finding-specific security review.
 * Usage: node scripts/audit/mythril-evidence.mjs report.log [--json]
 * Exit: 0 = all targets clean; 1 = findings; 2 = invalid/incomplete evidence.
 */
import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const EXPECTED_TARGETS = Object.freeze([
  'GhostPayRouter', 'GhostPaySweepRelayer', 'GhostPayPolicyRouter', 'PolicyAccount', 'PolicyAccountFactory',
]);
const MAX_LOG_BYTES = 8 * 1024 * 1024;
const SEVERITIES = ['High', 'Medium', 'Low', 'Informational'];
const sourceText = (x, field) => {
  if (typeof x !== 'string' || x.length > 250 || /[\x00-\x1f\x7f]/u.test(x)) throw new Error('invalid ' + field);
  return x;
};

/** Target names are associated by position, and only with the unchanged five-contract runner's output order. */
export function summarizeMythrilLog(content) {
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_LOG_BYTES) {
    throw new Error('log is missing or exceeds 8 MiB');
  }
  const reports = [];
  for (const line of content.split(/\r?\n/u)) {
    if (!line.trimStart().startsWith('{')) continue; // warnings and runner diagnostics
    let obj;
    try { obj = JSON.parse(line); } catch { throw new Error('malformed Mythril JSON report'); }
    if (obj === null || Array.isArray(obj) || typeof obj !== 'object' ||
        obj.success !== true || obj.error !== null || !Array.isArray(obj.issues)) {
      throw new Error('incomplete or failed Mythril report');
    }
    reports.push(obj);
  }
  if (reports.length !== EXPECTED_TARGETS.length) {
    throw new Error('expected ' + EXPECTED_TARGETS.length + ' reports; found ' + reports.length);
  }
  const severityCounts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  const targets = reports.map((report, index) => ({
    target: EXPECTED_TARGETS[index],
    findings: report.issues.map((issue, ordinal) => {
      if (issue === null || Array.isArray(issue) || typeof issue !== 'object') throw new Error('malformed issue');
      const severity = sourceText(issue.severity, 'severity');
      if (!SEVERITIES.includes(severity)) throw new Error('unknown severity on report ' + (index + 1));
      severityCounts[severity]++;
      const file = issue.filename === undefined || issue.filename === null ? null : sourceText(issue.filename, 'filename');
      const line = issue.lineno === undefined || issue.lineno === null ? null : issue.lineno;
      if (line !== null && (!Number.isSafeInteger(line) || line < 1)) throw new Error('invalid source line');
      const swc = issue['swc-id'] === undefined || issue['swc-id'] === null ? null : String(issue['swc-id']);
      if (swc !== null && !/^[0-9]{1,5}$/u.test(swc)) throw new Error('invalid SWC identifier');
      // Never copy descriptions, transaction traces, credentials, inputs or other arbitrary fields.
      return { ordinal: ordinal + 1, severity, swcId: swc, sourceFile: file, line };
    }),
  }));
  const totalFindings = targets.reduce((sum, t) => sum + t.findings.length, 0);
  return {
    format: 'ghostpay-mythril-evidence/1', analyzer: 'mythril',
    complete: true, expectedTargets: [...EXPECTED_TARGETS], targets,
    totalFindings, severityCounts,
    verdict: totalFindings > 0 ? 'findings-open' : 'clean',
    limitations: 'A runner-ordered analyzer summary, not exploitability, clearance, or evidence of a safe contract. Never changes CI gates.',
  };
}

function main(args) {
  if (args.length < 1 || args.length > 2 || (args[1] !== undefined && args[1] !== '--json')) {
    throw new Error('Usage: mythril-evidence.mjs <report.log> [--json]');
  }
  if (statSync(args[0]).size > MAX_LOG_BYTES) throw new Error('log exceeds 8 MiB');
  const raw = readFileSync(args[0]);
  const report = summarizeMythrilLog(raw.toString('utf8'));
  if (args[1] === '--json') process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else {
    process.stdout.write('Mythril: ' + report.targets.length + '/' + EXPECTED_TARGETS.length +
      ' reports, ' + report.totalFindings + ' unresolved findings (' +
      SEVERITIES.map((s) => s + ' ' + report.severityCounts[s]).join(', ') + ').\n');
    for (const target of report.targets) process.stdout.write(target.target + ': ' + target.findings.length + ' finding(s)\n');
  }
  process.exitCode = report.totalFindings === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write('Mythril evidence invalid: ' + (error instanceof Error ? error.message : 'unknown error') + '\n');
    process.exitCode = 2;
  }
}
