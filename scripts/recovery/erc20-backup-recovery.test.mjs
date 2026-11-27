// node --test scripts/recovery/erc20-backup-recovery.test.mjs
// ERC-20 spending proof for the standalone recovery path (spec 18). Real compiled GhostPayRouter, announcer and a test
// ERC-20 run on a dedicated loopback anvil (chain 11155111, like the reference vectors). A router ERC-20 payment goes to
// the one-time address of the reference vector seller; the encrypted single-payment backup is built from the REAL
// announcement of that payment; then ONLY the separate standalone decoder (scripts/recovery/stealth-export-recover.mjs,
// no GhostPay imports) turns the file into a key, and Foundry cast, not GhostPay or viem, moves the tokens.
// Synthetic keys and a disposable chain only: not deployed USDC, not a live network, not an audit.
// Requires the contract artifacts (`forge build` in packages/contracts), `@ghostpay/ux-vault` built, anvil and cast.
// Skips when anvil, cast or the artifacts are missing unless REQUIRE_ANVIL=1, where it fails instead.
import assert from 'node:assert/strict';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const V = JSON.parse(readFileSync(resolve(here, '../../test-vectors/stealth-export.json'), 'utf8'));
const OUT = resolve(here, '../../packages/contracts/out');
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
const FORGE = locate('FORGE_BIN', 'forge');
const required = process.env.REQUIRE_ANVIL === '1';
const artifactPath = (name) => join(OUT, `${name}.sol`, `${name}.json`);
const haveArtifacts = () => ['GhostPayRouter', 'ERC5564Announcer', 'MockERC20'].every((name) => existsSync(artifactPath(name)));
let artifacts = haveArtifacts();
// CI job shards differ in what they compiled before this file runs; under REQUIRE_ANVIL=1 compile the contracts once
// rather than depend on shard layout. On a developer machine nothing is compiled implicitly: the test skips instead.
if (!artifacts && required && ANVIL !== undefined && CAST !== undefined && FORGE !== undefined) {
  spawnSync(FORGE, ['build'], { cwd: resolve(here, '../../packages/contracts'), stdio: 'ignore', timeout: 900_000 });
  artifacts = haveArtifacts();
}
const available = ANVIL !== undefined && CAST !== undefined && artifacts;
const skip = available ? false : 'anvil, cast or packages/contracts/out missing (ANVIL_BIN/CAST_BIN, PATH, ~/.foundry/bin, forge build); set REQUIRE_ANVIL=1 to fail instead';

const DEPLOYER_KEY = `0x${'d1'.repeat(32)}`;
const PAYER_KEY = `0x${'a1'.repeat(32)}`;
const FEE_RECIPIENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const DESTINATION = '0x00000000000000000000000000000000000de511';
const GROSS = 100_000_000n;
const NET = GROSS - (GROSS * 25n) / 10_000n;

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
    const proc = spawn(ANVIL, ['--host', '127.0.0.1', '--port', '0', '--chain-id', String(V.chainId)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('anvil did not start within 30 s')); }, 30_000);
    proc.stdout.on('data', (d) => {
      if (buf === undefined) return;
      buf += d.toString();
      const m = /Listening on (127\.0\.0\.1:[0-9]+)/.exec(buf);
      if (m !== null) { clearTimeout(timer); buf = undefined; ok({ proc, url: `http://${m[1]}` }); }
    });
    proc.stderr.resume();
    proc.once('error', (error) => { clearTimeout(timer); reject(error); });
    proc.once('exit', (code) => { clearTimeout(timer); reject(new Error(`anvil exited early (${String(code)})`)); });
  });
}

const artifact = (name) => {
  const parsed = JSON.parse(readFileSync(artifactPath(name), 'utf8'));
  return { abi: parsed.abi, bytecode: parsed.bytecode.object };
};

