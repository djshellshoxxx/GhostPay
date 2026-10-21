import type { RpcClient } from '@ghostpay/chain-adapters';

export type RpcHandler = (method: string, params: readonly unknown[]) => unknown;

export interface MockRpc extends RpcClient {
  readonly calls: { method: string; params: readonly unknown[] }[];
}

/** Minimal RpcClient whose `request` is answered by a handler; other methods are stubbed from it. */
export function mockRpc(chainId: number, handler: RpcHandler): MockRpc {
  const calls: { method: string; params: readonly unknown[] }[] = [];
  const request = (method: string, params: readonly unknown[]): Promise<unknown> => {
    calls.push({ method, params });
    try {
      return Promise.resolve(handler(method, params));
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('mock failure'));
    }
  };
  return {
    chainId,
    calls,
    request,
    blockNumber: async () => BigInt((await request('eth_blockNumber', [])) as string),
    getBlock: async (n) => {
      const r = (await request('eth_getBlockByNumber', [n])) as { hash: `0x${string}`; parentHash: `0x${string}` } | null;
      return r === null ? null : { number: n, hash: r.hash, parentHash: r.parentHash };
    },
    getLogs: async (f) => (await request('eth_getLogs', [f])) as never,
  };
}
