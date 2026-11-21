// Synthetic Docker results exercise reporting only, not actual Tor or Docker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('./identity-container.mjs', import.meta.url));
const PRIVATE = 'synthetic-private-identity-never-export';
const CASES = [
  ['Tor requires a private 0700 data volume owned by its non-root runtime user.', 'TOR_DATA_VOLUME_PERMISSIONS'],
  ['Tor requires a private identity data directory owned by its runtime user.', 'TOR_IDENTITY_DIRECTORY_PERMISSIONS'],
  ['The configured onion hostname file is missing or invalid.', 'TOR_IDENTITY_PIN_INVALID'],
  ['A stable Tor version of at least 0.4.9.17 is required.', 'TOR_RUNTIME_VERSION'],
  ['Offline Tor could not validate the onion identity; no stored keys were replaced.', 'TOR_IDENTITY_PROCESS_EXITED'],
  ['Offline Tor stopped before identity validation completed.', 'TOR_IDENTITY_PROCESS_STOPPED'],
  ['Offline Tor rejected the onion identity; no stored keys were replaced.', 'TOR_IDENTITY_PROCESS_REJECTED'],
  ['Offline Tor did not create a complete private onion identity.', 'TOR_IDENTITY_GENERATED_FILES_INVALID'],
  ['Tor runtime reports are missing.\nOffline Tor stopped before identity validation completed.', 'MULTIPLE_AUTHORED_FAILURES'],
  ['prefix Tor requires a private 0700 data volume owned by its non-root runtime user.\nOffline Tor did not create a complete private onion identity. suffix', 'UNCLASSIFIED'],
];

for (const [message, code] of CASES) {
  test(`failed container reports only a bounded diagnostic: ${code}`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'ghostpay-identity-diagnostics-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const output = join(root, 'report.json');
    const calls = join(root, 'calls.jsonl');
    await writeFile(join(root, 'docker'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TEST_DOCKER_CALLS, JSON.stringify(args) + '\\n');
if (args[0] === 'image') process.stdout.write('sha256:synthetic-image\\n');
else if (args[0] === 'volume' && args[1] === 'create') process.stdout.write(args[2] + '\\n');
else if (args[0] === 'run') {
  process.stdout.write(${JSON.stringify(PRIVATE)});
  process.stderr.write(${JSON.stringify(`${PRIVATE}\n${message}\n${PRIVATE}\n`)});
  process.exitCode = 1;
} else if (!(args[0] === 'volume' && args[1] === 'rm')) process.exitCode = 99;
`, { mode: 0o700 });
    const result = spawnSync(process.execPath, [runner, 'synthetic-image', output], {
      encoding: 'utf8', timeout: 30000,
      env: { ...process.env, PATH: `${root}${delimiter}${process.env.PATH}`, TEST_DOCKER_CALLS: calls },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, 'a diagnostic must not change the refusal result');
    const serialized = await readFile(output, 'utf8');
    const report = JSON.parse(serialized);
    assert.deepEqual(report.failure, { stage: 'explicit offline initialization', code, exitCode: 1 });
    assert.equal(report.status, 'FAILED');
    assert.deepEqual(report.checks, []);
    assert.match(report.error, /explicit offline initialization: Docker exited 1/);
    assert.equal(report.privateVolumesRemoved, true);
    const summary = JSON.parse(result.stdout.trim());
    assert.deepEqual(summary.failure, report.failure);
    assert.doesNotMatch(serialized + result.stdout + result.stderr, new RegExp(PRIVATE));
    const commands = (await readFile(calls, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(commands.filter((args) => args[0] === 'volume' && args[1] === 'rm').length, 4);
    const invocation = commands.find((args) => args[0] === 'run');
    assert.equal(invocation[invocation.indexOf('--network') + 1], 'none');
    assert.ok(invocation.includes('--read-only'));
    assert.equal(invocation[invocation.indexOf('--cap-drop') + 1], 'ALL');
    assert.equal(invocation[invocation.indexOf('--security-opt') + 1], 'no-new-privileges:true');
  });
}
