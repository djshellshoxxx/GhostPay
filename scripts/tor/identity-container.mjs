#!/usr/bin/env node
// Real Tor key loading and container lifecycle, with Docker --network none and
// DisableNetwork 1. Private keys stay in disposable named volumes, never artifacts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateOnionOrigin } from '../../tools/portable-hosting-kit/src/config/host-config.mjs';

const [image, output] = process.argv.slice(2);
if (!image || !output || process.argv.length !== 4) {
  console.error('Usage: node scripts/tor/identity-container.mjs EXISTING_IMAGE REPORT.json');
  process.exit(1);
}
// Reserve the report before creating volumes; never overwrite earlier evidence.
const reportFile = await open(resolve(output), 'wx', 0o600);
const prefix = `ghostpay-tor-id-${randomUUID()}`;
const root = await mkdtemp(join(tmpdir(), `${prefix}-`));
const volumes = [];
const containers = [];
const report = { schemaVersion: 1, status: 'FAILED', scope: 'offline Tor identity and container lifecycle', network: 'none', bootstrap: false, image, imageId: '', checks: [] };

function docker(args, label, expected = 0) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  // Do not attach raw Docker output: even unexpected failures must not copy a
  // private identity, runtime log or environment into a CI artifact.
  assert.equal(result.error, undefined, `${label}: Docker execution failed`);
  if (expected === 0) assert.equal(result.status, 0, `${label}: Docker exited ${result.status}`);
  else assert.equal(result.status, expected, `${label}: expected refusal ${expected}, got ${result.status}`);
  return result.stdout.trim();
}
function passed(name) { report.checks.push({ name, status: 'PASSED' }); }
function validHost(host) {
  try { validateOnionOrigin('initialized origin', `http://${host}`); }
  catch { throw new Error('Offline Tor returned an invalid public hostname'); }
}
function volume(suffix) {
  const name = `${prefix}-${suffix}`;
  docker(['volume', 'create', name], `create ${suffix} volume`);
  volumes.push(name);
  return name;
}
function options(identity, pin) {
  return ['--pull', 'never', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
    '--pids-limit', '64', '--memory', '256m', '--memory-swap', '256m',
    '--tmpfs', '/tmp:size=8m,mode=1777,noexec,nosuid,nodev',
    '--mount', `type=volume,source=${identity},target=/var/lib/tor`,
    '--mount', `type=bind,source=${pin},target=/etc/tor/expected-hostname,readonly`,
    '--mount', `type=bind,source=${join(root, 'torrc')},target=/etc/tor/torrc,readonly`];
}
function run(identity, pin, args, label, expected = 0) {
  return docker(['run', '--rm', ...options(identity, pin), image, ...args], label, expected);
}
function copyIdentity(from, to) {
  docker(['run', '--rm', ...options(to, join(root, 'empty')),
    '--mount', `type=volume,source=${from},target=/source,readonly`, '--entrypoint', '/bin/sh', image,
    '-c', 'set -eu; umask 077; test ! -e /var/lib/tor/ghostpay; cp -a /source/ghostpay /var/lib/tor/ghostpay'], 'restore private volume');
}
async function running(name, identity, pin) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    // Tor's default DisableDebuggerAttachment can hide /proc/1/exe from this
    // non-root observer. comm remains readable without weakening that protection.
    const result = spawnSync('docker', ['exec', name, '/bin/sh', '-c', 'test "$(cat /proc/1/comm)" = tor && cmp -s /etc/tor/expected-hostname /var/lib/tor/ghostpay/hostname'], { encoding: 'utf8', timeout: 5000 });
    if (!result.error && result.status === 0) {
      assert.equal(docker(['inspect', '--format', '{{.HostConfig.NetworkMode}}', name], 'verify network isolation'), 'none');
      assert.equal(run(identity, pin, ['--check-identity'], 'verify retained identity'), '');
      assert.equal(docker(['inspect', '--format', '{{.State.Running}}', name], 'verify retained process'), 'true');
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  assert.fail('Offline container did not reach the normal Tor entrypoint with its pinned identity');
}
async function start(name, identity, pin) {
  containers.push(name);
  docker(['run', '--detach', '--name', name, ...options(identity, pin), image], 'start offline container');
  await running(name, identity, pin);
}

