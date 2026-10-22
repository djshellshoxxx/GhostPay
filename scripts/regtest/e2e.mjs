#!/usr/bin/env node
// Regtest end to end for the GhostPay Bitcoin silent payments feature. REGTEST ONLY, no real keys or funds.
//   1. fund a throwaway P2WPKH sender from the node's wallet, 2. build and broadcast a BIP-352 payment to a
//   fresh tsp1 address, 3. run the real web feature code (scan -> review -> sign -> broadcast -> rescan) through
//   the Esplora shim, 4. mine and verify the sweep with bitcoind.
// Usage: docker compose -f scripts/regtest/docker-compose.yml up -d  (see README), then
//   BITCOIND_RPC_USER=.. BITCOIND_RPC_PASSWORD=.. node scripts/regtest/e2e.mjs
// Env: BITCOIND_RPC_URL (http://127.0.0.1:18443), ESPLORA_URL (http://127.0.0.1:3002). Needs `npm run build:libs`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bech32 } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { createSilentPaymentOutputs, encodeSilentPaymentAddress, silentPaymentKeysFromSeed } from '@ghostpay/btc-silent-payments';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RPC = process.env.BITCOIND_RPC_URL ?? 'http://127.0.0.1:18443';
const ESPLORA = process.env.ESPLORA_URL ?? 'http://127.0.0.1:3002';
const user = process.env.BITCOIND_RPC_USER;
const pass = process.env.BITCOIND_RPC_PASSWORD;
if (user === undefined || pass === undefined) {
  console.error('set BITCOIND_RPC_USER and BITCOIND_RPC_PASSWORD');
  process.exit(2);
}
const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
const REGTEST = { ...btc.TEST_NETWORK, bech32: 'bcrt' };
const hex = (b) => Buffer.from(b).toString('hex');

async function rpc(method, params = [], wallet) {
  const res = await fetch(wallet === undefined ? RPC : `${RPC}/wallet/${wallet}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auth },
    body: JSON.stringify({ jsonrpc: '1.0', id: method, method, params }),
  });
  const body = await res.json().catch(() => ({ error: { message: `HTTP ${String(res.status)}` } }));
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

const info = await rpc('getblockchaininfo');
assert.equal(info.chain, 'regtest', 'refusing to run on a non-regtest node');

const W = 'ghostpay-e2e';
try {
  await rpc('createwallet', [W]);
} catch {
  await rpc('loadwallet', [W]).catch(() => undefined); // already exists or already loaded
}
const miner = await rpc('getnewaddress', ['', 'bech32'], W);
if ((await rpc('getbalance', [], W)) < 2) await rpc('generatetoaddress', [101, miner], W);

// Throwaway sender (P2WPKH) funded from the node wallet.
const sender = silentPaymentKeysFromSeed(randomBytes(32), { network: 'testnet' });
const senderPriv = Uint8Array.from(sender.scanSecret);
const senderPub = sender.scanPublicKey;
const pkh = ripemd160(sha256(senderPub));
const senderScript = Uint8Array.of(0x00, 0x14, ...pkh);
const senderAddr = bech32.encode('bcrt', [0, ...bech32.toWords(pkh)]);
const fundTxid = await rpc('sendtoaddress', [senderAddr, 1], W);
await rpc('generatetoaddress', [1, miner], W);
const fund = await rpc('getrawtransaction', [fundTxid, true]);
const fundVout = fund.vout.find((o) => o.scriptPubKey.hex === hex(senderScript));
assert.ok(fundVout, 'funding output not found');
const fundSats = Math.round(fundVout.value * 1e8);

// Receiver: fresh seed, never leaves this process except as env for the child test.
const seed = randomBytes(32);
const recv = silentPaymentKeysFromSeed(seed, { network: 'testnet' });
const spAddr = encodeSilentPaymentAddress('testnet', recv.scanPublicKey, recv.spendPublicKey);
const [spOut] = createSilentPaymentOutputs({
  inputs: [{ privateKey: sender.scanSecret, isTaproot: false }],
  outpoints: [{ txid: fundTxid, vout: fundVout.n }],
  recipients: [spAddr],
  network: 'testnet',
});
const PAY = 50_000_000;
const FEE = 1_000;
const changeAddr = await rpc('getrawchangeaddress', ['bech32'], W);
const tx = new btc.Transaction({ version: 2 });
tx.addInput({ txid: fundTxid, index: fundVout.n, witnessUtxo: { script: senderScript, amount: BigInt(fundSats) } });
tx.addOutput({ script: Uint8Array.of(0x51, 0x20, ...spOut.xOnlyPublicKey), amount: BigInt(PAY) });
tx.addOutputAddress(changeAddr, BigInt(fundSats - PAY - FEE), REGTEST);
tx.sign(senderPriv);
tx.finalize();
const payTxid = await rpc('sendrawtransaction', [hex(tx.extract())]);
const fromHeight = (await rpc('getblockcount')) + 1;
await rpc('generatetoaddress', [1, miner], W);
console.log(`payment ${payTxid} to ${spAddr.slice(0, 16)}... mined at height ${String(fromHeight)}`);

// Drive the real feature code through the shim.
const dest = await rpc('getnewaddress', ['', 'bech32'], W);
const outFile = join(mkdtempSync(join(tmpdir(), 'ghostpay-regtest-')), 'result.json');
const run = spawnSync('npx', ['vitest', 'run', 'src/features/btc/regtest.e2e.test.ts'], {
  cwd: resolve(ROOT, 'apps/web'),
  stdio: 'inherit',
  env: {
    ...process.env,
    GHOSTPAY_REGTEST_URL: ESPLORA,
    GHOSTPAY_REGTEST_SEED: hex(seed),
    GHOSTPAY_REGTEST_FROM: String(fromHeight),
    GHOSTPAY_REGTEST_DEST: dest,
    GHOSTPAY_REGTEST_EXPECT_SATS: String(PAY),
    GHOSTPAY_REGTEST_OUT: outFile,
  },
});
assert.equal(run.status, 0, 'feature test failed');

const result = JSON.parse(readFileSync(outFile, 'utf8'));
await rpc('generatetoaddress', [1, miner], W);
const confirmed = await rpc('getrawtransaction', [result.txid, true]);
assert.ok(confirmed.confirmations >= 1, 'sweep not confirmed');
const received = await rpc('getreceivedbyaddress', [dest, 1], W);
assert.equal(Math.round(received * 1e8), Number(result.sendSats), 'destination amount mismatch');
console.log(`OK: swept ${result.sendSats} sats (fee ${result.feeSats}) in ${result.txid}`);
