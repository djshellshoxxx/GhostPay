import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const mochaRequire = createRequire(require.resolve('mocha'));
const solcRequire = createRequire(require.resolve('solc'));
const mochaCli = require.resolve('mocha/bin/mocha.js');

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'ghostpay-dependency-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function runMocha(directory, args) {
  return spawnSync(process.execPath, [mochaCli, '--no-config', '--no-package', ...args], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

test('Mocha serializes worker options without mutating functions or losing RegExp/Date', () => {
  const { BufferedWorkerPool } = mochaRequire('./lib/nodejs/buffered-worker-pool');
  const callback = () => 'kept in parent';
  const options = { grep: /^kept/i, date: new Date('2026-01-01T00:00:00Z'), callback, nested: [1, undefined] };
  const serialized = BufferedWorkerPool.serializeOptions(options);
  const restored = vm.runInNewContext(`(${serialized})`, {}, { timeout: 1000 });
  assert.equal(restored.grep.test('KEPT worker'), true);
  assert.equal(restored.date.toISOString(), options.date.toISOString());
  assert.equal(restored.callback, undefined);
  assert.equal(restored.nested[0], 1);
  assert.equal(restored.nested[1], undefined);
  assert.equal(options.callback, callback);
});

test('Mocha discovers nested globs, honors minimatch ignores, and runs parallel workers', (t) => {
  const directory = fixture(t);
  mkdirSync(join(directory, 'nested'));
  writeFileSync(join(directory, 'first.spec.cjs'), "it('kept first', () => {}); it('filtered', () => { throw Error('grep failed'); });\n");
  writeFileSync(join(directory, 'nested', 'second.spec.cjs'), "it('kept second', () => {});\n");
  writeFileSync(join(directory, 'nested', 'ignored.spec.cjs'), "throw Error('ignore failed');\n");
  for (const parallel of [[], ['--parallel', '--jobs', '2']]) {
    const result = runMocha(directory, [
      '**/*.spec.cjs', '--ignore', '**/ignored.spec.cjs', '--grep', '^kept', '--reporter', 'json', ...parallel,
    ]);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.stats.passes, 2);
    assert.equal(report.stats.failures, 0);
  }
});

test('Mocha watch discovery retains Glob pattern objects and dotfile matching', () => {
  const glob = mochaRequire('glob');
  const { minimatch } = mochaRequire('minimatch');
  const patterns = new glob.Glob('test/*.{js,cjs}', {
    dot: true, magicalBraces: true, windowsPathsNoEscape: true,
  }).patterns;
  const strings = patterns.map((pattern) => pattern.globString());
  for (const pattern of patterns) {
    assert.equal(pattern.pattern(), 'test');
    assert.ok(pattern.rest());
    assert.notEqual(typeof pattern.rest().pattern(), 'string');
  }
  for (const name of ['test/first.js', 'test/second.cjs']) {
    assert.equal(strings.some((pattern) => minimatch(name, pattern)), true);
  }
  assert.equal(strings.some((pattern) => minimatch('test/other.ts', pattern)), false);
  assert.equal(minimatch('test/.hidden.cjs', 'test/*.cjs', { dot: true, windowsPathsNoEscape: true }), true);
});

test('Mocha failure reporter still renders unified and inline diffs', (t) => {
  const directory = fixture(t);
  writeFileSync(join(directory, 'failure.cjs'), "const assert = require('node:assert/strict'); it('diff output', () => assert.equal('actual line\\n', 'expected line\\n'));\n");
  for (const inline of [[], ['--inline-diffs']]) {
    const result = runMocha(directory, ['failure.cjs', '--no-color', ...inline]);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /actual/);
    assert.match(result.stdout, /expected/);
    assert.doesNotMatch(result.stdout + result.stderr, /TypeError|ERR_REQUIRE_ESM/);
  }
});

test('solc tmp API writes and removes SMT files and rejects traversal prefixes', (t) => {
  const directory = fixture(t);
  const tmp = solcRequire('tmp');
  const file = tmp.fileSync({ postfix: '.smt2', tmpdir: directory });
  writeFileSync(file.name, '(check-sat)');
  assert.equal(readFileSync(file.name, 'utf8'), '(check-sat)');
  file.removeCallback();
  assert.equal(existsSync(file.name), false);
  assert.throws(() => tmp.fileSync({ prefix: '../escape-', tmpdir: directory }));
  assert.throws(() => tmp.fileSync({ postfix: '/../escape', tmpdir: directory }));
  assert.throws(() => tmp.fileSync({ prefix: ['../escape-'], tmpdir: directory }));
  assert.throws(() => tmp.fileSync({ prefix: { includes: () => false, toString: () => '../escape-' }, tmpdir: directory }));

  const solver = join(directory, 'solver.cjs');
  writeFileSync(solver, "const fs = require('node:fs'); const input = fs.readFileSync(process.argv[2], 'utf8'); if (input !== '(check-sat)') process.exit(1); process.stdout.write('unsat');\n");
  const { smtSolver } = solcRequire('./smtsolver.js');
  assert.equal(smtSolver('(check-sat)', { command: process.execPath, params: JSON.stringify(solver) }), 'unsat');
});

test('Sentry request extraction preserves ordinary cookie parsing and middleware values', () => {
  const sentryRequire = createRequire(require.resolve('@sentry/node'));
  const { extractNodeRequestData } = sentryRequire('@sentry/utils');
  const request = {
    method: 'GET',
    url: '/local-tooling-check',
    headers: {
      host: 'localhost',
      cookie: 'mode=local; label=ordinary%20value; empty=; quoted="kept"; mode=later',
    },
  };
  assert.deepEqual(extractNodeRequestData(request, ['cookies']), {
    cookies: { mode: 'local', label: 'ordinary value', empty: '', quoted: 'kept' },
  });
  assert.deepEqual(extractNodeRequestData({ ...request, headers: {} }, ['cookies']), { cookies: {} });
  const middlewareCookies = { mode: 'middleware', label: 'already decoded' };
  const extracted = extractNodeRequestData({ ...request, cookies: middlewareCookies }, ['cookies']);
  assert.equal(extracted.cookies, middlewareCookies);
  assert.deepEqual(middlewareCookies, { mode: 'middleware', label: 'already decoded' });
});
