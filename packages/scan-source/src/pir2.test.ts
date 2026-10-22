import { PirServer } from '@ghostpay/pir-two-server';
import { describe, expect, it } from 'vitest';
import { ScanSourceError } from './errors.js';
import { createPir2Source } from './pir2.js';
import { createRangeSource } from './range.js';
import { CHAIN_HEAD, blockHash, buildShard, fakeBackend, pirTransport } from './testutil.js';
import { setHash } from './validate.js';
import type { HttpTransport } from './types.js';

const codeOf = async (f: () => unknown): Promise<string | undefined> => {
  try {
    await f();
  } catch (e) {
    return e instanceof ScanSourceError ? e.code : 'other';
  }
  return undefined;
};
const shard = buildShard();
const third = (n: bigint): Promise<string> => Promise.resolve(blockHash(n));
const servers = { 'pir-a.example.org': shard.pir, 'pir-b.example.net': new PirServer(shard.pages, shard.manifest) };
const REQ = { chainId: 31337, fromBlock: 1500n, toBlock: 1510n } as const;
const mk = (o: Record<string, unknown> = {}, log: { url: string; bodyLen: number }[] = []) => {
  const t = pirTransport(servers, log);
  return createPir2Source({ chainId: 31337, servers: ['https://pir-a.example.org', 'https://pir-b.example.net'], transport: [t, t], thirdSourceBlockHash: third, epoch: { pagesPerEpoch: 40 }, ...o });
};

describe('pir2 source', () => {
  it('finds the same announcement set as range (hash equality) over a padded window', async () => {
    expect(shard.manifest.nPages).toBeGreaterThan(5);
    const src = mk();
    expect(src.kind).toBe('pir2');
    const a = await src.fetch(REQ);
    const b = await createRangeSource({ chainId: 31337, backend: fakeBackend() }).fetch(REQ);
    expect(a.coverage).toEqual(b.coverage);
    expect(setHash(a.announcements)).toBe(setHash(b.announcements));
    expect(a.announcements.length).toBeGreaterThan(0);
    expect(a.head).toEqual({ number: CHAIN_HEAD, hash: blockHash(CHAIN_HEAD) });
  });
  it('NP-S-2: only manifest GETs and fixed-size query POSTs; query size independent of the window', async () => {
    const log: { url: string; bodyLen: number }[] = [];
    const src = mk({}, log);
    await src.fetch(REQ);
    await src.fetch({ chainId: 31337, fromBlock: 0n, toBlock: 3n });
    const posts = log.filter((l) => l.url.endsWith('/v1/pir'));
    expect(posts.length).toBe(2 * 2 * 40); // 2 fetches x 2 servers x W
    expect(new Set(posts.map((p) => p.bodyLen)).size).toBe(1);
    for (const l of log.filter((x) => !x.url.endsWith('/v1/pir'))) expect(l.url).toMatch(/\/v1\/manifest\?chainId=31337$/);
  });
  it('clamps coverage to the shard and fails outside it', async () => {
    const s = buildShard();
    const small = createPir2Source({ chainId: 31337, servers: ['https://a.example.org', 'https://b.example.net'], transport: [pirTransport({ 'a.example.org': s.pir }), pirTransport({ 'b.example.net': s.pir })], thirdSourceBlockHash: third, epoch: { pagesPerEpoch: 40 } });
    const r = await small.fetch({ chainId: 31337, fromBlock: 2900n, toBlock: 9000n });
    expect(r.coverage.toBlock).toBe(CHAIN_HEAD);
    expect(await codeOf(() => small.fetch({ chainId: 31337, fromBlock: 5000n, toBlock: 6000n }))).toBe('OUT_OF_RANGE');
  });
  it('AT-NP-19: a lying PIR server is rejected', async () => {
    const t: HttpTransport = {
      request: async (r) => {
        const res = await pirTransport(servers).request(r);
        if (r.method === 'POST' && r.url.includes('pir-b')) {
          const b = new Uint8Array(res.body);
          b[3] = (b[3] ?? 0) ^ 1;
          return { status: 200, body: b };
        }
        return res;
      },
    };
    expect(await codeOf(() => mk({ transport: [t, t] }).fetch(REQ))).toBe('PIR_INTEGRITY');
  });
  it('manifest disagreement and wrong third-source head are rejected', async () => {
    const other = buildShard(84532);
    const t = pirTransport({ 'pir-a.example.org': shard.pir, 'pir-b.example.net': other.pir });
    expect(await codeOf(() => mk({ transport: [t, t] }).fetch(REQ))).toBe('PIR_INTEGRITY');
    expect(await codeOf(() => mk({ thirdSourceBlockHash: () => Promise.resolve(`0x${'11'.repeat(32)}`) }).fetch(REQ))).toBe('PIR_INTEGRITY');
    const nohead = buildShard(31337, false);
    const t2 = pirTransport({ 'pir-a.example.org': nohead.pir, 'pir-b.example.net': nohead.pir });
    expect(await codeOf(() => mk({ transport: [t2, t2] }).fetch(REQ))).toBe('PIR_INTEGRITY');
  });
  it('same operator refused; testing override allowed', async () => {
    const t = pirTransport({ 'a.example.org': shard.pir, 'b.example.org': shard.pir });
    const base = { servers: ['https://a.example.org', 'https://b.example.org'] as const, transport: [t, t] as const };
    expect(await codeOf(() => mk(base).fetch(REQ))).toBe('PIR_FAILED');
    const ok = await mk({ ...base, allowSameOperatorNoPrivacy: true }).fetch(REQ);
    expect(ok.announcements.length).toBeGreaterThan(0);
  });
  it('window needing >= pagesPerEpoch pages is PIR_FAILED (cannot pad)', async () => {
    expect(await codeOf(() => mk({ epoch: { pagesPerEpoch: 4 } }).fetch({ chainId: 31337, fromBlock: 0n, toBlock: CHAIN_HEAD }))).toBe('PIR_FAILED');
  });
  it('transport failure is PIR_FAILED with fixed text', async () => {
    const t: HttpTransport = { request: () => Promise.reject(new Error('http://secret')) };
    try {
      await mk({ transport: [t, t] }).fetch(REQ);
      expect.unreachable();
    } catch (e) {
      expect((e as ScanSourceError).code).toBe('PIR_FAILED');
      expect((e as Error).message).not.toContain('secret');
    }
  });
  it('testnet and option guards; injected rand and abort signal accepted', async () => {
    expect(() => mk({ chainId: 1 })).toThrow(/testnet/);
    const src = mk();
    expect(await codeOf(() => src.fetch({ ...REQ, chainId: 1 }))).toBe('TESTNET_ONLY');
    expect(await codeOf(() => src.fetch({ ...REQ, chainId: 84532 }))).toBe('INVALID_ARGUMENT');
    expect(() => createPir2Source({ chainId: 31337, servers: ['a', 'b', 'c'] as never, transport: [pirTransport({}), pirTransport({})], thirdSourceBlockHash: third })).toThrow(ScanSourceError);
    const rand = (n: number): Uint8Array => new Uint8Array(n).map((_, i) => (i * 37 + 11) & 0xff);
    const r = await mk({ rand }).fetch(REQ, new AbortController().signal);
    expect(r.announcements.length).toBeGreaterThan(0);
    // a 84532-only shard served to a 31337 client: TESTNET ok but manifest chain mismatch
    const o = buildShard(84532);
    const t = pirTransport({ 'pir-a.example.org': o.pir, 'pir-b.example.net': o.pir });
    expect(await codeOf(() => mk({ transport: [t, t] }).fetch(REQ))).toBe('PIR_INTEGRITY');
  });
});
