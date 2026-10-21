// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {GhostPaySweepRelayer} from "../src/GhostPaySweepRelayer.sol";
import {SweepBase} from "./SweepBase.t.sol";
import {IGhostPaySweepRelayer} from "../src/interfaces/IGhostPaySweepRelayer.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {PermitToken} from "./mocks/PermitToken.sol";
import {NoReturnToken} from "./mocks/NoReturnToken.sol";
import {FalseReturnToken} from "./mocks/FalseReturnToken.sol";
import {FeeOnTransferToken} from "./mocks/FeeOnTransferToken.sol";
import {ReentrantToken} from "./mocks/ReentrantToken.sol";
import {BlacklistToken} from "./mocks/BlacklistToken.sol";

contract GhostPaySweepRelayerTest is SweepBase {
    event Swept(
        address indexed token,
        address indexed owner,
        address indexed destination,
        uint256 amount,
        uint256 fee
    );

    function _doSweepWithPermit(IGhostPaySweepRelayer.Sweep memory s) internal {
        bytes memory sig = _sign(ownerPk, s);
        IGhostPaySweepRelayer.PermitSig memory p =
            _permit(token, ownerPk, owner, s.amount, s.deadline);
        vm.prank(submitter);
        relayer.sweepWithPermit(s, sig, p);
    }

    // ------------------------------------------------------------------ domain / typehash

    function test_typehashMatchesSpecString() public view {
        assertEq(relayer.SWEEP_TYPEHASH(), TYPEHASH);
    }

    function test_domainSeparatorMatchesSpec() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("GhostPaySweepRelayer"),
                keccak256("1"),
                block.chainid,
                address(relayer)
            )
        );
        assertEq(relayer.DOMAIN_SEPARATOR(), expected);
    }

    function test_domainSeparatorTracksChainId() public {
        bytes32 before_ = relayer.DOMAIN_SEPARATOR();
        vm.chainId(block.chainid + 1);
        assertTrue(relayer.DOMAIN_SEPARATOR() != before_);
    }

    // ------------------------------------------------------------------ happy paths

    function test_sweepWithPermit_happyPath() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(1);
        vm.expectEmit(true, true, true, true, address(relayer));
        emit Swept(address(token), owner, destination, AMOUNT, FEE);
        _doSweepWithPermit(s);
        assertEq(token.balanceOf(destination), AMOUNT - FEE);
        assertEq(token.balanceOf(feeTo), FEE);
        assertEq(token.balanceOf(owner), 10_000e6 - AMOUNT);
        assertEq(token.balanceOf(address(relayer)), 0);
        assertEq(token.allowance(owner, address(relayer)), 0);
        assertTrue(relayer.nonceUsed(owner, 1));
    }

    function test_sweep_withExistingAllowance() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(2);
        _approveRelayer(address(token), AMOUNT);
        vm.prank(submitter);
        relayer.sweep(s, _sign(ownerPk, s));
        assertEq(token.balanceOf(destination), AMOUNT - FEE);
        assertEq(token.balanceOf(feeTo), FEE);
    }

    function test_sweep_zeroFeeSkipsFeeTransfer() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(3);
        s.fee = 0;
        _approveRelayer(address(token), AMOUNT);
        relayer.sweep(s, _sign(ownerPk, s));
        assertEq(token.balanceOf(destination), AMOUNT);
        assertEq(token.balanceOf(feeTo), 0);
    }

    function test_sweep_anyoneMayRelay() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(4);
        _approveRelayer(address(token), AMOUNT);
        bytes memory sig = _sign(ownerPk, s);
        vm.prank(makeAddr("randomStranger"));
        relayer.sweep(s, sig);
        assertEq(token.balanceOf(destination), AMOUNT - FEE);
    }

    function test_sweep_deadlineInclusive() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(5);
        _approveRelayer(address(token), AMOUNT);
        bytes memory sig = _sign(ownerPk, s);
        vm.warp(s.deadline);
        relayer.sweep(s, sig);
    }

    function test_sweep_minimalFeeAmountPlusOne() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(6);
        s.fee = AMOUNT - 1;
        _approveRelayer(address(token), AMOUNT);
        relayer.sweep(s, _sign(ownerPk, s));
        assertEq(token.balanceOf(destination), 1);
        assertEq(token.balanceOf(feeTo), AMOUNT - 1);
    }

    // ------------------------------------------------------------------ permit behaviour

    function test_frontRunPermit_sweepStillSucceeds() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(7);
        bytes memory sig = _sign(ownerPk, s);
        IGhostPaySweepRelayer.PermitSig memory p =
            _permit(token, ownerPk, owner, s.amount, s.deadline);
        // Griefer front-runs the permit.
        token.permit(owner, address(relayer), p.value, p.deadline, p.v, p.r, p.s);
        assertEq(token.nonces(owner), 1);
        vm.prank(submitter);
        relayer.sweepWithPermit(s, sig, p);
        assertEq(token.balanceOf(destination), AMOUNT - FEE);
    }

    function test_permitInvalid_noAllowance_reverts() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(8);
        bytes memory sig = _sign(ownerPk, s);
        (, uint256 otherPk) = makeAddrAndKey("attacker");
        IGhostPaySweepRelayer.PermitSig memory p =
            _permit(token, otherPk, owner, s.amount, s.deadline);
        vm.expectRevert(); // ERC20InsufficientAllowance
        relayer.sweepWithPermit(s, sig, p);
        assertFalse(relayer.nonceUsed(owner, 8), "revert rolls back nonce");
    }

    function test_permitValueTooLow_reverts() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(9);
        bytes memory sig = _sign(ownerPk, s);
        IGhostPaySweepRelayer.PermitSig memory p =
            _permit(token, ownerPk, owner, s.amount - 1, s.deadline);
        vm.expectRevert(IGhostPaySweepRelayer.PermitValueTooLow.selector);
        relayer.sweepWithPermit(s, sig, p);
    }

    function test_permitOnNonPermitTokenWithAllowance_succeeds() public {
        MockERC20 plain = new MockERC20("P", "P", 6);
        plain.mint(owner, AMOUNT);
        _approveRelayer(address(plain), AMOUNT);
        IGhostPaySweepRelayer.Sweep memory s = _sweep(10);
        s.token = address(plain);
        IGhostPaySweepRelayer.PermitSig memory p =
            IGhostPaySweepRelayer.PermitSig(AMOUNT, s.deadline, 27, 0, 0);
        relayer.sweepWithPermit(s, _sign(ownerPk, s), p);
        assertEq(plain.balanceOf(destination), AMOUNT - FEE);
    }

    // ------------------------------------------------------------------ signature failures

    function test_wrongSigner_reverts() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(11);
        (, uint256 otherPk) = makeAddrAndKey("notOwner");
        bytes memory sig = _sign(otherPk, s);
        _approveRelayer(address(token), AMOUNT);
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        relayer.sweep(s, sig);
    }

    function test_garbageSignature_reverts() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(11);
        vm.expectRevert(abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureLength.selector, 3));
        relayer.sweep(s, hex"010203");
        vm.expectRevert(ECDSA.ECDSAInvalidSignature.selector);
        relayer.sweep(s, new bytes(65));
    }

    function test_tamperedFields_revert() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(12);
        bytes memory sig = _sign(ownerPk, s);
        _approveRelayer(address(token), type(uint256).max);

        IGhostPaySweepRelayer.Sweep memory t;

        t = _sweep(12);
        t.destination = makeAddr("attackerDest");
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        relayer.sweep(t, sig);

        t = _sweep(12);
        t.feeTo = makeAddr("attackerFeeTo");
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        relayer.sweep(t, sig);

        t = _sweep(12);
        t.fee = FEE + 1;
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        relayer.sweep(t, sig);

        t = _sweep(12);
        t.amount = AMOUNT + 1;
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        relayer.sweep(t, sig);

        t = _sweep(12);
        t.nonce = 13;
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        relayer.sweep(t, sig);

        t = _sweep(12);
        t.deadline = s.deadline + 1;
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        relayer.sweep(t, sig);

        t = _sweep(12);
        t.token = address(new MockERC20("X", "X", 6));
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        relayer.sweep(t, sig);

        t = _sweep(12);
        t.owner = makeAddr("someoneElse");
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        relayer.sweep(t, sig);

        assertEq(token.balanceOf(destination), 0);
        // The untampered order still works.
        relayer.sweep(s, sig);
        assertEq(token.balanceOf(destination), AMOUNT - FEE);
    }

    function test_replay_reverts() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(14);
        bytes memory sig = _sign(ownerPk, s);
        _approveRelayer(address(token), type(uint256).max);
        relayer.sweep(s, sig);
        vm.expectRevert(IGhostPaySweepRelayer.NonceAlreadyUsed.selector);
        relayer.sweep(s, sig);
        // also through the permit entry point
        IGhostPaySweepRelayer.PermitSig memory p =
            _permit(token, ownerPk, owner, s.amount, s.deadline);
        vm.expectRevert(IGhostPaySweepRelayer.NonceAlreadyUsed.selector);
        relayer.sweepWithPermit(s, sig, p);
    }

    function test_expired_reverts() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(15);
        bytes memory sig = _sign(ownerPk, s);
        vm.warp(s.deadline + 1);
        vm.expectRevert(IGhostPaySweepRelayer.Expired.selector);
        relayer.sweep(s, sig);
    }

    function test_crossChainDomain_reverts() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(16);
        bytes memory sig = _sign(ownerPk, s);
        _approveRelayer(address(token), type(uint256).max);
        vm.chainId(block.chainid + 1);
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        relayer.sweep(s, sig);
    }

    function test_crossContractDomain_reverts() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(16);
        bytes memory sig = _sign(ownerPk, s); // signed for `relayer`
        GhostPaySweepRelayer other = new GhostPaySweepRelayer();
        assertTrue(other.DOMAIN_SEPARATOR() != relayer.DOMAIN_SEPARATOR());
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        other.sweep(s, sig);
    }

    function test_highSMalleableSignature_rejected() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(17);
        _approveRelayer(address(token), type(uint256).max);
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(ownerPk, _digest(s));
        bytes32 highS = bytes32(N - uint256(sg));
        uint8 flippedV = v == 27 ? 28 : 27;
        bytes memory malleable = abi.encodePacked(r, highS, flippedV);
        vm.expectRevert(abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureS.selector, highS));
        relayer.sweep(s, malleable);
        // the canonical low-s signature is accepted
        relayer.sweep(s, abi.encodePacked(r, sg, v));
    }

    // ------------------------------------------------------------------ order validation

    function test_amountNotGreaterThanFee_reverts() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(18);
        bytes memory sig = _sign(ownerPk, s);
        s.fee = s.amount;
        vm.expectRevert(IGhostPaySweepRelayer.InvalidAmount.selector);
        relayer.sweep(s, sig);
        s.fee = s.amount + 1;
        vm.expectRevert(IGhostPaySweepRelayer.InvalidAmount.selector);
        relayer.sweep(s, sig);
        s.amount = 0;
        s.fee = 0;
        vm.expectRevert(IGhostPaySweepRelayer.InvalidAmount.selector);
        relayer.sweep(s, sig);
    }

    function test_zeroAddresses_revert() public {
        IGhostPaySweepRelayer.Sweep memory s;
        bytes memory sig = new bytes(65);

        s = _sweep(19);
        s.destination = address(0);
        vm.expectRevert(IGhostPaySweepRelayer.ZeroAddress.selector);
        relayer.sweep(s, sig);
        s = _sweep(19);
        s.feeTo = address(0);
        vm.expectRevert(IGhostPaySweepRelayer.ZeroAddress.selector);
        relayer.sweep(s, sig);
        s = _sweep(19);
        s.owner = address(0);
        vm.expectRevert(IGhostPaySweepRelayer.ZeroAddress.selector);
        relayer.sweep(s, sig);
        s = _sweep(19);
        s.token = address(0);
        vm.expectRevert(IGhostPaySweepRelayer.ZeroAddress.selector);
        relayer.sweep(s, sig);
    }

    function test_selfAddresses_revert() public {
        IGhostPaySweepRelayer.Sweep memory s;
        bytes memory sig = new bytes(65);

        s = _sweep(20);
        s.destination = address(relayer);
        vm.expectRevert(IGhostPaySweepRelayer.SelfAddress.selector);
        relayer.sweep(s, sig);
        s = _sweep(20);
        s.feeTo = address(relayer);
        vm.expectRevert(IGhostPaySweepRelayer.SelfAddress.selector);
        relayer.sweep(s, sig);
        s = _sweep(20);
        s.owner = address(relayer);
        vm.expectRevert(IGhostPaySweepRelayer.SelfAddress.selector);
        relayer.sweep(s, sig);
        s = _sweep(20);
        s.token = address(relayer);
        vm.expectRevert(IGhostPaySweepRelayer.SelfAddress.selector);
        relayer.sweep(s, sig);
    }

    function test_destinationOrFeeToEqualsOwnerOrEachOther_revertBalanceDelta() public {
        _approveRelayer(address(token), type(uint256).max);
        IGhostPaySweepRelayer.Sweep memory s;
        bytes memory sig;

        s = _sweep(21);
        s.destination = owner;
        sig = _sign(ownerPk, s);
        vm.expectRevert(IGhostPaySweepRelayer.UnexpectedBalanceDelta.selector);
        relayer.sweep(s, sig);

        s = _sweep(22);
        s.feeTo = destination;
        sig = _sign(ownerPk, s);
        vm.expectRevert(IGhostPaySweepRelayer.UnexpectedBalanceDelta.selector);
        relayer.sweep(s, sig);

        s = _sweep(23);
        s.feeTo = owner;
        sig = _sign(ownerPk, s);
        vm.expectRevert(IGhostPaySweepRelayer.UnexpectedBalanceDelta.selector);
        relayer.sweep(s, sig);
    }

    // ------------------------------------------------------------------ nonces

    function test_nonceBitmap_isUnorderedAndPerOwner() public {
        _approveRelayer(address(token), type(uint256).max);
        uint256[5] memory ns = [uint256(0), 255, 256, 1 << 128, type(uint256).max];
        for (uint256 i; i < ns.length; i++) {
            assertFalse(relayer.nonceUsed(owner, ns[i]));
        }
        for (uint256 i; i < ns.length; i++) {
            IGhostPaySweepRelayer.Sweep memory s = _sweep(ns[i]);
            s.amount = 10e6;
            s.fee = 1e6;
            relayer.sweep(s, _sign(ownerPk, s));
            assertTrue(relayer.nonceUsed(owner, ns[i]));
        }
        // neighbours untouched
        assertFalse(relayer.nonceUsed(owner, 1));
        assertFalse(relayer.nonceUsed(owner, 254));
        assertFalse(relayer.nonceUsed(owner, 257));
        assertFalse(relayer.nonceUsed(makeAddr("otherOwner"), 0));
    }

    function test_nonceUnusedAfterFailedSweep() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(30);
        bytes memory sig = _sign(ownerPk, s);
        vm.expectRevert(); // no allowance
        relayer.sweep(s, sig);
        assertFalse(relayer.nonceUsed(owner, 30));
        _approveRelayer(address(token), AMOUNT);
        relayer.sweep(s, sig);
        assertTrue(relayer.nonceUsed(owner, 30));
    }

    // ------------------------------------------------------------------ token behaviours

    function _runWithToken(address t, bool expectOk, bytes memory err) internal {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(40);
        s.token = t;
        _approveRelayer(t, AMOUNT);
        bytes memory sig = _sign(ownerPk, s);
        if (!expectOk) {
            if (err.length == 0) vm.expectRevert();
            else vm.expectRevert(err);
        }
        relayer.sweep(s, sig);
    }

    function test_noReturnToken_works() public {
        NoReturnToken t = new NoReturnToken();
        t.mint(owner, AMOUNT);
        _runWithToken(address(t), true, "");
        assertEq(t.balanceOf(destination), AMOUNT - FEE);
        assertEq(t.balanceOf(feeTo), FEE);
    }

    function test_falseReturnToken_reverts() public {
        FalseReturnToken t = new FalseReturnToken();
        t.mint(owner, AMOUNT);
        // approve() does not exist on this mock; allowance() is unlimited.
        IGhostPaySweepRelayer.Sweep memory s = _sweep(41);
        s.token = address(t);
        bytes memory sig = _sign(ownerPk, s);
        vm.expectRevert(); // SafeERC20FailedOperation
        relayer.sweep(s, sig);
    }

    function test_feeOnTransferToken_reverts() public {
        FeeOnTransferToken t = new FeeOnTransferToken();
        t.mint(owner, 10_000e6);
        _runWithToken(
            address(t),
            false,
            abi.encodePacked(IGhostPaySweepRelayer.UnexpectedBalanceDelta.selector)
        );
    }

    function test_blacklistedDestination_reverts() public {
        BlacklistToken t = new BlacklistToken();
        t.mint(owner, AMOUNT);
        t.setBlacklisted(destination, true);
        _runWithToken(
            address(t),
            false,
            abi.encodeWithSelector(BlacklistToken.Blacklisted.selector, destination)
        );
    }

    function test_tokenWithoutCode_reverts() public {
        address eoa = makeAddr("eoaToken");
        IGhostPaySweepRelayer.Sweep memory s = _sweep(42);
        s.token = eoa;
        bytes memory sig = _sign(ownerPk, s);
        vm.expectRevert();
        relayer.sweep(s, sig);
    }

    function test_reentrantToken_cannotReenterRelayer() public {
        ReentrantToken t = new ReentrantToken();
        t.mint(owner, 3 * AMOUNT);
        _approveRelayer(address(t), 3 * AMOUNT);
        IGhostPaySweepRelayer.Sweep memory inner = _sweep(51);
        inner.token = address(t);
        IGhostPaySweepRelayer.Sweep memory outer = _sweep(50);
        outer.token = address(t);
        t.arm(
            address(relayer), abi.encodeCall(relayer.sweep, (inner, _sign(ownerPk, inner))), false
        );
        relayer.sweep(outer, _sign(ownerPk, outer));
        assertEq(t.attempts(), 1);
        assertFalse(t.lastSuccess());
        assertEq(bytes4(t.lastReturn()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertFalse(relayer.nonceUsed(owner, 51));
        assertTrue(relayer.nonceUsed(owner, 50));
        assertEq(t.balanceOf(destination), AMOUNT - FEE);
    }

    // ------------------------------------------------------------------ no value, no admin

    function test_noReceiveOrFallback() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(relayer).call{value: 1}("");
        assertFalse(ok);
        (ok,) = address(relayer).call(hex"deadbeef");
        assertFalse(ok);
        assertEq(address(relayer).balance, 0);
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_feeSplitAndConservation(uint96 amount, uint96 fee, uint256 nonce) public {
        amount = uint96(bound(amount, 1, 10_000e6));
        fee = uint96(bound(fee, 0, amount - 1));
        _approveRelayer(address(token), type(uint256).max);
        IGhostPaySweepRelayer.Sweep memory s = _sweep(nonce);
        s.amount = amount;
        s.fee = fee;
        relayer.sweep(s, _sign(ownerPk, s));
        assertEq(token.balanceOf(destination), amount - fee);
        assertEq(token.balanceOf(feeTo), fee);
        assertEq(token.balanceOf(owner), 10_000e6 - amount);
        assertEq(token.balanceOf(address(relayer)), 0);
    }

    function testFuzz_anyFieldTamperReverts(uint8 field, uint256 delta) public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(60);
        bytes memory sig = _sign(ownerPk, s);
        _approveRelayer(address(token), type(uint256).max);
        delta = bound(delta, 1, 1e12);
        field = field % 7;
        if (field == 0) {
            s.destination = address(uint160(s.destination) + uint160(delta));
        } else if (field == 1) {
            s.feeTo = address(uint160(s.feeTo) + uint160(delta));
        } else if (field == 2) {
            s.amount += delta;
        } else if (field == 3) {
            s.fee = (s.fee + delta) % s.amount == s.fee ? s.fee + 1 : (s.fee + delta) % s.amount;
        } else if (field == 4) {
            s.deadline += delta;
        } else if (field == 5) {
            s.nonce += delta;
        } else {
            s.token = address(uint160(s.token) + uint160(delta));
        }
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        relayer.sweep(s, sig);
    }

    function testFuzz_randomSignatureNeverAccepted(bytes calldata sig) public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(61);
        _approveRelayer(address(token), type(uint256).max);
        vm.expectRevert();
        relayer.sweep(s, sig);
        assertEq(token.balanceOf(destination), 0);
    }

    function testFuzz_signatureFromOtherKeyRejected(uint256 pk) public {
        pk = bound(pk, 1, N - 1);
        vm.assume(vm.addr(pk) != owner);
        IGhostPaySweepRelayer.Sweep memory s = _sweep(62);
        bytes memory sig = _sign(pk, s);
        _approveRelayer(address(token), type(uint256).max);
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        relayer.sweep(s, sig);
    }
}
