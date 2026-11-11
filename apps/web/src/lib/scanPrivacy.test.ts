import { ANNOUNCEMENT_TOPIC, CHAINS, ChainAdapterError, fetchAnnouncements, type Address, type RpcLog } from '@ghostpay/chain-adapters';
import { encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import { FAKE_ANNOUNCER, FAKE_ROUTER } from '../test/fakeManifest';
import { makeLog } from '../test/announcements';
import { mockRpc, type MockRpc } from '../test/mockRpc';
import {
  DEFAULT_SCAN_PRIVACY,
  applyParanoidPreset,
  checkIndexerUrl,
  checkScanEndpoint,
  createIndexerScanClient,
  createWindowedScanClient,
  describeScanDisclosure,
  loadScanPrivacy,
  planScan,
  saveScanPrivacy,
  type ScanPrivacySettings,
} from './scanPrivacy';

const chain = CHAINS.find((c) => c.chainId === 84532)!;
const blockHash = (n: number | bigint): `0x${string}` => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const SCHEME_TOPIC = `0x${'1'.padStart(64, '0')}`;
const OTHER = '0x9999999999999999999999999999999999999999' as Address;

function fakeChain(head: number, logs: readonly RpcLog[], opts: { tooBigAbove?: number; forge?: RpcLog } = {}): MockRpc {
  return mockRpc(84532, (method, params) => {
    if (method === 'eth_blockNumber') return `0x${head.toString(16)}`;
    if (method === 'eth_getBlockByNumber') {
      const n = BigInt(params[0] as bigint);
      return n > BigInt(head) ? null : { hash: blockHash(n), parentHash: blockHash(n === 0n ? 0n : n - 1n) };
    }
    if (method === 'eth_getLogs') {
      const f = params[0] as { fromBlock: bigint; toBlock: bigint };
      if (opts.tooBigAbove !== undefined && f.toBlock - f.fromBlock + 1n > BigInt(opts.tooBigAbove)) throw new ChainAdapterError('RESPONSE_TOO_LARGE', 'response exceeds cap');
      const hits = logs.filter((l) => BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock);
      return opts.forge === undefined ? hits : [...hits, opts.forge];
    }
    throw new Error(`unexpected ${method}`);
  });
}

const logFilters = (rpc: MockRpc) => rpc.calls.filter((c) => c.method === 'eth_getLogs').map((c) => c.params[0] as { address: string; topics: readonly string[]; fromBlock: bigint; toBlock: bigint });

/** Deterministic "CSPRNG" for ordering tests: every draw returns the same word. */
const fixedCrypto = (word: number) => ({ getRandomValues: <T extends ArrayBufferView | null>(a: T): T => { if (a !== null) new Uint32Array(a.buffer, a.byteOffset, a.byteLength / 4).fill(word); return a; } });

function windowed(inner: MockRpc, over: Partial<{ windowBlocks: number; jitterMs: readonly [number, number] }> = {}, sleeps: number[] = [], crypto = fixedCrypto(0)) {
  return createWindowedScanClient(inner, {
    chain,
    announcer: FAKE_ANNOUNCER,
    policy: { windowBlocks: over.windowBlocks ?? 1000, jitterMs: over.jitterMs ?? [0, 0] },
    sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); },
    cryptoApi: crypto,
  });
}

