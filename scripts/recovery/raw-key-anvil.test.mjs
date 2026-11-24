// node --test scripts/recovery/raw-key-anvil.test.mjs
// Spec 18 spending proofs for a raw test vector and a fresh encrypted single-payment export.
// The second signer comes from the standalone recovery script's output. Both use Foundry cast
// on a dedicated loopback Anvil chain with synthetic accounts. Build @ghostpay/ux-vault first.
// Skips when anvil/cast are missing unless REQUIRE_ANVIL=1, where it fails instead.
// Binaries: ANVIL_BIN / CAST_BIN when set (used as given), otherwise PATH, otherwise ~/.foundry/bin.
import assert from 'node:assert/strict';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
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
    const proc = spawn(ANVIL, ['--host', '127.0.0.1', '--port', '0', '--chain-id', String(V.chainId)], { stdio: ['ignore', 'pipe', 'pipe'] });
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

async function confirmSpend(address, key) {
  const derived = await cast(['wallet', 'address', '--private-key', key]);
  assert.equal(derived, address, 'cast derives a different address from the payment key');

  const node = await startAnvil();
  try {
    const rpc = ['--rpc-url', node.url];
    assert.equal(Number(await cast(['chain-id', ...rpc])), V.chainId);
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
    assert.equal(spend.status, '0x1', 'transfer signed with the payment key was not successful');
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
}

// Construct a new encrypted export for a different payment from the plaintext control.
// Drop the seller and one-time secrets before starting the independent recovery process.
async function writeEncryptedPayment(path, announcement) {
  const { createStealthExportApi } = await import('@ghostpay/ux-vault/portable');
  const api = createStealthExportApi();
  const keys = {
    spendingSecret: Buffer.from(V.seller.spendingPrivateKey.slice(2), 'hex'),
    viewingSecret: Buffer.from(V.seller.viewingPrivateKey.slice(2), 'hex'),
  };
  let payment;
  try {
    payment = api.buildVerifiedPayment({
      chainId: V.chainId,
      announcement: { ...announcement, schemeId: BigInt(announcement.schemeId), blockNumber: BigInt(announcement.blockNumber) },
      keys,
      exportedAt: new Date('2026-11-18T12:34:56Z'),
    });
    const encrypted = await api.encryptPaymentKeys([payment], { scope: 'single', passphrase: V.passphrase });
    writeFileSync(path, encrypted, { mode: 0o600 });
  } finally {
    payment?.secret.fill(0);
    keys.spendingSecret.fill(0);
    keys.viewingSecret.fill(0);
  }
}

if (required && !available) {
  test('K04 spending proofs require Foundry cast and anvil', () => {
    assert.fail(`REQUIRE_ANVIL=1 but anvil=${String(ANVIL !== undefined)} cast=${String(CAST !== undefined)}`);
  });
} else {
  test('K04 raw key interop with Foundry cast on anvil', { skip, timeout: 180_000 }, async () => {
    const { address, key } = rawVector();
    await confirmSpend(address, key);
  });

  test('a fresh encrypted payment backup recovers a signer that spends on its recorded chain', { skip, timeout: 180_000 }, async () => {
    const { announcement } = V.announcements.find(({ id }) => id === 'a2');
    const directory = mkdtempSync(join(tmpdir(), 'gp-encrypted-spend-'));
    try {
      const path = join(directory, 'ghostpay-stealth-keypair.json');
      await writeEncryptedPayment(path, announcement);
      const decoded = spawnSync(process.execPath, [
        join(here, 'stealth-export-recover.mjs'), path, '--expected-chain', String(V.chainId), '--reveal-private-keys',
      ], { cwd: directory, env: {}, input: V.passphrase, timeout: 60_000 });
      try {
        assert.equal(decoded.status, 0, 'standalone recovery failed');
        let recovered;
        try {
          recovered = JSON.parse(decoded.stdout.toString());
        } catch {
          throw new Error('standalone recovery returned invalid JSON');
        }
        const { payments, chainId } = recovered;
        assert.equal(chainId, V.chainId);
        assert.equal(payments.length, 1);
        const [payment] = payments;
        assert.equal(payment.stealthAddress.toLowerCase(), announcement.stealthAddress.toLowerCase());
        assert.ok(/^0x[0-9a-f]{64}$/.test(payment.privateKey), 'recovery did not return a payment key');
        await confirmSpend(payment.stealthAddress, payment.privateKey);
      } finally {
        decoded.stdout?.fill(0);
        decoded.stderr?.fill(0);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
