// Killer tests for surviving Stryker mutants in packages/chain-adapters. Drop into packages/chain-adapters/src/.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { encodeAbiParameters, getAddress } from 'viem/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHAINS, findChain, requireEnabledChain } from './config/chains.js';
import { ChainAdapterError } from './errors.js';
import { FAKE, SEPOLIA, manifestJson, payment, recipient } from './fixtures.testutil.js';
import { ANNOUNCEMENT_TOPIC, fetchAnnouncements, type ScanCursor } from './logs.js';
import { sponsorFee, assertSponsorFeeAcceptable, validateFlatSecurityFee } from './fees.js';
import { readPrice, type AggregatorReader } from './quote.js';
import { FakeRpcError, fakeTransport, noSleep } from './rpc.testutil.js';
import { RpcHttpError, createClient, fetchTransport, validateRpcUrl, type RpcClient, type RpcLog, type RpcTransport } from './rpc.js';
import { validateManifest } from './deployments.js';
import { buildPermitTypedData } from './sweep.js';
import type { Hex } from './types.js';

const code = (f: () => unknown): string => {
  try { f(); } catch (e) { return e instanceof ChainAdapterError ? e.message : `other:${(e as Error).name}`; }
  return 'no error';
};
const acode = async (f: () => Promise<unknown>): Promise<string> => {
  try { await f(); } catch (e) { return e instanceof ChainAdapterError ? e.message : `other:${(e as Error).name}`; }
  return 'no error';
};

describe('killers: config table pins (chains.ts, tokens.ts)', () => {
  it('chain table is pinned field by field; only the two testnets are enabled', () => {
    const t = CHAINS.map((c) => [c.chainId, c.name, c.nativeSymbol, c.testnet, c.enabled, c.finalityDepth, c.getLogsMaxRange, c.blockTimeMs]);
    expect(t).toEqual([
      [11155111, 'Ethereum Sepolia', 'ETH', true, true, 64, 1000, 12000],
      [84532, 'Base Sepolia', 'ETH', true, true, 100, 1000, 2000],
      [1, 'Ethereum', 'ETH', false, false, 64, 1000, 12000],
      [8453, 'Base', 'ETH', false, false, 100, 1000, 2000],
      [10, 'OP Mainnet', 'ETH', false, false, 100, 1000, 2000],
      [42161, 'Arbitrum One', 'ETH', false, false, 250, 1000, 250],
      [137, 'Polygon PoS', 'POL', false, false, 128, 1000, 2000],
      [56, 'BNB Smart Chain', 'BNB', false, false, 40, 1000, 750],
      [43114, 'Avalanche C-Chain', 'AVAX', false, false, 12, 1000, 2000],
    ]);
    for (const c of CHAINS) expect(c.nativeDecimals).toBe(18);
    for (const id of [1, 8453, 10, 42161, 137, 56, 43114, 0, 5]) expect(code(() => requireEnabledChain(id))).toMatch(/CHAIN_DISABLED/);
    expect(findChain(11155111)?.enabled).toBe(true);
  });
});

describe('killers: fees.ts', () => {
  it('sponsor fee: capped flag only when the wanted fee is strictly above the cap (fees.ts:149)', () => {
    // amount 10 000: cap = 300, min = 50. gas 272 -> ceil(272*110/100) = 300 == cap
    expect(sponsorFee(10_000n, 272n)).toEqual({ fee: 300n, net: 9_700n, capped: false });
    expect(sponsorFee(10_000n, 273n)).toEqual({ fee: 300n, net: 9_700n, capped: true });
    expect(sponsorFee(10_000n, 0n)).toEqual({ fee: 50n, net: 9_950n, capped: false });
    expect(sponsorFee(10_000n, 45n)).toEqual({ fee: 50n, net: 9_950n, capped: false }); // gas term 50 == min term
    expect(sponsorFee(10_000n, 46n).fee).toBe(51n);
  });
  it('quoted fee: cap boundary and fee < amount (fees.ts:165-166)', () => {
    expect(() => assertSponsorFeeAcceptable(10_000n, 300n)).not.toThrow();
    expect(code(() => assertSponsorFeeAcceptable(10_000n, 301n))).toMatch(/FEE_REJECTED/);
    expect(code(() => assertSponsorFeeAcceptable(1n, 1n))).toMatch(/FEE_REJECTED/);
    expect(() => assertSponsorFeeAcceptable(1n, 0n)).not.toThrow();
  });
  it('flat security fee config is anchored (fees.ts:190,193)', () => {
    const tok = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
    const ok = { feeToken: tok as Hex, amount: 3_000_000n, usdTarget: '3.00' };
    expect(validateFlatSecurityFee(ok)).toBe(ok);
    for (const feeToken of [`zz${tok}`, `${tok}00`, `0x${'0'.repeat(40)}`, `${'0x'}${'0'.repeat(40)}0`]) {
      expect(code(() => validateFlatSecurityFee({ ...ok, feeToken: feeToken as Hex })), feeToken).toMatch(/INVALID_INPUT/);
    }
    for (const usdTarget of ['x3.00', '3.00x', '3.0', '1234567.00', '3,00', '.00']) {
      expect(code(() => validateFlatSecurityFee({ ...ok, usdTarget })), usdTarget).toMatch(/INVALID_INPUT/);
    }
    expect(validateFlatSecurityFee({ ...ok, usdTarget: '123456.99' }).usdTarget).toBe('123456.99');
  });
});

