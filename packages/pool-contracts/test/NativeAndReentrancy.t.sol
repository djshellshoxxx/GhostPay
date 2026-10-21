// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {GhostPayShieldedPoolERC20} from "../src/GhostPayShieldedPoolERC20.sol";
import {GhostPayShieldedPoolNative} from "../src/GhostPayShieldedPoolNative.sol";
import {IGhostPayShieldedPool} from "../src/interfaces/IGhostPayShieldedPool.sol";

import {PoolBase} from "./PoolBase.t.sol";
import {ReentrantReceiver, RevertingReceiver, GasBurnReceiver} from "./mocks/NativeReceivers.sol";
import {ReentrantToken} from "./mocks/ReentrantToken.sol";

/// SP-CON-7 and the native pool.
contract NativeAndReentrancyTest is PoolBase {
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    GhostPayShieldedPoolNative internal npool;

    function setUp() public override {
        super.setUp();
        npool = new GhostPayShieldedPoolNative(_config(address(0), 0));
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function test_native_depositWithdrawRagequit() public {
        assertEq(npool.ASSET(), address(0));
        assertEq(
            npool.SCOPE(),
            uint256(keccak256(abi.encode(address(npool), block.chainid, address(0)))) % P
        );
        (uint256 c, uint256 label) = _deposit(npool, alice, 1 ether);
        _deposit(npool, bob, 2 ether);
        assertEq(address(npool).balance, 3 ether);

        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0.01 ether);
        IGhostPayShieldedPool.WithdrawProof memory pr =
            _proof(npool, w, 1.5 ether, _fresh(), _fresh());
        _withdraw(npool, w, pr);
        assertEq(recipient.balance, 1.49 ether);
        assertEq(feeTo.balance, 0.01 ether);

        IGhostPayShieldedPool.RagequitProof memory rq = _rqProof(c, _fresh(), 1 ether, label);
        uint256 before = alice.balance;
        vm.prank(alice);
        npool.ragequit(rq);
        assertEq(alice.balance, before + 1 ether);
        assertEq(address(npool).balance, 0.5 ether);
    }

    function test_native_msgValueMismatch() public {
        vm.startPrank(alice);
        vm.expectRevert(IGhostPayShieldedPool.InvalidValue.selector);
        npool.deposit{value: 1}(2, 1);
        vm.expectRevert(IGhostPayShieldedPool.InvalidValue.selector);
        npool.deposit{value: 3}(2, 1);
        vm.expectRevert(IGhostPayShieldedPool.InvalidValue.selector);
        npool.deposit(2, 1);
        vm.stopPrank();
    }

    function test_native_announceMarker() public {
        _deposit(npool, alice, 1 ether);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
        bytes memory key = new bytes(33);
        key[0] = 0x03;
        bytes memory meta = abi.encodePacked(
            bytes1(0x11),
            bytes4(0xeeeeeeee),
            address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE),
            uint256(1 ether)
        );
        w.announce = abi.encode(key, meta);
        IGhostPayShieldedPool.WithdrawProof memory pr =
            _proof(npool, w, 1 ether, _fresh(), _fresh());
        vm.expectEmit(address(announcer));
        emit Announcement(1, recipient, address(npool), key, meta);
        _withdraw(npool, w, pr);

        // ERC-20 marker on the native pool is rejected.
        _deposit(npool, alice, 1 ether);
        IGhostPayShieldedPool.Withdrawal memory w2 = _w(recipient, 0);
        w2.announce = abi.encode(
            key, abi.encodePacked(bytes1(0x11), bytes4(0xa9059cbb), address(0), uint256(1 ether))
        );
        IGhostPayShieldedPool.WithdrawProof memory pr2 =
            _proof(npool, w2, 1 ether, _fresh(), _fresh());
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.InvalidAnnounce.selector);
        npool.withdraw(w2, pr2);
    }

    function test_native_revertingRecipient() public {
        _deposit(npool, alice, 1 ether);
        RevertingReceiver r = new RevertingReceiver();
        IGhostPayShieldedPool.Withdrawal memory w = _w(address(r), 0);
        uint256 nh = _fresh();
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(npool, w, 1 ether, nh, _fresh());
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.NativeTransferFailed.selector);
        npool.withdraw(w, pr);
        assertFalse(npool.nullifierSpent(nh));
    }

    function test_native_gasBurningRecipientRevertsAtomically() public {
        _deposit(npool, alice, 1 ether);
        GasBurnReceiver r = new GasBurnReceiver();
        IGhostPayShieldedPool.Withdrawal memory w = _w(address(r), 0);
        uint256 nh = _fresh();
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(npool, w, 1 ether, nh, _fresh());
        vm.prank(relayer);
        (bool ok,) = address(npool).call{gas: 1_000_000}(
            abi.encodeCall(IGhostPayShieldedPool.withdraw, (w, pr))
        );
        assertFalse(ok);
        assertFalse(npool.nullifierSpent(nh));
    }

    /// A recipient contract that re-enters withdraw / ragequit / deposit during its payout.
    function test_native_reentrantRecipient() public {
        _deposit(npool, alice, 1 ether);
        _deposit(npool, bob, 1 ether);
        ReentrantReceiver r = new ReentrantReceiver();
        vm.deal(address(r), 1 ether);

        IGhostPayShieldedPool.Withdrawal memory w = _w(address(r), 0);
        w.relayer = address(0);
        IGhostPayShieldedPool.WithdrawProof memory pr =
            _proof(npool, w, 0.5 ether, _fresh(), _fresh());
        // Second, independently valid withdrawal attempted from inside the callback.
        IGhostPayShieldedPool.Withdrawal memory w2 = _w(address(r), 0);
        w2.relayer = address(0);
        w2.deadline += 1;
        IGhostPayShieldedPool.WithdrawProof memory pr2 =
            _proof(npool, w2, 0.5 ether, _fresh(), _fresh());
        bytes[3] memory attacks = [
            abi.encodeCall(IGhostPayShieldedPool.withdraw, (w2, pr2)),
            abi.encodeCall(IGhostPayShieldedPool.withdraw, (w, pr)), // same nullifier
            abi.encodeCall(IGhostPayShieldedPool.deposit, (1, 1))
        ];
        for (uint256 i; i < 3; ++i) {
            uint256 snap = vm.snapshotState();
            r.arm(address(npool), attacks[i], i == 2 ? 1 : 0, false);
            npool.withdraw(w, pr);
            assertFalse(r.lastSuccess(), "reentrant call must fail");
            assertEq(r.attempts(), 1);
            assertEq(address(npool).balance, 1.5 ether);
            vm.revertToState(snap);
        }
        // With bubbling, the payout fails and the whole withdrawal reverts (no revert data is copied).
        r.arm(address(npool), attacks[0], 0, true);
        vm.expectRevert(IGhostPayShieldedPool.NativeTransferFailed.selector);
        npool.withdraw(w, pr);
    }

    /// ERC-777-style token hook re-entering during the pull (deposit) and the push (withdraw).
    function test_erc20_reentrantToken() public {
        ReentrantToken rt = new ReentrantToken();
        GhostPayShieldedPoolERC20 p = new GhostPayShieldedPoolERC20(_config(address(rt), 0));
        rt.mint(alice, 10_000);
        vm.prank(alice);
        rt.approve(address(p), type(uint256).max);
        _deposit(p, alice, 1000);
        _deposit(p, alice, 1000);

        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
        w.relayer = address(0);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(p, w, 600, _fresh(), _fresh());
        IGhostPayShieldedPool.Withdrawal memory w2 = _w(recipient, 0);
        w2.relayer = address(0);
        w2.deadline += 5;
        IGhostPayShieldedPool.WithdrawProof memory pr2 = _proof(p, w2, 600, _fresh(), _fresh());

        // Hook on push: re-entering withdraw fails with the reentrancy error.
        rt.setHookTransfer(true);
        rt.arm(address(p), abi.encodeCall(IGhostPayShieldedPool.withdraw, (w2, pr2)), false);
        p.withdraw(w, pr);
        assertFalse(rt.lastSuccess());
        assertEq(bytes4(rt.lastReturn()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(rt.balanceOf(address(p)), 1400);
        assertEq(rt.balanceOf(recipient), 600);

        // Hook on pull: re-entering deposit during deposit fails; with bubbling the deposit reverts.
        rt.arm(address(p), abi.encodeCall(IGhostPayShieldedPool.deposit, (5, 5)), true);
        vm.prank(alice);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        p.deposit(5, 6);
    }
}
