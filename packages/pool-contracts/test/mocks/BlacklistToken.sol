// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title BlacklistToken
/// @notice USDC-style token where blacklisted accounts can neither send nor receive (tests only).
contract BlacklistToken is ERC20 {
    /// @notice Blacklist flags.
    mapping(address => bool) public blacklisted;

    /// @notice A blacklisted account was involved in a transfer.
    error Blacklisted(address account);

    constructor() ERC20("Blacklist", "BLK") {}

    /// @notice Mint `amount` to `to`.
    /// @param to Recipient.
    /// @param amount Amount in base units.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Set the blacklist flag of `account`.
    /// @param account Account to flag.
    /// @param flag New flag value.
    function setBlacklisted(address account, bool flag) external {
        blacklisted[account] = flag;
    }

    /// @dev Reverts if either side is blacklisted.
    function _update(address from, address to, uint256 value) internal override {
        if (blacklisted[from]) revert Blacklisted(from);
        if (blacklisted[to]) revert Blacklisted(to);
        super._update(from, to, value);
    }
}
