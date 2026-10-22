// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {Base} from "../Base.t.sol";
import {GhostPayRouter} from "../../src/GhostPayRouter.sol";
import {IGhostPayRouter} from "../../src/interfaces/IGhostPayRouter.sol";
import {IERC5564Announcer} from "../../src/interfaces/IERC5564Announcer.sol";
import {BlacklistToken} from "../mocks/BlacklistToken.sol";
import {RevertingReceiver} from "../mocks/NativeReceivers.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/// @dev Token that lies about its name and has a permit() that always succeeds without doing anything.
contract FakePermitToken is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }

    function permit(address, address, uint256, uint256, uint8, bytes32, bytes32) external {}
}

/// @dev WETH-style token: no permit(), but a payable fallback that accepts any call.
contract PhantomPermitToken is ERC20 {
    constructor() ERC20("Wrapped Ether", "WETH") {}

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }

    fallback() external payable {}
}

/// @dev Native receiver that returns a large blob (return-data bomb) and injects an announcement.
contract BombReceiver {
    uint256 public size;
    IERC5564Announcer public ann;
    bool public inject;

    constructor(uint256 size_) {
        size = size_;
    }

    function setInject(IERC5564Announcer a) external {
        ann = a;
        inject = true;
    }

    fallback() external payable {
        if (inject) {
            inject = false;
            ann.announce(
                1, address(0xBEEF), abi.encodePacked(bytes1(0x02), bytes32(uint256(1))), hex"00"
            );
        }
        uint256 s = size;
        assembly {
            return(0, s)
        }
    }
}

/// @dev Control: forwards value with an assembly call that copies no return data. Its cost is the
/// callee's intrinsic cost (the bomb pays ~2.1M gas for its own 1 MB memory expansion).
contract NoCopyCaller {
    function poke(address to) external payable {
        assembly {
            pop(call(gas(), to, callvalue(), 0, 0, 0, 0))
        }
    }
}

