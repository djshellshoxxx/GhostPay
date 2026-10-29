import { encodeAbiParameters } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { FAKE, SEPOLIA, payment, recipient } from './fixtures.testutil.js';
import { ANNOUNCEMENT_TOPIC, fetchAnnouncements, rawCallerTopic, type ScanCursor, type ScannedAnnouncement } from './logs.js';
import { createClient, type RpcClient, type RpcLog } from './rpc.js';
import { FakeRpcError, fakeTransport, noSleep } from './rpc.testutil.js';
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

  it('keeps the completed windows when even the router lane of a block is too large, then fails closed there', async () => {
    // Thirteen router announcements in one block: nothing may be skipped, so the scan cannot pass this block.
    const c = await client(1000, Array.from({ length: 13 }, (_, i) => mkLog(7, i)), { maxBytes: 6000 });
    const first = await fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, router: FAKE.router, cursor: { nextBlock: 0n } });
    expect(first).toMatchObject({ truncated: true, cursor: { nextBlock: 7n } });
    await expect(fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, router: FAKE.router, cursor: first.cursor })).rejects.toThrow(/RESPONSE_TOO_LARGE/);
  });

  it('rejects a provider that answers the router-only query with another caller', async () => {
    const spam = Array.from({ length: 13 }, (_, i) => mkLog(7, i, OTHER));
    const c = await client(1000, spam, { maxBytes: 6000, callerAnswer: [mkLog(7, 0, OTHER)] });
    await expect(scanAll(c, { router: FAKE.router })).rejects.toThrow(/INVALID_LOG/);
  });

  it('grows the window back after a narrowed block, so one spam block does not slow the rest of the fetch (A-R2)', async () => {
    const spam = Array.from({ length: 13 }, (_, i) => mkLog(7, i, OTHER));
    const seen: { from: bigint; to: bigint }[] = [];
    const c = await client(5000, [...spam, mkLog(7, 13), mkLog(4000, 0, OTHER)], { maxBytes: 6000, seen });
    const r = await fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, router: FAKE.router, cursor: { nextBlock: 0n } });
    // One fetch reaches the head: after block 7 the window doubles back to the 1,000-block cap.
    expect(r).toMatchObject({ truncated: false, cursor: { nextBlock: 5001n }, routerOnlyBlocks: [7n] });
    expect(r.announcements.map((a) => [a.blockNumber, a.logIndex])).toEqual([[7n, 13], [4000n, 0]]);
    const sizes = seen.filter((w) => w.from > 7n).map((w) => Number(w.to - w.from + 1n));
    expect(sizes).toEqual([2, 4, 8, 16, 32, 64, 128, 256, 512, 1000, 1000, 1000, 971]);
    // Eight requests down to [0, 6], three more down to block 7, its router lane, then the thirteen above.
    expect(seen).toHaveLength(25);
  });

  it('grows the window back past a dense range that overflowed the response cap, also when no single block was refused (A-R2)', async () => {
    // Blocks 25 and 26 each fit in one response, but not together: the window halves to one block there.
    const dense = [25, 26].flatMap((b) => Array.from({ length: 4 }, (_, i) => mkLog(b, i, OTHER)));
    const seen: { from: bigint; to: bigint }[] = [];
    const c = await client(5000, dense, { maxBytes: 6000, seen });
    const r = await fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, router: FAKE.router, cursor: { nextBlock: 0n } });
    expect(r).toMatchObject({ truncated: false, cursor: { nextBlock: 5001n } });
    expect(r.announcements).toHaveLength(8);
    expect(r.routerOnlyBlocks).toBeUndefined();
    // Past block 27, the end of the last range that overflowed, the window doubles back to the cap.
    const sizes = seen.filter((w) => w.from > 27n).map((w) => Number(w.to - w.from + 1n));
    expect(sizes).toEqual([2, 4, 8, 16, 32, 64, 128, 256, 512, 1000, 1000, 1000, 951]);
  });

  it('keeps full-size windows between spam blocks: a spam block every 100 blocks costs a fraction of one-block windows (A-R2)', async () => {
    const logs = Array.from({ length: 200 }, (_, k) => [...Array.from({ length: 13 }, (_, i) => mkLog(100 * k + 50, i, OTHER)), mkLog(100 * k + 50, 13)]).flat();
    const seen: { from: bigint; to: bigint }[] = [];
    const c = await client(19_999, logs, { maxBytes: 6000, seen });
    let fetches = 0;
    let cursor: ScanCursor = { nextBlock: 0n };
    const routerOnly: bigint[] = [];
    const found: ScannedAnnouncement[] = [];
    for (; fetches < 1000; ) {
      fetches++;
      const r = await fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, router: FAKE.router, cursor });
      found.push(...r.announcements);
      routerOnly.push(...(r.routerOnlyBlocks ?? []));
      cursor = r.cursor;
      if (!r.truncated) break;
    }
    expect(cursor.nextBlock).toBe(20_000n);
    expect(routerOnly).toEqual(Array.from({ length: 200 }, (_, k) => BigInt(100 * k + 50)));
    expect(found).toHaveLength(200);
    // One-block windows after each fetch's first spam block needed 201 fetches and 10,001 eth_getLogs calls here.
    expect(fetches).toBeLessThan(80);
    expect(seen.length).toBeLessThan(4000);
  }, 60_000);
});

