import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChainAdapterError } from './errors.js';
import { SEPOLIA } from './fixtures.testutil.js';
import {
  RpcHttpError, createClient, createReconciledClient, fetchTransport, parseQuantity, requestWithFallbackCheck, validateRpcUrl, type RpcTransport,
} from './rpc.js';
import { FakeRpcError, fakeTransport, noSleep } from './rpc.testutil.js';

const URL_OK = 'https://rpc.example.test/v1';
const node = (chainHex = '0xaa36a7') => fakeTransport((m) => (m === 'eth_chainId' ? chainHex : m === 'eth_blockNumber' ? '0x10' : null));
const opts = { sleep: noSleep, random: () => 0.5 } as const;

describe('validateRpcUrl', () => {
  it('accepts https and wss', () => {
    expect(validateRpcUrl(URL_OK)).toBe(URL_OK);
    expect(validateRpcUrl('wss://rpc.example.test/ws')).toContain('wss://');
  });
  it.each([
    'http://rpc.example.test',
    'ws://rpc.example.test',
    'ftp://rpc.example.test',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://user:pw@rpc.example.test',
    'https://user@rpc.example.test',
    'https://:pw@rpc.example.test',
    'https://rpc.example.test/#frag',
    'not a url',
    '',
    'http://localhost:8545',
  ])('rejects %s', (u) => {
    expect(() => validateRpcUrl(u)).toThrow(/RPC_URL_REJECTED/);
  });
  it('allows loopback http only with the explicit flag', () => {
    for (const h of ['http://localhost:8545', 'http://127.0.0.1:8545', 'http://[::1]:8545', 'ws://localhost:8546']) {
      expect(() => validateRpcUrl(h, { allowInsecureLocalhost: true })).not.toThrow();
    }
    expect(() => validateRpcUrl('http://rpc.example.test', { allowInsecureLocalhost: true })).toThrow(/RPC_URL_REJECTED/);
    expect(() => validateRpcUrl('http://localhost.evil.test', { allowInsecureLocalhost: true })).toThrow(/RPC_URL_REJECTED/);
  });
  it('error messages never echo the URL or credentials', () => {
    try {
      validateRpcUrl('https://alice:secret@rpc.example.test');
    } catch (e) {
      expect((e as Error).message).not.toMatch(/alice|secret|example/);
    }
  });
});

describe('parseQuantity', () => {
  it('accepts canonical quantities only', () => {
    expect(parseQuantity('0x0')).toBe(0n);
    expect(parseQuantity('0xaa36a7')).toBe(11155111n);
    for (const bad of ['0x', '0x01', '0xAA', '10', 5, null, undefined, '0x' + 'f'.repeat(65)]) expect(() => parseQuantity(bad)).toThrow(ChainAdapterError);
  });
});

