// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {GhostPayPayRelay} from "../src/GhostPayPayRelay.sol";
import {GhostPayPayerDelegate} from "../src/GhostPayPayerDelegate.sol";
import {ChainGuard} from "../src/ChainGuard.sol";
import {IGhostPayPayRelay} from "../src/interfaces/IGhostPayPayRelay.sol";
import {IGhostPayRouter} from "ghostpay-contracts/interfaces/IGhostPayRouter.sol";
import {NoReturnToken} from "ghostpay-mocks/NoReturnToken.sol";
import {FalseReturnToken} from "ghostpay-mocks/FalseReturnToken.sol";
import {FeeOnTransferToken} from "ghostpay-mocks/FeeOnTransferToken.sol";
import {ReentrantToken} from "ghostpay-mocks/ReentrantToken.sol";
import {MockERC20} from "ghostpay-mocks/MockERC20.sol";
import {SpyRouter} from "./mocks/SpyRouter.sol";
import {Wallet1271} from "./mocks/Wallet1271.sol";
import {PHBase} from "./PHBase.t.sol";

contract GhostPayPayRelayTest is PHBase {
    GhostPayPayRelay internal relay;

    function setUp() public override {
        super.setUp();
        relay = new GhostPayPayRelay();
        token.mint(payer, 10 * GROSS);
        vm.prank(payer);
        token.approve(address(relay), type(uint256).max);
    }

    // ---------- helpers ----------

    function _intent(address tok, address routerAddr, address to, uint256 gross, bytes memory data)
        internal
        view
        returns (IGhostPayPayRelay.PayIntent memory i)
    {
        i = IGhostPayPayRelay.PayIntent({
            payer: payer,
            router: routerAddr,
            token: tok,
            stealth: to,
            gross: gross,
            sponsorFee: SPONSOR_FEE,
            sponsorFeeTo: sponsorFeeTo,
            deadline: T0 + 1 hours,
            nonce: 1,
            payloadHash: keccak256(data)
        });
    }

    function _digest(IGhostPayPayRelay.PayIntent memory i) internal view returns (bytes32) {
        return
            _typed(relay.DOMAIN_SEPARATOR(), keccak256(abi.encode(relay.PAYINTENT_TYPEHASH(), i)));
    }

    function _signIntent(IGhostPayPayRelay.PayIntent memory i)
        internal
        view
        returns (bytes memory)
    {
        return _sig(payerPk, _digest(i));
    }

    function _noPermit() internal pure returns (IGhostPayPayRelay.PermitSig memory) {
        return IGhostPayPayRelay.PermitSig({value: 0, deadline: 0, v: 0, r: 0, s: 0});
    }

    function _plain()
        internal
        view
        returns (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig)
    {
        data = _plainCalldata(address(token), stealth, GROSS);
        i = _intent(address(token), address(router), stealth, GROSS, data);
        sig = _signIntent(i);
    }

    function _pay(IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig)
        internal
    {
        vm.prank(sponsor);
        relay.pay(i, data, sig, _noPermit());
    }

    // ---------- happy paths ----------

    function test_pay_plainRouter() public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        uint256 payerBefore = token.balanceOf(payer);
        vm.recordLogs();
        _pay(i, data, sig);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(token.balanceOf(stealth), GROSS - _fee(GROSS), "stealth net");
        assertEq(token.balanceOf(feeRecipient), _fee(GROSS), "router fee");
        assertEq(token.balanceOf(sponsorFeeTo), SPONSOR_FEE, "sponsor fee");
        assertEq(token.balanceOf(address(relay)), 0, "relay empty");
        assertEq(payerBefore - token.balanceOf(payer), GROSS + SPONSOR_FEE, "payer debit");
        assertEq(token.allowance(address(relay), address(router)), 0, "no residual allowance");
        assertTrue(relay.nonceUsed(payer, 1));
        assertEq(sponsor.balance, 0);

        // The router saw the relay as msg.sender: the ERC-5564 `caller` is the router, FeeCollected fired,
        // and the relay's own Paid event carries neither payer nor stealth.
        bool paidSeen;
        for (uint256 k; k < logs.length; ++k) {
            if (logs[k].emitter == address(relay)) {
                assertEq(logs[k].topics[0], IGhostPayPayRelay.Paid.selector);
                assertEq(logs[k].topics.length, 3, "token+router indexed only");
                assertEq(address(uint160(uint256(logs[k].topics[1]))), address(token));
                assertEq(address(uint160(uint256(logs[k].topics[2]))), address(router));
                (uint256 g, uint256 f) = abi.decode(logs[k].data, (uint256, uint256));
                assertEq(g, GROSS);
                assertEq(f, SPONSOR_FEE);
                paidSeen = true;
            }
            assertTrue(
                logs[k].emitter != address(relay) || logs[k].data.length == 64,
                "Paid data = 2 words"
            );
        }
        assertTrue(paidSeen);
    }

    function test_pay_policyRouter() public {
        bytes memory data = _policyCalldata(address(token), GROSS);
        IGhostPayPayRelay.PayIntent memory i =
            _intent(address(token), address(policyRouter), policyStealth, GROSS, data);
        _pay(i, data, _signIntent(i));
        assertEq(token.balanceOf(policyStealth), GROSS - _fee(GROSS));
        assertEq(token.balanceOf(address(relay)), 0);
        assertEq(token.balanceOf(sponsorFeeTo), SPONSOR_FEE);
    }

    function test_pay_zeroSponsorFee() public {
        bytes memory data = _plainCalldata(address(token), stealth, GROSS);
        IGhostPayPayRelay.PayIntent memory i =
            _intent(address(token), address(router), stealth, GROSS, data);
        i.sponsorFee = 0;
        i.sponsorFeeTo = address(0);
        _pay(i, data, _signIntent(i));
        assertEq(token.balanceOf(stealth), GROSS - _fee(GROSS));
        assertEq(token.balanceOf(address(relay)), 0);
    }

    function test_routerSeesRelayAsSender() public {
        SpyRouter spy = new SpyRouter();
        bytes memory data = _plainCalldata(address(token), stealth, GROSS);
        IGhostPayPayRelay.PayIntent memory i =
            _intent(address(token), address(spy), stealth, GROSS, data);
        _pay(i, data, _signIntent(i));
        assertEq(spy.lastCaller(), address(relay));
        assertTrue(spy.lastCaller() != payer);
    }

    function test_pay_noReturnToken() public {
        NoReturnToken t = new NoReturnToken();
        t.mint(payer, 10 * GROSS);
        vm.prank(payer);
        t.approve(address(relay), type(uint256).max);
        bytes memory data = _plainCalldata(address(t), stealth, GROSS);
        IGhostPayPayRelay.PayIntent memory i =
            _intent(address(t), address(router), stealth, GROSS, data);
        _pay(i, data, _signIntent(i));
        assertEq(t.balanceOf(stealth), GROSS - _fee(GROSS));
        assertEq(t.balanceOf(address(relay)), 0);
    }

    // ---------- permit ----------

    function _permitSig(address owner, uint256 pk, uint256 value, uint256 deadline)
        internal
        view
        returns (IGhostPayPayRelay.PermitSig memory p)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                owner,
                address(relay),
                value,
                ptoken.nonces(owner),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _typed(ptoken.DOMAIN_SEPARATOR(), structHash));
        p = IGhostPayPayRelay.PermitSig({value: value, deadline: deadline, v: v, r: r, s: s});
    }

    function _permitIntent()
        internal
        returns (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig)
    {
        ptoken.mint(payer, 10 * GROSS);
        data = _plainCalldata(address(ptoken), stealth, GROSS);
        i = _intent(address(ptoken), address(router), stealth, GROSS, data);
        sig = _signIntent(i);
    }

    function test_pay_withPermit_noNativeOnPayer() public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig) =
            _permitIntent();
        assertEq(payer.balance, 0);
        IGhostPayPayRelay.PermitSig memory p =
            _permitSig(payer, payerPk, GROSS + SPONSOR_FEE, T0 + 1 hours);
        vm.prank(sponsor);
        relay.pay(i, data, sig, p);
        assertEq(ptoken.balanceOf(stealth), GROSS - _fee(GROSS));
        assertEq(ptoken.balanceOf(sponsorFeeTo), SPONSOR_FEE);
        assertEq(payer.balance, 0);
        assertEq(ptoken.allowance(payer, address(relay)), 0, "permit allowance fully consumed");
    }

    function test_pay_frontRunPermitDoesNotBlock() public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig) =
            _permitIntent();
        IGhostPayPayRelay.PermitSig memory p =
            _permitSig(payer, payerPk, GROSS + SPONSOR_FEE, T0 + 1 hours);
        // attacker front-runs the permit with the same signature
        ptoken.permit(payer, address(relay), p.value, p.deadline, p.v, p.r, p.s);
        vm.prank(sponsor);
        relay.pay(i, data, sig, p);
        assertEq(ptoken.balanceOf(stealth), GROSS - _fee(GROSS));
    }

    function test_pay_permitValueTooLow() public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig) =
            _permitIntent();
        IGhostPayPayRelay.PermitSig memory p = _permitSig(payer, payerPk, GROSS, T0 + 1 hours);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.InvalidAmount.selector);
        relay.pay(i, data, sig, p);
    }

    function test_pay_badPermitAndNoAllowance_reverts() public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig) =
            _permitIntent();
        IGhostPayPayRelay.PermitSig memory p =
            _permitSig(payer, payerPk, GROSS + SPONSOR_FEE, T0 + 1 hours);
        p.r = bytes32(uint256(1)); // invalid permit, no pre-granted allowance
        vm.prank(sponsor);
        vm.expectRevert();
        relay.pay(i, data, sig, p);
    }

    // ---------- reverts ----------

    function test_revert_expired() public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        vm.warp(i.deadline + 1);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.Expired.selector);
        relay.pay(i, data, sig, _noPermit());
    }

    function test_deadline_inclusive() public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        vm.warp(i.deadline);
        _pay(i, data, sig);
        assertEq(token.balanceOf(address(relay)), 0);
    }

    function test_revert_badSignature_wrongKey() public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data,) = _plain();
        bytes memory bad = _sig(uint256(keccak256("other")), _digest(i));
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.BadSignature.selector);
        relay.pay(i, data, bad, _noPermit());
    }

    function test_revert_badSignature_garbage() public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data,) = _plain();
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.BadSignature.selector);
        relay.pay(i, data, hex"1234", _noPermit());
    }

    function test_revert_everySignedFieldIsBound() public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        // sponsor fee
        IGhostPayPayRelay.PayIntent memory m = _copy(i);
        m.sponsorFee = i.sponsorFee + 1;
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.BadSignature.selector);
        relay.pay(m, data, sig, _noPermit());
        // sponsor fee recipient
        m = _copy(i);
        m.sponsorFeeTo = sponsor;
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.BadSignature.selector);
        relay.pay(m, data, sig, _noPermit());
        // nonce
        m = _copy(i);
        m.nonce = 2;
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.BadSignature.selector);
        relay.pay(m, data, sig, _noPermit());
        // deadline
        m = _copy(i);
        m.deadline = i.deadline + 1;
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.BadSignature.selector);
        relay.pay(m, data, sig, _noPermit());
        // router
        m = _copy(i);
        m.router = address(policyRouter);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.BadSignature.selector);
        relay.pay(m, data, sig, _noPermit());
        // payer
        m = _copy(i);
        m.payer = sponsor;
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.BadSignature.selector);
        relay.pay(m, data, sig, _noPermit());
    }

    function test_revert_otherChainSignature() public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data,) = _plain();
        bytes32 structHash = keccak256(abi.encode(relay.PAYINTENT_TYPEHASH(), i));
        bytes32 otherDomain = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("GhostPayPayRelay"),
                keccak256("1"),
                uint256(1),
                address(relay)
            )
        );
        bytes memory sig = _sig(payerPk, _typed(otherDomain, structHash));
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.BadSignature.selector);
        relay.pay(i, data, sig, _noPermit());
    }

    function test_revert_otherRelaySignature() public {
        GhostPayPayRelay other = new GhostPayPayRelay();
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data,) = _plain();
        bytes32 structHash = keccak256(abi.encode(relay.PAYINTENT_TYPEHASH(), i));
        bytes memory sig = _sig(payerPk, _typed(other.DOMAIN_SEPARATOR(), structHash));
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.BadSignature.selector);
        relay.pay(i, data, sig, _noPermit());
    }

    function test_revert_replay() public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        _pay(i, data, sig);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.NonceUsed.selector);
        relay.pay(i, data, sig, _noPermit());
    }

    function test_nonceBitmap_distinctWords() public {
        uint256[4] memory ns = [uint256(0), 255, 256, type(uint256).max];
        for (uint256 k; k < ns.length; ++k) {
            bytes memory data = _plainCalldata(address(token), stealth, GROSS);
            IGhostPayPayRelay.PayIntent memory i =
                _intent(address(token), address(router), stealth, GROSS, data);
            i.nonce = ns[k];
            _pay(i, data, _signIntent(i));
            assertTrue(relay.nonceUsed(payer, ns[k]));
        }
        assertFalse(relay.nonceUsed(payer, 1));
        assertFalse(relay.nonceUsed(payer, 257));
        assertFalse(relay.nonceUsed(sponsor, 0));
    }

    function test_revert_payloadHashMismatch() public {
        (IGhostPayPayRelay.PayIntent memory i,, bytes memory sig) = _plain();
        bytes memory other = _plainCalldata(address(token), stealth, GROSS + 1);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.PayloadMismatch.selector);
        relay.pay(i, other, sig, _noPermit());
    }

    function _signedWithData(bytes memory data)
        internal
        view
        returns (IGhostPayPayRelay.PayIntent memory i, bytes memory sig)
    {
        i = _intent(address(token), address(router), stealth, GROSS, data);
        sig = _signIntent(i);
    }

    function _expectMismatch(bytes memory data) internal {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory sig) = _signedWithData(data);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.PayloadMismatch.selector);
        relay.pay(i, data, sig, _noPermit());
    }

    function test_revert_selectorNotAllowed() public {
        // payERC20WithPermit selector with otherwise matching head words
        bytes memory good = _plainCalldata(address(token), stealth, GROSS);
        bytes memory data = bytes.concat(IGhostPayRouter.payERC20WithPermit.selector, _tail(good));
        _expectMismatch(data);
        // payNative-like and empty/short calldata
        _expectMismatch(hex"");
        _expectMismatch(hex"deadbeef");
        _expectMismatch(abi.encodePacked(IGhostPayRouter.payERC20.selector));
    }

    function test_revert_calldataTokenStealthGrossMustMatchIntent() public {
        // stealth differs from the signed intent stealth
        _expectMismatch(_plainCalldata(address(token), sponsor, GROSS));
        // token differs
        _expectMismatch(_plainCalldata(address(ptoken), stealth, GROSS));
        // gross differs
        _expectMismatch(_plainCalldata(address(token), stealth, GROSS + 1));
    }

    function test_revert_dirtyAddressBits() public {
        bytes memory data = _plainCalldata(address(token), stealth, GROSS);
        // set a high bit in head word 1 (stealth)
        data[4 + 32] = 0x01;
        _expectMismatch(data);
    }

    function test_revert_policyCalldataWrongStealth() public {
        bytes memory data = _policyCalldata(address(token), GROSS);
        IGhostPayPayRelay.PayIntent memory i =
            _intent(address(token), address(policyRouter), stealth, GROSS, data); // stealth != policyStealth
        bytes memory sg = _signIntent(i);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.PayloadMismatch.selector);
        relay.pay(i, data, sg, _noPermit());
    }

    function test_revert_routerReverts() public {
        // router rejects: minNet above net is impossible to satisfy via bad ephemeral key
        bytes memory data = abi.encodeCall(
            IGhostPayRouter.payERC20,
            (
                IERC20(address(token)),
                stealth,
                GROSS,
                GROSS,
                T0 + 1 days,
                _eph(),
                _erc20Meta(address(token), GROSS)
            )
        );
        IGhostPayPayRelay.PayIntent memory i =
            _intent(address(token), address(router), stealth, GROSS, data);
        bytes memory sg = _signIntent(i);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.RouterCallFailed.selector);
        relay.pay(i, data, sg, _noPermit());
    }

    function test_revert_residualAllowance() public {
        SpyRouter spy = new SpyRouter();
        spy.setPullPercent(50);
        bytes memory data = _plainCalldata(address(token), stealth, GROSS);
        IGhostPayPayRelay.PayIntent memory i =
            _intent(address(token), address(spy), stealth, GROSS, data);
        bytes memory sg = _signIntent(i);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.ResidualAllowance.selector);
        relay.pay(i, data, sg, _noPermit());
    }

    function test_revert_routerCallsEOA_noCodeStillCountsAsFailure() public {
        // router address without code: call succeeds trivially but pulls nothing -> residual allowance
        bytes memory data = _plainCalldata(address(token), stealth, GROSS);
        IGhostPayPayRelay.PayIntent memory i =
            _intent(address(token), makeAddr("eoaRouter"), stealth, GROSS, data);
        bytes memory sg = _signIntent(i);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.ResidualAllowance.selector);
        relay.pay(i, data, sg, _noPermit());
    }

    function test_revert_zeroAddressesAndAmounts() public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        IGhostPayPayRelay.PayIntent memory m = _copy(i);
        m.payer = address(0);
        vm.expectRevert(IGhostPayPayRelay.ZeroAddress.selector);
        relay.pay(m, data, sig, _noPermit());
        m = _copy(i);
        m.router = address(0);
        vm.expectRevert(IGhostPayPayRelay.ZeroAddress.selector);
        relay.pay(m, data, sig, _noPermit());
        m = _copy(i);
        m.router = address(relay);
        vm.expectRevert(IGhostPayPayRelay.ZeroAddress.selector);
        relay.pay(m, data, sig, _noPermit());
        m = _copy(i);
        m.token = address(0);
        vm.expectRevert(IGhostPayPayRelay.ZeroAddress.selector);
        relay.pay(m, data, sig, _noPermit());
        m = _copy(i);
        m.token = address(relay);
        vm.expectRevert(IGhostPayPayRelay.ZeroAddress.selector);
        relay.pay(m, data, sig, _noPermit());
        m = _copy(i);
        m.sponsorFeeTo = address(0);
        vm.expectRevert(IGhostPayPayRelay.ZeroAddress.selector);
        relay.pay(m, data, sig, _noPermit());
        m = _copy(i);
        m.sponsorFeeTo = address(relay);
        vm.expectRevert(IGhostPayPayRelay.ZeroAddress.selector);
        relay.pay(m, data, sig, _noPermit());
        m = _copy(i);
        m.gross = 0;
        vm.expectRevert(IGhostPayPayRelay.InvalidAmount.selector);
        relay.pay(m, data, sig, _noPermit());
        m = _copy(i);
        m.sponsorFee = type(uint256).max;
        vm.expectRevert(IGhostPayPayRelay.InvalidAmount.selector);
        relay.pay(m, data, sig, _noPermit());
    }

    // ---------- tokens ----------

    function test_revert_feeOnTransferToken() public {
        FeeOnTransferToken t = new FeeOnTransferToken();
        t.mint(payer, 10 * GROSS);
        vm.prank(payer);
        t.approve(address(relay), type(uint256).max);
        bytes memory data = _plainCalldata(address(t), stealth, GROSS);
        IGhostPayPayRelay.PayIntent memory i =
            _intent(address(t), address(router), stealth, GROSS, data);
        bytes memory sg = _signIntent(i);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.UnexpectedBalanceDelta.selector);
        relay.pay(i, data, sg, _noPermit());
    }

    function test_revert_falseReturnToken() public {
        FalseReturnToken t = new FalseReturnToken();
        t.mint(payer, 10 * GROSS);
        bytes memory data = _plainCalldata(address(t), stealth, GROSS);
        IGhostPayPayRelay.PayIntent memory i =
            _intent(address(t), address(router), stealth, GROSS, data);
        bytes memory sg = _signIntent(i);
        vm.prank(sponsor);
        vm.expectRevert();
        relay.pay(i, data, sg, _noPermit());
    }

    function test_reentrantToken_cannotReenter() public {
        ReentrantToken t = new ReentrantToken();
        t.mint(payer, 10 * GROSS);
        vm.prank(payer);
        t.approve(address(relay), type(uint256).max);
        bytes memory data = _plainCalldata(address(t), stealth, GROSS);
        IGhostPayPayRelay.PayIntent memory i =
            _intent(address(t), address(router), stealth, GROSS, data);
        // second order the attacker would like to run inside the first transferFrom
        IGhostPayPayRelay.PayIntent memory i2 = _copy(i);
        i2.nonce = 77;
        t.arm(
            address(relay),
            abi.encodeCall(relay.pay, (i2, data, _signIntent(i2), _noPermit())),
            false
        );
        _pay(i, data, _signIntent(i));
        assertEq(t.attempts(), 1);
        assertFalse(t.lastSuccess(), "reentry blocked");
        assertEq(bytes4(t.lastReturn()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertFalse(relay.nonceUsed(payer, 77));
        assertEq(t.balanceOf(address(relay)), 0);
    }

    function test_maliciousRouter_cannotReenter() public {
        SpyRouter spy = new SpyRouter();
        bytes memory data = _plainCalldata(address(token), stealth, GROSS);
        IGhostPayPayRelay.PayIntent memory i =
            _intent(address(token), address(spy), stealth, GROSS, data);
        IGhostPayPayRelay.PayIntent memory i2 = _copy(i);
        i2.nonce = 9;
        spy.setReenter(
            address(relay), abi.encodeCall(relay.pay, (i2, data, _signIntent(i2), _noPermit()))
        );
        _pay(i, data, _signIntent(i));
        assertFalse(spy.reenterSuccess());
        assertFalse(relay.nonceUsed(payer, 9));
    }

    function test_donationDoesNotBlockPayments() public {
        token.mint(address(relay), 12_345); // griefing donation
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        _pay(i, data, sig);
        assertEq(token.balanceOf(address(relay)), 12_345, "donation untouched, nothing extra kept");
        assertEq(token.balanceOf(sponsorFeeTo), SPONSOR_FEE);
    }

    // ---------- ERC-1271 payer ----------

    function test_pay_erc1271Payer() public {
        Wallet1271 w = new Wallet1271(payer);
        token.mint(address(w), 10 * GROSS);
        w.approveToken(address(token), address(relay), type(uint256).max);
        bytes memory data = _plainCalldata(address(token), stealth, GROSS);
        IGhostPayPayRelay.PayIntent memory i =
            _intent(address(token), address(router), stealth, GROSS, data);
        i.payer = address(w);
        _pay(i, data, _signIntent(i)); // signed by the wallet's signer key
        assertEq(token.balanceOf(stealth), GROSS - _fee(GROSS));
        assertEq(token.balanceOf(sponsorFeeTo), SPONSOR_FEE);
        // a signature by another key is rejected through isValidSignature
        IGhostPayPayRelay.PayIntent memory j = _copy(i);
        j.nonce = 2;
        bytes memory wrongSig = _sig(uint256(keccak256("x")), _digest(j));
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.BadSignature.selector);
        relay.pay(j, data, wrongSig, _noPermit());
    }

    // ---------- adversarial behaviour documented by audit findings ----------

    /// @dev Audit C-03: the payer can invalidate a signed order before inclusion (spend or revoke); the
    /// sponsor's transaction then reverts and the sponsor loses the gas. Funds of the payer are untouched.
    function test_payerCanInvalidateOrderBeforeInclusion() public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        vm.prank(payer);
        token.approve(address(relay), 0);
        vm.prank(sponsor);
        vm.expectRevert();
        relay.pay(i, data, sig, _noPermit());
        assertFalse(relay.nonceUsed(payer, 1));
        assertEq(token.balanceOf(sponsorFeeTo), 0);
    }

    /// @dev Audit C-03: anyone who sees the order may submit it first; the sponsor fee still goes to the
    /// signed `sponsorFeeTo`, and the sponsor's own transaction reverts with NonceUsed.
    function test_frontRunnerSubmittingTheOrderStillPaysTheSponsor() public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        vm.prank(makeAddr("frontRunner"));
        relay.pay(i, data, sig, _noPermit());
        assertEq(token.balanceOf(sponsorFeeTo), SPONSOR_FEE);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.NonceUsed.selector);
        relay.pay(i, data, sig, _noPermit());
    }

    /// @dev Audit C-05: an EOA that already carries EIP-7702 delegation code is verified through ERC-1271
    /// (OpenZeppelin `SignatureChecker` branches on `code.length`); the PH-3 delegate has no
    /// `isValidSignature`, so a delegated payer cannot be a PH-2 payer.
    function test_delegatedEoaCannotBeAPh2Payer() public {
        GhostPayPayerDelegate d = new GhostPayPayerDelegate();
        vm.signAndAttachDelegation(address(d), payerPk);
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.BadSignature.selector);
        relay.pay(i, data, sig, _noPermit());
    }

    // ---------- chain guard ----------

    function test_constructor_chainGuard() public {
        uint256[3] memory ok = [uint256(31_337), 11_155_111, 84_532];
        for (uint256 k; k < 3; ++k) {
            vm.chainId(ok[k]);
            new GhostPayPayRelay();
        }
        uint256[4] memory bad = [uint256(1), 10, 8453, 42_161];
        for (uint256 k; k < 4; ++k) {
            vm.chainId(bad[k]);
            vm.expectRevert(abi.encodeWithSelector(ChainGuard.UnsupportedChain.selector, bad[k]));
            new GhostPayPayRelay();
        }
    }

    // ---------- fuzz ----------

    function testFuzz_pay_accounting(uint96 gross, uint96 fee, uint8 decimalsSel) public {
        gross = uint96(bound(gross, 400, type(uint96).max / 4));
        fee = uint96(bound(fee, 0, type(uint96).max / 4));
        uint8 dec = decimalsSel % 2 == 0 ? 2 : 18;
        MockERC20 t = new MockERC20("T", "T", dec);
        t.mint(payer, uint256(gross) + fee);
        vm.prank(payer);
        t.approve(address(relay), type(uint256).max);
        bytes memory data = _plainCalldata(address(t), stealth, gross);
        IGhostPayPayRelay.PayIntent memory i =
            _intent(address(t), address(router), stealth, gross, data);
        i.sponsorFee = fee;
        if (fee == 0) i.sponsorFeeTo = address(0);
        _pay(i, data, _signIntent(i));
        assertEq(t.balanceOf(payer), 0, "payer debited exactly gross+fee");
        assertEq(t.balanceOf(stealth), gross - _fee(gross));
        assertEq(t.balanceOf(feeRecipient), _fee(gross));
        assertEq(t.balanceOf(fee == 0 ? address(0) : sponsorFeeTo), fee);
        assertEq(t.balanceOf(address(relay)), 0);
    }

    function testFuzz_tamperedFieldNeverVerifies(uint256 field, uint256 delta) public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        delta = bound(delta, 1, type(uint64).max);
        field = field % 4;
        if (field == 0) i.sponsorFee += delta;
        else if (field == 1) i.deadline += delta;
        else if (field == 2) i.nonce += delta;
        else i.sponsorFeeTo = address(uint160(uint256(uint160(i.sponsorFeeTo)) + delta));
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayRelay.BadSignature.selector);
        relay.pay(i, data, sig, _noPermit());
    }

    function testFuzz_deadlineAndNonce(uint64 warpBy, uint256 nonce) public {
        warpBy = uint64(bound(warpBy, 0, 2 hours));
        bytes memory data = _plainCalldata(address(token), stealth, GROSS);
        IGhostPayPayRelay.PayIntent memory i =
            _intent(address(token), address(router), stealth, GROSS, data);
        i.nonce = nonce;
        bytes memory sig = _signIntent(i);
        vm.warp(T0 + warpBy);
        vm.prank(sponsor);
        if (T0 + warpBy > i.deadline) vm.expectRevert(IGhostPayPayRelay.Expired.selector);
        relay.pay(i, data, sig, _noPermit());
        assertEq(relay.nonceUsed(payer, nonce), T0 + warpBy <= i.deadline);
    }

    // ---------- util ----------

    function _copy(IGhostPayPayRelay.PayIntent memory i)
        internal
        pure
        returns (IGhostPayPayRelay.PayIntent memory)
    {
        return abi.decode(abi.encode(i), (IGhostPayPayRelay.PayIntent));
    }

    function _tail(bytes memory data) internal pure returns (bytes memory out) {
        out = new bytes(data.length - 4);
        for (uint256 k; k < out.length; ++k) {
            out[k] = data[k + 4];
        }
    }
}
