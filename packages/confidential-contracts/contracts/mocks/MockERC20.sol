// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {TestnetOnly} from "../TestnetOnly.sol";

/// @title MockERC20
/// @notice "GhostPay Test USD": a public-mint 6-decimal ERC-20 used as the underlying of the test
/// confidential token. TESTNET ONLY, worthless, imitates no real asset.
/// @custom:security Anyone can mint any amount. The constructor refuses non-testnet chains.
contract MockERC20 is TestnetOnly, ERC20 {
    /// @notice Deploys the token; reverts with `UnsupportedChain` outside 31337 / 11155111.
    constructor() ERC20("GhostPay Test USD", "tUSD") {}

    /// @notice Mints `amount` base units to `to`. Unrestricted by design (test token).
    /// @param to Recipient.
    /// @param amount Amount in base units (6 decimals).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Returns 6.
    /// @return The number of decimals.
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
