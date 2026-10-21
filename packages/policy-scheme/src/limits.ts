import { concatHex, encodeAbiParameters, keccak256 } from 'viem/utils';
import { fail } from './errors.js';
import { MAX_UINT256, MAX_UINT64, ZERO_HASH, addr, bytes32, type Address, type Hex } from './types.js';

/** One per-token rolling-window cap. */
export interface TokenLimit {
  /** ERC-20 token, or the zero address for the native coin. */
  readonly token: Address;
  /** Cap per window in base units; {@link UNLIMITED} means no cap. Must be non-zero. */
  readonly limit: bigint;
  /** Window length in seconds (uint64); must be non-zero unless `limit` is {@link UNLIMITED}. */
  readonly windowSeconds: bigint;
}

/** A leaf of the limits tree. */
export interface LimitLeaf extends TokenLimit {
  /** `keccak256(bytes.concat(keccak256(abi.encode(token, limit, windowSeconds))))`. */
  readonly leaf: Hex;
}

/** A built limits tree (OpenZeppelin `StandardMerkleTree` layout, sorted-pair hashing). */
export interface LimitsTree {
  /** Merkle root to put into the policy. */
  readonly root: Hex;
  /** Leaves sorted by leaf hash (the order of `tree`). */
  readonly leaves: readonly LimitLeaf[];
  /** Flat node array: `tree[0]` is the root, leaf `i` is at `tree[tree.length - 1 - i]`. */
  readonly tree: readonly Hex[];
}

/** The `IPolicyAccount.LimitProof` struct passed to `requestWithdraw`. */
export interface LimitProof {
  readonly limit: bigint;
  readonly windowSeconds: bigint;
  readonly proof: readonly Hex[];
}

/** A proof together with the leaf the owner must sign as `limitLeafHash`. */
export interface TokenLimitProof extends LimitProof {
  readonly leaf: Hex;
}

/** `type(uint256).max`: an unlimited leaf. */
export const UNLIMITED = MAX_UINT256;

/** @internal Validates and normalises one limit. */
function checkLimit(l: TokenLimit, i: number): TokenLimit {
  const token = addr(l.token, `limits[${String(i)}].token`);
  if (typeof l.limit !== 'bigint' || l.limit < 1n || l.limit > MAX_UINT256) return fail('INVALID_LIMIT', 'limit');
  const w = l.windowSeconds;
  if (typeof w !== 'bigint' || w < 0n || w > MAX_UINT64) return fail('INVALID_LIMIT', 'windowSeconds');
  if (l.limit !== UNLIMITED && w === 0n) return fail('INVALID_LIMIT', 'windowSeconds');
  return { token, limit: l.limit, windowSeconds: w };
}

/**
 * Leaf hash of one limit, exactly as `PolicyAccount.requestWithdraw` recomputes it.
 *
 * @remarks `keccak256(bytes.concat(keccak256(abi.encode(address token, uint256 limit, uint64 windowSeconds))))`
 * (OpenZeppelin double-hashed leaf, so a leaf can never be confused with an inner node).
 * A zero limit, a limited leaf with zero window, or out-of-range values are refused because the
 * contract would revert on every withdrawal under them.
 *
 * @param l Token limit.
 * @returns 32-byte leaf.
 * @throws {PolicySchemeError} `INVALID_ADDRESS`, `INVALID_LIMIT`.
 * @security The owner signs this value as `Withdraw.limitLeafHash` (audit L-04): sign only leaves of
 * the tree whose root is in the account's policy.
 * @testVector policy-scheme.limitTrees
 */
export function limitLeafHash(l: TokenLimit): Hex {
  const v = checkLimit(l, 0);
  const inner = keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }, { type: 'uint64' }],
      [v.token, v.limit, v.windowSeconds],
    ),
  );
  return keccak256(inner);
}

/** @internal OpenZeppelin `Hashes.commutativeKeccak256`. */
function hashPair(a: Hex, b: Hex): Hex {
  return a < b ? keccak256(concatHex([a, b])) : keccak256(concatHex([b, a]));
}

