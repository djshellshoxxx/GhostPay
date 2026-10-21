import { poolAbi, type WithdrawProofCalldata, type Withdrawal } from '@ghostpay/pool-sdk';
import {
  BaseError,
  ContractFunctionRevertedError,
  ExecutionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem';
import { SimulationRevert } from './errors.js';

/** Final state of a sent transaction. */
export interface ReceiptSummary {
  readonly status: 'success' | 'reverted' | 'timeout';
  /** Wei spent by the relayer (gasUsed * effectiveGasPrice); 0 on timeout. */
  readonly costWei: bigint;
}

/**
 * Everything the relayer needs from one chain with one hot key. Injected so tests run with a fake;
 * {@link createViemChainPort} is the production implementation.
 *
 * @remarks Implementations throw {@link SimulationRevert} when the simulation reverts; any other
 * thrown error is treated as an operational (RPC) failure.
 */
export interface ChainPort {
  readonly chainId: number;
  /** Address of the hot key sending the transactions. */
  readonly relayerAddress: Address;
  getGasPrice(): Promise<bigint>;
  getBalance(): Promise<bigint>;
  blockTimestamp(): Promise<bigint>;
  readScope(pool: Address): Promise<bigint>;
  isKnownRoot(pool: Address, root: bigint): Promise<boolean>;
  nullifierSpent(pool: Address, nullifierHash: bigint): Promise<boolean>;
  simulateWithdraw(pool: Address, w: Withdrawal, p: WithdrawProofCalldata): Promise<{ readonly gasLimit: bigint }>;
  sendWithdraw(pool: Address, w: Withdrawal, p: WithdrawProofCalldata, o: { gas: bigint; gasPrice: bigint }): Promise<Hex>;
  /** Waits for inclusion; never throws (failures map to `timeout`). */
  waitForReceipt(hash: Hex, timeoutMs: number): Promise<ReceiptSummary>;
}

type NineTuple = readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

function args(w: Withdrawal, p: WithdrawProofCalldata) {
  return [w, { pA: p.pA, pB: p.pB, pC: p.pC, pubSignals: p.pubSignals as unknown as NineTuple }] as const;
}

/** True for any viem error that means "the call reverted" rather than "the node failed". */
function isRevert(e: unknown): boolean {
  if (!(e instanceof BaseError)) return false;
  return e.walk((x) => x instanceof ContractFunctionRevertedError || x instanceof ExecutionRevertedError) !== null;
}

/**
 * Production {@link ChainPort} over viem.
 *
 * @param o.chainId Expected chain id; verified against the node on {@link verifyChain}.
 * @param o.account Hot key account. Hold it in memory only; never log it.
 * @security The only transaction this port can send is `withdraw` on a pool the service allowlisted.
 */
export function createViemChainPort(o: { chainId: number; rpcUrl: string; account: Account; gasMargin?: bigint }): ChainPort & { verifyChain(): Promise<void> } {
  const chain = { id: o.chainId, name: `chain-${String(o.chainId)}`, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [o.rpcUrl] } } } as const satisfies Chain;
  const pub: PublicClient = createPublicClient({ chain, transport: http(o.rpcUrl) });
  const wallet: WalletClient<Transport, Chain, Account> = createWalletClient({ chain, account: o.account, transport: http(o.rpcUrl) });
  const margin = o.gasMargin ?? 20n;
  return {
    chainId: o.chainId,
    relayerAddress: o.account.address,
    async verifyChain() {
      if ((await pub.getChainId()) !== o.chainId) throw new Error('rpc chain id mismatch');
    },
    getGasPrice: () => pub.getGasPrice(),
    getBalance: () => pub.getBalance({ address: o.account.address }),
    async blockTimestamp() {
      return (await pub.getBlock()).timestamp;
    },
    readScope: (pool) => pub.readContract({ address: pool, abi: poolAbi, functionName: 'SCOPE' }),
    isKnownRoot: (pool, root) => pub.readContract({ address: pool, abi: poolAbi, functionName: 'isKnownRoot', args: [root] }),
    nullifierSpent: (pool, h) => pub.readContract({ address: pool, abi: poolAbi, functionName: 'nullifierSpent', args: [h] }),
    async simulateWithdraw(pool, w, p) {
      try {
        const gas = await pub.estimateContractGas({ address: pool, abi: poolAbi, functionName: 'withdraw', args: args(w, p), account: o.account });
        return { gasLimit: (gas * (100n + margin)) / 100n };
      } catch (e) {
        if (isRevert(e)) throw new SimulationRevert();
        throw e;
      }
    },
    sendWithdraw: (pool, w, p, s) => wallet.writeContract({ address: pool, abi: poolAbi, functionName: 'withdraw', args: args(w, p), gas: s.gas, gasPrice: s.gasPrice }),
    async waitForReceipt(hash, timeoutMs) {
      try {
        const r = await pub.waitForTransactionReceipt({ hash, timeout: timeoutMs });
        return { status: r.status, costWei: r.gasUsed * r.effectiveGasPrice };
      } catch {
        return { status: 'timeout', costWei: 0n };
      }
    },
  };
}
