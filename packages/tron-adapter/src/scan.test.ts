import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { generateKeySet } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import { decodeTronAddress, tronAddressToHex } from './address.js';
import { createTronAdapter } from './adapter.js';
import { encodeTronMetaAddress } from './meta.js';
import { seededRng } from './rng.testutil.js';
import { TRANSFER_TOPIC, parseCandidate, scanTron } from './scan.js';
import type { TronRpc } from './rpc.js';
import { recoverTronSigner, decodeRawTx } from './tx.js';

const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const PAYER = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC';
const BLOCK_ID = `${'00'.repeat(8)}00112233445566778899aabbccddeeff0011223344556677`.slice(0, 64);
const keys = generateKeySet(seededRng('scan-keys'));
const meta = encodeTronMetaAddress(keys);
const adapter = createTronAdapter({ network: 'nile' });
const refBlock = { number: 100n, blockId: BLOCK_ID };

type J = Record<string, unknown>;
/** Node-JSON form (visible=false: hex addresses) of a built tx. */
function nodeTx(built: ReturnType<ReturnType<typeof adapter.buildPaymentRequest>['build']>, ret = 'SUCCESS'): J {
  const d = decodeRawTx(built.tx.rawData);
  const hex = (a: string): string => tronAddressToHex(a);
  const value: J =
    d.kind === 'trc20'
      ? {
          owner_address: hex(d.owner),
          contract_address: hex(d.contract as string),
          data: `a9059cbb${'0'.repeat(24)}${hex(d.to).slice(2)}${d.amount.toString(16).padStart(64, '0')}`,
        }
      : { owner_address: hex(d.owner), to_address: hex(d.to), amount: Number(d.amount) };
  return {
    txID: built.tx.txID,
    raw_data_hex: built.tx.rawDataHex,
    ret: [{ contractRet: ret }],
    raw_data: {
      data: bytesToHex(d.memo),
      contract: [{ type: d.kind === 'trc20' ? 'TriggerSmartContract' : 'TransferContract', parameter: { value } }],
    },
  };
}

function build(asset: 'trx' | 'usdt', amount = 1_000_000n, seed = 'p'): ReturnType<ReturnType<typeof adapter.buildPaymentRequest>['build']> {
  const req = adapter.buildPaymentRequest({
    chainId: 'tron-nile',
    recipient: meta,
    asset: asset === 'trx' ? { kind: 'native' } : { kind: 'trc20', contract: USDT },
    amount,
  });
  return req.build({ payer: PAYER, refBlock, timestampMs: 1_700_000_000_000n, feeLimitSun: 100_000_000n, rng: seededRng(seed) });
}

function mockRpc(blocks: { number: number; transactions?: J[] }[], infos: Record<string, J> = {}): TronRpc & { calls: string[] } {
  const calls: string[] = [];
  const blk = (b: (typeof blocks)[number]): J => ({
    blockID: BLOCK_ID,
    block_header: { raw_data: { number: b.number } },
    ...(b.transactions === undefined ? {} : { transactions: b.transactions }),
  });
  return {
    calls,
    post(path, body) {
      calls.push(path);
      const b = body as J;
      if (path === '/wallet/getnowblock') return Promise.resolve(blk(blocks[blocks.length - 1] as (typeof blocks)[number]));
      if (path === '/wallet/getblockbylimitnext') {
        return Promise.resolve({ block: blocks.filter((x) => x.number >= (b['startNum'] as number) && x.number < (b['endNum'] as number)).map(blk) });
      }
      if (path === '/wallet/gettransactioninfobyid') return Promise.resolve(infos[b['value'] as string] ?? { id: b['value'] });
      return Promise.reject(new Error(`unexpected ${path}`));
    },
  };
}
const transferLog = (to: string, amount: bigint, token = USDT): J => ({
  address: tronAddressToHex(token).slice(2),
  topics: [TRANSFER_TOPIC, '0'.repeat(64), `${'0'.repeat(24)}${tronAddressToHex(to).slice(2)}`],
  data: amount.toString(16).padStart(64, '0'),
});
async function collect(it: AsyncIterable<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const x of it) out.push(x);
  return out;
}
const sc = new AbortController();

