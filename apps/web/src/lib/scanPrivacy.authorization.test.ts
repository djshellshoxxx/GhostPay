import { ANNOUNCEMENT_TOPIC, CHAINS, type LogFilter, type RpcLog } from '@ghostpay/chain-adapters';
import { describe, expect, it, vi } from 'vitest';
import { FAKE_ANNOUNCER } from '../test/fakeManifest';
import { mockRpc } from '../test/mockRpc';
import { createIndexerScanClient, createWindowedScanClient, openScanClients, type ScanPlan } from './scanPrivacy';

const chain = CHAINS.find((c) => c.chainId === 84532)!;
type Ready = Extract<ScanPlan, { kind: 'ready' }>;
const ready = (over: Partial<Ready> = {}): Ready => ({ kind: 'ready', endpoint: undefined, allowLoopbackHttp: false, useSecondary: true, indexerUrl: undefined, window: { windowBlocks: 1000, jitterMs: [0, 0] }, ...over });
const filter: LogFilter = { address: FAKE_ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC, `0x${'1'.padStart(64, '0')}`], fromBlock: 0n, toBlock: 2999n };
const sleep = (): Promise<void> => Promise.resolve();
const fixedCrypto = { getRandomValues: <T extends ArrayBufferView | null>(value: T): T => { if (value !== null) new Uint8Array(value.buffer, value.byteOffset, value.byteLength).fill(0); return value; } };
const hash = `0x${'12'.repeat(32)}` as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('scan caller cancellation without a network authority mock', () => {
  it.each([undefined, 'http://127.0.0.1:8545/'])('refuses pre-aborted bootstrap before dispatch for endpoint %s', async (endpoint) => {
    const appRpc = vi.fn(() => Promise.resolve(undefined));
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('unexpected')));
    await expect(openScanClients({
      plan: ready({ endpoint, allowLoopbackHttp: endpoint !== undefined }), chain, announcer: FAKE_ANNOUNCER,
      appRpc, fetchImpl, sleep, signal: AbortSignal.abort('private reason'),
    })).rejects.toThrow('scan cancelled');
    expect(appRpc).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('passes cancellation through the indexer source to an already dispatched bounded request', async () => {
    const controller = new AbortController();
    const started = deferred<AbortSignal>();
    const rpc = mockRpc(chain.chainId, (method) => {
      if (method === 'eth_blockNumber') return '0xbb8';
      if (method === 'eth_getBlockByNumber') return { hash, parentHash: hash };
      throw new Error('unexpected RPC method');
    });
    const fetchImpl = vi.fn((url: string, init: RequestInit) => {
      expect(new URL(url).origin).toBe('https://indexer.test');
      started.resolve(init.signal as AbortSignal);
      return new Promise<Response>(() => undefined);
    });
    const client = createIndexerScanClient(rpc, { chain, announcer: FAKE_ANNOUNCER, baseUrl: 'https://indexer.test', fetchImpl, windowBlocks: 1000, signal: controller.signal });
    const outcome = client.getLogs({ ...filter, toBlock: 999n }).catch((error: unknown) => error);
    const requestSignal = await started.promise;
    expect(requestSignal.aborted).toBe(false);
    controller.abort('private reason');
    expect(requestSignal.aborted).toBe(true);
    expect(await outcome).toMatchObject({ code: 'RPC_FAILURE', message: 'RPC_FAILURE: indexer TRANSPORT' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(rpc.calls.some((call) => call.method === 'eth_getLogs')).toBe(false);
  });

  it('does not dispatch another queued window after cancellation during the preceding request', async () => {
    const controller = new AbortController();
    const started = deferred<void>();
    const firstLogs = deferred<readonly RpcLog[]>();
    const rpc = mockRpc(chain.chainId, (method) => {
      if (method === 'eth_blockNumber') return '0xbb8';
      if (method === 'eth_getLogs') { started.resolve(); return firstLogs.promise; }
      throw new Error('unexpected RPC method');
    });
    const client = createWindowedScanClient(rpc, { chain, announcer: FAKE_ANNOUNCER, policy: { windowBlocks: 1000, jitterMs: [0, 0] }, sleep, signal: controller.signal, cryptoApi: fixedCrypto });
    const outcome = client.getLogs(filter).catch((error: unknown) => error);
    await started.promise;
    controller.abort();
    firstLogs.resolve([]);
    expect(await outcome).toMatchObject({ code: 'RPC_URL_REJECTED', message: 'RPC_URL_REJECTED: scan cancelled' });
    expect(rpc.calls.filter((call) => call.method === 'eth_getLogs')).toHaveLength(1);
  });

  it('checks cancellation again after jitter before dispatching the next window', async () => {
    const controller = new AbortController();
    const sleeping = deferred<void>();
    const wake = deferred<void>();
    const rpc = mockRpc(chain.chainId, (method) => {
      if (method === 'eth_blockNumber') return '0xbb8';
      if (method === 'eth_getLogs') return [];
      throw new Error('unexpected RPC method');
    });
    const sleepImpl = vi.fn(() => { sleeping.resolve(); return wake.promise; });
    const client = createWindowedScanClient(rpc, { chain, announcer: FAKE_ANNOUNCER, policy: { windowBlocks: 1000, jitterMs: [1, 1] }, sleep: sleepImpl, signal: controller.signal, cryptoApi: fixedCrypto });
    const outcome = client.getLogs(filter).catch((error: unknown) => error);
    await sleeping.promise;
    controller.abort();
    wake.resolve();
    expect(await outcome).toMatchObject({ code: 'RPC_URL_REJECTED', message: 'RPC_URL_REJECTED: scan cancelled' });
    expect(sleepImpl).toHaveBeenCalledTimes(1);
    expect(rpc.calls.filter((call) => call.method === 'eth_getLogs')).toHaveLength(1);
  });
});
