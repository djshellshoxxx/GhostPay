// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {PolicyRouterBase} from "./PolicyRouterBase.t.sol";
import {IGhostPayPolicyRouter} from "../src/interfaces/IGhostPayPolicyRouter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Property tests: fee arithmetic, metadata binding and the policy-account binding.
contract GhostPayPolicyRouterFuzzTest is PolicyRouterBase {
    uint256 internal deadline;

    function setUp() public override {
        super.setUp();
        deadline = block.timestamp + 1 hours;
    }

    function testFuzz_feeConservationAndFloorRounding(uint256 gross) public {
        gross = bound(gross, 1, type(uint128).max);
        uint256 fee = gross * 25 / 10_000;
        uint256 net = gross - fee;
        vm.prank(alice);
        router.payERC20(
            IERC20(address(token)),
            stealth,
            _ref(),
            gross,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
        assertEq(token.balanceOf(feeRecipient), fee, "fee");
        assertEq(token.balanceOf(stealth), net, "net");
        assertLe(fee * 10_000, gross * 25);
        assertGt((fee + 1) * 10_000, gross * 25);
        assertEq(token.balanceOf(address(router)), 0);
    }

    function testFuzz_nativeConservation(uint256 gross) public {
        gross = bound(gross, 1, 1000 ether);
        uint256 fee = gross * 25 / 10_000;
        uint256 net = gross - fee;
        vm.prank(alice);
        router.payNative{value: gross}(stealth, _ref(), net, deadline, _eph(), _nativeMeta(net));
        assertEq(feeRecipient.balance, fee);
        assertEq(stealth.balance, net);
        assertEq(address(router).balance, 0);
    }

    /// @dev Any (owner, policyHash) is payable at exactly the factory's predicted address, and the
    /// independent CREATE2 derivation agrees with the factory.
    function testFuzz_anyPolicyAccountPayable(address o, bytes32 h, uint256 gross) public {
        vm.assume(o != address(0));
        gross = bound(gross, 1, 1e30);
        address acct = factory.predictAddress(o, h);
        assertEq(acct, _predict(o, h));
        vm.assume(acct != feeRecipient && acct != alice);
        uint256 net = gross - gross * 25 / 10_000;
        vm.prank(alice);
        router.payERC20(
            IERC20(address(token)),
            acct,
            _ref(o, h),
            gross,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
        assertEq(token.balanceOf(acct), net);
    }

    /// @dev Any recipient other than the predicted account is rejected, whatever the path.
    function testFuzz_wrongRecipientRejected(address o, bytes32 h, address wrong) public {
        vm.assume(o != address(0));
        address acct = factory.predictAddress(o, h);
        vm.assume(wrong != acct);
        uint256 net = GROSS - GROSS * 25 / 10_000;
        bytes memory err =
            abi.encodeWithSelector(IGhostPayPolicyRouter.NotPolicyAccount.selector, acct);

        vm.prank(alice);
        vm.expectRevert(err);
        router.payERC20(
            IERC20(address(token)),
            wrong,
            _ref(o, h),
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
        vm.prank(alice);
        vm.expectRevert(err);
        router.payNative{value: GROSS}(wrong, _ref(o, h), net, deadline, _eph(), _nativeMeta(net));
        vm.prank(alice);
        vm.expectRevert(err);
        router.payERC20WithBuffer{value: 1}(
            IERC20(address(token)),
            wrong,
            _ref(o, h),
            GROSS,
            net,
            deadline,
            1,
            _eph(),
            _erc20Meta(address(token), net)
        );
        vm.prank(alice);
        vm.expectRevert(err);
        router.payERC20WithPermit(
            IERC20(address(token)),
            wrong,
            _ref(o, h),
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net),
            _noPermit()
        );
    }

    /// @dev Changing either input of the binding moves the account (no collisions in practice).
    function testFuzz_bindingIsInjective(address o, bytes32 h, address o2, bytes32 h2) public view {
        vm.assume(o != o2 || h != h2);
        assertTrue(factory.predictAddress(o, h) != factory.predictAddress(o2, h2));
    }

    function testFuzz_metadataAmountMustMatch(uint256 gross, uint256 claimed) public {
        gross = bound(gross, 1, type(uint128).max);
        uint256 net = gross - gross * 25 / 10_000;
        vm.assume(claimed != net);
        vm.prank(alice);
        vm.expectRevert(IGhostPayPolicyRouter.InvalidMetadata.selector);
        router.payERC20(
            IERC20(address(token)),
            stealth,
            _ref(),
            gross,
            0,
            deadline,
            _eph(),
            _erc20Meta(address(token), claimed)
        );
    }

    function testFuzz_deadline(uint256 dl, uint256 nowTs) public {
        nowTs = bound(nowTs, 1, type(uint64).max);
        dl = bound(dl, 0, type(uint64).max);
        vm.warp(nowTs);
        uint256 net = GROSS - GROSS * 25 / 10_000;
        if (nowTs > dl) vm.expectRevert(IGhostPayPolicyRouter.Expired.selector);
        vm.prank(alice);
        router.payERC20(
            IERC20(address(token)),
            stealth,
            _ref(),
            GROSS,
            net,
            dl,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    function testFuzz_bufferBounds(uint256 buffer, uint256 maxBuffer) public {
        buffer = bound(buffer, 0, 10 ether);
        maxBuffer = bound(maxBuffer, 0, 10 ether);
        uint256 net = GROSS - GROSS * 25 / 10_000;
        if (buffer == 0) vm.expectRevert(IGhostPayPolicyRouter.BufferRequired.selector);
        else if (buffer > maxBuffer) vm.expectRevert(IGhostPayPolicyRouter.BufferTooLarge.selector);
        vm.prank(alice);
        router.payERC20WithBuffer{value: buffer}(
            IERC20(address(token)),
            stealth,
            _ref(),
            GROSS,
            net,
            deadline,
            maxBuffer,
            _eph(),
            _erc20Meta(address(token), net)
        );
        if (buffer != 0 && buffer <= maxBuffer) assertEq(stealth.balance, buffer);
    }

    function testFuzz_decimals(uint8 decimalsSeed, uint256 whole) public {
        uint8[3] memory decs = [2, 6, 18];
        uint8 d = decs[decimalsSeed % 3];
        whole = bound(whole, 1, 1e12);
        uint256 gross = whole * 10 ** d;
        MockERC20 t = new MockERC20("T", "T", d);
        t.mint(alice, gross);
        vm.prank(alice);
        t.approve(address(router), gross);
        uint256 fee = gross * 25 / 10_000;
        vm.prank(alice);
        router.payERC20(
            IERC20(address(t)),
            stealth,
            _ref(),
            gross,
            gross - fee,
            deadline,
            _eph(),
            _erc20Meta(address(t), gross - fee)
        );
        assertEq(t.balanceOf(stealth) + t.balanceOf(feeRecipient), gross);
    }
}
