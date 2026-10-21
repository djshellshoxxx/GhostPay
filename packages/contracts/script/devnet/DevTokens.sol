// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title DevPermitStablecoin
/// @notice LOCAL DEVNET ONLY. ERC-2612 stablecoin stand-in with open minting. Never deploy on a public chain.
contract DevPermitStablecoin is ERC20Permit {
    uint8 private immutable _DECIMALS;

    /// @param name_ Token name (also the EIP-712 domain name).
    /// @param symbol_ Token symbol.
    /// @param decimals_ Token decimals.
    constructor(string memory name_, string memory symbol_, uint8 decimals_)
        ERC20(name_, symbol_)
        ERC20Permit(name_)
    {
        _DECIMALS = decimals_;
    }

    /// @notice Open mint (devnet faucet).
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

/// @title DevPlainStablecoin
/// @notice LOCAL DEVNET ONLY. Plain ERC-20 (no permit, USDT-like flow) with open minting.
contract DevPlainStablecoin is ERC20 {
    uint8 private immutable _DECIMALS;

    /// @param name_ Token name.
    /// @param symbol_ Token symbol.
    /// @param decimals_ Token decimals.
    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _DECIMALS = decimals_;
    }

    /// @notice Open mint (devnet faucet).
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
