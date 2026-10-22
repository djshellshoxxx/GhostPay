// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Base} from "./Base.t.sol";
import {IGhostPayRouter} from "../src/interfaces/IGhostPayRouter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Property tests for fee arithmetic, metadata binding and decimals handling.
contract GhostPayRouterFuzzTest is Base {
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
            gross,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );

        assertEq(token.balanceOf(feeRecipient), fee, "fee");
        assertEq(token.balanceOf(stealth), net, "net");
        assertEq(token.balanceOf(feeRecipient) + token.balanceOf(stealth), gross, "fee+net==gross");
        // floor rounding: fee*10_000 <= gross*25 < (fee+1)*10_000
        assertLe(fee * 10_000, gross * 25);
        assertGt((fee + 1) * 10_000, gross * 25);
        assertEq(token.balanceOf(address(router)), 0);
    }

    function testFuzz_dustBelow400PaysNoFee(uint256 gross) public {
        gross = bound(gross, 1, 399);
        vm.prank(alice);
        router.payERC20(
            IERC20(address(token)),
            stealth,
            gross,
            gross,
            deadline,
            _eph(),
            _erc20Meta(address(token), gross)
        );
        assertEq(token.balanceOf(feeRecipient), 0);
        assertEq(token.balanceOf(stealth), gross);
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
            gross,
            gross - fee,
            deadline,
            _eph(),
            _erc20Meta(address(t), gross - fee)
        );
        assertEq(t.balanceOf(stealth) + t.balanceOf(feeRecipient), gross);
        assertEq(t.balanceOf(feeRecipient), fee);
    }

    function testFuzz_metadataAmountMustEqualNet(uint256 gross, uint256 claimed) public {
        gross = bound(gross, 1, type(uint128).max);
        uint256 net = gross - gross * 25 / 10_000;
        vm.assume(claimed != net);
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.InvalidMetadata.selector);
        router.payERC20(
            IERC20(address(token)),
            stealth,
            gross,
            0,
            deadline,
            _eph(),
            _erc20Meta(address(token), claimed)
        );
    }

    function testFuzz_slippageGuard(uint256 gross, uint256 extra) public {
        gross = bound(gross, 1, type(uint128).max);
        extra = bound(extra, 1, type(uint128).max);
        uint256 net = gross - gross * 25 / 10_000;
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.SlippageExceeded.selector);
        router.payERC20(
            IERC20(address(token)),
            stealth,
            gross,
            net + extra,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    function testFuzz_ephemeralKeyValidation(bytes calldata eph) public {
        uint256 net = GROSS - _fee(GROSS);
        bool valid = eph.length == 33 && (eph[0] == 0x02 || eph[0] == 0x03);
        vm.prank(alice);
        if (!valid) vm.expectRevert(IGhostPayRouter.InvalidEphemeralKey.selector);
        router.payERC20(
            IERC20(address(token)),
            stealth,
            GROSS,
            net,
            deadline,
            eph,
            _erc20Meta(address(token), net)
        );
    }

    function testFuzz_metadataStructure(bytes calldata meta) public {
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        // Random bytes essentially never form the exact layout.
        vm.expectRevert(IGhostPayRouter.InvalidMetadata.selector);
        router.payERC20(IERC20(address(token)), stealth, GROSS, net, deadline, _eph(), meta);
    }

    function testFuzz_viewTagFreeAndAnnounced(uint8 tag, uint256 gross) public {
        gross = bound(gross, 1, 1e24);
        uint256 net = gross - gross * 25 / 10_000;
        bytes memory meta = abi.encodePacked(bytes1(tag), bytes4(0xa9059cbb), address(token), net);
        vm.expectEmit(true, true, true, true, address(announcer));
        emit Announcement(1, stealth, address(router), _eph(), meta);
        vm.prank(alice);
        router.payERC20(IERC20(address(token)), stealth, gross, net, deadline, _eph(), meta);
    }

    function testFuzz_deadline(uint256 dl) public {
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        if (block.timestamp > dl) vm.expectRevert(IGhostPayRouter.Expired.selector);
        router.payERC20(
            IERC20(address(token)), stealth, GROSS, net, dl, _eph(), _erc20Meta(address(token), net)
        );
    }

    function testFuzz_native(uint256 gross) public {
        gross = bound(gross, 1, 1000 ether);
        uint256 fee = gross * 25 / 10_000;
        uint256 net = gross - fee;
        vm.prank(alice);
        router.payNative{value: gross}(stealth, net, deadline, _eph(), _nativeMeta(net));
        assertEq(feeRecipient.balance, fee);
        assertEq(stealth.balance, net);
        assertEq(feeRecipient.balance + stealth.balance, gross);
        assertEq(address(router).balance, 0);
    }

    function testFuzz_bufferIsNeverCharged(uint256 gross, uint256 buffer) public {
        gross = bound(gross, 1, 1e24);
        buffer = bound(buffer, 1, 100 ether);
        uint256 net = gross - gross * 25 / 10_000;
        vm.prank(alice);
        router.payERC20WithBuffer{value: buffer}(
            IERC20(address(token)),
            stealth,
            gross,
            net,
            deadline,
            buffer,
            _eph(),
            _erc20Meta(address(token), net)
        );
        assertEq(stealth.balance, buffer);
        assertEq(feeRecipient.balance, 0);
    }

    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );
}
