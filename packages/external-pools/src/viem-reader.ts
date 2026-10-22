import type { Address, Hex } from 'viem';
import { assertChainAllowed } from './guard.js';
import type { ChainReader, LogLike } from './types.js';

/** The subset of a viem `PublicClient` used by {@link createViemChainReader}. */
export interface ViemLike {
  getCode(args: { address: Address }): Promise<Hex | undefined>;
  call(args: { to: Address; data: Hex }): Promise<{ data?: Hex | undefined }>;
  getBlockNumber(): Promise<bigint>;
  request(args: { method: 'eth_getLogs'; params: [{ address: Address; topics?: (Hex | null)[]; fromBlock: Hex; toBlock: Hex }] }): Promise<
    readonly { address: Address; topics: readonly Hex[]; data: Hex; logIndex: Hex; blockNumber: Hex; transactionHash: Hex }[]
  >;
}

/**
 * Wraps per-chain viem public clients as a {@link ChainReader}. Read-only; every call checks the chain allowlist
 * first (EP-GEN-1).
 *
 * @param clientFor Returns the client for a chain id (the caller decides the RPC URL; none is baked in here).
 */
export function createViemChainReader(clientFor: (chainId: number) => ViemLike): ChainReader {
  const c = (chainId: number): ViemLike => {
    assertChainAllowed(chainId);
    return clientFor(chainId);
  };
  return {
    async getCode(chainId, address) {
      return (await c(chainId).getCode({ address })) ?? '0x';
    },
    async call(chainId, to, data) {
      return (await c(chainId).call({ to, data })).data ?? '0x';
    },
    async getBlockNumber(chainId) {
      return c(chainId).getBlockNumber();
    },
    async getLogs(chainId, f) {
      const raw = await c(chainId).request({
        method: 'eth_getLogs',
        params: [{ address: f.address, ...(f.topics === undefined ? {} : { topics: [...f.topics] }), fromBlock: `0x${f.fromBlock.toString(16)}`, toBlock: `0x${f.toBlock.toString(16)}` }],
      });
      return raw.map((l): LogLike => ({
        address: l.address,
        topics: l.topics,
        data: l.data,
        logIndex: Number(BigInt(l.logIndex)),
        blockNumber: BigInt(l.blockNumber),
        transactionHash: l.transactionHash,
      }));
    },
  };
}
