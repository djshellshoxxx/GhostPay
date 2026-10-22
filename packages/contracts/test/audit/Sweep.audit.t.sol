// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SweepBase} from "../SweepBase.t.sol";
import {GhostPaySweepRelayer} from "../../src/GhostPaySweepRelayer.sol";
import {IGhostPaySweepRelayer} from "../../src/interfaces/IGhostPaySweepRelayer.sol";

/// @dev Token whose permit() burns almost all gas and then succeeds (swallowed by try/catch).
contract GasBurnPermitToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function permit(address, address, uint256, uint256, uint8, bytes32, bytes32) external view {
        uint256 i;
        while (gasleft() > 200_000) {
            unchecked {
                ++i;
            }
        }
    }

    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[t] += a;
        return true;
    }
}

/// @notice Adversarial tests for GhostPaySweepRelayer.
contract SweepAuditTest is SweepBase {
    // ---------------------------------------------------------------- S-01 relayer gas/fee griefing by owner

    /// @dev The owner (who needs a little native gas) can invalidate a sponsored sweep after the relayer has
    /// simulated it successfully, by moving the tokens away (or spending the allowance). The relayer's
    /// transaction reverts: gas wasted, no fee. There is no on-chain cancel for a signed order either.
    function test_EXPLOIT_ownerDodgesFeeAndWastesRelayerGas() public {
        _approveRelayer(address(token), type(uint256).max);
        IGhostPaySweepRelayer.Sweep memory s = _sweep(1);
        bytes memory sig = _sign(ownerPk, s);

        // Relayer simulates: OK (state snapshot).
        uint256 snap = vm.snapshotState();
        vm.prank(submitter);
        relayer.sweep(s, sig);
        vm.revertToState(snap);

        // Owner front-runs with a plain transfer of everything to himself (second address).
        address elsewhere = makeAddr("elsewhere");
        uint256 bal = token.balanceOf(owner);
        vm.prank(owner);
        token.transfer(elsewhere, bal);

        vm.prank(submitter);
        vm.expectRevert(); // ERC20InsufficientBalance
        relayer.sweep(s, sig);
        assertEq(token.balanceOf(feeTo), 0, "relayer earned nothing");
        assertFalse(relayer.nonceUsed(owner, 1), "revert rolled the nonce back");
    }

    // ---------------------------------------------------------------- S-02 signature encodings / nonce edges

    /// @dev OZ 5.6.1 `ECDSA.recover(bytes32,bytes)` only accepts 65-byte signatures: EIP-2098 compact
    /// encodings are rejected, so each signature has exactly one byte encoding (plus the nonce guard).
    function test_eip2098CompactSignatureRejected() public {
        _approveRelayer(address(token), type(uint256).max);
        IGhostPaySweepRelayer.Sweep memory s = _sweep(7);
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(ownerPk, _digest(s));
        bytes32 vs = bytes32(uint256(sg) | (uint256(v - 27) << 255));
        bytes memory sig64 = abi.encodePacked(r, vs);
        vm.prank(submitter);
        vm.expectRevert(abi.encodeWithSignature("ECDSAInvalidSignatureLength(uint256)", 64));
        relayer.sweep(s, sig64);
    }

    function test_highS_rejected() public {
        _approveRelayer(address(token), type(uint256).max);
        IGhostPaySweepRelayer.Sweep memory s = _sweep(8);
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(ownerPk, _digest(s));
        bytes32 highS = bytes32(N - uint256(sg));
        uint8 flipped = v == 27 ? 28 : 27;
        vm.prank(submitter);
        vm.expectRevert(); // ECDSAInvalidSignatureS
        relayer.sweep(s, abi.encodePacked(r, highS, flipped));
    }

    function test_nonceMaxUint_works_once() public {
        _approveRelayer(address(token), type(uint256).max);
        IGhostPaySweepRelayer.Sweep memory s = _sweep(type(uint256).max);
        bytes memory sig = _sign(ownerPk, s);
        assertFalse(relayer.nonceUsed(owner, type(uint256).max));
        vm.prank(submitter);
        relayer.sweep(s, sig);
        assertTrue(relayer.nonceUsed(owner, type(uint256).max));
        assertFalse(relayer.nonceUsed(owner, type(uint256).max - 1));
        vm.prank(submitter);
        vm.expectRevert(IGhostPaySweepRelayer.NonceAlreadyUsed.selector);
        relayer.sweep(s, sig);
    }

    function test_garbageSignature_neverRecoversZero() public {
        _approveRelayer(address(token), type(uint256).max);
        IGhostPaySweepRelayer.Sweep memory s = _sweep(9);
        vm.prank(submitter);
        vm.expectRevert(); // ECDSAInvalidSignature (r = s = 0)
        relayer.sweep(s, abi.encodePacked(bytes32(0), bytes32(0), uint8(27)));
        s.owner = address(0);
        vm.prank(submitter);
        vm.expectRevert(IGhostPaySweepRelayer.ZeroAddress.selector);
        relayer.sweep(s, abi.encodePacked(bytes32(0), bytes32(0), uint8(27)));
    }

    // ---------------------------------------------------------------- S-03 domain separation

    function test_crossRelayerAndCrossChainReplayRejected() public {
        _approveRelayer(address(token), type(uint256).max);
        IGhostPaySweepRelayer.Sweep memory s = _sweep(10);
        bytes memory sig = _sign(ownerPk, s);

        GhostPaySweepRelayer other = new GhostPaySweepRelayer();
        vm.prank(owner);
        token.approve(address(other), type(uint256).max);
        vm.prank(submitter);
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        other.sweep(s, sig);

        // vm.getChainId: under --ir-minimum block.chainid is re-read after vm.chainId.
        uint256 originalChain = vm.getChainId();
        vm.chainId(originalChain + 1);
        vm.prank(submitter);
        vm.expectRevert(IGhostPaySweepRelayer.InvalidSignature.selector);
        relayer.sweep(s, sig);
        vm.chainId(originalChain);
        vm.prank(submitter);
        relayer.sweep(s, sig);
    }

    // ---------------------------------------------------------------- S-04 destination / feeTo aliasing

    function test_aliasing_destinationFeeToOwner_failClosed() public {
        _approveRelayer(address(token), type(uint256).max);
        IGhostPaySweepRelayer.Sweep memory s = _sweep(12);
        s.destination = feeTo;
        bytes memory sig = _sign(ownerPk, s);
        vm.prank(submitter);
        vm.expectRevert(IGhostPaySweepRelayer.UnexpectedBalanceDelta.selector);
        relayer.sweep(s, sig);

        s = _sweep(13);
        s.destination = owner;
        sig = _sign(ownerPk, s);
        vm.prank(submitter);
        vm.expectRevert(IGhostPaySweepRelayer.UnexpectedBalanceDelta.selector);
        relayer.sweep(s, sig);

        s = _sweep(14);
        s.feeTo = owner;
        sig = _sign(ownerPk, s);
        vm.prank(submitter);
        vm.expectRevert(IGhostPaySweepRelayer.UnexpectedBalanceDelta.selector);
        relayer.sweep(s, sig);
    }

    // ---------------------------------------------------------------- S-05 MEV

    /// @dev A searcher that copies the relayer's calldata can only pay the relayer's own fee to the relayer's
    /// own feeTo; the original transaction then reverts on the nonce. No value can be diverted.
    function test_frontRunCopy_paysOriginalFeeTo_noDiversion() public {
        _approveRelayer(address(token), type(uint256).max);
        IGhostPaySweepRelayer.Sweep memory s = _sweep(15);
        bytes memory sig = _sign(ownerPk, s);
        address searcher = makeAddr("searcher");
        vm.prank(searcher);
        relayer.sweep(s, sig);
        assertEq(token.balanceOf(feeTo), FEE);
        assertEq(token.balanceOf(searcher), 0);
        assertEq(token.balanceOf(destination), AMOUNT - FEE);
        vm.prank(submitter);
        vm.expectRevert(IGhostPaySweepRelayer.NonceAlreadyUsed.selector);
        relayer.sweep(s, sig);
    }

    /// @dev sweepWithPermit leaves `permit.value - amount` allowance behind (not bound to the sweep signature).
    function test_residualAllowanceAfterPermitSweep() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(16);
        bytes memory sig = _sign(ownerPk, s);
        IGhostPaySweepRelayer.PermitSig memory p =
            _permit(token, ownerPk, owner, type(uint256).max, block.timestamp + 1 hours);
        vm.prank(submitter);
        relayer.sweepWithPermit(s, sig, p);
        assertEq(
            token.allowance(owner, address(relayer)),
            type(uint256).max - 0,
            "infinite permits stay infinite"
        );
        // But still unusable without a fresh owner signature:
        vm.prank(submitter);
        vm.expectRevert();
        relayer.sweep(_sweep(17), sig);
    }

    /// @dev A malicious token can burn nearly all gas in permit() (swallowed by try/catch); the relayer pays.
    function test_EXPLOIT_hostileTokenBurnsRelayerGas() public {
        GasBurnPermitToken t = new GasBurnPermitToken();
        t.mint(owner, 10_000e6);
        IGhostPaySweepRelayer.Sweep memory s = _sweep(18);
        s.token = address(t);
        bytes memory sig = _sign(ownerPk, s);
        IGhostPaySweepRelayer.PermitSig memory p = IGhostPaySweepRelayer.PermitSig({
            value: AMOUNT, deadline: block.timestamp + 1, v: 27, r: 0, s: 0
        });
        vm.prank(owner);
        t.approve(address(relayer), type(uint256).max);
        uint256 g = gasleft();
        vm.prank(submitter);
        relayer.sweepWithPermit{gas: 20_000_000}(s, sig, p);
        uint256 used = g - gasleft();
        emit log_named_uint("gas burned by hostile permit()", used);
        assertGt(used, 15_000_000);
    }
}
