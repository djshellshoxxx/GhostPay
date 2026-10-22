import { generateKeySet } from '@ghostpay/core-crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEvmAdapter } from './adapter.js';
import { loadDeployment, validateManifest } from './deployments.js';
import { MAX_ROUTER_GROSS, grossForNet, routerNet, sponsorFee, assertSponsorFeeAcceptable } from './fees.js';
import { FAKE, SEPOLIA, manifestJson, payment, recipient } from './fixtures.testutil.js';
import { ANNOUNCEMENT_TOPIC, fetchAnnouncements, type ScanCursor } from './logs.js';
import { createClient, fetchTransport } from './rpc.js';
import { FakeRpcError, fakeTransport, noSleep } from './rpc.testutil.js';
import { encodeAbiParameters } from 'viem/utils';
import type { Hex } from './types.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const bh = (n: number, fork = 0): Hex => `0x${(n + 1000 * fork).toString(16).padStart(64, '0')}`;
const word = (a: string): Hex => `0x${a.replace('0x', '').toLowerCase().padStart(64, '0')}`;
const { meta } = recipient();
const PAY = payment(meta);
const ephHex = (): Hex => `0x${Buffer.from(PAY.ephemeralPublicKey).toString('hex')}`;
const logAt = (block: number): Record<string, unknown> => ({
  address: FAKE.announcer,
  topics: [ANNOUNCEMENT_TOPIC, word('0x1'), word(PAY.stealthAddress), word(FAKE.router)],
  data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [ephHex(), `0x${'ab'}${'00'.repeat(56)}`]),
  blockNumber: `0x${block.toString(16)}`,
  blockHash: bh(block),
  logIndex: '0x0',
});

interface Sim {
  head: number;
  forkFrom: number; // blocks >= forkFrom use fork hashes once `fork` is true
  fork: boolean;
  logs: Record<string, unknown>[];
  ranges: { from: number; to: number }[];
  onGetLogs?: (n: number) => void;
  providerMax?: number;
}
async function simClient(sim: Sim) {
  const t = fakeTransport((m, p) => {
    if (m === 'eth_chainId') return '0xaa36a7';
    if (m === 'eth_blockNumber') return `0x${sim.head.toString(16)}`;
    if (m === 'eth_getBlockByNumber') {
      const n = Number(BigInt(p[0] as string));
      if (n > sim.head) return null;
      return { number: p[0], hash: bh(n, sim.fork && n >= sim.forkFrom ? 1 : 0), parentHash: bh(Math.max(0, n - 1)) };
    }
    if (m === 'eth_getLogs') {
      const f = p[0] as { fromBlock: string; toBlock: string };
      const from = Number(BigInt(f.fromBlock));
      const to = Number(BigInt(f.toBlock));
      sim.ranges.push({ from, to });
      if (sim.providerMax !== undefined && to - from + 1 > sim.providerMax) throw new FakeRpcError(-32005);
      const res = sim.logs.filter((l) => Number(BigInt(l['blockNumber'] as string)) >= from && Number(BigInt(l['blockNumber'] as string)) <= to);
      sim.onGetLogs?.(sim.ranges.length);
      return res;
    }
    return null;
  });
  return createClient(SEPOLIA, 'https://rpc.example.test', { transport: t, sleep: noSleep, retries: 0 });
}
const CHAIN10 = { ...SEPOLIA, getLogsMaxRange: 10, finalityDepth: 5 };
const run = async (sim: Sim, extra: Record<string, unknown> = {}, cursor: ScanCursor = { nextBlock: 0n }) =>
  fetchAnnouncements({ chain: CHAIN10, client: await simClient(sim), announcer: FAKE.announcer, cursor, ...extra });

describe('C1 fetchAnnouncements toBlock', () => {
  it('never requests logs above toBlock', async () => {
    const sim: Sim = { head: 100, forkFrom: 0, fork: false, logs: [logAt(3), logAt(12), logAt(40)], ranges: [] };
    const r = await run(sim, { toBlock: 12n });
    expect(sim.ranges).toEqual([{ from: 0, to: 9 }, { from: 10, to: 12 }]);
    expect(r.announcements.map((a) => a.blockNumber)).toEqual([3n, 12n]);
    expect(r.cursor.nextBlock).toBe(13n);
    expect(r.truncated).toBe(false);
  });
  it('toBlock above head or below nextBlock is harmless', async () => {
    const above: Sim = { head: 15, forkFrom: 0, fork: false, logs: [], ranges: [] };
    expect((await run(above, { toBlock: 500n })).cursor.nextBlock).toBe(16n);
    const below: Sim = { head: 15, forkFrom: 0, fork: false, logs: [], ranges: [] };
    const r = await run(below, { toBlock: 3n }, { nextBlock: 10n });
    expect(below.ranges).toEqual([]);
    expect(r.cursor).toEqual({ nextBlock: 10n });
  });
});

