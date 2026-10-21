import { describe, expect, it } from 'vitest';
import { D1, S1, fakeChainReader, json, makeReceipt, makeRequest, makeSigner, stubTransport } from './testkit.js';

describe('testkit', () => {
  it('stubTransport records string, URL and Request inputs and uses the clock', async () => {
    const { transport, calls, clock } = stubTransport((c) => json({ url: c.url, body: c.body ?? null }, 201));
    const a = await transport.fetch('https://x.example/a', { method: 'POST', body: '{"a":1}' });
    expect(a.status).toBe(201);
    await transport.fetch(new URL('https://x.example/b'));
    await transport.fetch(new Request('https://x.example/c'));
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ['POST', 'https://x.example/a', '{"a":1}'],
      ['GET', 'https://x.example/b', undefined],
      ['GET', 'https://x.example/c', undefined],
    ]);
    clock.now = 5;
    expect(transport.now()).toBe(5);
  });
  it('builds signers, requests and receipts', async () => {
    const sig = await makeSigner().signMessage?.('hi');
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/);
    expect(makeRequest().stealth.address).toBe(S1);
    expect(makeRequest({ destination: 'derive-fresh' }).destination).toBe('derive-fresh');
    expect(makeReceipt({ transactionHash: '0x01' }).confirmations).toBe(5);
  });
  it('fakeChainReader answers codes, calls and logs and records access', async () => {
    const log = { address: D1, topics: [], data: '0x', logIndex: 0 } as const;
    const r = fakeChainReader({ codes: { [D1.toLowerCase()]: '0x00' }, calls: { [`${D1.toLowerCase()}|0x01`]: '0x02' }, logs: [log] });
    expect(await r.getCode(1, D1)).toBe('0x00');
    expect(await r.getCode(1, S1)).toBe('0x');
    expect(await r.call(1, D1, '0x01')).toBe('0x02');
    await expect(r.call(1, D1, '0x09')).rejects.toThrow();
    expect(await r.getLogs(1, { address: D1, fromBlock: 0n, toBlock: 1n })).toEqual([log]);
    expect(await r.getLogs(1, { address: S1, fromBlock: 0n, toBlock: 1n })).toEqual([]);
    expect(await r.getBlockNumber(1)).toBe(100n);
    expect(await fakeChainReader({ block: 7n }).getBlockNumber(1)).toBe(7n);
    expect(r.seen.length).toBeGreaterThan(3);
  });
});
