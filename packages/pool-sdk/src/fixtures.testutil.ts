import { getAddress, type Address } from 'viem';
import { commitment, deriveNoteSecrets, precommitment, type WithSeed } from './notes.js';
import { SyncedPool, type DepositEvt, type PoolEvt, type PoolRpc, type WithdrawEvt } from './sync.js';

export const POOL: Address = getAddress('0x1000000000000000000000000000000000000001');
export const SEED = new Uint8Array(32).map((_, i) => i + 1);
export const withSeed: WithSeed = (f) => f(SEED.slice());
export const OTHER_SEED = new Uint8Array(32).fill(9);
export const withOther: WithSeed = (f) => f(OTHER_SEED.slice());
export const A1: Address = getAddress('0x00000000000000000000000000000000000000a1');
export const A2: Address = getAddress('0x00000000000000000000000000000000000000a2');
export const A3: Address = getAddress('0x00000000000000000000000000000000000000a3');
const TX = `0x${'ab'.repeat(32)}` as const;

export function dep(withS: WithSeed, index: number, value: bigint, label: bigint, block: bigint, logIndex = 0, depositor: Address = A1): DepositEvt {
  const pre = precommitment(deriveNoteSecrets(withS, 31337, POOL, index));
  return { kind: 'deposit', blockNumber: block, logIndex, txHash: TX, depositor, commitment: commitment(value, label, pre), label, value, precommitment: pre };
}

export function foreignDeposit(n: number, block: bigint, value = 100n): DepositEvt {
  const label = BigInt(1000 + n);
  const pre = BigInt(5000 + n);
  return { kind: 'deposit', blockNumber: block, logIndex: n, txHash: TX, depositor: A2, commitment: commitment(value, label, pre), label, value, precommitment: pre };
}

export function wd(spentNullifier: bigint, value: bigint, newCommitment: bigint, block: bigint, logIndex = 0): WithdrawEvt {
  return { kind: 'withdraw', blockNumber: block, logIndex, txHash: TX, recipient: A3, value, relayerFee: 0n, spentNullifier, newCommitment, aspPublisher: '0x0000000000000000000000000000000000000000', aspRoot: 0n };
}

export function fakeRpc(events: PoolEvt[], head: bigint, chainId = 31337, known: (r: bigint) => boolean = () => true): PoolRpc & { calls: number } {
  const r = {
    calls: 0,
    getChainId: () => Promise.resolve(chainId),
    getBlockNumber: () => Promise.resolve(head),
    getPoolEvents: ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
      r.calls++;
      return Promise.resolve(events.filter((e) => e.blockNumber >= fromBlock && e.blockNumber <= toBlock));
    },
    isKnownRoot: (_p: Address, root: bigint) => Promise.resolve(known(root)),
  };
  return r;
}

export function synced(events: PoolEvt[], last: bigint): SyncedPool {
  const s = new SyncedPool(31337, POOL, 1n);
  s.append(events, last);
  return s;
}
