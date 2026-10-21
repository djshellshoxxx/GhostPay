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

export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const w32 = (a: string): string => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;

/**
 * Answers the extra reads the seller's payment verification makes: ERC-20 `Transfer(router -> stealth, net)` log queries
 * for the listed payments and `balanceOf` (always `balance`).
 */
export function verificationReads(
  payments: readonly { readonly token: string; readonly router: string; readonly stealth: string; readonly block: number; readonly net: bigint }[],
  balance = 0n,
): (method: string, params: readonly unknown[]) => unknown {
  return (method, params) => {
    if (method === 'eth_getLogs') {
      const f = params[0] as { topics?: string[]; fromBlock?: unknown; address?: string };
      if (f.topics?.[0] !== TRANSFER_TOPIC) return undefined;
      return payments
        .filter((p) => f.topics?.[1] === w32(p.router) && f.topics[2] === w32(p.stealth) && f.fromBlock === `0x${p.block.toString(16)}`)
        .map((p) => ({ address: p.token, blockHash: blockHash(p.block), topics: f.topics, data: `0x${p.net.toString(16).padStart(64, '0')}` }));
    }
    if (method === 'eth_call') return `0x${balance.toString(16).padStart(64, '0')}`;
    return undefined;
  };
}
