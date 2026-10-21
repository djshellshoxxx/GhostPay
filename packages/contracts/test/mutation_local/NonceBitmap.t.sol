// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IPolicyAccount} from "../../src/interfaces/IPolicyAccount.sol";
import {IGhostPaySweepRelayer} from "../../src/interfaces/IGhostPaySweepRelayer.sol";
import {PolicyBase} from "../PolicyBase.t.sol";
import {SweepBase} from "../SweepBase.t.sol";

/// @notice Mutation-testing killers: the nonce bitmap tests only the exact bit, so a lower nonce
/// stays usable after a higher nonce in the same word was consumed (gambit SweepRelayer #72,
/// PolicyAccount #194: `word & bit` replaced by `word / bit`).
contract MutationSweepNonceBitmapTest is SweepBase {
    function _do(uint256 nonce) internal {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(nonce);
        vm.prank(owner);
        token.approve(address(relayer), AMOUNT);
        vm.prank(submitter);
        relayer.sweep(s, _sign(ownerPk, s));
    }

    function test_lowerNonceUsableAfterHigherNonceInSameWord() public {
        _do(5);
        assertTrue(relayer.nonceUsed(owner, 5));
        assertFalse(relayer.nonceUsed(owner, 3));
        _do(3);
        assertTrue(relayer.nonceUsed(owner, 3));
        assertTrue(relayer.nonceUsed(owner, 5));
        assertFalse(relayer.nonceUsed(owner, 4));
    }

    function test_highestBitThenLowest() public {
        _do(255);
        _do(0);
        assertTrue(relayer.nonceUsed(owner, 0));
        assertTrue(relayer.nonceUsed(owner, 255));
        assertFalse(relayer.nonceUsed(owner, 128));
    }
}

contract MutationPolicyNonceBitmapTest is PolicyBase {
    function test_lowerNonceUsableAfterHigherNonceInSameWord() public {
        _request(acct, address(token), 1e6, 5, 0);
        assertTrue(acct.nonceUsed(5));
        assertFalse(acct.nonceUsed(3));
        _request(acct, address(token), 1e6, 3, 0);
        assertTrue(acct.nonceUsed(3));
        assertTrue(acct.nonceUsed(5));
        assertFalse(acct.nonceUsed(4));
    }

    function test_highestBitThenLowest() public {
        _request(acct, address(token), 1e6, 255, 0);
        _request(acct, address(token), 1e6, 0, 0);
        assertTrue(acct.nonceUsed(0));
        assertTrue(acct.nonceUsed(255));
        assertFalse(acct.nonceUsed(128));
    }
}
