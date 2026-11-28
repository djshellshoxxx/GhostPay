import assert from 'node:assert/strict';
import { closeSync, fsyncSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Reporter from '../stress/reporter.mjs';
import { disableRetries } from '../stress/replay-args.mjs';
import { redactDiagnostics } from '../stress/redact.mjs';

test('keeps retries disabled even when a caller supplies a retry override', () => {
  assert.deepEqual(disableRetries(['--workers=2', '--retries', '3', '--project=chromium']), [
    '--workers=2', '--project=chromium', '--retries=0',
  ]);
  assert.deepEqual(disableRetries(['--retries=5']), ['--retries=0']);
});

test('redacts key-like values without mangling browser executable paths', () => {
  assert.equal(redactDiagnostics('password=hunter2'), 'password=[redacted]');
  assert.equal(redactDiagnostics('0x' + 'a'.repeat(40)), '[redacted]');
  const executable = '/home/agent/.cache/ms-playwright/firefox-1489/firefox/firefox';
  assert.equal(redactDiagnostics(executable), executable);
});

function testCase(id) {
  return {
    id,
    title: `case ${id}`,
    titlePath: () => ['suite', `case ${id}`],
    expectedStatus: 'passed',
    location: { file: `journey-${id}.spec.ts`, line: id },
    parent: { project: () => ({ name: 'chromium' }) },
  };
}

function runnerFor(resultsDir, fileSystem, chunks) {
  return new Reporter({
    resultsDir,
    fileSystem,
    stderr: { write: (chunk) => chunks.push(chunk) },
  });
}

test('writes each completed case durably to the configurable results directory', (t) => {
  const resultsDir = mkdtempSync(join(tmpdir(), 'ghostpay-stress-results-'));
  t.after(() => rmSync(resultsDir, { recursive: true, force: true }));
  const stderr = [];
  const reporter = runnerFor(resultsDir, undefined, stderr);
  reporter.onBegin({}, { allTests: () => [1, 2, 3] });
  reporter.onStepEnd(testCase(1), {}, { category: 'test.step', title: 'Confirm payment for 0x' + 'a'.repeat(40) });
  reporter.onStepEnd(testCase(1), {}, { category: 'pw:api', title: "locator.click('password=hunter2')" });
  reporter.onTestEnd(testCase(1), { status: 'passed', retry: 0, duration: 12 });
  reporter.onTestEnd(testCase(2), { status: 'failed', retry: 0, duration: 13, error: { message: 'browser disconnected while password=' + 'b'.repeat(64) } });
  reporter.onTestEnd(testCase(3), { status: 'skipped', retry: 0, duration: 0 });
  const end = reporter.onEnd({ status: 'failed' });

  const records = readFileSync(join(resultsDir, 'cases.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(records.length, 3);
  assert.equal(records[0].lastCompletedStep, 'pw:api locator.click');
  assert.equal(records[1].failureKind, 'browser-disconnect');
  assert.equal('error' in records[1], false);
  assert.deepEqual(end, { status: 'failed' });
  const summary = stderr.map((line) => JSON.parse(line.replace(/^STRESS /, ''))).find((line) => line.type === 'stress-summary');
  assert.deepEqual({ completed: summary.completed, passed: summary.passed, failed: summary.failed, skipped: summary.skipped, unrun: summary.unrun }, {
    completed: 3, passed: 1, failed: 1, skipped: 1, unrun: 0,
  });
});

test('reports ENOSPC after several records, keeps earlier cases, and exits failed', (t) => {
  const resultsDir = mkdtempSync(join(tmpdir(), 'ghostpay-stress-full-'));
  t.after(() => rmSync(resultsDir, { recursive: true, force: true }));
  const stderr = [];
  const nativeFs = {
    openSync: (...args) => openSync(...args),
    mkdirSync: (...args) => mkdirSync(...args),
    writeSync: (...args) => {
      if (writes++ === 3) {
        const error = new Error('no space left on device');
        error.code = 'ENOSPC';
        throw error;
      }
      return writeSync(...args);
    },
    fsyncSync: (...args) => fsyncSync(...args),
    closeSync: (...args) => closeSync(...args),
  };
  let writes = 0;
  const reporter = runnerFor(resultsDir, nativeFs, stderr);
  reporter.onBegin({}, { allTests: () => [1, 2, 3, 4, 5, 6] });
  for (let id = 1; id <= 4; id += 1) reporter.onTestEnd(testCase(id), {
    status: id === 2 ? 'failed' : 'passed', retry: 0, duration: 5,
    ...(id === 2 ? { error: { message: 'page crashed while password=hunter2' } } : {}),
  });
  const end = reporter.onEnd({ status: 'passed' });

  const records = readFileSync(join(resultsDir, 'cases.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(records.length, 3);
  assert.equal(records[1].failureKind, 'page-crash');
  assert.equal(JSON.stringify(records).includes('hunter2'), false);
  assert.deepEqual(end, { status: 'failed' });
  const events = stderr.map((line) => JSON.parse(line.replace(/^STRESS /, '')));
  assert.ok(events.some((line) => line.type === 'stress-results-write-failed' && line.code === 'ENOSPC'));
  assert.equal(readFileSync(join(resultsDir, 'cases.jsonl'), 'utf8').includes('hunter2'), false);
  const summary = events.find((line) => line.type === 'stress-summary');
  assert.equal(JSON.stringify(events).includes('hunter2'), false);
  assert.deepEqual({ completed: summary.completed, passed: summary.passed, failed: summary.failed, skipped: summary.skipped, unrun: summary.unrun, storageError: summary.storageError }, {
    completed: 4, passed: 3, failed: 1, skipped: 0, unrun: 2, storageError: 'ENOSPC',
  });
});
