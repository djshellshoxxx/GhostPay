import { MAX_TREE_DEPTH, assertField } from './constants.js';
import { fail } from './errors.js';
import { hashNode } from './hash.js';

/** Inclusion path in the circuit's layout: one sibling slot per level, `0` = no sibling. */
export interface CircuitPath {
  readonly root: bigint;
  readonly depth: number;
  /** Real leaf position; bit `i` is the left/right choice at level `i`. */
  readonly index: number;
  /** Exactly {@link MAX_TREE_DEPTH} entries. */
  readonly siblings: readonly bigint[];
}

/**
 * Minimal LeanIMT (zk-kit semantics: a node without a right sibling is propagated unchanged).
 * Reference model for tests and vectors; recomputes levels on demand (O(n) per root).
 *
 * @security Holds only public data (commitments or labels).
 */
export class LeanImt {
  private readonly leaves: bigint[] = [];

  /** Appends a leaf. Zero leaves are rejected because `0` encodes "no sibling" in the circuit. */
  public insert(leaf: bigint): void {
    assertField(leaf, 'leaf');
    if (leaf === 0n) fail('NOT_FIELD', 'leaf 0 is reserved for the empty sibling');
    if (this.leaves.length >= 2 ** MAX_TREE_DEPTH) fail('BAD_INDEX', 'tree full');
    this.leaves.push(leaf);
  }

  /** Number of leaves. */
  public get size(): number {
    return this.leaves.length;
  }

  /** Depth: 0 for size 0 or 1, else `ceil(log2(size))`. */
  public get depth(): number {
    let d = 0;
    while (2 ** d < this.leaves.length) d++;
    return d;
  }

  private levels(): bigint[][] {
    const out: bigint[][] = [this.leaves.slice()];
    for (let l = 0; l < this.depth; l++) {
      const cur = out[l] as bigint[];
      const next: bigint[] = [];
      for (let i = 0; i < cur.length; i += 2) {
        const left = cur[i] as bigint;
        const right = cur[i + 1];
        next.push(right === undefined ? left : hashNode(left, right));
      }
      out.push(next);
    }
    return out;
  }

  /** Root; `0n` for an empty tree. */
  public root(): bigint {
    if (this.leaves.length === 0) return 0n;
    const lv = this.levels();
    return (lv[lv.length - 1] as bigint[])[0] as bigint;
  }

  /**
   * Path for the leaf at `index`, padded to {@link MAX_TREE_DEPTH}.
   *
   * @throws PoolCircuitError `BAD_INDEX`.
   */
  public path(index: number): CircuitPath {
    if (!Number.isInteger(index) || index < 0 || index >= this.leaves.length)
      fail('BAD_INDEX', 'leaf index out of range');
    const lv = this.levels();
    const siblings: bigint[] = [];
    let cur = index;
    for (let l = 0; l < this.depth; l++) {
      const level = lv[l] as bigint[];
      const sib = (cur & 1) === 1 ? level[cur - 1] : level[cur + 1];
      siblings.push(sib ?? 0n);
      cur >>= 1;
    }
    while (siblings.length < MAX_TREE_DEPTH) siblings.push(0n);
    return { root: this.root(), depth: this.depth, index, siblings };
  }

  /** Position of `leaf`, or -1. */
  public indexOf(leaf: bigint): number {
    return this.leaves.indexOf(leaf);
  }
}
