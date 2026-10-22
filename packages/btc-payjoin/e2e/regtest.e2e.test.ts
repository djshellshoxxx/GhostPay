import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addressFor,
  key,
  newDirectory,
  receiverCtx,
  receiverWallet,
  signerFor,
  type Key,
  type Kind,
} from '../src/fixtures.testutil.js';
import { SenderSession, ReceiverSession, V1HttpTransport, MemoryTransport, nodeListen, parsePsbt, type Utxo } from '../src/index.js';

/**
 * Regtest end-to-end. Needs a Bitcoin-Core-compatible daemon:
 *   BITCOIND_BIN=/path/to/bitcoind (or elementsd, run in -chain=regtest mode)
 * Skipped when unset or missing, like the relayer's anvil test.
 */
const BIN = process.env.BITCOIND_BIN ?? '';
const run = BIN !== '' && existsSync(BIN);
const REQUIRE = process.env.REQUIRE_BITCOIND === '1';
const PORT = 18_900 + (process.pid % 500);

let proc: ChildProcess | undefined;
let dir = '';

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${String(PORT)}/`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from('u:p').toString('base64')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '1.0', id: 1, method, params }),
  });
  const j = (await res.json()) as { result: T; error: { message: string } | null };
  if (j.error !== null) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

async function utxosOf(address: string, tip: number): Promise<Utxo[]> {
  const r = await rpc<{ unspents: { txid: string; vout: number; scriptPubKey: string; amount: number; height: number }[] }>(
    'scantxoutset',
    ['start', [`addr(${address})`]],
  );
  return r.unspents
    .filter((u) => tip - u.height >= 100)
    .map((u) => ({ txid: u.txid, index: u.vout, amount: BigInt(Math.round(u.amount * 1e8)), script: hex.decode(u.scriptPubKey) }));
}

function signerRedeem(k: Key): Uint8Array {
  return btc.p2wpkh(k.pub, btc.TEST_NETWORK).script;
}

/** Verify foreign sender inputs against the independent node, never the supplied PSBT amounts. */
function nodeReceiverWallet(k: Key, kind: Kind, utxos: Utxo[]): ReturnType<typeof receiverWallet> {
  const wallet = receiverWallet(k, kind, utxos);
  wallet.getPrevOut = async (txid, index) => {
    const output = await rpc<{ value: number; scriptPubKey: { hex: string } } | null>('gettxout', [txid, index, true]);
    if (output === null) return undefined;
    return { amount: BigInt(Math.round(output.value * 1e8)), script: hex.decode(output.scriptPubKey.hex) };
  };
  return wallet;
}

describe.skipIf(!run && !REQUIRE)('regtest payjoin e2e', () => {
  const sk: Key = key('e2e-sender');
  const rk: Key = key('e2e-receiver');
  const sAddr = addressFor(sk, 'wpkh', 'regtest');
  const rAddr = addressFor(rk, 'wpkh', 'regtest');
  const sChange = addressFor(key('e2e-sender-change'), 'wpkh', 'regtest');

  beforeAll(async () => {
    if (!run) throw new Error('REQUIRE_BITCOIND=1 but BITCOIND_BIN is unset or missing');
    dir = mkdtempSync(join(tmpdir(), 'pj-e2e-'));
    proc = spawn(BIN, ['-chain=regtest', `-datadir=${dir}`, '-rpcuser=u', '-rpcpassword=p', `-rpcport=${String(PORT)}`, `-port=${String(PORT + 1)}`, '-fallbackfee=0.0002', '-listen=0', '-printtoconsole=0'], { stdio: 'ignore' });
    for (let i = 0; i < 60; i++) {
      try {
        await rpc('getblockcount');
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    await rpc('generatetoaddress', [3, rAddr]);
    for (const [k, kind] of [[sk, 'sh-wpkh'], [sk, 'tr'], [rk, 'tr']] as const) await rpc('generatetoaddress', [1, addressFor(k, kind, 'regtest')]);
    await rpc('generatetoaddress', [104, sAddr]);
  }, 120_000);

  afterAll(async () => {
    try {
      await rpc('stop');
    } catch {
      /* already down */
    }
    if (proc !== undefined && proc.exitCode === null) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          proc?.kill();
          resolve();
        }, 15_000);
        proc?.once('exit', () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    if (dir !== '') rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  });

  async function setup() {
    const tip = await rpc<number>('getblockcount');
    const sU = (await utxosOf(sAddr, tip))[0] as Utxo;
    const rU = (await utxosOf(rAddr, tip))[0] as Utxo;
    expect(sU).toBeDefined();
    expect(rU).toBeDefined();
    const transport = new V1HttpTransport({ listen: (h) => nodeListen(h), replyTimeoutMs: 20_000 });
    const wallet = nodeReceiverWallet(rk, 'wpkh', [rU]);
    wallet.testMempoolAccept = async (hexTx: string) => (await rpc<{ allowed: boolean }[]>('testmempoolaccept', [[hexTx]]))[0]?.allowed === true;
    const amount = 1_000_000n;
    const rs = await transport.openReceiverSession({ address: rAddr, network: 'regtest', amountSats: amount, expirySeconds: 600 });
    const receiver = new ReceiverSession(receiverCtx(wallet, rAddr, { network: 'regtest', amountSats: amount, mode: 'non-interactive' }));
    const sender = await SenderSession.open({
      uri: rs.uri,
      utxos: [{ ...sU, amount: sU.amount }],
      feeRateSatPerVb: 2,
      changeAddress: sChange,
      signer: signerFor([{ k: sk, kind: 'wpkh' }]),
      transport,
      now: () => Math.floor(Date.now() / 1000),
      params: { maxAdditionalFeeContributionSats: 300n },
    });
    return { rs, receiver, sender, sU, rU, amount };
  }

  it('v1 over loopback HTTP: payjoin tx is accepted, mined, and has two input owners', async () => {
    const { rs, receiver, sender, sU, rU, amount } = await setup();
    // The HTTP request is parked until the receiver answers, so serve concurrently with the sender poll.
    const sending = (async () => {
      for (let i = 0; i < 100; i++) {
        const ev = await sender.poll();
        if (ev.kind !== 'pending') return ev;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error('timeout');
    })();
    let served: Awaited<ReturnType<ReceiverSession['serve']>> = 'idle';
    for (let i = 0; i < 100 && served === 'idle'; i++) {
      served = await receiver.serve(rs);
      if (served === 'idle') await new Promise((r) => setTimeout(r, 100));
    }
    const ev = await sending;
    await rs.close();
    expect(served).toMatchObject({ ok: true });
    expect(ev.kind).toBe('ready');
    if (ev.kind !== 'ready') return;
    expect(ev.payjoin).toBe(true);

    const accept = await rpc<{ allowed: boolean; 'reject-reason'?: string }[]>('testmempoolaccept', [[ev.txHex]]);
    expect(accept[0]?.allowed, accept[0]?.['reject-reason']).toBe(true);
    // The Original conflicts with the payjoin (same sender input): fallback and payjoin are exclusive.
    sender.markBroadcast('payjoin');
    expect(() => sender.fallbackTx()).toThrow(/session_state/);
    const txid = await rpc<string>('sendrawtransaction', [ev.txHex]);
    const [blockHash] = await rpc<string[]>('generatetoaddress', [1, sAddr]);
    const block = await rpc<{ tx: string[] }>('getblock', [blockHash, 1]);
    expect(block.tx).toContain(txid);

    const tx = parsePsbt(ev.psbt);
    expect(tx.inputsLength).toBe(2);
    const ops = [0, 1].map((i) => `${hex.encode(tx.getInput(i).txid as Uint8Array)}:${String(tx.getInput(i).index)}`);
    expect(ops).toContain(`${sU.txid}:${String(sU.index)}`);
    expect(ops).toContain(`${rU.txid}:${String(rU.index)}`);
    const rOut = [0, 1].map((i) => tx.getOutput(i)).find((o) => hex.encode(o.script as Uint8Array) === hex.encode(rU.script));
    expect((rOut?.amount as bigint) > amount).toBe(true);
    expect((rOut?.amount as bigint) >= amount + rU.amount - 400n).toBe(true);
  }, 120_000);

  it('fallback: the Original is itself valid on the node and conflicts with the payjoin', async () => {
    const { sender, rs } = await setup();
    await rs.close();
    const f = sender.fallbackTx();
    const accept = await rpc<{ allowed: boolean; 'reject-reason'?: string }[]>('testmempoolaccept', [[f.hex]]);
    expect(accept[0]?.allowed, accept[0]?.['reject-reason']).toBe(true);
    sender.markBroadcast('fallback');
    expect(() => sender.markBroadcast('payjoin')).toThrow(/session_state/);
  }, 60_000);

  for (const [sKind, rKind] of [['sh-wpkh', 'tr'], ['tr', 'tr']] as const satisfies readonly (readonly [Kind, Kind])[]) {
    it(`async (memory transport) ${sKind} -> ${rKind}: node accepts the payjoin`, async () => {
      const tip = await rpc<number>('getblockcount');
      const sU = (await utxosOf(addressFor(sk, sKind, 'regtest'), tip))[0] as Utxo;
      const rU = (await utxosOf(addressFor(rk, rKind, 'regtest'), tip))[0] as Utxo;
      const sUtxo: Utxo = { ...sU, ...(sKind === 'sh-wpkh' ? { signing: { redeemScript: signerRedeem(sk) } } : { signing: { tapInternalKey: sk.pub.slice(1) } }) };
      const rUtxo: Utxo = { ...rU, signing: { tapInternalKey: rk.pub.slice(1) } };
      const now = () => Math.floor(Date.now() / 1000);
      const tr = new MemoryTransport(newDirectory(now));
      const rAddr2 = addressFor(rk, rKind, 'regtest');
      const rs = await tr.openReceiverSession({ address: rAddr2, network: 'regtest', amountSats: 500_000n, expirySeconds: 600 });
      const sender = await SenderSession.open({
        uri: rs.uri,
        utxos: [sUtxo],
        feeRateSatPerVb: 3,
        changeAddress: sChange,
        signer: signerFor([{ k: sk, kind: sKind }]),
        transport: tr,
        now,
        params: { maxAdditionalFeeContributionSats: 400n, minFeeRateSatPerVb: 2 },
      });
      const receiver = new ReceiverSession(receiverCtx(nodeReceiverWallet(rk, rKind, [rUtxo]), rAddr2, { network: 'regtest', amountSats: 500_000n }));
      expect(await receiver.serve(rs)).toMatchObject({ ok: true });
      const ev = await sender.poll();
      expect(ev.kind).toBe('ready');
      if (ev.kind !== 'ready') return;
      const accept = await rpc<{ allowed: boolean; 'reject-reason'?: string }[]>('testmempoolaccept', [[ev.txHex]]);
      expect(accept[0]?.allowed, accept[0]?.['reject-reason']).toBe(true);
    }, 60_000);
  }
});
