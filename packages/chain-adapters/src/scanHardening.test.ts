import { encodeAbiParameters } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { FAKE, SEPOLIA, payment, recipient } from './fixtures.testutil.js';
import { ANNOUNCEMENT_TOPIC, fetchAnnouncements, rawCallerTopic, type ScanCursor, type ScannedAnnouncement } from './logs.js';
import { createClient, type RpcClient, type RpcLog } from './rpc.js';
import { fakeTransport, noSleep } from './rpc.testutil.js';
import type { Hex } from './types.js';

// CHAIN-ADAPTERS-01 / 02 regression tests.
const ANN = FAKE.announcer;
const word = (a: string): Hex => `0x${a.replace('0x', '').toLowerCase().padStart(64, '0')}`;
const bh = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}`;
const PAY = payment(recipient().meta);
const CHAIN = { ...SEPOLIA, getLogsMaxRange: 1000, finalityDepth: 5 };
const OTHER = '0x00000000000000000000000000000000000000ee';

function mkLog(block: number, index = 0, caller: string = FAKE.router): RpcLog {
  const eph: Hex = `0x${Buffer.from(PAY.ephemeralPublicKey).toString('hex')}`;
  return {
    address: ANN,
    topics: [ANNOUNCEMENT_TOPIC, word('0x1'), word(PAY.stealthAddress), word(caller)],
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [eph, `0x${'ab'}${'00'.repeat(56)}`]),
    blockNumber: `0x${block.toString(16)}`,
    blockHash: bh(block),
    logIndex: `0x${index.toString(16)}`,
  };
}

function client(head: number, logs: RpcLog[], opts: { maxBytes?: number; seen?: { from: bigint; to: bigint }[]; filters?: readonly (string | null)[][]; callerAnswer?: RpcLog[] } = {}): Promise<RpcClient> {
  const t = fakeTransport((m, p) => {
    if (m === 'eth_chainId') return '0xaa36a7';
    if (m === 'eth_blockNumber') return `0x${head.toString(16)}`;
    if (m === 'eth_getBlockByNumber') {
      const n = Number(BigInt(p[0] as string));
      return n > head ? null : { number: p[0], hash: bh(n), parentHash: bh(Math.max(0, n - 1)) };
    }
    if (m === 'eth_getLogs') {
      const f = p[0] as { fromBlock: string; toBlock: string; topics: (string | null)[] };
      const from = BigInt(f.fromBlock);
      const to = BigInt(f.toBlock);
      opts.seen?.push({ from, to });
      (opts.filters as (string | null)[][] | undefined)?.push(f.topics);
      const caller = f.topics[3];
      const source = caller != null && opts.callerAnswer !== undefined ? opts.callerAnswer : logs;
      return source.filter((l) => BigInt(l.blockNumber) >= from && BigInt(l.blockNumber) <= to && (caller == null || opts.callerAnswer !== undefined || l.topics[3] === caller));
    }
    return null;
  });
  return createClient(CHAIN, 'https://rpc.example.test', { transport: t, sleep: noSleep, retries: 0, maxResponseBytes: opts.maxBytes ?? 2 * 1024 * 1024 });
}

describe('CHAIN-ADAPTERS-01: RESPONSE_TOO_LARGE halves the window', () => {
  it('a heavy block does not stop the scan: window shrinks until the response fits', async () => {
    // 30 spam logs in block 7 (about 30 KB); cap 12 KB. A 1000-block window overflows, a 1-block window around block 7 also does.
    // Spam is placed in block 7 only; the window must shrink to a size whose response excludes it or fits.
    const spam = Array.from({ length: 4 }, (_, i) => mkLog(7, i));
    const heavy = [...spam, mkLog(900, 0), mkLog(901, 0), mkLog(902, 0), mkLog(903, 0), mkLog(904, 0), mkLog(905, 0), mkLog(906, 0), mkLog(907, 0), mkLog(908, 0), mkLog(909, 0)];
    const seen: { from: bigint; to: bigint }[] = [];
    // each log ~ 1.1 KB json; 14 logs overflow 6 KB but 4 logs do not
    const c = await client(1000, heavy, { maxBytes: 6000, seen });
    const r = await fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, cursor: { nextBlock: 0n } });
    expect(r.announcements).toHaveLength(14);
    expect(seen.length).toBeGreaterThan(1);
  });
});

describe('L4-01: announcer spam never stops the scan for good', () => {
  const scanAll = async (c: RpcClient, extra: { router?: `0x${string}` } = {}) => {
    const found: ScannedAnnouncement[] = [];
    const routerOnly: bigint[] = [];
    let cursor: ScanCursor = { nextBlock: 0n };
    for (let i = 0; i < 10; i++) {
      const r = await fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, cursor, ...extra });
      found.push(...r.announcements);
      routerOnly.push(...(r.routerOnlyBlocks ?? []));
      cursor = r.cursor;
      if (!r.truncated) break;
    }
    return { found, routerOnly, cursor };
  };

  it('ends a fetch at the last completed window when the canonical block-read cap would be passed, then resumes', async () => {
    // One announcement in each of 1,100 blocks: the second 1,000-block window would need reads past the 1,000-read cap.
    const c = await client(5000, Array.from({ length: 1100 }, (_, b) => mkLog(b)));
    const first = await fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, cursor: { nextBlock: 0n } });
    expect(first.truncated).toBe(true);
    expect(first.cursor.nextBlock).toBe(1000n);
    expect(first.announcements).toHaveLength(1000);
    const second = await fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, cursor: first.cursor });
    expect(second.announcements.map((a) => a.blockNumber)).toEqual(Array.from({ length: 100 }, (_, i) => BigInt(1000 + i)));
    expect(second.truncated).toBe(false);
  }, 30_000);

  it('shrinks a first window that alone needs more block reads than the cap', async () => {
    const wide = { ...CHAIN, getLogsMaxRange: 2000 };
    const c = await client(5000, Array.from({ length: 1500 }, (_, b) => mkLog(b)));
    const first = await fetchAnnouncements({ chain: wide, client: c, announcer: ANN, cursor: { nextBlock: 0n } });
    expect(first).toMatchObject({ truncated: true, cursor: { nextBlock: 1000n } });
    expect(first.announcements).toHaveLength(1000);
  }, 30_000);

  it('reads the caller topic of untrusted logs defensively', () => {
    expect(rawCallerTopic(null as never)).toBeUndefined();
    expect(rawCallerTopic({ topics: 'x' } as never)).toBeUndefined();
    expect(rawCallerTopic({ topics: [1, 2, 3, 4] } as never)).toBeUndefined();
    expect(rawCallerTopic(mkLog(1, 0, OTHER))).toBe(word(OTHER));
  });

  it('stops before a block that would pass the accepted-log cap, instead of failing, and resumes at that block', async () => {
    const logs = [...[1, 1, 1, 2, 2, 2, 3, 3, 3].map((b, i) => mkLog(b, i)), mkLog(4, 0), mkLog(4, 1)];
    const c = await client(20, logs);
    const first = await fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, cursor: { nextBlock: 0n }, maxLogs: 10 });
    expect(first.truncated).toBe(true);
    expect(first.cursor.nextBlock).toBe(4n);
    expect(first.announcements).toHaveLength(9);
    const second = await fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, cursor: first.cursor, maxLogs: 10 });
    expect(second.announcements.map((a) => a.blockNumber)).toEqual([4n, 4n]);
  });

  it('scans only router-posted announcements of a block whose response exceeds the cap, and reports the block', async () => {
    // 12 spam announcements plus one router payment in block 7 overflow a 6 KB response even as a single block.
    const spam = Array.from({ length: 12 }, (_, i) => mkLog(7, i, OTHER));
    const filters: (string | null)[][] = [];
    const c = await client(1000, [...spam, mkLog(7, 12), mkLog(900, 0), mkLog(950, 0, OTHER)], { maxBytes: 6000, filters });
    const { found, routerOnly, cursor } = await scanAll(c, { router: FAKE.router });
    expect(found.map((a) => [a.blockNumber, a.logIndex])).toEqual([[7n, 12], [900n, 0], [950n, 0]]);
    expect(routerOnly).toEqual([7n]);
    expect(cursor.nextBlock).toBe(1001n);
    expect(filters.filter((t) => t.length === 4)).toEqual([[ANNOUNCEMENT_TOPIC, word('0x1'), null, word(FAKE.router)]]);
  });

  it('without a router keeps the completed windows and fails closed only when the oversized block is next', async () => {
    const spam = Array.from({ length: 13 }, (_, i) => mkLog(7, i, OTHER));
    const c = await client(1000, spam, { maxBytes: 6000 });
    const first = await fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, cursor: { nextBlock: 0n } });
    expect(first).toMatchObject({ truncated: true, cursor: { nextBlock: 7n } });
    await expect(fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, cursor: first.cursor })).rejects.toThrow(/RESPONSE_TOO_LARGE/);
  });

  it('keeps the router lane of a single block that alone exceeds the accepted-log cap', async () => {
    const c = await client(20, [mkLog(5, 0, OTHER), mkLog(5, 1, OTHER), mkLog(5, 2), mkLog(5, 3, OTHER)]);
    const r = await fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, router: FAKE.router, cursor: { nextBlock: 5n }, maxLogs: 2 });
    expect(r.announcements.map((a) => a.logIndex)).toEqual([2]);
    expect(r.routerOnlyBlocks).toEqual([5n]);
    // Without a router nothing may be skipped: the fetch fails closed.
    await expect(fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, cursor: { nextBlock: 5n }, maxLogs: 2 })).rejects.toThrow(/accepted log cap exceeded within one block/);
  });

  it('rejects a provider that answers the router-only query with another caller', async () => {
    const spam = Array.from({ length: 13 }, (_, i) => mkLog(7, i, OTHER));
    const c = await client(1000, spam, { maxBytes: 6000, callerAnswer: [mkLog(7, 0, OTHER)] });
    await expect(scanAll(c, { router: FAKE.router })).rejects.toThrow(/INVALID_LOG/);
  });
});

describe('CHAIN-ADAPTERS-02: a cursor far beyond the reported head fails closed', () => {
  it('refuses to resume past the head (lying or poisoned checkpoint) instead of silently scanning nothing', async () => {
    const c = await client(100, []);
    await expect(fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, cursor: { nextBlock: 1_000_001n, last: { number: 1_000_000n, hash: bh(1_000_000) } } })).rejects.toThrow(/RPC_FAILURE/);
  });
  it('tolerates a provider lagging within finalityDepth', async () => {
    const c = await client(100, []);
    const r = await fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, cursor: { nextBlock: 103n } });
    expect(r.announcements).toHaveLength(0);
    expect(r.cursor.nextBlock).toBe(103n);
  });
});
