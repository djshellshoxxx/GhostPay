import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read-only provenance check. It does not run application tests or use a network.
const record = JSON.parse(readFileSync(new URL('../../MERCHANT_PROFILE_CLOCK_CROSS_REVIEW_20261119.json', import.meta.url), 'utf8'));
const repo = resolve(process.argv[2] ?? '.');
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { maxBuffer: 16 * 1024 * 1024 });
const object = (revision, path) => git('show', `${revision}:${path}`);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const byName = new Map();
let originalFilesChecked = 0;

for (const item of record.packetFiles) {
  const bytes = object(record.authorPacketCommit, item.path);
  assert.equal(sha256(bytes), item.sha256, item.path);
}
for (const item of record.artifacts) {
  const bytes = object(record.authorPacketCommit, item.archivedPath);
  assert.equal(sha256(bytes), item.sha256, item.archivedPath);
  assert.equal(bytes.length, item.bytes, item.archivedPath);
  if (existsSync(item.originalPath)) {
    assert.deepEqual(bytes, readFileSync(item.originalPath), item.originalPath);
    originalFilesChecked += 1;
  }
  byName.set(item.name, bytes);
}
for (const item of record.sourceStates) {
  assert.equal(sha256(object(item.revision, item.path)), item.sha256, `${item.revision}:${item.path}`);
  assert.equal(git('rev-parse', `${item.revision}:${item.path}`).toString().trim(), item.blob, item.path);
}

const sourcePath = 'packages/invoice-schema/src/merchantProfile.ts';
const testPath = 'packages/invoice-schema/src/merchantProfile.test.ts';
const baseline = object(record.regressionBaseline, sourcePath);
assert.deepEqual(baseline, object(record.auditedMain, sourcePath));
assert.deepEqual(baseline, object(record.workerBase, sourcePath));
assert.deepEqual(object(record.regressionBaseline, testPath), object(record.runtimeSource, testPath));
assert.equal(git('diff', '--name-only', record.regressionBaseline, record.runtimeSource).toString().trim(), sourcePath);
const expectedSource = baseline.toString()
  .replace(' * @param nowSec Current unix time in seconds.', ' * @param nowSec Current finite Unix time in seconds (fractional values allowed). Invalid runtime clocks fail as expired.')
  .replace('if (p.exp <= nowSec)', 'if (!Number.isFinite(nowSec) || p.exp <= nowSec)');
assert.equal(object(record.runtimeSource, sourcePath).toString(), expectedSource);
for (const path of record.preservedPaths) {
  assert.deepEqual(object(record.workerBase, path), object(record.runtimeSource, path), path);
}
assert.deepEqual(byName.get('merchant-profile-clock-original-source.ts.txt'), baseline);
assert.deepEqual(byName.get('merchant-profile-clock-regression-source.test.ts.txt'), object(record.regressionBaseline, testPath));
assert.deepEqual(byName.get('merchant-profile-clock-final-source.ts.txt'), object(record.runtimeSource, sourcePath));
assert.ok(byName.get('merchant-profile-clock-built-runtime.js.txt').toString().includes('if (!Number.isFinite(nowSec) || p.exp <= nowSec)'));

for (const item of record.receipts) {
  const receipt = JSON.parse(byName.get(`${item.name}.json`).toString());
  assert.equal(receipt.name, item.name);
  assert.equal(receipt.source_revision, item.sourceRevision);
  assert.equal(receipt.exit_code, item.exitCode);
  assert.equal(receipt.seconds, item.seconds);
  assert.equal(receipt.log, `${item.name}.log`);
  assert.deepEqual(receipt.command, item.command);
}
const red = byName.get('merchant-profile-clock-red.log').toString();
const redCases = red.split('\n').filter((line) => /^\s*[✓×] /u.test(line));
assert.equal(redCases.length, 63);
assert.equal(redCases.filter((line) => /^\s*× /u.test(line)).length, 26);
assert.equal(redCases.filter((line) => /^\s*× .*rejects (symbol|throwing valueOf) /u.test(line)).length, 4);
assert.match(red, /Tests\s+26 failed \| 37 passed \(63\)/u);
for (const expected of record.expectedLogText) {
  assert.ok(byName.get(expected.name).toString().includes(expected.text), `${expected.name}: ${expected.text}`);
}

const integrated = record.integratedCheck;
for (const item of integrated.files) {
  const bytes = object(integrated.packetCommit, item.path);
  assert.equal(sha256(bytes), item.sha256, item.path);
  assert.equal(bytes.length, item.bytes, item.path);
}
const integratedManifest = JSON.parse(object(integrated.packetCommit, `${integrated.directory}/manifest.json`).toString());
const integratedReceipt = JSON.parse(object(integrated.packetCommit, `${integrated.directory}/receipt.json`).toString());
assert.equal(integratedManifest.source, integrated.source);
assert.equal(integratedReceipt.source, integrated.source);
assert.equal(integratedReceipt.exit_code, 0);
assert.equal(integratedReceipt.seconds, 2.113);
for (const item of integratedManifest.files) {
  const bytes = object(integrated.packetCommit, `${integrated.directory}/${item.file}`);
  assert.equal(bytes.length, item.bytes);
  assert.equal(sha256(bytes), item.sha256);
}
assert.match(object(integrated.packetCommit, `${integrated.directory}/tests.log`).toString(), /Tests\s+63 passed \(63\)/u);
for (const path of [sourcePath, testPath]) {
  assert.deepEqual(object(integrated.source, path), object(record.runtimeSource, path), path);
}

console.log(JSON.stringify({
  verdict: 'PASS',
  runtimeSource: record.runtimeSource,
  regressionBaseline: record.regressionBaseline,
  authorPacketCommit: record.authorPacketCommit,
  packetFilesVerified: record.packetFiles.length,
  archivedArtifactsVerified: record.artifacts.length,
  availableOriginalFilesVerified: originalFilesChecked,
  sourceStatesVerified: record.sourceStates.length,
  preservedPathsVerified: record.preservedPaths.length,
  receiptRecordsVerified: record.receipts.length,
  integratedPacketFilesVerified: integrated.files.length,
  integratedRegressionSourceAndTestsIdentical: true,
  integratedRegressionResult: { passed: 63, failed: 0, skipped: 0, exitCode: 0 },
  originalSignedProfileFailures: { acceptedExpiredProfile: 22, threwDuringClockCoercion: 4 },
  onlyGuardAndDocumentationChanged: true,
  sameRegressionFileBeforeAndAfter: true,
  reviewerRanApplicationTests: false,
}, null, 2));
