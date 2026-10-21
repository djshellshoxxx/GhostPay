// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PolicyRouterBase} from "./PolicyRouterBase.t.sol";
import {GhostPayPolicyRouter} from "../src/GhostPayPolicyRouter.sol";
import {GhostPayRouter} from "../src/GhostPayRouter.sol";
import {PolicyAccount} from "../src/PolicyAccount.sol";
import {PolicyAccountFactory} from "../src/PolicyAccountFactory.sol";
import {IERC5564Announcer} from "../src/interfaces/IERC5564Announcer.sol";
import {IGhostPayPolicyRouter} from "../src/interfaces/IGhostPayPolicyRouter.sol";
import {IGhostPayRouter} from "../src/interfaces/IGhostPayRouter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {NoReturnToken} from "./mocks/NoReturnToken.sol";
import {FalseReturnToken} from "./mocks/FalseReturnToken.sol";
import {FeeOnTransferToken} from "./mocks/FeeOnTransferToken.sol";
import {BlacklistToken} from "./mocks/BlacklistToken.sol";
import {ReentrantToken} from "./mocks/ReentrantToken.sol";
import {PermitToken} from "./mocks/PermitToken.sol";
import {RevertingReceiver, ReentrantReceiver, GasBurnReceiver} from "./mocks/NativeReceivers.sol";

/// @notice Returns 1 MB of return data on every native receipt (return-data bomb).
contract BombReceiver {
    receive() external payable {
        assembly ("memory-safe") {
            return(0, 1000000)
        }
    }
}

