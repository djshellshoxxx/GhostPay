// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {PolicyAccountFactory} from "../../src/PolicyAccountFactory.sol";
import {PolicyBase} from "../PolicyBase.t.sol";

/// @notice Mutation-testing killers (gambit PolicyAccount #128/#133/#134, Factory #10).
contract MutationPolicyCleanupTest is PolicyBase {
    function _assertPendingCleared() internal view {
        assertEq(acct.pendingDestination(), address(0));
        assertEq(acct.pendingEffectiveAt(), 0);
        assertEq(acct.pendingProposalId(), bytes32(0));
    }

    function test_executeDestinationChange_clearsAllPendingFields() public {
        bytes32 id = _propose(newDest, 1);
        assertEq(acct.pendingDestination(), newDest);
        assertEq(acct.pendingProposalId(), id);
        vm.warp(vm.getBlockTimestamp() + 2 * DELAY);
        acct.executeDestinationChange();
        assertEq(acct.destination(), newDest);
        _assertPendingCleared();
    }

    function test_cancelDestination_clearsAllPendingFields() public {
        bytes32 id = _propose(newDest, 1);
        acct.cancelDestination(id, _sigCancelDest(ownerPk, address(acct), id));
        assertEq(acct.destination(), destination);
        _assertPendingCleared();
    }

    /// @dev Zero owner/destination must fail with the factory's own ZeroAddress check before any
    /// delay validation (the account's initializer would otherwise only be reached after them).
    function test_factoryDeploy_zeroAddressCheckedBeforeDelay() public {
        vm.expectRevert(PolicyAccountFactory.ZeroAddress.selector);
        factory.deploy(address(0), destination, 0, root);
        vm.expectRevert(PolicyAccountFactory.ZeroAddress.selector);
        factory.deploy(owner, address(0), 0, root);
        vm.expectRevert(PolicyAccountFactory.ZeroAddress.selector);
        factory.deploy(address(0), address(0), type(uint256).max, root);
    }
}
