import type { RpcLog } from '@ghostpay/chain-adapters';
import { mockRpc, type MockRpc } from './mockRpc';

export const blockHash = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;

/** RPC with a fixed head, deterministic block hashes and the given announcement logs; `extra` answers other methods. */
export function chainWithLogs(chainId: number, head: number, logs: RpcLog[], extra: (method: string, params: readonly unknown[]) => unknown = () => undefined): MockRpc {
  return mockRpc(chainId, (method, params) => {
    const x = extra(method, params);
    if (x !== undefined) return x;
    if (method === 'eth_blockNumber') return `0x${head.toString(16)}`;
    if (method === 'eth_getBlockByNumber') {
      const n = Number(params[0]);
      return { hash: blockHash(n), parentHash: blockHash(n - 1), number: `0x${n.toString(16)}` };
    }
    if (method === 'eth_getLogs') {
      const f = params[0] as { fromBlock: bigint; toBlock: bigint };
      return logs.filter((l) => BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock);
    }
    throw new Error(`unexpected ${method}`);
  });
}
