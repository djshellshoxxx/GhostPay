import { getAddress, type Address, type Hex, type PublicClient } from 'viem';
import { poolAbi } from './abi.js';
import { assertPoolChain } from './chain.js';
import { fail } from './errors.js';
import { PoolTree } from './tree.js';

interface EvtBase {
  readonly blockNumber: bigint;
  readonly logIndex: number;
  readonly txHash: Hex;
}

/** `Deposited` event. */
export interface DepositEvt extends EvtBase {
  readonly kind: 'deposit';
  readonly depositor: Address;
  readonly commitment: bigint;
  readonly label: bigint;
  readonly value: bigint;
  readonly precommitment: bigint;
}

/** `Withdrawn` event. */
export interface WithdrawEvt extends EvtBase {
  readonly kind: 'withdraw';
  readonly recipient: Address;
  readonly value: bigint;
  readonly relayerFee: bigint;
  readonly spentNullifier: bigint;
  readonly newCommitment: bigint;
  readonly aspPublisher: Address;
  readonly aspRoot: bigint;
}

/** `Ragequit` event. */
export interface RagequitEvt extends EvtBase {
  readonly kind: 'ragequit';
  readonly depositor: Address;
  readonly commitment: bigint;
  readonly label: bigint;
  readonly value: bigint;
}

/** Any pool event the SDK consumes. */
export type PoolEvt = DepositEvt | WithdrawEvt | RagequitEvt;

/** Narrow RPC surface the SDK needs (keeps the SDK testable and transport-agnostic). */
export interface PoolRpc {
  getChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  /** All pool events with `fromBlock <= block <= toBlock`, any order. */
  getPoolEvents(a: { pool: Address; fromBlock: bigint; toBlock: bigint }): Promise<PoolEvt[]>;
  isKnownRoot(pool: Address, root: bigint): Promise<boolean>;
}

/** Adapts a viem `PublicClient` to {@link PoolRpc}. */
export function viemPoolRpc(client: Pick<PublicClient, 'getChainId' | 'getBlockNumber' | 'getLogs' | 'readContract'>): PoolRpc {
  return {
    getChainId: () => client.getChainId(),
    getBlockNumber: () => client.getBlockNumber(),
    async getPoolEvents({ pool, fromBlock, toBlock }) {
      const logs = await client.getLogs({
        address: pool,
        events: poolAbi.filter((x) => x.type === 'event'),
        fromBlock,
        toBlock,
        strict: true,
      });
      const out: PoolEvt[] = [];
      for (const l of logs) {
        const base = { blockNumber: l.blockNumber, logIndex: l.logIndex, txHash: l.transactionHash };
        if (l.eventName === 'Deposited') {
          const a = l.args;
          out.push({ kind: 'deposit', ...base, depositor: getAddress(a.depositor), commitment: a.commitment, label: a.label, value: a.value, precommitment: a.precommitment });
        } else if (l.eventName === 'Withdrawn') {
          const a = l.args;
          out.push({ kind: 'withdraw', ...base, recipient: getAddress(a.recipient), value: a.value, relayerFee: a.relayerFee, spentNullifier: a.spentNullifier, newCommitment: a.newCommitment, aspPublisher: getAddress(a.aspPublisher), aspRoot: a.aspRoot });
        } else {
          const a = l.args;
          out.push({ kind: 'ragequit', ...base, depositor: getAddress(a.depositor), commitment: a.commitment, label: a.label, value: a.value });
        }
      }
      return out;
    },
    isKnownRoot: (pool, root) => client.readContract({ address: pool, abi: poolAbi, functionName: 'isKnownRoot', args: [root] }),
  };
}

function order(a: PoolEvt, b: PoolEvt): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
  return a.logIndex - b.logIndex;
}

/** Event-sourced mirror of one pool: ordered events, the local tree, the last synced block. */
export class SyncedPool {
  public readonly chainId: number;
  public readonly pool: Address;
  public tree = new PoolTree();
  public events: PoolEvt[] = [];
  /** Last block fully included (`fromBlock - 1` when nothing synced). */
  public lastBlock: bigint;

  public constructor(chainId: number, pool: Address, fromBlock: bigint) {
    assertPoolChain(chainId);
    this.chainId = chainId;
    this.pool = getAddress(pool);
    this.lastBlock = fromBlock - 1n;
  }

  /** Deposits, in chain order. */
  public get deposits(): DepositEvt[] {
    return this.events.filter((e): e is DepositEvt => e.kind === 'deposit');
  }

