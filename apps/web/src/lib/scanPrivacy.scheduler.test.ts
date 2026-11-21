import { ANNOUNCEMENT_TOPIC, CHAINS, ChainAdapterError, type LogFilter, type RpcLog } from '@ghostpay/chain-adapters';
import { describe, expect, it } from 'vitest';
import { FAKE_ANNOUNCER } from '../test/fakeManifest';
import { mockRpc } from '../test/mockRpc';
import { createWindowedScanClient } from './scanPrivacy';

const chain = CHAINS.find((c) => c.chainId === 84532)!;
const filter = (fromBlock = 1000n, toBlock = 1999n): LogFilter => ({
  address: FAKE_ANNOUNCER,
  topics: [ANNOUNCEMENT_TOPIC, `0x${'1'.padStart(64, '0')}`],
  fromBlock,
  toBlock,
});
const fixedCrypto = { getRandomValues: <T extends ArrayBufferView | null>(a: T): T => {
  if (a !== null) new Uint32Array(a.buffer, a.byteOffset, a.byteLength / 4).fill(0);
  return a;
} };
const sleep = (): Promise<void> => Promise.resolve();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('TM15 browser window scheduler', () => {
  it.each([0, 1000])('makes no call for a pre-aborted query with windowBlocks=%i', async (windowBlocks) => {
    const ctl = new AbortController();
    ctl.abort(new Error('private cancellation reason'));
    const inner = mockRpc(chain.chainId, (method) => method === 'eth_blockNumber' ? '0x1388' : []);
    const client = createWindowedScanClient(inner, {
      chain, announcer: FAKE_ANNOUNCER, policy: { windowBlocks, jitterMs: [0, 0], padBlocks: 1 },
      signal: ctl.signal, sleep, cryptoApi: fixedCrypto,
    });
    await expect(client.getLogs(filter())).rejects.toThrow('scan-aborted');
    expect(inner.calls).toEqual([]);
  });

  it.each(['implicit query head', 'explicit head'] as const)('does not accept an %s response after cancellation', async (kind) => {
    const ctl = new AbortController();
    const pending = deferred<string>();
    const inner = mockRpc(chain.chainId, (method) => method === 'eth_blockNumber' ? pending.promise : []);
    const client = createWindowedScanClient(inner, {
      chain, announcer: FAKE_ANNOUNCER, policy: { windowBlocks: 1000, jitterMs: [0, 0], padBlocks: 1 },
      signal: ctl.signal, sleep, cryptoApi: fixedCrypto,
    });
    const request = kind === 'implicit query head' ? client.getLogs(filter()) : client.blockNumber();
    const rejected = expect(request).rejects.toThrow('scan-aborted');
    expect(inner.calls.map((c) => c.method)).toEqual(['eth_blockNumber']);
    ctl.abort();
    pending.resolve('0x1388');
    await rejected;
    expect(inner.calls.map((c) => c.method)).toEqual(['eth_blockNumber']);
  });

  it.each(['padded windows', 'final window', 'provider-sized range', 'provider-limit rejection'] as const)(
    'rejects a late %s response and schedules no following request', async (kind) => {
      const ctl = new AbortController();
      const pending = deferred<readonly RpcLog[]>();
      const entered = deferred<void>();
      let logRequests = 0;
      const inner = mockRpc(chain.chainId, (method) => {
        if (method === 'eth_blockNumber') return '0x1388';
        if (method === 'eth_getLogs' && ++logRequests === 1) { entered.resolve(); return pending.promise; }
        return [];
      });
      const client = createWindowedScanClient(inner, {
        chain, announcer: FAKE_ANNOUNCER,
        policy: { windowBlocks: kind === 'provider-sized range' ? 0 : 1000, jitterMs: [0, 0], padBlocks: kind === 'final window' ? 0 : 1 },
        signal: ctl.signal, sleep, cryptoApi: fixedCrypto,
      });
      const request = client.getLogs(filter());
      const rejected = expect(request).rejects.toThrow('scan-aborted');
      await entered.promise;
      ctl.abort();
      if (kind === 'provider-limit rejection') pending.reject(new ChainAdapterError('RESPONSE_TOO_LARGE', 'provider limit'));
      else pending.resolve([]);
      await rejected;
      expect(logRequests).toBe(1);
      await expect(client.getLogs(filter())).rejects.toThrow('scan-aborted');
      expect(logRequests).toBe(1);
    },
  );

  it('stops before the next dispatch when cancelled during window jitter', async () => {
    const ctl = new AbortController();
    const sleeping = deferred<void>();
    const entered = deferred<void>();
    let sleeps = 0;
    const inner = mockRpc(chain.chainId, (method) => method === 'eth_blockNumber' ? '0x1388' : []);
    const client = createWindowedScanClient(inner, {
      chain, announcer: FAKE_ANNOUNCER, policy: { windowBlocks: 1000, jitterMs: [1, 1], padBlocks: 1 },
      signal: ctl.signal, cryptoApi: fixedCrypto,
      sleep: () => { sleeps++; entered.resolve(); return sleeping.promise; },
    });
    const request = client.getLogs(filter());
    const rejected = expect(request).rejects.toThrow('scan-aborted');
    await entered.promise;
    ctl.abort();
    sleeping.resolve();
    await rejected;
    expect(sleeps).toBe(1);
    expect(inner.calls.filter((c) => c.method === 'eth_getLogs')).toHaveLength(1);
  });

  it.each(['range', 'padding'] as const)('rejects an excessive %s window count before allocation, shuffle or log dispatch', async (kind) => {
    let draws = 0;
    const inner = mockRpc(chain.chainId, (method) => method === 'eth_blockNumber' ? '0xc350' : []);
    const client = createWindowedScanClient(inner, {
      chain, announcer: FAKE_ANNOUNCER, policy: { windowBlocks: 1, jitterMs: [0, 0], padBlocks: kind === 'padding' ? 2048 : 0 },
      sleep, cryptoApi: { getRandomValues: (a) => { draws++; return fixedCrypto.getRandomValues(a); } },
    });
    const requested = kind === 'padding' ? filter(10_000n, 10_000n) : filter(0n, 4096n);
    await expect(client.getLogs(requested)).rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'INVALID_INPUT: scan request budget exceeded' });
    expect(draws).toBe(0);
    expect(inner.calls.filter((c) => c.method === 'eth_getLogs')).toEqual([]);
  });

  it('allows exactly 4096 unsplit windows', async () => {
    const inner = mockRpc(chain.chainId, (method) => method === 'eth_blockNumber' ? '0x1388' : []);
    const client = createWindowedScanClient(inner, {
      chain, announcer: FAKE_ANNOUNCER, policy: { windowBlocks: 1, jitterMs: [0, 0] }, sleep, cryptoApi: fixedCrypto,
    });
    await expect(client.getLogs(filter(0n, 4095n))).resolves.toEqual([]);
    expect(inner.calls.filter((c) => c.method === 'eth_getLogs')).toHaveLength(4096);
  });

  it('includes provider-limit split attempts in the 4096-dispatch budget', async () => {
    const inner = mockRpc(chain.chainId, (method, params) => {
      if (method === 'eth_blockNumber') return '0x1388';
      const f = params[0] as LogFilter;
      if (f.toBlock > f.fromBlock) throw new ChainAdapterError('RESPONSE_TOO_LARGE', 'provider limit');
      return [];
    });
    const client = createWindowedScanClient(inner, {
      chain, announcer: FAKE_ANNOUNCER, policy: { windowBlocks: 1000, jitterMs: [0, 0] }, sleep, cryptoApi: fixedCrypto,
    });
    await expect(client.getLogs(filter(0n, 2999n))).rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'INVALID_INPUT: scan request budget exceeded' });
    expect(inner.calls.filter((c) => c.method === 'eth_getLogs')).toHaveLength(4096);
  });

  it('bounds a MAX_SAFE_INTEGER-sized range before any window allocation or log request', async () => {
    // Post-fix acceptance only: the former implementation would try to allocate this entire grid.
    let draws = 0;
    const inner = mockRpc(chain.chainId, (method) => method === 'eth_blockNumber' ? `0x${Number.MAX_SAFE_INTEGER.toString(16)}` : []);
    const client = createWindowedScanClient(inner, {
      chain, announcer: FAKE_ANNOUNCER, policy: { windowBlocks: 1, jitterMs: [0, 0] }, sleep,
      cryptoApi: { getRandomValues: (a) => { draws++; return fixedCrypto.getRandomValues(a); } },
    });
    await expect(client.getLogs(filter(0n, BigInt(Number.MAX_SAFE_INTEGER) - 1n))).rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'INVALID_INPUT: scan request budget exceeded' });
    expect(draws).toBe(0);
    expect(inner.calls.map((c) => c.method)).toEqual(['eth_blockNumber']);
  });

  it('keeps request budgets independent for concurrent queries on the same client', async () => {
    const inner = mockRpc(chain.chainId, (method) => method === 'eth_blockNumber' ? '0x1770' : []);
    const client = createWindowedScanClient(inner, {
      chain, announcer: FAKE_ANNOUNCER, policy: { windowBlocks: 1, jitterMs: [0, 0] }, sleep, cryptoApi: fixedCrypto,
    });
    await expect(Promise.all([client.getLogs(filter(0n, 2499n)), client.getLogs(filter(2500n, 4999n))])).resolves.toEqual([[], []]);
    expect(inner.calls.filter((c) => c.method === 'eth_getLogs')).toHaveLength(5000);
  });
});
