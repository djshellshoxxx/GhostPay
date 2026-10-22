// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title FeeOnTransferToken
/// @notice ERC-20 that burns 1% of every transfer, so receivers get less than the nominal amount.
contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("FeeOnTransfer", "FOT") {}

    /// @notice Mint `amount` to `to`.
    /// @param to Recipient.
    /// @param amount Amount in base units.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev Burns 1% (rounded up) of transfers between two non-zero accounts.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 burnt = (value + 99) / 100; // rounds up: any non-zero transfer is lossy
            super._update(from, address(0), burnt);
            value -= burnt;
        }
        super._update(from, to, value);
    }
}
