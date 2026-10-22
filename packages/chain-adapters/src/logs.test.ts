import { encodeAbiParameters, getAddress } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { ChainAdapterError } from './errors.js';
import { FAKE, SEPOLIA, payment, recipient } from './fixtures.testutil.js';
import { ANNOUNCEMENT_TOPIC, fetchAnnouncements, validateAnnouncementLog, type ScanCursor } from './logs.js';
import { createClient, type RpcClient, type RpcLog } from './rpc.js';
import { FakeRpcError, fakeTransport, noSleep } from './rpc.testutil.js';
import type { Hex } from './types.js';

const ANN = FAKE.announcer;
const word = (a: string): Hex => `0x${a.replace('0x', '').toLowerCase().padStart(64, '0')}`;
const bh = (n: number, fork = 0): Hex => `0x${(n + 1000 * fork).toString(16).padStart(64, '0')}`;
const { meta } = recipient();
const PAY = payment(meta);
const eph = (): Hex => `0x${Buffer.from(PAY.ephemeralPublicKey).toString('hex')}`;
const RANGE = { from: 0n, to: 100n };

function mkLog(over: Partial<RpcLog> & { eph?: string; metadata?: string; topics?: string[] } = {}, block = 5, index = 0): RpcLog {
  const data = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [(over.eph ?? eph()) as Hex, (over.metadata ?? `0x${'ab'}${'00'.repeat(56)}`) as Hex]);
  return {
    address: ANN,
    topics: over.topics ?? [ANNOUNCEMENT_TOPIC, word('0x1'), word(PAY.stealthAddress), word(FAKE.router)],
    data,
    blockNumber: `0x${block.toString(16)}`,
    blockHash: bh(block),
    logIndex: `0x${index.toString(16)}`,
    ...over,
  };
}

interface Chain {
  head: number;
  fork: number;
  logs: RpcLog[];
  providerMax: number;
  requests: { from: bigint; to: bigint }[];
}

async function client(chain: Chain, overrides: Partial<Record<string, (p: unknown[]) => unknown>> = {}): Promise<RpcClient> {
  const t = fakeTransport((m, p) => {
    const o = overrides[m];
    if (o) return o(p);
    if (m === 'eth_chainId') return '0xaa36a7';
    if (m === 'eth_blockNumber') return `0x${chain.head.toString(16)}`;
    if (m === 'eth_getBlockByNumber') {
      const n = Number(BigInt(p[0] as string));
      if (n > chain.head) return null;
      return { number: p[0], hash: bh(n, chain.fork), parentHash: bh(Math.max(0, n - 1), chain.fork) };
    }
    if (m === 'eth_getLogs') {
      const f = p[0] as { fromBlock: string; toBlock: string };
      const from = BigInt(f.fromBlock);
      const to = BigInt(f.toBlock);
      chain.requests.push({ from, to });
      if (to - from + 1n > BigInt(chain.providerMax)) throw new FakeRpcError(-32005);
      return chain.logs.filter((l) => BigInt(l.blockNumber) >= from && BigInt(l.blockNumber) <= to);
    }
    return null;
  });
  return createClient(SEPOLIA, 'https://rpc.example.test', { transport: t, sleep: noSleep, retries: 0 });
}
const mkChain = (over: Partial<Chain> = {}): Chain => ({ head: 20, fork: 0, logs: [], providerMax: 1000, requests: [], ...over });
const fetchWith = async (c: RpcClient, cursor: ScanCursor, extra = {}) =>
  fetchAnnouncements({ chain: { ...SEPOLIA, getLogsMaxRange: 10, finalityDepth: 5 }, client: c, announcer: ANN, cursor, ...extra });

