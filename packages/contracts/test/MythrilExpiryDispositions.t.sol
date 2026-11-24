// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {GhostPaySweepRelayer} from "../src/GhostPaySweepRelayer.sol";
import {IGhostPaySweepRelayer} from "../src/interfaces/IGhostPaySweepRelayer.sol";
import {PolicyAccount} from "../src/PolicyAccount.sol";
import {IPolicyAccount} from "../src/interfaces/IPolicyAccount.sol";
import {PolicyBase} from "./PolicyBase.t.sol";
import {SweepBase} from "./SweepBase.t.sol";

// Disposition evidence for the three SWC-116 ("dependence on predictable environment variable")
// records of Mythril artifact 14290880802 (contract-analysis run 43981233671, commit beb525dd):
//   EXP-1  GhostPaySweepRelayer.sweep          src/GhostPaySweepRelayer.sol:83
//   EXP-2  PolicyAccount.requestWithdraw        src/PolicyAccount.sol:161
//   EXP-3  PolicyAccount.proposeDestination     src/PolicyAccount.sol:262
// Record: docs/audits/mythril-14290880802-expiry-dispositions.md. The tests call the unmodified
// production contracts (the decode tests only parse the recorded calldata); none of them weakens or
// bypasses the deadline guard.

/// @dev Returns `data` without its 4-byte selector, so a recorded calldata can be ABI-decoded.
function argsOf(bytes memory data) pure returns (bytes memory a) {
    a = new bytes(data.length - 4);
    for (uint256 i = 0; i < a.length; ++i) {
        a[i] = data[i + 4];
    }
}

