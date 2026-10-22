// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IGhostPayShieldedPool} from "../src/interfaces/IGhostPayShieldedPool.sol";

import {PoolBase} from "./PoolBase.t.sol";

/// SP-CON-2/3/12 fuzzing (default profile: 10 000 runs each).
contract GhostPayShieldedPoolFuzzTest is PoolBase {
    function setUp() public override {
        super.setUp();
        _deposit(pool, alice, 100_000);
        _deposit(pool, bob, 100_000);
    }

    /// SP-CON-3: changing any bound field (recipient, relayer, fee, feeTo, deadline, ASP publisher,
    /// announce) of a validly proven withdrawal never succeeds and moves no funds.
    function testFuzz_tamperedWithdrawalNeverPays(uint8 field, uint256 v, address a) public {
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 10);
        uint256 nh = _fresh();
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 1000, nh, _fresh());

        IGhostPayShieldedPool.Withdrawal memory t = _w(recipient, 10);
        uint256 f = field % 7;
        if (f == 0) {
            vm.assume(a != recipient);
            t.recipient = a;
        } else if (f == 1) {
            vm.assume(a != relayer);
            t.relayer = a;
        } else if (f == 2) {
            vm.assume(v != 10);
            t.relayerFee = v;
        } else if (f == 3) {
            vm.assume(a != feeTo);
            t.feeTo = a;
        } else if (f == 4) {
            vm.assume(v != t.deadline);
            t.deadline = v;
        } else if (f == 5) {
            vm.assume(a != address(0));
            t.aspPublisher = a;
        } else {
            t.announce = abi.encodePacked(v);
        }
        uint256 poolBal = token.balanceOf(address(pool));
        address sender = t.relayer == address(0) ? relayer : t.relayer;
        vm.prank(sender);
        try pool.withdraw(t, pr) {
            fail();
        } catch {}
        assertEq(token.balanceOf(address(pool)), poolBal);
        assertFalse(pool.nullifierSpent(nh));
        // The untampered withdrawal still works.
        _withdraw(pool, w, pr);
        assertTrue(pool.nullifierSpent(nh));
    }

    /// SP-CON-3: a tampered public signal (value, root, nullifier, change commitment, ASP fields,
    /// context) without a matching proof is rejected.
    function testFuzz_tamperedSignalRejected(uint8 idx, uint256 v) public {
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 1000, _fresh(), _fresh());
        uint256 i = idx % 9;
        vm.assume(pr.pubSignals[i] != v);
        IGhostPayShieldedPool.WithdrawProof memory t = _copy(pr);
        t.pubSignals[i] = v;
        uint256 poolBal = token.balanceOf(address(pool));
        vm.prank(relayer);
        try pool.withdraw(w, t) {
            fail();
        } catch {}
        assertEq(token.balanceOf(address(pool)), poolBal);
    }

    /// Only the bound relayer may submit.
    function testFuzz_relayerBinding(address sender) public {
        vm.assume(sender != relayer);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 1000, _fresh(), _fresh());
        vm.prank(sender);
        vm.expectRevert(IGhostPayShieldedPool.InvalidRelayer.selector);
        pool.withdraw(w, pr);
    }

    /// Fee bound: accepted iff fee <= value * MAX_RELAYER_FEE_BPS / 10_000; value conserved.
    function testFuzz_feeBound(uint256 value, uint256 fee) public {
        value = bound(value, 1, 200_000);
        fee = bound(fee, 0, value);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, fee);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, value, _fresh(), _fresh());
        uint256 poolBal = token.balanceOf(address(pool));
        vm.prank(relayer);
        if (fee > value * FEE_BPS / 10_000) {
            vm.expectRevert(IGhostPayShieldedPool.FeeTooHigh.selector);
            pool.withdraw(w, pr);
            return;
        }
        pool.withdraw(w, pr);
        assertEq(token.balanceOf(recipient), value - fee);
        assertEq(token.balanceOf(feeTo), fee);
        assertEq(token.balanceOf(address(pool)), poolBal - value);
    }

    /// SP-CON-12: deposit bounds.
    function testFuzz_depositBounds(uint256 value, uint256 pre) public {
        value = bound(value, 0, MAX_DEPOSIT * 2);
        token.mint(alice, value);
        vm.prank(alice);
        if (value == 0) {
            vm.expectRevert(IGhostPayShieldedPool.InvalidValue.selector);
        } else if (value > MAX_DEPOSIT) {
            vm.expectRevert(IGhostPayShieldedPool.DepositCapExceeded.selector);
        } else if (pre == 0 || pre >= P) {
            vm.expectRevert(IGhostPayShieldedPool.InvalidPrecommitment.selector);
        }
        pool.deposit(value, pre);
    }

    /// SP-CON-9: the announced amount must be exactly the net paid to the recipient.
    function testFuzz_announceAmount(uint256 amount, uint256 fee) public {
        fee = bound(fee, 0, 50);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, fee);
        bytes memory key = new bytes(33);
        key[0] = 0x02;
        w.announce = abi.encode(
            key, abi.encodePacked(bytes1(0x01), bytes4(0xa9059cbb), address(token), amount)
        );
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 1000, _fresh(), _fresh());
        vm.prank(relayer);
        if (amount != 1000 - fee) vm.expectRevert(IGhostPayShieldedPool.InvalidAnnounce.selector);
        pool.withdraw(w, pr);
    }
}
