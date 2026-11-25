import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { ANNOUNCER, FakeChain, fakeAnn, get, serve } from './fake.testutil.js';
import { Indexer } from './ingest.js';
import { buildPage } from './page.js';
import { LogStore } from './store.js';
import { createLogsHandler, type ServiceOptions } from './server.js';
import { ENVELOPE_RESERVE_BYTES, type LogsPage } from './wire.js';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

/** Chain 0..2999 with announcements roughly every 47 blocks (and three in block 1500); indexed; served. */
async function fixture(o: Partial<ServiceOptions> & { path?: string; blocks?: number; anns?: (n: bigint) => ReturnType<typeof fakeAnn>[] } = {}) {
  const chain = new FakeChain();
  chain.mine(o.blocks ?? 2999, o.anns ?? ((n) => (n === 1500n ? [fakeAnn(1), fakeAnn(2), fakeAnn(3)] : n % 47n === 3n ? [fakeAnn(Number(n))] : [])));
  const store = LogStore.open(o.path ?? ':memory:', { chainId: 31337, announcer: ANNOUNCER, indexedFrom: 0n });
  const ix = new Indexer({ store, reader: chain, chainId: 31337, announcer: ANNOUNCER, batchBlocks: 1000 });
  for (let k = ''; k !== 'idle'; k = (await ix.syncOnce()).kind) if (k === 'halted') throw new Error('halted');
  const svc = await serve({ store, chainId: 31337, announcer: ANNOUNCER, ...o });
  const closeStore = (): void => {
    try {
      store.close();
    } catch {
      // already closed by the test
    }
  };
  cleanups.push(closeStore, () => svc.close());
  return { chain, store, ix, svc, logs: (q: string) => get(`${svc.url}/v1/logs?${q}`) };
}
const errCode = (r: { json: Record<string, unknown> }): unknown => (r.json['error'] as { code?: unknown } | undefined)?.code;