describe('createClient', () => {
  it('verifies eth_chainId', async () => {
    const c = await createClient(SEPOLIA, URL_OK, { transport: node(), ...opts });
    expect(c.chainId).toBe(11155111);
    expect(await c.blockNumber()).toBe(16n);
  });
  it('rejects a wrong chain id (fail closed)', async () => {
    await expect(createClient(SEPOLIA, URL_OK, { transport: node('0x1'), ...opts })).rejects.toThrow(/CHAIN_MISMATCH/);
  });
  it('rejects a malformed chain id', async () => {
    await expect(createClient(SEPOLIA, URL_OK, { transport: node('11155111'), ...opts })).rejects.toThrow(/malformed quantity/);
  });
  it('rejects bad URLs before any request', async () => {
    const calls: { method: string; params: unknown[] }[] = [];
    await expect(createClient(SEPOLIA, 'http://x.test', { transport: fakeTransport(() => '0x1', calls), ...opts })).rejects.toThrow(/RPC_URL_REJECTED/);
    expect(calls).toHaveLength(0);
  });
  it('retries transient failures with jittered back-off, then succeeds', async () => {
    let n = 0;
    const sleeps: number[] = [];
    const t: RpcTransport = {
      send: (u, b, i) => {
        n++;
        if (n < 3) return Promise.reject(new RpcHttpError(503));
        return node().send(u, b, i);
      },
    };
    const c = await createClient(SEPOLIA, URL_OK, { transport: t, retries: 2, baseDelayMs: 100, random: () => 0.5, sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); } });
    expect(c.chainId).toBe(11155111);
    expect(n).toBe(3);
    expect(sleeps).toEqual([50, 100]);
  });
  it('bounds retries', async () => {
    let n = 0;
    const t: RpcTransport = { send: () => { n++; return Promise.reject(new RpcHttpError(500)); } };
    await expect(createClient(SEPOLIA, URL_OK, { transport: t, retries: 2, ...opts })).rejects.toThrow(/http status 500/);
    expect(n).toBe(3);
    n = 0;
    await expect(createClient(SEPOLIA, URL_OK, { transport: t, retries: 99, ...opts })).rejects.toThrow(ChainAdapterError);
    expect(n).toBe(6); // clamped to 5 retries
    n = 0;
    await expect(createClient(SEPOLIA, URL_OK, { transport: t, retries: -3, ...opts })).rejects.toThrow(ChainAdapterError);
    expect(n).toBe(1);
  });
  it('does not retry 4xx or malformed responses', async () => {
    let n = 0;
    const t: RpcTransport = { send: () => { n++; return Promise.reject(new RpcHttpError(400)); } };
    await expect(createClient(SEPOLIA, URL_OK, { transport: t, ...opts })).rejects.toThrow(/400/);
    expect(n).toBe(1);
    n = 0;
    const t2: RpcTransport = { send: () => { n++; return Promise.resolve('not json'); } };
    await expect(createClient(SEPOLIA, URL_OK, { transport: t2, ...opts })).rejects.toThrow(/not JSON/);
    expect(n).toBe(1);
  });
  it('retries JSON-RPC rate limits but not other JSON-RPC errors', async () => {
    let n = 0;
    const limited = fakeTransport((m) => { if (m === 'eth_chainId') { n++; throw new FakeRpcError(-32005); } return null; });
    await expect(createClient(SEPOLIA, URL_OK, { transport: limited, retries: 1, ...opts })).rejects.toThrow(/json-rpc error -32005/);
    expect(n).toBe(2);
    n = 0;
    const other = fakeTransport(() => { n++; throw new FakeRpcError(-32000); });
    await expect(createClient(SEPOLIA, URL_OK, { transport: other, ...opts })).rejects.toThrow(/-32000/);
    expect(n).toBe(1);
  });
  it('unknown thrown values from a custom transport are wrapped and retried', async () => {
    let n = 0;
    const t: RpcTransport = { // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    send: () => { n++; return Promise.reject('weird'); } };
    await expect(createClient(SEPOLIA, URL_OK, { transport: t, retries: 1, ...opts })).rejects.toThrow(/transport failure/);
    expect(n).toBe(2);
  });
  it('caps response size (string defence in depth) and passes the cap to the transport', async () => {
    let seen = 0;
    const t: RpcTransport = { send: (_u, _b, i) => { seen = i.maxBytes; return Promise.resolve('x'.repeat(2000)); } };
    await expect(createClient(SEPOLIA, URL_OK, { transport: t, maxResponseBytes: 1000, ...opts })).rejects.toThrow(/RESPONSE_TOO_LARGE/);
    expect(seen).toBe(1000);
  });
  it.each([
    ['batch array', '[{"jsonrpc":"2.0","id":1,"result":"0xaa36a7"}]', /not an object/],
    ['wrong id', '{"jsonrpc":"2.0","id":999,"result":"0xaa36a7"}', /envelope/],
    ['wrong version', '{"jsonrpc":"1.0","id":1,"result":"0xaa36a7"}', /envelope/],
    ['no result', '{"jsonrpc":"2.0","id":1}', /missing result/],
    ['null json', 'null', /not an object/],
    ['error without code', '{"jsonrpc":"2.0","id":1,"error":"x"}', /json-rpc error 0/],
  ])('rejects %s', async (_n, raw, re) => {
    const t: RpcTransport = { send: () => Promise.resolve(raw) };
    await expect(createClient(SEPOLIA, URL_OK, { transport: t, ...opts })).rejects.toThrow(re);
  });

  describe('typed helpers', () => {
    const hash = (c: string): string => `0x${c.repeat(64)}`;
    const mk = (blk: unknown, logs: unknown = []) =>
      createClient(SEPOLIA, URL_OK, {
        transport: fakeTransport((m) => (m === 'eth_chainId' ? '0xaa36a7' : m === 'eth_getBlockByNumber' ? blk : m === 'eth_getLogs' ? logs : null)),
        ...opts,
      });
    it('getBlock validates hashes and number', async () => {
      const ok = await mk({ number: '0x5', hash: hash('a'), parentHash: hash('b') });
      expect(await ok.getBlock(5n)).toEqual({ number: 5n, hash: hash('a'), parentHash: hash('b') });
      expect(await (await mk(null)).getBlock(5n)).toBeNull();
      await expect((await mk({ number: '0x6', hash: hash('a'), parentHash: hash('b') })).getBlock(5n)).rejects.toThrow(/mismatch/);
      await expect((await mk({ number: '0x5', hash: '0x12', parentHash: hash('b') })).getBlock(5n)).rejects.toThrow(/block hash/);
      await expect((await mk({ number: '0x5', hash: hash('a'), parentHash: 7 })).getBlock(5n)).rejects.toThrow(/block hash/);
      await expect((await mk('str')).getBlock(5n)).rejects.toThrow(/malformed block/);
      await expect((await mk([])).getBlock(5n)).rejects.toThrow(/malformed block/);
    });
    it('getLogs requires an array', async () => {
      const f = { address: '0x0000000000000000000000000000000000000a11' as const, topics: [null], fromBlock: 1n, toBlock: 2n };
      expect(await (await mk(null, [])).getLogs(f)).toEqual([]);
      await expect((await mk(null, { a: 1 })).getLogs(f)).rejects.toThrow(/not an array/);
    });
  });
});