describe('killers: quote.ts readPrice boundaries (oracle sanity)', () => {
  const feed = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
  const NOW = 1_800_000_000n;
  const reader = (over: Partial<Record<string, unknown>> = {}, decimals = 8): AggregatorReader => ({
    decimals: async () => decimals,
    latestRoundData: async () => ({ roundId: 10n, answer: 200_000_000n, startedAt: NOW - 100n, updatedAt: NOW - 100n, answeredInRound: 10n, ...over }) as never,
  });
  const read = (r: AggregatorReader, o: Partial<{ now: bigint; maxAgeSeconds: bigint; maxFutureSkewSeconds: bigint }> = {}) =>
    acode(() => readPrice(r, feed, { now: NOW, maxAgeSeconds: 3600n, ...o }));
  it('maxAgeSeconds is inclusive 1..604800 (quote.ts:85)', async () => {
    expect(await read(reader(), { maxAgeSeconds: 1n })).toMatch(/stale/);
    expect(await read(reader({ updatedAt: NOW - 1n, startedAt: NOW - 1n }), { maxAgeSeconds: 1n })).toBe('no error');
    expect(await read(reader({ updatedAt: NOW - 604_800n }), { maxAgeSeconds: 604_800n })).toBe('no error');
    expect(await read(reader(), { maxAgeSeconds: 0n })).toMatch(/maxAge/);
    expect(await read(reader(), { maxAgeSeconds: 604_801n })).toMatch(/maxAge/);
  });
  it('staleness boundary is exact (quote.ts:104)', async () => {
    expect(await read(reader({ updatedAt: NOW - 3600n }))).toBe('no error');
    expect(await read(reader({ updatedAt: NOW - 3601n }))).toMatch(/stale/);
  });
  it('future skew boundary is exact (quote.ts:103)', async () => {
    expect(await read(reader({ updatedAt: NOW + 60n }))).toBe('no error');
    expect(await read(reader({ updatedAt: NOW + 61n }))).toMatch(/future/);
  });
  it('decimals 0..30, answer <= 2^255-1, roundId <= 2^256-1 (quote.ts:95,99,100)', async () => {
    expect(await read(reader({}, 30))).toBe('no error');
    expect(await read(reader({}, 0))).toBe('no error');
    expect(await read(reader({}, 31))).toMatch(/decimals/);
    expect(await read(reader({}, -1))).toMatch(/decimals/);
    expect(await read(reader({ answer: (1n << 255n) - 1n }))).toBe('no error');
    expect(await read(reader({ answer: 1n << 255n }))).toMatch(/oversized/);
    expect(await read(reader({ answer: 0n }))).toMatch(/non-positive/);
    expect(await read(reader({ roundId: (1n << 256n) - 1n, answeredInRound: (1n << 256n) - 1n }))).toBe('no error');
    expect(await read(reader({ roundId: 1n << 256n, answeredInRound: 1n << 256n }))).toMatch(/roundId/);
    expect(await read(reader({ answeredInRound: 9n }))).toMatch(/earlier round/);
  });
  it('non-bigint round fields are rejected as malformed (quote.ts:94)', async () => {
    for (const k of ['roundId', 'answer', 'startedAt', 'updatedAt', 'answeredInRound']) {
      expect(await read(reader({ [k]: 5 })), k).toMatch(/malformed round data/);
    }
  });
});