describe('createWindowedScanClient', () => {
  it('only ever asks for whole grid-aligned windows and discards out-of-range logs locally', async () => {
    const meta = encodeMetaAddress(generateKeySet());
    const logs = [10, 990, 1005, 1999, 2400].map((b, i) => makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: b, index: i, caller: OTHER }).log);
    const inner = fakeChain(5000, logs);
    const c = windowed(inner);
    const got = await c.getLogs({ address: FAKE_ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC, SCHEME_TOPIC as `0x${string}`], fromBlock: 995n, toBlock: 1500n });
    expect(got.map((l) => Number(BigInt(l.blockNumber)))).toEqual([1005]);
    const asked = logFilters(inner).map((f) => [f.fromBlock, f.toBlock]);
    expect(asked.sort((a, b) => Number(a[0]! - b[0]!))).toEqual([[0n, 999n], [1000n, 1999n]]);
    for (const f of logFilters(inner)) {
      expect(f.fromBlock % 1000n).toBe(0n);
      expect((f.toBlock + 1n) % 1000n).toBe(0n);
    }
  });

  it('sends only announcer address, event topic and the public scheme topic (outgoing-request audit)', async () => {
    const keys = generateKeySet();
    const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(keys), block: 1500, index: 0, caller: OTHER });
    const inner = fakeChain(3000, [mine.log]);
    const r = await fetchAnnouncements({ chain, client: windowed(inner), announcer: FAKE_ANNOUNCER, cursor: { nextBlock: 1234n } });
    expect(r.announcements).toHaveLength(1);
    const body = JSON.stringify(inner.calls, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)).toLowerCase();
    expect(body).not.toContain(mine.stealthAddress.slice(2).toLowerCase());
    expect(body).not.toContain(Buffer.from(keys.spendingPublicKey).toString('hex'));
    for (const f of logFilters(inner)) {
      expect(Object.keys(f).sort()).toEqual(['address', 'fromBlock', 'toBlock', 'topics']);
      expect(f.address).toBe(FAKE_ANNOUNCER);
      expect(f.topics).toEqual([ANNOUNCEMENT_TOPIC, SCHEME_TOPIC]);
    }
    await expect(windowed(inner).getLogs({ address: FAKE_ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC, SCHEME_TOPIC as `0x${string}`, `0x${mine.stealthAddress.slice(2).padStart(64, '0')}`], fromBlock: 0n, toBlock: 10n })).rejects.toThrow(/scan filter/);
  });

  it('passes non-announcement queries through unchanged (payment verification keeps its existing disclosure)', async () => {
    const inner = fakeChain(3000, []);
    const token = '0x036cbd53842c5426634e7929541ec2318f3dcf7e' as Address;
    await windowed(inner).getLogs({ address: token, topics: [ANNOUNCEMENT_TOPIC], fromBlock: 7n, toBlock: 8n });
    expect(logFilters(inner)).toEqual([{ address: token, topics: [ANNOUNCEMENT_TOPIC], fromBlock: 7n, toBlock: 8n }]);
  });

  it('fetches several windows in a CSPRNG-shuffled order with bounded jitter between requests, results sorted', async () => {
    const meta = encodeMetaAddress(generateKeySet());
    const logs = [100, 1100, 2100].map((b, i) => makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: b, index: i, caller: OTHER }).log);
    const inner = fakeChain(9000, logs);
    const sleeps: number[] = [];
    const c = windowed(inner, { jitterMs: [200, 900] }, sleeps, fixedCrypto(7));
    const got = await c.getLogs({ address: FAKE_ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC, SCHEME_TOPIC as `0x${string}`], fromBlock: 0n, toBlock: 2999n });
    expect(got.map((l) => Number(BigInt(l.blockNumber)))).toEqual([100, 1100, 2100]);
    const order = logFilters(inner).map((f) => Number(f.fromBlock));
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1000, 2000]);
    expect(order).not.toEqual([0, 1000, 2000]);
    // First request is not delayed; every later network request is, within the configured bounds.
    expect(sleeps).toHaveLength(2);
    for (const s of sleeps) expect(s >= 200 && s <= 900).toBe(true);
  });

  it('serves a final window from a per-run cache instead of asking again', async () => {
    const inner = fakeChain(9000, []);
    const c = windowed(inner);
    const f = { address: FAKE_ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC, SCHEME_TOPIC as `0x${string}`] as const };
    await c.getLogs({ ...f, fromBlock: 100n, toBlock: 600n });
    await c.getLogs({ ...f, fromBlock: 601n, toBlock: 999n });
    expect(logFilters(inner)).toHaveLength(1);
  });

  it('never caches a window inside the reorg-able tail', async () => {
    const inner = fakeChain(1050, []);
    const c = windowed(inner);
    const f = { address: FAKE_ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC, SCHEME_TOPIC as `0x${string}`] as const };
    await c.blockNumber();
    await c.getLogs({ ...f, fromBlock: 1000n, toBlock: 1020n });
    await c.getLogs({ ...f, fromBlock: 1021n, toBlock: 1050n });
    expect(logFilters(inner).map((x) => [x.fromBlock, x.toBlock])).toEqual([[1000n, 1050n], [1000n, 1050n]]);
  });

  it('rejects a log the provider returns outside the window or from another emitter (forged)', async () => {
    const meta = encodeMetaAddress(generateKeySet());
    const forged = { ...makeLog({ announcer: OTHER, metaAddress: meta, block: 500, index: 0, caller: OTHER }).log };
    const c = windowed(fakeChain(5000, [], { forge: forged }));
    await expect(c.getLogs({ address: FAKE_ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC, SCHEME_TOPIC as `0x${string}`], fromBlock: 100n, toBlock: 200n })).rejects.toMatchObject({ code: 'INVALID_LOG' });
    const outside = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 4500, index: 0, caller: OTHER }).log;
    const c2 = windowed(fakeChain(5000, [], { forge: outside }));
    await expect(c2.getLogs({ address: FAKE_ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC, SCHEME_TOPIC as `0x${string}`], fromBlock: 100n, toBlock: 200n })).rejects.toMatchObject({ code: 'INVALID_LOG' });
  });

  it('halves the aligned window when the provider says the response is too large, and still completes', async () => {
    const meta = encodeMetaAddress(generateKeySet());
    const logs = [10, 700].map((b, i) => makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: b, index: i, caller: OTHER }).log);
    const inner = fakeChain(3000, logs, { tooBigAbove: 500 });
    const r = await fetchAnnouncements({ chain, client: windowed(inner), announcer: FAKE_ANNOUNCER, cursor: { nextBlock: 0n }, toBlock: 999n });
    expect(r.announcements).toHaveLength(2);
    const ok = logFilters(inner).filter((f) => f.toBlock - f.fromBlock + 1n <= 500n);
    for (const f of ok) expect(f.fromBlock % 500n).toBe(0n);
  });

  it('with windowBlocks 0 behaves exactly like the inner client', async () => {
    const inner = fakeChain(3000, []);
    await windowed(inner, { windowBlocks: 0 }).getLogs({ address: FAKE_ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC, SCHEME_TOPIC as `0x${string}`], fromBlock: 17n, toBlock: 33n });
    expect(logFilters(inner).map((f) => [f.fromBlock, f.toBlock])).toEqual([[17n, 33n]]);
  });
});