/// @notice EXP-1: the signed sweep deadline (`block.timestamp > s.deadline` reverts `Expired`).
contract MythrilExpirySweepTest is SweepBase {
    /// @dev Transaction 2 of the Mythril counterexample, copied verbatim from the report: an all-zero
    /// {Sweep} (deadline 0) and an empty signature (offset 0xfc points at a zero length word).
    bytes internal constant MYTHRIL_SWEEP_CALLDATA =
        hex"bad662430000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000fc";

    function _signed(uint256 nonce)
        internal
        view
        returns (IGhostPaySweepRelayer.Sweep memory s, bytes memory sig)
    {
        s = _sweep(nonce);
        sig = _sign(ownerPk, s);
    }

    function _assertSwept(uint256 destBefore, uint256 feeBefore, uint256 ownerBefore)
        internal
        view
    {
        assertEq(token.balanceOf(destination), destBefore + AMOUNT - FEE, "destination");
        assertEq(token.balanceOf(feeTo), feeBefore + FEE, "feeTo");
        assertEq(token.balanceOf(owner) + AMOUNT, ownerBefore, "owner");
    }

    function test_exp1_mythrilCounterexample_decodesToZeroDeadlineOrder() public pure {
        (IGhostPaySweepRelayer.Sweep memory s, bytes memory sig) =
            abi.decode(argsOf(MYTHRIL_SWEEP_CALLDATA), (IGhostPaySweepRelayer.Sweep, bytes));
        assertEq(s.deadline, 0);
        assertEq(s.amount, 0);
        assertEq(s.fee, 0);
        assertEq(s.owner, address(0));
        assertEq(s.nonce, 0);
        assertEq(sig.length, 0);
    }

    function test_exp1_mythrilCounterexample_bothBranchesRevertWithoutEffect() public {
        // Taken branch of the flagged JUMPI: any non-zero timestamp is past deadline 0.
        vm.warp(1);
        (bool ok, bytes memory ret) = address(relayer).call(MYTHRIL_SWEEP_CALLDATA);
        assertFalse(ok);
        assertEq(ret, abi.encodeWithSelector(IGhostPaySweepRelayer.Expired.selector));
        // Other branch (timestamp == deadline == 0): the next guard rejects the same input.
        vm.warp(0);
        (ok, ret) = address(relayer).call(MYTHRIL_SWEEP_CALLDATA);
        assertFalse(ok);
        assertEq(ret, abi.encodeWithSelector(IGhostPaySweepRelayer.InvalidAmount.selector));
        assertFalse(relayer.nonceUsed(address(0), 0));
    }

    function test_exp1_oneSecondBeforeDeadline_sweeps() public {
        (IGhostPaySweepRelayer.Sweep memory s, bytes memory sig) = _signed(1);
        _approveRelayer(address(token), AMOUNT);
        uint256 d = token.balanceOf(destination);
        uint256 f = token.balanceOf(feeTo);
        uint256 o = token.balanceOf(owner);
        vm.warp(s.deadline - 1);
        vm.prank(submitter);
        relayer.sweep(s, sig);
        _assertSwept(d, f, o);
        assertTrue(relayer.nonceUsed(owner, 1));
    }

    function test_exp1_atDeadline_inclusiveOnBothEntryPoints() public {
        (IGhostPaySweepRelayer.Sweep memory s1, bytes memory sig1) = _signed(2);
        (IGhostPaySweepRelayer.Sweep memory s2, bytes memory sig2) = _signed(3);
        assertEq(s1.deadline, s2.deadline);
        IGhostPaySweepRelayer.PermitSig memory p =
            _permit(token, ownerPk, owner, s2.amount, s2.deadline);
        _approveRelayer(address(token), AMOUNT);
        vm.warp(s1.deadline);
        uint256 d = token.balanceOf(destination);
        uint256 f = token.balanceOf(feeTo);
        uint256 o = token.balanceOf(owner);
        vm.prank(submitter);
        relayer.sweep(s1, sig1);
        _assertSwept(d, f, o);
        d = token.balanceOf(destination);
        f = token.balanceOf(feeTo);
        o = token.balanceOf(owner);
        vm.prank(submitter);
        relayer.sweepWithPermit(s2, sig2, p);
        _assertSwept(d, f, o);
    }

    function test_exp1_oneSecondAfterDeadline_revertsOnBothEntryPointsWithoutEffect() public {
        (IGhostPaySweepRelayer.Sweep memory s, bytes memory sig) = _signed(4);
        IGhostPaySweepRelayer.PermitSig memory p =
            _permit(token, ownerPk, owner, s.amount, s.deadline + 1 days);
        _approveRelayer(address(token), type(uint256).max);
        uint256 o = token.balanceOf(owner);
        vm.warp(s.deadline + 1);
        vm.prank(submitter);
        vm.expectRevert(IGhostPaySweepRelayer.Expired.selector);
        relayer.sweep(s, sig);
        vm.prank(submitter);
        vm.expectRevert(IGhostPaySweepRelayer.Expired.selector);
        relayer.sweepWithPermit(s, sig, p);
        assertFalse(relayer.nonceUsed(owner, 4));
        assertEq(token.balanceOf(owner), o);
        assertEq(token.balanceOf(destination), 0);
        assertEq(token.balanceOf(feeTo), 0);
    }

    function test_exp1_replayAfterExpiry_rejectedByDeadlineThenByNonce() public {
        (IGhostPaySweepRelayer.Sweep memory s, bytes memory sig) = _signed(5);
        _approveRelayer(address(token), type(uint256).max);
        vm.warp(s.deadline);
        relayer.sweep(s, sig);
        uint256 destAfter = token.balanceOf(destination);
        vm.warp(s.deadline + 1);
        vm.expectRevert(IGhostPaySweepRelayer.Expired.selector);
        relayer.sweep(s, sig);
        // Test-only rewind (real chains never rewind): single use comes from the nonce, not the clock.
        vm.warp(s.deadline - 1);
        vm.expectRevert(IGhostPaySweepRelayer.NonceAlreadyUsed.selector);
        relayer.sweep(s, sig);
        assertEq(token.balanceOf(destination), destAfter);
    }

    function test_exp1_expiredUnusedOrder_staysDeadAfterNonceIsReused() public {
        (IGhostPaySweepRelayer.Sweep memory oldOrder, bytes memory oldSig) = _signed(6);
        // Re-signed later with the same nonce and a later deadline (built here, before any warp).
        IGhostPaySweepRelayer.Sweep memory fresh = _sweep(6);
        fresh.deadline = oldOrder.deadline + 1 days;
        bytes memory freshSig = _sign(ownerPk, fresh);
        _approveRelayer(address(token), type(uint256).max);
        vm.warp(oldOrder.deadline + 1);
        vm.expectRevert(IGhostPaySweepRelayer.Expired.selector);
        relayer.sweep(oldOrder, oldSig);
        // Expiry does not consume the nonce; a fresh order may reuse it.
        assertFalse(relayer.nonceUsed(owner, 6));
        relayer.sweep(fresh, freshSig);
        assertTrue(relayer.nonceUsed(owner, 6));
        vm.expectRevert(IGhostPaySweepRelayer.Expired.selector);
        relayer.sweep(oldOrder, oldSig);
        assertEq(token.balanceOf(destination), AMOUNT - FEE);
    }

    function test_exp1_wrongChainOrRelayerAtDeadline_revertsInvalidSignature() public {
        (IGhostPaySweepRelayer.Sweep memory s, bytes memory sig) = _signed(7);
        _approveRelayer(address(token), type(uint256).max);
        GhostPaySweepRelayer other = new GhostPaySweepRelayer();
        vm.prank(owner);
        token.approve(address(other), type(uint256).max);
        uint256 originalChain = vm.getChainId();
        vm.warp(s.deadline);
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        other.sweep(s, sig);
        vm.chainId(originalChain + 1);
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        relayer.sweep(s, sig);
        // Past the deadline the order is refused for expiry before its signature is examined.
        vm.warp(s.deadline + 1);
        vm.expectRevert(IGhostPaySweepRelayer.Expired.selector);
        relayer.sweep(s, sig);
        vm.chainId(originalChain);
        assertEq(vm.getChainId(), originalChain);
        vm.warp(s.deadline);
        assertFalse(relayer.nonceUsed(owner, 7));
        relayer.sweep(s, sig);
        assertEq(token.balanceOf(destination), AMOUNT - FEE);
    }

    function test_exp1_sameNonceReplacementRevokesOrderBeforeItsDeadline() public {
        (IGhostPaySweepRelayer.Sweep memory oldOrder, bytes memory oldSig) = _signed(8);
        IGhostPaySweepRelayer.Sweep memory repl = _sweep(8);
        repl.destination = makeAddr("replacementDestination");
        bytes memory replSig = _sign(ownerPk, repl);
        _approveRelayer(address(token), type(uint256).max);
        relayer.sweep(repl, replSig);
        // The relayer has no cancel entry point; consuming the nonce is the owner's revocation path.
        vm.warp(oldOrder.deadline);
        vm.expectRevert(IGhostPaySweepRelayer.NonceAlreadyUsed.selector);
        relayer.sweep(oldOrder, oldSig);
        assertEq(token.balanceOf(destination), 0);
        assertEq(token.balanceOf(repl.destination), AMOUNT - FEE);
    }

    /// @dev Whatever timestamp a block producer picks, it only decides accept/reject at the exact
    /// inclusive boundary; it never changes recipient, amount, fee or nonce handling.
    function testFuzz_exp1_producerTimestampOnlyGatesAcceptance(uint256 lifetime, uint256 t)
        public
    {
        uint256 start = vm.getBlockTimestamp();
        IGhostPaySweepRelayer.Sweep memory s = _sweep(9);
        s.deadline = start + bound(lifetime, 0, 30 days);
        bytes memory sig = _sign(ownerPk, s);
        _approveRelayer(address(token), type(uint256).max);
        t = bound(t, start, s.deadline + 1 days);
        vm.warp(t);
        uint256 d = token.balanceOf(destination);
        uint256 f = token.balanceOf(feeTo);
        uint256 o = token.balanceOf(owner);
        vm.prank(submitter);
        if (t > s.deadline) {
            vm.expectRevert(IGhostPaySweepRelayer.Expired.selector);
            relayer.sweep(s, sig);
            assertFalse(relayer.nonceUsed(owner, 9));
            assertEq(token.balanceOf(owner), o);
        } else {
            relayer.sweep(s, sig);
            assertTrue(relayer.nonceUsed(owner, 9));
            _assertSwept(d, f, o);
        }
    }
}