try {
  report.imageId = docker(['image', 'inspect', '--format', '{{.Id}}', image], 'read prebuilt image identity');
  await writeFile(join(root, 'empty'), '', { mode: 0o644 });
  await writeFile(join(root, 'torrc'), 'DataDirectory /var/lib/tor\nSocksPort 0\nControlPort 0\nORPort 0\nDirPort 0\nDisableNetwork 1\nClientOnly 1\nRunAsDaemon 0\nSafeLogging 1\nHiddenServiceDir /var/lib/tor/ghostpay\nHiddenServiceVersion 3\nHiddenServicePort 80 127.0.0.1:9\n', { mode: 0o644 });
  const original = volume('original');
  const other = volume('other');
  const empty = volume('empty');
  const restored = volume('restored');
  const host = run(original, join(root, 'empty'), ['--initialize-identity'], 'explicit offline initialization');
  validHost(host);
  await writeFile(join(root, 'pin'), `${host}\n`, { mode: 0o644 });
  const pin = join(root, 'pin');
  passed('explicit offline initialization produces a canonical checksum-valid v3 identity');
  run(original, join(root, 'empty'), [], 'ordinary start refuses unconfigured origin', 1);
  run(original, join(root, 'empty'), ['--initialize-identity'], 'repeat initialization refuses existing identity', 1);
  run(empty, pin, [], 'ordinary start refuses empty replacement volume', 1);
  run(empty, pin, ['--initialize-identity'], 'configured origin cannot generate replacement identity', 1);
  passed('ordinary starts fail closed on unconfigured and missing identities');

  const first = `${prefix}-first`;
  await start(first, original, pin);
  docker(['stop', '--time', '5', first], 'stop offline container');
  docker(['start', first], 'restart offline container');
  await running(first, original, pin);
  docker(['stop', '--time', '5', first], 'stop restarted container');
  passed('normal entrypoint and container restart retain the configured identity without networking');
  const recreated = `${prefix}-recreated`;
  await start(recreated, original, pin);
  docker(['stop', '--time', '5', recreated], 'stop recreated container');
  passed('container recreation with the same pinned image retains the identity volume');

  const otherHost = run(other, join(root, 'empty'), ['--initialize-identity'], 'initialize unrelated identity');
  validHost(otherHost);
  assert.notEqual(otherHost, host);
  run(other, pin, [], 'ordinary start refuses wrong replacement volume', 1);
  passed('wrong identity volume refuses activation');
  copyIdentity(original, restored);
  run(restored, pin, ['--check-identity'], 'offline restored identity verification');
  passed('private volume backup and restore retain the original address');

  const mutate = (source, command) => docker(['run', '--rm', ...options(restored, pin),
    '--mount', `type=volume,source=${source},target=/source,readonly`, '--entrypoint', '/bin/sh', image,
    '-c', `set -eu; umask 077; ${command}`], 'prepare isolated restore fixture');
  mutate(other, 'cp /source/ghostpay/hs_ed25519_public_key /var/lib/tor/ghostpay/hs_ed25519_public_key');
  run(restored, pin, ['--check-identity'], 'mismatched split keypair refusal', 1);
  mutate(other, 'cmp -s /source/ghostpay/hs_ed25519_public_key /var/lib/tor/ghostpay/hs_ed25519_public_key');
  passed('mismatched restored keypair fails without repairing the stored public key');
  mutate(original, 'cp /source/ghostpay/hs_ed25519_public_key /var/lib/tor/ghostpay/hs_ed25519_public_key');
  run(restored, pin, ['--check-identity'], 'restored correct keypair');
  mutate(original, 'rm /var/lib/tor/ghostpay/hs_ed25519_secret_key');
  run(restored, pin, [], 'partial restored identity refusal', 1);
  mutate(original, 'test ! -e /var/lib/tor/ghostpay/hs_ed25519_secret_key');
  passed('partial restore fails without silently generating a replacement secret key');
  run(original, pin, ['--check-identity'], 'original retained identity after negative checks');
  passed('original identity remains valid after all negative restore checks');
  report.status = 'PASSED';
} catch (error) {
  report.error = error instanceof Error ? error.message : 'Offline identity acceptance failed';
  process.exitCode = 1;
} finally {
  let clean = true;
  for (const name of containers) clean = spawnSync('docker', ['rm', '--force', name], { stdio: 'ignore', timeout: 10000 }).status === 0 && clean;
  for (const name of volumes) clean = spawnSync('docker', ['volume', 'rm', name], { stdio: 'ignore', timeout: 10000 }).status === 0 && clean;
  await rm(root, { recursive: true, force: true });
  report.privateVolumesRemoved = clean;
  if (!clean) {
    report.status = 'FAILED';
    report.cleanupError = 'Disposable identity volume/container cleanup failed; inspect the isolated runner before reuse';
    process.exitCode = 1;
  }
  try { await reportFile.writeFile(`${JSON.stringify(report, null, 2)}\n`); }
  finally { await reportFile.close(); }
}
console.log(JSON.stringify({ status: report.status, checks: report.checks.length, bootstrap: false, report: resolve(output) }));