// ---- indexer ----

interface IdxDoc { announcements: Record<string, unknown>[]; headers: { number: string; hash: string; parentHash: string }[] }

function indexerFetch(head: number, anns: readonly Record<string, unknown>[], tamper: (d: IdxDoc) => void = () => undefined) {
  const urls: string[] = [];
  const fetchImpl = (url: string): Promise<Response> => {
    urls.push(url);
    const u = new URL(url);
    const from = Number(u.searchParams.get('from'));
    const to = Math.min(Number(u.searchParams.get('to')), head);
    const headers = [];
    for (let n = from; n <= to; n++) headers.push({ number: String(n), hash: blockHash(n), parentHash: blockHash(n === 0 ? 0 : n - 1) });
    const doc: IdxDoc = { announcements: anns.filter((a) => Number(a['blockNumber']) >= from && Number(a['blockNumber']) <= to), headers };
    tamper(doc);
    return Promise.resolve(new Response(JSON.stringify(doc), { status: 200 }));
  };
  return { urls, fetchImpl };
}

function annFrom(log: RpcLog): Record<string, unknown> {
  const data = log.data.slice(2);
  const ephLen = parseInt(data.slice(128, 192), 16);
  const eph = `0x${data.slice(192, 192 + ephLen * 2)}`;
  const metaOff = parseInt(data.slice(64, 128), 16) * 2;
  const metaLen = parseInt(data.slice(metaOff, metaOff + 64), 16);
  const metadata = `0x${data.slice(metaOff + 64, metaOff + 64 + metaLen * 2)}`;
  return {
    schemeId: '1', stealthAddress: `0x${log.topics[2]!.slice(26)}`, caller: `0x${log.topics[3]!.slice(26)}`, ephemeralPublicKey: eph, metadata,
    blockNumber: String(Number(BigInt(log.blockNumber))), blockHash: log.blockHash, logIndex: Number(BigInt(log.logIndex)), transactionHash: log.transactionHash,
  };
}

