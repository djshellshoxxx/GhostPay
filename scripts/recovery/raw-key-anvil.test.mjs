// node --test scripts/recovery/raw-key-anvil.test.mjs
// K04 interop proof (spec 18): the raw one-time private key from the reference vector's
// ghostpay-stealth-private-key.txt is used by an independently implemented EVM wallet tool (Foundry `cast`) on a
// local anvil chain bound to 127.0.0.1. Only the public TEST-ONLY vector key and anvil's unlocked dev account are used;
// no real network or funds. Skips when anvil/cast are missing unless REQUIRE_ANVIL=1, where it fails instead.
// Binaries: ANVIL_BIN / CAST_BIN when set (used as given), otherwise PATH, otherwise ~/.foundry/bin.
import assert from 'node:assert/strict';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const V = JSON.parse(readFileSync(resolve(here, '../../test-vectors/stealth-export.json'), 'utf8'));
const run = promisify(execFile);

const works = (bin) => spawnSync(bin, ['--version'], { stdio: 'ignore' }).status === 0;
function locate(envName, name) {
  const explicit = process.env[envName];
  if (explicit !== undefined && explicit !== '') return works(explicit) ? explicit : undefined;
  if (works(name)) return name;
  const fallback = join(homedir(), '.foundry', 'bin', name);
  return works(fallback) ? fallback : undefined;
}
const ANVIL = locate('ANVIL_BIN', 'anvil');
const CAST = locate('CAST_BIN', 'cast');
const available = ANVIL !== undefined && CAST !== undefined;
const required = process.env.REQUIRE_ANVIL === '1';
const skip = available ? false : `anvil/cast not found (ANVIL_BIN/CAST_BIN, PATH, ~/.foundry/bin); set REQUIRE_ANVIL=1 to fail instead`;

/** Runs cast; a failure reports only the subcommand and cast's stderr, never the arguments (one is a private key). */
async function cast(args) {
  try {
    const { stdout } = await run(CAST, args, { timeout: 60_000, maxBuffer: 1 << 20 });
    return stdout.trim();
  } catch (error) {
    throw new Error(`cast ${args[0]} ${args[1] ?? ''} failed: ${String(error.stderr ?? '').replace(/0x[0-9a-fA-F]{64}/g, '<redacted>').slice(0, 500)}`);
  }
}

function startAnvil() {
  return new Promise((ok, reject) => {
    // Port 0: the OS picks a free port, so parallel runs never collide.
    const proc = spawn(ANVIL, ['--host', '127.0.0.1', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('anvil did not start within 30 s'));
    }, 30_000);
    proc.stdout.on('data', (d) => {
      if (buf === undefined) return;
      buf += d.toString();
      const m = /Listening on (127\.0\.0\.1:[0-9]+)/.exec(buf);
      if (m !== null) {
        clearTimeout(timer);
        buf = undefined;
        ok({ proc, url: `http://${m[1]}` });
      }
    });
    proc.stderr.resume();
    proc.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`anvil exited early (${String(code)})`));
    });
  });
}

/** Address and key from the exact section 6 text; the key is checked by `cast`, not by GhostPay code. */
function rawVector() {
  const text = V.files.rawPrivateKey.text;
  const address = /^Address: (0x[0-9a-fA-F]{40})$/m.exec(text)?.[1];
  const key = /^Private key: (0x[0-9a-f]{64})$/m.exec(text)?.[1];
  assert.ok(address !== undefined && key !== undefined, 'raw-key vector lacks the Address or Private key line');
  assert.match(text, /^This is a single EVM private key, not a seed phrase or recovery phrase\.$/m);
  return { address, key };
}

if (required && !available) {
  test('K04 raw key interop with Foundry cast on anvil', () => {
    assert.fail(`REQUIRE_ANVIL=1 but anvil=${String(ANVIL !== undefined)} cast=${String(CAST !== undefined)}`);
  });
} else {
  test('K04 raw key interop with Foundry cast on anvil', { skip, timeout: 180_000 }, async () => {
    const { address, key } = rawVector();
    const derived = await cast(['wallet', 'address', '--private-key', key]);
    assert.equal(derived, address, 'cast derives a different address from the raw key');

    const node = await startAnvil();
    try {
      const rpc = ['--rpc-url', node.url];
      const [funder] = JSON.parse(await cast(['rpc', 'eth_accounts', ...rpc]));
      assert.match(funder, /^0x[0-9a-fA-F]{40}$/);
      const balance = async (who) => BigInt(await cast(['balance', who, ...rpc]));
      assert.equal(await balance(address), 0n);

      const fundWei = 10n ** 18n;
      const fund = JSON.parse(await cast(['send', '--json', '--unlocked', '--from', funder, address, '--value', fundWei.toString(), ...rpc]));
      assert.equal(fund.status, '0x1');
      assert.equal(await balance(address), fundWei);

      const funderBefore = await balance(funder);
      const backWei = 4n * 10n ** 17n;
      const spend = JSON.parse(await cast(['send', '--json', '--private-key', key, funder, '--value', backWei.toString(), ...rpc]));
      assert.equal(spend.status, '0x1', 'transfer signed with the raw key was not successful');
      assert.equal(spend.from.toLowerCase(), address.toLowerCase());
      assert.equal(spend.to.toLowerCase(), funder.toLowerCase());
      const fee = BigInt(spend.gasUsed) * BigInt(spend.effectiveGasPrice);
      assert.ok(fee > 0n);
      assert.equal(await balance(address), fundWei - backWei - fee);
      assert.equal(await balance(funder), funderBefore + backWei);
      assert.equal(BigInt(await cast(['nonce', address, ...rpc])), 1n);
    } finally {
      node.proc.kill('SIGKILL');
    }
  });
}
