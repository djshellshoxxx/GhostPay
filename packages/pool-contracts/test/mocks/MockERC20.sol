// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @notice Standard bool-returning ERC-20 with configurable decimals and open minting (tests only).
contract MockERC20 is ERC20 {
    uint8 private immutable _DECIMALS;

    /// @param name_ Token name.
    /// @param symbol_ Token symbol.
    /// @param decimals_ Token decimals.
    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _DECIMALS = decimals_;
    }

    /// @notice Mint `amount` to `to`.
    /// @param to Recipient.
    /// @param amount Amount in base units.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @inheritdoc ERC20
    function decimals() public view override returns (uint8) {
        return _DECIMALS;
    }
}