describe('killers: rpc.ts validateRpcUrl / client', () => {
  it('insecure schemes other than http/ws are never accepted, even with the localhost opt-in (rpc.ts:86)', () => {
    for (const u of ['ftp://localhost:21', 'file://localhost/etc/passwd', 'gopher://127.0.0.1', 'data://localhost', 'blob:http://localhost/x']) {
      expect(code(() => validateRpcUrl(u, { allowInsecureLocalhost: true })), u).toMatch(/RPC_URL_REJECTED/);
    }
    expect(() => validateRpcUrl('http://localhost:8545', { allowInsecureLocalhost: true })).not.toThrow();
  });

  const chainHex = '0xaa36a7';
  function spy(handler: (m: string, p: unknown[], id: number) => unknown = () => null) {
    const bodies: { method: string; params: unknown[]; id: number }[] = [];
    const inits: { timeoutMs: number; maxBytes: number }[] = [];
    const t: RpcTransport = {
      send(_u, body, init) {
        const req = JSON.parse(body) as { method: string; params: unknown[]; id: number };
        bodies.push(req); inits.push(init);
        const result = req.method === 'eth_chainId' ? chainHex : handler(req.method, req.params, req.id);
        if (typeof result === 'string' && result.startsWith('RAW:')) return Promise.resolve(result.slice(4));
        return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }));
      },
    };
    return { t, bodies, inits };
  }
  it('defaults: 10 s timeout, 2 MiB cap; explicit values are honoured (rpc.ts:208-209)', async () => {
    const a = spy(); await createClient(SEPOLIA, 'https://rpc.example.test', { transport: a.t });
    expect(a.inits[0]).toEqual({ timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024 });
    const b = spy(); await createClient(SEPOLIA, 'https://rpc.example.test', { transport: b.t, timeoutMs: 1234, maxResponseBytes: 4321 });
    expect(b.inits[0]).toEqual({ timeoutMs: 1234, maxBytes: 4321 });
  });
  it('request ids start at 1 and increase; param defaults are exact (rpc.ts:217,235,260)', async () => {
    const s = spy((m) => (m === 'eth_blockNumber' ? '0x10' : m === 'eth_getBlockByNumber' ? null : []));
    const c = await createClient(SEPOLIA, 'https://rpc.example.test', { transport: s.t });
    await c.blockNumber(); await c.getBlock(5n); await c.getLogs({ address: FAKE.announcer, topics: [null, '0x1' as Hex], fromBlock: 1n, toBlock: 2n } as never);
    expect(s.bodies.map((b) => b.id)).toEqual([1, 2, 3, 4]);
    expect(s.bodies[0]).toMatchObject({ method: 'eth_chainId', params: [] });
    expect(s.bodies[1]).toMatchObject({ method: 'eth_blockNumber', params: [] });
    expect(s.bodies[2]).toMatchObject({ method: 'eth_getBlockByNumber', params: ['0x5', false] });
    expect(s.bodies[3]!.params).toEqual([{ address: FAKE.announcer, topics: [null, '0x1'], fromBlock: '0x1', toBlock: '0x2' }]);
  });
  it('response size cap is inclusive (rpc.ts:222)', async () => {
    const mk = (extra: number) => {
      const t: RpcTransport = { send: (_u, body) => { const id = (JSON.parse(body) as { id: number }).id; const base = JSON.stringify({ jsonrpc: '2.0', id, result: '0xaa36a7' }); return Promise.resolve(base + ' '.repeat(extra)); } };
      return t;
    };
    const exact = JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0xaa36a7' }).length;
    await expect(createClient(SEPOLIA, 'https://rpc.example.test', { transport: mk(0), maxResponseBytes: exact })).resolves.toBeDefined();
    expect(await acode(() => createClient(SEPOLIA, 'https://rpc.example.test', { transport: mk(1), maxResponseBytes: exact }))).toMatch(/RESPONSE_TOO_LARGE/);
  });
  it('getBlock shape checks (rpc.ts:240-244)', async () => {
    const H = `0x${'1'.repeat(64)}`;
    const blk = (o: unknown) => acode(async () => (await createClient(SEPOLIA, 'https://rpc.example.test', { transport: spy(() => o).t })).getBlock(5n));
    expect(await blk([])).toMatch(/malformed block/);
    expect(await blk('x')).toMatch(/malformed block/);
    expect(await blk({ number: '0x5', hash: [H], parentHash: H })).toMatch(/malformed block hash/);
    expect(await blk({ number: '0x5', hash: H, parentHash: [H] })).toMatch(/malformed block hash/);
    expect(await blk({ number: '0x5', hash: H, parentHash: H })).toBe('no error');
  });
  it('json-rpc error shapes: error:null / error:"x" is "json-rpc error 0", not a TypeError (rpc.ts:300)', async () => {
    for (const err of [null, 'x', 5, [], { code: '1' }]) {
      const t: RpcTransport = { send: (_u, body) => Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: (JSON.parse(body) as { id: number }).id, error: err })) };
      const m = await acode(() => createClient(SEPOLIA, 'https://rpc.example.test', { transport: t, retries: 0 }));
      expect(m, JSON.stringify(err)).toMatch(/json-rpc error 0/);
    }
  });
  it('retry policy: -32005/-32097/429/5xx/transport retried, others not (rpc.ts:282-284)', async () => {
    const attempts = async (fail: () => unknown) => {
      let n = 0;
      const t: RpcTransport = { send: (_u, body) => { n++; const id = (JSON.parse(body) as { id: number }).id; try { const r = fail(); return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id, result: r })); } catch (e) { if (e instanceof FakeRpcError) return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id, error: { code: e.rpcCode } })); return Promise.reject(e as Error); } } };
      await acode(() => createClient(SEPOLIA, 'https://rpc.example.test', { transport: t, retries: 2, sleep: noSleep, random: () => 0 }));
      return n;
    };
    expect(await attempts(() => { throw new FakeRpcError(-32005); })).toBe(3);
    expect(await attempts(() => { throw new FakeRpcError(-32097); })).toBe(3);
    expect(await attempts(() => { throw new FakeRpcError(-32000); })).toBe(1);
    expect(await attempts(() => { throw new FakeRpcError(32097); })).toBe(1);
    expect(await attempts(() => { throw new RpcHttpError(429); })).toBe(3);
    expect(await attempts(() => { throw new RpcHttpError(503); })).toBe(3);
    expect(await attempts(() => { throw new RpcHttpError(404); })).toBe(1);
    expect(await attempts(() => { throw new ChainAdapterError('RESPONSE_TOO_LARGE', 'x'); })).toBe(1);
  });
  it('the default sleep/random are used when none are injected and stay bounded (rpc.ts:166-172)', async () => {
    let n = 0;
    const t: RpcTransport = { send: (_u, body) => { n++; const id = (JSON.parse(body) as { id: number }).id; return n < 3 ? Promise.reject(new Error('net')) : Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id, result: '0xaa36a7' })); } };
    const t0 = Date.now();
    await createClient(SEPOLIA, 'https://rpc.example.test', { transport: t, retries: 2, baseDelayMs: 20 });
    expect(n).toBe(3);
    expect(Date.now() - t0).toBeLessThan(200);   // full-jitter: <= 20 + 40 ms
  });
});

