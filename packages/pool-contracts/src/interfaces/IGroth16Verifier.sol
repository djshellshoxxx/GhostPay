// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title IWithdrawVerifier
/// @notice ABI of the snarkjs-generated Groth16 verifier of the `Withdraw(32)` circuit (9 public
/// signals, order fixed in `ProofLib`).
/// @dev The generated contract (GPL-3.0, kept in `src/verifiers/`) exposes exactly this function as
/// `public view`; the pool only ever reaches it through this interface, i.e. with `STATICCALL`.
interface IWithdrawVerifier {
    /// @notice Verifies a Groth16 proof against the circuit's verification key.
    /// @dev snarkjs verifiers return `false` (not revert) for a public signal `>= P` (`checkField`) and
    /// for a failed pairing check.
    /// @param pA Proof element A (G1).
    /// @param pB Proof element B (G2, snarkjs Solidity calldata order).
    /// @param pC Proof element C (G1).
    /// @param pubSignals The 9 public signals.
    /// @return True if the proof verifies.
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[9] calldata pubSignals
    ) external view returns (bool);
}

/// @title IRagequitVerifier
/// @notice ABI of the snarkjs-generated Groth16 verifier of the commitment (ragequit) circuit
/// (4 public signals: commitment, nullifierHash, value, label).
/// @dev Same conventions as `IWithdrawVerifier`.
interface IRagequitVerifier {
    /// @notice Verifies a Groth16 proof against the circuit's verification key.
    /// @param pA Proof element A (G1).
    /// @param pB Proof element B (G2, snarkjs Solidity calldata order).
    /// @param pC Proof element C (G1).
    /// @param pubSignals The 4 public signals.
    /// @return True if the proof verifies.
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[4] calldata pubSignals
    ) external view returns (bool);
}
