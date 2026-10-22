// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title HookToken
/// @notice ERC-20 that, during `transfer`, calls an armed target with armed calldata (ERC-777 style
/// hook on the sender side). Records whether the reentrant call succeeded (tests only).
contract HookToken is ERC20 {
    /// @notice Target of the reentrant call.
    address public target;
    /// @notice Calldata of the reentrant call.
    bytes public attackData;
    /// @notice Whether the reentrant call succeeded.
    bool public lastSuccess;
    /// @notice Number of reentrant calls attempted.
    uint256 public attempts;

    constructor() ERC20("Hook", "HK") {}

    /// @notice Mint `amount` to `to`.
    /// @param to Recipient.
    /// @param amount Amount in base units.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Arm the hook (single shot).
    /// @param target_ Contract to call back.
    /// @param data_ Calldata to send.
    function arm(address target_, bytes calldata data_) external {
        target = target_;
        attackData = data_;
    }

    /// @inheritdoc ERC20
    function transfer(address to, uint256 value) public override returns (bool) {
        if (target != address(0)) {
            address t = target;
            target = address(0);
            attempts++;
            (lastSuccess,) = t.call(attackData);
        }
        return super.transfer(to, value);
    }
}