describe('killers: rpc.ts fetchTransport against a real loopback server', () => {
  let srv: Server; let base = ''; const seen: { headers: Record<string, unknown>; method?: string }[] = [];
  beforeAll(async () => {
    srv = createServer((req, res) => {
      seen.push({ headers: req.headers, ...(req.method === undefined ? {} : { method: req.method }) });
      if (req.url === '/redirect') { res.writeHead(302, { location: '/ok' }); res.end(); return; }
      if (req.url === '/500') { res.writeHead(500); res.end('x'); return; }
      if (req.url === '/hang') return;
      const n = Number(req.url!.slice(1)) || 10;
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('a'.repeat(n));
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  });
  afterAll(() => { srv.close(); });
  const send = (path: string, init = { timeoutMs: 2000, maxBytes: 1000 }) => fetchTransport.send(base + path, '{}', init);
  it('POSTs JSON with content-type/accept headers and returns the body', async () => {
    expect(await send('/10')).toBe('a'.repeat(10));
    const h = seen.at(-1)!;
    expect(h.method).toBe('POST');
    expect(h.headers['content-type']).toBe('application/json');
    expect(h.headers['accept']).toBe('application/json');
  });
  it('body cap is inclusive: exactly maxBytes ok, one more is RESPONSE_TOO_LARGE (rpc.ts:117)', async () => {
    expect(await send('/1000')).toHaveLength(1000);
    expect(await acode(() => send('/1001'))).toMatch(/RESPONSE_TOO_LARGE/);
  });
  it('redirects, HTTP errors and timeouts fail closed (rpc.ts:101-116)', async () => {
    expect(await acode(() => send('/redirect'))).toMatch(/RPC_FAILURE/);
    await expect(send('/500')).rejects.toBeInstanceOf(RpcHttpError);
    const t0 = Date.now();
    expect(await acode(() => send('/hang', { timeoutMs: 150, maxBytes: 10 }))).toMatch(/RPC_FAILURE/);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it('only http(s) URLs are accepted by the fetch transport (rpc.ts:95)', async () => {
    for (const u of ['ws://127.0.0.1:1', 'wss://x.test', 'ftp://x', 'file:///etc/passwd', 'HTTP://127.0.0.1:1', 'xhttp:']) {
      expect(await acode(() => fetchTransport.send(u, '{}', { timeoutMs: 100, maxBytes: 10 })), u).toMatch(/RPC_URL_REJECTED/);
    }
  });
});

describe('killers: logs.ts fetchAnnouncements', () => {
  const ANN = FAKE.announcer;
  const word = (a: string): Hex => `0x${a.replace('0x', '').toLowerCase().padStart(64, '0')}`;
  const bh = (n: number, fork = 0): Hex => `0x${(n + 1000 * fork).toString(16).padStart(64, '0')}`;
  const { meta } = recipient();
  const PAY = payment(meta);
  const eph = (): Hex => `0x${Buffer.from(PAY.ephemeralPublicKey).toString('hex')}`;
  const mkLog = (block: number, index = 0): RpcLog => ({
    address: ANN,
    topics: [ANNOUNCEMENT_TOPIC, word('0x1'), word(PAY.stealthAddress), word(FAKE.router)],
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [eph(), `0x${'ab'}${'00'.repeat(56)}` as Hex]),
    blockNumber: `0x${block.toString(16)}`, blockHash: bh(block), logIndex: `0x${index.toString(16)}`,
  });
  interface Chain { head: number; fork: number; requests: { from: bigint; to: bigint; topics: unknown }[]; logs: RpcLog[] }
  async function client(chain: Chain): Promise<RpcClient> {
    const t = fakeTransport((m, p) => {
      if (m === 'eth_chainId') return '0xaa36a7';
      if (m === 'eth_blockNumber') return `0x${chain.head.toString(16)}`;
      if (m === 'eth_getBlockByNumber') { const n = Number(BigInt(p[0] as string)); return n > chain.head ? null : { number: p[0], hash: bh(n, chain.fork), parentHash: bh(Math.max(0, n - 1), chain.fork) }; }
      if (m === 'eth_getLogs') {
        const f = p[0] as { fromBlock: string; toBlock: string; topics: unknown };
        chain.requests.push({ from: BigInt(f.fromBlock), to: BigInt(f.toBlock), topics: f.topics });
        return chain.logs.filter((l) => BigInt(l.blockNumber) >= BigInt(f.fromBlock) && BigInt(l.blockNumber) <= BigInt(f.toBlock));
      }
      return null;
    });
    return createClient(SEPOLIA, 'https://rpc.example.test', { transport: t, sleep: noSleep, retries: 0 });
  }
  const run = async (c: Chain, cursor: ScanCursor, extra = {}) =>
    fetchAnnouncements({ chain: { ...SEPOLIA, getLogsMaxRange: 10, finalityDepth: 5 }, client: await client(c), announcer: ANN, cursor, ...extra });

  it('every eth_getLogs carries [Announcement topic0, scheme topic] (logs.ts:207)', async () => {
    const c: Chain = { head: 12, fork: 0, requests: [], logs: [mkLog(3)] };
    await run(c, { nextBlock: 0n });
    expect(c.requests.length).toBe(2);
    for (const r of c.requests) expect(r.topics).toEqual([ANNOUNCEMENT_TOPIC, word('0x1')]);
    const c2: Chain = { head: 3, fork: 0, requests: [], logs: [] };
    await run(c2, { nextBlock: 0n }, { schemeId: 2n });
    expect(c2.requests[0]!.topics).toEqual([ANNOUNCEMENT_TOPIC, word('0x2')]);
  });
  it('ranges are inclusive and clamp exactly at the head (logs.ts:203)', async () => {
    for (const head of [9, 10, 11, 19]) {
      const c: Chain = { head, fork: 0, requests: [], logs: [] };
      const r = await run(c, { nextBlock: 0n });
      expect(c.requests.map((x) => [Number(x.from), Number(x.to)])).toEqual(head < 10 ? [[0, head]] : head < 20 ? [[0, 9], [10, head]] : []);
      expect(r.cursor.nextBlock).toBe(BigInt(head + 1));
    }
  });
  it('nothing is fetched when the cursor is already past the head', async () => {
    const c: Chain = { head: 5, fork: 0, requests: [], logs: [] };
    const r = await run(c, { nextBlock: 6n });
    expect(c.requests).toEqual([]);
    expect(r.cursor).toEqual({ nextBlock: 6n });
    expect(r.truncated).toBe(false);
  });
  it('reorg rolls back exactly finalityDepth - 1 below the last stored block, never below 0 (logs.ts:182)', async () => {
    const stale = (n: number): ScanCursor => ({ nextBlock: BigInt(n + 1), last: { number: BigInt(n), hash: bh(n, 7) } }); // hash from another fork
    for (const [n, expectNext] of [[20, 16n], [5, 1n], [4, 0n], [3, 0n], [0, 0n]] as const) {
      const c: Chain = { head: 30, fork: 0, requests: [], logs: [] };
      const r = await run(c, stale(n));
      expect(r.reorg, String(n)).toEqual({ rolledBackTo: expectNext });
      expect(c.requests[0]!.from).toBe(expectNext);
    }
  });
  it('a matching stored hash means no reorg and scanning resumes at nextBlock', async () => {
    const c: Chain = { head: 30, fork: 0, requests: [], logs: [] };
    const r = await run(c, { nextBlock: 21n, last: { number: 20n, hash: bh(20) } });
    expect(r.reorg).toBeUndefined();
    expect(c.requests[0]!.from).toBe(21n);
  });
  it('log index bound is 0xffffff (logs.ts:113)', async () => {
    const mk = (idx: number): Chain => ({ head: 3, fork: 0, requests: [], logs: [{ ...mkLog(2), logIndex: `0x${idx.toString(16)}` }] });
    expect((await run(mk(0xffffff), { nextBlock: 0n })).announcements.length).toBe(1);
    expect(await acode(async () => run(mk(0x1000000), { nextBlock: 0n }))).toMatch(/INVALID_LOG/);
  });
});

describe('killers: deployments.ts manifest anchoring (module-level regexes)', () => {
  const CHAIN = 11155111;
  const rej = (m: Record<string, unknown>, re = /INVALID_MANIFEST/) => expect(code(() => validateManifest(m, CHAIN))).toMatch(re);
  const mut = (f: (m: Record<string, any>) => void): Record<string, unknown> => { const m = manifestJson() as Record<string, any>; f(m); return m; };
  it('hashes, commit, solc, date, signature must match completely', () => {
    const h = `0x${'1'.repeat(64)}`;
    for (const bad of [`zz${h}`, `${h}00`, `0x${'1'.repeat(63)}`, `0x${'0'.repeat(64)}`, `0x${'0'.repeat(63)}1x`]) {
      rej(mut((m) => { m.deployTx.router = bad; }));
      rej(mut((m) => { m.bytecodeHashes.sweepRelayer = bad; }));
    }
    for (const bad of [`x${'a'.repeat(40)}`, `${'a'.repeat(40)}x`, 'a'.repeat(39), 'A'.repeat(40)]) rej(mut((m) => { m.commit = bad; }));
    for (const bad of ['x0.8.28', '0.8.28x', '0.8.28+commit.7893614', '0.8.28+commit.7893614ax', '0.8.', '0.7.6', '1.0.0']) rej(mut((m) => { m.solcVersion = bad; }));
    for (const bad of ['x2026-01-01T00:00:00Z', '2026-01-01T00:00:00Zx', '2026-01-01', '2026-1-01T00:00:00Z', '2026-01-01T0:00:00Z', '2026-01-01T00:00:00', '2026-13-45T99:99:99Z']) rej(mut((m) => { m.date = bad; }));
    for (const ok of ['2026-01-01T00:00:00Z', '2026-01-01T00:00:00.123Z', '2026-01-01T00:00:00+02:00']) expect(code(() => validateManifest(mut((m) => { m.date = ok; }), CHAIN)), ok).toBe('no error');
    for (const bad of ['0xzz', '0x', 'abcd', '0xabcdx', 'x0xabcd', 5]) rej(mut((m) => { m.signature = bad; }));
  });
  it('policy fields: all-or-none, flat fee is a canonical uint256 decimal, policy hashes anchored', () => {
    const pol = (over: Record<string, unknown> = {}) => mut((m) => {
      m.policyImplementation = getAddress('0x0000000000000000000000000000000000000e55');
      m.policyFactory = getAddress('0x0000000000000000000000000000000000000f66');
      m.policyFeeToken = getAddress('0x0000000000000000000000000000000000000a77');
      m.policyFlatFee = '3000000';
      m.policyFeeRecipient = getAddress('0x0000000000000000000000000000000000000b88');
      m.deployTx.policyImplementation = `0x${'5'.repeat(64)}`; m.deployTx.policyFactory = `0x${'6'.repeat(64)}`;
      m.bytecodeHashes.policyImplementation = `0x${'7'.repeat(64)}`; m.bytecodeHashes.policyFactory = `0x${'8'.repeat(64)}`;
      Object.assign(m, over);
    });
    expect(code(() => validateManifest(pol(), CHAIN))).toBe('no error');
    for (const bad of ['x1', '1x', '01', '-1', '1.0', '', `${1n << 256n}`, '9'.repeat(79)]) rej(pol({ policyFlatFee: bad }));
    expect(code(() => validateManifest(pol({ policyFlatFee: `${(1n << 256n) - 1n}` }), CHAIN))).toBe('no error');
    expect(code(() => validateManifest(pol({ policyFlatFee: '0' }), CHAIN))).toBe('no error');
    for (const k of ['policyImplementation', 'policyFactory', 'policyFeeToken', 'policyFlatFee', 'policyFeeRecipient']) {
      const m = pol(); delete (m as Record<string, unknown>)[k]; rej(m);
    }
    rej(pol({ policyFeeRecipient: getAddress('0x0000000000000000000000000000000000000e55') }));
    const m = pol(); (m.deployTx as Record<string, unknown>).policyFactory = `x${'6'.repeat(64)}`; rej(m);
    const m2 = pol(); (m2.bytecodeHashes as Record<string, unknown>).policyImplementation = `0x${'7'.repeat(64)}0`; rej(m2);
  });
  it('non-plain objects and non-numeric chain ids are rejected (deployments.ts:53,92)', () => {
    class X { constructor(o: object) { Object.assign(this, o); } }
    rej(new X(manifestJson()) as never);
    rej(mut((m) => { m.chainId = '11155111'; }));
    rej(mut((m) => { m.chainId = 0; }));
    rej(mut((m) => { m.chainId = -5; }));
    rej(mut((m) => { m.chainId = 2 ** 53; }));
    expect(() => validateManifest(manifestJson(), 11155111)).not.toThrow();
  });
});

describe('killers: sweep.ts permit typed data bounds', () => {
  const token = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
  const owner = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  const spender = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';
  const mk = (o: { name?: unknown; version?: unknown; nonce?: unknown; chainId?: number } = {}) =>
    acode(() => buildPermitTypedData({ chainId: o.chainId ?? 1, token, owner, spender, value: 1n, deadline: 1n, reader: { name: async () => (o.name ?? 'USD Coin') as string, version: async () => (o.version ?? '2') as string, nonce: async () => (o.nonce ?? 0n) as bigint } }));
  it('name <= 128, version <= 16, non-empty; nonce uint256; chainId >= 1 (sweep.ts:268-278)', async () => {
    expect(await mk({ name: 'n'.repeat(128) })).toBe('no error');
    expect(await mk({ name: 'n'.repeat(129) })).toMatch(/UNSUPPORTED_TOKEN/);
    expect(await mk({ name: '' })).toMatch(/UNSUPPORTED_TOKEN/);
    expect(await mk({ name: 5 })).toMatch(/UNSUPPORTED_TOKEN/);
    expect(await mk({ version: 'v'.repeat(16) })).toBe('no error');
    expect(await mk({ version: 'v'.repeat(17) })).toMatch(/UNSUPPORTED_TOKEN/);
    expect(await mk({ version: '' })).toMatch(/UNSUPPORTED_TOKEN/);
    expect(await mk({ version: 2 })).toMatch(/UNSUPPORTED_TOKEN/);
    expect(await mk({ nonce: (1n << 256n) - 1n })).toBe('no error');
    expect(await mk({ nonce: 1n << 256n })).toMatch(/UNSUPPORTED_TOKEN/);
    expect(await mk({ nonce: -1n })).toMatch(/UNSUPPORTED_TOKEN/);
    expect(await mk({ nonce: 0 })).toMatch(/UNSUPPORTED_TOKEN/);
    expect(await mk({ chainId: 1 })).toBe('no error');
    expect(await mk({ chainId: 0 })).toMatch(/INVALID_INPUT/);
    expect(await mk({ chainId: 1.5 })).toMatch(/INVALID_INPUT/);
  });
});

// ---- router.ts ----
import { validateManifest as vm } from './deployments.js';
import { invoiceFor } from './fixtures.testutil.js';
import { MAX_ROUTER_GROSS } from './fees.js';
import { assertPreviewMatchesCalldata, buildPaymentTx, type BuildPaymentInput } from './router.js';

describe('killers: router.ts buildPaymentTx / preview', () => {
  const deployment = vm(manifestJson(), 11155111);
  const { meta } = recipient();
  const pay = payment(meta);
  const SIG: Hex = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b`;
  const input = (over: Partial<BuildPaymentInput> = {}): BuildPaymentInput =>
    ({ chain: SEPOLIA, deployment, invoice: invoiceFor(meta, {}), payment: pay, grossAmount: 1_000_000_000n, deadline: 4_000_000_000n, ...over });
  const c = (over: Partial<BuildPaymentInput>) => code(() => buildPaymentTx(input(over)));

  it('gross is [1, MAX_ROUTER_GROSS] and deadline [1, 2^256-1] (router.ts:125-126)', () => {
    expect(c({ grossAmount: 1n })).toBe('no error');
    expect(c({ grossAmount: 0n })).toMatch(/INVALID_INPUT/);
    expect(c({ grossAmount: MAX_ROUTER_GROSS })).toBe('no error');
    expect(c({ grossAmount: MAX_ROUTER_GROSS + 1n })).toMatch(/INVALID_INPUT/);
    expect(c({ grossAmount: 5 as never })).toMatch(/INVALID_INPUT/);
    expect(c({ deadline: 1n })).toBe('no error');
    expect(c({ deadline: 0n })).toMatch(/INVALID_INPUT/);
    expect(c({ deadline: (1n << 256n) - 1n })).toBe('no error');
    expect(c({ deadline: 1n << 256n })).toMatch(/INVALID_INPUT/);
    expect(c({ deadline: 5 as never })).toMatch(/INVALID_INPUT/);
  });
  it('deadline must be strictly after now when now is given (router.ts:127)', () => {
    expect(c({ deadline: 100n, now: 100n })).toMatch(/deadline already passed/);
    expect(c({ deadline: 101n, now: 100n })).toBe('no error');
    expect(c({ deadline: 1n })).toBe('no error');
  });
  it('buffer bounds (router.ts:182-183) and permit v / shape (router.ts:205-208)', () => {
    const M = (1n << 256n) - 1n;
    expect(c({ buffer: { bufferWei: M, maxBufferWei: M } })).toBe('no error');
    expect(c({ buffer: { bufferWei: 1n << 256n, maxBufferWei: 1n << 256n } })).toMatch(/INVALID_INPUT/);
    expect(c({ buffer: { bufferWei: 1n, maxBufferWei: 1n << 256n } })).toMatch(/INVALID_INPUT/);
    expect(c({ permitSignature: SIG })).toBe('no error');
    for (const bad of [`zz${SIG}`, `${SIG}00`, `${SIG.slice(0, -2)}`]) {
      expect(c({ permitSignature: bad as Hex }), bad).toMatch(/INVALID_INPUT/);
    }
    // v outside {0,1,27,28}: rejected (viem's parseSignature throws a bare Error here: see report, finding "permit v error type")
    expect(c({ permitSignature: `0x${'11'.repeat(32)}${'22'.repeat(32)}1d` as Hex })).not.toBe('no error');
    expect(c({ permitSignature: `0x${'11'.repeat(32)}${'22'.repeat(32)}01` as Hex })).toBe('no error');
  });
  it('a preview built for another chain id is rejected before decoding (router.ts:367)', () => {
    const b = buildPaymentTx(input());
    expect(() => assertPreviewMatchesCalldata(b.preview, b.tx, 11155111)).not.toThrow();
    expect(code(() => assertPreviewMatchesCalldata({ ...b.preview, chainId: 1 } as never, b.tx, 11155111))).toMatch(/PREVIEW_MISMATCH.*chainId/);
    expect(code(() => assertPreviewMatchesCalldata(b.preview, b.tx, 84532))).toMatch(/PREVIEW_MISMATCH|CHAIN/);
  });
  it('permit presence and values must agree between preview and calldata (router.ts:377-383)', () => {
    const b = buildPaymentTx(input({ permitSignature: SIG }));
    expect(() => assertPreviewMatchesCalldata(b.preview, b.tx, 11155111)).not.toThrow();
    const p = b.preview as unknown as { permit: { v: number; r: string; s: string } };
    expect(code(() => assertPreviewMatchesCalldata({ ...b.preview, permit: undefined } as never, b.tx, 11155111))).toMatch(/PREVIEW_MISMATCH/);
    expect(code(() => assertPreviewMatchesCalldata({ ...b.preview, permit: { ...p.permit, v: 28 } } as never, b.tx, 11155111))).toMatch(/PREVIEW_MISMATCH/);
    expect(code(() => assertPreviewMatchesCalldata({ ...b.preview, permit: { ...p.permit, r: `0x${'33'.repeat(32)}` } } as never, b.tx, 11155111))).toMatch(/PREVIEW_MISMATCH/);
    expect(code(() => assertPreviewMatchesCalldata({ ...b.preview, permit: { ...p.permit, s: `0x${'33'.repeat(32)}` } } as never, b.tx, 11155111))).toMatch(/PREVIEW_MISMATCH/);
    const plain = buildPaymentTx(input());
    expect(code(() => assertPreviewMatchesCalldata({ ...plain.preview, permit: p.permit } as never, plain.tx, 11155111))).toMatch(/PREVIEW_MISMATCH/);
    // hex casing of r/s is not a difference
    expect(() => assertPreviewMatchesCalldata({ ...b.preview, permit: { ...p.permit, r: p.permit.r.toUpperCase().replace('0X', '0x') } } as never, b.tx, 11155111)).not.toThrow();
  });
});
