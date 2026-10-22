// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ReentrantToken
/// @notice ERC-20 that, during `transferFrom`, calls an armed target with armed calldata (ERC-777 style
/// hook). It records whether the reentrant call succeeded and optionally bubbles its revert.
contract ReentrantToken is ERC20 {
    /// @notice Target of the reentrant call.
    address public target;
    /// @notice Calldata of the reentrant call.
    bytes public attackData;
    /// @notice Whether a failing reentrant call reverts the whole transfer.
    bool public bubble;
    /// @notice Number of reentrant calls attempted.
    uint256 public attempts;
    /// @notice Result of the last reentrant call.
    bool public lastSuccess;
    /// @notice Raw return data of the last reentrant call.
    bytes public lastReturn;

    constructor() ERC20("Reentrant", "RE") {}

    /// @notice Mint `amount` to `to`.
    /// @param to Recipient.
    /// @param amount Amount in base units.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Arm the hook.
    /// @param target_ Contract to call back.
    /// @param data_ Calldata to send.
    /// @param bubble_ Revert the transfer when the callback fails.
    function arm(address target_, bytes calldata data_, bool bubble_) external {
        target = target_;
        attackData = data_;
        bubble = bubble_;
    }

    /// @inheritdoc ERC20
    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (target != address(0)) {
            address t = target;
            target = address(0); // single shot
            attempts++;
            (bool ok, bytes memory ret) = t.call(attackData);
            lastSuccess = ok;
            lastReturn = ret;
            if (!ok && bubble) {
                assembly ("memory-safe") {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
        }
        return super.transferFrom(from, to, value);
    }
}