describe('validateAnnouncementLog', () => {
  const v = (l: RpcLog) => validateAnnouncementLog(l, ANN, 1n, RANGE.from, RANGE.to);
  it('accepts a well-formed log and normalizes it', () => {
    const a = v(mkLog({}, 7, 3));
    expect(a?.stealthAddress).toBe(PAY.stealthAddress);
    expect(a?.caller).toBe(FAKE.router);
    expect(a?.id).toBe(`${bh(7)}:3`);
    expect(a?.blockNumber).toBe(7n);
    expect(a?.schemeId).toBe(1n);
  });
  it('accepts a differently-cased emitter', () => {
    expect(v(mkLog({ address: ANN.toLowerCase() }))).toBeDefined();
  });
  it('PROVIDER faults throw INVALID_LOG', () => {
    const t = (l: RpcLog, re: RegExp): void => { expect(() => v(l)).toThrow(re); };
    t(mkLog({ address: getAddress('0x00000000000000000000000000000000000000ee') }), /wrong emitter/);
    t(mkLog({ address: 5 as never }), /wrong emitter/);
    t(mkLog({ removed: true }), /removed/);
    t(mkLog({ topics: ['0x12', word('0x1'), word('0xa'), word('0xb')] }), /topic0/);
    t(mkLog({ topics: [ANNOUNCEMENT_TOPIC, word('0x2'), word('0xa'), word('0xb')] }), /scheme/);
    t(mkLog({ topics: 5 as never }), /topics/);
    t(mkLog({ topics: [5 as never] }), /topics/);
    t(mkLog({ blockNumber: '0x65' }), /outside/);
    t(mkLog({ blockNumber: 'nope' }), /position/);
    t(mkLog({ logIndex: '0x01' }), /position/);
    t(mkLog({ blockHash: '0x12' }), /position/);
    t(mkLog({ logIndex: '0x1000000' }), /position/);
    t(null as never, /not an object/);
  });
  it('CONTENT faults are skipped (undefined), never thrown', () => {
    const skip = (l: RpcLog): void => { expect(v(l)).toBeUndefined(); };
    skip(mkLog({ topics: [ANNOUNCEMENT_TOPIC, word('0x1'), word('0xa')] })); // 3 topics
    skip(mkLog({ topics: [ANNOUNCEMENT_TOPIC, word('0x1'), word('0xa'), word('0xb'), word('0xc')] })); // 5 topics
    skip(mkLog({ topics: [ANNOUNCEMENT_TOPIC, word('0x1'), `0x${'11'.repeat(32)}`, word('0xb')] })); // dirty address topic
    skip(mkLog({ topics: [ANNOUNCEMENT_TOPIC, word('0x1'), word('0xa'), `0x${'11'.repeat(32)}`] }));
    skip({ ...mkLog(), data: 'xyz' });
    skip({ ...mkLog(), data: 7 as never });
    skip({ ...mkLog(), data: '0x1234' }); // undecodable
    skip({ ...mkLog(), data: `${mkLog().data}00` }); // trailing garbage: non-canonical
    skip(mkLog({ eph: `0x02${'00'.repeat(31)}` })); // 32 bytes
    skip(mkLog({ eph: `0x02${'00'.repeat(33)}` })); // 34 bytes
    skip(mkLog({ eph: `0x04${'11'.repeat(32)}` })); // bad prefix, 33 bytes
    skip(mkLog({ eph: `0x02${'ff'.repeat(32)}` })); // off-curve
    skip(mkLog({ metadata: '0x' }));
  });
});