describe('C2 BUG-01 reorg inside a truncated multi-request scan', () => {
  it('reorg of window 1 after it was read is reported, results dropped, cursor rewound', async () => {
    const sim: Sim = { head: 30, forkFrom: 5, fork: false, logs: [logAt(5)], ranges: [] };
    sim.onGetLogs = (n) => { if (n === 1) sim.fork = true; };
    const r = await run(sim, { maxRequests: 2 });
    expect(r.reorg).toEqual({ rolledBackTo: 0n });
    expect(r.announcements).toEqual([]);
    expect(r.cursor).toEqual({ nextBlock: 0n });
    expect(r.truncated).toBe(true);
  });
  it('reorg of window 2 keeps window 1 results and anchors the cursor on window 1', async () => {
    const sim: Sim = { head: 30, forkFrom: 12, fork: false, logs: [logAt(5), logAt(12)], ranges: [] };
    sim.onGetLogs = (n) => { if (n === 2) sim.fork = true; };
    const r = await run(sim, { maxRequests: 2 });
    expect(r.reorg).toEqual({ rolledBackTo: 10n });
    expect(r.announcements.map((a) => a.blockNumber)).toEqual([5n]);
    expect(r.cursor).toEqual({ nextBlock: 10n, last: { number: 9n, hash: bh(9) } });
  });
  it('a stable chain still returns no reorg across windows', async () => {
    const sim: Sim = { head: 30, forkFrom: 0, fork: false, logs: [logAt(5)], ranges: [] };
    const r = await run(sim, { maxRequests: 2 });
    expect(r.reorg).toBeUndefined();
    expect(r.cursor).toEqual({ nextBlock: 20n, last: { number: 19n, hash: bh(19) } });
  });
  it('halved windows do not leave stale boundaries behind', async () => {
    const sim: Sim = { head: 9, forkFrom: 0, fork: false, logs: [logAt(5)], ranges: [], providerMax: 3 };
    const r = await run(sim);
    expect(r.reorg).toBeUndefined();
    expect(r.announcements).toHaveLength(1);
    expect(r.cursor).toEqual({ nextBlock: 10n, last: { number: 9n, hash: bh(9) } });
  });
});

describe('M-01 adapter.scan across pages', () => {
  const mkAdapter = async (state: { flipAfter: number; calls: number }) => {
    const deployment = validateManifest(manifestJson(), 11155111);
    const client = await createClient(SEPOLIA, 'https://rpc.example.test', {
      sleep: noSleep,
      retries: 0,
      transport: fakeTransport((m, p) => {
        if (m === 'eth_chainId') return '0xaa36a7';
        if (m === 'eth_blockNumber') return '0xea60'; // 60 000
        if (m === 'eth_getBlockByNumber') {
          const n = Number(BigInt(p[0] as string));
          if (n === 49_999) state.calls++;
          const flipped = n === 49_999 && state.calls > state.flipAfter;
          return { number: p[0], hash: flipped ? bh(n, 1) : bh(n), parentHash: bh(0) };
        }
        return [];
      }),
    });
    return createEvmAdapter({ chain: SEPOLIA, deployment, client });
  };
  const keys = generateKeySet();
  const cap = { viewingSecret: keys.viewingSecret, spendingPublicKey: keys.spendingPublicKey };
  const drain = async (a: Awaited<ReturnType<typeof mkAdapter>>, range: { fromBlock: bigint; toBlock?: bigint }) => {
    let n = 0;
    for await (const p of a.scan(range, cap, new AbortController().signal)) n += p ? 1 : 0;
    return n;
  };
  it('throws (fail closed) when page 2 finds that page 1 was reorged', async () => {
    const a = await mkAdapter({ flipAfter: 2, calls: 0 });
    await expect(drain(a, { fromBlock: 0n })).rejects.toThrow(/reorganised/);
  });
  it('does not throw on a stable chain', async () => {
    const a = await mkAdapter({ flipAfter: 1e9, calls: 0 });
    expect(await drain(a, { fromBlock: 0n })).toBe(0);
  });
  it('L-01: scan({toBlock}) issues requests only up to toBlock', async () => {
    const seen: number[] = [];
    const deployment = validateManifest(manifestJson(), 11155111);
    const client = await createClient(SEPOLIA, 'https://rpc.example.test', {
      sleep: noSleep,
      retries: 0,
      transport: fakeTransport((m, p) => {
        if (m === 'eth_chainId') return '0xaa36a7';
        if (m === 'eth_blockNumber') return '0xea60';
        if (m === 'eth_getBlockByNumber') return { number: p[0], hash: bh(Number(BigInt(p[0] as string))), parentHash: bh(0) };
        seen.push(Number(BigInt((p[0] as { toBlock: string }).toBlock)));
        return [];
      }),
    });
    const a = createEvmAdapter({ chain: SEPOLIA, deployment, client });
    await drain(a, { fromBlock: 0n, toBlock: 5n });
    expect(seen).toEqual([5]);
  });
});

