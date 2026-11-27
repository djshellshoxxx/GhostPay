// Seeded stress of fetchAnnouncements' window halving, router-only fallback and truncation (#744 added HTTP 413 to the
// range/size-limit classes). Every scenario is derived from a fixed seed by the local PRNG below: the same seed always
// builds the same chain, the same provider limits and the same fault pattern. Synthetic chain only, no network.
//
// Invariants per call: only typed errors; a truncated fetch never claims the end (so a caller's `caughtUp` stays false);
// a fetch that ends untruncated reaches the end of its range; the cursor never moves back and each non-throwing call
// makes progress; the cursor's block hash is the canonical one. Over a whole drain (retrying transient faults): no
// announcement is silently dropped (a block narrowed to the router lane is the only allowed gap, and is reported), no
// duplicates, and the same seed gives the identical result.
import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, getAddress } from 'viem/utils';
import { ChainAdapterError } from './errors.js';
import { FAKE, SEPOLIA, payment, recipient } from './fixtures.testutil.js';
import { ANNOUNCEMENT_TOPIC, fetchAnnouncements, type ScanCursor, type ScannedAnnouncement } from './logs.js';
import type { BlockRef, LogFilter, RpcClient, RpcLog } from './rpc.js';
import type { Hex } from './types.js';

/** mulberry32: tiny, fixed, dependency-free. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = () => number;
const int = (r: Rand, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[int(r, 0, xs.length - 1)] as T;

const ANN = FAKE.announcer;
const OTHER_CALLER = getAddress('0x0000000000000000000000000000000000000e55');
const word = (a: string): Hex => `0x${a.replace('0x', '').toLowerCase().padStart(64, '0')}`;
const bh = (n: number, fork = 0): Hex => `0x${(n + 1000 * fork + 1).toString(16).padStart(64, '0')}`;
const { meta } = recipient();
const PAY = payment(meta);
const eph = `0x${Buffer.from(PAY.ephemeralPublicKey).toString('hex')}` as Hex;
const DATA = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [eph, `0x${'ab'}${'00'.repeat(56)}` as Hex]);
/** A 10-block window halves to one block in 3 refusals; with the router lane and its recheck that is 6 requests. */
const STALL_BELOW = 7;
const CHAIN = { ...SEPOLIA, getLogsMaxRange: 10, finalityDepth: 5 };

interface TruthLog { readonly block: number; readonly index: number; readonly router: boolean }
const idOf = (l: TruthLog): string => `${bh(l.block)}:${String(l.index)}`;
function rpcLog(l: TruthLog): RpcLog {
  return {
    address: ANN,
    topics: [ANNOUNCEMENT_TOPIC, word('0x1'), word(PAY.stealthAddress), word(l.router ? FAKE.router : OTHER_CALLER)],
    data: DATA,
    blockNumber: `0x${l.block.toString(16)}`,
    blockHash: bh(l.block),
    logIndex: `0x${l.index.toString(16)}`,
  };
}

const LIMIT_MESSAGES = [
  'http status 413', 'json-rpc error -32602', 'json-rpc error -32005', 'json-rpc error -32600',
  'json-rpc error -32614', 'json-rpc error -32000',
] as const;
const refusal = (style: number): ChainAdapterError => style < 0
  ? new ChainAdapterError('RESPONSE_TOO_LARGE', 'response exceeds cap')
  : new ChainAdapterError('RPC_FAILURE', LIMIT_MESSAGES[style] as string);
const transient = (): ChainAdapterError => new ChainAdapterError('RPC_FAILURE', 'transport error or timeout');

interface Scenario {
  readonly maxHead: number;
  readonly growth: boolean;
  readonly logs: readonly TruthLog[];
  /** Largest `toBlock - fromBlock + 1` the provider serves (a fixed range limit). */
  readonly providerRange: number;
  /** Most logs one full response may hold before the provider refuses it (announcer spam). */
  readonly responseLimit: number;
  readonly style: number;
  readonly faultRate: number;
  readonly hostile: boolean;
  readonly maxRequests: number;
  readonly maxLogs: number;
  readonly useRouter: boolean;
  readonly seed: number;
}