describe('requestWithFallbackCheck', () => {
  it('returns the agreed result and detects disagreement / chain mismatch', async () => {
    const mkc = (v: unknown, chain = '0xaa36a7') =>
      createClient(SEPOLIA, URL_OK, { transport: fakeTransport((m) => (m === 'eth_chainId' ? chain : v)), ...opts });
    const a = await mkc({ x: 1, y: [1, 2] });
    const b = await mkc({ y: [1, 2], x: 1 });
    expect(await requestWithFallbackCheck(a, b, 'eth_foo', [])).toEqual({ x: 1, y: [1, 2] });
    const c = await mkc({ x: 2, y: [1, 2] });
    await expect(requestWithFallbackCheck(a, c, 'eth_foo', [])).rejects.toThrow(/disagree/);
    const d = await mkc('str');
    const e = await mkc('str');
    expect(await requestWithFallbackCheck(d, e, 'eth_foo', [])).toBe('str');
    await expect(requestWithFallbackCheck(a, { ...b, chainId: 1 }, 'eth_foo', [])).rejects.toThrow(/CHAIN_MISMATCH/);
  });
});

describe('fetchTransport (global fetch stubbed, no network)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const stream = (chunks: string[]): ReadableStream<Uint8Array> =>
    new ReadableStream({ start(c) { for (const s of chunks) c.enqueue(new TextEncoder().encode(s)); c.close(); } });
  const init = { timeoutMs: 1000, maxBytes: 100 };

  it('reads a small body', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(stream(['{"a"', ':1}']), { status: 200 }))));
    expect(await fetchTransport.send(URL_OK, '{}', init)).toBe('{"a":1}');
  });
  it('enforces the streamed size cap', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(stream(['x'.repeat(60), 'x'.repeat(60)]), { status: 200 }))));
    await expect(fetchTransport.send(URL_OK, '{}', init)).rejects.toThrow(/RESPONSE_TOO_LARGE/);
  });
  it('maps HTTP errors, null bodies, network errors and non-http URLs', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('no', { status: 429 }))));
    await expect(fetchTransport.send(URL_OK, '{}', init)).rejects.toMatchObject({ status: 429, retryable: true });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('no', { status: 404 }))));
    await expect(fetchTransport.send(URL_OK, '{}', init)).rejects.toMatchObject({ status: 404, retryable: false });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, body: null })));
    await expect(fetchTransport.send(URL_OK, '{}', init)).rejects.toThrow(/empty body/);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ECONNRESET https://secret@x'))));
    await expect(fetchTransport.send(URL_OK, '{}', init)).rejects.toThrow(/transport error or timeout$/);
    await expect(fetchTransport.send('wss://x.test', '{}', init)).rejects.toThrow(/needs http/);
  });
  it('times out by aborting', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: string, i: RequestInit) => new Promise((_r, rej) => { i.signal?.addEventListener('abort', () => { rej(new Error('aborted')); }); })));
    await expect(fetchTransport.send(URL_OK, '{}', { timeoutMs: 10, maxBytes: 10 })).rejects.toThrow(/timeout/);
  });
});

