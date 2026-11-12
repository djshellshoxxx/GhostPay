#!/usr/bin/env node
// Disposable Bitcoin Core regtest + Esplora shim. Requires a separately verified Core installation.
// No downloads, public-chain connections, funded wallets, or persistent credentials.
import { spawn, execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const bitcoind = process.env.BITCOIND_BIN;
if (!bitcoind) throw new Error('Set BITCOIND_BIN to a separately verified Bitcoin Core binary.');
if (process.platform === 'win32') throw new Error('Run this local harness on Linux, macOS, or WSL.');
const cli = process.env.BITCOIN_CLI_BIN ?? join(dirname(bitcoind), 'bitcoin-cli');
const children = [];
const abort = new AbortController();
const interrupt = () => abort.abort();
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
const directory = await mkdtemp(join(tmpdir(), 'ghostpay-live-regtest-'));

async function unusedPort() {
  const server = createServer();
  await new Promise((resolvePort, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePort);
  });
  const address = server.address();
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  if (address === null || typeof address === 'string') throw new Error('No loopback port available.');
  return address.port;
}

function start(command, args, env, stdio = 'inherit') {
  // Each service owns a process group, including npx/Vitest descendants of the feature runner.
  const child = spawn(command, args, { cwd: root, env, stdio, detached: true });
  // Attach the rejection handler immediately: a missing binary must not leave a child or secret behind.
  const done = new Promise((resolveExit) => {
    child.once('error', () => resolveExit({ code: null, failed: true }));
    child.once('exit', (code) => resolveExit({ code, failed: code !== 0 }));
  });
  const entry = { child, done, ended: false };
  void done.then(() => { entry.ended = true; });
  children.push(entry);
  return entry;
}

function signalGroup(entry, signal) {
  if (entry.child.pid === undefined) return false;
  try { process.kill(-entry.child.pid, signal); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

async function stop(entry) {
  // The group can survive its original child. Keep cleaning it even when `done` already resolved.
  signalGroup(entry, 'SIGTERM');
  for (let tries = 0; tries < 50 && signalGroup(entry, 0); tries += 1) await delay(100);
  if (signalGroup(entry, 0)) signalGroup(entry, 'SIGKILL');
  await entry.done;
}

async function ready(entry, check) {
  for (let tries = 0; tries < 100; tries += 1) {
    abort.signal.throwIfAborted();
    if (entry.ended) throw new Error('Local regtest service exited before becoming ready.');
    if (await check()) return;
    await delay(200, undefined, { signal: abort.signal });
  }
  throw new Error('Local regtest service did not become ready.');
}

try {
  const rpcPort = await unusedPort();
  let shimPort = await unusedPort();
  while (shimPort === rpcPort) shimPort = await unusedPort();
  const username = 'ghostpay-local';
  const password = randomBytes(24).toString('hex');
  await writeFile(join(directory, 'bitcoin.conf'), [
    'regtest=1', 'server=1', 'listen=0', 'discover=0', 'dnsseed=0',
    'txindex=1', 'fallbackfee=0.0002', `rpcuser=${username}`, `rpcpassword=${password}`,
    '[regtest]', 'connect=0', 'rpcbind=127.0.0.1', 'rpcallowip=127.0.0.1', `rpcport=${rpcPort}`, '',
  ].join('\n'), { mode: 0o600, flag: 'wx' });
  const env = {
    ...process.env,
    BITCOIND_RPC_URL: `http://127.0.0.1:${rpcPort}`,
    BITCOIND_RPC_USER: username, BITCOIND_RPC_PASSWORD: password,
    ESPLORA_URL: `http://127.0.0.1:${shimPort}`, SHIM_HOST: '127.0.0.1', SHIM_PORT: String(shimPort),
    TMPDIR: directory,
  };
  const core = start(bitcoind, [`-datadir=${directory}`, '-printtoconsole=0'], env, ['ignore', 'ignore', 'inherit']);
  await ready(core, async () => {
    try {
      const { stdout } = await exec(cli, [`-datadir=${directory}`, 'getblockchaininfo'], { timeout: 2000 });
      return JSON.parse(stdout).chain === 'regtest';
    } catch { return false; }
  });
  const shim = start(process.execPath, ['scripts/regtest/esplora-shim.mjs'], env);
  await ready(shim, async () => {
    try {
      const response = await fetch(`${env.ESPLORA_URL}/blocks/tip/height`, { signal: AbortSignal.timeout(2000) });
      return response.ok && /^\d+$/.test(await response.text());
    } catch { return false; }
  });
  const test = start(process.execPath, ['scripts/regtest/e2e.mjs'], env);
  let onAbort;
  const interrupted = new Promise((resolveAbort) => {
    onAbort = () => resolveAbort({ code: null, failed: true });
    abort.signal.addEventListener('abort', onAbort, { once: true });
    if (abort.signal.aborted) onAbort();
  });
  // Enter finally immediately on interruption, even if a child ignores SIGTERM.
  const result = await Promise.race([test.done, interrupted]);
  abort.signal.removeEventListener('abort', onAbort);
  abort.signal.throwIfAborted();
  if (result.failed) throw new Error('Live regtest feature journey failed.');
} finally {
  for (const entry of children.reverse()) await stop(entry);
  await rm(directory, { recursive: true, force: true });
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