/**
 * Builds the per-token limits tree and its root.
 *
 * @remarks Leaves are {@link limitLeafHash}; they are sorted by hash and laid out like
 * OpenZeppelin `StandardMerkleTree` (`@openzeppelin/merkle-tree`), with sorted-pair keccak256
 * inner nodes, so proofs verify with `MerkleProof.verifyCalldata`. Tokens are compared by
 * address (case-insensitive). A one-leaf tree has `root == leaf` and an empty proof.
 *
 * @param limits At least one limit, each token at most once.
 * @returns The tree; frozen.
 * @throws {PolicySchemeError} `EMPTY_TREE`, `DUPLICATE_TOKEN`, `INVALID_ADDRESS`, `INVALID_LIMIT`.
 * @security With a non-zero root a token without a leaf can never be withdrawn (P1); add an
 * {@link UNLIMITED} leaf for every token the account may receive. Duplicate tokens are refused
 * because they would let the key holder choose the more permissive cap.
 * @testVector policy-scheme.limitTrees
 */
export function buildLimitsTree(limits: readonly TokenLimit[]): LimitsTree {
  const list: unknown = limits;
  if (!Array.isArray(list) || limits.length === 0) return fail('EMPTY_TREE');
  const seen = new Set<string>();
  const leaves: LimitLeaf[] = limits.map((l, i) => {
    const v = checkLimit(l, i);
    const key = v.token.toLowerCase();
    if (seen.has(key)) fail('DUPLICATE_TOKEN', `limits[${String(i)}]`);
    seen.add(key);
    return Object.freeze({ ...v, leaf: limitLeafHash(v) });
  });
  leaves.sort((a, b) => (a.leaf < b.leaf ? -1 : a.leaf > b.leaf ? 1 : 0));
  const n = leaves.length;
  const tree: Hex[] = new Array<Hex>(2 * n - 1).fill(ZERO_HASH);
  leaves.forEach((l, i) => {
    tree[tree.length - 1 - i] = l.leaf;
  });
  for (let i = tree.length - 1 - n; i >= 0; i--) {
    tree[i] = hashPair(tree[2 * i + 1] as Hex, tree[2 * i + 2] as Hex);
  }
  return Object.freeze({ root: tree[0] as Hex, leaves: Object.freeze(leaves), tree: Object.freeze(tree) });
}

/**
 * Merkle proof of a token's leaf, ready for `requestWithdraw` and for `limitLeafHash`.
 *
 * @param tree Tree from {@link buildLimitsTree}.
 * @param token Token (zero address for native).
 * @returns Limit, window, proof and leaf; the proof is self-verified against the root.
 * @throws {PolicySchemeError} `UNKNOWN_TOKEN`, `INVALID_ADDRESS`, `INVALID_PROOF`.
 * @security Public data (reveals the token's cap once submitted on-chain).
 * @testVector policy-scheme.limitTrees
 */
export function getLimitProof(tree: LimitsTree, token: Address): TokenLimitProof {
  const t = addr(token, 'token').toLowerCase();
  const idx = tree.leaves.findIndex((l) => l.token.toLowerCase() === t);
  const entry = tree.leaves[idx];
  if (entry === undefined) return fail('UNKNOWN_TOKEN');
  const proof: Hex[] = [];
  let pos = tree.tree.length - 1 - idx;
  while (pos > 0) {
    const sibling = pos % 2 === 1 ? pos + 1 : pos - 1;
    proof.push(tree.tree[sibling] as Hex);
    pos = Math.floor((pos - 1) / 2);
  }
  if (!verifyLimitProof(tree.root, entry.leaf, proof)) return fail('INVALID_PROOF');
  return Object.freeze({
    limit: entry.limit,
    windowSeconds: entry.windowSeconds,
    proof: Object.freeze(proof),
    leaf: entry.leaf,
  });
}

/**
 * Verifies a proof like OpenZeppelin `MerkleProof.verifyCalldata` (sorted pairs).
 *
 * @param root Expected root.
 * @param leaf Leaf hash.
 * @param proof Sibling hashes, leaf to root.
 * @returns True if the proof reconstructs `root`.
 * @throws {PolicySchemeError} `INVALID_HEX` for malformed words.
 * @security Public data.
 * @testVector policy-scheme.limitTrees
 */
export function verifyLimitProof(root: Hex, leaf: Hex, proof: readonly Hex[]): boolean {
  let h = bytes32(leaf, 'leaf');
  for (const p of proof) h = hashPair(h, bytes32(p, 'proof'));
  return h === bytes32(root, 'root');
}

/**
 * The `LimitProof` and `limitLeafHash` to use for an account without limits (`limitsRoot == 0`).
 *
 * @returns Empty proof, limit 0, window 0, leaf zero (the contract ignores all of them).
 * @security Public data.
 * @testVector policy-scheme.withdraws
 */
export function noLimitsProof(): TokenLimitProof {
  return Object.freeze({ limit: 0n, windowSeconds: 0n, proof: Object.freeze([]), leaf: ZERO_HASH });
}
