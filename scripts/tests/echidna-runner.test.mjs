import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const harnesses = ['EchidnaRouter', 'EchidnaSweep', 'EchidnaPolicy'];
const properties = Object.fromEntries(harnesses.map((name) => [name,
  [...readFileSync(join(root, `packages/contracts/test/echidna/${name}.sol`), 'utf8')
    .matchAll(/function (echidna_\w+)\(/g)].map((match) => match[1]),
]));
const resultLine = (name) => `${name}: ${name.startsWith('echidna_canary_') ? 'failed!💥' : ' passed! 🎉'}`;

function run(mutate = (lines) => lines, code = 1) {
  const directory = mkdtempSync(join(tmpdir(), 'ghostpay-echidna-runner-'));
  try {
    const bin = join(directory, 'bin');
    mkdirSync(bin);
    for (const name of harnesses) {
      const lines = properties[name].map(resultLine);
      writeFileSync(join(directory, `${name}.txt`), `${mutate(lines, name).join('\n')}\n`);
    }
    writeFileSync(join(bin, 'echidna'), `#!/usr/bin/env bash
set -eu
harness="$(basename "$1" .sol)"
cat "$ECHIDNA_FIXTURES/$harness.txt"
exit "$ECHIDNA_FIXTURE_EXIT"
`, { mode: 0o755 });
    return spawnSync('bash', ['packages/contracts/scripts/run-echidna.sh', '10'], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ECHIDNA_FIXTURES: directory, ECHIDNA_FIXTURE_EXIT: String(code) },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('accepts complete reports: all real properties pass and every reachability canary fails', () => {
  const result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('accepts optional function parentheses and reporter whitespace', () => {
  const result = run((lines) => lines.map((line) => line.replace(': ', '():   ')));
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

for (const [label, mutate] of [
  ['missing real property', (lines) => lines.filter((_, index) => index !== 0)],
  ['missing canary', (lines) => lines.filter((line, index) => index !== lines.findIndex((entry) => entry.startsWith('echidna_canary_')))],
  ['partial all-green report', (lines) => [lines[0]]],
  ['duplicate result', (lines) => [...lines, lines[0]]],
  ['unknown result', (lines) => [...lines, 'echidna_not_in_harness: passed!']],
  ['real property failure', (lines) => lines.map((line, index) => index === 0 ? line.replace(' passed! 🎉', 'failed!💥') : line)],
  ['passing canary', (lines) => lines.map((line) => line.replace('failed!💥', 'passed! 🎉'))],
  ['canary without a transaction', (lines) => lines.map((line) => line.replace('failed!💥', 'failed with no transactions made ⁉️'))],
  ['unfinished result', (lines) => lines.map((line, index) => index === 0 ? line.replace(' passed! 🎉', 'running') : line)],
  ['compile error without results', () => ['crytic-compile: compilation failed']],
]) {
  test(`rejects ${label} in any one harness`, () => {
    for (const harness of harnesses) {
      const result = run((lines, name) => name === harness ? mutate(lines) : lines);
      assert.equal(result.status, 1, `${harness}: ${result.stdout}${result.stderr}`);
    }
  });
}

test('rejects unexpected process exits even with a complete-looking report', () => {
  for (const code of [0, 2, 124, 137]) {
    const result = run(undefined, code);
    assert.equal(result.status, 1, `exit ${code}: ${result.stdout}${result.stderr}`);
  }
});
