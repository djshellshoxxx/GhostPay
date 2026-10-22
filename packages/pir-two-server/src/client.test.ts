import { describe, expect, it } from 'vitest';
import { PirClient, createHttpLink, pagesForRange, validateServerPair, type PirHttpTransport, type PirServerLink } from './client.js';
import { PirError } from './errors.js';
import { createPirHttpServer } from './http.js';
import { packPages } from './pages.js';
import { PirServer } from './server.js';
import { fakeAnn, localLink, seededRand } from './testutil.js';

const SHARD = { chainId: 31337, fromBlock: 100n, toBlock: 160n, headHash: `0x${'cd'.repeat(32)}` };
const anns = Array.from({ length: 30 }, (_, i) => fakeAnn(100 + 2 * i, 0, 40));
const { pages, manifest } = packPages(anns, SHARD, 256);
const srvA = new PirServer(pages, manifest);
const srvB = new PirServer(pages, manifest);
const flip = (p: Uint8Array | undefined, i: number, m: number): Uint8Array<ArrayBuffer> => {
  const c = new Uint8Array(Array.from(p ?? []));
  c[i] = (c[i] ?? 0) ^ m;
  return c;
};

const code = async (f: () => unknown): Promise<string | undefined> => {
  try {
    await f();
  } catch (e) {
    return e instanceof PirError ? e.code : 'other';
  }
  return undefined;
};

const open = (extra: Record<string, unknown> = {}, la: PirServerLink = localLink(srvA, 'https://pir-a.example.org'), lb: PirServerLink = localLink(srvB, 'https://pir-b.example.net')) =>
  PirClient.open({ chainId: 31337, links: [la, lb], rand: seededRand('c'), ...extra });

describe('validateServerPair (NP-P-5)', () => {
  it('accepts different domains, refuses same host / registrable domain', () => {
    expect(validateServerPair('https://a.example.org', 'https://b.example.net')).toEqual({ noPrivacy: false });
    expect(() => validateServerPair('https://a.example.org', 'https://a.example.org')).toThrow(PirError);
    expect(() => validateServerPair('https://pir1.example.org', 'https://pir2.example.org')).toThrow(/different domains/);
    expect(() => validateServerPair('http://10.0.0.1:1', 'http://10.0.0.1:2')).toThrow(PirError);
    expect(validateServerPair('http://10.0.0.1:1', 'http://10.0.0.2:1')).toEqual({ noPrivacy: false });
    expect(validateServerPair('http://[::1]:1', 'http://[::2]:1')).toEqual({ noPrivacy: false });
    expect(validateServerPair('http://localhost:1', 'http://127.0.0.1:1')).toEqual({ noPrivacy: false });
  });
  it('explicit testing override reports noPrivacy', () => {
    expect(validateServerPair('https://a.example.org', 'https://b.example.org', { allowSameOperatorNoPrivacy: true })).toEqual({ noPrivacy: true });
  });
  it('rejects malformed urls and schemes', () => {
    expect(() => validateServerPair('not a url', 'https://b.example.org')).toThrow(PirError);
    expect(() => validateServerPair('ftp://a.example.org', 'https://b.example.org')).toThrow(PirError);
  });
});