describe('scan with mock RPC', () => {
  it('adapter.scan needs an rpc', () => {
    expect(() => adapter.scan({ fromBlock: 1n }, { viewingSecret: keys.viewingSecret, spendingPublicKey: keys.spendingPublicKey }, sc.signal)).toThrow();
  });
  it('end to end through the adapter', async () => {
    const trx = build('trx', 5_000_000n, 'a');
    const usdt = build('usdt', 12_345n, 'b');
    const rpc = mockRpc(
      [{ number: 100 }, { number: 101, transactions: [nodeTx(trx)] }, { number: 102, transactions: [nodeTx(usdt)] }],
      { [usdt.tx.txID]: { id: usdt.tx.txID, receipt: { result: 'SUCCESS' }, log: [transferLog(usdt.stealthAddress, 12_345n)] } },
    );
    const a = createTronAdapter({ network: 'nile', rpc, trustedTokens: [USDT] });
    const out = (await collect(a.scan({ fromBlock: 100n }, { viewingSecret: keys.viewingSecret, spendingPublicKey: keys.spendingPublicKey }, sc.signal))) as {
      asset: string; amount: bigint; trustedToken: boolean; stealthAddress: string; blockNumber: bigint; payer: string;
    }[];
    expect(out.map((x) => [x.asset, x.amount, x.trustedToken, x.blockNumber])).toEqual([
      ['native', 5_000_000n, true, 101n],
      [USDT, 12_345n, true, 102n],
    ]);
    expect(out[0]?.stealthAddress).toBe(trx.stealthAddress);
    expect(out[0]?.payer).toBe(PAYER);
  });
  it('flags untrusted tokens', async () => {
    const usdt = build('usdt', 9n, 'b');
    const rpc = mockRpc([{ number: 5, transactions: [nodeTx(usdt)] }], {
      [usdt.tx.txID]: { id: usdt.tx.txID, log: [transferLog(usdt.stealthAddress, 9n)] },
    });
    const out = (await collect(scanTron(rpc, { fromBlock: 5n, toBlock: 5n, viewingSecret: keys.viewingSecret, spendingPublicKey: keys.spendingPublicKey, trustedTokens: [PAYER], signal: sc.signal }))) as { trustedToken: boolean }[];
    expect(out[0]?.trustedToken).toBe(false);
  });
  it('skips fake-token spoof: no Transfer log, wrong amount/recipient/contract, failed receipt', async () => {
    const usdt = build('usdt', 50n, 'b');
    const t = usdt.tx.txID;
    const to = usdt.stealthAddress;
    const cases: J[] = [
      { id: t },
      { id: t, log: [transferLog(to, 49n)] },
      { id: t, log: [transferLog(PAYER, 50n)] },
      { id: t, log: [transferLog(to, 50n, PAYER)] },
      { id: t, receipt: { result: 'OUT_OF_ENERGY' }, log: [transferLog(to, 50n)] },
      { id: t, log: [{ ...transferLog(to, 50n), topics: ['00'.repeat(32), '0'.repeat(64), '0'.repeat(64)] }] },
    ];
    for (const info of cases) {
      const rpc = mockRpc([{ number: 5, transactions: [nodeTx(usdt)] }], { [t]: info });
      expect(await collect(scanTron(rpc, { fromBlock: 5n, toBlock: 5n, viewingSecret: keys.viewingSecret, spendingPublicKey: keys.spendingPublicKey, signal: sc.signal }))).toHaveLength(0);
    }
  });
  it('skips failed txs and txs whose id does not match the signed bytes', async () => {
    const trx = build('trx', 5n, 'a');
    const failed = nodeTx(trx, 'REVERT');
    const forged = { ...nodeTx(trx), txID: '11'.repeat(32) };
    const rpc = mockRpc([{ number: 5, transactions: [failed, forged] }]);
    expect(await collect(scanTron(rpc, { fromBlock: 5n, toBlock: 5n, viewingSecret: keys.viewingSecret, spendingPublicKey: keys.spendingPublicKey, signal: sc.signal }))).toHaveLength(0);
  });
  it('other recipients see nothing; pages across blocks; aborts', async () => {
    const other = generateKeySet(seededRng('other'));
    const trx = build('trx', 5n, 'a');
    const blocks = Array.from({ length: 7 }, (_, i) => ({ number: i, ...(i === 6 ? { transactions: [nodeTx(trx)] } : {}) }));
    const rpc = mockRpc(blocks);
    const base = { fromBlock: 0n, pageSize: 3, spendingPublicKey: other.spendingPublicKey, viewingSecret: other.viewingSecret, signal: sc.signal };
    expect(await collect(scanTron(rpc, base))).toHaveLength(0);
    expect(rpc.calls.filter((c) => c.includes('limitnext'))).toHaveLength(3);
    const ac = new AbortController();
    ac.abort();
    await expect(collect(scanTron(rpc, { ...base, signal: ac.signal }))).rejects.toThrow();
  });
  it('rejects malformed node responses', async () => {
    const bad = (resp: unknown): TronRpc => ({ post: () => Promise.resolve(resp) });
    const o = { fromBlock: 0n, toBlock: 1n, viewingSecret: keys.viewingSecret, spendingPublicKey: keys.spendingPublicKey, signal: sc.signal };
    await expect(collect(scanTron(bad({ block: 5 }), o))).rejects.toThrow();
    await expect(collect(scanTron(bad({ block: [{ blockID: 'x', block_header: { raw_data: { number: 0 } } }] }), o))).rejects.toThrow();
    await expect(collect(scanTron(bad({ block: [{ blockID: BLOCK_ID, block_header: { raw_data: { number: -1 } } }] }), o))).rejects.toThrow();
    await expect(collect(scanTron(bad(null), o))).rejects.toThrow();
    expect(await collect(scanTron(bad({}), o))).toEqual([]);
    const dup = { blockID: BLOCK_ID, block_header: { raw_data: { number: 0 } } };
    await expect(collect(scanTron(bad({ block: [dup, dup] }), o))).rejects.toThrow();
    await expect(collect(scanTron(bad({ block: [{ ...dup, transactions: 3 }] }), o))).rejects.toThrow();
  });
  it('rejects malformed tx info', async () => {
    const usdt = build('usdt', 9n, 'b');
    const run = (info: unknown): Promise<unknown[]> =>
      collect(scanTron({ post: (p) => Promise.resolve(p.includes('info') ? info : { block: [{ blockID: BLOCK_ID, block_header: { raw_data: { number: 5 } }, transactions: [nodeTx(usdt)] }] }) }, { fromBlock: 5n, toBlock: 5n, viewingSecret: keys.viewingSecret, spendingPublicKey: keys.spendingPublicKey, signal: sc.signal }));
    await expect(run({ id: 'other' })).rejects.toThrow();
    await expect(run({ id: usdt.tx.txID, log: 'x' })).rejects.toThrow();
    await expect(run({ id: usdt.tx.txID, log: [{ address: 5 }] })).rejects.toThrow();
  });
});

