import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RUNNER = join(ROOT, 'scripts/regtest/run-local.mjs');

async function eventually(check, milliseconds, message) {
  const deadline = performance.now() + milliseconds;
  while (performance.now() < deadline) {
    if (await check()) return;
    await delay(40);
  }
  assert.fail(message);
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function isRunning(pid) {
  try { process.kill(pid, 0); }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  if (process.platform === 'linux') {
    try {
      // A killed orphan may await container PID 1's reaper; it executes no code.
      const status = await readFile(`/proc/${pid}/stat`, 'utf8');
      return status.slice(status.lastIndexOf(')') + 2).split(' ')[0] !== 'Z';
    } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  return true;
}

function killIfPresent(pid) {
  try { process.kill(pid, 'SIGKILL'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}

async function fixtures(directory) {
  const paths = Object.fromEntries(['preload', 'core', 'cli', 'shim', 'journey', 'descendant']
    .map((name) => [name, join(directory, `${name}.cjs`)]));
  // Remap only this test runner's existing service spawn sites. The production
  // runner gains no fake-service switch, injected behavior, or weaker guard.
  await writeFile(paths.preload, `
const cp = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
const { join } = require('node:path');
const realSpawn = cp.spawn;
cp.spawn = function(command, args, options) {
  const replacements = {
    'scripts/regtest/esplora-shim.mjs': 'shim.cjs',
    'scripts/regtest/e2e.mjs': 'journey.cjs',
  };
  const replacement = replacements[args?.[0]];
  return replacement
    ? realSpawn(process.execPath, [join(process.env.GP_LIFECYCLE_FIXTURE, replacement)], options)
    : realSpawn(command, args, options);
};
syncBuiltinESMExports();
`);
  await writeFile(paths.core, `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const datadir = process.argv.find(arg => arg.startsWith('-datadir=')).slice(9);
fs.writeFileSync(path.join(process.env.GP_LIFECYCLE_FIXTURE, 'core.json'), JSON.stringify({pid: process.pid, datadir}));
setInterval(() => {}, 1000);
`, { mode: 0o700 });
  await writeFile(paths.cli, `#!${process.execPath}
console.log(JSON.stringify({chain: 'regtest'}));
`, { mode: 0o700 });
  await writeFile(paths.shim, `
const fs = require('node:fs');
const path = require('node:path');
const server = require('node:http').createServer((_request, response) => response.end('1'));
server.listen(Number(process.env.SHIM_PORT), '127.0.0.1', () => {
  fs.writeFileSync(path.join(process.env.GP_LIFECYCLE_FIXTURE, 'shim.json'), JSON.stringify({pid: process.pid}));
});
`);
  await writeFile(paths.journey, `
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
if (process.env.GP_LIFECYCLE_IGNORE_PARENT === '1') process.on('SIGTERM', () => {});
const resultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostpay-regtest-result-'));
fs.writeFileSync(path.join(resultDirectory, 'result.json'), '{}');
const child = spawn(process.execPath, [path.join(process.env.GP_LIFECYCLE_FIXTURE, 'descendant.cjs')], {stdio: 'ignore'});
child.on('error', () => process.exit(2));
fs.writeFileSync(path.join(process.env.GP_LIFECYCLE_FIXTURE, 'journey.json'), JSON.stringify({pid: process.pid, resultDirectory}));
setInterval(() => {}, 1000);
`);
  await writeFile(paths.descendant, `
const fs = require('node:fs');
const path = require('node:path');
process.on('SIGTERM', () => {});
process.on('SIGINT', () => {});
fs.writeFileSync(path.join(process.env.GP_LIFECYCLE_FIXTURE, 'descendant.json'), JSON.stringify({pid: process.pid}));
setInterval(() => {}, 1000);
`);
  return paths;
}

for (const ignoreParent of [false, true]) {
  test(`wrapper-targeted SIGTERM cleans an ignored-TERM descendant when parent ${ignoreParent ? 'also ignores TERM' : 'exits first'}`,
    { skip: process.platform === 'win32' ? 'The local runner supports POSIX / WSL only' : false, timeout: 25_000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'ghostpay-runner-lifecycle-'));
      let runner;
      let output = '';
      const knownPids = new Set();
      let resultDirectory;
      let datadir;
      try {
        const paths = await fixtures(directory);
        runner = spawn(process.execPath, ['--require', paths.preload, RUNNER], {
          cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, BITCOIND_BIN: paths.core, BITCOIN_CLI_BIN: paths.cli,
            GP_LIFECYCLE_FIXTURE: directory, GP_LIFECYCLE_IGNORE_PARENT: ignoreParent ? '1' : '0' },
        });
        const append = (data) => { output = (output + data.toString()).slice(-16_384); };
        runner.stdout.on('data', append);
        runner.stderr.on('data', append);
        let exited = false;
        let exitCode;
        runner.once('error', (error) => { output += error.message; exited = true; });
        runner.once('exit', (code) => { exitCode = code; exited = true; });
        await eventually(async () => {
          for (const name of ['core', 'shim', 'journey', 'descendant']) {
            const record = await readJson(join(directory, `${name}.json`));
            if (record) {
              knownPids.add(record.pid);
              datadir ??= record.datadir;
              resultDirectory ??= record.resultDirectory;
            }
          }
          assert.equal(exited, false, `Runner exited before fixtures were ready: ${output}`);
          return knownPids.size === 4;
        }, 7_000, 'Fixture service tree did not become ready');
        const config = await readFile(join(datadir, 'bitcoin.conf'), 'utf8');
        assert.equal(/rpcpassword=[a-f0-9]{48}/.test(config), true, 'Fixture RPC password was not generated');

        // Signal the wrapper PID only. A terminal-wide group signal would mask
        // missing descendant cleanup in the runner itself.
        const interruptedAt = performance.now();
        runner.kill('SIGTERM');
        await eventually(() => exited, 12_000, 'Wrapper did not exit within its bounded cleanup window');
        assert.notEqual(exitCode, 0, 'An interrupted journey must not report success');
        assert.ok(performance.now() - interruptedAt < 12_000);
        await eventually(async () => {
          const running = await Promise.all([...knownPids].map(isRunning));
          return running.every((value) => !value);
        }, 1_000, 'Runner exited with a live service or ignored-TERM descendant');
        await assert.rejects(readFile(join(datadir, 'bitcoin.conf')), { code: 'ENOENT' });
        await assert.rejects(readFile(join(resultDirectory, 'result.json')), { code: 'ENOENT' });
      } finally {
        // Also clean a failing baseline run; never leave the regression's test
        // processes running merely because its assertion correctly failed.
        if (runner?.pid) killIfPresent(-runner.pid);
        for (const name of ['core', 'shim', 'journey', 'descendant']) {
          const record = await readJson(join(directory, `${name}.json`));
          if (record) {
            knownPids.add(record.pid);
            datadir ??= record.datadir;
            resultDirectory ??= record.resultDirectory;
          }
        }
        for (const pid of knownPids) killIfPresent(pid);
        if (datadir) await rm(datadir, { recursive: true, force: true });
        if (resultDirectory) await rm(resultDirectory, { recursive: true, force: true });
        await rm(directory, { recursive: true, force: true });
      }
    });
}
