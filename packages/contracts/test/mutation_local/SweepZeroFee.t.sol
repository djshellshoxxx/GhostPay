// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {IGhostPaySweepRelayer} from "../../src/interfaces/IGhostPaySweepRelayer.sol";
import {SweepBase} from "../SweepBase.t.sol";

/// @dev Token that reverts on zero-value transfers (some real tokens do).
contract ZeroRevertToken is ERC20 {
    constructor() ERC20("ZeroRevert", "ZRV") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        require(value != 0, "zero transfer");
        super._update(from, to, value);
    }
}

/// @notice Mutation-testing killer: a zero fee must skip the fee transfer entirely
/// (gambit GhostPaySweepRelayer #98: `if (s.fee != 0)` replaced by `if (true)`).
contract MutationSweepZeroFeeTest is SweepBase {
    function test_zeroFeeSkipsFeeTransfer() public {
        ZeroRevertToken z = new ZeroRevertToken();
        z.mint(owner, AMOUNT);
        IGhostPaySweepRelayer.Sweep memory s = _sweep(1);
        s.token = address(z);
        s.fee = 0;
        vm.prank(owner);
        z.approve(address(relayer), AMOUNT);
        vm.prank(submitter);
        relayer.sweep(s, _sign(ownerPk, s));
        assertEq(z.balanceOf(destination), AMOUNT);
        assertEq(z.balanceOf(feeTo), 0);
        assertEq(z.balanceOf(owner), 0);
    }
}
