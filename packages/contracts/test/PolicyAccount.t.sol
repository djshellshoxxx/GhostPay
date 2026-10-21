// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PolicyBase} from "./PolicyBase.t.sol";
import {PolicyAccount} from "../src/PolicyAccount.sol";
import {IPolicyAccount} from "../src/interfaces/IPolicyAccount.sol";
import {FalseReturnToken} from "./mocks/FalseReturnToken.sol";
import {FeeOnTransferToken} from "./mocks/FeeOnTransferToken.sol";
import {HookToken} from "./mocks/HookToken.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {RevertingReceiver, ReentrantReceiver} from "./mocks/NativeReceivers.sol";

/// @notice Unit tests of `PolicyAccount`: initialisation, signatures, timelocks, limits, native path.
contract PolicyAccountTest is PolicyBase {
    event WithdrawRequested(bytes32 indexed id, address token, uint256 amount, uint64 executeAfter);
    event WithdrawExecuted(bytes32 indexed id, address destination, address token, uint256 amount);
    event WithdrawCancelled(bytes32 indexed id);
    event DestinationProposed(bytes32 indexed id, address newDestination, uint64 effectiveAt);
    event DestinationChangeCancelled(bytes32 indexed id);
    event DestinationChanged(bytes32 indexed id, address newDestination);

    // ================================================================ initialisation

    function test_implementation_isLocked() public {
        assertTrue(impl.initialized());
        vm.expectRevert(IPolicyAccount.AlreadyInitialized.selector);
        impl.initialize(owner, destination, DELAY, root);
    }

    function test_clone_stateAfterFactoryInit() public view {
        assertTrue(acct.initialized());
        assertEq(acct.owner(), owner);
        assertEq(acct.destination(), destination);
        assertEq(acct.delay(), DELAY);
        assertEq(acct.limitsRoot(), root);
        assertEq(acct.policyHash(), keccak256(abi.encode(destination, DELAY, root)));
        assertEq(acct.pendingEffectiveAt(), 0);
        assertEq(acct.MAX_DELAY(), 30 days);
    }

    function test_clone_initializeTwice_reverts() public {
        vm.expectRevert(IPolicyAccount.AlreadyInitialized.selector);
        acct.initialize(owner, destination, DELAY, root);
    }

    function test_clone_isEip1167() public view {
        bytes memory code = address(acct).code;
        assertEq(code.length, 45);
        assertEq(
            keccak256(code),
            keccak256(
                abi.encodePacked(
                    hex"363d3d373d3d3d363d73", address(impl), hex"5af43d82803e903d91602b57fd5bf3"
                )
            )
        );
    }

    function test_initialize_strangerOnFreshClone_isUnauthorized() public {
        // A clone created by this test contract (the CREATE2 deployer) at salt(owner, policy).
        bytes32 salt = keccak256(abi.encode(owner, keccak256(abi.encode(newDest, DELAY, root))));
        address clone = Clones.cloneDeterministic(address(impl), salt);
        // A stranger can neither initialise it nor pick other arguments.
        vm.prank(relayer);
        vm.expectRevert(IPolicyAccount.UnauthorizedInitializer.selector);
        PolicyAccount(payable(clone)).initialize(owner, newDest, DELAY, root);
        // The deployer with different arguments (different address) is unauthorised too.
        vm.expectRevert(IPolicyAccount.UnauthorizedInitializer.selector);
        PolicyAccount(payable(clone)).initialize(owner, destination, DELAY, root);
        // The deployer with the exact arguments succeeds, once.
        PolicyAccount(payable(clone)).initialize(owner, newDest, DELAY, root);
        assertEq(PolicyAccount(payable(clone)).destination(), newDest);
        vm.expectRevert(IPolicyAccount.AlreadyInitialized.selector);
        PolicyAccount(payable(clone)).initialize(owner, newDest, DELAY, root);
    }

    function test_initialize_argumentValidation() public {
        bytes32 salt = bytes32(uint256(1));
        PolicyAccount c = PolicyAccount(payable(Clones.cloneDeterministic(address(impl), salt)));
        vm.expectRevert(IPolicyAccount.ZeroAddress.selector);
        c.initialize(address(0), destination, DELAY, root);
        vm.expectRevert(IPolicyAccount.ZeroAddress.selector);
        c.initialize(owner, address(0), DELAY, root);
        vm.expectRevert(IPolicyAccount.ZeroAddress.selector);
        c.initialize(owner, address(c), DELAY, root);
        vm.expectRevert(IPolicyAccount.InvalidDelay.selector);
        c.initialize(owner, destination, 0, root);
        vm.expectRevert(IPolicyAccount.InvalidDelay.selector);
        c.initialize(owner, destination, 30 days + 1, root);
    }

    function test_domainSeparator_matchesIndependentComputation() public {
        assertEq(acct.DOMAIN_SEPARATOR(), _domain(address(acct), block.chainid));
        vm.chainId(777);
        assertEq(acct.DOMAIN_SEPARATOR(), _domain(address(acct), 777));
        assertTrue(acct.DOMAIN_SEPARATOR() != impl.DOMAIN_SEPARATOR());
    }

    function test_typehashes_matchSpecStrings() public view {
        assertEq(acct.WITHDRAW_TYPEHASH(), WITHDRAW_TH);
        assertEq(acct.CANCEL_WITHDRAW_TYPEHASH(), CANCEL_WITHDRAW_TH);
        assertEq(acct.PROPOSE_DESTINATION_TYPEHASH(), PROPOSE_TH);
        assertEq(acct.CANCEL_DESTINATION_TYPEHASH(), CANCEL_DEST_TH);
    }

    // ================================================================ receive / surface

    function test_receive_acceptsEth() public {
        vm.deal(alice(), 1 ether);
        vm.prank(alice());
        (bool ok,) = address(acct).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(acct).balance, 101 ether);
    }

    function test_unknownSelector_reverts() public {
        (bool ok,) =
            address(acct).call(abi.encodeWithSignature("execute(address,bytes)", alice(), ""));
        assertFalse(ok);
        (ok,) = address(acct).call(hex"deadbeef");
        assertFalse(ok);
    }

    function alice() internal returns (address) {
        return makeAddr("alice");
    }

    // ================================================================ requestWithdraw

    function test_request_happy_storesAndEmits() public {
        IPolicyAccount.Withdraw memory w = _w(address(token), 100e6, 7);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        bytes32 expectedId = _wHash(w);
        uint64 expectedAfter = uint64(vm.getBlockTimestamp() + DELAY);
        vm.expectEmit(true, false, false, true, address(acct));
        emit WithdrawRequested(expectedId, address(token), 100e6, expectedAfter);
        vm.prank(relayer);
        bytes32 id = acct.requestWithdraw(w, lp, sig);
        assertEq(id, expectedId);
        IPolicyAccount.Request memory r = acct.requests(id);
        assertEq(r.token, address(token));
        assertEq(uint8(r.status), uint8(IPolicyAccount.Status.Pending));
        assertEq(r.executeAfter, expectedAfter);
        assertEq(r.amount, 100e6);
        assertEq(r.limit, LIMIT);
        assertEq(r.windowSeconds, WINDOW);
        assertTrue(acct.nonceUsed(7));
        assertFalse(acct.nonceUsed(8));
        // Nothing moved.
        assertEq(token.balanceOf(destination), 0);
    }

    function test_request_expired_reverts() public {
        IPolicyAccount.Withdraw memory w = _w(address(token), 1, 1);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        vm.warp(w.deadline); // inclusive deadline still valid
        acct.requestWithdraw(w, lp, sig);
        IPolicyAccount.Withdraw memory w2 = _w(address(token), 1, 2);
        bytes memory sig2 = _sigW(ownerPk, address(acct), w2);
        vm.warp(w2.deadline + 1);
        vm.expectRevert(IPolicyAccount.Expired.selector);
        acct.requestWithdraw(w2, lp, sig2);
    }

    function test_request_zeroAmount_reverts() public {
        IPolicyAccount.Withdraw memory w = _w(address(token), 0, 1);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        vm.expectRevert(IPolicyAccount.ZeroAmount.selector);
        acct.requestWithdraw(w, lp, sig);
    }

    function test_request_selfToken_reverts() public {
        IPolicyAccount.Withdraw memory w = _w(address(acct), 1, 1);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        vm.expectRevert(IPolicyAccount.InvalidToken.selector);
        acct.requestWithdraw(w, lp, sig);
    }

    function test_request_wrongSigner_reverts() public {
        (, uint256 otherPk) = makeAddrAndKey("thief");
        IPolicyAccount.Withdraw memory w = _w(address(token), 1, 1);
        bytes memory sig = _sigW(otherPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.requestWithdraw(w, lp, sig);
    }

    function test_request_tamperEachField_reverts() public {
        IPolicyAccount.Withdraw memory w = _w(address(token), 100e6, 5);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(0);

        IPolicyAccount.Withdraw memory t = _w(address(token), 100e6, 5);
        t.token = address(tokenU);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.requestWithdraw(t, _lp(2), sig);

        t = _w(address(token), 100e6, 5);
        t.amount = 101e6;
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.requestWithdraw(t, lp, sig);

        t = _w(address(token), 100e6, 5);
        t.deadline = w.deadline + 1;
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.requestWithdraw(t, lp, sig);

        t = _w(address(token), 100e6, 5);
        t.nonce = 6;
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.requestWithdraw(t, lp, sig);

        // The untampered order works.
        acct.requestWithdraw(w, lp, sig);
    }

    function test_request_replay_reverts() public {
        IPolicyAccount.Withdraw memory w = _w(address(token), 100e6, 5);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        acct.requestWithdraw(w, lp, sig);
        vm.expectRevert(IPolicyAccount.NonceAlreadyUsed.selector);
        acct.requestWithdraw(w, lp, sig);
    }

    function test_request_replayAfterCancelAndExecute_reverts() public {
        IPolicyAccount.Withdraw memory w = _w(address(token), 100e6, 5);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        bytes32 id = acct.requestWithdraw(w, lp, sig);
        acct.cancel(id, _sigCancel(ownerPk, address(acct), id));
        vm.expectRevert(IPolicyAccount.NonceAlreadyUsed.selector);
        acct.requestWithdraw(w, lp, sig);
    }

    function test_request_nonceSharedAcrossActions() public {
        _propose(newDest, 9);
        IPolicyAccount.Withdraw memory w = _w(address(token), 1, 9);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        vm.expectRevert(IPolicyAccount.NonceAlreadyUsed.selector);
        acct.requestWithdraw(w, lp, sig);
    }

    function test_request_unorderedNonces_highAndLow() public {
        _request(acct, address(token), 1, type(uint256).max, 0);
        _request(acct, address(token), 1, 0, 0);
        _request(acct, address(token), 1, 255, 0);
        _request(acct, address(token), 1, 256, 0);
        assertTrue(acct.nonceUsed(type(uint256).max));
        assertTrue(acct.nonceUsed(0));
        assertTrue(acct.nonceUsed(255));
        assertTrue(acct.nonceUsed(256));
        assertFalse(acct.nonceUsed(1));
    }

    function test_request_malleableHighS_reverts() public {
        IPolicyAccount.Withdraw memory w = _w(address(token), 1, 1);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(ownerPk, _digestFor(address(acct), block.chainid, _wHash(w)));
        bytes memory good = abi.encodePacked(r, s, v);
        bytes memory bad =
            abi.encodePacked(r, bytes32(N - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        IPolicyAccount.LimitProof memory lp = _lp(0);
        vm.expectRevert(
            abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureS.selector, bytes32(N - uint256(s)))
        );
        acct.requestWithdraw(w, lp, bad);
        acct.requestWithdraw(w, lp, good);
    }

    function test_request_badSignatureLength_reverts() public {
        IPolicyAccount.Withdraw memory w = _w(address(token), 1, 1);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        vm.expectRevert(abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureLength.selector, 3));
        acct.requestWithdraw(w, lp, hex"010203");
    }

    function test_request_crossChainSignature_reverts() public {
        IPolicyAccount.Withdraw memory w = _w(address(token), 1, 1);
        bytes memory sigOtherChain = _sign(ownerPk, address(acct), block.chainid + 1, _wHash(w));
        IPolicyAccount.LimitProof memory lp = _lp(0);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.requestWithdraw(w, lp, sigOtherChain);
        // Same signature is valid only on its own chain.
        vm.chainId(block.chainid + 1);
        acct.requestWithdraw(w, lp, sigOtherChain);
    }

    function test_request_signatureForCloneA_rejectedOnCloneB() public {
        address ownerB = owner; // same owner, different policy => different clone address
        PolicyAccount b = _deploy(ownerB, destination, 2 days, root);
        assertTrue(address(b) != address(acct));
        IPolicyAccount.Withdraw memory w = _w(address(token), 1, 1);
        bytes memory sigA = _sigW(ownerPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        b.requestWithdraw(w, lp, sigA);
        acct.requestWithdraw(w, lp, sigA);
    }

    function test_request_signatureForImplementation_rejectedOnClone() public {
        IPolicyAccount.Withdraw memory w = _w(address(token), 1, 1);
        bytes memory sig = _sign(ownerPk, address(impl), block.chainid, _wHash(w));
        IPolicyAccount.LimitProof memory lp = _lp(0);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.requestWithdraw(w, lp, sig);
    }

    function test_request_signatureTypeConfusion_reverts() public {
        // A CancelWithdraw / ProposeDestination signature must never authorise a withdrawal.
        IPolicyAccount.Withdraw memory w = _w(address(token), 1, 1);
        bytes32 id = _wHash(w);
        bytes memory cancelSig = _sigCancel(ownerPk, address(acct), id);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.requestWithdraw(w, lp, cancelSig);
    }

    function test_request_anyoneMayRelay_butCannotChangeParams() public {
        IPolicyAccount.Withdraw memory w = _w(address(token), 100e6, 1);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        // A front-runner cannot swap amount or token.
        IPolicyAccount.Withdraw memory evil = _w(address(token), 999e6, 1);
        vm.prank(makeAddr("frontrunner"));
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.requestWithdraw(evil, lp, sig);
        // Racing relayers: the first wins, the second sees a used nonce, the outcome is identical.
        vm.prank(makeAddr("frontrunner"));
        bytes32 id = acct.requestWithdraw(w, lp, sig);
        vm.prank(relayer);
        vm.expectRevert(IPolicyAccount.NonceAlreadyUsed.selector);
        acct.requestWithdraw(w, lp, sig);
        assertEq(acct.requests(id).amount, 100e6);
        assertEq(acct.destination(), destination);
    }

    // ---- limits proofs

    function test_request_invalidProof_reverts() public {
        IPolicyAccount.LimitProof memory lp = _lp(0);
        lp.limit = LIMIT * 10; // claims a higher limit than committed
        IPolicyAccount.Withdraw memory w = _wFor(address(token), 1, 1, lp);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        vm.expectRevert(IPolicyAccount.InvalidLimitProof.selector);
        acct.requestWithdraw(w, lp, sig);

        lp = _lp(0);
        lp.windowSeconds = 10 days; // claims a longer... different window
        w = _wFor(address(token), 1, 2, lp);
        sig = _sigW(ownerPk, address(acct), w);
        vm.expectRevert(IPolicyAccount.InvalidLimitProof.selector);
        acct.requestWithdraw(w, lp, sig);

        // Proof of another token's leaf does not prove this token.
        lp = _lp(1);
        w = _wFor(address(token), 1, 3, lp);
        sig = _sigW(ownerPk, address(acct), w);
        vm.expectRevert(IPolicyAccount.InvalidLimitProof.selector);
        acct.requestWithdraw(w, lp, sig);
    }

    /// @dev L-04: a proof whose leaf differs from the signed `limitLeafHash` is rejected, even if the
    /// leaf is a valid member of the tree.
    function test_request_leafNotMatchingSignedHash_reverts() public {
        IPolicyAccount.Withdraw memory w = _w(address(token), 1, 1);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        lp.limit = LIMIT * 10;
        vm.expectRevert(IPolicyAccount.LimitLeafMismatch.selector);
        acct.requestWithdraw(w, lp, sig);
        lp = _lp(0);
        lp.windowSeconds = 10 days;
        vm.expectRevert(IPolicyAccount.LimitLeafMismatch.selector);
        acct.requestWithdraw(w, lp, sig);
        // Another valid leaf of the same tree (the native one) is not accepted for this order.
        vm.expectRevert(IPolicyAccount.LimitLeafMismatch.selector);
        acct.requestWithdraw(w, _lp(1), sig);
    }

    /// @dev L-04: signature tamper test for the new field. Changing `limitLeafHash` after signing
    /// invalidates the signature; a signature over another leaf does not authorise this one.
    function test_request_tamperLimitLeafHash_reverts() public {
        IPolicyAccount.Withdraw memory w = _w(address(token), 100e6, 5);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        IPolicyAccount.Withdraw memory t = _w(address(token), 100e6, 5);
        t.limitLeafHash = leaves[2]; // unlimited leaf of tokenU
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.requestWithdraw(t, _lp(0), sig);
        t.limitLeafHash = bytes32(0);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.requestWithdraw(t, _lp(0), sig);
        // Request id commits to the leaf: orders differing only in the leaf have different ids.
        assertTrue(_wHash(w) != _wHash(t));
        bytes32 id = acct.requestWithdraw(w, _lp(0), sig);
        assertEq(id, _wHash(w));
    }

    /// @dev With `limitsRoot == 0` the leaf field is signed but not checked against any proof.
    function test_request_noLimitsRoot_leafFieldIgnored() public {
        PolicyAccount a = _deploy(owner, destination, DELAY, bytes32(0));
        IPolicyAccount.Withdraw memory w = _w(address(token), 1, 1);
        w.limitLeafHash = bytes32(uint256(0xdead));
        bytes32 id = a.requestWithdraw(w, _emptyLp(), _sigW(ownerPk, address(a), w));
        assertEq(id, _wHash(w));
    }

    function test_request_tokenNotInTree_reverts() public {
        MockERC20 other = new MockERC20("Other", "OTH", 6);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        IPolicyAccount.Withdraw memory w = _wFor(address(other), 1, 1, lp);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        vm.expectRevert(IPolicyAccount.InvalidLimitProof.selector);
        acct.requestWithdraw(w, lp, sig);
        IPolicyAccount.LimitProof memory empty = _emptyLp();
        w = _wFor(address(other), 1, 2, empty);
        sig = _sigW(ownerPk, address(acct), w);
        vm.expectRevert(IPolicyAccount.InvalidLimitProof.selector);
        acct.requestWithdraw(w, empty, sig);
    }

    function test_request_amountAboveLimit_reverts() public {
        IPolicyAccount.Withdraw memory w = _w(address(token), LIMIT + 1, 1);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        vm.expectRevert(IPolicyAccount.AmountExceedsLimit.selector);
        acct.requestWithdraw(w, lp, sig);
        // Exactly the limit is accepted.
        w = _w(address(token), LIMIT, 1);
        sig = _sigW(ownerPk, address(acct), w);
        acct.requestWithdraw(w, lp, sig);
    }

    function test_request_zeroWindowFiniteLimit_reverts() public {
        IPolicyAccount.Withdraw memory w = _w(address(tokenBad), 1, 1);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(3);
        vm.expectRevert(IPolicyAccount.InvalidLimit.selector);
        acct.requestWithdraw(w, lp, sig);
    }

    function test_request_unlimitedLeaf_works() public {
        bytes32 id = _request(acct, address(tokenU), 500_000e6, 1, 2);
        assertEq(acct.requests(id).limit, type(uint256).max);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        acct.executeWithdraw(id);
        assertEq(tokenU.balanceOf(destination), 500_000e6);
        // Unlimited tokens never touch window state.
        (uint64 window,,,) = acct.windowState(address(tokenU));
        assertEq(window, 0);
    }

    function test_request_zeroRoot_noLimits_proofIgnored() public {
        PolicyAccount a = _deploy(owner, destination, DELAY, bytes32(0));
        token.mint(address(a), 1e12);
        IPolicyAccount.Withdraw memory w = _w(address(token), 1e12, 1);
        bytes memory sig = _sigW(ownerPk, address(a), w);
        IPolicyAccount.LimitProof memory lp = _emptyLp();
        vm.prank(relayer);
        bytes32 id = a.requestWithdraw(w, lp, sig);
        assertEq(a.requests(id).limit, type(uint256).max);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        a.executeWithdraw(id);
        assertEq(token.balanceOf(destination), 1e12);
    }

    // ================================================================ executeWithdraw

    function test_execute_beforeDelay_reverts_atDelayWorks() public {
        bytes32 id = _request(acct, address(token), 100e6, 1, 0);
        uint64 availableAt = uint64(vm.getBlockTimestamp() + DELAY);
        vm.warp(availableAt - 1);
        vm.expectRevert(abi.encodeWithSelector(IPolicyAccount.TimelockActive.selector, availableAt));
        acct.executeWithdraw(id);
        vm.warp(availableAt);
        vm.expectEmit(true, false, false, true, address(acct));
        emit WithdrawExecuted(id, destination, address(token), 100e6);
        vm.prank(makeAddr("anyone"));
        acct.executeWithdraw(id);
        assertEq(token.balanceOf(destination), 100e6);
        assertEq(uint8(acct.requests(id).status), uint8(IPolicyAccount.Status.Executed));
    }

    function test_execute_twice_reverts() public {
        bytes32 id = _request(acct, address(token), 100e6, 1, 0);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        acct.executeWithdraw(id);
        vm.expectRevert(IPolicyAccount.NotPending.selector);
        acct.executeWithdraw(id);
    }

    function test_execute_unknownId_reverts() public {
        vm.expectRevert(IPolicyAccount.NotPending.selector);
        acct.executeWithdraw(bytes32(uint256(1234)));
    }

    function test_execute_insufficientBalance_staysPending() public {
        MockERC20 poor = new MockERC20("Poor", "POOR", 6);
        PolicyAccount a = _deploy(owner, destination, DELAY, bytes32(0));
        poor.mint(address(a), 50);
        IPolicyAccount.Withdraw memory w = _w(address(poor), 100, 1);
        bytes memory sig = _sigW(ownerPk, address(a), w);
        IPolicyAccount.LimitProof memory lp = _emptyLp();
        bytes32 id = a.requestWithdraw(w, lp, sig);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        vm.expectRevert();
        a.executeWithdraw(id);
        assertEq(uint8(a.requests(id).status), uint8(IPolicyAccount.Status.Pending));
        poor.mint(address(a), 50);
        a.executeWithdraw(id);
        assertEq(poor.balanceOf(destination), 100);
    }

    function test_execute_isPermissionless_destinationNotCaller() public {
        bytes32 id = _request(acct, address(token), 100e6, 1, 0);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        acct.executeWithdraw(id);
        assertEq(token.balanceOf(attacker), 0);
        assertEq(token.balanceOf(destination), 100e6);
        assertEq(token.balanceOf(address(acct)), 1_000_000e6 - 100e6);
    }

    // ---- native

    function test_native_withdraw_works() public {
        bytes32 id = _request(acct, address(0), 3 ether, 1, 1);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        acct.executeWithdraw(id);
        assertEq(destination.balance, 3 ether);
        assertEq(address(acct).balance, 97 ether);
    }

    function test_native_revertingDestination_staysPending() public {
        RevertingReceiver bad = new RevertingReceiver();
        PolicyAccount a = _deploy(owner, address(bad), DELAY, bytes32(0));
        vm.deal(address(a), 5 ether);
        IPolicyAccount.Withdraw memory w = _w(address(0), 1 ether, 1);
        bytes memory sig = _sigW(ownerPk, address(a), w);
        IPolicyAccount.LimitProof memory lp = _emptyLp();
        bytes32 id = a.requestWithdraw(w, lp, sig);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        vm.expectRevert(IPolicyAccount.NativeTransferFailed.selector);
        a.executeWithdraw(id);
        assertEq(uint8(a.requests(id).status), uint8(IPolicyAccount.Status.Pending));
        assertEq(address(a).balance, 5 ether);
    }

    function test_native_insufficientBalance_reverts() public {
        bytes32 id = _request(acct, address(0), 5 ether, 1, 1);
        vm.deal(address(acct), 1 ether);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        vm.expectRevert(IPolicyAccount.NativeTransferFailed.selector);
        acct.executeWithdraw(id);
    }

    function test_native_reentrantDestination_isBlocked() public {
        ReentrantReceiver rr = new ReentrantReceiver();
        PolicyAccount a = _deploy(owner, address(rr), DELAY, bytes32(0));
        vm.deal(address(a), 5 ether);
        IPolicyAccount.Withdraw memory w1 = _w(address(0), 1 ether, 1);
        IPolicyAccount.Withdraw memory w2 = _w(address(0), 1 ether, 2);
        bytes memory s1 = _sigW(ownerPk, address(a), w1);
        bytes memory s2 = _sigW(ownerPk, address(a), w2);
        IPolicyAccount.LimitProof memory lp = _emptyLp();
        bytes32 id1 = a.requestWithdraw(w1, lp, s1);
        bytes32 id2 = a.requestWithdraw(w2, lp, s2);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        rr.arm(address(a), abi.encodeCall(a.executeWithdraw, (id2)), 0, false);
        a.executeWithdraw(id1);
        assertEq(rr.attempts(), 1);
        assertFalse(rr.lastSuccess());
        assertEq(uint8(a.requests(id2).status), uint8(IPolicyAccount.Status.Pending));
        assertEq(address(rr).balance, 1 ether);
    }

    // ---- ERC-20 oddities

    function test_execute_reentrantToken_isBlocked() public {
        HookToken hook = new HookToken();
        PolicyAccount a = _deploy(owner, destination, DELAY, bytes32(0));
        hook.mint(address(a), 1000);
        IPolicyAccount.Withdraw memory w1 = _w(address(hook), 100, 1);
        IPolicyAccount.Withdraw memory w2 = _w(address(hook), 100, 2);
        bytes memory s1 = _sigW(ownerPk, address(a), w1);
        bytes memory s2 = _sigW(ownerPk, address(a), w2);
        IPolicyAccount.LimitProof memory lp = _emptyLp();
        bytes32 id1 = a.requestWithdraw(w1, lp, s1);
        bytes32 id2 = a.requestWithdraw(w2, lp, s2);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        hook.arm(address(a), abi.encodeCall(a.executeWithdraw, (id2)));
        a.executeWithdraw(id1);
        assertEq(hook.attempts(), 1);
        assertFalse(hook.lastSuccess());
        assertEq(uint8(a.requests(id2).status), uint8(IPolicyAccount.Status.Pending));
        assertEq(hook.balanceOf(destination), 100);
    }

    function test_execute_reentrantRequestAndCancel_isBlocked() public {
        HookToken hook = new HookToken();
        PolicyAccount a = _deploy(owner, destination, DELAY, bytes32(0));
        hook.mint(address(a), 1000);
        IPolicyAccount.Withdraw memory w1 = _w(address(hook), 100, 1);
        bytes32 id1 = a.requestWithdraw(w1, _emptyLp(), _sigW(ownerPk, address(a), w1));
        IPolicyAccount.Withdraw memory w2 = _w(address(hook), 100, 2);
        bytes memory s2 = _sigW(ownerPk, address(a), w2);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        hook.arm(address(a), abi.encodeCall(a.requestWithdraw, (w2, _emptyLp(), s2)));
        a.executeWithdraw(id1);
        assertFalse(hook.lastSuccess());
        assertFalse(a.nonceUsed(2));
    }

    function test_execute_feeOnTransferToken_reverts() public {
        FeeOnTransferToken fot = new FeeOnTransferToken();
        PolicyAccount a = _deploy(owner, destination, DELAY, bytes32(0));
        fot.mint(address(a), 1000);
        IPolicyAccount.Withdraw memory w = _w(address(fot), 100, 1);
        bytes32 id = a.requestWithdraw(w, _emptyLp(), _sigW(ownerPk, address(a), w));
        vm.warp(vm.getBlockTimestamp() + DELAY);
        vm.expectRevert(IPolicyAccount.UnexpectedBalanceDelta.selector);
        a.executeWithdraw(id);
        assertEq(uint8(a.requests(id).status), uint8(IPolicyAccount.Status.Pending));
        assertEq(fot.balanceOf(address(a)), 1000);
    }

    function test_execute_falseReturningToken_reverts() public {
        FalseReturnToken ft = new FalseReturnToken();
        PolicyAccount a = _deploy(owner, destination, DELAY, bytes32(0));
        IPolicyAccount.Withdraw memory w = _w(address(ft), 100, 1);
        bytes32 id = a.requestWithdraw(w, _emptyLp(), _sigW(ownerPk, address(a), w));
        vm.warp(vm.getBlockTimestamp() + DELAY);
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(ft))
        );
        a.executeWithdraw(id);
    }

    // ---- windows

    function test_window_secondWithdrawalAboveCap_reverts_thenWorksLater() public {
        _withdraw(address(token), 600e6, 1, 0);
        bytes32 id = _request(acct, address(token), 600e6, 2, 0);
        vm.warp(vm.getBlockTimestamp() + DELAY); // same-or-next bucket depending on alignment
        (, uint64 bucket, uint256 cur, uint256 prev) = acct.windowState(address(token));
        assertEq(cur + prev, 600e6);
        assertEq(bucket, (vm.getBlockTimestamp() - DELAY) / WINDOW);
        if (vm.getBlockTimestamp() / WINDOW == bucket) {
            vm.expectRevert(IPolicyAccount.WindowLimitExceeded.selector);
            acct.executeWithdraw(id);
            vm.warp(vm.getBlockTimestamp() + 2 * WINDOW);
        } else {
            // Next bucket: previous (600) still counts against the cap.
            vm.expectRevert(IPolicyAccount.WindowLimitExceeded.selector);
            acct.executeWithdraw(id);
            vm.warp(vm.getBlockTimestamp() + WINDOW);
        }
        acct.executeWithdraw(id);
        assertEq(token.balanceOf(destination), 1200e6);
    }

    function test_window_exactCapAllowed_andFurtherWeiRejected() public {
        vm.warp((vm.getBlockTimestamp() / WINDOW + 1) * WINDOW); // bucket start
        bytes32 a = _request(acct, address(token), LIMIT - 1, 1, 0);
        bytes32 b = _request(acct, address(token), 1, 2, 0);
        bytes32 c = _request(acct, address(token), 1, 3, 0);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        // delay == window: the executes land in the following bucket; all three fit in one bucket.
        acct.executeWithdraw(a);
        acct.executeWithdraw(b);
        vm.expectRevert(IPolicyAccount.WindowLimitExceeded.selector);
        acct.executeWithdraw(c);
        assertEq(token.balanceOf(destination), LIMIT);
    }

    function test_window_previousBucketDecays() public {
        vm.warp((vm.getBlockTimestamp() / WINDOW + 1) * WINDOW);
        bytes32 a = _request(acct, address(token), LIMIT, 1, 0);
        bytes32 b = _request(acct, address(token), LIMIT, 2, 0);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        acct.executeWithdraw(a); // bucket k
        vm.warp(vm.getBlockTimestamp() + WINDOW); // bucket k+1: previous = LIMIT
        vm.expectRevert(IPolicyAccount.WindowLimitExceeded.selector);
        acct.executeWithdraw(b);
        vm.warp(vm.getBlockTimestamp() + WINDOW); // bucket k+2: previous = 0 (gap)
        acct.executeWithdraw(b);
        (, uint64 bucket, uint256 cur, uint256 prev) = acct.windowState(address(token));
        assertEq(bucket, vm.getBlockTimestamp() / WINDOW);
        assertEq(cur, LIMIT);
        assertEq(prev, 0);
        assertEq(token.balanceOf(destination), 2 * LIMIT);
    }

    function test_window_previousCarriedOnlyToNextBucket() public {
        vm.warp((vm.getBlockTimestamp() / WINDOW + 1) * WINDOW);
        bytes32 a = _request(acct, address(token), 400e6, 1, 0);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        acct.executeWithdraw(a);
        vm.warp(vm.getBlockTimestamp() + WINDOW);
        bytes32 b = _request(acct, address(token), 600e6, 2, 0);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        // bucket k+2 relative to a: previous = 0 for b's bucket? a is in bucket k, now is k+2.
        acct.executeWithdraw(b);
        (,, uint256 cur, uint256 prev) = acct.windowState(address(token));
        assertEq(cur, 600e6);
        assertEq(prev, 0);
    }

    function test_window_perTokenIndependent() public {
        _withdraw(address(token), LIMIT, 1, 0);
        _withdraw(address(0), NATIVE_LIMIT, 2, 1); // different token: own window
        assertEq(destination.balance, NATIVE_LIMIT);
    }

    /// @dev Builds a tree with two leaves for the same token. Only the creator of the policy can do this.
    function _dupAccount(uint256 limit2, uint64 window2)
        internal
        returns (
            PolicyAccount a,
            IPolicyAccount.LimitProof memory lp1,
            IPolicyAccount.LimitProof memory lp2
        )
    {
        bytes32 l1 = _leaf(address(token), LIMIT, WINDOW);
        bytes32 l2 = _leaf(address(token), limit2, window2);
        a = _deploy(owner, destination, DELAY, _hashPair(l1, l2));
        token.mint(address(a), 10_000e6);
        bytes32[] memory p1 = new bytes32[](1);
        p1[0] = l2;
        bytes32[] memory p2 = new bytes32[](1);
        p2[0] = l1;
        lp1 = IPolicyAccount.LimitProof({limit: LIMIT, windowSeconds: WINDOW, proof: p1});
        lp2 = IPolicyAccount.LimitProof({limit: limit2, windowSeconds: window2, proof: p2});
    }

    function test_window_mismatch_reverts() public {
        (
            PolicyAccount a,
            IPolicyAccount.LimitProof memory lp1,
            IPolicyAccount.LimitProof memory lp2
        ) = _dupAccount(LIMIT, 2 days);
        IPolicyAccount.Withdraw memory w1 = _wFor(address(token), 1, 1, lp1);
        IPolicyAccount.Withdraw memory w2 = _wFor(address(token), 1, 2, lp2);
        bytes32 id1 = a.requestWithdraw(w1, lp1, _sigW(ownerPk, address(a), w1));
        bytes32 id2 = a.requestWithdraw(w2, lp2, _sigW(ownerPk, address(a), w2));
        vm.warp(vm.getBlockTimestamp() + DELAY);
        a.executeWithdraw(id1);
        vm.expectRevert(IPolicyAccount.WindowMismatch.selector);
        a.executeWithdraw(id2);
    }

    function test_window_lowerLimitThanUsed_reverts() public {
        (
            PolicyAccount a,
            IPolicyAccount.LimitProof memory lp1,
            IPolicyAccount.LimitProof memory lp2
        ) = _dupAccount(100, WINDOW);
        IPolicyAccount.Withdraw memory w1 = _wFor(address(token), 500, 1, lp1);
        IPolicyAccount.Withdraw memory w2 = _wFor(address(token), 50, 2, lp2);
        bytes32 id1 = a.requestWithdraw(w1, lp1, _sigW(ownerPk, address(a), w1));
        bytes32 id2 = a.requestWithdraw(w2, lp2, _sigW(ownerPk, address(a), w2));
        vm.warp(vm.getBlockTimestamp() + DELAY);
        a.executeWithdraw(id1);
        vm.expectRevert(IPolicyAccount.WindowLimitExceeded.selector);
        a.executeWithdraw(id2);
    }

    // ================================================================ cancel

    function test_cancel_byOwnerSignature_anyoneRelays() public {
        bytes32 id = _request(acct, address(token), 100e6, 1, 0);
        bytes memory sig = _sigCancel(ownerPk, address(acct), id);
        vm.expectEmit(true, false, false, false, address(acct));
        emit WithdrawCancelled(id);
        vm.prank(makeAddr("anyone"));
        acct.cancel(id, sig);
        assertEq(uint8(acct.requests(id).status), uint8(IPolicyAccount.Status.Cancelled));
        vm.warp(vm.getBlockTimestamp() + DELAY);
        vm.expectRevert(IPolicyAccount.NotPending.selector);
        acct.executeWithdraw(id);
        assertEq(token.balanceOf(destination), 0);
    }

    function test_cancel_wrongSigner_reverts() public {
        bytes32 id = _request(acct, address(token), 100e6, 1, 0);
        (, uint256 otherPk) = makeAddrAndKey("thief");
        bytes memory sig = _sigCancel(otherPk, address(acct), id);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.cancel(id, sig);
    }

    function test_cancel_signatureForOtherIdOrClone_reverts() public {
        bytes32 id1 = _request(acct, address(token), 100e6, 1, 0);
        bytes32 id2 = _request(acct, address(token), 100e6, 2, 0);
        bytes memory sig1 = _sigCancel(ownerPk, address(acct), id1);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.cancel(id2, sig1);
        bytes memory otherClone = _sigCancel(ownerPk, address(impl), id1);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.cancel(id1, otherClone);
    }

    function test_cancel_notPending_reverts() public {
        vm.expectRevert(IPolicyAccount.NotPending.selector);
        acct.cancel(bytes32(uint256(1)), hex"");
        bytes32 id = _request(acct, address(token), 100e6, 1, 0);
        bytes memory sig = _sigCancel(ownerPk, address(acct), id);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        acct.executeWithdraw(id);
        vm.expectRevert(IPolicyAccount.NotPending.selector);
        acct.cancel(id, sig);
    }

    function test_cancel_signatureReuse_reverts() public {
        bytes32 id = _request(acct, address(token), 100e6, 1, 0);
        bytes memory sig = _sigCancel(ownerPk, address(acct), id);
        acct.cancel(id, sig);
        vm.expectRevert(IPolicyAccount.NotPending.selector);
        acct.cancel(id, sig);
    }

    // ================================================================ destination change

    function test_propose_happy_storesAndEmits() public {
        uint256 dl = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _sigPropose(ownerPk, address(acct), newDest, dl, 3);
        bytes32 expectedId = _pHash(newDest, dl, 3);
        uint64 eff = uint64(vm.getBlockTimestamp() + 2 * DELAY);
        vm.expectEmit(true, false, false, true, address(acct));
        emit DestinationProposed(expectedId, newDest, eff);
        vm.prank(relayer);
        bytes32 id = acct.proposeDestination(newDest, dl, 3, sig);
        assertEq(id, expectedId);
        assertEq(acct.pendingDestination(), newDest);
        assertEq(acct.pendingEffectiveAt(), eff);
        assertEq(acct.pendingProposalId(), id);
        assertEq(acct.destination(), destination); // unchanged
        assertTrue(acct.nonceUsed(3));
    }

    function test_propose_errors() public {
        uint256 dl = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _sigPropose(ownerPk, address(acct), newDest, dl, 1);

        vm.warp(dl + 1);
        vm.expectRevert(IPolicyAccount.Expired.selector);
        acct.proposeDestination(newDest, dl, 1, sig);
        vm.warp(dl - 1 hours);

        bytes memory zeroSig = _sigPropose(ownerPk, address(acct), address(0), dl, 1);
        vm.expectRevert(IPolicyAccount.InvalidDestination.selector);
        acct.proposeDestination(address(0), dl, 1, zeroSig);
        bytes memory selfSig = _sigPropose(ownerPk, address(acct), address(acct), dl, 1);
        vm.expectRevert(IPolicyAccount.InvalidDestination.selector);
        acct.proposeDestination(address(acct), dl, 1, selfSig);

        (, uint256 otherPk) = makeAddrAndKey("thief");
        bytes memory bad = _sigPropose(otherPk, address(acct), newDest, dl, 1);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.proposeDestination(newDest, dl, 1, bad);

        // Tamper: different destination / deadline / nonce under the same signature.
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.proposeDestination(makeAddr("x"), dl, 1, sig);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.proposeDestination(newDest, dl + 1, 1, sig);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.proposeDestination(newDest, dl, 2, sig);

        // Cross-chain and cross-clone signatures.
        bytes memory chain =
            _sign(ownerPk, address(acct), block.chainid + 1, _pHash(newDest, dl, 1));
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.proposeDestination(newDest, dl, 1, chain);
        bytes memory clone = _sigPropose(ownerPk, address(impl), newDest, dl, 1);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.proposeDestination(newDest, dl, 1, clone);

        acct.proposeDestination(newDest, dl, 1, sig);
        // Pending proposal blocks another; replay of the same fails the pending check first.
        vm.expectRevert(IPolicyAccount.ProposalPending.selector);
        acct.proposeDestination(newDest, dl, 1, sig);
    }

    function test_propose_replayAfterExecute_reverts() public {
        uint256 dl = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _sigPropose(ownerPk, address(acct), newDest, dl, 1);
        acct.proposeDestination(newDest, dl, 1, sig);
        vm.warp(vm.getBlockTimestamp() + 2 * DELAY);
        acct.executeDestinationChange();
        // Back to the original destination later, then the stale proposal must not be replayable.
        vm.warp(dl - 10);
        vm.expectRevert(IPolicyAccount.NonceAlreadyUsed.selector);
        acct.proposeDestination(newDest, dl, 1, sig);
    }

    function test_propose_malleableSig_reverts() public {
        uint256 dl = vm.getBlockTimestamp() + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(ownerPk, _digestFor(address(acct), block.chainid, _pHash(newDest, dl, 1)));
        bytes memory bad =
            abi.encodePacked(r, bytes32(N - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        vm.expectRevert(
            abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureS.selector, bytes32(N - uint256(s)))
        );
        acct.proposeDestination(newDest, dl, 1, bad);
    }

    function test_executeDestinationChange_timelockIsTwiceDelay() public {
        bytes32 id = _propose(newDest, 1);
        uint64 eff = uint64(vm.getBlockTimestamp() + 2 * DELAY);
        vm.warp(vm.getBlockTimestamp() + DELAY); // the withdrawal delay is not enough
        vm.expectRevert(abi.encodeWithSelector(IPolicyAccount.TimelockActive.selector, eff));
        acct.executeDestinationChange();
        vm.warp(eff - 1);
        vm.expectRevert(abi.encodeWithSelector(IPolicyAccount.TimelockActive.selector, eff));
        acct.executeDestinationChange();
        vm.warp(eff);
        vm.expectEmit(true, false, false, true, address(acct));
        emit DestinationChanged(id, newDest);
        vm.prank(makeAddr("anyone"));
        acct.executeDestinationChange();
        assertEq(acct.destination(), newDest);
        assertEq(acct.pendingEffectiveAt(), 0);
        assertEq(acct.pendingDestination(), address(0));
        assertEq(acct.pendingProposalId(), bytes32(0));
        // policyHash remains that of the original policy (address derivation input).
        assertEq(acct.policyHash(), keccak256(abi.encode(destination, DELAY, root)));
    }

    function test_executeDestinationChange_noProposal_reverts() public {
        vm.expectRevert(IPolicyAccount.NoProposal.selector);
        acct.executeDestinationChange();
    }

    function test_cancelDestination_byOwner_beforeAndAfterTimelockMatures() public {
        bytes32 id = _propose(newDest, 1);
        bytes memory sig = _sigCancelDest(ownerPk, address(acct), id);
        vm.expectEmit(true, false, false, false, address(acct));
        emit DestinationChangeCancelled(id);
        vm.prank(makeAddr("anyone"));
        acct.cancelDestination(id, sig);
        assertEq(acct.pendingEffectiveAt(), 0);
        vm.warp(vm.getBlockTimestamp() + 10 * DELAY);
        vm.expectRevert(IPolicyAccount.NoProposal.selector);
        acct.executeDestinationChange();
        assertEq(acct.destination(), destination);
        // A new proposal is possible and restarts the full timelock.
        _propose(newDest, 2);
        assertEq(acct.pendingEffectiveAt(), vm.getBlockTimestamp() + 2 * DELAY);
    }

    function test_cancelDestination_errors() public {
        vm.expectRevert(IPolicyAccount.NoProposal.selector);
        acct.cancelDestination(bytes32(uint256(1)), hex"");
        bytes32 id = _propose(newDest, 1);
        // wrong id
        vm.expectRevert(IPolicyAccount.NoProposal.selector);
        acct.cancelDestination(bytes32(uint256(2)), hex"");
        // wrong signer
        (, uint256 otherPk) = makeAddrAndKey("thief");
        bytes memory bad = _sigCancelDest(otherPk, address(acct), id);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.cancelDestination(id, bad);
        // a CancelWithdraw-typed signature on the same id must not cancel a destination change
        bytes memory wrongType = _sigCancel(ownerPk, address(acct), id);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.cancelDestination(id, wrongType);
    }

    // ---- attack scenarios

    function test_attack_stolenKey_cannotRedirectBeforeTwiceDelay() public {
        // Thief holds the owner key, proposes his own address, and also tries to withdraw.
        address thief = makeAddr("thiefWallet");
        bytes32 pid = _propose(thief, 1);
        bytes32 wid = _request(acct, address(token), 100e6, 2, 0);

        // Withdrawals during the proposal still go to the legitimate destination.
        vm.warp(vm.getBlockTimestamp() + DELAY);
        acct.executeWithdraw(wid);
        assertEq(token.balanceOf(destination), 100e6);
        assertEq(token.balanceOf(thief), 0);

        // Before 2x delay the change cannot be applied.
        vm.expectRevert();
        acct.executeDestinationChange();
        assertEq(acct.destination(), destination);

        // Legit owner (same key) cancels within the window and wins.
        acct.cancelDestination(pid, _sigCancelDest(ownerPk, address(acct), pid));
        vm.warp(vm.getBlockTimestamp() + 5 * DELAY);
        vm.expectRevert(IPolicyAccount.NoProposal.selector);
        acct.executeDestinationChange();
        assertEq(acct.destination(), destination);
        assertEq(token.balanceOf(thief), 0);
    }

    function test_attack_changeAppliesAfterTwiceDelay_pendingWithdrawalsFollowNewDestination()
        public
    {
        bytes32 wid = _request(acct, address(token), 100e6, 1, 0);
        _propose(newDest, 2);
        vm.warp(vm.getBlockTimestamp() + 2 * DELAY);
        acct.executeDestinationChange();
        acct.executeWithdraw(wid);
        assertEq(token.balanceOf(newDest), 100e6);
        assertEq(token.balanceOf(destination), 0);
    }

    function test_attack_proposalSignatureReplayOnOtherClone_reverts() public {
        PolicyAccount b = _deploy(owner, destination, 2 days, root);
        uint256 dl = vm.getBlockTimestamp() + 1 hours;
        bytes memory sigA = _sigPropose(ownerPk, address(acct), newDest, dl, 1);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        b.proposeDestination(newDest, dl, 1, sigA);
    }

    function test_attack_relayerCannotChangeProposalParams() public {
        uint256 dl = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _sigPropose(ownerPk, address(acct), newDest, dl, 1);
        vm.prank(makeAddr("frontrunner"));
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        acct.proposeDestination(makeAddr("attackerDest"), dl, 1, sig);
    }

    // ================================================================ views

    function test_windowState_viewsDefault() public view {
        (uint64 window, uint64 bucket, uint256 cur, uint256 prev) = acct.windowState(address(token));
        assertEq(window, 0);
        assertEq(bucket, 0);
        assertEq(cur, 0);
        assertEq(prev, 0);
    }

    function test_eip712Domain_reportsCloneAndChain() public view {
        (, string memory name, string memory version, uint256 chainId, address vc,,) =
            acct.eip712Domain();
        assertEq(name, "GhostPayPolicyAccount");
        assertEq(version, "1");
        assertEq(chainId, block.chainid);
        // `eip712Domain()` reports address(this) = the clone.
        assertEq(vc, address(acct));
    }

    function test_noAllowanceEverGranted() public {
        _withdraw(address(token), 100e6, 1, 0);
        assertEq(token.allowance(address(acct), destination), 0);
        assertEq(token.allowance(address(acct), owner), 0);
        assertEq(token.allowance(address(acct), relayer), 0);
    }
}
