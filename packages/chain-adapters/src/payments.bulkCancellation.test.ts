import { describe, expect, it } from 'vitest';
import { fetchRouterEvidence, type RouterEvidenceTarget } from './payments.js';
import type { RpcClient } from './rpc.js';

const HASH = `0x${'1'.repeat(64)}` as const;
const targets: readonly RouterEvidenceTarget[] = [
  { transactionHash: `0x${'2'.repeat(64)}`, blockNumber: 100n },
  { transactionHash: `0x${'3'.repeat(64)}`, blockNumber: 101n },
];

function fixture(onCall: (name: string) => void | Promise<void> = () => undefined): { client: RpcClient; calls: string[] } {
  const calls: string[] = [];
  const call = async (name: string): Promise<void> => { calls.push(name); await onCall(name); };
  return {
    calls,
    client: {
      chainId: 84532,
      blockNumber: async () => { await call('head'); return 110n; },
      getBlock: async (number) => { await call(`block:${String(number)}`); return { number, hash: HASH, parentHash: HASH }; },
      request: async (method, params) => { await call(`${method}:${String(params[0])}`); return {}; },
      getLogs: () => Promise.reject(new Error('Unexpected log query')),
    },
  };
}

function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

describe('bulk receipt evidence respects scan cancellation', () => {
  it('makes no request when the scan has already been cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const { client, calls } = fixture();
    const batch = await fetchRouterEvidence(client, targets, 1, controller.signal);
    expect(calls).toEqual([]);
    expect(batch.requests).toBe(0);
    expect(batch.head).toBeUndefined();
    expect(batch.transactions.size).toBe(0);
  });

  it('does not start block or transaction queries after a late head response', async () => {
    const controller = new AbortController();
    const pending = deferred();
    const { client, calls } = fixture((name) => name === 'head' ? pending.promise : undefined);
    const work = fetchRouterEvidence(client, targets, 1, controller.signal);
    expect(calls).toEqual(['head']);
    controller.abort();
    pending.release();
    const batch = await work;
    expect(calls).toEqual(['head']);
    expect(batch.requests).toBe(1);
    expect(batch.head).toBeUndefined();
    expect(batch.blocksBefore.size).toBe(0);
    expect(batch.blocksAfter.size).toBe(0);
    expect(batch.transactions.size).toBe(0);
  });

  it('checks cancellation before each member of a concurrent block group', async () => {
    const controller = new AbortController();
    const { client, calls } = fixture((name) => { if (name === 'block:100') controller.abort(); });
    const batch = await fetchRouterEvidence(client, targets, 2, controller.signal);
    expect(calls).toEqual(['head', 'block:100']);
    expect(batch.requests).toBe(2);
    expect(batch.head).toBeUndefined();
    expect(batch.blocksBefore.size).toBe(0);
    expect(batch.blocksAfter.size).toBe(0);
    expect(batch.transactions.size).toBe(0);
  });

  it('stops between receipt calls and discards partial evidence after cancellation', async () => {
    const controller = new AbortController();
    const receipt = `eth_getTransactionReceipt:${targets[0]!.transactionHash}`;
    const { client, calls } = fixture((name) => { if (name === receipt) controller.abort(); });
    const batch = await fetchRouterEvidence(client, targets, 1, controller.signal);
    expect(calls).toEqual(['head', 'block:100', 'block:101', receipt]);
    expect(batch.requests).toBe(calls.length);
    expect(batch.head).toBeUndefined();
    expect(batch.blocksBefore.size).toBe(0);
    expect(batch.blocksAfter.size).toBe(0);
    expect(batch.transactions.size).toBe(0);
  });

  it('keeps uncancelled evidence and its exact request count', async () => {
    const { client, calls } = fixture();
    const batch = await fetchRouterEvidence(client, targets, 2, new AbortController().signal);
    expect(batch.requests).toBe(9);
    expect(batch.requests).toBe(calls.length);
    expect(batch.head).toBe(110n);
    expect(batch.transactions.size).toBe(2);
    expect(batch.blocksBefore.size).toBe(2);
    expect(batch.blocksAfter.size).toBe(2);
  });

  it('discards complete transaction pairs if cancellation occurs during the final block recheck', async () => {
    const controller = new AbortController();
    let firstBlockReads = 0;
    const { client, calls } = fixture((name) => {
      if (name === 'block:100' && ++firstBlockReads === 2) controller.abort();
    });
    const batch = await fetchRouterEvidence(client, targets, 1, controller.signal);
    expect(calls.filter((name) => name.startsWith('eth_getTransaction'))).toHaveLength(4);
    expect(calls.filter((name) => name === 'block:101')).toHaveLength(1);
    expect(batch.requests).toBe(8);
    expect(batch.requests).toBe(calls.length);
    expect(batch.head).toBeUndefined();
    expect(batch.transactions.size).toBe(0);
    expect(batch.blocksBefore.size).toBe(0);
    expect(batch.blocksAfter.size).toBe(0);
  });
});
