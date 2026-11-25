import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ANNOUNCER, hx } from './fake.testutil.js';
import { JsonRpcChainReader, RpcError } from './rpc.js';
import { ANNOUNCEMENT_TOPIC } from './wire.js';

type Reply = (method: string, params: unknown[], id: unknown) => { status?: number; body: string };
const servers: Server[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise((r) => s.close(r));
  }
});
async function stub(reply: Reply): Promise<{ url: string; seen: { method: string; params: unknown[] }[] }> {
  const seen: { method: string; params: unknown[] }[] = [];
  const s = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      const j = JSON.parse(body) as { method: string; params: unknown[]; id: unknown };
      seen.push({ method: j.method, params: j.params });
      const r = reply(j.method, j.params, j.id);
      res.writeHead(r.status ?? 200, { 'content-type': 'application/json' });
      res.end(r.body);
    });
  });
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${String((s.address() as AddressInfo).port)}/v3/secret?apikey=abc`, seen };
}
const ok = (id: unknown, result: unknown) => ({ body: JSON.stringify({ jsonrpc: '2.0', id, result }) });
const LOG = { address: ANNOUNCER.toUpperCase().replace('0X', '0x'), topics: [ANNOUNCEMENT_TOPIC, hx(1, 32), hx(2, 32), hx(3, 32)], data: '0xAB', blockNumber: '0x10', blockHash: hx(0xcd, 32).toUpperCase().replace('0X', '0x'), logIndex: '0x2', transactionHash: hx(0xef, 32), removed: false };
const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    expect(e).toBeInstanceOf(RpcError);
    expect((e as Error).message).not.toMatch(/secret|abc|127\.0\.0\.1/);
    return (e as Error).message;
  }
};

describe('JsonRpcChainReader', () => {
  it('reads chain id, head, headers and announcer logs with exact params', async () => {
    const { url, seen } = await stub((m, p, id) => {
      if (m === 'eth_chainId') return ok(id, '0x7a69');
      if (m === 'eth_blockNumber') return ok(id, '0x1f');
      if (m === 'eth_getBlockByNumber') return ok(id, p[0] === '0x63' ? null : { number: p[0], hash: hx(0xaa, 32), parentHash: hx(0xbb, 32), extra: 1 });
      return ok(id, [LOG, { ...LOG, removed: undefined }]);
    });
    const r = new JsonRpcChainReader({ url });
    expect(await r.chainId()).toBe(31337);
    expect(await r.blockNumber()).toBe(31n);
    expect(await r.header(16n)).toEqual({ number: 16n, hash: hx(0xaa, 32), parentHash: hx(0xbb, 32) });
    expect(await r.header(99n)).toBeUndefined();
    const logs = await r.announcerLogs(16n, 31n, ANNOUNCER, new AbortController().signal);
    expect(logs[0]).toEqual({ address: ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC, hx(1, 32), hx(2, 32), hx(3, 32)], data: '0xab', blockNumber: 16n, blockHash: hx(0xcd, 32), logIndex: 2, transactionHash: hx(0xef, 32), removed: false });
    expect(seen.at(-1)).toEqual({ method: 'eth_getLogs', params: [{ fromBlock: '0x10', toBlock: '0x1f', address: ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC] }] });
  });
  it('rejects malformed results with fixed text that never contains the URL', async () => {
    const bodies: Record<string, (id: unknown) => { status?: number; body: string }> = {
      notjson: () => ({ body: 'nope' }),
      wrongId: () => ({ body: JSON.stringify({ jsonrpc: '2.0', id: 999, result: '0x1' }) }),
      noResult: (id) => ({ body: JSON.stringify({ jsonrpc: '2.0', id }) }),
      rpcError: (id) => ({ body: JSON.stringify({ jsonrpc: '2.0', id, error: { code: -1, message: 'secret detail' } }) }),
      http500: () => ({ status: 500, body: 'x' }),
      badQty: (id) => ok(id, '0x01'),
      nullDoc: () => ({ body: 'null' }),
    };
    const want: Record<string, string> = { notjson: 'malformed rpc response', wrongId: 'malformed rpc response', noResult: 'malformed rpc response', rpcError: 'rpc returned an error', http500: 'rpc http error', badQty: 'malformed rpc response', nullDoc: 'malformed rpc response' };
    for (const [k, f] of Object.entries(bodies)) {
      const { url } = await stub((_m, _p, id) => f(id));
      expect(await code(new JsonRpcChainReader({ url }).blockNumber()), k).toBe(want[k]);
    }
  });
  it('validates header and log shapes', async () => {
    const cases: [string, unknown][] = [
      ['header', 5],
      ['header', { number: '0x11', hash: hx(1, 32), parentHash: hx(1, 32) }], // number mismatch
      ['header', { number: '0x10', hash: '0x12', parentHash: hx(1, 32) }],
      ['logs', {}],
      ['logs', [null]],
      ['logs', [{ ...LOG, address: '0x12' }]],
      ['logs', [{ ...LOG, data: '0xabc' }]],
      ['logs', [{ ...LOG, topics: 'x' }]],
      ['logs', [{ ...LOG, topics: [...LOG.topics, hx(4, 32)] }]],
      ['logs', [{ ...LOG, logIndex: '0x100000000' }]],
      ['logs', [{ ...LOG, removed: 'no' }]],
      ['logs', [{ ...LOG, blockHash: hx(1, 31) }]],
    ];
    for (const [kind, result] of cases) {
      const { url } = await stub((_m, _p, id) => ok(id, result));
      const r = new JsonRpcChainReader({ url });
      expect(await code(kind === 'header' ? r.header(16n) : r.announcerLogs(0n, 1n, ANNOUNCER)), JSON.stringify(result)).toBe('malformed rpc response');
    }
    const { url } = await stub((_m, _p, id) => ok(id, `0x${'f'.repeat(20)}`));
    expect(await code(new JsonRpcChainReader({ url }).chainId())).toBe('malformed rpc response');
  });
  it('caps response size, times out, and refuses bad URLs', async () => {
    const { url } = await stub((_m, _p, id) => ok(id, [LOG, LOG, LOG, LOG]));
    expect(await code(new JsonRpcChainReader({ url, maxResponseBytes: 200 }).announcerLogs(0n, 1n, ANNOUNCER))).toBe('rpc response too large');
    const hang = createServer(() => undefined);
    servers.push(hang);
    await new Promise<void>((r) => hang.listen(0, '127.0.0.1', r));
    const slow = new JsonRpcChainReader({ url: `http://127.0.0.1:${String((hang.address() as AddressInfo).port)}`, timeoutMs: 50 });
    expect(await code(slow.blockNumber())).toBe('rpc request failed');
    const empty = new JsonRpcChainReader({ url: 'http://x.invalid', fetchImpl: () => Promise.resolve(new Response(null, { status: 200 })) });
    expect(await code(empty.blockNumber())).toBe('malformed rpc response');
    expect(() => new JsonRpcChainReader({ url: 'not a url' })).toThrow(RpcError);
    expect(() => new JsonRpcChainReader({ url: 'ws://127.0.0.1' })).toThrow(RpcError);
  });
});
