// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Test router with the plain `payERC20` signature. Records `msg.sender`, can pull less than
/// `gross` (residual allowance), pull to itself, revert, or re-enter a configured target (tests only).
contract SpyRouter {
    using SafeERC20 for IERC20;

    address public lastCaller;
    uint256 public calls;
    /// @notice Percentage (0..100) of `gross` actually pulled.
    uint256 public pullPercent = 100;
    bool public shouldRevert;
    address public reenterTarget;
    bytes public reenterData;
    bool public reenterSuccess;

    function setPullPercent(uint256 p) external {
        pullPercent = p;
    }

    function setRevert(bool r) external {
        shouldRevert = r;
    }

    function setReenter(address target, bytes calldata data) external {
        reenterTarget = target;
        reenterData = data;
    }

    function payERC20(
        IERC20 token,
        address stealth,
        uint256 gross,
        uint256,
        uint256,
        bytes calldata,
        bytes calldata
    ) external {
        if (shouldRevert) revert("spy: revert");
        lastCaller = msg.sender;
        ++calls;
        if (reenterTarget != address(0)) {
            (reenterSuccess,) = reenterTarget.call(reenterData);
        }
        token.safeTransferFrom(msg.sender, stealth, gross * pullPercent / 100);
    }
}