describe('GET /v1/logs', () => {
  it('serves a whole aligned window: contiguous headers, every announcement, no cursor', async () => {
    const { chain, logs } = await fixture();
    const r = await logs('chainId=31337&from=1000&to=1999&pageSize=1000');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/^application\/json/);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('date')).toBeNull();
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
    const p = r.json as unknown as LogsPage;
    expect(p).toMatchObject({ version: 1, chainId: 31337, announcer: ANNOUNCER, coverage: { fromBlock: '1000', toBlock: '1999' }, next: null, omitted: 0 });
    expect(p.head).toEqual({ number: '2999', hash: chain.head.hash });
    expect(p.headers).toHaveLength(1000);
    p.headers.forEach((h, i) => {
      expect(h.number).toBe(String(1000 + i));
      if (i > 0) expect(h.parentHash).toBe(p.headers[i - 1]?.hash);
    });
    const want = chain.blocks.filter((b) => b.number >= 1000n && b.number <= 1999n).flatMap((b) => b.logs);
    expect(p.announcements.map((a) => `${a.blockNumber}:${String(a.logIndex)}`)).toEqual(want.map((l) => `${l.blockNumber.toString()}:${String(l.logIndex)}`));
    expect(Object.keys(p.announcements[0] ?? {}).sort()).toEqual(['blockHash', 'blockNumber', 'caller', 'ephemeralPublicKey', 'logIndex', 'metadata', 'schemeId', 'stealthAddress', 'transactionHash']);
  });
  it('a window past the indexed head is served up to the head', async () => {
    const { logs } = await fixture({ blocks: 2500 });
    const r = await logs('chainId=31337&from=2000&to=2999');
    expect(r.json['coverage']).toEqual({ fromBlock: '2000', toBlock: '2500' });
    expect(r.json['next']).toBeNull();
  });
  it('malformed requests: 400 with a fixed message that never echoes the input', async () => {
    const { logs } = await fixture({ blocks: 1999 });
    for (const q of ['', 'chainId=31337', 'chainId=31337&from=abc&to=999', 'chainId=31337&from=0&to=999&from=0', 'chainId=31337&from=0&to=999&viewTag=0xab']) {
      const r = await logs(q);
      expect(r.status, q).toBe(400);
      expect(r.text).not.toContain('viewTag');
      expect(r.text).not.toContain('abc');
    }
    expect(errCode(await logs('chainId=31337&from=0&to=999&viewTag=0xab'))).toBe('UNKNOWN_PARAMETER');
  });
  it('oversized and misaligned windows and page sizes are rejected, never truncated', async () => {
    const { logs } = await fixture({ blocks: 1999 });
    const big = await logs('chainId=31337&from=0&to=2999');
    expect([big.status, errCode(big)]).toEqual([400, 'WINDOW_TOO_LARGE']);
    expect(errCode(await logs('chainId=31337&from=0&to=999999999'))).toBe('WINDOW_TOO_LARGE');
    expect(errCode(await logs('chainId=31337&from=1200&to=1999'))).toBe('WINDOW_NOT_ALIGNED');
    expect(errCode(await logs('chainId=31337&from=0&to=999&pageSize=5000'))).toBe('PAGE_SIZE_OUT_OF_RANGE');
    const chain = await logs('chainId=11155111&from=0&to=999');
    expect([chain.status, errCode(chain)]).toEqual([404, 'CHAIN_NOT_SERVED']);
  });
  it('ranges outside the index: 416; empty or halted index: 503', async () => {
    const { logs, store } = await fixture({ blocks: 1500 });
    const beyond = await logs('chainId=31337&from=2000&to=2999');
    expect([beyond.status, errCode(beyond)]).toEqual([416, 'NOT_YET_INDEXED']);
    store.halt();
    const halted = await logs('chainId=31337&from=0&to=999');
    expect([halted.status, errCode(halted)]).toEqual([503, 'HALTED']);
    const empty = LogStore.open(':memory:', { chainId: 31337, announcer: ANNOUNCER, indexedFrom: 1000n });
    cleanups.push(() => empty.close());
    expect(buildPage(empty, { chainId: 31337, from: 0n, to: 999n, pageSize: 10 }, { announcer: ANNOUNCER, maxResponseBytes: 1 << 20 })).toEqual({ ok: false, code: 'NOT_READY' });
    empty.appendBlocks([{ header: { number: 1000n, hash: `0x${'01'.repeat(32)}`, parentHash: `0x${'00'.repeat(32)}`, omitted: 0 }, announcements: [] }]);
    expect(buildPage(empty, { chainId: 31337, from: 0n, to: 999n, pageSize: 10 }, { announcer: ANNOUNCER, maxResponseBytes: 1 << 20 })).toEqual({ ok: false, code: 'BEFORE_INDEXED_RANGE' });
  });
  it('pagination by record cap ends on a block boundary; following `next` yields the whole window exactly once', async () => {
    const { logs, chain } = await fixture({ maxPageSize: 10, defaultPageSize: 10 });
    const seen: string[] = [];
    let cursor: string | null = null;
    let prevHash: string | undefined;
    let pages = 0;
    do {
      const r = await logs(`chainId=31337&from=0&to=999${cursor === null ? '' : `&cursor=${cursor}`}`);
      expect(r.status).toBe(200);
      const p = r.json as unknown as LogsPage;
      expect(p.announcements.length).toBeLessThanOrEqual(10);
      if (prevHash !== undefined) expect(p.headers[0]?.parentHash).toBe(prevHash); // continuity across pages
      prevHash = p.headers[p.headers.length - 1]?.hash;
      if (p.next !== null) expect(BigInt(p.next)).toBe(BigInt(p.coverage.toBlock) + 1n);
      for (const a of p.announcements) {
        expect(BigInt(a.blockNumber) <= BigInt(p.coverage.toBlock)).toBe(true);
        seen.push(`${a.blockNumber}:${String(a.logIndex)}`);
      }
      cursor = p.next;
      pages++;
    } while (cursor !== null);
    expect(pages).toBeGreaterThan(2);
    const want = chain.blocks.filter((b) => b.number <= 999n).flatMap((b) => b.logs.map((l) => `${l.blockNumber.toString()}:${String(l.logIndex)}`));
    expect(seen).toEqual(want);
  });
  it('a block with more records than the page cap is BLOCK_EXCEEDS_PAGE_LIMIT, never a partial block', async () => {
    const { logs } = await fixture({ maxPageSize: 2, defaultPageSize: 2, blocks: 1999 });
    const atDense = await logs('chainId=31337&from=1000&to=1999&cursor=1500');
    expect([atDense.status, errCode(atDense)]).toEqual([422, 'BLOCK_EXCEEDS_PAGE_LIMIT']);
    const before = await logs('chainId=31337&from=1000&to=1999&cursor=1480');
    expect(before.json['next']).toBe('1500');
  });
  it('pagination by byte budget; every body stays within maxResponseBytes', async () => {
    const max = 64 * 1024;
    const { logs } = await fixture({ maxResponseBytes: max, blocks: 1999, anns: (n) => (n % 5n === 0n ? [fakeAnn(Number(n), 2000)] : []) });
    let cursor: string | null = null;
    let pages = 0;
    do {
      const r = await logs(`chainId=31337&from=1000&to=1999${cursor === null ? '' : `&cursor=${cursor}`}`);
      expect(r.status).toBe(200);
      expect(Buffer.byteLength(r.text)).toBeLessThanOrEqual(max);
      const p = r.json as unknown as LogsPage;
      const items = [...p.headers, ...p.announcements].reduce((n, x) => n + Buffer.byteLength(JSON.stringify(x)) + 1, 0);
      expect(Buffer.byteLength(r.text) - items).toBeLessThan(ENVELOPE_RESERVE_BYTES / 2); // envelope bound
      cursor = r.json['next'] as string | null;
      pages++;
    } while (cursor !== null);
    expect(pages).toBeGreaterThan(2);
    const huge = await fixture({ maxResponseBytes: max, blocks: 1999, anns: (n) => (n === 1000n ? Array.from({ length: 20 }, (_, i) => fakeAnn(i, 4000)) : []) });
    expect(errCode(await huge.logs('chainId=31337&from=1000&to=1999'))).toBe('BLOCK_EXCEEDS_PAGE_LIMIT');
  });
  it('header gap in the store is STORE_INCONSISTENT (500), never a shorter answer', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'light-indexer-gap-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'gap.sqlite');
    const { logs, store } = await fixture({ path, blocks: 1999 });
    const raw = new DatabaseSync(path);
    raw.exec('DELETE FROM headers WHERE number = 1300');
    const gap = await logs('chainId=31337&from=1000&to=1999');
    expect([gap.status, errCode(gap)]).toEqual([500, 'STORE_INCONSISTENT']);
    raw.exec(`INSERT INTO headers VALUES (1300, '0x${'ee'.repeat(32)}', '0x${'ee'.repeat(32)}', 0)`); // broken parent link
    expect(errCode(await logs('chainId=31337&from=1000&to=1999'))).toBe('STORE_INCONSISTENT');
    expect(errCode(await logs('chainId=31337&from=1000&to=1999&cursor=1301'))).toBe('STORE_INCONSISTENT'); // page start vs stored parent
    raw.exec(`UPDATE headers SET hash = (SELECT hash FROM headers WHERE number = 1300), parent_hash = (SELECT parent_hash FROM headers WHERE number = 1300) WHERE number = 1300`);
    raw.exec(`UPDATE announcements SET block_hash = '0x${'dd'.repeat(32)}' WHERE block_number = 1500`);
    expect(errCode(await logs('chainId=31337&from=1000&to=1999&cursor=1500'))).toBe('STORE_INCONSISTENT');
    raw.close();
    expect(store.halted).toBe(false);
  });
  it('closed store errors become INTERNAL with fixed text', async () => {
    const { logs, store } = await fixture({ blocks: 10 });
    store.close();
    const r = await logs('chainId=31337&from=0&to=999');
    expect([r.status, errCode(r)]).toEqual([500, 'INTERNAL']);
  });
});

