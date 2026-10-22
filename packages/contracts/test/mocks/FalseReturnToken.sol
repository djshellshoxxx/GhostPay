// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title FalseReturnToken
/// @notice Token whose transfers do nothing and return `false` instead of reverting (tests only).
contract FalseReturnToken {
    /// @notice Token balances.
    mapping(address => uint256) public balanceOf;

    /// @notice Mint `amount` to `to`.
    /// @param to Recipient.
    /// @param amount Amount in base units.
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    /// @notice Allowance is always unlimited.
    /// @return Max uint.
    function allowance(address, address) external pure returns (uint256) {
        return type(uint256).max;
    }

    /// @notice Always returns false without moving funds.
    /// @return Always false.
    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }

    /// @notice Always returns false without moving funds.
    /// @return Always false.
    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false;
    }
}
