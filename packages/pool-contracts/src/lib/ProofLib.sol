// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IGhostPayShieldedPool} from "../interfaces/IGhostPayShieldedPool.sol";

/// @title ProofLib
/// @notice Named accessors for the public signals of the withdraw and ragequit proofs.
/// @dev The order is normative and must match the circuits' `publicSignals` (circom lists outputs
/// first). Withdraw: `[0] newCommitmentHash, [1] existingNullifierHash, [2] withdrawnValue,
/// [3] stateRoot, [4] stateTreeDepth, [5] aspEnabled, [6] ASPRoot, [7] ASPTreeDepth, [8] context`.
/// Ragequit: `[0] commitment, [1] nullifierHash, [2] value, [3] label`.
library ProofLib {
    /// @notice Change-note commitment inserted by the withdrawal.
    /// @param p The proof.
    /// @return Signal 0.
    function newCommitmentHash(IGhostPayShieldedPool.WithdrawProof calldata p)
        internal
        pure
        returns (uint256)
    {
        return p.pubSignals[0];
    }

    /// @notice Nullifier hash of the spent note.
    /// @param p The proof.
    /// @return Signal 1.
    function existingNullifierHash(IGhostPayShieldedPool.WithdrawProof calldata p)
        internal
        pure
        returns (uint256)
    {
        return p.pubSignals[1];
    }

    /// @notice Withdrawn value (including the relayer fee).
    /// @param p The proof.
    /// @return Signal 2.
    function withdrawnValue(IGhostPayShieldedPool.WithdrawProof calldata p)
        internal
        pure
        returns (uint256)
    {
        return p.pubSignals[2];
    }

    /// @notice State root the membership proof is against.
    /// @param p The proof.
    /// @return Signal 3.
    function stateRoot(IGhostPayShieldedPool.WithdrawProof calldata p)
        internal
        pure
        returns (uint256)
    {
        return p.pubSignals[3];
    }

    /// @notice State tree depth used by the proof.
    /// @param p The proof.
    /// @return Signal 4.
    function stateTreeDepth(IGhostPayShieldedPool.WithdrawProof calldata p)
        internal
        pure
        returns (uint256)
    {
        return p.pubSignals[4];
    }

    /// @notice 1 if the association-set inclusion is enforced, else 0.
    /// @param p The proof.
    /// @return Signal 5.
    function aspEnabled(IGhostPayShieldedPool.WithdrawProof calldata p)
        internal
        pure
        returns (uint256)
    {
        return p.pubSignals[5];
    }

    /// @notice Association-set root.
    /// @param p The proof.
    /// @return Signal 6.
    function aspRoot(IGhostPayShieldedPool.WithdrawProof calldata p)
        internal
        pure
        returns (uint256)
    {
        return p.pubSignals[6];
    }

    /// @notice Association-set tree depth.
    /// @param p The proof.
    /// @return Signal 7.
    function aspTreeDepth(IGhostPayShieldedPool.WithdrawProof calldata p)
        internal
        pure
        returns (uint256)
    {
        return p.pubSignals[7];
    }

    /// @notice Context binding the `Withdrawal` data.
    /// @param p The proof.
    /// @return Signal 8.
    function context(IGhostPayShieldedPool.WithdrawProof calldata p)
        internal
        pure
        returns (uint256)
    {
        return p.pubSignals[8];
    }

    /// @notice Opened commitment.
    /// @param p The proof.
    /// @return Signal 0.
    function commitment(IGhostPayShieldedPool.RagequitProof calldata p)
        internal
        pure
        returns (uint256)
    {
        return p.pubSignals[0];
    }

    /// @notice Nullifier hash of the opened commitment.
    /// @param p The proof.
    /// @return Signal 1.
    function nullifierHash(IGhostPayShieldedPool.RagequitProof calldata p)
        internal
        pure
        returns (uint256)
    {
        return p.pubSignals[1];
    }

    /// @notice Value of the opened commitment.
    /// @param p The proof.
    /// @return Signal 2.
    function value(IGhostPayShieldedPool.RagequitProof calldata p) internal pure returns (uint256) {
        return p.pubSignals[2];
    }

    /// @notice Label of the opened commitment.
    /// @param p The proof.
    /// @return Signal 3.
    function label(IGhostPayShieldedPool.RagequitProof calldata p) internal pure returns (uint256) {
        return p.pubSignals[3];
    }
}
