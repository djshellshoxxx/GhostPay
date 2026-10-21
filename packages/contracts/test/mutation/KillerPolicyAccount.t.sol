// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {PolicyBase} from "../PolicyBase.t.sol";

/// @notice Killers for gambit mutants that survived the pre-existing PolicyAccount suite.
contract PolicyAccountMutationKillerTest is PolicyBase {
    /// Mutants: `delete pendingDestination` / `delete pendingProposalId` removed (or turned into a
    /// no-op) in `cancelDestination`. Stale pending data must not remain readable after a cancel.
    function test_cancelDestination_clearsAllPendingFields() public {
        bytes32 id = _propose(newDest, 1);
        assertEq(acct.pendingDestination(), newDest);
        assertEq(acct.pendingProposalId(), id);
        acct.cancelDestination(id, _sigCancelDest(ownerPk, address(acct), id));
        assertEq(acct.pendingEffectiveAt(), 0);
        assertEq(acct.pendingDestination(), address(0));
        assertEq(acct.pendingProposalId(), bytes32(0));
    }

    /// Mutant: nonce check `word & bit` -> `word / bit`. A used HIGHER bit in a word must not mark
    /// a fresh LOWER nonce as used.
    function test_nonce_lowerFreshNonceAcceptedAfterHigherInSameWord() public {
        bytes32 id = _propose(newDest, 8);
        acct.cancelDestination(id, _sigCancelDest(ownerPk, address(acct), id));
        _propose(newDest, 1); // reverts NonceAlreadyUsed under the mutant
        assertTrue(acct.nonceUsed(8));
        assertTrue(acct.nonceUsed(1));
        assertFalse(acct.nonceUsed(0));
        assertFalse(acct.nonceUsed(2));
    }
}