describe('parseCandidate hostile inputs', () => {
  const good = nodeTx(build('usdt', 7n, 'z'));
  const mut = (f: (t: J) => void): unknown => {
    const t = JSON.parse(JSON.stringify(good)) as J;
    f(t);
    return t;
  };
  const raw = (t: J): J => t['raw_data'] as J;
  const val = (t: J): J => ((raw(t)['contract'] as J[])[0]?.['parameter'] as J)['value'] as J;
  it('accepts the good one', () => {
    expect(parseCandidate(good)?.amount).toBe(7n);
  });
  it.each<[string, (t: J) => void]>([
    ['bad selector', (t) => (val(t)['data'] = `deadbeef${(val(t)['data'] as string).slice(8)}`)],
    ['dirty address padding', (t) => (val(t)['data'] = (val(t)['data'] as string).replace('00000000', '00000001'))],
    ['short data', (t) => (val(t)['data'] = 'a9059cbb')],
    ['call_value set', (t) => (val(t)['call_value'] = 5)],
    ['no memo', (t) => (raw(t)['data'] = undefined)],
    ['short memo', (t) => (raw(t)['data'] = 'aa')],
    ['two contracts', (t) => (raw(t)['contract'] = [(raw(t)['contract'] as J[])[0], (raw(t)['contract'] as J[])[0]])],
    ['unknown type', (t) => ((raw(t)['contract'] as J[])[0] as J)['type'] = 'FreezeBalanceContract'],
    ['bad owner', (t) => (val(t)['owner_address'] = 'T123')],
    ['bad contract', (t) => (val(t)['contract_address'] = '41zz')],
    ['no ret', (t) => (t['ret'] = [])],
    ['non-hex raw', (t) => (t['raw_data_hex'] = 'zz')],
    ['no raw', (t) => (t['raw_data'] = 5)],
  ])('rejects %s', (_n, f) => {
    expect(parseCandidate(mut(f))).toBeUndefined();
  });
  it('rejects TRX with bad amount / missing to', () => {
    const t = nodeTx(build('trx', 3n, 'y'));
    const v = (x: J): J => ((raw(x)['contract'] as J[])[0]?.['parameter'] as J)['value'] as J;
    const a = JSON.parse(JSON.stringify(t)) as J;
    v(a)['amount'] = -1;
    expect(parseCandidate(a)).toBeUndefined();
    const b = JSON.parse(JSON.stringify(t)) as J;
    delete v(b)['to_address'];
    expect(parseCandidate(b)).toBeUndefined();
    expect(parseCandidate(null)).toBeUndefined();
    expect(parseCandidate({})).toBeUndefined();
  });
});

describe('sweep path', () => {
  it('stealth key signs a TRC-20 sweep recoverable to the stealth address', async () => {
    const { deriveTronStealthKey } = await import('./meta.js');
    const { buildTrc20Transfer, signTronTx } = await import('./tx.js');
    const usdt = build('usdt', 25n, 'b');
    const key = deriveTronStealthKey({ stealthAddress: usdt.stealthAddress, memo: decodeRawTx(usdt.tx.rawData).memo }, keys);
    const sweep = buildTrc20Transfer({ owner: usdt.stealthAddress, contract: USDT, to: PAYER, amount: 25n, refBlock, timestampMs: 1_700_000_100_000n, feeLimitSun: 50_000_000n });
    expect(recoverTronSigner(sweep.txID, signTronTx(sweep, key))).toBe(usdt.stealthAddress);
    expect(bytesToHex(sha256(sweep.rawData))).toBe(sweep.txID);
    decodeTronAddress(usdt.stealthAddress);
  });
});