/// @notice EXP-2 (`requestWithdraw` deadline) and EXP-3 (`proposeDestination` deadline).
contract MythrilExpiryPolicyTest is PolicyBase {
    /// @dev Transaction 2 of the EXP-2 counterexample, verbatim: all-zero {Withdraw} (deadline 0)
    /// except `limitLeafHash`, a {LimitProof} offset of 0 and a 24-byte zero signature.
    bytes internal constant MYTHRIL_REQUEST_CALLDATA =
        hex"30d513070000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000180000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000067";
    /// @dev Transaction 2 of the EXP-3 counterexample, verbatim: zero `newDestination`, deadline
    /// `0x55 << 208` (far future), nonce 0 and an 85-byte signature overlapping the head.
    bytes internal constant MYTHRIL_PROPOSE_CALLDATA =
        hex"a950552f0000000000000000000000000000000000000000000000000000000000000000000000000055000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006";

    uint256 internal constant AMT = 1e6;

    function _signedW(uint256 nonce)
        internal
        view
        returns (IPolicyAccount.Withdraw memory w, bytes memory sig)
    {
        w = _w(address(token), AMT, nonce);
        sig = _sigW(ownerPk, address(acct), w);
    }

    function _signedP(uint256 nonce) internal view returns (uint256 dl, bytes memory sig) {
        dl = vm.getBlockTimestamp() + 1 hours;
        sig = _sigPropose(ownerPk, address(acct), newDest, dl, nonce);
    }

    function _assertPending(bytes32 id, uint256 acceptedAt) internal view {
        IPolicyAccount.Request memory r = acct.requests(id);
        assertEq(uint256(r.status), uint256(IPolicyAccount.Status.Pending));
        assertEq(uint256(r.executeAfter), acceptedAt + DELAY, "full delay from acceptance");
        assertEq(r.amount, AMT);
        assertEq(r.token, address(token));
        assertEq(acct.requestDestination(id), destination);
    }

    function _assertNoProposal() internal view {
        assertEq(acct.pendingEffectiveAt(), 0);
        assertEq(acct.pendingDestination(), address(0));
        assertEq(acct.pendingProposalId(), bytes32(0));
        assertEq(acct.destination(), destination);
    }

    // ------------------------------------------------------------------ analysis scope

    /// @dev Mythril deployed the contract directly, i.e. the locked implementation whose owner stays
    /// zero. No signature can pass `_checkOwner` there (OpenZeppelin `ECDSA.recover` never returns
    /// zero), so in that model no request or proposal is ever stored and the later timelock
    /// comparisons (`executeWithdraw`, `executeDestinationChange`) are only reached on revert paths.
    function test_exp2_exp3_implementationModelNeverPassesAuthorization() public {
        assertEq(impl.owner(), address(0));
        assertTrue(impl.initialized());
        vm.expectRevert(IPolicyAccount.AlreadyInitialized.selector);
        impl.initialize(owner, destination, DELAY, root);
        IPolicyAccount.Withdraw memory w = _w(address(token), AMT, 1);
        bytes memory wSig = _sigW(ownerPk, address(impl), w);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        impl.requestWithdraw(w, _lp(0), wSig);
        uint256 dl = vm.getBlockTimestamp() + 1 hours;
        bytes memory pSig = _sigPropose(ownerPk, address(impl), newDest, dl, 1);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        impl.proposeDestination(newDest, dl, 1, pSig);
        vm.expectRevert(IPolicyAccount.NotPending.selector);
        impl.executeWithdraw(_wHash(w));
        vm.expectRevert(IPolicyAccount.NoProposal.selector);
        impl.executeDestinationChange();
    }

    // ------------------------------------------------------------------ EXP-2 requestWithdraw

    function test_exp2_mythrilCounterexample_decodesToZeroDeadlineOrder() public pure {
        (IPolicyAccount.Withdraw memory w, IPolicyAccount.LimitProof memory lp, bytes memory sig) = abi.decode(
            argsOf(MYTHRIL_REQUEST_CALLDATA),
            (IPolicyAccount.Withdraw, IPolicyAccount.LimitProof, bytes)
        );
        assertEq(w.deadline, 0);
        assertEq(w.amount, 0);
        assertEq(w.token, address(0));
        assertEq(lp.proof.length, 0);
        assertEq(sig.length, 24);
    }

    function test_exp2_mythrilCounterexample_bothBranchesRevertWithoutEffect() public {
        // Mythril analysed the directly deployed contract (the locked implementation); a clone
        // behaves the same for this input.
        address[2] memory targets = [address(impl), address(acct)];
        for (uint256 i = 0; i < 2; ++i) {
            vm.warp(1);
            (bool ok, bytes memory ret) = targets[i].call(MYTHRIL_REQUEST_CALLDATA);
            assertFalse(ok);
            assertEq(ret, abi.encodeWithSelector(IPolicyAccount.Expired.selector));
            vm.warp(0);
            (ok, ret) = targets[i].call(MYTHRIL_REQUEST_CALLDATA);
            assertFalse(ok);
            assertEq(ret, abi.encodeWithSelector(IPolicyAccount.ZeroAmount.selector));
        }
        assertFalse(acct.nonceUsed(0));
    }

    function test_exp2_oneSecondBeforeDeadline_accepts() public {
        (IPolicyAccount.Withdraw memory w, bytes memory sig) = _signedW(1);
        vm.warp(w.deadline - 1);
        vm.prank(relayer);
        bytes32 id = acct.requestWithdraw(w, _lp(0), sig);
        _assertPending(id, w.deadline - 1);
        assertTrue(acct.nonceUsed(1));
    }

    function test_exp2_atDeadline_inclusiveAndStartsFullDelay() public {
        (IPolicyAccount.Withdraw memory w, bytes memory sig) = _signedW(2);
        vm.warp(w.deadline);
        vm.prank(relayer);
        bytes32 id = acct.requestWithdraw(w, _lp(0), sig);
        _assertPending(id, w.deadline);
    }

    function test_exp2_oneSecondAfterDeadline_revertsWithoutEffect() public {
        (IPolicyAccount.Withdraw memory w, bytes memory sig) = _signedW(3);
        vm.warp(w.deadline + 1);
        vm.prank(relayer);
        vm.expectRevert(IPolicyAccount.Expired.selector);
        acct.requestWithdraw(w, _lp(0), sig);
        assertFalse(acct.nonceUsed(3));
        assertEq(uint256(acct.requests(_wHash(w)).status), uint256(IPolicyAccount.Status.None));
    }

    function test_exp2_deadlineBoundsSubmissionNotExecution() public {
        (IPolicyAccount.Withdraw memory w, bytes memory sig) = _signedW(4);
        vm.warp(w.deadline);
        bytes32 id = acct.requestWithdraw(w, _lp(0), sig);
        uint64 executeAfter = uint64(w.deadline + DELAY);
        vm.warp(executeAfter - 1);
        vm.expectRevert(
            abi.encodeWithSelector(IPolicyAccount.TimelockActive.selector, executeAfter)
        );
        acct.executeWithdraw(id);
        vm.warp(executeAfter);
        assertGt(vm.getBlockTimestamp(), w.deadline);
        acct.executeWithdraw(id);
        assertEq(token.balanceOf(destination), AMT);
    }

    function test_exp2_lateAcceptedRequestStaysCancellableForFullDelay() public {
        (IPolicyAccount.Withdraw memory w, bytes memory sig) = _signedW(5);
        vm.warp(w.deadline);
        bytes32 id = acct.requestWithdraw(w, _lp(0), sig);
        vm.warp(w.deadline + DELAY - 1);
        acct.cancel(id, _sigCancel(ownerPk, address(acct), id));
        vm.warp(w.deadline + DELAY);
        vm.expectRevert(IPolicyAccount.NotPending.selector);
        acct.executeWithdraw(id);
        assertEq(token.balanceOf(destination), 0);
    }

    function test_exp2_replayAfterExpiry_rejectedByDeadlineThenByNonce() public {
        (IPolicyAccount.Withdraw memory w, bytes memory sig) = _signedW(6);
        vm.warp(w.deadline);
        bytes32 id = acct.requestWithdraw(w, _lp(0), sig);
        acct.cancel(id, _sigCancel(ownerPk, address(acct), id));
        vm.warp(w.deadline + 1);
        vm.expectRevert(IPolicyAccount.Expired.selector);
        acct.requestWithdraw(w, _lp(0), sig);
        // Test-only rewind: cancelling does not release the nonce, so the order stays single-use.
        vm.warp(w.deadline - 1);
        vm.expectRevert(IPolicyAccount.NonceAlreadyUsed.selector);
        acct.requestWithdraw(w, _lp(0), sig);
        assertEq(uint256(acct.requests(id).status), uint256(IPolicyAccount.Status.Cancelled));
    }

    function test_exp2_wrongChainOrCloneAtDeadline_revertsInvalidSignature() public {
        (IPolicyAccount.Withdraw memory w, bytes memory sig) = _signedW(7);
        PolicyAccount other = _deploy(owner, destination, DELAY + 1, root);
        token.mint(address(other), AMT);
        uint256 originalChain = vm.getChainId();
        vm.warp(w.deadline);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        other.requestWithdraw(w, _lp(0), sig);
        vm.chainId(originalChain + 1);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.requestWithdraw(w, _lp(0), sig);
        vm.warp(w.deadline + 1);
        vm.expectRevert(IPolicyAccount.Expired.selector);
        acct.requestWithdraw(w, _lp(0), sig);
        vm.chainId(originalChain);
        assertEq(vm.getChainId(), originalChain);
        vm.warp(w.deadline);
        assertFalse(acct.nonceUsed(7));
        assertFalse(other.nonceUsed(7));
        bytes32 id = acct.requestWithdraw(w, _lp(0), sig);
        _assertPending(id, w.deadline);
    }

    /// @dev Accepted iff `t <= deadline`; an accepted request always gets exactly `delay` of block time
    /// from its own acceptance and the destination current at acceptance.
    function testFuzz_exp2_producerTimestampOnlyGatesAcceptance(uint256 lifetime, uint256 t)
        public
    {
        uint256 start = vm.getBlockTimestamp();
        IPolicyAccount.Withdraw memory w = _w(address(token), AMT, 8);
        w.deadline = start + bound(lifetime, 0, 30 days);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        t = bound(t, start, w.deadline + 1 days);
        vm.warp(t);
        vm.prank(relayer);
        if (t > w.deadline) {
            vm.expectRevert(IPolicyAccount.Expired.selector);
            acct.requestWithdraw(w, _lp(0), sig);
            assertFalse(acct.nonceUsed(8));
        } else {
            bytes32 id = acct.requestWithdraw(w, _lp(0), sig);
            _assertPending(id, t);
            assertTrue(acct.nonceUsed(8));
        }
    }

    // ------------------------------------------------------------------ EXP-3 proposeDestination

    function test_exp3_mythrilCounterexample_decodesToFarFutureDeadline() public pure {
        (address d, uint256 deadline, uint256 nonce, bytes memory sig) =
            abi.decode(argsOf(MYTHRIL_PROPOSE_CALLDATA), (address, uint256, uint256, bytes));
        assertEq(d, address(0));
        assertEq(deadline, uint256(0x55) << 208);
        assertEq(nonce, 0);
        assertEq(sig.length, 0x55);
    }

    function test_exp3_mythrilCounterexample_bothBranchesRevertWithoutEffect() public {
        address[2] memory targets = [address(impl), address(acct)];
        uint256 deadline = uint256(0x55) << 208;
        for (uint256 i = 0; i < 2; ++i) {
            // Branch shown by the trace: not expired, then rejected for the zero destination.
            vm.warp(1);
            (bool ok, bytes memory ret) = targets[i].call(MYTHRIL_PROPOSE_CALLDATA);
            assertFalse(ok);
            assertEq(ret, abi.encodeWithSelector(IPolicyAccount.InvalidDestination.selector));
            vm.warp(deadline + 1);
            (ok, ret) = targets[i].call(MYTHRIL_PROPOSE_CALLDATA);
            assertFalse(ok);
            assertEq(ret, abi.encodeWithSelector(IPolicyAccount.Expired.selector));
        }
        _assertNoProposal();
        assertFalse(acct.nonceUsed(0));
    }

    function test_exp3_oneSecondBeforeDeadline_accepts() public {
        (uint256 dl, bytes memory sig) = _signedP(1);
        vm.warp(dl - 1);
        vm.prank(relayer);
        bytes32 id = acct.proposeDestination(newDest, dl, 1, sig);
        assertEq(id, _pHash(newDest, dl, 1));
        assertEq(uint256(acct.pendingEffectiveAt()), dl - 1 + 2 * DELAY);
        assertEq(acct.pendingDestination(), newDest);
        assertTrue(acct.nonceUsed(1));
    }

    function test_exp3_atDeadline_inclusiveAndStartsFullTimelock() public {
        (uint256 dl, bytes memory sig) = _signedP(2);
        vm.warp(dl);
        vm.prank(relayer);
        acct.proposeDestination(newDest, dl, 2, sig);
        assertEq(uint256(acct.pendingEffectiveAt()), dl + 2 * DELAY);
        assertEq(acct.destination(), destination);
    }

    function test_exp3_oneSecondAfterDeadline_revertsWithoutEffect() public {
        (uint256 dl, bytes memory sig) = _signedP(3);
        vm.warp(dl + 1);
        vm.prank(relayer);
        vm.expectRevert(IPolicyAccount.Expired.selector);
        acct.proposeDestination(newDest, dl, 3, sig);
        _assertNoProposal();
        assertFalse(acct.nonceUsed(3));
    }

    function test_exp3_deadlineBoundsSubmissionNotExecution() public {
        (uint256 dl, bytes memory sig) = _signedP(4);
        vm.warp(dl);
        acct.proposeDestination(newDest, dl, 4, sig);
        uint64 effectiveAt = uint64(dl + 2 * DELAY);
        vm.warp(effectiveAt - 1);
        vm.expectRevert(abi.encodeWithSelector(IPolicyAccount.TimelockActive.selector, effectiveAt));
        acct.executeDestinationChange();
        vm.warp(effectiveAt);
        assertGt(vm.getBlockTimestamp(), dl);
        acct.executeDestinationChange();
        assertEq(acct.destination(), newDest);
    }

    function test_exp3_lateAcceptedProposalStaysCancellableForFullTimelock() public {
        (uint256 dl, bytes memory sig) = _signedP(5);
        vm.warp(dl);
        bytes32 id = acct.proposeDestination(newDest, dl, 5, sig);
        vm.warp(dl + 2 * DELAY - 1);
        acct.cancelDestination(id, _sigCancelDest(ownerPk, address(acct), id));
        vm.warp(dl + 2 * DELAY);
        vm.expectRevert(IPolicyAccount.NoProposal.selector);
        acct.executeDestinationChange();
        _assertNoProposal();
    }

    function test_exp3_replayAfterExpiry_rejectedByDeadlineThenByNonce() public {
        (uint256 dl, bytes memory sig) = _signedP(6);
        vm.warp(dl);
        bytes32 id = acct.proposeDestination(newDest, dl, 6, sig);
        acct.cancelDestination(id, _sigCancelDest(ownerPk, address(acct), id));
        vm.warp(dl + 1);
        vm.expectRevert(IPolicyAccount.Expired.selector);
        acct.proposeDestination(newDest, dl, 6, sig);
        // Test-only rewind: cancelling does not release the nonce, so the proposal stays single-use.
        vm.warp(dl - 1);
        vm.expectRevert(IPolicyAccount.NonceAlreadyUsed.selector);
        acct.proposeDestination(newDest, dl, 6, sig);
        _assertNoProposal();
    }

    function test_exp3_wrongChainAtDeadline_revertsInvalidSignature() public {
        (uint256 dl, bytes memory sig) = _signedP(7);
        uint256 originalChain = vm.getChainId();
        vm.warp(dl);
        vm.chainId(originalChain + 1);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.proposeDestination(newDest, dl, 7, sig);
        vm.warp(dl + 1);
        vm.expectRevert(IPolicyAccount.Expired.selector);
        acct.proposeDestination(newDest, dl, 7, sig);
        vm.chainId(originalChain);
        assertEq(vm.getChainId(), originalChain);
        vm.warp(dl);
        _assertNoProposal();
        assertFalse(acct.nonceUsed(7));
        acct.proposeDestination(newDest, dl, 7, sig);
        assertEq(uint256(acct.pendingEffectiveAt()), dl + 2 * DELAY);
    }

    /// @dev Accepted iff `t <= deadline`; an accepted proposal always waits exactly `2 * delay` of
    /// block time from its own acceptance.
    function testFuzz_exp3_producerTimestampOnlyGatesAcceptance(uint256 lifetime, uint256 t)
        public
    {
        uint256 start = vm.getBlockTimestamp();
        uint256 dl = start + bound(lifetime, 0, 30 days);
        bytes memory sig = _sigPropose(ownerPk, address(acct), newDest, dl, 9);
        t = bound(t, start, dl + 1 days);
        vm.warp(t);
        vm.prank(relayer);
        if (t > dl) {
            vm.expectRevert(IPolicyAccount.Expired.selector);
            acct.proposeDestination(newDest, dl, 9, sig);
            _assertNoProposal();
            assertFalse(acct.nonceUsed(9));
        } else {
            acct.proposeDestination(newDest, dl, 9, sig);
            assertEq(uint256(acct.pendingEffectiveAt()), t + 2 * DELAY);
            assertEq(acct.pendingDestination(), newDest);
            assertEq(acct.destination(), destination);
            assertTrue(acct.nonceUsed(9));
        }
    }
}
