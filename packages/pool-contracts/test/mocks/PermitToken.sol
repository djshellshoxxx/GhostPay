// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title PermitToken
/// @notice ERC-2612 token (OpenZeppelin ERC20Permit) with open minting and configurable decimals.
contract PermitToken is ERC20Permit {
    uint8 private immutable _DECIMALS;

    /// @param decimals_ Token decimals.
    constructor(uint8 decimals_) ERC20("PermitToken", "PMT") ERC20Permit("PermitToken") {
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
