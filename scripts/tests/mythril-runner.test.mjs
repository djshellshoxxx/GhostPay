import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const contracts = ['GhostPayRouter', 'GhostPaySweepRelayer', 'GhostPayPolicyRouter', 'PolicyAccount', 'PolicyAccountFactory'];
const clean = JSON.stringify({ success: true, error: null, issues: [] });

// Exercise the real shell gate with an offline executable fixture, not symbolic analysis.
function run(report = () => clean, exitCode = () => 0, timeout = '10') {
  const directory = mkdtempSync(join(tmpdir(), 'ghostpay-mythril-runner-'));
  try {
    const bin = join(directory, 'bin');
    mkdirSync(bin);
    for (const name of contracts) {
      writeFileSync(join(directory, `${name}.json`), report(name));
      writeFileSync(join(directory, `${name}.exit`), String(exitCode(name)));
    }
    writeFileSync(join(bin, 'myth'), `#!/usr/bin/env bash
set -eu
contract="$(basename "$2" .sol)"
printf '%s\\n' "$@" >"$MYTHRIL_FIXTURES/$contract.args"
cat "$6" >"$MYTHRIL_FIXTURES/$contract.config"
cat "$MYTHRIL_FIXTURES/$contract.json"
exit "$(cat "$MYTHRIL_FIXTURES/$contract.exit")"
`, { mode: 0o755 });
    const result = spawnSync('bash', ['packages/contracts/scripts/run-mythril.sh', ...(timeout === null ? [] : [timeout])], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, MYTHRIL_FIXTURES: directory },
    });
    return {
      ...result,
      invocations: contracts.map((name) => ({
        name,
        args: readFileSync(join(directory, `${name}.args`), 'utf8').trimEnd().split('\n'),
        config: JSON.parse(readFileSync(join(directory, `${name}.config`), 'utf8')),
      })),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('accepts complete clean reports and preserves pinned analyzer inputs for every contract', () => {
  const result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const { name, args, config } of result.invocations) {
    assert.deepEqual(args, ['analyze', `src/${name}.sol`, '--solv', '0.8.28', '--solc-json', args[5], '--execution-timeout', '10', '-t', '3', '-o', 'json']);
    assert.deepEqual(config, {
      remappings: [`@openzeppelin/contracts/=${join(root, 'packages/contracts/lib/openzeppelin-contracts/contracts')}/`],
      optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun',
    });
  }
});

test('preserves the default 900-second execution budget', () => {
  const result = run(undefined, undefined, null);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(result.invocations.every(({ args }) => args[7] === '900'));
});

for (const [label, output] of [
  ['missing issues', '{"success":true,"error":null}'],
  ['null issues', '{"success":true,"error":null,"issues":null}'],
  ['object issues', '{"success":true,"error":null,"issues":{}}'],
  ['string issues', '{"success":true,"error":null,"issues":""}'],
  ['nonempty issues', '{"success":true,"error":null,"issues":[{"title":"issue"}]}'],
  ['unsuccessful analysis', '{"success":false,"error":null,"issues":[]}'],
  ['nonboolean success', '{"success":"true","error":null,"issues":[]}'],
  ['missing success', '{"error":null,"issues":[]}'],
  ['missing error field', '{"success":true,"issues":[]}'],
  ['error despite success flag', '{"success":true,"error":"compiler failed","issues":[]}'],
  ['malformed JSON', '{"success":true,"error":null,"issues":[]'],
  ['empty output', ''],
  ['array report', '[]'],
  ['null report', 'null'],
  ['failure then clean report', `{"success":false,"error":null,"issues":[]}\n${clean}`],
  ['duplicate clean reports', `${clean}\n${clean}`],
]) {
  test(`rejects ${label} in any one contract and still analyzes all contracts`, () => {
    for (const contract of contracts) {
      const result = run((name) => name === contract ? output : clean);
      assert.equal(result.status, 1, `${contract}: ${result.stdout}${result.stderr}`);
      assert.match(result.stdout, new RegExp(`::error::mythril: ${contract} reported issues or failed`));
      assert.equal(result.invocations.length, contracts.length);
    }
  });
}

test('rejects abnormal exits even with clean-looking output from the affected contract', () => {
  for (const contract of contracts) {
    for (const code of [1, 2, 124, 137]) {
      const result = run(undefined, (name) => name === contract ? code : 0);
      assert.equal(result.status, 1, `${contract}, exit ${code}: ${result.stdout}${result.stderr}`);
      assert.match(result.stdout, new RegExp(`failed \\(rc=${code}\\)`));
    }
  }
});
