// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IPoseidonT3} from "../interfaces/IPoseidon.sol";

/// @notice Storage of a Lean incremental Merkle tree (same layout semantics as zk-kit `LeanIMTData`).
/// @param size Number of leaves.
/// @param depth Current depth (`ceil(log2(size))`, 0 for 0 or 1 leaves).
/// @param sideNodes Per level, the last left node; `sideNodes[depth]` is the root.
/// @param leaves 1-based index of every leaf (0 = absent).
struct LeanTree {
    uint256 size;
    uint256 depth;
    mapping(uint256 level => uint256 node) sideNodes;
    mapping(uint256 leaf => uint256 indexPlusOne) leaves;
}

/// @title PoolLeanIMT
/// @notice Append-only Lean incremental Merkle tree hashed with an external Poseidon T3 contract.
/// @dev Port of `_insert`, `_has` and `_root` of `@zk-kit/lean-imt.sol` 2.0.1 `InternalLeanIMT`
/// (MIT, Copyright (c) 2024 Ethereum Foundation). The only change: `PoseidonT3.hash` (a linked
/// library call, i.e. `DELEGATECALL`) is replaced by a `STATICCALL` to the immutable hasher. Leaf
/// validity (non-zero, `< P`, not present) and the depth cap are checked by the caller. Equality with
/// the original is asserted by the differential test `LeanIMTDiff.t.sol`.
library PoolLeanIMT {
    /// @notice Appends `leaf` and returns the new root.
    /// @param self The tree.
    /// @param hasher Poseidon T3 implementation.
    /// @param leaf A valid, new, non-zero field element.
    /// @return node The new root.
    function insert(LeanTree storage self, IPoseidonT3 hasher, uint256 leaf)
        internal
        returns (uint256 node)
    {
        uint256 index = self.size;
        uint256 treeDepth = self.depth;
        // A new insertion increases the depth by at most 1.
        if (2 ** treeDepth < index + 1) {
            ++treeDepth;
        }
        self.depth = treeDepth;
        node = leaf;
        for (uint256 level = 0; level < treeDepth; ++level) {
            if ((index >> level) & 1 == 1) {
                // Immutable, pure hasher (STATICCALL); at most MAX_TREE_DEPTH iterations.
                // forge-lint: disable-next-line(calls-loop)
                node = hasher.hash([self.sideNodes[level], node]);
            } else {
                self.sideNodes[level] = node;
            }
        }
        self.size = index + 1;
        self.sideNodes[treeDepth] = node;
        self.leaves[leaf] = index + 1;
    }

    /// @notice Whether `leaf` is in the tree.
    /// @param self The tree.
    /// @param leaf The leaf.
    /// @return True if present.
    function has(LeanTree storage self, uint256 leaf) internal view returns (bool) {
        return self.leaves[leaf] != 0;
    }

    /// @notice The current root (0 for an empty tree).
    /// @param self The tree.
    /// @return The root.
    function root(LeanTree storage self) internal view returns (uint256) {
        return self.sideNodes[self.depth];
    }
}