describe('A-R1: -32005 is also a rate-limit code, so a refused block is asked again before it is narrowed', () => {
  /**
   * Default retries (three attempts per request). The first `burst` eth_getLogs attempts are refused with -32005; after
   * that, a caller-unfiltered query covering `dense` is refused with `denseCode` (a block too large for one response).
   */
  const limited = (logs: RpcLog[], o: { burst?: number; dense?: number; denseCode?: number } = {}) => {
    let refused = 0;
    const filters: (string | null)[][] = [];
    const t = fakeTransport((m, p) => {
      if (m === 'eth_chainId') return '0xaa36a7';
      if (m === 'eth_blockNumber') return '0x3e8';
      if (m === 'eth_getBlockByNumber') return { number: p[0], hash: bh(Number(BigInt(p[0] as string))), parentHash: bh(0) };
      const f = p[0] as { fromBlock: string; toBlock: string; topics: (string | null)[] };
      const from = BigInt(f.fromBlock);
      const to = BigInt(f.toBlock);
      filters.push(f.topics);
      if (refused < (o.burst ?? 0)) {
        refused++;
        throw new FakeRpcError(-32005);
      }
      const caller = f.topics[3];
      if (o.dense !== undefined && caller == null && from <= BigInt(o.dense) && to >= BigInt(o.dense)) throw new FakeRpcError(o.denseCode ?? -32005);
      return logs.filter((l) => BigInt(l.blockNumber) >= from && BigInt(l.blockNumber) <= to && (caller == null || l.topics[3] === caller));
    });
    return { filters, client: createClient(CHAIN, 'https://rpc.example.test', { transport: t, sleep: noSleep }) };
  };
  const fetch = async (c: Promise<RpcClient>, cursor: ScanCursor, extra: { maxRequests?: number } = {}) =>
    fetchAnnouncements({ chain: CHAIN, client: await c, announcer: ANN, router: FAKE.router, cursor, ...extra });
  const direct = mkLog(7, 0, OTHER);
  const routed = mkLog(7, 1);

  it('scans a block whole when the refusals were a rate-limit burst that has ended (no narrowed block)', async () => {
    // 30 refusals: ten requests from 1,000 blocks down to block 7 alone, three attempts each; the router lane then succeeds.
    const { client: c, filters } = limited([direct, routed], { burst: 30 });
    const r = await fetch(c, { nextBlock: 7n });
    expect(r.announcements.map((a) => [a.blockNumber, a.logIndex])).toEqual([[7n, 0], [7n, 1]]);
    expect(r.routerOnlyBlocks).toBeUndefined();
    // Past that block the window grows back, so the same fetch reaches the head (A-R2).
    expect(r).toMatchObject({ truncated: false, cursor: { nextBlock: 1001n } });
    // The whole block was asked again after its router lane.
    expect(filters.slice(30, 32).map((t) => t.length)).toEqual([4, 2]);
  });

  it('narrows a block that is refused again after its router lane was read, as before', async () => {
    const { client: c } = limited([direct, routed], { dense: 7 });
    const r = await fetch(c, { nextBlock: 7n });
    expect(r.announcements.map((a) => [a.blockNumber, a.logIndex])).toEqual([[7n, 1]]);
    expect(r.routerOnlyBlocks).toEqual([7n]);
  });

  it('a rate limit that outlasts the router-lane read ends as an RPC failure, never as a narrowed block', async () => {
    // 33 refusals: the ten requests above plus the router lane's three attempts.
    const { client: c } = limited([direct, routed], { burst: 33 });
    await expect(fetch(c, { nextBlock: 7n })).rejects.toThrow(/RPC_FAILURE: json-rpc error -32005/);
    const later = await fetch(c, { nextBlock: 7n });
    expect(later.announcements).toHaveLength(2);
    expect(later.routerOnlyBlocks).toBeUndefined();
  });

  it('a different refusal of the second whole-block read holds the cursor at that block instead of narrowing it', async () => {
    // -32005 burst on the way down, router lane fine, then the whole block fails with a range-limit code that has no
    // router fallback: nothing was completed yet, so the fetch fails; with completed windows it ends before the block.
    const { client: first } = limited([direct, routed], { burst: 30, dense: 7, denseCode: -32600 });
    await expect(fetch(first, { nextBlock: 7n })).rejects.toThrow(/json-rpc error -32600/);
    let routerAsked = false;
    const t = fakeTransport((m, p) => {
      if (m === 'eth_chainId') return '0xaa36a7';
      if (m === 'eth_blockNumber') return '0x3e8';
      if (m === 'eth_getBlockByNumber') return { number: p[0], hash: bh(Number(BigInt(p[0] as string))), parentHash: bh(0) };
      const f = p[0] as { fromBlock: string; toBlock: string; topics: (string | null)[] };
      const [from, to] = [BigInt(f.fromBlock), BigInt(f.toBlock)];
      if (f.topics[3] != null) {
        routerAsked = true;
        return [routed];
      }
      // Refused with -32005 on the way down; the second whole-block read after the router lane fails another way.
      if (from <= 7n && to >= 7n) throw new FakeRpcError(routerAsked ? -32603 : -32005);
      return [];
    });
    const r = await fetch(createClient(CHAIN, 'https://rpc.example.test', { transport: t, sleep: noSleep, retries: 0 }), { nextBlock: 0n });
    expect(r).toMatchObject({ truncated: true, cursor: { nextBlock: 7n } });
    expect(r.routerOnlyBlocks).toBeUndefined();
    expect(r.announcements).toHaveLength(0);
  });

  it('does not narrow a -32005 block when the request budget has no room to ask the whole block again', async () => {
    // Ten requests reach block 7 alone; the router lane and the second whole-block read need two more.
    const { client: c } = limited([direct, routed], { burst: 30 });
    const r = await fetch(c, { nextBlock: 7n }, { maxRequests: 11 });
    expect(r).toMatchObject({ truncated: true, cursor: { nextBlock: 7n }, announcements: [] });
    expect(r.routerOnlyBlocks).toBeUndefined();
  });
});

