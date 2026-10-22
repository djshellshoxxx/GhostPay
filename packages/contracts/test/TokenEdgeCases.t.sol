// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Base} from "./Base.t.sol";
import {SweepBase} from "./SweepBase.t.sol";
import {IGhostPayRouter} from "../src/interfaces/IGhostPayRouter.sol";
import {IGhostPaySweepRelayer} from "../src/interfaces/IGhostPaySweepRelayer.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {RebasingToken} from "./mocks/RebasingToken.sol";

/// @notice Router behaviour with rebasing tokens and tokens at extreme decimals (audit G-29 / C-24).
contract RouterTokenEdgeCasesTest is Base {
    uint256 internal deadline = 1_700_003_600;

    function _pay(IERC20 t, uint256 gross) internal {
        uint256 net = gross - _fee(gross);
        vm.prank(alice);
        router.payERC20(t, stealth, gross, net, deadline, _eph(), _erc20Meta(address(t), net));
    }

    function _rebasing(uint256 idx, uint256 bal) internal returns (RebasingToken t) {
        t = new RebasingToken();
        t.rebase(idx);
        t.mint(alice, bal);
        vm.prank(alice);
        t.approve(address(router), type(uint256).max);
    }

    // ---- rebasing

    function test_rebasing_neutralIndex_behavesLikeStandardToken() public {
        RebasingToken t = _rebasing(1e18, 10 ether);
        _pay(t, 1 ether);
        assertEq(t.balanceOf(stealth), 1 ether - _fee(1 ether));
        assertEq(t.balanceOf(feeRecipient), _fee(1 ether));
        assertEq(t.balanceOf(address(router)), 0);
    }

    function test_rebasing_nonNeutralIndex_failsClosedOrExact() public {
        // Share rounding makes receivers gain a few wei beyond nominal: exact-delta check must revert, never
        // accept a mismatch and never strand tokens in the router.
        RebasingToken t = _rebasing(1.37e18, 10 ether);
        uint256 gross = 1_000_000_007;
        uint256 net = gross - _fee(gross);
        vm.prank(alice);
        try router.payERC20(t, stealth, gross, net, deadline, _eph(), _erc20Meta(address(t), net)) {
            assertEq(t.balanceOf(stealth), net);
            assertEq(t.balanceOf(feeRecipient), _fee(gross));
        } catch (bytes memory err) {
            assertEq(bytes4(err), IGhostPayRouter.UnexpectedBalanceDelta.selector);
        }
        assertEq(t.balanceOf(address(router)), 0);
    }

    function test_rebasing_rebaseInsideTransfer_reverts() public {
        RebasingToken t = _rebasing(1e18, 10 ether);
        t.setRebaseOnTransfer(true);
        uint256 gross = 1 ether;
        uint256 net = gross - _fee(gross);
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.UnexpectedBalanceDelta.selector);
        router.payERC20(t, stealth, gross, net, deadline, _eph(), _erc20Meta(address(t), net));
        assertEq(t.balanceOf(address(router)), 0);
    }

    function test_rebasing_negativeRebaseBeforePay_balanceShortReverts() public {
        RebasingToken t = _rebasing(1e18, 1 ether);
        t.rebase(0.5e18); // alice now holds 0.5 ether
        uint256 gross = 1 ether;
        uint256 net = gross - _fee(gross);
        vm.prank(alice);
        vm.expectRevert();
        router.payERC20(t, stealth, gross, net, deadline, _eph(), _erc20Meta(address(t), net));
    }

    // ---- extreme decimals

    function _decimalsCase(uint8 dec, uint256 gross) internal {
        MockERC20 t = new MockERC20("X", "X", dec);
        t.mint(alice, gross);
        vm.prank(alice);
        t.approve(address(router), gross);
        _pay(t, gross);
        assertEq(t.balanceOf(stealth), gross - _fee(gross));
        assertEq(t.balanceOf(feeRecipient), _fee(gross));
        assertEq(t.balanceOf(address(router)), 0);
        assertEq(t.balanceOf(stealth) + t.balanceOf(feeRecipient), gross);
    }

    function test_decimals0_dustHasNoFee() public {
        _decimalsCase(0, 399); // 399 * 25 / 10_000 == 0: fee-free dust, net == gross
        assertEq(_fee(399), 0);
    }

    function test_decimals0_firstFeeBearingAmount() public {
        _decimalsCase(0, 400);
        assertEq(_fee(400), 1);
    }

    function test_decimals2() public {
        _decimalsCase(2, 123_456);
    }

    function test_decimals36() public {
        _decimalsCase(36, 5e36);
    }

    function test_decimals77() public {
        _decimalsCase(77, type(uint128).max);
    }

    function test_decimals255_largeAmount() public {
        _decimalsCase(255, type(uint256).max / 10_000); // gross * 25 stays below 2^256
    }

    function test_grossAboveMulOverflow_revertsPanic() public {
        MockERC20 t = new MockERC20("X", "X", 18);
        uint256 gross = type(uint256).max / 25 + 1; // gross * 25 overflows
        vm.prank(alice);
        vm.expectRevert(); // Panic(0x11)
        router.payERC20(t, stealth, gross, 0, deadline, _eph(), _erc20Meta(address(t), gross));
    }

    function testFuzz_anyDecimals_conservation(uint8 dec, uint128 gross) public {
        gross = uint128(bound(gross, 1, type(uint128).max));
        _decimalsCase(dec, gross);
    }
}

/// @notice Sweep relayer behaviour with rebasing tokens.
contract SweepTokenEdgeCasesTest is SweepBase {
    function _run(RebasingToken t) internal returns (bool ok, bytes memory err) {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(77);
        s.token = address(t);
        vm.prank(owner);
        t.approve(address(relayer), type(uint256).max);
        bytes memory sig = _sign(ownerPk, s);
        try relayer.sweep(s, sig) {
            ok = true;
        } catch (bytes memory e) {
            err = e;
        }
    }

    function test_rebasing_neutral_sweeps() public {
        RebasingToken t = new RebasingToken();
        t.mint(owner, AMOUNT);
        (bool ok,) = _run(t);
        assertTrue(ok);
        assertEq(t.balanceOf(destination), AMOUNT - FEE);
        assertEq(t.balanceOf(feeTo), FEE);
        assertEq(t.balanceOf(address(relayer)), 0);
    }

    function test_rebasing_rebaseInsideTransfer_reverts() public {
        RebasingToken t = new RebasingToken();
        t.mint(owner, AMOUNT);
        t.setRebaseOnTransfer(true);
        (bool ok, bytes memory err) = _run(t);
        assertFalse(ok);
        assertEq(bytes4(err), IGhostPaySweepRelayer.UnexpectedBalanceDelta.selector);
        assertEq(t.balanceOf(address(relayer)), 0);
    }

    function test_rebasing_nonNeutralIndex_neverStrandsFunds() public {
        RebasingToken t = new RebasingToken();
        t.rebase(1.37e18);
        t.mint(owner, AMOUNT);
        // Per-transfer share round-up can exhaust the owner ("balance") or skew deltas; any outcome except a
        // silent mismatch is fine, and nothing may stay in the relayer.
        (bool ok,) = _run(t);
        if (ok) {
            assertEq(t.balanceOf(destination), AMOUNT - FEE);
            assertEq(t.balanceOf(feeTo), FEE);
        }
        assertEq(t.balanceOf(address(relayer)), 0);
    }
}
