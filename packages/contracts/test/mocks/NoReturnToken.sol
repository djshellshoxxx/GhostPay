// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title NoReturnToken
/// @notice USDT-style token whose `transfer`, `transferFrom` and `approve` return no value (tests only).
contract NoReturnToken {
    /// @notice Token balances.
    mapping(address => uint256) public balanceOf;
    /// @notice Token allowances.
    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice Mint `amount` to `to`.
    /// @param to Recipient.
    /// @param amount Amount in base units.
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    /// @notice Approve `spender` for `amount`; returns nothing.
    /// @param spender Spender.
    /// @param amount Allowance.
    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    /// @notice Transfer; returns nothing.
    /// @param to Recipient.
    /// @param amount Amount.
    function transfer(address to, uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }

    /// @notice Transfer from; returns nothing.
    /// @param from Sender.
    /// @param to Recipient.
    /// @param amount Amount.
    function transferFrom(address from, address to, uint256 amount) external {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}
