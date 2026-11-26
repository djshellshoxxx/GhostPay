/**
 * TEST-ONLY synthetic chain for the RPC disclosure scenarios (PRIV-T02). Serves the JSON-RPC methods the scanner uses
 * from in-memory announcements and ERC-20 transfers, in the wire format the real `createClient` sends (hex quantities).
 * All addresses and hashes are synthetic. Supports a fork (changed block hashes from a height) and scripted wire faults.
 */
import { ghostPayRouterAbi, grossForNet, type Address, type Hex, type RpcLog } from '@ghostpay/chain-adapters';
import { parseMetadata } from '@ghostpay/core-crypto';
import { decodeAbiParameters, encodeFunctionData } from 'viem/utils';
import { WireFault } from './rpcDisclosure';
import { FAKE_ROUTER } from './fakeManifest';
import { TOKEN_84532 } from './announcements';

export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PAYER = '0x2222222222222222222222222222222222222222' as Address;
const word = (a: string): string => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
const q = (n: number | bigint): string => `0x${n.toString(16)}`;

export interface SyntheticChainOptions {
  readonly chainId: number;
  readonly head: number;
  readonly logs: readonly RpcLog[];
}

/** Hook that may answer a request itself (return a value) or decline (return `undefined`). Used to model a lying provider. */
export type Interceptor = (method: string, params: readonly unknown[]) => unknown;

export class SyntheticChain {
  public head: number;
  public logs: RpcLog[];
  private forkAt: number | undefined;
  private readonly faults = new Map<string, WireFault[]>();
  public intercept: Interceptor | undefined;

  public constructor(public readonly o: SyntheticChainOptions) {
    this.head = o.head;
    this.logs = [...o.logs].map((l) => ({ ...l, logIndex: q(BigInt(l.logIndex) + 100n) }));
  }

  /** From `height` on, block hashes (and the hashes carried by logs) change: a reorg of those blocks. */
  public fork(height: number): void {
    this.forkAt = height;
    this.logs = this.logs.map((l) => (Number(BigInt(l.blockNumber)) >= height ? { ...l, blockHash: this.hashOf(Number(BigInt(l.blockNumber))) } : l));
  }

  /** The next `count` calls of `method` fail with `fault`. */
  public failNext(method: string, fault: WireFault, count = 1): void {
    this.faults.set(method, Array.from({ length: count }, () => fault));
  }

  public hashOf(n: number): string {
    const salt = this.forkAt !== undefined && n >= this.forkAt ? 0xf000000 : 0;
    return `0x${(n + salt).toString(16).padStart(64, '0')}`;
  }

  private transfers(): RpcLog[] {
    return this.logs.flatMap((log) => {
      const sender = log.topics[3];
      const recipient = log.topics[2];
      if (sender?.toLowerCase() !== word(FAKE_ROUTER) || recipient === undefined) return [];
      const parsed = parseMetadata(decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], log.data as Hex)[1]);
      if (parsed.kind !== 'erc20') return [];
      return [{
        address: TOKEN_84532.toLowerCase(),
        blockNumber: log.blockNumber,
        topics: [TRANSFER_TOPIC, word(PAYER), recipient],
        data: `0x${parsed.netAmount.toString(16).padStart(64, '0')}`,
        blockHash: log.blockHash,
        ...(log.transactionHash === undefined ? {} : { transactionHash: log.transactionHash }),
        logIndex: q(BigInt(log.logIndex) - 1n),
      }];
    });
  }

  /** The JSON-RPC handler. Throws `WireFault` for scripted faults. */
  public readonly handler = (method: string, params: readonly unknown[]): unknown => {
    const queued = this.faults.get(method);
    const fault = queued?.shift();
    if (fault !== undefined) throw fault;
    const hooked = this.intercept?.(method, params);
    if (hooked !== undefined) return hooked;
    switch (method) {
      case 'eth_chainId':
        return q(this.o.chainId);
      case 'eth_blockNumber':
        return q(this.head);
      case 'eth_getBlockByNumber': {
        const n = Number(BigInt(String(params[0])));
        if (n > this.head) return null;
        return { hash: this.hashOf(n), parentHash: this.hashOf(n - 1), number: q(n), timestamp: q(1_700_000_000 + n) };
      }
      case 'eth_getLogs': {
        const f = params[0] as { address: string; topics?: readonly (string | null)[]; fromBlock: string; toBlock: string };
        const isToken = f.address.toLowerCase() === TOKEN_84532.toLowerCase();
        const source = isToken ? this.transfers() : this.logs;
        const from = BigInt(f.fromBlock);
        const to = BigInt(f.toBlock);
        const caller = f.topics?.[3];
        return source.filter((l) => BigInt(l.blockNumber) >= from && BigInt(l.blockNumber) <= to && (caller == null || l.topics[3]?.toLowerCase() === caller.toLowerCase()));
      }
      case 'eth_getTransactionReceipt':
      case 'eth_getTransactionByHash': {
        const hash = String(params[0]).toLowerCase();
        const log = this.logs.find((l) => l.transactionHash?.toLowerCase() === hash);
        if (log === undefined) return null;
        const [ephemeral, metadata] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], log.data as Hex);
        const parsed = parseMetadata(metadata);
        if (parsed.kind !== 'erc20') throw new Error('fixture requires an ERC-20 announcement');
        const stealth = `0x${(log.topics[2] as string).slice(-40)}` as const;
        const common = { to: FAKE_ROUTER, from: PAYER, blockHash: log.blockHash, blockNumber: log.blockNumber };
        if (method === 'eth_getTransactionReceipt') {
          return { ...common, status: '0x1', transactionHash: log.transactionHash, logs: [...this.transfers().filter((t) => t.transactionHash === log.transactionHash), log] };
        }
        return {
          ...common, hash: log.transactionHash, value: '0x0',
          input: encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'payERC20', args: [parsed.token, stealth, grossForNet(parsed.netAmount), parsed.netAmount, 9999999999n, ephemeral, metadata] }),
        };
      }
      case 'eth_call':
      case 'eth_getBalance':
        return '0x0';
      default:
        throw new Error(`unexpected ${method}`);
    }
  };
}
