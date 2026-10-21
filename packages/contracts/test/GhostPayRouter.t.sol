// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {Base} from "./Base.t.sol";
import {GhostPayRouter} from "../src/GhostPayRouter.sol";
import {IGhostPayRouter} from "../src/interfaces/IGhostPayRouter.sol";
import {IERC5564Announcer} from "../src/interfaces/IERC5564Announcer.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {NoReturnToken} from "./mocks/NoReturnToken.sol";
import {FalseReturnToken} from "./mocks/FalseReturnToken.sol";
import {FeeOnTransferToken} from "./mocks/FeeOnTransferToken.sol";
import {ReentrantToken} from "./mocks/ReentrantToken.sol";
import {PermitToken} from "./mocks/PermitToken.sol";
import {BlacklistToken} from "./mocks/BlacklistToken.sol";
import {RevertingReceiver, ReentrantReceiver, GasBurnReceiver} from "./mocks/NativeReceivers.sol";

contract GhostPayRouterTest is Base {
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );
    event FeeCollected(address indexed token, uint256 amount);

    uint256 internal deadline;

    function setUp() public override {
        super.setUp();
        deadline = block.timestamp + 1 hours;
    }

    // ------------------------------------------------------------------ helpers

    function _pay(uint256 gross) internal {
        uint256 net = gross - _fee(gross);
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
    }

    // ------------------------------------------------------------------ constructor

    function test_constructor_setsImmutables() public view {
        assertEq(address(router.ANNOUNCER()), address(announcer));
        assertEq(router.FEE_RECIPIENT(), feeRecipient);
        assertEq(router.FEE_BPS(), 25);
        assertEq(router.BPS(), 10_000);
        assertEq(router.SCHEME_ID(), 1);
        assertEq(router.NATIVE(), NATIVE);
    }

    function test_constructor_revertsOnZeroAnnouncer() public {
        vm.expectRevert(IGhostPayRouter.ZeroAddress.selector);
        new GhostPayRouter(IERC5564Announcer(address(0)), feeRecipient);
    }

    function test_constructor_revertsOnZeroFeeRecipient() public {
        vm.expectRevert(IGhostPayRouter.ZeroAddress.selector);
        new GhostPayRouter(IERC5564Announcer(address(announcer)), address(0));
    }

    function test_constructor_revertsWhenFeeRecipientIsRouter() public {
        // The router's own address is the CREATE address of this contract at its current nonce.
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        vm.expectRevert(IGhostPayRouter.InvalidStealth.selector);
        new GhostPayRouter(IERC5564Announcer(address(announcer)), predicted);
    }

    // ------------------------------------------------------------------ payERC20 happy path

    function test_payERC20_splitsFeeAndNet() public {
        uint256 fee = _fee(GROSS);
        _pay(GROSS);
        assertEq(token.balanceOf(feeRecipient), fee);
        assertEq(token.balanceOf(stealth), GROSS - fee);
        assertEq(token.balanceOf(address(router)), 0);
        assertEq(fee, 2_500_000);
    }

    function test_payERC20_emitsFeeCollected() public {
        vm.expectEmit(true, false, false, true, address(router));
        emit FeeCollected(address(token), _fee(GROSS));
        _pay(GROSS);
    }

    function test_payERC20_dustPaysNoFee() public {
        vm.recordLogs();
        _pay(399);
        assertEq(token.balanceOf(feeRecipient), 0);
        assertEq(token.balanceOf(stealth), 399);
        // Only Transfer (token) and Announcement (announcer); no FeeCollected for a zero fee.
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            assertTrue(logs[i].emitter != address(router));
        }
    }

    function test_payERC20_boundaryFeeAt400() public {
        _pay(400);
        assertEq(token.balanceOf(feeRecipient), 1);
        assertEq(token.balanceOf(stealth), 399);
    }

    function test_payERC20_deadlineInclusive() public {
        vm.warp(deadline);
        _pay(GROSS);
        assertEq(token.balanceOf(stealth), GROSS - _fee(GROSS));
    }

    function test_payERC20_minNetExactAccepted() public {
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        router.payERC20(
            IERC20(address(token)),
            stealth,
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    // ------------------------------------------------------------------ announcement

    function test_announcement_emittedByCanonicalAnnouncerWithRouterAsCaller() public {
        uint256 net = GROSS - _fee(GROSS);
        bytes memory meta = _erc20Meta(address(token), net);
        vm.expectEmit(true, true, true, true, address(announcer));
        emit Announcement(1, stealth, address(router), _eph(), meta);
        _pay(GROSS);
    }

    function test_announcement_metadataLayout() public {
        vm.recordLogs();
        _pay(GROSS);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        Vm.Log memory log;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(announcer)) log = logs[i];
        }
        assertEq(log.topics.length, 4);
        assertEq(log.topics[0], IERC5564Announcer.Announcement.selector);
        assertEq(uint256(log.topics[1]), 1, "scheme id");
        assertEq(address(uint160(uint256(log.topics[2]))), stealth);
        assertEq(address(uint160(uint256(log.topics[3]))), address(router));
        (bytes memory eph, bytes memory meta) = abi.decode(log.data, (bytes, bytes));
        assertEq(eph, _eph());
        assertEq(meta.length, 57);
        assertEq(bytes1(meta[0]), bytes1(0xab), "view tag passthrough");
        assertEq(bytes4(abi.encodePacked(meta[1], meta[2], meta[3], meta[4])), bytes4(0xa9059cbb));
        bytes20 t;
        for (uint256 i; i < 20; i++) {
            t |= bytes20(meta[5 + i]) >> (8 * i);
        }
        assertEq(address(t), address(token));
        uint256 amt;
        for (uint256 i; i < 32; i++) {
            amt = (amt << 8) | uint8(meta[25 + i]);
        }
        assertEq(amt, token.balanceOf(stealth), "metadata amount == received net");
    }

    function test_announcement_eventSignatureMatchesCanonicalAnnouncer() public pure {
        assertEq(
            IERC5564Announcer.Announcement.selector,
            keccak256("Announcement(uint256,address,address,bytes,bytes)")
        );
    }

    function test_announcement_revertsAreAtomic() public {
        // An announcer without code makes the high-level call revert; no tokens may move.
        GhostPayRouter r =
            new GhostPayRouter(IERC5564Announcer(makeAddr("notAContract")), feeRecipient);
        vm.prank(alice);
        token.approve(address(r), type(uint256).max);
        uint256 net = GROSS - _fee(GROSS);
        uint256 before_ = token.balanceOf(alice);
        vm.prank(alice);
        vm.expectRevert();
        r.payERC20(
            IERC20(address(token)),
            stealth,
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
        assertEq(token.balanceOf(alice), before_);
        assertEq(token.balanceOf(stealth), 0);
    }

    // ------------------------------------------------------------------ payERC20 negative

    function _expectPay(bytes4 err) internal {
        vm.expectRevert(err);
    }

    function test_payERC20_revertsExpired() public {
        vm.warp(deadline + 1);
        _expectPay(IGhostPayRouter.Expired.selector);
        _pay(GROSS);
    }

    function test_payERC20_revertsZeroToken() public {
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.ZeroAddress.selector);
        router.payERC20(
            IERC20(address(0)), stealth, GROSS, 0, deadline, _eph(), _erc20Meta(address(0), GROSS)
        );
    }

    function test_payERC20_revertsStealthZero() public {
        stealth = address(0);
        _expectPay(IGhostPayRouter.InvalidStealth.selector);
        _pay(GROSS);
    }

    function test_payERC20_revertsStealthIsRouter() public {
        stealth = address(router);
        _expectPay(IGhostPayRouter.InvalidStealth.selector);
        _pay(GROSS);
    }

    function test_payERC20_revertsStealthIsFeeRecipient() public {
        stealth = feeRecipient;
        _expectPay(IGhostPayRouter.InvalidStealth.selector);
        _pay(GROSS);
    }

    function test_payERC20_revertsZeroGross() public {
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.ZeroAmount.selector);
        router.payERC20(
            IERC20(address(token)), stealth, 0, 0, deadline, _eph(), _erc20Meta(address(token), 0)
        );
    }

    function test_payERC20_revertsSlippage() public {
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.SlippageExceeded.selector);
        router.payERC20(
            IERC20(address(token)),
            stealth,
            GROSS,
            net + 1,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    function test_payERC20_revertsOverflowingGross() public {
        vm.prank(alice);
        vm.expectRevert(); // checked-arithmetic panic on gross * 25
        router.payERC20(
            IERC20(address(token)),
            stealth,
            type(uint256).max,
            0,
            deadline,
            _eph(),
            _erc20Meta(address(token), 1)
        );
    }

    function test_payERC20_revertsEphemeralKeyWrongLength() public {
        uint256 net = GROSS - _fee(GROSS);
        bytes memory meta = _erc20Meta(address(token), net);
        bytes[3] memory bad = [
            abi.encodePacked(bytes1(0x02), bytes31(uint248(1))), // 32 bytes
            abi.encodePacked(bytes1(0x02), bytes32(uint256(1)), bytes1(0)), // 34 bytes
            bytes("")
        ];
        for (uint256 i; i < bad.length; i++) {
            vm.prank(alice);
            vm.expectRevert(IGhostPayRouter.InvalidEphemeralKey.selector);
            router.payERC20(IERC20(address(token)), stealth, GROSS, net, deadline, bad[i], meta);
        }
    }

    function test_payERC20_revertsEphemeralKeyBadPrefix() public {
        uint256 net = GROSS - _fee(GROSS);
        bytes memory meta = _erc20Meta(address(token), net);
        bytes1[4] memory prefixes = [bytes1(0x00), 0x01, 0x04, 0xff];
        for (uint256 i; i < prefixes.length; i++) {
            vm.prank(alice);
            vm.expectRevert(IGhostPayRouter.InvalidEphemeralKey.selector);
            router.payERC20(
                IERC20(address(token)),
                stealth,
                GROSS,
                net,
                deadline,
                abi.encodePacked(prefixes[i], bytes32(uint256(5))),
                meta
            );
        }
    }

    function test_payERC20_acceptsBothValidPrefixes() public {
        uint256 net = GROSS - _fee(GROSS);
        bytes memory meta = _erc20Meta(address(token), net);
        vm.prank(alice);
        router.payERC20(
            IERC20(address(token)),
            stealth,
            GROSS,
            net,
            deadline,
            abi.encodePacked(bytes1(0x03), bytes32(uint256(7))),
            meta
        );
        assertEq(token.balanceOf(stealth), net);
    }

    function _payWithMeta(bytes memory meta) internal {
        vm.prank(alice);
        router.payERC20(
            IERC20(address(token)), stealth, GROSS, GROSS - _fee(GROSS), deadline, _eph(), meta
        );
    }

    function test_payERC20_revertsMetadataWrongLength() public {
        uint256 net = GROSS - _fee(GROSS);
        bytes memory ok = _erc20Meta(address(token), net);
        vm.expectRevert(IGhostPayRouter.InvalidMetadata.selector);
        this.payWithMetaExternal(abi.encodePacked(ok, bytes1(0)));
        vm.expectRevert(IGhostPayRouter.InvalidMetadata.selector);
        this.payWithMetaExternal(bytes(""));
        vm.expectRevert(IGhostPayRouter.InvalidMetadata.selector);
        this.payWithMetaExternal(abi.encodePacked(bytes1(0xab)));
    }

    /// @dev Helper so vm.expectRevert applies to a call made with `alice` as msg.sender.
    function payWithMetaExternal(bytes memory meta) external {
        _payWithMeta(meta);
    }

    function test_payERC20_revertsMetadataWrongSelector() public {
        uint256 net = GROSS - _fee(GROSS);
        vm.expectRevert(IGhostPayRouter.InvalidMetadata.selector);
        this.payWithMetaExternal(_meta(0xeeeeeeee, address(token), net));
    }

    function test_payERC20_revertsMetadataWrongToken() public {
        uint256 net = GROSS - _fee(GROSS);
        vm.expectRevert(IGhostPayRouter.InvalidMetadata.selector);
        this.payWithMetaExternal(_erc20Meta(address(0xBEEF), net));
    }

    function test_payERC20_revertsMetadataWrongAmount() public {
        uint256 net = GROSS - _fee(GROSS);
        vm.expectRevert(IGhostPayRouter.InvalidMetadata.selector);
        this.payWithMetaExternal(_erc20Meta(address(token), net + 1));
        vm.expectRevert(IGhostPayRouter.InvalidMetadata.selector);
        this.payWithMetaExternal(_erc20Meta(address(token), GROSS)); // gross instead of net
    }

    function test_payERC20_viewTagIsUnconstrained() public {
        uint256 net = GROSS - _fee(GROSS);
        for (uint256 t; t < 256; t += 85) {
            bytes memory meta =
                abi.encodePacked(bytes1(uint8(t)), bytes4(0xa9059cbb), address(token), net);
            vm.prank(alice);
            router.payERC20(IERC20(address(token)), stealth, GROSS, net, deadline, _eph(), meta);
        }
    }

    function test_payERC20_revertsWithoutAllowance() public {
        vm.prank(alice);
        token.approve(address(router), 0);
        vm.expectRevert();
        _pay(GROSS);
    }

    function test_payERC20_revertsTokenIsEOA() public {
        uint256 net = GROSS - _fee(GROSS);
        address eoa = makeAddr("eoaToken");
        vm.prank(alice);
        vm.expectRevert();
        router.payERC20(IERC20(eoa), stealth, GROSS, net, deadline, _eph(), _erc20Meta(eoa, net));
    }

    function test_payERC20_revertsWhenPayerIsStealth() public {
        // Payer == stealth: the stealth balance cannot rise by `net` (fee leaves it).
        token.mint(stealth, GROSS);
        vm.prank(stealth);
        token.approve(address(router), type(uint256).max);
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(stealth);
        vm.expectRevert(IGhostPayRouter.UnexpectedBalanceDelta.selector);
        router.payERC20(
            IERC20(address(token)),
            stealth,
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    // ------------------------------------------------------------------ token types

    function test_noReturnToken_works() public {
        NoReturnToken t = new NoReturnToken();
        t.mint(alice, GROSS);
        vm.prank(alice);
        t.approve(address(router), GROSS);
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        router.payERC20(
            IERC20(address(t)), stealth, GROSS, net, deadline, _eph(), _erc20Meta(address(t), net)
        );
        assertEq(t.balanceOf(stealth), net);
        assertEq(t.balanceOf(feeRecipient), _fee(GROSS));
        assertEq(t.balanceOf(address(router)), 0);
    }

    function test_falseReturnToken_rejected() public {
        FalseReturnToken t = new FalseReturnToken();
        t.mint(alice, GROSS);
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        vm.expectRevert(); // SafeERC20FailedOperation
        router.payERC20(
            IERC20(address(t)), stealth, GROSS, net, deadline, _eph(), _erc20Meta(address(t), net)
        );
    }

    function test_feeOnTransferToken_rejected() public {
        FeeOnTransferToken t = new FeeOnTransferToken();
        t.mint(alice, GROSS);
        vm.prank(alice);
        t.approve(address(router), GROSS);
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.UnexpectedBalanceDelta.selector);
        router.payERC20(
            IERC20(address(t)), stealth, GROSS, net, deadline, _eph(), _erc20Meta(address(t), net)
        );
    }

    function test_blacklistToken_blacklistedStealthReverts() public {
        BlacklistToken t = new BlacklistToken();
        t.mint(alice, GROSS);
        vm.prank(alice);
        t.approve(address(router), GROSS);
        t.setBlacklisted(stealth, true);
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BlacklistToken.Blacklisted.selector, stealth));
        router.payERC20(
            IERC20(address(t)), stealth, GROSS, net, deadline, _eph(), _erc20Meta(address(t), net)
        );
        assertEq(t.balanceOf(feeRecipient), 0, "atomic: fee transfer rolled back");
    }

    function test_blacklistToken_blacklistedFeeRecipientReverts() public {
        BlacklistToken t = new BlacklistToken();
        t.mint(alice, GROSS);
        vm.prank(alice);
        t.approve(address(router), GROSS);
        t.setBlacklisted(feeRecipient, true);
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BlacklistToken.Blacklisted.selector, feeRecipient));
        router.payERC20(
            IERC20(address(t)), stealth, GROSS, net, deadline, _eph(), _erc20Meta(address(t), net)
        );
    }

    function test_decimals_2_6_18() public {
        uint8[3] memory decs = [2, 6, 18];
        for (uint256 i; i < decs.length; i++) {
            MockERC20 t = new MockERC20("T", "T", decs[i]);
            uint256 gross = 12_345 * 10 ** decs[i];
            t.mint(alice, gross);
            vm.prank(alice);
            t.approve(address(router), gross);
            uint256 net = gross - _fee(gross);
            vm.prank(alice);
            router.payERC20(
                IERC20(address(t)),
                stealth,
                gross,
                net,
                deadline,
                _eph(),
                _erc20Meta(address(t), net)
            );
            assertEq(t.balanceOf(stealth), net);
            assertEq(t.balanceOf(feeRecipient), _fee(gross));
        }
    }

    // ------------------------------------------------------------------ reentrancy

    function test_reentrantToken_cannotReenterRouter() public {
        ReentrantToken t = new ReentrantToken();
        t.mint(alice, 2 * GROSS);
        vm.prank(alice);
        t.approve(address(router), 2 * GROSS);
        uint256 net = GROSS - _fee(GROSS);
        bytes memory inner = abi.encodeCall(
            router.payERC20,
            (IERC20(address(t)), stealth, GROSS, net, deadline, _eph(), _erc20Meta(address(t), net))
        );
        t.arm(address(router), inner, false);
        vm.prank(alice);
        router.payERC20(
            IERC20(address(t)), stealth, GROSS, net, deadline, _eph(), _erc20Meta(address(t), net)
        );
        assertEq(t.attempts(), 1);
        assertFalse(t.lastSuccess(), "reentrant call must fail");
        assertEq(bytes4(t.lastReturn()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(t.balanceOf(stealth), net, "outer payment unaffected");
    }

    function test_reentrantToken_bubbledRevertAbortsPayment() public {
        ReentrantToken t = new ReentrantToken();
        t.mint(alice, GROSS);
        vm.prank(alice);
        t.approve(address(router), GROSS);
        uint256 net = GROSS - _fee(GROSS);
        t.arm(
            address(router),
            abi.encodeCall(router.payNative, (stealth, 0, deadline, _eph(), _nativeMeta(0))),
            true
        );
        vm.prank(alice);
        vm.expectRevert();
        router.payERC20(
            IERC20(address(t)), stealth, GROSS, net, deadline, _eph(), _erc20Meta(address(t), net)
        );
        assertEq(t.balanceOf(stealth), 0);
    }

    // ------------------------------------------------------------------ permit path

    function _permitSig(PermitToken t, uint256 pk, address owner, uint256 value, uint256 dl)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                owner,
                address(router),
                value,
                t.nonces(owner),
                dl
            )
        );
        (v, r, s) =
            vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", t.DOMAIN_SEPARATOR(), structHash)));
    }

    function test_payERC20WithPermit_happyPath() public {
        (address payer, uint256 pk) = makeAddrAndKey("payer");
        PermitToken t = new PermitToken(6);
        t.mint(payer, GROSS);
        uint256 net = GROSS - _fee(GROSS);
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(t, pk, payer, GROSS, deadline);
        vm.prank(payer);
        router.payERC20WithPermit(
            IERC20(address(t)),
            stealth,
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(t), net),
            v,
            r,
            s
        );
        assertEq(t.balanceOf(stealth), net);
        assertEq(t.balanceOf(feeRecipient), _fee(GROSS));
        assertEq(t.allowance(payer, address(router)), 0);
    }

    function test_payERC20WithPermit_frontRunPermitStillSucceeds() public {
        (address payer, uint256 pk) = makeAddrAndKey("payer");
        PermitToken t = new PermitToken(6);
        t.mint(payer, GROSS);
        uint256 net = GROSS - _fee(GROSS);
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(t, pk, payer, GROSS, deadline);
        // Attacker front-runs by submitting the permit first.
        t.permit(payer, address(router), GROSS, deadline, v, r, s);
        vm.prank(payer);
        router.payERC20WithPermit(
            IERC20(address(t)),
            stealth,
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(t), net),
            v,
            r,
            s
        );
        assertEq(t.balanceOf(stealth), net);
    }

    function test_payERC20WithPermit_invalidPermitAndNoAllowanceReverts() public {
        (address payer,) = makeAddrAndKey("payer");
        (, uint256 otherPk) = makeAddrAndKey("other");
        PermitToken t = new PermitToken(6);
        t.mint(payer, GROSS);
        uint256 net = GROSS - _fee(GROSS);
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(t, otherPk, payer, GROSS, deadline);
        vm.prank(payer);
        vm.expectRevert(); // ERC20InsufficientAllowance
        router.payERC20WithPermit(
            IERC20(address(t)),
            stealth,
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(t), net),
            v,
            r,
            s
        );
    }

    function test_payERC20WithPermit_tokenWithoutPermitButAllowanceWorks() public {
        // Token lacks permit(): the try/catch swallows the failure; pre-existing allowance suffices.
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        router.payERC20WithPermit(
            IERC20(address(token)),
            stealth,
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net),
            27,
            bytes32(0),
            bytes32(0)
        );
        assertEq(token.balanceOf(stealth), net);
    }

    function test_payERC20WithPermit_revertsExpiredAndZeroToken() public {
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.Expired.selector);
        router.payERC20WithPermit(
            IERC20(address(token)),
            stealth,
            GROSS,
            0,
            deadline,
            _eph(),
            _erc20Meta(address(token), 0),
            27,
            0,
            0
        );
        vm.warp(deadline - 1);
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.ZeroAddress.selector);
        router.payERC20WithPermit(
            IERC20(address(0)),
            stealth,
            GROSS,
            0,
            deadline,
            _eph(),
            _erc20Meta(address(0), 0),
            27,
            0,
            0
        );
    }

    // ------------------------------------------------------------------ native path

    function _payNative(uint256 gross) internal {
        uint256 net = gross - _fee(gross);
        vm.prank(alice);
        router.payNative{value: gross}(stealth, net, deadline, _eph(), _nativeMeta(net));
    }

    function test_payNative_splitsFeeAndNet() public {
        uint256 gross = 10 ether;
        _payNative(gross);
        assertEq(feeRecipient.balance, _fee(gross));
        assertEq(stealth.balance, gross - _fee(gross));
        assertEq(address(router).balance, 0);
    }

    function test_payNative_emitsFeeCollectedAndAnnouncement() public {
        uint256 gross = 10 ether;
        uint256 net = gross - _fee(gross);
        vm.expectEmit(true, false, false, true, address(router));
        emit FeeCollected(NATIVE, _fee(gross));
        vm.expectEmit(true, true, true, true, address(announcer));
        emit Announcement(1, stealth, address(router), _eph(), _nativeMeta(net));
        _payNative(gross);
    }

    function test_payNative_dustSkipsFeeTransfer() public {
        // Fee recipient that rejects ETH must not block zero-fee dust payments.
        RevertingReceiver rr = new RevertingReceiver();
        GhostPayRouter r = new GhostPayRouter(IERC5564Announcer(address(announcer)), address(rr));
        vm.prank(alice);
        r.payNative{value: 399}(stealth, 399, deadline, _eph(), _nativeMeta(399));
        assertEq(stealth.balance, 399);
    }

    function test_payNative_revertsExpired() public {
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.Expired.selector);
        router.payNative{value: 1 ether}(stealth, 0, deadline, _eph(), _nativeMeta(1 ether));
    }

    function test_payNative_revertsInvalidStealth() public {
        address[3] memory bad = [address(0), address(router), feeRecipient];
        for (uint256 i; i < bad.length; i++) {
            vm.prank(alice);
            vm.expectRevert(IGhostPayRouter.InvalidStealth.selector);
            router.payNative{value: 1 ether}(bad[i], 0, deadline, _eph(), _nativeMeta(1 ether));
        }
    }

    function test_payNative_revertsZeroValue() public {
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.ZeroAmount.selector);
        router.payNative(stealth, 0, deadline, _eph(), _nativeMeta(0));
    }

    function test_payNative_revertsSlippage() public {
        uint256 net = 1 ether - _fee(1 ether);
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.SlippageExceeded.selector);
        router.payNative{value: 1 ether}(stealth, net + 1, deadline, _eph(), _nativeMeta(net));
    }

    function test_payNative_revertsBadEphemeralKey() public {
        uint256 net = 1 ether - _fee(1 ether);
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.InvalidEphemeralKey.selector);
        router.payNative{value: 1 ether}(stealth, net, deadline, hex"02", _nativeMeta(net));
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.InvalidEphemeralKey.selector);
        router.payNative{value: 1 ether}(
            stealth,
            net,
            deadline,
            abi.encodePacked(bytes1(0x04), bytes32(uint256(1))),
            _nativeMeta(net)
        );
    }

    function test_payNative_revertsBadMetadata() public {
        uint256 net = 1 ether - _fee(1 ether);
        bytes[4] memory bad = [
            _nativeMeta(net + 1),
            _meta(0xa9059cbb, NATIVE, net),
            _meta(0xeeeeeeee, address(token), net),
            bytes("")
        ];
        for (uint256 i; i < bad.length; i++) {
            vm.prank(alice);
            vm.expectRevert(IGhostPayRouter.InvalidMetadata.selector);
            router.payNative{value: 1 ether}(stealth, net, deadline, _eph(), bad[i]);
        }
    }

    function test_payNative_revertsWhenStealthRejectsEth() public {
        RevertingReceiver rr = new RevertingReceiver();
        stealth = address(rr);
        uint256 net = 1 ether - _fee(1 ether);
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.NativeTransferFailed.selector);
        router.payNative{value: 1 ether}(stealth, net, deadline, _eph(), _nativeMeta(net));
        assertEq(feeRecipient.balance, 0, "atomic");
    }

    function test_payNative_revertsWhenFeeRecipientRejectsEth() public {
        RevertingReceiver rr = new RevertingReceiver();
        GhostPayRouter r = new GhostPayRouter(IERC5564Announcer(address(announcer)), address(rr));
        uint256 net = 1 ether - _fee(1 ether);
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.NativeTransferFailed.selector);
        r.payNative{value: 1 ether}(stealth, net, deadline, _eph(), _nativeMeta(net));
    }

    function test_payNative_stealthContractCannotReenter() public {
        ReentrantReceiver rc = new ReentrantReceiver();
        stealth = address(rc);
        uint256 gross = 1 ether;
        uint256 net = gross - _fee(gross);
        vm.deal(address(rc), 1 ether);
        rc.arm(
            address(router),
            abi.encodeCall(
                router.payNative,
                (makeAddr("x"), 0, deadline, _eph(), _nativeMeta(0.5 ether - _fee(0.5 ether)))
            ),
            0.5 ether,
            false
        );
        vm.prank(alice);
        router.payNative{value: gross}(stealth, net, deadline, _eph(), _nativeMeta(net));
        assertEq(rc.attempts(), 1);
        assertFalse(rc.lastSuccess(), "reentry blocked");
        assertEq(address(router).balance, 0);
    }

    function test_payNative_stealthReentryBubbleReverts() public {
        ReentrantReceiver rc = new ReentrantReceiver();
        stealth = address(rc);
        uint256 net = 1 ether - _fee(1 ether);
        rc.arm(
            address(router),
            abi.encodeCall(router.payNative, (makeAddr("x"), 0, deadline, _eph(), _nativeMeta(0))),
            0,
            true
        );
        vm.prank(alice);
        vm.expectRevert(IGhostPayRouter.NativeTransferFailed.selector);
        router.payNative{value: 1 ether}(stealth, net, deadline, _eph(), _nativeMeta(net));
    }

    function test_payNative_gasBurningStealthReverts() public {
        GasBurnReceiver g = new GasBurnReceiver();
        stealth = address(g);
        uint256 net = 1 ether - _fee(1 ether);
        vm.prank(alice);
        vm.expectRevert(); // out of gas inside the call -> NativeTransferFailed or OOG for caller
        router.payNative{value: 1 ether, gas: 300_000}(
            stealth, net, deadline, _eph(), _nativeMeta(net)
        );
    }

    // ------------------------------------------------------------------ buffer path

    function _payBuffer(uint256 buffer, uint256 maxBuffer) internal {
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        router.payERC20WithBuffer{value: buffer}(
            IERC20(address(token)),
            stealth,
            GROSS,
            net,
            deadline,
            maxBuffer,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    function test_buffer_forwardsValueWithoutFee() public {
        _payBuffer(0.01 ether, 0.01 ether);
        assertEq(stealth.balance, 0.01 ether);
        assertEq(feeRecipient.balance, 0, "no fee on buffer");
        assertEq(token.balanceOf(stealth), GROSS - _fee(GROSS));
        assertEq(token.balanceOf(feeRecipient), _fee(GROSS));
        assertEq(address(router).balance, 0);
    }

    function test_buffer_announcesErc20Metadata() public {
        uint256 net = GROSS - _fee(GROSS);
        vm.expectEmit(true, true, true, true, address(announcer));
        emit Announcement(1, stealth, address(router), _eph(), _erc20Meta(address(token), net));
        _payBuffer(0.01 ether, 1 ether);
    }

    function test_buffer_revertsBufferRequired() public {
        vm.expectRevert(IGhostPayRouter.BufferRequired.selector);
        this.payBufferExternal(0, 1 ether);
    }

    function test_buffer_revertsBufferTooLarge() public {
        vm.expectRevert(IGhostPayRouter.BufferTooLarge.selector);
        this.payBufferExternal(0.02 ether, 0.01 ether);
    }

    /// @dev Calls `_payBuffer` as alice; `buffer` is paid by this contract's forwarded msg.value.
    function payBufferExternal(uint256 buffer, uint256 maxBuffer) external payable {
        if (buffer == 0) {
            uint256 net = GROSS - _fee(GROSS);
            vm.prank(alice);
            router.payERC20WithBuffer(
                IERC20(address(token)),
                stealth,
                GROSS,
                net,
                deadline,
                maxBuffer,
                _eph(),
                _erc20Meta(address(token), net)
            );
        } else {
            _payBuffer(buffer, maxBuffer);
        }
    }

    function test_buffer_revertsWhenStealthRejectsEth() public {
        RevertingReceiver rr = new RevertingReceiver();
        stealth = address(rr);
        vm.expectRevert(IGhostPayRouter.NativeTransferFailed.selector);
        this.payBufferExternal(0.01 ether, 1 ether);
    }

    function test_buffer_revertsOnTokenFailure() public {
        vm.prank(alice);
        token.approve(address(router), 0);
        vm.expectRevert();
        this.payBufferExternal(0.01 ether, 1 ether);
    }

    // ------------------------------------------------------------------ no direct ETH, no admin

    function test_receive_reverts() public {
        vm.prank(alice);
        (bool ok, bytes memory ret) = address(router).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(bytes4(ret), IGhostPayRouter.NoDirectETH.selector);
    }

    function test_fallback_reverts() public {
        (bool ok, bytes memory ret) = address(router).call(hex"deadbeef");
        assertFalse(ok);
        assertEq(bytes4(ret), IGhostPayRouter.NoDirectETH.selector);
        (ok, ret) = address(router).call("");
        assertFalse(ok);
    }

    function test_fallback_withValueReverts() public {
        vm.prank(alice);
        (bool ok,) = address(router).call{value: 1}(hex"deadbeef");
        assertFalse(ok);
        assertEq(address(router).balance, 0);
    }

    function test_noAdminSurface() public view {
        // Only the documented selectors exist: probe common admin selectors.
        bytes4[8] memory admin = [
            bytes4(keccak256("owner()")),
            bytes4(keccak256("transferOwnership(address)")),
            bytes4(keccak256("pause()")),
            bytes4(keccak256("setFeeRecipient(address)")),
            bytes4(keccak256("setFee(uint256)")),
            bytes4(keccak256("rescue(address)")),
            bytes4(keccak256("upgradeTo(address)")),
            bytes4(keccak256("sweep(address)"))
        ];
        for (uint256 i; i < admin.length; i++) {
            (bool ok,) = address(router).staticcall(abi.encodeWithSelector(admin[i], address(1)));
            assertFalse(ok);
        }
    }
}