/// @notice Adversarial tests for GhostPayRouter. `test_EXPLOIT_*` assert that the weakness is real.
contract RouterAuditTest is Base {
    // ---------------------------------------------------------------- R-01: fee recipient DoS

    /// @dev A USDC-style blacklisting of the immutable FEE_RECIPIENT bricks every ERC-20 payment >= 400 units.
    function test_EXPLOIT_feeRecipientBlacklisted_dosAllErc20Payments() public {
        BlacklistToken usdc = new BlacklistToken();
        usdc.mint(alice, 1_000_000e6);
        vm.prank(alice);
        usdc.approve(address(router), type(uint256).max);

        // Works before the blacklist.
        uint256 gross = 1000e6;
        uint256 net = gross - _fee(gross);
        vm.prank(alice);
        router.payERC20(
            usdc, stealth, gross, net, block.timestamp + 1, _eph(), _erc20Meta(address(usdc), net)
        );

        usdc.setBlacklisted(feeRecipient, true);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BlacklistToken.Blacklisted.selector, feeRecipient));
        router.payERC20(
            usdc, stealth, gross, net, block.timestamp + 1, _eph(), _erc20Meta(address(usdc), net)
        );

        // Only dust (< 400 units, zero fee) still works: the product is dead for real payments.
        uint256 dust = 399;
        vm.prank(alice);
        router.payERC20(
            usdc, stealth, dust, dust, block.timestamp + 1, _eph(), _erc20Meta(address(usdc), dust)
        );
    }

    /// @dev A fee recipient that cannot receive native value (paused contract, reverting Safe module) bricks payNative.
    function test_EXPLOIT_feeRecipientRejectsNative_dosNativePayments() public {
        RevertingReceiver bad = new RevertingReceiver();
        GhostPayRouter r2 = new GhostPayRouter(IERC5564Announcer(address(announcer)), address(bad));
        uint256 gross = 1 ether;
        uint256 net = gross - _fee(gross);
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.NativeTransferFailed.selector);
        r2.payNative{value: gross}(stealth, net, block.timestamp + 1, _eph(), _nativeMeta(net));
    }

    // ---------------------------------------------------------------- R-03: announcement spoofing / griefing

    /// @dev The router relays announcements that are only superficially checked: wrong view tag, an ephemeral
    /// key that is not on the curve, a fake "USDC" token and a stealth address belonging to a victim are all
    /// accepted and announced with `caller == router`. Scanners MUST NOT treat the router as an authenticator.
    function test_EXPLOIT_announcementSpoofing_fakeTokenOffCurveKeyWrongTag() public {
        FakePermitToken fake = new FakePermitToken(); // named "USD Coin"
        fake.mint(alice, 1000);
        vm.prank(alice);
        fake.approve(address(router), type(uint256).max);

        address victimStealth = makeAddr("victimStealth");
        // x = 5 is not an x-coordinate of a secp256k1 point? (Not checked either way by the router.)
        bytes memory junkKey = abi.encodePacked(bytes1(0x03), bytes32(uint256(5)));
        uint256 gross = 400;
        uint256 net = gross - _fee(gross);
        bytes memory meta = abi.encodePacked(bytes1(0xff), bytes4(0xa9059cbb), address(fake), net);

        vm.recordLogs();
        vm.prank(alice);
        router.payERC20(fake, victimStealth, gross, net, block.timestamp + 1, junkKey, meta);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bool found;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(announcer)) {
                // topics: sig, schemeId, stealth, caller
                assertEq(address(uint160(uint256(logs[i].topics[2]))), victimStealth);
                assertEq(address(uint160(uint256(logs[i].topics[3]))), address(router));
                found = true;
            }
        }
        assertTrue(found, "announcement for victim emitted with caller==router");
        assertEq(fake.balanceOf(victimStealth), net); // victim now holds attacker dust token
    }

    /// @dev Safe-behaviour check: the `caller` field cannot be forged; a direct announce shows the attacker.
    function test_callerFieldCannotBeForged() public {
        address attacker = makeAddr("attacker");
        vm.recordLogs();
        vm.prank(attacker);
        announcer.announce(1, stealth, _eph(), _erc20Meta(address(token), 1));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(address(uint160(uint256(logs[0].topics[3]))), attacker);
        assertTrue(attacker != address(router));
    }

    /// @dev A stealth *contract* receiving native value can emit extra announcements before the router's own.
    function test_EXPLOIT_stealthContractInjectsAnnouncementBeforeRouterAnnounce() public {
        BombReceiver rcv = new BombReceiver(0);
        rcv.setInject(IERC5564Announcer(address(announcer)));
        uint256 gross = 1 ether;
        uint256 net = gross - _fee(gross);
        vm.recordLogs();
        vm.prank(alice);
        router.payNative{value: gross}(
            address(rcv), net, block.timestamp + 1, _eph(), _nativeMeta(net)
        );
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 anns;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(announcer)) anns++;
        }
        assertEq(anns, 2, "recipient-injected announcement precedes the router's");
    }

    // ---------------------------------------------------------------- R-04: dust fee bypass

    function test_EXPLOIT_feeBypassBySplittingBelow400Units() public {
        uint256 total;
        for (uint256 i; i < 20; i++) {
            uint256 gross = 399;
            vm.prank(alice);
            router.payERC20(
                token,
                stealth,
                gross,
                gross,
                block.timestamp + 1,
                _eph(),
                _erc20Meta(address(token), gross)
            );
            total += gross;
        }
        assertEq(token.balanceOf(feeRecipient), 0, "no fee collected on 7980 units");
        assertEq(total * 25 / 10_000, 19, "a single payment would have owed 19 units");
    }

    // ---------------------------------------------------------------- R-?: edge cases (safe)

    function test_payerIsFeeRecipient_reverts() public {
        token.mint(feeRecipient, 1_000_000e6);
        vm.prank(feeRecipient);
        token.approve(address(router), type(uint256).max);
        uint256 net = 1000e6 - _fee(1000e6);
        vm.prank(feeRecipient);
        vm.expectRevert(IGhostPayRouter.UnexpectedBalanceDelta.selector);
        router.payERC20(
            token,
            stealth,
            1000e6,
            net,
            block.timestamp + 1,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    function test_payerIsStealth_reverts() public {
        token.mint(stealth, 1_000_000e6);
        vm.prank(stealth);
        token.approve(address(router), type(uint256).max);
        uint256 net = 1000e6 - _fee(1000e6);
        vm.prank(stealth);
        vm.expectRevert(IGhostPayRouter.UnexpectedBalanceDelta.selector);
        router.payERC20(
            token,
            stealth,
            1000e6,
            net,
            block.timestamp + 1,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    /// @dev Phantom-permit (WETH fallback) and always-succeeding fake permit cannot conjure an allowance.
    function test_phantomAndFakePermit_cannotBypassAllowance() public {
        PhantomPermitToken weth = new PhantomPermitToken();
        FakePermitToken fake = new FakePermitToken();
        weth.mint(alice, 10e18);
        fake.mint(alice, 10e18);
        uint256 gross = 1e18;
        uint256 net = gross - _fee(gross);
        vm.startPrank(alice);
        vm.expectRevert(); // ERC20InsufficientAllowance
        router.payERC20WithPermit(
            weth,
            stealth,
            gross,
            net,
            block.timestamp + 1,
            _eph(),
            _erc20Meta(address(weth), net),
            27,
            0,
            0
        );
        vm.expectRevert();
        router.payERC20WithPermit(
            fake,
            stealth,
            gross,
            net,
            block.timestamp + 1,
            _eph(),
            _erc20Meta(address(fake), net),
            27,
            0,
            0
        );
        // With a real allowance both succeed (permit is just ignored).
        weth.approve(address(router), gross);
        router.payERC20WithPermit(
            weth,
            stealth,
            gross,
            net,
            block.timestamp + 1,
            _eph(),
            _erc20Meta(address(weth), net),
            27,
            0,
            0
        );
        vm.stopPrank();
        assertEq(weth.balanceOf(stealth), net);
    }

    /// @dev Gas of one no-copy call into `to`: the intrinsic cost of the callee, the floor for any caller.
    function _controlGas(address to) internal returns (uint256 used) {
        NoCopyCaller c = new NoCopyCaller();
        uint256 g0 = gasleft();
        c.poke{value: 1}(to);
        used = g0 - gasleft();
    }

    /// @dev L-01 regression: the native call copies no return data, so a payee returning a 1 MB blob costs
    /// the router only what the payee itself burns (its own memory expansion), not the caller's quadratic copy.
    /// Before the fix: 4.17M gas vs 107k for an empty return; the 1 MB payee's intrinsic cost is ~2.1M.
    function test_returnDataBomb_gasBounded() public {
        BombReceiver small = new BombReceiver(0);
        BombReceiver bomb = new BombReceiver(1_000_000);
        uint256 intrinsic = _controlGas(address(bomb));
        uint256 bombBefore = address(bomb).balance;
        uint256 gross = 1 ether;
        uint256 net = gross - _fee(gross);
        uint256 g0 = gasleft();
        vm.prank(alice);
        router.payNative{value: gross}(
            address(small), net, block.timestamp + 1, _eph(), _nativeMeta(net)
        );
        uint256 gSmall = g0 - gasleft();
        g0 = gasleft();
        vm.prank(alice);
        router.payNative{value: gross}(
            address(bomb), net, block.timestamp + 1, _eph(), _nativeMeta(net)
        );
        uint256 gBomb = g0 - gasleft();
        emit log_named_uint("gas, empty return", gSmall);
        emit log_named_uint("gas, 1MB return  ", gBomb);
        emit log_named_uint("payee intrinsic  ", intrinsic);
        // Router overhead on top of the payee's own cost stays within a small constant of the empty case.
        assertLt(gBomb, gSmall + intrinsic + 30_000, "return data must not be copied");
        assertLt(gBomb, 2_600_000, "absolute bound (pre-fix: 4.17M)");
        assertEq(address(bomb).balance, bombBefore + net);
    }

    /// @dev L-01 regression: same bound for the fee leg (fee recipient returning 1 MB) and the buffer leg.
    function test_returnDataBomb_feeRecipientAndBuffer_gasBounded() public {
        BombReceiver bombFee = new BombReceiver(1_000_000);
        uint256 intrinsic = _controlGas(address(bombFee));
        uint256 feeBefore = address(bombFee).balance;
        GhostPayRouter r2 =
            new GhostPayRouter(IERC5564Announcer(address(announcer)), address(bombFee));
        uint256 gross = 1 ether;
        uint256 net = gross - _fee(gross);
        uint256 g0 = gasleft();
        vm.prank(alice);
        r2.payNative{value: gross}(stealth, net, block.timestamp + 1, _eph(), _nativeMeta(net));
        assertLt(g0 - gasleft(), intrinsic + 200_000, "fee leg bounded");
        assertEq(address(bombFee).balance, feeBefore + gross - net);

        BombReceiver bombStealth = new BombReceiver(1_000_000);
        uint256 amt = 1000e6;
        uint256 n2 = amt - _fee(amt);
        vm.prank(alice);
        token.approve(address(router), type(uint256).max);
        g0 = gasleft();
        vm.prank(alice);
        router.payERC20WithBuffer{value: 0.01 ether}(
            token,
            address(bombStealth),
            amt,
            n2,
            block.timestamp + 1,
            0.01 ether,
            _eph(),
            _erc20Meta(address(token), n2)
        );
        assertLt(g0 - gasleft(), intrinsic + 300_000, "buffer leg bounded");
        assertEq(address(bombStealth).balance, 0.01 ether);
    }

    /// @dev Stealth address equal to the token contract or the announcer is accepted (funds burned): payer error only.
    function test_stealthEqualsTokenAccepted_payerFootgun() public {
        uint256 gross = 1000e6;
        uint256 net = gross - _fee(gross);
        vm.prank(alice);
        router.payERC20(
            token,
            address(token),
            gross,
            net,
            block.timestamp + 1,
            _eph(),
            _erc20Meta(address(token), net)
        );
        assertEq(token.balanceOf(address(token)), net);
    }

    /// @dev Router never holds balances after any flow (spot check incl. buffer).
    function test_routerHoldsNothing() public {
        uint256 gross = 1000e6;
        uint256 net = gross - _fee(gross);
        vm.prank(alice);
        router.payERC20WithBuffer{value: 0.01 ether}(
            token,
            stealth,
            gross,
            net,
            block.timestamp + 1,
            0.02 ether,
            _eph(),
            _erc20Meta(address(token), net)
        );
        assertEq(token.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }
}
