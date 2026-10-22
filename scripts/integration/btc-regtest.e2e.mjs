#!/usr/bin/env node
// Bitcoin silent payments (BIP-352) end to end on bitcoind REGTEST. Throwaway keys, worthless coins, no mocks.
// Flow: mine a wallet balance -> fund a throwaway P2WPKH sender -> sender pays a fresh `tsp1` silent payment address
// (createSilentPaymentOutputs) -> mine -> SCAN the chain from bitcoind (getblock verbosity 3) with scanBlocks and the
// scan key -> sweep the found output with buildSpendTransaction (regtest address) -> testmempoolaccept ->
// broadcast -> mine -> assert confirmation and the destination amount.
//
// Usage: BITCOIND_RPC_USER=.. BITCOIND_RPC_PASSWORD=.. node scripts/integration/btc-regtest.e2e.mjs
// Env:   BITCOIND_RPC_URL (default http://127.0.0.1:18443). Needs `npm run build:libs` (btc-silent-payments).
// Exit:  0 all PASS, 1 any FAIL, 2 bad environment. Credentials are read from the environment only (never printed).
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bech32 } from '@scure/base';
import * as btc from '@scure/btc-signer';
import {
  buildSpendTransaction, computeTransactionTweak, createSilentPaymentOutputs, encodeSilentPaymentAddress,
  generateSilentPaymentKeys, scanBlocks, silentPaymentKeysFromSeed,
} from '@ghostpay/btc-silent-payments';

const RPC = process.env.BITCOIND_RPC_URL ?? 'http://127.0.0.1:18443';
const user = process.env.BITCOIND_RPC_USER;
const pass = process.env.BITCOIND_RPC_PASSWORD;
if (!user || !pass) {
  console.error('FAIL environment: set BITCOIND_RPC_USER and BITCOIND_RPC_PASSWORD (run via scripts/integration/run-all.sh)');
  process.exit(2);
}
const AUTH = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
const REGTEST = { ...btc.TEST_NETWORK, bech32: 'bcrt' };
const WALLET = `it-${randomBytes(4).toString('hex')}`; // fresh wallet per run
const hex = (b) => Buffer.from(b).toString('hex');
const unhex = (h) => Uint8Array.from(Buffer.from(h, 'hex'));
const sats = (btcValue) => Math.round(btcValue * 1e8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(method, params = [], wallet) {
  const res = await fetch(wallet === undefined ? RPC : `${RPC}/wallet/${wallet}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: AUTH },
    body: JSON.stringify({ jsonrpc: '1.0', id: method, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => ({ error: { message: `HTTP ${String(res.status)}` } }));
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

let steps = 0;
async function step(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    steps += 1;
    console.log(`PASS ${name}${detail ? ` | ${detail}` : ''} (${String(Date.now() - t0)} ms)`);
  } catch (e) {
    console.log(`FAIL ${name}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`RESULT btc: FAIL after ${String(steps)} passed step(s)`);
    process.exit(1);
  }
}

/** TweakSource over bitcoind: per-block tweak data and taproot outputs, computed locally from getblock (verbosity 3). */
function bitcoindTweakSource() {
  const blocks = new Map();
  const load = (height) => {
    let p = blocks.get(height);
    if (p === undefined) {
      p = (async () => {
        const blockHash = await rpc('getblockhash', [height]);
        return { blockHash, block: await rpc('getblock', [blockHash, 3]) };
      })();
      blocks.set(height, p);
    }
    return p;
  };
  return {
    getTipHeight: () => rpc('getblockcount'),
    async getTweaks(height) {
      const { blockHash, block } = await load(height);
      const tweaks = [];
      for (const tx of block.tx) {
        if (tx.vin.some((i) => i.coinbase !== undefined)) continue;
        const inputs = tx.vin.map((i) => ({
          txid: i.txid,
          vout: i.vout,
          scriptSig: unhex(i.scriptSig?.hex ?? ''),
          witness: (i.txinwitness ?? []).map(unhex),
          prevoutScriptPubKey: unhex(i.prevout.scriptPubKey.hex),
        }));
        // Only transactions with a taproot output can pay a silent payment address.
        if (!tx.vout.some((o) => /^5120[0-9a-f]{64}$/.test(o.scriptPubKey.hex))) continue;
        const t = computeTransactionTweak(inputs);
        if (t !== null) tweaks.push(t.tweak);
      }
      return { height, blockHash, tweaks };
    },
    async getOutputs(height) {
      const { blockHash, block } = await load(height);
      const outputs = [];
      for (const tx of block.tx) {
        tx.vout.forEach((o, vout) => {
          if (/^5120[0-9a-f]{64}$/.test(o.scriptPubKey.hex)) {
            outputs.push({ xOnlyPublicKey: unhex(o.scriptPubKey.hex.slice(4)), txid: tx.txid, vout, amountSats: BigInt(sats(o.value)) });
          }
        });
      }
      return { height, blockHash, outputs };
    },
  };
}

