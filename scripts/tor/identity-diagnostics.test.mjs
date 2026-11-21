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
const IMAGE_ID = `sha256:${'a'.repeat(64)}`;
// Existing public test vector; no service, identity key or network request exists.
const HOST = '2gzyxa5ihm7nsggfxnu52rck2vv4rvmdlkiu3zzui5du4xyclen53wid.onion';
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
if (args[0] === 'image') process.stdout.write(${JSON.stringify(`${IMAGE_ID}\n`)});
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
    assert.equal(report.error, 'Offline identity acceptance failed; inspect the bounded failure code.');
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

for (const mode of ['unexpected-verification-output', 'identical-generated-hostnames', 'invalid-image-output']) {
  test(`acceptance failures redact returned values: ${mode}`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'ghostpay-identity-redaction-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const output = join(root, 'report.json');
    const calls = join(root, 'calls.jsonl');
    await writeFile(join(root, 'docker'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TEST_DOCKER_CALLS, JSON.stringify(args) + '\\n');
const mode = ${JSON.stringify(mode)};
const previous = fs.readFileSync(process.env.TEST_DOCKER_CALLS, 'utf8').trim().split('\\n').map(JSON.parse);
if (args[0] === 'image') process.stdout.write(mode === 'invalid-image-output' ? ${JSON.stringify(PRIVATE)} : ${JSON.stringify(IMAGE_ID)});
else if (args[0] === 'volume' && args[1] === 'create') process.stdout.write(args[2]);
else if (args[0] === 'inspect') process.stdout.write(args[2].includes('NetworkMode') ? 'none' : 'true');
else if (args[0] === 'run') {
  if (args.includes('--initialize-identity')) {
    const isOriginal = args.some(a => a.includes('-original,target=/var/lib/tor'));
    const isOther = args.some(a => a.includes('-other,target=/var/lib/tor'));
    const originalInitializations = previous.filter(a => a.includes('--initialize-identity') && a.some(v => v.includes('-original,target=/var/lib/tor'))).length;
    if ((isOriginal && originalInitializations === 1) || isOther) process.stdout.write(${JSON.stringify(HOST)} + '\\n');
    else process.exitCode = 1;
  } else if (args.includes('--check-identity')) {
    if (mode === 'unexpected-verification-output') process.stdout.write(${JSON.stringify(PRIVATE)});
  } else if (args.includes('--detach')) process.stdout.write('synthetic-container');
  else process.exitCode = 1;
} else if (!['exec', 'stop', 'start', 'rm', 'volume'].includes(args[0])) process.exitCode = 99;
`, { mode: 0o700 });
    const result = spawnSync(process.execPath, [runner, 'synthetic-image', output], {
      encoding: 'utf8', timeout: 30000,
      env: { ...process.env, PATH: `${root}${delimiter}${process.env.PATH}`, TEST_DOCKER_CALLS: calls },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, 'invalid runtime evidence must still fail');
    const serialized = await readFile(output, 'utf8');
    const report = JSON.parse(serialized);
    assert.equal(report.status, 'FAILED');
    assert.equal(report.privateVolumesRemoved, true);
    for (const forbidden of [PRIVATE, HOST]) {
      assert.equal((serialized + result.stdout + result.stderr).includes(forbidden), false,
        'private values must not escape through artifacts or command output');
    }
    assert.equal(report.failure.code, 'ACCEPTANCE_CHECK_FAILED');
    assert.equal(report.error, 'Offline identity acceptance failed; inspect the bounded failure code.');
    assert.equal(report.imageId, mode === 'invalid-image-output' ? '' : IMAGE_ID);
    const commands = (await readFile(calls, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const created = commands.filter((args) => args[0] === 'volume' && args[1] === 'create');
    const removed = commands.filter((args) => args[0] === 'volume' && args[1] === 'rm');
    assert.deepEqual(removed.map((args) => args[2]), created.map((args) => args[2]));
    for (const args of commands.filter((args) => args[0] === 'run')) {
      assert.equal(args[args.indexOf('--network') + 1], 'none');
      assert.ok(args.includes('--read-only'));
      assert.equal(args[args.indexOf('--cap-drop') + 1], 'ALL');
    }
  });
}