describe('routes, methods, CORS, status, counters', () => {
  it('404 for other paths, 405 for other methods, 414 for long targets', async () => {
    const { svc } = await fixture({ blocks: 10 });
    expect((await get(`${svc.url}/v1/logs/`)).status).toBe(404);
    expect((await get(`${svc.url}/`)).status).toBe(404);
    const post = await get(`${svc.url}/v1/logs?chainId=31337&from=0&to=999`, { method: 'POST', body: 'x' });
    expect([post.status, post.headers.get('allow')]).toEqual([405, 'GET, OPTIONS']);
    expect((await get(`${svc.url}/v1/logs?${'a'.repeat(600)}`)).status).toBe(414);
    expect(errCode(await get(`${svc.url}/v1/status?x=1`))).toBe('UNKNOWN_PARAMETER');
  });
  it('status publishes the indexed range and limits only', async () => {
    const { svc, chain } = await fixture({ blocks: 10, allowedOrigins: ['https://app.example.org'] });
    const s = await get(`${svc.url}/v1/status`);
    expect(s.json).toEqual({
      version: 1,
      chainId: 31337,
      announcer: ANNOUNCER,
      indexedFrom: '0',
      head: { number: '10', hash: chain.head.hash },
      halted: false,
      limits: { alignBlocks: 1000, maxWindowBlocks: 2000, maxPageSize: 1000, defaultPageSize: 1000, maxResponseBytes: 8 * 1024 * 1024 },
    });
    const empty = LogStore.open(':memory:', { chainId: 31337, announcer: ANNOUNCER, indexedFrom: 0n });
    const e = await serve({ store: empty, chainId: 31337, announcer: ANNOUNCER });
    cleanups.push(() => empty.close(), () => e.close());
    expect((await get(`${e.url}/v1/status`)).json['head']).toBeNull();
  });
  it('CORS: exact allowed origins only, preflight answers GET only', async () => {
    const { svc } = await fixture({ blocks: 10, allowedOrigins: ['https://app.example.org'] });
    const ok = await get(`${svc.url}/v1/status`, { headers: { origin: 'https://app.example.org' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.example.org');
    expect(ok.headers.get('vary')).toBe('Origin');
    const other = await get(`${svc.url}/v1/status`, { headers: { origin: 'https://evil.example.org' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    const pre = await get(`${svc.url}/v1/logs`, { method: 'OPTIONS', headers: { origin: 'https://app.example.org' } });
    expect([pre.status, pre.headers.get('access-control-allow-methods')]).toEqual([204, 'GET']);
    expect(() => createLogsHandler({ store: LogStore.open(':memory:', { chainId: 31337, announcer: ANNOUNCER, indexedFrom: 0n }), chainId: 31337, announcer: ANNOUNCER, allowedOrigins: ['https://app.example.org/'] })).toThrow(RangeError);
    expect(() => createLogsHandler({ store: LogStore.open(':memory:', { chainId: 31337, announcer: ANNOUNCER, indexedFrom: 0n }), chainId: 1, announcer: ANNOUNCER })).toThrow(RangeError);
  });
  it('counters are aggregate only; a request without a target is handled', async () => {
    const { svc, logs } = await fixture({ blocks: 10 });
    await logs('chainId=31337&from=0&to=999');
    await logs('chainId=31337&from=0&to=999&viewTag=1');
    const c = svc.counters();
    expect(c).toEqual({ requests: 2, byStatus: { '200': 1, '400': 1 }, pages: 1, announcements: c.announcements });
    expect(JSON.stringify(c)).not.toMatch(/127\.0\.0\.1|viewTag|chainId|::1/);
    const port = new URL(svc.url).port;
    const status = await new Promise<number>((resolve, reject) => {
      const r = request({ host: '127.0.0.1', port, method: 'GET', path: '*' }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      r.on('error', reject);
      r.end();
    });
    expect(status).toBe(404);
  });
});
