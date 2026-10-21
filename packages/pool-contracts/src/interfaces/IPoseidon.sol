// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title IPoseidonT3
/// @notice ABI of the deployed, unmodified `poseidon-solidity` 0.0.5 `PoseidonT3` library
/// (circomlib-compatible Poseidon with 2 inputs over the bn254 scalar field).
/// @dev Called as a contract with `STATICCALL`; never linked (a linked call would be `DELEGATECALL`).
interface IPoseidonT3 {
    /// @notice Poseidon hash of two field elements.
    /// @param inputs The two inputs (reduced mod P by the implementation).
    /// @return The hash, a field element.
    function hash(uint256[2] calldata inputs) external pure returns (uint256);
}

/// @title IPoseidonT4
/// @notice ABI of the deployed, unmodified `poseidon-solidity` 0.0.5 `PoseidonT4` library
/// (circomlib-compatible Poseidon with 3 inputs).
/// @dev Called as a contract with `STATICCALL`; never linked.
interface IPoseidonT4 {
    /// @notice Poseidon hash of three field elements.
    /// @param inputs The three inputs (reduced mod P by the implementation).
    /// @return The hash, a field element.
    function hash(uint256[3] calldata inputs) external pure returns (uint256);
}
