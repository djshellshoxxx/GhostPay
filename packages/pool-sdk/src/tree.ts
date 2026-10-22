import { LeanIMT } from '@zk-kit/lean-imt';
import { fail } from './errors.js';
import { MAX_TREE_DEPTH, assertField } from './field.js';
import { poseidonT3 } from './poseidon.js';

/** Merkle witness for the circuit: siblings padded with zeros to {@link MAX_TREE_DEPTH}. */
export interface TreeProof {
  readonly root: bigint;
  readonly leaf: bigint;
  /** Actual tree depth at proof time. */
  readonly depth: number;
  /** Leaf position (the real leaf index). */
  readonly leafIndex: number;
  /** zk-kit compressed path-bit index (bits only where a sibling exists). */
  readonly pathIndex: number;
  /** Siblings, zero-padded to `MAX_TREE_DEPTH` entries. */
  readonly siblings: readonly bigint[];
}

/**
 * Local mirror of the pool's LeanIMT (Poseidon, binary, no padding leaves), same as 0xbow `State.sol`.
 *
 * @security Pure computation; holds only public data.
 */
export class PoolTree {
  private readonly imt = new LeanIMT<bigint>((a, b) => poseidonT3(a, b));

  /** Appends a leaf (a commitment, including change commitments of value 0). */
  public insert(leaf: bigint): void {
    assertField(leaf, 'leaf');
    if (this.imt.size >= 2 ** MAX_TREE_DEPTH) fail('INVALID_INPUT', 'tree full');
    this.imt.insert(leaf);
  }

  /** Current root; `0n` for an empty tree. */
  public root(): bigint {
    return this.imt.size === 0 ? 0n : this.imt.root;
  }

  /** Current depth (0 for 0 or 1 leaves). */
  public depth(): number {
    return this.imt.depth;
  }

  /** Number of leaves. */
  public get size(): number {
    return this.imt.size;
  }

  /** Leaf at position `i`. */
  public leaf(i: number): bigint {
    const v = this.imt.leaves[i];
    if (v === undefined) fail('INVALID_INPUT', 'leaf index out of range');
    return v;
  }

  /** Position of `leaf`, or -1. */
  public indexOf(leaf: bigint): number {
    return this.imt.indexOf(leaf);
  }

  /**
   * Inclusion proof for the leaf at `i`.
   *
   * @throws PoolSdkError `INVALID_INPUT` for an out-of-range index.
   */
  public proof(i: number): TreeProof {
    if (!Number.isInteger(i) || i < 0 || i >= this.imt.size) fail('INVALID_INPUT', 'leaf index out of range');
    const p = this.imt.generateProof(i);
    // zk-kit omits levels without a sibling; the circuit wants one slot per level with 0 = none.
    const siblings: bigint[] = [];
    const compressed = [...p.siblings];
    let levelSize = this.imt.size;
    let cur = i;
    for (let l = 0; l < this.imt.depth; l++) {
      siblings.push((cur & 1) === 1 || cur + 1 < levelSize ? (compressed.shift() as bigint) : 0n);
      cur >>= 1;
      levelSize = Math.ceil(levelSize / 2);
    }
    while (siblings.length < MAX_TREE_DEPTH) siblings.push(0n);
    return { root: p.root, leaf: p.leaf, depth: this.imt.depth, leafIndex: i, pathIndex: p.index, siblings };
  }
}