describe('A-R7: the window also grows back after a halving that a fixed range limit cannot explain', () => {
  /**
   * Default retries (three attempts per request). The first `burst` eth_getLogs attempts are refused with -32005; after
   * that, a range over `range` blocks is refused with `rangeCode`, and a caller-unfiltered range holding both blocks of a
   * pair (two blocks that fit one response each, but not together) with -32602. `seen` records every attempt.
   */
  const provider = (head: number, logs: RpcLog[], o: { burst?: number; range?: number; rangeCode?: number; pairs?: readonly number[] } = {}) => {
    let refused = 0;
    const seen: { from: bigint; to: bigint; refused: boolean }[] = [];
    const t = fakeTransport((m, p) => {
      if (m === 'eth_chainId') return '0xaa36a7';
      if (m === 'eth_blockNumber') return `0x${head.toString(16)}`;
      if (m === 'eth_getBlockByNumber') return { number: p[0], hash: bh(Number(BigInt(p[0] as string))), parentHash: bh(0) };
      const f = p[0] as { fromBlock: string; toBlock: string; topics: (string | null)[] };
      const [from, to] = [BigInt(f.fromBlock), BigInt(f.toBlock)];
      let code: number | undefined;
      if (refused < (o.burst ?? 0)) {
        refused++;
        code = -32005;
      } else if (o.range !== undefined && to - from + 1n > BigInt(o.range)) {
        code = o.rangeCode ?? -32600;
      } else if (f.topics[3] == null && (o.pairs ?? []).some((b) => from <= BigInt(b) && to > BigInt(b))) {
        code = -32602;
      }
      seen.push({ from, to, refused: code !== undefined });
      if (code !== undefined) throw new FakeRpcError(code);
      return logs.filter((l) => BigInt(l.blockNumber) >= from && BigInt(l.blockNumber) <= to && (f.topics[3] == null || l.topics[3] === f.topics[3]));
    });
    return { seen, client: createClient(CHAIN, 'https://rpc.example.test', { transport: t, sleep: noSleep }) };
  };
  /** Fetches until the head is reached; returns the number of fetches and the final cursor. */
  const scanToHead = async (client: RpcClient) => {
    const found: ScannedAnnouncement[] = [];
    let cursor: ScanCursor = { nextBlock: 0n };
    let fetches = 0;
    for (; fetches < 1000; ) {
      fetches++;
      const r = await fetchAnnouncements({ chain: CHAIN, client, announcer: ANN, router: FAKE.router, cursor });
      expect(r.routerOnlyBlocks).toBeUndefined();
      found.push(...r.announcements);
      cursor = r.cursor;
      if (!r.truncated) break;
    }
    return { found, fetches, cursor };
  };

  it('grows back after a -32005 burst halved the window down to one block, so one fetch still reaches the head', async () => {
    // 27 refusals: nine requests from 1,000 blocks down to [0, 2], three attempts each; the window is then one block.
    const { client: c, seen } = provider(1000, [mkLog(7, 0, OTHER), mkLog(7, 1)], { burst: 27 });
    const r = await fetchAnnouncements({ chain: CHAIN, client: await c, announcer: ANN, router: FAKE.router, cursor: { nextBlock: 0n } });
    // Keeping one-block windows ended this fetch at block 41, after 50 requests.
    expect(r).toMatchObject({ truncated: false, cursor: { nextBlock: 1001n } });
    expect(r.announcements.map((a) => [a.blockNumber, a.logIndex])).toEqual([[7n, 0], [7n, 1]]);
    expect(r.routerOnlyBlocks).toBeUndefined();
    // Past [0, 2], the last refused range, the window doubles back towards the cap.
    expect(seen.filter((w) => !w.refused).map((w) => Number(w.to - w.from + 1n))).toEqual([1, 1, 1, 2, 4, 8, 16, 32, 64, 128, 256, 488]);
    expect(seen).toHaveLength(39);
  });

  it('grows back past a -32602 refusal of a range no larger than one already served: dense pairs every 100 blocks', async () => {
    const pairs = Array.from({ length: 200 }, (_, k) => 100 * k + 50);
    const { client: c, seen } = provider(19_999, pairs.flatMap((b) => [mkLog(b), mkLog(b + 1)]), { pairs });
    const { found, fetches, cursor } = await scanToHead(await c);
    expect(cursor.nextBlock).toBe(20_000n);
    expect(found).toHaveLength(400);
    // Keeping the window after each -32602 halving needed 118 fetches and 5,863 eth_getLogs calls here.
    expect(fetches).toBe(51);
    expect(seen).toHaveLength(2517);
  }, 60_000);

  it('keeps the size after a halving a fixed range limit explains, so the limit costs no refused request per window', async () => {
    // A ten-block range limit coded -32005: each fetch halves 1,000 blocks down to seven (seven refused requests, three
    // attempts each), then reads seven-block windows only.
    const { client: c, seen } = provider(5000, [], { range: 10, rangeCode: -32005 });
    const { fetches, cursor } = await scanToHead(await c);
    expect(cursor.nextBlock).toBe(5001n);
    expect(fetches).toBe(17);
    expect(seen.filter((w) => w.refused)).toHaveLength(17 * 7 * 3);
    expect(seen.every((w) => w.refused || w.to - w.from + 1n <= 7n)).toBe(true);
    expect(seen).toHaveLength(1072);
  }, 60_000);
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