describe('fetchAnnouncements', () => {
  it('paginates by the range cap and returns announcements in order', async () => {
    const chain = mkChain({ head: 25, logs: [mkLog({}, 3), mkLog({}, 12), mkLog({}, 25)] });
    const r = await fetchWith(await client(chain), { nextBlock: 0n });
    expect(chain.requests).toEqual([{ from: 0n, to: 9n }, { from: 10n, to: 19n }, { from: 20n, to: 25n }]);
    expect(r.announcements.map((a) => a.blockNumber)).toEqual([3n, 12n, 25n]);
    expect(r.cursor).toEqual({ nextBlock: 26n, last: { number: 25n, hash: bh(25) } });
    expect(r.truncated).toBe(false);
    expect(r.reorg).toBeUndefined();
    expect(r.skipped).toBe(0);
  });
  it('honours a smaller maxRange but never a larger one', async () => {
    const c1 = mkChain({ head: 9 });
    await fetchWith(await client(c1), { nextBlock: 0n }, { maxRange: 4 });
    expect(c1.requests.map((r) => Number(r.to - r.from + 1n))).toEqual([4, 4, 2]);
    const c2 = mkChain({ head: 29 });
    await fetchWith(await client(c2), { nextBlock: 0n }, { maxRange: 1000 });
    expect(c2.requests.map((r) => Number(r.to - r.from + 1n))).toEqual([10, 10, 10]);
  });
  it('request cap truncates and resumes exactly where it stopped (no gaps)', async () => {
    const chain = mkChain({ head: 25, logs: [mkLog({}, 3), mkLog({}, 12), mkLog({}, 25)] });
    const c = await client(chain);
    const r1 = await fetchWith(c, { nextBlock: 0n }, { maxRequests: 1 });
    expect(r1.truncated).toBe(true);
    expect(r1.cursor.nextBlock).toBe(10n);
    const r2 = await fetchWith(c, r1.cursor);
    expect(r2.announcements.map((a) => a.blockNumber)).toEqual([12n, 25n]);
    expect(r2.truncated).toBe(false);
  });
  it('log cap truncates', async () => {
    const chain = mkChain({ head: 25, logs: [mkLog({}, 3), mkLog({}, 4), mkLog({}, 12)] });
    const r = await fetchWith(await client(chain), { nextBlock: 0n }, { maxLogs: 2 });
    expect(r.truncated).toBe(true);
    expect(r.announcements).toHaveLength(2);
    expect(r.cursor.nextBlock).toBe(10n);
  });
  it('halves the window when the provider rejects the range, down to success', async () => {
    const chain = mkChain({ head: 9, providerMax: 3, logs: [mkLog({}, 5)] });
    const r = await fetchWith(await client(chain), { nextBlock: 0n });
    expect(r.announcements).toHaveLength(1);
    expect(chain.requests.map((x) => Number(x.to - x.from + 1n))).toEqual([10, 5, 2, 2, 2, 2, 2].slice(0, chain.requests.length));
    expect(chain.requests.at(-1)?.to).toBe(9n);
  });
  it('gives up when even one block is rejected', async () => {
    const chain = mkChain({ head: 9, providerMax: 0 });
    await expect(fetchWith(await client(chain), { nextBlock: 0n })).rejects.toThrow(/json-rpc error -32005/);
  });
  it('does not swallow other errors', async () => {
    const chain = mkChain();
    const c = await client(chain, { eth_getLogs: () => { throw new FakeRpcError(-32000); } });
    await expect(fetchWith(c, { nextBlock: 0n })).rejects.toThrow(/-32000/);
  });
  it('dedupes identical block:index entries from a misbehaving provider', async () => {
    const dup = mkLog({}, 3, 1);
    const chain = mkChain({ head: 9, logs: [dup, { ...dup }, mkLog({}, 3, 2)] });
    const r = await fetchWith(await client(chain), { nextBlock: 0n });
    expect(r.announcements.map((a) => a.id)).toEqual([`${bh(3)}:1`, `${bh(3)}:2`]);
  });
  it('rejects forged logs: wrong emitter, removed, out-of-range, wrong chain', async () => {
    const forged = (l: RpcLog) => mkChain({ head: 9, logs: [l] });
    await expect(fetchWith(await client(forged(mkLog({ address: getAddress('0x00000000000000000000000000000000000000ee') }, 3))), { nextBlock: 0n })).rejects.toThrow(/wrong emitter/);
    await expect(fetchWith(await client(forged(mkLog({ removed: true }, 3))), { nextBlock: 0n })).rejects.toThrow(/removed/);
    await expect(fetchWith(await client(mkChain({ head: 9 }), { eth_getLogs: () => [mkLog({}, 15)] }), { nextBlock: 0n })).rejects.toThrow(/outside/);
    const other = await createClient({ ...SEPOLIA, chainId: 84532 }, 'https://rpc.example.test', { transport: fakeTransport((m) => (m === 'eth_chainId' ? '0x14a34' : null)), sleep: noSleep });
    await expect(fetchWith(other, { nextBlock: 0n })).rejects.toThrow(/CHAIN_MISMATCH/);
  });
  it('skips hostile-content logs and counts them without halting', async () => {
    const chain = mkChain({ head: 9, logs: [mkLog({ eph: `0x02${'ff'.repeat(32)}` }, 2), mkLog({}, 3), mkLog({ metadata: '0x' }, 4)] });
    const r = await fetchWith(await client(chain), { nextBlock: 0n });
    expect(r.announcements).toHaveLength(1);
    expect(r.skipped).toBe(2);
  });
  it('oversized response is rejected by the client', async () => {
    const chain = mkChain({ head: 9 });
    const t = fakeTransport((m, p) => (m === 'eth_chainId' ? '0xaa36a7' : m === 'eth_blockNumber' ? '0x9' : m === 'eth_getBlockByNumber' ? { number: p[0], hash: bh(9), parentHash: bh(8) } : [mkLog({}, 1), ...Array.from({ length: 50 }, (_, i) => mkLog({}, 2, i))]));
    const c = await createClient(SEPOLIA, 'https://rpc.example.test', { transport: t, sleep: noSleep, maxResponseBytes: 5000 });
    await expect(fetchWith(c, { nextBlock: 0n })).rejects.toThrow(/RESPONSE_TOO_LARGE/);
    void chain;
  });

  describe('reorgs', () => {
    it('unchanged hash: continues from the cursor', async () => {
      const chain = mkChain({ head: 20 });
      const c = await client(chain);
      const r1 = await fetchWith(c, { nextBlock: 0n });
      chain.head = 24;
      const r2 = await fetchWith(c, r1.cursor);
      expect(r2.reorg).toBeUndefined();
      expect(chain.requests.at(-1)).toEqual({ from: 21n, to: 24n });
      expect(r2.cursor.last?.number).toBe(24n);
    });
    it('hash mismatch rolls back by finalityDepth and reports the rollback point', async () => {
      const chain = mkChain({ head: 20, logs: [mkLog({}, 18)] });
      const c = await client(chain);
      const r1 = await fetchWith(c, { nextBlock: 0n });
      expect(r1.announcements).toHaveLength(1);
      chain.fork = 1; // every block hash changes
      chain.requests.length = 0;
      const r2 = await fetchWith(c, r1.cursor);
      expect(r2.reorg).toEqual({ rolledBackTo: 16n }); // 20 - 5 + 1
      expect(chain.requests[0]?.from).toBe(16n);
      expect(r2.announcements.map((a) => a.blockNumber)).toEqual([18n]); // replayed; caller dedupes by id after dropping >= 16
      expect(r2.cursor.last?.hash).toBe(bh(20, 1));
    });
    it('missing stored block counts as a reorg; rollback never goes below 0', async () => {
      const chain = mkChain({ head: 2 });
      const c = await client(chain);
      const r = await fetchWith(c, { nextBlock: 4n, last: { number: 3n, hash: bh(3) } });
      expect(r.reorg).toEqual({ rolledBackTo: 0n });
      expect(chain.requests[0]?.from).toBe(0n);
    });
    it('cursor far beyond the head (poisoned checkpoint) fails closed instead of saving a cursor past the real chain (CHAIN-ADAPTERS-02)', async () => {
      const chain = mkChain({ head: 10 });
      const c = await client(chain);
      await expect(fetchWith(c, { nextBlock: 31n, last: { number: 30n, hash: bh(30) } })).rejects.toThrow(/RPC_FAILURE.*ahead of the chain head/);
    });
    it('reorg with head slightly behind the rollback point clears the stale hash', async () => {
      const chain = mkChain({ head: 10 });
      const c = await client(chain);
      const r = await fetchWith(c, { nextBlock: 16n, last: { number: 15n, hash: bh(15) } });
      expect(r.reorg).toEqual({ rolledBackTo: 11n });
      expect(r.cursor.nextBlock).toBe(11n);
      expect(r.cursor.last).toBeUndefined();
    });
    it('nothing new: keeps cursor and re-reads last hash', async () => {
      const chain = mkChain({ head: 20 });
      const c = await client(chain);
      const r1 = await fetchWith(c, { nextBlock: 0n });
      const r2 = await fetchWith(c, r1.cursor);
      expect(r2.announcements).toHaveLength(0);
      expect(r2.cursor).toEqual(r1.cursor);
    });
    it('detects a reorg that happens while scanning', async () => {
      const chain = mkChain({ head: 9 });
      let calls = 0;
      const c = await client(chain, {
        eth_getBlockByNumber: (p) => {
          calls++;
          const n = Number(BigInt(p[0] as string));
          return { number: p[0], hash: bh(n, calls > 1 ? 1 : 0), parentHash: bh(n - 1) };
        },
      });
      await expect(fetchWith(c, { nextBlock: 0n })).rejects.toThrow(/reorganised/);
    });
    it('fails when the processed block vanishes', async () => {
      const chain = mkChain({ head: 9 });
      let calls = 0;
      const c = await client(chain, {
        eth_getBlockByNumber: (p) => {
          calls++;
          const n = Number(BigInt(p[0] as string));
          return calls > 1 ? null : { number: p[0], hash: bh(n), parentHash: bh(n - 1) };
        },
      });
      await expect(fetchWith(c, { nextBlock: 0n })).rejects.toThrow(/vanished/);
    });
    it('empty chain (head < next from genesis)', async () => {
      const chain = mkChain({ head: 0 });
      const r = await fetchWith(await client(chain), { nextBlock: 0n });
      expect(r.cursor.nextBlock).toBe(1n);
    });
  });
  it('ChainAdapterError type is exported for consumers', () => {
    expect(new ChainAdapterError('INVALID_LOG', 'x').code).toBe('INVALID_LOG');
    void (FAKE.router);
  });
});