describe('createIndexerScanClient', () => {
  const meta = encodeMetaAddress(generateKeySet());
  const real = [1200, 1650].map((b, i) => makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: b, index: i, caller: FAKE_ROUTER }).log);
  const mk = (tamper?: (d: IdxDoc) => void) => {
    const rpc = fakeChain(2500, []);
    const idx = indexerFetch(2500, real.map(annFrom), tamper);
    const client = createIndexerScanClient(rpc, { chain, announcer: FAKE_ANNOUNCER, baseUrl: 'https://indexer.example.org', fetchImpl: idx.fetchImpl, windowBlocks: 1000 });
    return { rpc, idx, client };
  };

  it('serves announcer logs from the indexer, re-validated by the normal scan path, with the RPC only as a block-hash witness', async () => {
    const { rpc, idx, client } = mk();
    const r = await fetchAnnouncements({ chain, client, announcer: FAKE_ANNOUNCER, cursor: { nextBlock: 1100n }, toBlock: 1999n });
    expect(r.announcements.map((a) => a.blockNumber)).toEqual([1200n, 1650n]);
    expect(r.announcements[0]?.transactionHash).toBe(real[0]!.transactionHash);
    expect(r.announcements[0]?.caller.toLowerCase()).toBe(FAKE_ROUTER.toLowerCase());
    expect(logFilters(rpc)).toEqual([]);
    expect(idx.urls).toEqual(['https://indexer.example.org/v1/logs?chainId=84532&from=1000&to=1999&pageSize=1000']);
  });

  it('detects a forged announcement whose block hash the RPC does not confirm', async () => {
    const { client } = mk((d) => {
      const fake = `0x${'ee'.repeat(32)}`;
      for (const h of d.headers) { if (h.number === '1200') h.hash = fake; if (h.number === '1201') h.parentHash = fake; }
      for (const a of d.announcements) if (a['blockNumber'] === '1200') a['blockHash'] = fake;
    });
    await expect(fetchAnnouncements({ chain, client, announcer: FAKE_ANNOUNCER, cursor: { nextBlock: 1100n }, toBlock: 1999n })).rejects.toMatchObject({ code: 'RPC_FAILURE', message: expect.stringContaining('HEAD_MISMATCH') as unknown });
  });

  it('detects an omitted block (gap in the header chain); omitted records inside reported blocks stay undetectable', async () => {
    const { client } = mk((d) => { d.headers = d.headers.filter((h) => h.number !== '1500'); });
    await expect(fetchAnnouncements({ chain, client, announcer: FAKE_ANNOUNCER, cursor: { nextBlock: 1100n }, toBlock: 1999n })).rejects.toMatchObject({ message: expect.stringContaining('CONTINUITY') as unknown });
    const quiet = mk((d) => { d.announcements = d.announcements.filter((a) => a['blockNumber'] !== '1650'); });
    const r = await fetchAnnouncements({ chain, client: quiet.client, announcer: FAKE_ANNOUNCER, cursor: { nextBlock: 1100n }, toBlock: 1999n });
    expect(r.announcements).toHaveLength(1);
  });

  it('refuses chains the indexer source does not support and malformed URLs', () => {
    const op = CHAINS.find((c) => c.chainId === 11155420)!;
    expect(() => createIndexerScanClient(mockRpc(11155420, () => null), { chain: op, announcer: FAKE_ANNOUNCER, baseUrl: 'https://i.example', fetchImpl: () => Promise.reject(new Error('x')), windowBlocks: 1000 })).toThrow();
  });
});

