import { fail, type ChainReader } from '@ghostpay/external-pools';
import { decodeEventLog, toEventSelector, type Address } from 'viem';
import { poolAbi } from './abi.js';

const LEAF_TOPIC = toEventSelector('LeafInserted(uint256 _index, uint256 _leaf, uint256 _root)');

/**
 * Reads the pool's state-tree leaves from `LeafInserted` logs (chunked), checks that their indexes are contiguous from 1
 * (the event reports the tree size after insertion) and returns them with the root after the last insertion.
 *
 * @param chain Read-only chain access.
 * @param chainId Chain.
 * @param pool Pool contract (from the pinned manifest).
 * @param fromBlock First block to scan (the manifest deployment block).
 * @param chunk Blocks per `eth_getLogs` request (default 10 000, the SDK's default chunk size).
 * @throws ExternalPoolError STATE_UNAVAILABLE on gaps or duplicate indexes; chain errors propagate.
 * @security The caller MUST compare `lastRoot` with `pool.currentRoot()` (on-chain) before trusting the leaves.
 */
export async function readStateLeaves(
  chain: ChainReader,
  chainId: number,
  pool: Address,
  fromBlock: bigint,
  chunk = 10_000n,
): Promise<{ leaves: bigint[]; lastRoot: bigint }> {
  const head = await chain.getBlockNumber(chainId);
  const byIndex = new Map<bigint, { leaf: bigint; root: bigint }>();
  for (let from = fromBlock; from <= head; from += chunk) {
    const to = from + chunk - 1n > head ? head : from + chunk - 1n;
    const logs = await chain.getLogs(chainId, { address: pool, topics: [LEAF_TOPIC], fromBlock: from, toBlock: to });
    for (const l of logs) {
      const ev = decodeEventLog({ abi: poolAbi, eventName: 'LeafInserted', data: l.data, topics: [...l.topics] as [`0x${string}`] });
      const a = ev.args;
      if (a === undefined) return fail('STATE_UNAVAILABLE', 'undecodable LeafInserted log');
      if (byIndex.has(a._index)) return fail('STATE_UNAVAILABLE', 'duplicate leaf index in logs');
      byIndex.set(a._index, { leaf: a._leaf, root: a._root });
    }
  }
  const leaves: bigint[] = [];
  let lastRoot = 0n;
  // `State._insert` emits `LeafInserted(_merkleTree.size, ...)` AFTER the insertion, so the first leaf has _index 1
  // (verified against the real contract on anvil, upstream commit d494b63).
  for (let i = 1n; i <= BigInt(byIndex.size); i++) {
    const e = byIndex.get(i);
    if (e === undefined) return fail('STATE_UNAVAILABLE', 'gap in state tree leaves');
    leaves.push(e.leaf);
    lastRoot = e.root;
  }
  return { leaves, lastRoot };
}

/** Offline proof inputs cached in the vault (EP-VAULT-5). */
export interface ProofCache {
  readonly stateLeaves: readonly bigint[];
  readonly aspLeaves: readonly bigint[];
}

/** @returns Bytes for `Vault.putCache`. */
export function encodeProofCache(c: ProofCache): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ v: 1, s: c.stateLeaves.map(String), a: c.aspLeaves.map(String) }));
}

/**
 * @param bytes Bytes from `Vault.getCache`.
 * @throws ExternalPoolError STATE_UNAVAILABLE on malformed data.
 */
export function decodeProofCache(bytes: Uint8Array): ProofCache {
  try {
    const o = JSON.parse(new TextDecoder().decode(bytes)) as { v?: unknown; s?: unknown; a?: unknown };
    const dec = (x: unknown): bigint[] => {
      if (!Array.isArray(x)) throw new Error('x');
      return x.map((e) => {
        if (typeof e !== 'string' || !/^\d{1,78}$/.test(e)) throw new Error('x');
        return BigInt(e);
      });
    };
    if (o.v !== 1) throw new Error('x');
    return { stateLeaves: dec(o.s), aspLeaves: dec(o.a) };
  } catch {
    return fail('STATE_UNAVAILABLE', 'proof cache is malformed');
  }
}
