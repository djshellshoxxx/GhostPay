// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {
    IGhostPayShieldedPool,
    IGhostPayShieldedPoolERC20
} from "../src/interfaces/IGhostPayShieldedPool.sol";

import {GhostPayShieldedPoolERC20} from "../src/GhostPayShieldedPoolERC20.sol";

import {PoolBase} from "./PoolBase.t.sol";

/// SP-CON-8: sponsored deposits.
contract DepositWithPermitTest is PoolBase {
    uint256 internal constant N =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    address internal owner;
    uint256 internal ownerKey;
    address internal sponsor = makeAddr("sponsor");

    function setUp() public override {
        super.setUp();
        (owner, ownerKey) = makeAddrAndKey("stealthS1");
        token.mint(owner, 10_000);
    }

    function _auth(uint256 value, uint256 fee, uint256 nonce)
        internal
        returns (IGhostPayShieldedPoolERC20.DepositAuth memory a)
    {
        a = IGhostPayShieldedPoolERC20.DepositAuth({
            owner: owner,
            value: value,
            precommitment: _fresh(),
            feeTo: sponsor,
            sponsorFee: fee,
            deadline: block.timestamp + 1 hours,
            nonce: nonce
        });
    }

    function _digest(IGhostPayShieldedPoolERC20.DepositAuth memory a)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                pool.DEPOSIT_AUTH_TYPEHASH(),
                a.owner,
                a.value,
                a.precommitment,
                a.feeTo,
                a.sponsorFee,
                a.deadline,
                a.nonce
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", pool.DOMAIN_SEPARATOR(), structHash));
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _permit(uint256 value)
        internal
        view
        returns (IGhostPayShieldedPoolERC20.PermitSig memory ps)
    {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                owner,
                address(pool),
                value,
                token.nonces(owner),
                deadline
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
        ps = IGhostPayShieldedPoolERC20.PermitSig({
            value: value, deadline: deadline, v: v, r: r, s: s
        });
    }

    function test_domainSeparator() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("GhostPayShieldedPool"),
                keccak256("1"),
                block.chainid,
                address(pool)
            )
        );
        assertEq(pool.DOMAIN_SEPARATOR(), expected);
    }

    function test_happyPath() public {
        IGhostPayShieldedPoolERC20.DepositAuth memory a = _auth(1000, 30, 7);
        bytes memory sig = _sign(ownerKey, _digest(a));
        IGhostPayShieldedPoolERC20.PermitSig memory ps = _permit(1030);
        vm.prank(sponsor);
        (uint256 c, uint256 label) = pool.depositWithPermit(a, sig, ps);
        assertEq(pool.depositorOf(label), owner, "depositor is the signer, not the sponsor");
        assertEq(token.balanceOf(address(pool)), 1000);
        assertEq(token.balanceOf(sponsor), 30);
        assertEq(token.balanceOf(owner), 10_000 - 1030);
        assertEq(pool.currentRoot(), c);
        assertTrue(pool.nonceUsed(owner, 7));
        assertFalse(pool.nonceUsed(owner, 6));
        // Replay.
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayShieldedPoolERC20.NonceUsed.selector);
        pool.depositWithPermit(a, sig, ps);
    }

    function test_zeroSponsorFee() public {
        IGhostPayShieldedPoolERC20.DepositAuth memory a = _auth(1000, 0, 1);
        a.feeTo = address(0);
        bytes memory sig = _sign(ownerKey, _digest(a));
        vm.prank(sponsor);
        pool.depositWithPermit(a, sig, _permit(1000));
        assertEq(token.balanceOf(address(pool)), 1000);
    }

    function test_frontRunPermitDoesNotBlock() public {
        IGhostPayShieldedPoolERC20.DepositAuth memory a = _auth(1000, 30, 1);
        bytes memory sig = _sign(ownerKey, _digest(a));
        IGhostPayShieldedPoolERC20.PermitSig memory ps = _permit(1030);
        // Attacker submits the permit first.
        token.permit(owner, address(pool), ps.value, ps.deadline, ps.v, ps.r, ps.s);
        vm.prank(sponsor);
        pool.depositWithPermit(a, sig, ps);
        assertEq(token.balanceOf(address(pool)), 1000);
    }

    function test_noPermitButAllowance() public {
        vm.prank(owner);
        token.approve(address(pool), 1030);
        IGhostPayShieldedPoolERC20.DepositAuth memory a = _auth(1000, 30, 1);
        bytes memory sig = _sign(ownerKey, _digest(a));
        IGhostPayShieldedPoolERC20.PermitSig memory junk;
        vm.prank(sponsor);
        pool.depositWithPermit(a, sig, junk);
        assertEq(token.balanceOf(sponsor), 30);
    }

    function test_sponsorCannotAlterSignedFields() public {
        IGhostPayShieldedPoolERC20.DepositAuth memory a = _auth(1000, 30, 1);
        bytes memory sig = _sign(ownerKey, _digest(a));
        IGhostPayShieldedPoolERC20.PermitSig memory ps = _permit(1030);
        for (uint256 i; i < 7; ++i) {
            IGhostPayShieldedPoolERC20.DepositAuth memory t = IGhostPayShieldedPoolERC20.DepositAuth({
                owner: a.owner,
                value: a.value,
                precommitment: a.precommitment,
                feeTo: a.feeTo,
                sponsorFee: a.sponsorFee,
                deadline: a.deadline,
                nonce: a.nonce
            });
            if (i == 0) t.value = 999;
            if (i == 1) t.precommitment = a.precommitment + 1;
            if (i == 2) t.feeTo = bob;
            if (i == 3) t.sponsorFee = 31;
            if (i == 4) t.deadline = a.deadline + 1;
            if (i == 5) t.nonce = 2;
            if (i == 6) t.owner = bob;
            vm.prank(sponsor);
            vm.expectRevert(IGhostPayShieldedPoolERC20.InvalidSignature.selector);
            pool.depositWithPermit(t, sig, ps);
        }
        // Nonce was not burnt by the failed attempts.
        assertFalse(pool.nonceUsed(owner, 1));
    }

    function test_signatureChecks() public {
        IGhostPayShieldedPoolERC20.DepositAuth memory a = _auth(1000, 30, 1);
        bytes32 digest = _digest(a);
        IGhostPayShieldedPoolERC20.PermitSig memory ps = _permit(1030);
        // Wrong signer.
        bytes memory sig = _sign(aliceKey, digest);
        vm.expectRevert(IGhostPayShieldedPoolERC20.InvalidSignature.selector);
        pool.depositWithPermit(a, sig, ps);
        // High-s (malleated) signature.
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
        bytes memory high =
            abi.encodePacked(r, bytes32(N - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        vm.expectRevert(IGhostPayShieldedPoolERC20.InvalidSignature.selector);
        pool.depositWithPermit(a, high, ps);
        // Wrong length.
        vm.expectRevert(IGhostPayShieldedPoolERC20.InvalidSignature.selector);
        pool.depositWithPermit(a, abi.encodePacked(r, s), ps);
        // Garbage.
        vm.expectRevert(IGhostPayShieldedPoolERC20.InvalidSignature.selector);
        pool.depositWithPermit(a, new bytes(65), ps);
    }

    function test_otherChecks() public {
        IGhostPayShieldedPoolERC20.DepositAuth memory a = _auth(1000, 30, 1);
        bytes memory sig = _sign(ownerKey, _digest(a));
        IGhostPayShieldedPoolERC20.PermitSig memory ps = _permit(1030);
        vm.warp(a.deadline + 1);
        vm.expectRevert(IGhostPayShieldedPool.Expired.selector);
        pool.depositWithPermit(a, sig, ps);
        vm.warp(a.deadline);

        bytes memory sig2;
        IGhostPayShieldedPoolERC20.DepositAuth memory z = _auth(1000, 30, 1);
        z.owner = address(0);
        vm.expectRevert(IGhostPayShieldedPool.ZeroAddress.selector);
        pool.depositWithPermit(z, sig, ps);

        z = _auth(1000, 30, 1);
        z.feeTo = address(0);
        sig2 = _sign(ownerKey, _digest(z));
        vm.expectRevert(IGhostPayShieldedPool.InvalidRecipient.selector);
        pool.depositWithPermit(z, sig2, ps);

        z = _auth(1000, 30, 1);
        z.feeTo = address(pool);
        sig2 = _sign(ownerKey, _digest(z));
        vm.expectRevert(IGhostPayShieldedPool.InvalidRecipient.selector);
        pool.depositWithPermit(z, sig2, ps);

        z = _auth(0, 0, 1);
        sig2 = _sign(ownerKey, _digest(z));
        vm.expectRevert(IGhostPayShieldedPool.InvalidValue.selector);
        pool.depositWithPermit(z, sig2, ps);

        z = _auth(1000, 0, 1);
        z.precommitment = P;
        sig2 = _sign(ownerKey, _digest(z));
        vm.expectRevert(IGhostPayShieldedPool.InvalidPrecommitment.selector);
        pool.depositWithPermit(z, sig2, ps);

        // feeTo == owner: the sponsor fee would be a self-transfer; rejected by the delta check.
        z = _auth(1000, 30, 1);
        z.feeTo = owner;
        sig2 = _sign(ownerKey, _digest(z));
        vm.expectRevert(IGhostPayShieldedPool.UnexpectedBalanceDelta.selector);
        pool.depositWithPermit(z, sig2, ps);

        // Succeeds exactly at the deadline.
        pool.depositWithPermit(a, sig, ps);
    }

    function test_crossPoolReplayRejected() public {
        // Same owner signature on another pool (different verifyingContract) is invalid.
        IGhostPayShieldedPoolERC20.DepositAuth memory a = _auth(1000, 0, 1);
        bytes memory sig = _sign(ownerKey, _digest(a));
        IGhostPayShieldedPoolERC20 other = IGhostPayShieldedPoolERC20(
            address(new GhostPayShieldedPoolERC20(_config(address(token), 0)))
        );
        IGhostPayShieldedPoolERC20.PermitSig memory junk;
        vm.expectRevert(IGhostPayShieldedPoolERC20.InvalidSignature.selector);
        other.depositWithPermit(a, sig, junk);
        // And on another chain id the domain changes too.
        vm.chainId(84_532);
        vm.expectRevert(IGhostPayShieldedPoolERC20.InvalidSignature.selector);
        pool.depositWithPermit(a, sig, junk);
    }
}