describe('chain id re-verification (S3-14)', () => {
  const mk = (state: { chain: string; calls: string[] }, extra = {}) =>
    createClient(SEPOLIA, URL_OK, {
      sleep: noSleep,
      random: () => 0,
      retries: 0,
      transport: fakeTransport((m) => {
        state.calls.push(m);
        if (m === 'eth_chainId') return state.chain;
        if (m === 'eth_blockNumber') return '0x10';
        if (m === 'eth_boom') throw new FakeRpcError(-32000);
        return null;
      }),
      ...extra,
    });

  it('re-checks eth_chainId once the interval has elapsed and catches a bait-and-switch', async () => {
    const state = { chain: '0xaa36a7', calls: [] as string[] };
    let t = 0;
    const c = await mk(state, { chainRecheckMs: 1000, now: () => t });
    state.calls.length = 0;
    t = 500;
    await c.blockNumber();
    expect(state.calls).toEqual(['eth_blockNumber']);
    t = 1500;
    await c.blockNumber();
    expect(state.calls).toEqual(['eth_blockNumber', 'eth_chainId', 'eth_blockNumber']);
    state.chain = '0x1'; // the endpoint now serves another chain
    t = 3000;
    await expect(c.blockNumber()).rejects.toThrow(/CHAIN_MISMATCH/);
    await expect(c.request('eth_getCode', ['0x0', 'latest'])).rejects.toThrow(/CHAIN_MISMATCH/);
  });
  it('re-checks after a transport failure (reconnect) but not after a JSON-RPC error object', async () => {
    const state = { chain: '0xaa36a7', calls: [] as string[] };
    let fail = false;
    const base = fakeTransport((m) => {
      state.calls.push(m);
      if (m === 'eth_chainId') return state.chain;
      return '0x10';
    });
    const t: RpcTransport = { send: (u, b, i) => (fail ? Promise.reject(new RpcHttpError(502)) : base.send(u, b, i)) };
    const c = await createClient(SEPOLIA, URL_OK, { transport: t, ...opts, retries: 0, chainRecheckMs: 0 });
    fail = true;
    await expect(c.blockNumber()).rejects.toThrow(/http status 502/);
    fail = false;
    state.calls.length = 0;
    await c.blockNumber();
    expect(state.calls).toEqual(['eth_chainId', 'eth_blockNumber']);
    state.calls.length = 0;
    await c.blockNumber();
    expect(state.calls).toEqual(['eth_blockNumber']); // flag cleared again

    const s2 = { chain: '0xaa36a7', calls: [] as string[] };
    const c2 = await mk(s2, { chainRecheckMs: 0 });
    await expect(c2.request('eth_boom', [])).rejects.toThrow(/json-rpc error/);
    s2.calls.length = 0;
    await c2.blockNumber();
    expect(s2.calls).toEqual(['eth_blockNumber']);
  });
});