describe('C3/C4/C7 rpc', () => {
  const node = fakeTransport((m) => (m === 'eth_chainId' ? '0xaa36a7' : null));
  it.each([
    [{ retries: Number.NaN }],
    [{ retries: Infinity }],
    [{ timeoutMs: Number.NaN }],
    [{ timeoutMs: 0 }],
    [{ timeoutMs: Infinity }],
    [{ maxResponseBytes: Number.NaN }],
    [{ maxResponseBytes: 0 }],
    [{ baseDelayMs: Number.NaN }],
    [{ baseDelayMs: -1 }],
    [{ baseDelayMs: Infinity }],
  ])('createClient rejects non-finite / non-positive option %j', async (o) => {
    await expect(createClient(SEPOLIA, 'https://rpc.example.test', { transport: node, ...o })).rejects.toThrow(/INVALID_INPUT/);
  });
  it('retries: NaN no longer loops forever; fractional retries are floored', async () => {
    let n = 0;
    const failing = { send: () => { n++; return Promise.reject(new Error('down')); } };
    await expect(createClient(SEPOLIA, 'https://rpc.example.test', { transport: failing, sleep: noSleep, retries: 1.9 })).rejects.toThrow();
    expect(n).toBe(2);
  });
  it('C7: a non-2xx response body is cancelled', async () => {
    const cancel = vi.fn(() => Promise.resolve());
    const body = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(4)); }, cancel });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(body, { status: 503 }))));
    await expect(fetchTransport.send('https://x.test', '{}', { timeoutMs: 1000, maxBytes: 100 })).rejects.toMatchObject({ status: 503 });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('C5 deployments', () => {
  const text = (over: Record<string, unknown> = {}): string => JSON.stringify({ ...manifestJson(), ...over });
  it('rejects impossible calendar dates, accepts real ones', () => {
    for (const d of ['2026-02-30T00:00:00Z', '2026-04-31T00:00:00Z', '2025-02-29T00:00:00Z', '2026-13-01T00:00:00Z', '2026-01-01T24:00:00Z']) {
      expect(() => loadDeployment(text({ date: d }), 11155111), d).toThrow(/INVALID_MANIFEST/);
    }
    for (const d of ['2024-02-29T12:00:00Z', '2026-12-31T23:59:59+02:00', '2026-01-01T00:00:00.123Z']) {
      expect(loadDeployment(text({ date: d }), 11155111).date).toBe(d);
    }
  });
  it('rejects duplicate keys (top level, nested, escaped) and accepts normal manifests', () => {
    const base = text();
    expect(loadDeployment(base, 11155111).chainId).toBe(11155111);
    expect(() => loadDeployment(base.replace('{', '{"feeBps":26,'), 11155111)).toThrow(/duplicate key/);
    expect(() => loadDeployment(base.replace('"deployTx":{', '"deployTx":{"router":"0x1",'), 11155111)).toThrow(/duplicate key/);
    expect(() => loadDeployment(base.replace('{', '{"chain\\u0049d":1,'), 11155111)).toThrow(/duplicate key/);
    expect(() => loadDeployment(text({ solcVersion: 'a"b\\' }), 11155111)).toThrow(/INVALID_MANIFEST: solcVersion/);
    // same key in sibling objects and key text inside string values is fine
    expect(loadDeployment(text({ commit: 'a'.repeat(40) }), 11155111).commit).toBe('a'.repeat(40));
  });
});

describe('C6 grossForNet top of range', () => {
  it('handles net = routerNet(MAX_ROUTER_GROSS) and rejects one above', () => {
    const top = routerNet(MAX_ROUTER_GROSS);
    const g = grossForNet(top);
    expect(g <= MAX_ROUTER_GROSS).toBe(true);
    expect(routerNet(g)).toBeGreaterThanOrEqual(top);
    expect(() => grossForNet(top + 1n)).toThrow(/net too large/);
    expect(() => grossForNet((1n << 256n) - 1n)).toThrow(/net too large/);
  });
});

describe('C8 sponsorFee small amounts (behaviour pinned: rounding is the published policy)', () => {
  it('cap rounds down: fee is 0 for amounts below 34 and 1 from 34', () => {
    expect(sponsorFee(33n, 1n)).toEqual({ fee: 0n, net: 33n, capped: true });
    expect(sponsorFee(34n, 1n).fee).toBe(1n);
    expect(() => assertSponsorFeeAcceptable(33n, 0n)).not.toThrow();
  });
});
