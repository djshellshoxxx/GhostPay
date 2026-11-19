// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title ReturnBombStealth
/// @notice Test double: a "stealth address" that accepts ETH and answers with `size` bytes of return data while
/// touching the same memory either way, so the only gas difference between sizes is what the CALLER copies.
/// Lets tests prove the router's native-buffer forward does not copy return data (audit A-3, 2026-11-18).
contract ReturnBombStealth {
    /// @notice Bytes of return data sent back to the caller.
    uint256 public size;

    /// @notice Sets the return-data size.
    /// @param size_ Number of bytes to return on the next ETH receipt.
    function setSize(uint256 size_) external {
        size = size_;
    }

    /// @notice Accepts ETH and returns `size` bytes (memory is expanded to the maximum regardless of `size`).
    fallback() external payable {
        uint256 n = size;
        assembly ("memory-safe") {
            mstore(0x40000, 1)
            return(0, n)
        }
    }
}
