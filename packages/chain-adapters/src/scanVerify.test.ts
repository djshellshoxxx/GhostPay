import { describe, expect, it } from 'vitest';
import { ChainAdapterError } from './errors.js';
import * as api from './index.js';
import { validateAnnouncementLog, ANNOUNCEMENT_TOPIC, type ScannedAnnouncement } from './logs.js';
import { createClient, type LogFilter, type RpcClient, type RpcLog } from './rpc.js';
import { FakeRpcError, fakeTransport, noSleep } from './rpc.testutil.js';
import { compareProviders } from './scanVerify.js';
import { FAKE, SEPOLIA } from './fixtures.testutil.js';
import { encodeAbiParameters } from 'viem/utils';
import { secp256k1 } from '@noble/curves/secp256k1.js';

const STEALTH = '0x00000000000000000000000000000000000000aa' as const;
const OTHER = '0x00000000000000000000000000000000000000ee' as const;

describe('receipt status API (F5)', () => {
  it('no longer exports the unused router-claim verifier; payments are verified with transfer evidence only', () => {
    expect(Object.keys(api)).not.toContain('verifyReceipt');
    expect(Object.keys(api)).toContain('verifyClaimedPayment');
  });
});

describe('compareProviders', () => {
  const eph = `0x${Array.from(secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(), true), (x) => x.toString(16).padStart(2, '0')).join('')}` as const;
  const md = `0x${'12'.repeat(4)}` as const;
  const word = (a: string): string => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
  const mkLog = (block: number, idx: number, over: Partial<RpcLog> = {}): RpcLog => ({
    address: FAKE.announcer, topics: [ANNOUNCEMENT_TOPIC, word('0x1'), word(STEALTH), word(FAKE.router)],
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [eph, md]),
    blockNumber: `0x${block.toString(16)}`, blockHash: `0x${block.toString(16).padStart(64, '0')}`, logIndex: `0x${idx.toString(16)}`, ...over,
  });
  const parse = (l: RpcLog): ScannedAnnouncement => validateAnnouncementLog(l, FAKE.announcer, 1n, 0n, 10_000n) as ScannedAnnouncement;
  const secondary = (logs: RpcLog[], head = 500n, hashAt = (n: bigint) => `0x${n.toString(16).padStart(64, '0')}`): RpcClient => ({
    chainId: SEPOLIA.chainId,
    blockNumber: () => Promise.resolve(head),
    getBlock: (n: bigint) => Promise.resolve({ number: n, hash: hashAt(n), parentHash: hashAt(n - 1n) }),
    getLogs: (f: LogFilter) => Promise.resolve(logs.filter((l) => BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock && (f.topics[3] == null || l.topics[3] === f.topics[3]))),
  } as unknown as RpcClient);
  const run = (sec: RpcClient, primary: RpcLog[], extra: { primarySkipped?: number; router?: `0x${string}`; primaryRouterOnlyBlocks?: bigint[] } = {}) =>
    compareProviders({ chain: SEPOLIA, secondary: sec, announcer: FAKE.announcer, fromBlock: 0n, toBlock: 300n, primaryAnnouncements: primary.map(parse), primarySkipped: extra.primarySkipped ?? 0, primaryBlockHash: `0x${(300).toString(16).padStart(64, '0')}`, ...extra });
  const spam = (block: number, idx: number): RpcLog => mkLog(block, idx, { topics: [ANNOUNCEMENT_TOPIC, word('0x1'), word(STEALTH), word(OTHER)] });
  const tooBig = (): Error => new ChainAdapterError('RESPONSE_TOO_LARGE', 'response exceeds cap');
  /** A secondary whose eth_getLogs fails for ranges wider than `maxBlocks` and for any unfiltered query covering `dense`. */
  const limited = (inner: RpcClient, maxBlocks: bigint, err: () => Error = tooBig, dense?: bigint): RpcClient => ({
    ...inner,
    getLogs: (f: LogFilter) => (f.toBlock - f.fromBlock + 1n > maxBlocks || (dense !== undefined && f.topics[3] == null && f.fromBlock <= dense && f.toBlock >= dense)
      ? Promise.reject(err())
      : inner.getLogs(f)),
  });

  it('agreeing providers produce no discrepancy', async () => {
    const logs = [mkLog(100, 0), mkLog(250, 1)];
    expect((await run(secondary(logs), logs)).discrepancies).toEqual([]);
  });
  it('detects a log the primary hid (censoring RPC)', async () => {
    const r = await run(secondary([mkLog(100, 0), mkLog(250, 1)]), [mkLog(100, 0)]);
    expect(r.discrepancies).toEqual([{ kind: 'missing_in_primary', ref: mkLog(250, 1).blockHash + ':1' }]);
  });
  it('detects a log the primary invented (fake announcement)', async () => {
    const r = await run(secondary([]), [mkLog(100, 0)]);
    expect(r.discrepancies.map((d) => d.kind)).toEqual(['missing_in_secondary']);
  });
  it('detects altered content and differing block hash', async () => {
    const altered = mkLog(100, 0, { data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [eph, '0x99999999']) });
    expect((await run(secondary([altered]), [mkLog(100, 0)])).discrepancies.map((d) => d.kind)).toEqual(['content_differs']);
    const r = await run(secondary([], 500n, (n) => `0x${(n + 7n).toString(16).padStart(64, '0')}`), []);
    expect(r.discrepancies.map((d) => d.kind)).toEqual(['block_hash_differs']);
  });
  it('detects differing skipped (malformed) counts', async () => {
    const junk = mkLog(100, 0, { topics: [ANNOUNCEMENT_TOPIC, word('0x1')] });
    expect((await run(secondary([junk]), [])).discrepancies.map((d) => d.kind)).toEqual(['skipped_count_differs']);
  });
  it('halves the secondary range on a response or provider result limit instead of failing (L3-F2)', async () => {
    const logs = [mkLog(100, 0), mkLog(250, 1)];
    for (const err of [tooBig, () => new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32005'), () => new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32602')]) {
      expect((await run(limited(secondary(logs), 40n, err), logs)).discrepancies).toEqual([]);
    }
    // A hidden router log is still caught after splitting.
    const hidden = await run(limited(secondary(logs), 40n), [mkLog(100, 0)]);
    expect(hidden.discrepancies).toEqual([{ kind: 'missing_in_primary', ref: `${mkLog(250, 1).blockHash}:1` }]);
  });
  it('compares only the router lane of a block the primary fetched router-only, asking the secondary the same way', async () => {
    const routed = mkLog(120, 5);
    const sec = secondary([spam(120, 0), spam(120, 1), routed, mkLog(250, 1)]);
    const filters: LogFilter[] = [];
    const watched: RpcClient = { ...sec, getLogs: (f: LogFilter) => { filters.push(f); return sec.getLogs(f); } };
    const r = await run(watched, [routed, mkLog(250, 1)], { router: FAKE.router, primaryRouterOnlyBlocks: [120n] });
    expect(r.discrepancies).toEqual([]);
    expect(filters.filter((f) => f.topics.length === 4).map((f) => [f.fromBlock, f.toBlock])).toEqual([[120n, 120n]]);
    expect(filters.every((f) => f.topics.length === 4 || f.toBlock < 120n || f.fromBlock > 120n)).toBe(true);
    // Router-only blocks cannot be compared without knowing the router.
    expect((await run(sec, [routed, mkLog(250, 1)], { primaryRouterOnlyBlocks: [120n] })).discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
    // The router lane is still compared there: a router log the primary lacks is reported.
    expect((await run(sec, [mkLog(250, 1)], { router: FAKE.router, primaryRouterOnlyBlocks: [120n] })).discrepancies.map((d) => d.kind)).toEqual(['missing_in_primary']);
  });
  it('compares the router lane of a block only the secondary cannot return in one response (L3-F2)', async () => {
    const routed = mkLog(120, 5);
    const junk = mkLog(120, 2, { topics: [ANNOUNCEMENT_TOPIC, word('0x1')] });
    const primary = [spam(120, 0), routed, mkLog(250, 1)];
    const sec = limited(secondary([...primary, junk]), 1000n, tooBig, 120n);
    expect((await run(sec, primary, { router: FAKE.router, primarySkipped: 1 })).discrepancies).toEqual([]);
    // Without the router the block cannot be compared at all: fail closed.
    expect((await run(sec, primary, { primarySkipped: 1 })).discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
    // Other provider errors at one block are not treated as size limits.
    const failing = limited(secondary(primary), 1000n, () => new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32603'), 120n);
    expect((await run(failing, primary, { router: FAKE.router })).discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
  });
  describe('A-R6: -32005 is also a rate-limit code, so the secondary asks a refused block again before narrowing it', () => {
    /**
     * A real client with default retries (three attempts per request), as in scanHardening's A-R1 tests: the first `burst`
     * eth_getLogs attempts are refused with -32005; after that, a caller-unfiltered query covering `dense` fails with
     * `denseCode`. `asked` records each attempt as [topic count, from, to].
     */
    const rateLimited = async (logs: RpcLog[], o: { burst?: number; dense?: bigint; denseCode?: number } = {}) => {
      let refused = 0;
      const asked: [number, bigint, bigint][] = [];
      const t = fakeTransport((m, p) => {
        if (m === 'eth_chainId') return '0xaa36a7';
        if (m === 'eth_blockNumber') return '0x7d0';
        if (m === 'eth_getBlockByNumber') return { number: p[0], hash: `0x${BigInt(p[0] as string).toString(16).padStart(64, '0')}`, parentHash: `0x${'0'.repeat(64)}` };
        const f = p[0] as { fromBlock: string; toBlock: string; topics: (string | null)[] };
        const [from, to] = [BigInt(f.fromBlock), BigInt(f.toBlock)];
        asked.push([f.topics.length, from, to]);
        if (refused < (o.burst ?? 0)) {
          refused++;
          throw new FakeRpcError(-32005);
        }
        const caller = f.topics[3];
        if (o.dense !== undefined && caller == null && from <= o.dense && to >= o.dense) throw new FakeRpcError(o.denseCode ?? -32005);
        return logs.filter((l) => BigInt(l.blockNumber) >= from && BigInt(l.blockNumber) <= to && (caller == null || l.topics[3] === caller));
      });
      return { asked, client: await createClient(SEPOLIA, 'https://rpc.example.test', { transport: t, sleep: noSleep }) };
    };
    /** Blocks 7 to 1006: ten requests from 1,000 blocks down to block 7 alone. */
    const compare = (sec: RpcClient, primary: RpcLog[], primarySkipped = 0) =>
      compareProviders({ chain: SEPOLIA, secondary: sec, announcer: FAKE.announcer, fromBlock: 7n, toBlock: 1006n, primaryAnnouncements: primary.map(parse), primarySkipped, primaryBlockHash: `0x${(1006).toString(16).padStart(64, '0')}`, router: FAKE.router });
    const direct = spam(7, 0);
    const routed = mkLog(7, 1);
    const junk = mkLog(7, 2, { topics: [ANNOUNCEMENT_TOPIC, word('0x1')] });

    it('compares a block whole when the refusals were a rate-limit burst that has ended', async () => {
      // 30 refusals: the ten requests above, three attempts each; the router lane then succeeds.
      const { client: c, asked } = await rateLimited([direct, routed, junk], { burst: 30 });
      expect((await compare(c, [direct, routed], 1)).discrepancies).toEqual([]);
      // The router lane of block 7, then the whole block once more.
      expect(asked.slice(30, 32)).toEqual([[4, 7n, 7n], [2, 7n, 7n]]);
    });

    it('reports what a lying primary hid in that block: a direct announcement and the skipped count', async () => {
      const { client: c } = await rateLimited([direct, routed, junk], { burst: 30 });
      expect((await compare(c, [routed])).discrepancies).toEqual([
        { kind: 'missing_in_primary', ref: `${direct.blockHash}:0` },
        { kind: 'skipped_count_differs', ref: '0/1' },
      ]);
    });

    it('compares only the router lane of a block refused as too large again after its router lane was read, as before', async () => {
      const { client: c, asked } = await rateLimited([direct, routed, junk], { dense: 7n });
      expect((await compare(c, [direct, routed], 1)).discrepancies).toEqual([]);
      // Block 7 whole (three attempts), its router lane, then the whole block again (three attempts).
      expect(asked.filter(([, from, to]) => from === 7n && to === 7n).map(([n]) => n)).toEqual([2, 2, 2, 4, 2, 2, 2]);
    });

    it('a rate limit that outlasts the router-lane read, or another failure of the second whole-block read, is a secondary_error', async () => {
      // 33 refusals: the ten requests above plus the router lane's three attempts.
      const { client: lasting } = await rateLimited([direct, routed], { burst: 33 });
      expect((await compare(lasting, [routed])).discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
      // The router lane is read, then the whole block fails with a code that is no size limit: the page is withheld.
      const { client: failing } = await rateLimited([direct, routed], { burst: 30, dense: 7n, denseCode: -32600 });
      expect((await compare(failing, [routed])).discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
    });
  });
  it('reports a secondary that answers the router-only query with another caller', async () => {
    const sec = secondary([mkLog(120, 5)]);
    const forging: RpcClient = { ...sec, getLogs: (f: LogFilter) => (f.topics.length === 4 ? Promise.resolve([spam(120, 0)]) : sec.getLogs(f)) };
    expect((await run(forging, [mkLog(120, 5)], { router: FAKE.router, primaryRouterOnlyBlocks: [120n] })).discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
  });
  it('reports lagging and failing secondaries instead of throwing', async () => {
    expect((await run(secondary([], 10n), [])).discrepancies.map((d) => d.kind)).toEqual(['secondary_behind']);
    const dead = { chainId: SEPOLIA.chainId, blockNumber: () => Promise.reject(new Error('x')) } as unknown as RpcClient;
    expect((await run(dead, [])).discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
    const other = { ...secondary([]), chainId: 1 } as RpcClient;
    expect((await run(other, [])).discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
  });
});