describe('PirClient end to end', () => {
  it('fetches every page privately and correctly', async () => {
    const la = localLink(srvA, 'https://pir-a.example.org');
    const lb = localLink(srvB, 'https://pir-b.example.net');
    const c = await open({}, la, lb);
    expect(c.noPrivacy).toBe(false);
    expect(c.pagesPerEpoch).toBe(8);
    for (let i = 0; i < manifest.nPages; i++) {
      const got = await c.fetchPages([i]);
      expect([...(got.get(i) as Uint8Array)]).toEqual([...(pages[i] as Uint8Array)]);
    }
  });

  it('AT-NP-18: exactly W fetches per epoch, real < W, order shuffled, both servers see W equal-size queries', async () => {
    const la = localLink(srvA, 'https://pir-a.example.org');
    const lb = localLink(srvB, 'https://pir-b.example.net');
    const c = await open({ pagesPerEpoch: 6 }, la, lb);
    const orders = new Set<string>();
    for (let r = 0; r < 20; r++) {
      la.log.length = 0;
      lb.log.length = 0;
      const got = await c.fetchPages([2, 5, 2]);
      expect([...got.keys()].sort()).toEqual([2, 5]);
      expect(la.log.length).toBe(6);
      expect(lb.log.length).toBe(6);
      expect(la.log.every((q) => q.length === srvA.queryLength)).toBe(true);
      // reveal which slots were real via qA xor qB (colluding view; client side bookkeeping only)
      const slots = la.log.map((q, k) => {
        const x = q.map((b, j) => b ^ (lb.log[k]?.[j] ?? 0));
        return x.findIndex((v) => v !== 0) * 8 + Math.log2(x.find((v) => v !== 0) ?? 1);
      });
      orders.add(slots.join(','));
      expect(slots).toContain(2);
      expect(slots).toContain(5);
    }
    expect(orders.size).toBeGreaterThan(10);
  });

  it('fetchPages refuses to under-pad and bad indices', async () => {
    const c = await open({ pagesPerEpoch: 4 });
    expect(await code(() => c.fetchPages([0, 1, 2, 3]))).toBe('TOO_MANY_PAGES');
    expect(await code(() => c.fetchPages([-1]))).toBe('INVALID_ARGUMENT');
    expect(await code(() => c.fetchPages([manifest.nPages]))).toBe('INVALID_ARGUMENT');
    expect((await c.fetchPages([])).size).toBe(0); // pure-dummy epoch is allowed
  });

  it('rejects pagesPerEpoch below 4 and non-testnet chain', async () => {
    expect(await code(() => open({ pagesPerEpoch: 3 }))).toBe('INVALID_ARGUMENT');
    expect(await code(() => PirClient.open({ chainId: 1, links: [localLink(srvA, 'https://a.example.org'), localLink(srvB, 'https://b.example.net')] }))).toBe('TESTNET_ONLY');
  });

  it('fetchRecords decodes and checks declared ranges', async () => {
    const c = await open();
    const idx = pagesForRange(manifest, 100n, 110n);
    expect(idx.length).toBeGreaterThan(0);
    const recs = await c.fetchRecords(idx);
    const blocks = [...recs.values()].flat().map((r) => r.blockNumber);
    expect(blocks).toContain(100n);
    expect(pagesForRange(manifest, 1000n, 2000n)).toEqual([]);
  });

  it('AT-NP-19: a lying server (flipped bit in the answer) is detected, page discarded', async () => {
    const la = localLink(srvA, 'https://pir-a.example.org');
    const lb: PirServerLink = { ...localLink(srvB, 'https://pir-b.example.net'), answer: (q) => {
      const a = srvB.answer(q);
      a[7] = (a[7] ?? 0) ^ 0x80;
      return Promise.resolve(a);
    } };
    const c = await open({}, la, lb);
    expect(await code(() => c.fetchPages([3]))).toBe('PIR_INTEGRITY');
  });
  it('wrong-size answers are an integrity failure', async () => {
    const la = localLink(srvA, 'https://pir-a.example.org');
    const lb: PirServerLink = { ...localLink(srvB, 'https://pir-b.example.net'), answer: () => Promise.resolve(new Uint8Array(10)) };
    const c = await open({}, la, lb);
    expect(await code(() => c.fetchPages([3]))).toBe('PIR_INTEGRITY');
  });
  it('a server serving different pages but the same manifest is caught by the leaf hash', async () => {
    const forked = pages.map((p) => new Uint8Array(p));
    forked[4] = flip(forked[4], 10, 1);
    // forge answer from forked pages (bypassing PirServer's own manifest check using the raw primitive)
    const { pirAnswer } = await import('./xor.js');
    const evil: PirServerLink = { ...localLink(srvB, 'https://pir-b.example.net'), answer: (q) => Promise.resolve(pirAnswer(forked, q)) };
    const c = await open({ pagesPerEpoch: 4 }, localLink(srvA, 'https://pir-a.example.org'), evil);
    // fetch only page 4 plus dummies: some slot touching page 4 differs => integrity error (every page whose set contains 4 mismatches)
    let failed = false;
    for (let t = 0; t < 10 && !failed; t++) failed = (await code(() => c.fetchPages([4]))) === 'PIR_INTEGRITY';
    expect(failed).toBe(true);
  });

  it('servers disagreeing on the manifest are refused', async () => {
    const other = packPages(anns.slice(1), SHARD, 256);
    const sB = new PirServer(other.pages, other.manifest);
    expect(await code(() => open({}, localLink(srvA, 'https://pir-a.example.org'), localLink(sB, 'https://pir-b.example.net')))).toBe('MANIFEST_MISMATCH');
  });
  it('manifest for another chain than requested is refused', async () => {
    const o = packPages(anns, { ...SHARD, chainId: 84532 }, 256);
    const s = new PirServer(o.pages, o.manifest);
    expect(await code(() => open({}, localLink(s, 'https://pir-a.example.org'), localLink(s, 'https://pir-b.example.net')))).toBe('MANIFEST_MISMATCH');
  });
  it('third-source head check (NP-P-6)', async () => {
    const good = SHARD.headHash;
    expect(await code(() => open({ thirdSourceBlockHash: (b: bigint) => { expect(b).toBe(160n); return Promise.resolve(good.toUpperCase().replace('0X', '0x')); } }))).toBeUndefined();
    expect(await code(() => open({ thirdSourceBlockHash: () => Promise.resolve(`0x${'11'.repeat(32)}`) }))).toBe('MANIFEST_MISMATCH');
    const nohead = packPages(anns, { chainId: 31337, fromBlock: 100n, toBlock: 160n }, 256);
    const s = new PirServer(nohead.pages, nohead.manifest);
    expect(await code(() => open({ thirdSourceBlockHash: () => Promise.resolve(good) }, localLink(s, 'https://pir-a.example.org'), localLink(s, 'https://pir-b.example.net')))).toBe('MANIFEST_MISMATCH');
  });
  it('same operator refused unless explicitly allowed for testing', async () => {
    expect(await code(() => open({}, localLink(srvA, 'https://a.example.org'), localLink(srvB, 'https://b.example.org')))).toBe('SAME_OPERATOR');
    const c = await open({ allowSameOperatorNoPrivacy: true }, localLink(srvA, 'https://a.example.org'), localLink(srvB, 'https://b.example.org'));
    expect(c.noPrivacy).toBe(true);
  });
  it('fetchRecords rejects a record outside the declared page range', async () => {
    // manifest (both servers) declares page 0 range, but page content has a record outside it
    const evilPages = pages.map((p) => new Uint8Array(p));
    const lying = { ...manifest, pageRanges: manifest.pageRanges.map((r, i) => (i === 0 ? (['101', '101'] as const) : r)) };
    const evilPagesPacked = packPages(anns, SHARD, 256);
    const s = new PirServer(evilPagesPacked.pages, { ...evilPagesPacked.manifest, pageRanges: lying.pageRanges });
    expect(evilPages.length).toBe(pages.length);
    const c = await open({}, localLink(s, 'https://pir-a.example.org'), localLink(s, 'https://pir-b.example.net'));
    expect(await code(() => c.fetchRecords([0]))).toBe('BAD_PAGE');
    const lyingNull = { ...evilPagesPacked.manifest, pageRanges: evilPagesPacked.manifest.pageRanges.map(() => null) };
    const s2 = new PirServer(evilPagesPacked.pages, lyingNull);
    const c2 = await open({}, localLink(s2, 'https://pir-a.example.org'), localLink(s2, 'https://pir-b.example.net'));
    expect(await code(() => c2.fetchRecords([0]))).toBe('BAD_PAGE');
  });
});