  /** Withdrawals, in chain order. */
  public get withdrawals(): WithdrawEvt[] {
    return this.events.filter((e): e is WithdrawEvt => e.kind === 'withdraw');
  }

  /** Ragequits, in chain order. */
  public get ragequits(): RagequitEvt[] {
    return this.events.filter((e): e is RagequitEvt => e.kind === 'ragequit');
  }

  /** Appends events (any order) up to `toBlock` and extends the tree. Events at or below `lastBlock` are refused. */
  public append(events: readonly PoolEvt[], toBlock: bigint): void {
    const sorted = [...events].sort(order);
    for (const e of sorted) {
      if (e.blockNumber <= this.lastBlock) fail('INVALID_INPUT', 'event at or below last synced block');
      if (e.kind === 'deposit') this.tree.insert(e.commitment);
      else if (e.kind === 'withdraw') this.tree.insert(e.newCommitment);
      this.events.push(e);
    }
    if (toBlock > this.lastBlock) this.lastBlock = toBlock;
  }

  /** Drops every event above `block` and rebuilds the tree (reorg handling). */
  public rollbackTo(block: bigint): void {
    const keep = this.events.filter((e) => e.blockNumber <= block);
    this.events = [];
    this.tree = new PoolTree();
    for (const e of keep) {
      if (e.kind === 'deposit') this.tree.insert(e.commitment);
      else if (e.kind === 'withdraw') this.tree.insert(e.newCommitment);
      this.events.push(e);
    }
    if (this.lastBlock > block) this.lastBlock = block;
  }

  /** Leaf index of a commitment, or -1. */
  public leafIndexOf(commitmentValue: bigint): number {
    return this.tree.indexOf(commitmentValue);
  }

  /** True if some `Withdrawn` spent this nullifier hash. */
  public isSpent(nullifierHashValue: bigint): boolean {
    return this.events.some((e) => e.kind === 'withdraw' && e.spentNullifier === nullifierHashValue);
  }
}

/** Options for {@link syncPool}. */
export interface SyncOptions {
  /** Resume from this mirror instead of starting over. */
  readonly prior?: SyncedPool;
  /** Re-fetch this many blocks behind `prior.lastBlock` (reorg depth; use the chain's `finalityDepth`). Default 0. */
  readonly reorgDepth?: bigint;
  /** Maximum block span of one log request. Default 1000. */
  readonly maxRange?: bigint;
}

/**
 * Syncs the pool's events into a local tree.
 *
 * @param rpc RPC adapter.
 * @param pool Pool address.
 * @param fromBlock Deployment block (ignored when `opts.prior` is given).
 * @throws PoolSdkError `WRONG_CHAIN` if the RPC reports a non-testnet chain.
 * @security The RPC sees the pool address and the block ranges queried (N5); it does not see notes or seeds.
 */
export async function syncPool(rpc: PoolRpc, pool: Address, fromBlock: bigint, opts: SyncOptions = {}): Promise<SyncedPool> {
  const chainId = await rpc.getChainId();
  assertPoolChain(chainId);
  const maxRange = opts.maxRange ?? 1000n;
  if (maxRange < 1n) fail('INVALID_INPUT', 'maxRange must be >= 1');
  const st = opts.prior ?? new SyncedPool(chainId, pool, fromBlock);
  if (st.chainId !== chainId || st.pool !== getAddress(pool)) fail('INVALID_INPUT', 'prior state is for another pool');
  const depth = opts.reorgDepth ?? 0n;
  if (opts.prior !== undefined && depth > 0n) {
    const back = st.lastBlock - depth;
    st.rollbackTo(back < 0n ? -1n : back);
  }
  const head = await rpc.getBlockNumber();
  let start = st.lastBlock + 1n;
  while (start <= head) {
    const end = start + maxRange - 1n > head ? head : start + maxRange - 1n;
    const evts = await rpc.getPoolEvents({ pool: st.pool, fromBlock: start, toBlock: end });
    st.append(evts, end);
    start = end + 1n;
  }
  return st;
}

/**
 * Checks the local tree root is a root the pool still accepts (SP-SDK-4).
 *
 * @throws PoolSdkError `ROOT_MISMATCH`.
 * @security Run before proving: proving against a stale or forked tree wastes a proof and may leak timing.
 */
export async function assertRootMatches(rpc: PoolRpc, st: SyncedPool): Promise<void> {
  if (!(await rpc.isKnownRoot(st.pool, st.tree.root()))) fail('ROOT_MISMATCH', 'local tree root is not known to the pool');
}