if (required && !available) {
  test('ERC-20 recovery proofs require Foundry anvil and cast and the compiled contracts', () => {
    assert.fail(`REQUIRE_ANVIL=1 but anvil=${String(ANVIL !== undefined)} cast=${String(CAST !== undefined)} artifacts=${String(artifacts)}`);
  });
} else {
  test('an ERC-20 payment through the real router is recovered from an encrypted backup by the standalone decoder and spent with cast', { skip, timeout: 240_000 }, async () => {
    const { createPublicClient, createWalletClient, defineChain, getAddress, http, parseAbi, concatHex, toHex, pad } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');
    const { createStealthExportApi } = await import('@ghostpay/ux-vault/portable');
    const node = await startAnvil();
    const directory = mkdtempSync(join(tmpdir(), 'gp-erc20-recovery-'));
    const keys = { spendingSecret: Buffer.from(V.seller.spendingPrivateKey.slice(2), 'hex'), viewingSecret: Buffer.from(V.seller.viewingPrivateKey.slice(2), 'hex') };
    let payment;
    try {
      const rpc = ['--rpc-url', node.url];
      const chain = defineChain({ id: V.chainId, name: 'ERC-20 recovery anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [node.url] } } });
      const pub = createPublicClient({ transport: http(node.url), pollingInterval: 25 });
      const walletOf = (key) => createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(node.url) });
      const setBalance = (address, wei) => cast(['rpc', 'anvil_setBalance', address, `0x${wei.toString(16)}`, ...rpc]);
      for (const key of [DEPLOYER_KEY, PAYER_KEY]) await setBalance(privateKeyToAccount(key).address, 10n ** 21n);
      const deploy = async (name, args = []) => {
        const art = artifact(name);
        const hash = await walletOf(DEPLOYER_KEY).deployContract({ abi: art.abi, bytecode: art.bytecode, args, chain, account: privateKeyToAccount(DEPLOYER_KEY) });
        return getAddress((await pub.waitForTransactionReceipt({ hash })).contractAddress);
      };
      const announcer = await deploy('ERC5564Announcer');
      const router = await deploy('GhostPayRouter', [announcer, FEE_RECIPIENT]);
      const token = await deploy('MockERC20', ['LOCAL MOCK TOKEN', 'MOCK', 6]);
      const erc20 = parseAbi(['function mint(address,uint256)', 'function approve(address,uint256) returns (bool)']);
      const payer = privateKeyToAccount(PAYER_KEY).address;
      for (const [functionName, args] of [['mint', [payer, GROSS]], ['approve', [router, GROSS]]]) {
        const hash = await walletOf(PAYER_KEY).writeContract({ address: token, abi: erc20, functionName, args, chain, account: privateKeyToAccount(PAYER_KEY) });
        assert.equal((await pub.waitForTransactionReceipt({ hash })).status, 'success');
      }

      // The router pays the vector seller's one-time address a2: the metadata is the router's ERC-20 form with a2's view tag.
      const a2 = V.announcements.find(({ id }) => id === 'a2').announcement;
      const metadata = concatHex([`0x${a2.metadata.slice(2, 4)}`, '0xa9059cbb', token, pad(toHex(NET), { size: 32 })]);
      const routerAbi = artifact('GhostPayRouter').abi;
      const hash = await walletOf(PAYER_KEY).writeContract({
        address: router, abi: routerAbi, functionName: 'payERC20', chain, account: privateKeyToAccount(PAYER_KEY),
        args: [token, a2.stealthAddress, GROSS, NET, BigInt(Math.floor(Date.now() / 1000) + 900), a2.ephemeralPublicKey, metadata],
      });
      const receipt = await pub.waitForTransactionReceipt({ hash });
      assert.equal(receipt.status, 'success');
      const log = receipt.logs.find((entry) => entry.address.toLowerCase() === announcer.toLowerCase());
      assert.ok(log !== undefined, 'the router receipt omitted its announcement');
      const balanceOf = async (who) => BigInt(await cast(['call', token, 'balanceOf(address)(uint256)', who, ...rpc]).then((text) => text.split(' ')[0]));
      assert.equal(await balanceOf(a2.stealthAddress), NET, 'the router did not deliver the exact net to the one-time address');

      // The encrypted single-payment backup is built from the real on-chain announcement locator.
      const api = createStealthExportApi();
      payment = api.buildVerifiedPayment({
        chainId: V.chainId,
        announcement: { schemeId: 1n, stealthAddress: a2.stealthAddress, ephemeralPublicKey: a2.ephemeralPublicKey, metadata, blockHash: receipt.blockHash, blockNumber: receipt.blockNumber, logIndex: log.logIndex, transactionHash: hash },
        keys,
        exportedAt: new Date('2026-11-27T12:00:00Z'),
      });
      const file = join(directory, 'ghostpay-stealth-keypair.json');
      const text = await api.encryptPaymentKeys([payment], { scope: 'single', passphrase: V.passphrase });
      assert.ok(!text.toLowerCase().includes(token.slice(2).toLowerCase()), 'the backup must not reveal the token');
      writeFileSync(file, text, { mode: 0o600 });
      // Drop every secret of the seller before the independent process starts.
      payment.secret.fill(0);
      keys.spendingSecret.fill(0);
      keys.viewingSecret.fill(0);

      const decoded = spawnSync(process.execPath, [join(here, 'stealth-export-recover.mjs'), file, '--expected-chain', String(V.chainId), '--reveal-private-keys'], { cwd: directory, env: {}, input: V.passphrase, timeout: 60_000 });
      try {
        assert.equal(decoded.status, 0, `standalone recovery failed: ${decoded.stderr.toString()}`);
        const recovered = JSON.parse(decoded.stdout.toString());
        assert.equal(recovered.payments.length, 1);
        const [recoveredPayment] = recovered.payments;
        assert.equal(recoveredPayment.stealthAddress.toLowerCase(), a2.stealthAddress.toLowerCase());
        assert.match(recoveredPayment.privateKey, /^0x[0-9a-f]{64}$/);
        assert.equal(recoveredPayment.announcement.blockHash.toLowerCase(), receipt.blockHash.toLowerCase());
        const key = recoveredPayment.privateKey;
        assert.equal((await cast(['wallet', 'address', '--private-key', key])).toLowerCase(), a2.stealthAddress.toLowerCase());

        // No native coin at the one-time address yet: cast cannot pay for the transfer and nothing moves.
        await assert.rejects(cast(['send', token, 'transfer(address,uint256)', DESTINATION, NET.toString(), '--private-key', key, ...rpc]));
        assert.equal(await balanceOf(a2.stealthAddress), NET);
        assert.equal(await balanceOf(DESTINATION), 0n);

        // The owner tops up gas from another wallet; the recovered key then moves exactly the net, once.
        await setBalance(a2.stealthAddress, 10n ** 17n);
        const sent = JSON.parse(await cast(['send', '--json', token, 'transfer(address,uint256)', DESTINATION, NET.toString(), '--private-key', key, ...rpc]));
        assert.equal(sent.status, '0x1', 'token transfer signed with the recovered key was not successful');
        assert.equal(sent.from.toLowerCase(), a2.stealthAddress.toLowerCase());
        assert.equal(await balanceOf(DESTINATION), NET);
        assert.equal(await balanceOf(a2.stealthAddress), 0n);
        await assert.rejects(cast(['send', token, 'transfer(address,uint256)', DESTINATION, '1', '--private-key', key, ...rpc]));
        assert.equal(await balanceOf(DESTINATION), NET);
      } finally {
        decoded.stdout?.fill(0);
        decoded.stderr?.fill(0);
      }
    } finally {
      payment?.secret.fill(0);
      keys.spendingSecret.fill(0);
      keys.viewingSecret.fill(0);
      rmSync(directory, { recursive: true, force: true });
      node.proc.kill('SIGKILL');
    }
  });
}