describe('PirServer', () => {
  it('validates pages against the manifest', () => {
    expect(() => new PirServer(pages.slice(1), manifest)).toThrow(PirError);
    const bad = pages.map((p) => new Uint8Array(p));
    bad[0] = flip(bad[0], 200, 1);
    expect(() => new PirServer(bad, manifest)).toThrow(/manifest/);
    const wrongSize = pages.map((p, i) => (i === 0 ? new Uint8Array(257) : p));
    expect(() => new PirServer(wrongSize, manifest)).toThrow(/size/);
    expect(() => new PirServer(pages, { ...manifest, chainId: 1 })).toThrow(/testnet/);
  });
  it('copies the database (later mutation of the input does not change answers)', () => {
    const mine = pages.map((p) => new Uint8Array(p));
    const s = new PirServer(mine, manifest);
    const q = new Uint8Array(s.queryLength).fill(0);
    q[0] = 1;
    const before = s.answer(q);
    mine[0] = flip(mine[0], 0, 0xff);
    expect([...s.answer(q)]).toEqual([...before]);
    expect(s.nPages).toBe(manifest.nPages);
  });
  it('rejects malformed queries', () => {
    expect(() => srvA.answer(new Uint8Array(1))).toThrow(PirError);
  });
});

describe('HTTP wire (loopback only)', () => {
  const transport: PirHttpTransport = {
    async request(r) {
      const res = await fetch(r.url, { method: r.method, ...(r.body ? { body: r.body as unknown as BodyInit } : {}) });
      return { status: res.status, body: new Uint8Array(await res.arrayBuffer()) };
    },
  };
  it('manifest + pir routes work through createHttpLink and PirClient', async () => {
    const a = await createPirHttpServer(srvA);
    const b = await createPirHttpServer(srvB);
    try {
      const la = createHttpLink(`http://localhost:${String(a.port)}`, 31337, transport);
      const lb = createHttpLink(`http://127.0.0.1:${String(b.port)}/`, 31337, transport);
      const c = await PirClient.open({ chainId: 31337, links: [la, lb] });
      const got = await c.fetchPages([1]);
      expect([...(got.get(1) as Uint8Array)]).toEqual([...(pages[1] as Uint8Array)]);
    } finally {
      await a.close();
      await b.close();
    }
  });
  it('fixed responses and uniform errors', async () => {
    const a = await createPirHttpServer(srvA, { host: '127.0.0.1', port: 0 });
    try {
      const base = `http://127.0.0.1:${String(a.port)}`;
      const ok = new Uint8Array(await (await fetch(`${base}/v1/pir`, { method: 'POST', body: new Uint8Array(srvA.queryLength) })).arrayBuffer());
      expect(ok.length).toBe(manifest.pageBytes);
      const short = await fetch(`${base}/v1/pir`, { method: 'POST', body: new Uint8Array(1) });
      expect(short.status).toBe(400);
      expect((await short.arrayBuffer()).byteLength).toBe(1);
      const stray = new Uint8Array(srvA.queryLength).fill(0xff);
      expect((await fetch(`${base}/v1/pir`, { method: 'POST', body: stray })).status).toBe(400);
      const big = await fetch(`${base}/v1/pir`, { method: 'POST', body: new Uint8Array(100_000) }).catch(() => ({ status: 0 }));
      expect([400, 0]).toContain(big.status);
      expect((await fetch(`${base}/v1/nope`)).status).toBe(404);
      expect((await fetch(`${base}/v1/pir`)).status).toBe(404);
      expect((await fetch(`${base}/v1/manifest?chainId=1`)).status).toBe(404);
      expect((await fetch(`${base}/v1/manifest?chainId=31337`)).status).toBe(200);
      expect((await fetch(`${base}/v1/manifest`)).status).toBe(200);
    } finally {
      await a.close();
    }
  });
  it('createHttpLink: non-200 and thrown transport errors become fixed-text TRANSPORT errors with no URL', async () => {
    const failing: PirHttpTransport = { request: () => Promise.reject(new Error('boom http://secret.example/path')) };
    const l1 = createHttpLink('https://pir-a.example.org', 31337, failing);
    for (const f of [() => l1.getManifest(), () => l1.answer(new Uint8Array(1))]) {
      try {
        await f();
        expect.unreachable();
      } catch (e) {
        expect((e as PirError).code).toBe('TRANSPORT');
        expect((e as Error).message).not.toContain('secret');
      }
    }
    const non200: PirHttpTransport = { request: () => Promise.resolve({ status: 500, body: new Uint8Array(1) }) };
    const l2 = createHttpLink('https://pir-a.example.org', 31337, non200);
    expect(await code(() => l2.getManifest())).toBe('TRANSPORT');
    expect(await code(() => l2.answer(new Uint8Array(1)))).toBe('TRANSPORT');
    expect(() => createHttpLink('https://pir-a.example.org', 1, non200)).toThrow(PirError);
    expect(() => createHttpLink('nope', 31337, non200)).toThrow(PirError);
  });
});
