// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PolicyAccountFactory} from "../src/PolicyAccountFactory.sol";
import {PolicyBase} from "./PolicyBase.t.sol";

/// @dev Local accounting fixture. Its initial reads succeed, so a read outage can
/// only be observed after transferFrom reports failure.
contract FeeTokenWithReadOutage is ERC20 {
    bool public outage = true;
    address private unavailablePayer;

    error PostTransferReadUnavailable();

    constructor() ERC20("Fixture", "FIX") {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function restoreService() external {
        outage = false;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        super.transferFrom(from, to, amount);
        if (!outage) return true;
        unavailablePayer = from;
        return false;
    }

    function balanceOf(address account) public view override returns (uint256) {
        if (account != address(0) && account == unavailablePayer) {
            revert PostTransferReadUnavailable();
        }
        return super.balanceOf(account);
    }
}

contract MythrilFactoryPostFeeReadTest is PolicyBase {
    function test_postFailurePayerReadOutageRollsBackAndSameDeploymentCanRetry() public {
        FeeTokenWithReadOutage token = new FeeTokenWithReadOutage();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FLAT_FEE, feeRecipient);
        address predicted = f.predictAddress(owner, f.policyHashOf(newDest, DELAY, root));
        token.mint(payer, 2 * FLAT_FEE);
        vm.prank(payer);
        token.approve(address(f), 2 * FLAT_FEE);

        for (uint256 i; i < 2; ++i) {
            vm.expectRevert(FeeTokenWithReadOutage.PostTransferReadUnavailable.selector);
            vm.prank(payer);
            f.deploy(owner, newDest, DELAY, root);
            assertEq(predicted.code.length, 0);
            assertEq(token.balanceOf(payer), 2 * FLAT_FEE);
            assertEq(token.balanceOf(feeRecipient), 0);
            assertEq(token.allowance(payer, address(f)), 2 * FLAT_FEE);
        }

        token.restoreService();
        vm.prank(payer);
        assertEq(f.deploy(owner, newDest, DELAY, root), predicted);
        assertGt(predicted.code.length, 0);
        assertEq(token.balanceOf(payer), FLAT_FEE);
        assertEq(token.balanceOf(feeRecipient), FLAT_FEE);
        assertEq(token.allowance(payer, address(f)), FLAT_FEE);
    }
}