const s = {};
const PAY = 50_000_000n; // 0.5 BTC
const FUND = 100_000_000; // 1 BTC to the sender
const SENDER_FEE = 1_000n;

await step('bitcoind reachable and on regtest', async () => {
  for (let i = 0; ; i++) {
    try {
      s.info = await rpc('getblockchaininfo');
      break;
    } catch (e) {
      if (i >= 60) throw e;
      await sleep(1000);
    }
  }
  assert.equal(s.info.chain, 'regtest', 'refusing to run on a non-regtest node');
  return `height ${String(s.info.blocks)}`;
});

await step('create wallet and mine 101 blocks (coinbase maturity)', async () => {
  await rpc('createwallet', [WALLET]);
  s.miner = await rpc('getnewaddress', ['', 'bech32'], WALLET);
  await rpc('generatetoaddress', [101, s.miner], WALLET);
  const bal = await rpc('getbalance', [], WALLET);
  assert.ok(bal >= 50, `spendable balance ${String(bal)} BTC`);
  return `balance ${String(bal)} BTC`;
});

await step('fund a throwaway P2WPKH sender', async () => {
  s.sender = generateSilentPaymentKeys(); // any valid secp256k1 key works as the sender key
  s.senderPriv = Uint8Array.from(s.sender.scanSecret);
  const pkh = ripemd160(sha256(s.sender.scanPublicKey));
  s.senderScript = Uint8Array.of(0x00, 0x14, ...pkh);
  const senderAddr = bech32.encode('bcrt', [0, ...bech32.toWords(pkh)]);
  s.fundTxid = await rpc('sendtoaddress', [senderAddr, FUND / 1e8], WALLET);
  await rpc('generatetoaddress', [1, s.miner], WALLET);
  const fund = await rpc('getrawtransaction', [s.fundTxid, true]);
  const o = fund.vout.find((x) => x.scriptPubKey.hex === hex(s.senderScript));
  assert.ok(o, 'funding output not found');
  s.fundVout = o.n;
  s.fundSats = BigInt(sats(o.value));
  assert.equal(s.fundSats, BigInt(FUND));
  assert.ok(fund.confirmations >= 1);
  return `${s.fundTxid.slice(0, 12)}...:${String(s.fundVout)}`;
});