function scenario(seed: number): Scenario {
  const r = prng(seed);
  const maxHead = int(r, 0, 90);
  const logs: TruthLog[] = [];
  const dense = int(r, 0, 3) === 0;
  for (let block = 0; block <= maxHead; block++) {
    if (r() < (dense ? 0.45 : 0.12)) {
      const n = int(r, 1, dense ? 7 : 3);
      for (let index = 0; index < n; index++) logs.push({ block, index, router: r() < 0.5 });
    }
  }
  const responseLimit = int(r, 2, 8);
  return {
    maxHead, growth: int(r, 0, 2) === 0, logs, providerRange: int(r, 1, 12), responseLimit, style: int(r, -1, LIMIT_MESSAGES.length - 1),
    faultRate: pick(r, [0, 0, 0.05, 0.15]), hostile: int(r, 0, 5) === 0, maxRequests: int(r, 3, 50),
    maxLogs: pick(r, [3, 7, 40, 10_000]), useRouter: int(r, 0, 3) !== 0, seed,
  };
}

interface Harness { readonly client: RpcClient; readonly head: () => number; readonly calls: () => number }
/** Router-lane responses beyond `responseLimit` are never produced here: the cap is on a whole block's router logs. */
function harness(s: Scenario): Harness {
  const r = prng(s.seed ^ 0x9e3779b9);
  let head = s.growth ? int(r, 0, s.maxHead) : s.maxHead;
  let calls = 0;
  const fault = (): void => { calls++; if (s.faultRate > 0 && r() < s.faultRate) throw transient(); };
  const hostile = (log: RpcLog): RpcLog => {
    switch (int(r, 0, 5)) {
      case 0: return { ...log, address: OTHER_CALLER };
      case 1: return { ...log, removed: true };
      case 2: return { ...log, blockNumber: '0xfffff' };
      case 3: return { ...log, topics: [log.topics[0] as string] };
      case 4: return null as unknown as RpcLog;
      default: return { ...log, blockHash: bh(Number(BigInt(log.blockNumber)), 7) };
    }
  };
  const client: RpcClient = {
    chainId: CHAIN.chainId,
    request: () => Promise.resolve(null),
    blockNumber: () => {
      fault();
      if (s.growth && head < s.maxHead && r() < 0.6) head = Math.min(s.maxHead, head + int(r, 1, 6));
      return Promise.resolve(BigInt(head));
    },
    getBlock: (n: bigint) => {
      fault();
      if (n > BigInt(head)) return Promise.resolve(null);
      const num = Number(n);
      const ref: BlockRef = { number: n, hash: bh(num), parentHash: bh(Math.max(0, num - 1)), timestamp: BigInt(num + 100) };
      return Promise.resolve(ref);
    },
    getLogs: (f: LogFilter) => {
      fault();
      const from = Number(f.fromBlock);
      const to = Number(f.toBlock);
      if (to > head) return Promise.reject(new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32602'));
      if (to - from + 1 > s.providerRange) return Promise.reject(refusal(s.style));
      const routerLane = f.topics[3] !== undefined && f.topics[3] !== null;
      const hits = s.logs.filter((l) => l.block >= from && l.block <= to && (!routerLane || l.router));
      // The cap is per whole response; a router lane of one block is assumed to fit (see header).
      if (!routerLane && hits.length > s.responseLimit) return Promise.reject(refusal(s.style));
      if (routerLane && hits.length > s.responseLimit * 4) return Promise.reject(refusal(s.style));
      let out = hits.map(rpcLog);
      if (s.hostile && out.length > 0 && r() < 0.5) {
        const at = int(r, 0, out.length - 1);
        out = out.map((l, i) => (i === at ? hostile(l) : l));
      }
      return Promise.resolve(out);
    },
  };
  return { client, head: () => head, calls: () => calls };
}

interface Drain {
  readonly ids: string[];
  readonly routerOnly: number[];
  readonly cursors: string[];
  readonly errors: string[];
  readonly truncations: number;
  readonly done: boolean;
  readonly requestsPerCall: number[];
  readonly stalled: boolean;
}

async function drain(s: Scenario): Promise<Drain> {
  const h = harness(s);
  const ids: string[] = [];
  const routerOnly: number[] = [];
  const cursors: string[] = [];
  const errors: string[] = [];
  const requestsPerCall: number[] = [];
  let truncations = 0;
  let cursor: ScanCursor = { nextBlock: 0n };
  let done = false;
  let stalled = false;
  for (let call = 0; call < 600 && !done; call++) {
    const before = cursor;
    const callsBefore = h.calls();
    let res;
    try {
      res = await fetchAnnouncements({
        chain: CHAIN, client: h.client, announcer: ANN, cursor, maxRequests: s.maxRequests, maxLogs: s.maxLogs,
        ...(s.useRouter ? { router: FAKE.router } : {}),
      });
    } catch (e) {
      // Only typed errors, and only the failure classes this scenario can produce.
      expect(e).toBeInstanceOf(ChainAdapterError);
      const code = (e as ChainAdapterError).code;
      expect(['RPC_FAILURE', 'INVALID_LOG', 'RESPONSE_TOO_LARGE']).toContain(code);
      if (!s.hostile) expect(code).not.toBe('INVALID_LOG');
      errors.push(`${code}:${(e as Error).message}`);
      continue;
    }
    requestsPerCall.push(h.calls() - callsBefore);
    const end = Number(res.head);
    expect(res.head).toBeLessThanOrEqual(BigInt(s.maxHead));
    // Never moves back, and a call that scanned something made progress.
    expect(res.cursor.nextBlock).toBeGreaterThanOrEqual(before.nextBlock);
    if (before.nextBlock <= BigInt(end) && res.cursor.nextBlock === before.nextBlock) {
      // Only a request budget smaller than one full halving of the window (plus the router lane) can stall: it must say so.
      expect(res.truncated).toBe(true);
      expect(s.maxRequests).toBeLessThan(STALL_BELOW);
      stalled = true;
      break;
    }
    if (res.truncated) {
      // A truncated fetch stopped short of the range end: a caller must not call that caught up.
      expect(res.cursor.nextBlock).toBeLessThanOrEqual(BigInt(end));
      truncations++;
    } else {
      expect(res.cursor.nextBlock).toBeGreaterThan(BigInt(end));
    }
    if (res.cursor.last !== undefined) {
      expect(res.cursor.last.number).toBe(res.cursor.nextBlock - 1n);
      expect(res.cursor.last.hash).toBe(bh(Number(res.cursor.last.number)));
    }
    for (const a of res.announcements as readonly ScannedAnnouncement[]) {
      expect(a.blockNumber).toBeGreaterThanOrEqual(before.nextBlock);
      expect(a.blockNumber).toBeLessThan(res.cursor.nextBlock);
      ids.push(a.id);
    }
    for (const b of res.routerOnlyBlocks ?? []) routerOnly.push(Number(b));
    cursors.push(res.cursor.nextBlock.toString());
    cursor = res.cursor;
    done = !res.truncated && cursor.nextBlock > BigInt(s.maxHead);
    if (!done && !res.truncated && !s.growth) throw new Error('untruncated fetch before the end of a fixed chain');
  }
  return { ids, routerOnly, cursors, errors, truncations, done, requestsPerCall, stalled };
}

const SEEDS = [11, 2026, 424242];
const PER_SEED = 70;

describe('fetchAnnouncements seeded stress (window halving, 413, router lane, truncation)', () => {
  for (const base of SEEDS) {
    it(`seed ${String(base)}: ${String(PER_SEED)} scenarios keep coverage, cursor and caught-up invariants`, async () => {
      let drained = 0;
      let narrowed = 0;
      let truncated = 0;
      let faulted = 0;
      let stalls = 0;
      for (let i = 0; i < PER_SEED; i++) {
        const s = scenario(base * 1000 + i);
        const d = await drain(s);
        if (s.hostile) continue; // Hostile providers may never let a drain finish; typed errors were asserted above.
        if (d.stalled) { stalls++; continue; }
        if (!d.done) {
          // An honest provider can still be unable to serve a block (a router lane over its cap, or `maxLogs` below one
          // block's accepted logs): the scan must then have failed with a typed error, never skipped past it.
          expect(d.errors.length).toBeGreaterThan(0);
          continue;
        }
        drained++;
        if (d.routerOnly.length > 0) narrowed++;
        if (d.truncations > 0) truncated++;
        if (d.errors.length > 0) faulted++;
        // No duplicates and nothing dropped, except non-router announcements of blocks reported as router-only.
        expect(new Set(d.ids).size).toBe(d.ids.length);
        const narrowedBlocks = new Set(d.routerOnly);
        const expected = s.logs.filter((l) => !narrowedBlocks.has(l.block) || l.router).map(idOf).sort();
        expect([...d.ids].sort(), `scenario seed ${String(s.seed)}`).toEqual(expected);
        // Router-only is reported only when a router was given, and only for blocks that really exceeded the cap.
        if (!s.useRouter) expect(d.routerOnly).toEqual([]);
        for (const b of narrowedBlocks) expect(s.logs.filter((l) => l.block === b).length).toBeGreaterThan(1);
        // Cursors saved by an uninterrupted drain never move back.
        for (let k = 1; k < d.cursors.length; k++) expect(BigInt(d.cursors[k] as string)).toBeGreaterThanOrEqual(BigInt(d.cursors[k - 1] as string));
      }
      // The scenario mix actually exercises the paths under test.
      expect(drained).toBeGreaterThan(PER_SEED / 3);
      expect(narrowed + truncated + faulted).toBeGreaterThan(0);
      expect(stalls).toBeLessThanOrEqual(PER_SEED / 4);
    });
  }

  it('is deterministic: the same seed gives the identical drain', async () => {
    for (const seed of [5, 77, 31337, 99991, 123456]) {
      const s = scenario(seed);
      const a = await drain(s);
      const b = await drain(s);
      expect(b).toEqual(a);
    }
  });

  it('classifies HTTP 413 like the JSON-RPC size limits: the same chain drains to the same announcements', async () => {
    for (let i = 0; i < 40; i++) {
      const base = scenario(777_000 + i);
      const clean = { ...base, faultRate: 0, hostile: false, growth: false, useRouter: true, maxRequests: 50, maxLogs: 10_000 };
      const outcomes: string[] = [];
      for (const style of [0, 1, 2]) {
        const d = await drain({ ...clean, style });
        outcomes.push(JSON.stringify({ ids: [...d.ids].sort(), routerOnly: d.routerOnly, done: d.done, errors: d.errors.map((e) => e.replace(/\d+/g, '#')) }));
      }
      // 413, -32602 and -32005 are all "ask for less": nothing but the refusal text differs.
      expect(outcomes[0]).toBe(outcomes[1]);
      if (JSON.parse(outcomes[0] as string).errors.length === 0) expect(outcomes[0]).toBe(outcomes[2]);
    }
  });

  it('a provider that refuses with a non-limit HTTP status is never narrowed around', async () => {
    const s = { ...scenario(31), faultRate: 0, hostile: false, growth: false, providerRange: 1, maxHead: 40 };
    const h = harness(s);
    const client: RpcClient = {
      ...h.client,
      getLogs: () => Promise.reject(new ChainAdapterError('RPC_FAILURE', 'http status 4130')),
    };
    await expect(fetchAnnouncements({ chain: CHAIN, client, announcer: ANN, cursor: { nextBlock: 0n }, router: FAKE.router })).rejects.toThrow(/4130/);
  });
});