/// @notice Unit tests of the scheme-2 policy router (mirrors GhostPayRouter.t.sol plus policy binding).
contract GhostPayPolicyRouterTest is PolicyRouterBase {
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
            _ref(),
            gross,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    function _payToken(address t, uint256 gross) internal {
        uint256 net = gross - _fee(gross);
        vm.prank(alice);
        router.payERC20(
            IERC20(t), stealth, _ref(), gross, net, deadline, _eph(), _erc20Meta(t, net)
        );
    }

    function _payNative(uint256 gross) internal {
        uint256 net = gross - _fee(gross);
        vm.prank(alice);
        router.payNative{value: gross}(stealth, _ref(), net, deadline, _eph(), _nativeMeta(net));
    }

    function _payBuffer(uint256 buffer, uint256 maxBuffer) internal {
        uint256 net = GROSS - _fee(GROSS);
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
    }

    // ------------------------------------------------------------------ constructor

    function test_constructor_setsImmutables() public view {
        assertEq(address(router.ANNOUNCER()), address(announcer));
        assertEq(router.FEE_RECIPIENT(), feeRecipient);
        assertEq(address(router.FACTORY()), address(factory));
        assertEq(router.FEE_BPS(), 25);
        assertEq(router.BPS(), 10_000);
        assertEq(router.SCHEME_ID(), 0x47500002);
        assertEq(router.SCHEME_ID(), uint256(uint32(bytes4("GP\x00\x02"))));
        assertEq(router.NATIVE(), NATIVE);
    }

    function test_constructor_revertsOnZeroAnnouncer() public {
        vm.expectRevert(IGhostPayPolicyRouter.ZeroAddress.selector);
        new GhostPayPolicyRouter(IERC5564Announcer(address(0)), feeRecipient, factory);
    }

    function test_constructor_revertsOnZeroFeeRecipient() public {
        vm.expectRevert(IGhostPayPolicyRouter.ZeroAddress.selector);
        new GhostPayPolicyRouter(IERC5564Announcer(address(announcer)), address(0), factory);
    }

    function test_constructor_revertsOnZeroFactory() public {
        vm.expectRevert(IGhostPayPolicyRouter.ZeroAddress.selector);
        new GhostPayPolicyRouter(
            IERC5564Announcer(address(announcer)), feeRecipient, PolicyAccountFactory(address(0))
        );
    }

    function test_constructor_revertsWhenFeeRecipientIsRouter() public {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        vm.expectRevert(IGhostPayPolicyRouter.InvalidStealth.selector);
        new GhostPayPolicyRouter(IERC5564Announcer(address(announcer)), predicted, factory);
    }

    function test_constructor_revertsWhenFactoryHasNoCode() public {
        vm.expectRevert(IGhostPayPolicyRouter.FactoryHasNoCode.selector);
        new GhostPayPolicyRouter(
            IERC5564Announcer(address(announcer)),
            feeRecipient,
            PolicyAccountFactory(makeAddr("eoaFactory"))
        );
    }

    function test_errorSelectorsMatchSchemeOneRouter() public pure {
        assertEq(IGhostPayPolicyRouter.ZeroAddress.selector, IGhostPayRouter.ZeroAddress.selector);
        assertEq(
            IGhostPayPolicyRouter.InvalidStealth.selector, IGhostPayRouter.InvalidStealth.selector
        );
        assertEq(
            IGhostPayPolicyRouter.InvalidMetadata.selector, IGhostPayRouter.InvalidMetadata.selector
        );
        assertEq(
            IGhostPayPolicyRouter.UnexpectedBalanceDelta.selector,
            IGhostPayRouter.UnexpectedBalanceDelta.selector
        );
        assertEq(IGhostPayPolicyRouter.FeeCollected.selector, IGhostPayRouter.FeeCollected.selector);
    }

    // ------------------------------------------------------------------ policy binding

    function test_predictionMatchesFactory() public view {
        assertEq(stealth, factory.predictAddress(owner, policyHash));
        assertEq(policyHash, factory.policyHashOf(destination, DELAY, bytes32(0)));
    }

    function test_policy_revertsZeroOwner() public {
        uint256 net = GROSS - _fee(GROSS);
        address zeroOwnerAcct = factory.predictAddress(address(0), policyHash);
        vm.prank(alice);
        vm.expectRevert(IGhostPayPolicyRouter.ZeroAddress.selector);
        router.payERC20(
            IERC20(address(token)),
            zeroOwnerAcct,
            _ref(address(0), policyHash),
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    function test_policy_revertsArbitraryStealth() public {
        address eoa = makeAddr("schemeOneStealth");
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IGhostPayPolicyRouter.NotPolicyAccount.selector, stealth)
        );
        router.payERC20(
            IERC20(address(token)),
            eoa,
            _ref(),
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    function test_policy_revertsWrongOwner() public {
        address other = makeAddr("otherOwner");
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IGhostPayPolicyRouter.NotPolicyAccount.selector, _predict(other, policyHash)
            )
        );
        router.payERC20(
            IERC20(address(token)),
            stealth,
            _ref(other, policyHash),
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    function test_policy_revertsWrongPolicyHash() public {
        bytes32 h = keccak256(abi.encode(destination, DELAY + 1, bytes32(0)));
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IGhostPayPolicyRouter.NotPolicyAccount.selector, _predict(owner, h)
            )
        );
        router.payERC20(
            IERC20(address(token)),
            stealth,
            _ref(owner, h),
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    function test_policy_stealthZeroIsNotPolicyAccount() public {
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IGhostPayPolicyRouter.NotPolicyAccount.selector, stealth)
        );
        router.payERC20(
            IERC20(address(token)),
            address(0),
            _ref(),
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    function test_policy_otherFactoryAccountRejected() public {
        PolicyAccountFactory other =
            new PolicyAccountFactory(address(impl), address(0), 0, feeRecipient);
        address foreign = other.predictAddress(owner, policyHash);
        assertTrue(foreign != stealth);
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IGhostPayPolicyRouter.NotPolicyAccount.selector, stealth)
        );
        router.payERC20(
            IERC20(address(token)),
            foreign,
            _ref(),
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    function test_policy_revertsWhenAccountIsFeeRecipient() public {
        // A fee recipient that is itself a policy account cannot be paid through the router.
        GhostPayPolicyRouter r =
            new GhostPayPolicyRouter(IERC5564Announcer(address(announcer)), stealth, factory);
        vm.prank(alice);
        token.approve(address(r), type(uint256).max);
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        vm.expectRevert(IGhostPayPolicyRouter.InvalidStealth.selector);
        r.payERC20(
            IERC20(address(token)),
            stealth,
            _ref(),
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    function test_policy_counterfactualThenDeployedAccountHoldsFunds() public {
        _pay(GROSS);
        _payNative(1 ether);
        assertEq(stealth.code.length, 0, "counterfactual");
        address acct = factory.deploy(owner, destination, DELAY, bytes32(0));
        assertEq(acct, stealth);
        assertEq(token.balanceOf(acct), GROSS - _fee(GROSS));
        assertEq(acct.balance, 1 ether - _fee(1 ether));
        assertEq(PolicyAccount(payable(acct)).owner(), owner);
        // Deployed clone still accepts both kinds of payment (native with all gas through the proxy).
        _pay(GROSS);
        _payNative(1 ether);
        assertEq(token.balanceOf(acct), 2 * (GROSS - _fee(GROSS)));
        assertEq(acct.balance, 2 * (1 ether - _fee(1 ether)));
    }

    function test_policy_checkedBeforeTokenIsTouched() public {
        // A wrong recipient is rejected before any call to the (here: EOA) token.
        address eoaToken = makeAddr("eoaToken");
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IGhostPayPolicyRouter.NotPolicyAccount.selector, stealth)
        );
        router.payERC20(
            IERC20(eoaToken), alice, _ref(), GROSS, 0, deadline, _eph(), _erc20Meta(eoaToken, 0)
        );
    }

    function test_schemeOneRouterStillWorksForComparison() public {
        GhostPayRouter r1 = new GhostPayRouter(IERC5564Announcer(address(announcer)), feeRecipient);
        vm.prank(alice);
        token.approve(address(r1), GROSS);
        uint256 net = GROSS - _fee(GROSS);
        vm.expectEmit(true, true, true, true, address(announcer));
        emit Announcement(1, stealth, address(r1), _eph(), _erc20Meta(address(token), net));
        vm.prank(alice);
        r1.payERC20(
            IERC20(address(token)),
            stealth,
            GROSS,
            net,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
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

    // ------------------------------------------------------------------ announcement

    function test_announcement_schemeTwoWithRouterAsCaller() public {
        uint256 net = GROSS - _fee(GROSS);
        vm.expectEmit(true, true, true, true, address(announcer));
        emit Announcement(SCHEME, stealth, address(router), _eph(), _erc20Meta(address(token), net));
        _pay(GROSS);
    }

    function test_announcement_metadataLayout() public {
        uint256 net = GROSS - _fee(GROSS);
        vm.recordLogs();
        _pay(GROSS);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter != address(announcer)) continue;
            found = true;
            assertEq(logs[i].topics[1], bytes32(SCHEME));
            assertEq(logs[i].topics[2], bytes32(uint256(uint160(stealth))));
            assertEq(logs[i].topics[3], bytes32(uint256(uint160(address(router)))));
            (bytes memory eph, bytes memory meta) = abi.decode(logs[i].data, (bytes, bytes));
            assertEq(eph, _eph());
            assertEq(meta.length, 57);
            assertEq(uint8(meta[0]), 0xab);
            assertEq(meta, abi.encodePacked(bytes1(0xab), bytes4(0xa9059cbb), address(token), net));
        }
        assertTrue(found);
    }

    function test_announcement_nativeAndBufferUseSchemeTwo() public {
        uint256 net = 1 ether - _fee(1 ether);
        vm.expectEmit(true, true, true, true, address(announcer));
        emit Announcement(SCHEME, stealth, address(router), _eph(), _nativeMeta(net));
        _payNative(1 ether);
        vm.expectEmit(true, true, true, true, address(announcer));
        emit Announcement(
            SCHEME,
            stealth,
            address(router),
            _eph(),
            _erc20Meta(address(token), GROSS - _fee(GROSS))
        );
        _payBuffer(0.01 ether, 0.01 ether);
    }

    // ------------------------------------------------------------------ payERC20 reverts

    function test_payERC20_revertsExpired() public {
        vm.warp(deadline + 1);
        vm.expectRevert(IGhostPayPolicyRouter.Expired.selector);
        _pay(GROSS);
    }

    function test_payERC20_revertsZeroToken() public {
        vm.prank(alice);
        vm.expectRevert(IGhostPayPolicyRouter.ZeroAddress.selector);
        router.payERC20(
            IERC20(address(0)),
            stealth,
            _ref(),
            GROSS,
            0,
            deadline,
            _eph(),
            _erc20Meta(address(0), 0)
        );
    }

    function test_payERC20_revertsZeroGross() public {
        vm.prank(alice);
        vm.expectRevert(IGhostPayPolicyRouter.ZeroAmount.selector);
        router.payERC20(
            IERC20(address(token)),
            stealth,
            _ref(),
            0,
            0,
            deadline,
            _eph(),
            _erc20Meta(address(token), 0)
        );
    }

    function test_payERC20_revertsSlippage() public {
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        vm.expectRevert(IGhostPayPolicyRouter.SlippageExceeded.selector);
        router.payERC20(
            IERC20(address(token)),
            stealth,
            _ref(),
            GROSS,
            net + 1,
            deadline,
            _eph(),
            _erc20Meta(address(token), net)
        );
    }

    function test_payERC20_revertsOverflowingGross() public {
        vm.prank(alice);
        vm.expectRevert(); // checked-arithmetic panic
        router.payERC20(
            IERC20(address(token)),
            stealth,
            _ref(),
            type(uint256).max,
            0,
            deadline,
            _eph(),
            _erc20Meta(address(token), 0)
        );
    }

    function _payEph(bytes memory eph) internal {
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        router.payERC20(
            IERC20(address(token)),
            stealth,
            _ref(),
            GROSS,
            net,
            deadline,
            eph,
            _erc20Meta(address(token), net)
        );
    }

    function test_payERC20_revertsEphemeralKeyWrongLength() public {
        vm.expectRevert(IGhostPayPolicyRouter.InvalidEphemeralKey.selector);
        _payEph(abi.encodePacked(bytes1(0x02), bytes31(0)));
        vm.expectRevert(IGhostPayPolicyRouter.InvalidEphemeralKey.selector);
        _payEph(abi.encodePacked(bytes1(0x04), bytes32(0), bytes32(0)));
        vm.expectRevert(IGhostPayPolicyRouter.InvalidEphemeralKey.selector);
        _payEph("");
    }

    function test_payERC20_revertsEphemeralKeyBadPrefix() public {
        vm.expectRevert(IGhostPayPolicyRouter.InvalidEphemeralKey.selector);
        _payEph(abi.encodePacked(bytes1(0x04), bytes32(uint256(1))));
        vm.expectRevert(IGhostPayPolicyRouter.InvalidEphemeralKey.selector);
        _payEph(abi.encodePacked(bytes1(0x00), bytes32(uint256(1))));
    }

    function test_payERC20_acceptsBothValidPrefixes() public {
        _payEph(abi.encodePacked(bytes1(0x02), bytes32(uint256(1))));
        _payEph(abi.encodePacked(bytes1(0x03), bytes32(uint256(1))));
        assertEq(token.balanceOf(stealth), 2 * (GROSS - _fee(GROSS)));
    }

    function _payWithMeta(bytes memory meta) internal {
        vm.prank(alice);
        router.payERC20(IERC20(address(token)), stealth, _ref(), GROSS, 0, deadline, _eph(), meta);
    }

    function test_payERC20_revertsMetadataWrongLength() public {
        uint256 net = GROSS - _fee(GROSS);
        bytes memory good = _erc20Meta(address(token), net);
        vm.expectRevert(IGhostPayPolicyRouter.InvalidMetadata.selector);
        _payWithMeta(abi.encodePacked(good, bytes1(0)));
        vm.expectRevert(IGhostPayPolicyRouter.InvalidMetadata.selector);
        _payWithMeta(abi.encodePacked(bytes1(0xab), bytes4(0xa9059cbb), address(token)));
    }

    function test_payERC20_revertsMetadataWrongSelector() public {
        uint256 net = GROSS - _fee(GROSS);
        vm.expectRevert(IGhostPayPolicyRouter.InvalidMetadata.selector);
        _payWithMeta(_meta(0xeeeeeeee, address(token), net));
    }

    function test_payERC20_revertsMetadataWrongToken() public {
        uint256 net = GROSS - _fee(GROSS);
        vm.expectRevert(IGhostPayPolicyRouter.InvalidMetadata.selector);
        _payWithMeta(_erc20Meta(NATIVE, net));
    }

    function test_payERC20_revertsMetadataWrongAmount() public {
        uint256 net = GROSS - _fee(GROSS);
        vm.expectRevert(IGhostPayPolicyRouter.InvalidMetadata.selector);
        _payWithMeta(_erc20Meta(address(token), net + 1));
        vm.expectRevert(IGhostPayPolicyRouter.InvalidMetadata.selector);
        _payWithMeta(_erc20Meta(address(token), GROSS));
    }

    function test_payERC20_viewTagIsUnconstrained() public {
        uint256 net = GROSS - _fee(GROSS);
        for (uint256 tag; tag < 256; tag += 51) {
            _payWithMeta(
                abi.encodePacked(bytes1(uint8(tag)), bytes4(0xa9059cbb), address(token), net)
            );
        }
    }

    function test_payERC20_revertsWithoutAllowance() public {
        vm.prank(alice);
        token.approve(address(router), 0);
        vm.expectRevert();
        _pay(GROSS);
    }

    function test_payERC20_revertsTokenIsEOA() public {
        address eoa = makeAddr("eoaToken");
        vm.expectRevert();
        _payToken(eoa, GROSS);
    }

    function test_payERC20_revertsWhenPayerIsStealth() public {
        token.mint(stealth, GROSS);
        vm.prank(stealth);
        token.approve(address(router), type(uint256).max);
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(stealth);
        vm.expectRevert(IGhostPayPolicyRouter.UnexpectedBalanceDelta.selector);
        router.payERC20(
            IERC20(address(token)),
            stealth,
            _ref(),
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
        _payToken(address(t), GROSS);
        assertEq(t.balanceOf(stealth), GROSS - _fee(GROSS));
        assertEq(t.balanceOf(feeRecipient), _fee(GROSS));
        assertEq(t.balanceOf(address(router)), 0);
    }

    function test_falseReturnToken_rejected() public {
        FalseReturnToken t = new FalseReturnToken();
        t.mint(alice, GROSS);
        vm.expectRevert(); // SafeERC20FailedOperation
        _payToken(address(t), GROSS);
    }

    function test_feeOnTransferToken_rejected() public {
        FeeOnTransferToken t = new FeeOnTransferToken();
        t.mint(alice, GROSS);
        vm.prank(alice);
        t.approve(address(router), GROSS);
        vm.expectRevert(IGhostPayPolicyRouter.UnexpectedBalanceDelta.selector);
        _payToken(address(t), GROSS);
    }

    function test_feeOnTransferToken_dustWithoutFeeRejected() public {
        // fee == 0 branch: only the stealth delta is checked, and it is short.
        FeeOnTransferToken t = new FeeOnTransferToken();
        t.mint(alice, GROSS);
        vm.prank(alice);
        t.approve(address(router), GROSS);
        vm.expectRevert(IGhostPayPolicyRouter.UnexpectedBalanceDelta.selector);
        _payToken(address(t), 399);
    }

    function test_blacklistToken_blacklistedStealthReverts() public {
        BlacklistToken t = new BlacklistToken();
        t.mint(alice, GROSS);
        vm.prank(alice);
        t.approve(address(router), GROSS);
        t.setBlacklisted(stealth, true);
        vm.expectRevert(abi.encodeWithSelector(BlacklistToken.Blacklisted.selector, stealth));
        _payToken(address(t), GROSS);
        assertEq(t.balanceOf(feeRecipient), 0, "atomic: fee transfer rolled back");
    }

    function test_decimals_2_6_18() public {
        uint8[3] memory decs = [2, 6, 18];
        for (uint256 i; i < decs.length; i++) {
            MockERC20 t = new MockERC20("T", "T", decs[i]);
            uint256 gross = 12_345 * 10 ** decs[i];
            t.mint(alice, gross);
            vm.prank(alice);
            t.approve(address(router), gross);
            _payToken(address(t), gross);
            assertEq(t.balanceOf(stealth), gross - _fee(gross));
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
            (
                IERC20(address(t)),
                stealth,
                _ref(),
                GROSS,
                net,
                deadline,
                _eph(),
                _erc20Meta(address(t), net)
            )
        );
        t.arm(address(router), inner, false);
        _payToken(address(t), GROSS);
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
        t.arm(
            address(router),
            abi.encodeCall(
                router.payNative, (stealth, _ref(), 0, deadline, _eph(), _nativeMeta(0))
            ),
            true
        );
        vm.expectRevert();
        _payToken(address(t), GROSS);
        assertEq(t.balanceOf(stealth), 0);
    }

    // ------------------------------------------------------------------ permit path

    function _permitSig(PermitToken t, uint256 pk, address o, uint256 value, uint256 dl)
        internal
        view
        returns (IGhostPayPolicyRouter.PermitSig memory sig)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                o,
                address(router),
                value,
                t.nonces(o),
                dl
            )
        );
        (sig.v, sig.r, sig.s) =
            vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", t.DOMAIN_SEPARATOR(), structHash)));
    }

    function _payPermit(address payer, address t, IGhostPayPolicyRouter.PermitSig memory sig)
        internal
    {
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(payer);
        router.payERC20WithPermit(
            IERC20(t), stealth, _ref(), GROSS, net, deadline, _eph(), _erc20Meta(t, net), sig
        );
    }

    function test_payERC20WithPermit_happyPath() public {
        (address payer, uint256 pk) = makeAddrAndKey("payer");
        PermitToken t = new PermitToken(6);
        t.mint(payer, GROSS);
        vm.expectEmit(true, true, true, true, address(announcer));
        emit Announcement(
            SCHEME, stealth, address(router), _eph(), _erc20Meta(address(t), GROSS - _fee(GROSS))
        );
        _payPermit(payer, address(t), _permitSig(t, pk, payer, GROSS, deadline));
        assertEq(t.balanceOf(stealth), GROSS - _fee(GROSS));
        assertEq(t.balanceOf(feeRecipient), _fee(GROSS));
        assertEq(t.allowance(payer, address(router)), 0);
    }

    function test_payERC20WithPermit_frontRunPermitStillSucceeds() public {
        (address payer, uint256 pk) = makeAddrAndKey("payer");
        PermitToken t = new PermitToken(6);
        t.mint(payer, GROSS);
        IGhostPayPolicyRouter.PermitSig memory sig = _permitSig(t, pk, payer, GROSS, deadline);
        t.permit(payer, address(router), GROSS, deadline, sig.v, sig.r, sig.s);
        _payPermit(payer, address(t), sig);
        assertEq(t.balanceOf(stealth), GROSS - _fee(GROSS));
    }

    function test_payERC20WithPermit_invalidPermitAndNoAllowanceReverts() public {
        (address payer,) = makeAddrAndKey("payer");
        (, uint256 otherPk) = makeAddrAndKey("other");
        PermitToken t = new PermitToken(6);
        t.mint(payer, GROSS);
        IGhostPayPolicyRouter.PermitSig memory sig = _permitSig(t, otherPk, payer, GROSS, deadline);
        vm.expectRevert(); // ERC20InsufficientAllowance
        _payPermit(payer, address(t), sig);
    }

    function test_payERC20WithPermit_tokenWithoutPermitButAllowanceWorks() public {
        _payPermit(alice, address(token), _noPermit());
        assertEq(token.balanceOf(stealth), GROSS - _fee(GROSS));
    }

    function test_payERC20WithPermit_revertsExpiredZeroTokenAndPolicy() public {
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(IGhostPayPolicyRouter.Expired.selector);
        router.payERC20WithPermit(
            IERC20(address(token)),
            stealth,
            _ref(),
            GROSS,
            0,
            deadline,
            _eph(),
            _erc20Meta(address(token), 0),
            _noPermit()
        );
        vm.warp(deadline - 1);
        vm.prank(alice);
        vm.expectRevert(IGhostPayPolicyRouter.ZeroAddress.selector);
        router.payERC20WithPermit(
            IERC20(address(0)),
            stealth,
            _ref(),
            GROSS,
            0,
            deadline,
            _eph(),
            _erc20Meta(address(0), 0),
            _noPermit()
        );
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IGhostPayPolicyRouter.NotPolicyAccount.selector, stealth)
        );
        router.payERC20WithPermit(
            IERC20(address(token)),
            alice,
            _ref(),
            GROSS,
            0,
            deadline,
            _eph(),
            _erc20Meta(address(token), 0),
            _noPermit()
        );
        vm.prank(alice);
        vm.expectRevert(IGhostPayPolicyRouter.ZeroAddress.selector);
        router.payERC20WithPermit(
            IERC20(address(token)),
            stealth,
            _ref(address(0), policyHash),
            GROSS,
            0,
            deadline,
            _eph(),
            _erc20Meta(address(token), 0),
            _noPermit()
        );
    }

    function test_payERC20WithPermit_policyCheckedBeforePermit() public {
        // A mismatched recipient must not consume the payer's permit nonce.
        (address payer, uint256 pk) = makeAddrAndKey("payer");
        PermitToken t = new PermitToken(6);
        t.mint(payer, GROSS);
        IGhostPayPolicyRouter.PermitSig memory sig = _permitSig(t, pk, payer, GROSS, deadline);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(IGhostPayPolicyRouter.NotPolicyAccount.selector, stealth)
        );
        router.payERC20WithPermit(
            IERC20(address(t)),
            payer,
            _ref(),
            GROSS,
            0,
            deadline,
            _eph(),
            _erc20Meta(address(t), 0),
            sig
        );
        assertEq(t.nonces(payer), 0);
    }

    // ------------------------------------------------------------------ native path

    function test_payNative_splitsFeeAndNet() public {
        _payNative(1 ether);
        assertEq(feeRecipient.balance, _fee(1 ether));
        assertEq(stealth.balance, 1 ether - _fee(1 ether));
        assertEq(address(router).balance, 0);
    }

    function test_payNative_emitsFeeCollected() public {
        vm.expectEmit(true, false, false, true, address(router));
        emit FeeCollected(NATIVE, _fee(1 ether));
        _payNative(1 ether);
    }

    function test_payNative_dustSkipsFeeTransfer() public {
        vm.recordLogs();
        _payNative(399);
        assertEq(feeRecipient.balance, 0);
        assertEq(stealth.balance, 399);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            assertTrue(logs[i].emitter != address(router));
        }
    }

    function test_payNative_revertsExpired() public {
        vm.warp(deadline + 1);
        vm.expectRevert(IGhostPayPolicyRouter.Expired.selector);
        _payNative(1 ether);
    }

    function test_payNative_revertsPolicyMismatch() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IGhostPayPolicyRouter.NotPolicyAccount.selector, stealth)
        );
        router.payNative{value: 1 ether}(alice, _ref(), 0, deadline, _eph(), _nativeMeta(0));
        vm.prank(alice);
        vm.expectRevert(IGhostPayPolicyRouter.ZeroAddress.selector);
        router.payNative{value: 1 ether}(
            stealth, _ref(address(0), policyHash), 0, deadline, _eph(), _nativeMeta(0)
        );
    }

    function test_payNative_revertsZeroValue() public {
        vm.prank(alice);
        vm.expectRevert(IGhostPayPolicyRouter.ZeroAmount.selector);
        router.payNative(stealth, _ref(), 0, deadline, _eph(), _nativeMeta(0));
    }

    function test_payNative_revertsSlippage() public {
        uint256 net = 1 ether - _fee(1 ether);
        vm.prank(alice);
        vm.expectRevert(IGhostPayPolicyRouter.SlippageExceeded.selector);
        router.payNative{value: 1 ether}(
            stealth, _ref(), net + 1, deadline, _eph(), _nativeMeta(net)
        );
    }

    function test_payNative_revertsBadEphemeralKey() public {
        uint256 net = 1 ether - _fee(1 ether);
        vm.prank(alice);
        vm.expectRevert(IGhostPayPolicyRouter.InvalidEphemeralKey.selector);
        router.payNative{value: 1 ether}(
            stealth,
            _ref(),
            net,
            deadline,
            abi.encodePacked(bytes1(0x04), bytes32(0)),
            _nativeMeta(net)
        );
    }

    function test_payNative_revertsBadMetadata() public {
        uint256 net = 1 ether - _fee(1 ether);
        vm.prank(alice);
        vm.expectRevert(IGhostPayPolicyRouter.InvalidMetadata.selector);
        router.payNative{value: 1 ether}(
            stealth, _ref(), net, deadline, _eph(), _erc20Meta(NATIVE, net)
        );
        vm.prank(alice);
        vm.expectRevert(IGhostPayPolicyRouter.InvalidMetadata.selector);
        router.payNative{value: 1 ether}(
            stealth, _ref(), net, deadline, _eph(), _meta(0xeeeeeeee, address(token), net)
        );
    }

    function test_payNative_revertsWhenStealthRejectsEth() public {
        vm.etch(stealth, address(new RevertingReceiver()).code);
        vm.expectRevert(IGhostPayPolicyRouter.NativeTransferFailed.selector);
        _payNative(1 ether);
        assertEq(feeRecipient.balance, 0, "atomic");
    }

    function test_payNative_revertsWhenFeeRecipientRejectsEth() public {
        RevertingReceiver rr = new RevertingReceiver();
        GhostPayPolicyRouter r =
            new GhostPayPolicyRouter(IERC5564Announcer(address(announcer)), address(rr), factory);
        uint256 net = 1 ether - _fee(1 ether);
        vm.prank(alice);
        vm.expectRevert(IGhostPayPolicyRouter.NativeTransferFailed.selector);
        r.payNative{value: 1 ether}(stealth, _ref(), net, deadline, _eph(), _nativeMeta(net));
    }

    function test_payNative_stealthContractCannotReenter() public {
        vm.etch(stealth, address(new ReentrantReceiver()).code);
        ReentrantReceiver rc = ReentrantReceiver(payable(stealth));
        vm.deal(stealth, 1 ether);
        rc.arm(
            address(router),
            abi.encodeCall(
                router.payNative,
                (stealth, _ref(), 0, deadline, _eph(), _nativeMeta(0.5 ether - _fee(0.5 ether)))
            ),
            0.5 ether,
            false
        );
        _payNative(1 ether);
        assertEq(rc.attempts(), 1);
        assertFalse(rc.lastSuccess(), "reentry blocked");
        assertEq(address(router).balance, 0);
    }

    function test_payNative_gasBurningStealthReverts() public {
        vm.etch(stealth, address(new GasBurnReceiver()).code);
        uint256 net = 1 ether - _fee(1 ether);
        vm.prank(alice);
        vm.expectRevert();
        router.payNative{value: 1 ether, gas: 300_000}(
            stealth, _ref(), net, deadline, _eph(), _nativeMeta(net)
        );
    }

    function test_payNative_returnDataBombBounded() public {
        vm.etch(stealth, address(new BombReceiver()).code);
        uint256 net = 1 ether - _fee(1 ether);
        vm.prank(alice);
        uint256 g = gasleft();
        router.payNative{value: 1 ether}(stealth, _ref(), net, deadline, _eph(), _nativeMeta(net));
        uint256 used = g - gasleft();
        assertEq(stealth.balance, net);
        // The payee's own 1 MB memory expansion dominates; no second copy into the router's memory.
        assertLt(used, 2_400_000);
    }

    // ------------------------------------------------------------------ buffer path

    function test_buffer_forwardsValueWithoutFee() public {
        _payBuffer(0.01 ether, 0.02 ether);
        assertEq(stealth.balance, 0.01 ether);
        assertEq(feeRecipient.balance, 0);
        assertEq(token.balanceOf(stealth), GROSS - _fee(GROSS));
        assertEq(address(router).balance, 0);
    }

    function test_buffer_revertsBufferRequired() public {
        vm.expectRevert(IGhostPayPolicyRouter.BufferRequired.selector);
        _payBuffer(0, 1 ether);
    }

    function test_buffer_revertsBufferTooLarge() public {
        vm.expectRevert(IGhostPayPolicyRouter.BufferTooLarge.selector);
        _payBuffer(0.02 ether, 0.01 ether);
    }

    /// @dev DEVIATIONS R4: policy binding runs before the buffer checks.
    function test_buffer_policyCheckBeforeBufferChecks() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IGhostPayPolicyRouter.NotPolicyAccount.selector, stealth)
        );
        router.payERC20WithBuffer{value: 0}(
            IERC20(address(token)), alice, _ref(), GROSS, 0, block.timestamp + 1, 1, _eph(), ""
        );
    }

    function test_buffer_revertsPolicyMismatch() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IGhostPayPolicyRouter.NotPolicyAccount.selector, stealth)
        );
        router.payERC20WithBuffer{value: 1}(
            IERC20(address(token)),
            alice,
            _ref(),
            GROSS,
            0,
            deadline,
            1,
            _eph(),
            _erc20Meta(address(token), 0)
        );
    }

    function test_buffer_revertsWhenStealthRejectsEth() public {
        vm.etch(stealth, address(new RevertingReceiver()).code);
        vm.expectRevert(IGhostPayPolicyRouter.NativeTransferFailed.selector);
        _payBuffer(0.01 ether, 0.01 ether);
    }

    function test_buffer_revertsOnTokenFailure() public {
        vm.prank(alice);
        token.approve(address(router), 0);
        vm.expectRevert();
        _payBuffer(0.01 ether, 0.01 ether);
        assertEq(stealth.balance, 0);
    }

    // ------------------------------------------------------------------ no direct ETH, no admin

    function test_receive_reverts() public {
        vm.prank(alice);
        (bool ok, bytes memory ret) = address(router).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(bytes4(ret), IGhostPayPolicyRouter.NoDirectETH.selector);
    }

    function test_fallback_reverts() public {
        (bool ok, bytes memory ret) = address(router).call(hex"deadbeef");
        assertFalse(ok);
        assertEq(bytes4(ret), IGhostPayPolicyRouter.NoDirectETH.selector);
    }

    function test_fallback_withValueReverts() public {
        vm.prank(alice);
        (bool ok,) = address(router).call{value: 1}(hex"deadbeef");
        assertFalse(ok);
        assertEq(address(router).balance, 0);
    }

    function test_schemeOneSelectorsAreNotAccepted() public {
        // The scheme-1 ABI (no PolicyRef) hits the reverting fallback, never a payment.
        uint256 net = GROSS - _fee(GROSS);
        vm.prank(alice);
        (bool ok, bytes memory ret) = address(router)
            .call(
                abi.encodeCall(
                    IGhostPayRouter.payERC20,
                    (
                        IERC20(address(token)),
                        stealth,
                        GROSS,
                        net,
                        deadline,
                        _eph(),
                        _erc20Meta(address(token), net)
                    )
                )
            );
        assertFalse(ok);
        assertEq(bytes4(ret), IGhostPayPolicyRouter.NoDirectETH.selector);
        assertEq(token.balanceOf(stealth), 0);
    }

    function test_noAdminSurface() public view {
        bytes4[8] memory admin = [
            bytes4(keccak256("owner()")),
            bytes4(keccak256("transferOwnership(address)")),
            bytes4(keccak256("pause()")),
            bytes4(keccak256("setFeeRecipient(address)")),
            bytes4(keccak256("setFee(uint256)")),
            bytes4(keccak256("rescue(address)")),
            bytes4(keccak256("upgradeTo(address)")),
            bytes4(keccak256("setFactory(address)"))
        ];
        for (uint256 i; i < admin.length; i++) {
            (bool ok,) = address(router).staticcall(abi.encodeWithSelector(admin[i], address(1)));
            assertFalse(ok);
        }
    }

    function test_abiSelectors() public pure {
        assertEq(
            GhostPayPolicyRouter.payERC20.selector,
            bytes4(
                keccak256(
                    "payERC20(address,address,(address,bytes32),uint256,uint256,uint256,bytes,bytes)"
                )
            )
        );
        assertEq(
            GhostPayPolicyRouter.payERC20WithPermit.selector,
            bytes4(
                keccak256(
                    "payERC20WithPermit(address,address,(address,bytes32),uint256,uint256,uint256,bytes,bytes,(uint8,bytes32,bytes32))"
                )
            )
        );
        assertEq(
            GhostPayPolicyRouter.payNative.selector,
            bytes4(keccak256("payNative(address,(address,bytes32),uint256,uint256,bytes,bytes)"))
        );
        assertEq(
            GhostPayPolicyRouter.payERC20WithBuffer.selector,
            bytes4(
                keccak256(
                    "payERC20WithBuffer(address,address,(address,bytes32),uint256,uint256,uint256,uint256,bytes,bytes)"
                )
            )
        );
    }
}