// ---- settings, plan and disclosure ----

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m }; };

describe('scan privacy settings', () => {
  it('defaults to direct with aligned windows, no jitter, no proxy requirement and no new endpoint', () => {
    expect(DEFAULT_SCAN_PRIVACY).toMatchObject({ transport: 'direct', requireProxy: false, windowBlocks: 1000, jitterMinMs: 0, jitterMaxMs: 0, source: 'rpc', openLaneBudget: 20_000 });
    expect(loadScanPrivacy(undefined)).toEqual(DEFAULT_SCAN_PRIVACY);
  });

  it('round-trips through storage and sanitises hostile values', () => {
    const s = memory();
    const next: ScanPrivacySettings = { ...DEFAULT_SCAN_PRIVACY, transport: 'local-proxy', endpoints: { '84532': 'http://127.0.0.1:8545/' }, requireProxy: true, jitterMinMs: 100, jitterMaxMs: 400 };
    expect(saveScanPrivacy(s, next)).toBe(true);
    expect(loadScanPrivacy(s)).toEqual(next);
    s.setItem('ghostpay.scanPrivacy.v1', JSON.stringify({ transport: 'socks', endpoints: { '84532': 'http://evil.example/' }, windowBlocks: -5, jitterMinMs: 9, jitterMaxMs: 1, openLaneBudget: 1e12, indexerUrls: { x: 'https://a.example' } }));
    const l = loadScanPrivacy(s);
    expect(l.transport).toBe('direct');
    expect(l.endpoints).toEqual({});
    expect(l.windowBlocks).toBe(DEFAULT_SCAN_PRIVACY.windowBlocks);
    expect([l.jitterMinMs, l.jitterMaxMs]).toEqual([0, 0]);
    expect(l.openLaneBudget).toBe(20_000);
    expect(l.indexerUrls).toEqual({});
    s.setItem('ghostpay.scanPrivacy.v1', '{not json');
    expect(loadScanPrivacy(s)).toEqual(DEFAULT_SCAN_PRIVACY);
    expect(saveScanPrivacy({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, next)).toBe(false);
  });

  it('accepts only loopback endpoints for the local proxy and https otherwise', () => {
    expect(checkScanEndpoint('http://127.0.0.1:8545', 'local-proxy')).toBe('http://127.0.0.1:8545/');
    expect(checkScanEndpoint('http://localhost:9000/rpc', 'local-proxy')).toBe('http://localhost:9000/rpc');
    expect(() => checkScanEndpoint('https://rpc.example.org', 'local-proxy')).toThrow(/127\.0\.0\.1/);
    expect(() => checkScanEndpoint('http://rpc.example.org', 'tor-browser')).toThrow();
    expect(checkScanEndpoint('https://rpc.example.org', 'tor-browser')).toBe('https://rpc.example.org/');
    expect(checkIndexerUrl('https://idx.example.org/api/', 'direct')).toBe('https://idx.example.org/api');
    expect(() => checkIndexerUrl('https://idx.example.org/?k=1', 'direct')).toThrow();
    expect(() => checkIndexerUrl('https://idx.example.org', 'local-proxy')).toThrow();
    expect(checkIndexerUrl('http://127.0.0.1:8080', 'local-proxy')).toBe('http://127.0.0.1:8080');
  });

  it('paranoid preset requires the proxy, keeps aligned windows and adds jitter, without choosing a transport', () => {
    const p = applyParanoidPreset({ ...DEFAULT_SCAN_PRIVACY, windowBlocks: 0 });
    expect(p).toMatchObject({ transport: 'direct', requireProxy: true, windowBlocks: 1000 });
    expect(p.jitterMinMs).toBeGreaterThan(0);
    expect(p.jitterMaxMs).toBeGreaterThan(p.jitterMinMs);
  });
});

describe('planScan', () => {
  const base = DEFAULT_SCAN_PRIVACY;
  it('requireProxy blocks a direct scan instead of silently downgrading', () => {
    expect(planScan({ ...base, requireProxy: true }, chain)).toMatchObject({ kind: 'blocked' });
  });
  it('local proxy without an endpoint is blocked (no fallback to the Settings RPC)', () => {
    expect(planScan({ ...base, transport: 'local-proxy' }, chain)).toMatchObject({ kind: 'blocked' });
  });
  it('local proxy routes the scan through the loopback endpoint; requireProxy drops the direct second RPC', () => {
    const s = { ...base, transport: 'local-proxy' as const, endpoints: { '84532': 'http://127.0.0.1:8545/' } };
    expect(planScan(s, chain)).toMatchObject({ kind: 'ready', endpoint: 'http://127.0.0.1:8545/', allowLoopbackHttp: true, useSecondary: true });
    expect(planScan({ ...s, requireProxy: true }, chain)).toMatchObject({ kind: 'ready', useSecondary: false });
  });
  it('direct keeps today\'s behaviour: Settings RPC plus second RPC, aligned windows clamped to the chain range', () => {
    expect(planScan({ ...base, windowBlocks: 5000 }, chain)).toMatchObject({ kind: 'ready', endpoint: undefined, useSecondary: true, window: { windowBlocks: 1000, jitterMs: [0, 0] } });
  });
  it('indexer needs a URL and a supported chain', () => {
    expect(planScan({ ...base, source: 'indexer' }, chain)).toMatchObject({ kind: 'blocked' });
    expect(planScan({ ...base, source: 'indexer', indexerUrls: { '84532': 'https://idx.example.org' } }, chain)).toMatchObject({ kind: 'ready', indexerUrl: 'https://idx.example.org' });
    const op = CHAINS.find((c) => c.chainId === 11155420)!;
    expect(planScan({ ...base, source: 'indexer', indexerUrls: { '11155420': 'https://idx.example.org' } }, op)).toMatchObject({ kind: 'blocked' });
  });
});

describe('describeScanDisclosure', () => {
  it('names what each party learns and never claims anonymity or unlinkability', () => {
    const cases: ScanPrivacySettings[] = [
      base(),
      { ...base(), transport: 'tor-browser' },
      { ...base(), transport: 'local-proxy', endpoints: { '84532': 'http://127.0.0.1:1/' }, source: 'indexer', indexerUrls: { '84532': 'http://127.0.0.1:2' } },
    ];
    for (const s of cases) {
      const rows = describeScanDisclosure(s, { hasSecondary: true });
      const text = rows.map((r) => `${r.party}: ${r.learns}`).join('\n');
      expect(text).not.toMatch(/anonym|unlinkab|untraceab|invisible|fully private/i);
      expect(text).toMatch(/on-chain/i);
      expect(rows.some((r) => /RPC/.test(r.party))).toBe(true);
    }
    const tor = describeScanDisclosure({ ...base(), transport: 'tor-browser' }, { hasSecondary: false }).map((r) => r.learns).join(' ');
    expect(tor).toContain('cannot verify');
    const idx = describeScanDisclosure(cases[2]!, { hasSecondary: false });
    expect(idx.some((r) => /indexer/i.test(r.party) && /omit/i.test(r.learns))).toBe(true);
  });
  function base(): ScanPrivacySettings { return { ...DEFAULT_SCAN_PRIVACY }; }
});