describe('createReconciledClient', () => {
  const mkNode = (answers: Record<string, unknown>) =>
    createClient(SEPOLIA, URL_OK, {
      sleep: noSleep,
      retries: 0,
      transport: fakeTransport((m) => (m === 'eth_chainId' ? '0xaa36a7' : (answers[m] ?? null))),
    });
  it('passes identical reads through and sends non-reconciled methods to the primary only', async () => {
    const a = await mkNode({ eth_getCode: '0x6001', eth_blockNumber: '0x10' });
    const b = await mkNode({ eth_getCode: '0x6001', eth_blockNumber: '0x99' });
    const r = createReconciledClient(a, b, { sleep: noSleep });
    expect(await r.request('eth_getCode', ['0x0', 'latest'])).toBe('0x6001');
    expect(await r.blockNumber()).toBe(16n);
    expect(r.chainId).toBe(11155111);
  });
  it('fails closed when the providers disagree, after one re-try', async () => {
    const a = await mkNode({ eth_getCode: '0x6001' });
    let n = 0;
    const b: typeof a = { ...(await mkNode({})), request: (m) => (m === 'eth_getCode' ? Promise.resolve(++n === 1 ? '0x6002' : '0x6003') : Promise.resolve(null)) };
    const slept: number[] = [];
    const r = createReconciledClient(a, b, { sleep: (ms) => { slept.push(ms); return Promise.resolve(); }, retryDelayMs: 7 });
    await expect(r.request('eth_getCode', ['0x0', 'latest'])).rejects.toThrow(/providers disagree/);
    expect(slept).toEqual([7]);
  });
  it('tolerates a one-block tip race (agrees on the re-try)', async () => {
    const a = await mkNode({ eth_getCode: '0x6001' });
    let n = 0;
    const b: typeof a = { ...(await mkNode({})), request: () => Promise.resolve(++n === 1 ? '0x' : '0x6001') };
    const r = createReconciledClient(a, b, { sleep: noSleep });
    expect(await r.request('eth_getCode', ['0x0', 'latest'])).toBe('0x6001');
  });
  it('does not retry other failures and rejects clients on different chains', async () => {
    const a = await mkNode({});
    const b: typeof a = { ...(await mkNode({})), request: () => Promise.reject(new Error('down')) };
    const r = createReconciledClient(a, b, { sleep: noSleep });
    await expect(r.request('eth_getCode', [])).rejects.toThrow('down');
    expect(() => createReconciledClient(a, { ...a, chainId: 1 })).toThrow(/CHAIN_MISMATCH/);
  });
  it('honours a custom method list', async () => {
    const a = await mkNode({ eth_gasPrice: '0x1' });
    const b = await mkNode({ eth_gasPrice: '0x2' });
    const strict = createReconciledClient(a, b, { methods: ['eth_gasPrice'], sleep: noSleep });
    await expect(strict.request('eth_gasPrice', [])).rejects.toThrow(/disagree/);
    expect(await createReconciledClient(a, b).request('eth_gasPrice', [])).toBe('0x1');
  });
});

describe('RPC retry chain identity', () => {
  it('refuses a changed chain inside the same retried request', async () => {
    let switched = false;
    let reads = 0;
    const transport = fakeTransport((method) => {
      if (method === 'eth_chainId') return switched ? '0x1' : '0xaa36a7';
      if (method === 'eth_blockNumber') {
        reads++;
        if (!switched) {
          switched = true;
          throw new RpcHttpError(502);
        }
        return '0x123';
      }
      return null;
    });
    const c = await createClient(SEPOLIA, URL_OK, { transport, ...opts, retries: 1, chainRecheckMs: 0 });
    await expect(c.blockNumber()).rejects.toThrow(/CHAIN_MISMATCH/);
    // Revalidate before issuing a new trusted read to a backend reached after a connection failure.
    expect(reads).toBe(1);
  });
});

describe('concurrent chain revalidation', () => {
  it('does not let an older in-flight check clear a newer connection failure', async () => {
    let now = 0;
    let chainChecks = 0;
    let switched = false;
    let failRead: (() => void) | undefined;
    let finishCheck: (() => void) | undefined;
    const transport: RpcTransport = {
      send: (_url, body) => {
        const req = JSON.parse(body) as { method: string; id: number };
        const reply = (result: string): string => JSON.stringify({ jsonrpc: '2.0', id: req.id, result });
        if (req.method === 'eth_chainId') {
          chainChecks++;
          if (chainChecks === 2) return new Promise<string>((resolve) => { finishCheck = () => { resolve(reply('0xaa36a7')); }; });
          return Promise.resolve(reply(switched ? '0x1' : '0xaa36a7'));
        }
        if (!switched && req.method === 'eth_blockNumber') {
          return new Promise<string>((_resolve, reject) => { failRead = () => { switched = true; reject(new RpcHttpError(502)); }; });
        }
        return Promise.resolve(reply('0x10'));
      },
    };
    const c = await createClient(SEPOLIA, URL_OK, { transport, ...opts, retries: 0, chainRecheckMs: 1, now: () => now });
    const pendingRead = expect(c.blockNumber()).rejects.toThrow(/http status 502/);
    now = 2;
    const pendingCheck = expect(c.request('eth_getCode', [])).rejects.toThrow(/connection changed during chain verification/);
    if (failRead === undefined || finishCheck === undefined) throw new Error('test did not reach both pending requests');
    failRead();
    await pendingRead;
    finishCheck();
    await pendingCheck;
    await expect(c.blockNumber()).rejects.toThrow(/CHAIN_MISMATCH/);
    expect(chainChecks).toBe(3);
  });
});