await step('sender pays a fresh silent payment address (tsp1)', async () => {
  s.recv = silentPaymentKeysFromSeed(randomBytes(32), { network: 'testnet' });
  s.spAddr = encodeSilentPaymentAddress('testnet', s.recv.scanPublicKey, s.recv.spendPublicKey);
  assert.match(s.spAddr, /^tsp1/);
  const [out] = createSilentPaymentOutputs({
    inputs: [{ privateKey: s.sender.scanSecret, isTaproot: false }],
    outpoints: [{ txid: s.fundTxid, vout: s.fundVout }],
    recipients: [s.spAddr],
    network: 'testnet',
  });
  const change = await rpc('getrawchangeaddress', ['bech32'], WALLET);
  const tx = new btc.Transaction({ version: 2 });
  tx.addInput({ txid: s.fundTxid, index: s.fundVout, witnessUtxo: { script: s.senderScript, amount: s.fundSats } });
  tx.addOutput({ script: Uint8Array.of(0x51, 0x20, ...out.xOnlyPublicKey), amount: PAY });
  tx.addOutputAddress(change, s.fundSats - PAY - SENDER_FEE, REGTEST);
  tx.sign(s.senderPriv);
  tx.finalize();
  s.payTxid = await rpc('sendrawtransaction', [hex(tx.extract())]);
  s.payHeight = (await rpc('getblockcount')) + 1;
  await rpc('generatetoaddress', [1, s.miner], WALLET);
  const mined = await rpc('getrawtransaction', [s.payTxid, true]);
  assert.ok(mined.confirmations >= 1, 'payment not mined');
  return `${s.payTxid.slice(0, 12)}... in block ${String(s.payHeight)}`;
});

await step('receiver scans the chain with the scan key and finds the payment', async () => {
  const found = [];
  for await (const hit of scanBlocks({
    source: bitcoindTweakSource(),
    keys: { scanSecret: s.recv.scanSecret, spendPublicKey: s.recv.spendPublicKey },
    fromHeight: s.payHeight,
  })) found.push(hit);
  assert.equal(found.length, 1, `expected 1 output, found ${String(found.length)}`);
  assert.equal(found[0].txid, s.payTxid);
  assert.equal(found[0].amountSats, PAY);
  assert.equal(found[0].label, null);
  s.hit = found[0];
  return `${String(found[0].amountSats)} sats at ${found[0].txid.slice(0, 12)}...:${String(found[0].vout)}`;
});

await step('a different receiver finds nothing', async () => {
  const other = silentPaymentKeysFromSeed(randomBytes(32), { network: 'testnet' });
  let n = 0;
  for await (const _ of scanBlocks({
    source: bitcoindTweakSource(),
    keys: { scanSecret: other.scanSecret, spendPublicKey: other.spendPublicKey },
    fromHeight: s.payHeight,
  })) n += 1;
  assert.equal(n, 0);
});

await step('sweep the found output with buildSpendTransaction', async () => {
  s.dest = await rpc('getnewaddress', ['', 'bech32'], WALLET);
  assert.match(s.dest, /^bcrt1/);
  const r = buildSpendTransaction({
    outputs: [{ txid: s.hit.txid, vout: s.hit.vout, amountSats: s.hit.amountSats, xOnlyPublicKey: s.hit.xOnlyPublicKey, spendTweak: s.hit.spendTweak }],
    spendSecret: s.recv.spendSecret,
    destinations: [{ address: s.dest }],
    feeRate: 2,
    network: 'testnet',
    regtest: true,
  });
  s.spend = r;
  const rawHex = hex(r.rawTx);
  const [accept] = await rpc('testmempoolaccept', [[rawHex]]);
  assert.equal(accept.allowed, true, `testmempoolaccept: ${accept['reject-reason'] ?? 'rejected'}`);
  const txid = await rpc('sendrawtransaction', [rawHex]);
  assert.equal(txid, r.txid, 'txid computed by the library must equal the node txid');
  await rpc('generatetoaddress', [1, s.miner], WALLET);
  return `${txid.slice(0, 12)}... fee ${String(r.feeSats)} sats, ${String(r.vsize)} vB`;
});

await step('sweep is confirmed and the destination received the exact amount', async () => {
  const conf = await rpc('getrawtransaction', [s.spend.txid, true]);
  assert.ok(conf.confirmations >= 1, 'sweep not confirmed');
  const received = BigInt(sats(await rpc('getreceivedbyaddress', [s.dest, 1], WALLET)));
  assert.equal(received, PAY - s.spend.feeSats, 'destination amount = payment - fee');
  assert.equal(await rpc('gettxout', [s.hit.txid, s.hit.vout, true]), null, 'silent payment output is spent');
  return `${String(received)} sats received`;
});

console.log(`RESULT btc: PASS (${String(steps)} steps)`);
