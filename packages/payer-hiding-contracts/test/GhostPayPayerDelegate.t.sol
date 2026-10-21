// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {GhostPayPayerDelegate} from "../src/GhostPayPayerDelegate.sol";
import {ChainGuard} from "../src/ChainGuard.sol";
import {IGhostPayPayerDelegate} from "../src/interfaces/IGhostPayPayerDelegate.sol";
import {IGhostPayRouter} from "ghostpay-contracts/interfaces/IGhostPayRouter.sol";
import {FeeOnTransferToken} from "ghostpay-mocks/FeeOnTransferToken.sol";
import {NoReturnToken} from "ghostpay-mocks/NoReturnToken.sol";
import {ReentrantToken} from "ghostpay-mocks/ReentrantToken.sol";
import {MockERC20} from "ghostpay-mocks/MockERC20.sol";
import {SpyRouter} from "./mocks/SpyRouter.sol";
import {PHBase} from "./PHBase.t.sol";

contract GhostPayPayerDelegateTest is PHBase {
    GhostPayPayerDelegate internal delegate;
    IGhostPayPayerDelegate.PayIntent internal lastIntent;

    function setUp() public override {
        super.setUp();
        delegate = new GhostPayPayerDelegate();
        token.mint(payer, 10 * GROSS); // payer holds tokens and ZERO native
        assertEq(payer.balance, 0);
    }

    // ---------- helpers ----------

    function _delegateTo(address impl) internal {
        Vm.SignedDelegation memory sd = vm.signDelegation(impl, payerPk);
        vm.attachDelegation(sd);
    }

    function _intent(address tok, address routerAddr, address to, uint256 gross, bytes memory data)
        internal
        view
        returns (IGhostPayPayerDelegate.PayIntent memory i)
    {
        i = IGhostPayPayerDelegate.PayIntent({
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

    function _structHash(IGhostPayPayerDelegate.PayIntent memory i)
        internal
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(delegate.PAYINTENT_TYPEHASH(), i));
    }

    function _domain(uint256 chainId, address verifying) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("GhostPayPayerDelegate"),
                keccak256("1"),
                chainId,
                verifying
            )
        );
    }

    /// @dev Signature by the payer key over the domain bound to the payer address on this chain.
    function _signFor(
        IGhostPayPayerDelegate.PayIntent memory i,
        uint256 pk,
        uint256 chainId,
        address verifying
    ) internal view returns (bytes memory) {
        return _sig(pk, _typed(_domain(chainId, verifying), _structHash(i)));
    }

    function _signGood(IGhostPayPayerDelegate.PayIntent memory i)
        internal
        view
        returns (bytes memory)
    {
        return _signFor(i, payerPk, block.chainid, payer);
    }

    function _payer() internal view returns (GhostPayPayerDelegate) {
        return GhostPayPayerDelegate(payable(payer));
    }

    function _plain()
        internal
        view
        returns (IGhostPayPayerDelegate.PayIntent memory i, bytes memory data, bytes memory sig)
    {
        data = _plainCalldata(address(token), stealth, GROSS);
        i = _intent(address(token), address(router), stealth, GROSS, data);
        sig = _signGood(i);
    }

    function _copy(IGhostPayPayerDelegate.PayIntent memory i)
        internal
        pure
        returns (IGhostPayPayerDelegate.PayIntent memory)
    {
        return abi.decode(abi.encode(i), (IGhostPayPayerDelegate.PayIntent));
    }

    // ---------- happy path ----------

    function test_pay_zeroNativePayer_viaSponsor() public {
        (IGhostPayPayerDelegate.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        _delegateTo(address(delegate));
        assertEq(payer.code.length, 23, "0xef0100 || delegate");
        assertEq(bytes3(payer.code), bytes3(0xef0100));
        uint256 before = token.balanceOf(payer);

        vm.prank(sponsor);
        _payer().pay(i, data, sig);

        assertEq(token.balanceOf(stealth), GROSS - _fee(GROSS));
        assertEq(token.balanceOf(feeRecipient), _fee(GROSS));
        assertEq(token.balanceOf(sponsorFeeTo), SPONSOR_FEE);
        assertEq(before - token.balanceOf(payer), GROSS + SPONSOR_FEE);
        assertEq(payer.balance, 0, "payer native stays zero");
        assertEq(token.allowance(payer, address(router)), 0, "PH-3-REQ-4 allowance cleared");
        assertTrue(_payer().nonceUsed(1));
    }

    function test_routerSeesPayerAsMsgSender() public {
        SpyRouter spy = new SpyRouter();
        bytes memory data = _plainCalldata(address(token), stealth, GROSS);
        IGhostPayPayerDelegate.PayIntent memory i =
            _intent(address(token), address(spy), stealth, GROSS, data);
        bytes memory sig = _signGood(i);
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        _payer().pay(i, data, sig);
        assertEq(spy.lastCaller(), payer);
    }

    function test_pay_policyRouter() public {
        bytes memory data = _policyCalldata(address(token), GROSS);
        IGhostPayPayerDelegate.PayIntent memory i =
            _intent(address(token), address(policyRouter), policyStealth, GROSS, data);
        bytes memory sig = _signGood(i);
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        _payer().pay(i, data, sig);
        assertEq(token.balanceOf(policyStealth), GROSS - _fee(GROSS));
    }

    function test_pay_noReturnToken() public {
        NoReturnToken t = new NoReturnToken();
        t.mint(payer, 10 * GROSS);
        bytes memory data = _plainCalldata(address(t), stealth, GROSS);
        IGhostPayPayerDelegate.PayIntent memory i =
            _intent(address(t), address(router), stealth, GROSS, data);
        bytes memory sig = _signGood(i);
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        _payer().pay(i, data, sig);
        assertEq(t.balanceOf(stealth), GROSS - _fee(GROSS));
        assertEq(t.allowance(payer, address(router)), 0);
    }

    function test_delegatedEoaStillReceivesEth() public {
        _delegateTo(address(delegate));
        vm.deal(sponsor, 1 ether);
        vm.prank(sponsor);
        (bool ok,) = payer.call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(payer.balance, 1 ether);
    }

    function test_namespacedStorage_slotZeroUntouched() public {
        (IGhostPayPayerDelegate.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        _payer().pay(i, data, sig);
        // ERC-7201 slot of "ghostpay.payerdelegate.v1" recomputed independently
        bytes32 base = keccak256(abi.encode(uint256(keccak256("ghostpay.payerdelegate.v1")) - 1))
            & ~bytes32(uint256(0xff));
        assertEq(base, bytes32(0x9d7004d76ef74d3509a2cdf67cbe2bd89f87221dc0c90abd32b14484e11e6200));
        bytes32 word0 = keccak256(abi.encode(uint256(0), base)); // mapping(wordIndex => bitmap) at `base`
        assertEq(uint256(vm.load(payer, word0)), 1 << 1, "nonce 1 bit set");
        for (uint256 s; s < 4; ++s) {
            assertEq(vm.load(payer, bytes32(s)), bytes32(0), "classic slots untouched");
        }
    }

    // ---------- signature / binding ----------

    function test_revert_signatureNotByPayer() public {
        (IGhostPayPayerDelegate.PayIntent memory i, bytes memory data,) = _plain();
        bytes memory bad = _signFor(i, uint256(keccak256("other")), block.chainid, payer);
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.BadSignature.selector);
        _payer().pay(i, data, bad);
    }

    function test_revert_wrongChainIdInDomain() public {
        (IGhostPayPayerDelegate.PayIntent memory i, bytes memory data,) = _plain();
        bytes memory bad = _signFor(i, payerPk, 1, payer);
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.BadSignature.selector);
        _payer().pay(i, data, bad);
    }

    function test_revert_wrongVerifyingContractInDomain() public {
        (IGhostPayPayerDelegate.PayIntent memory i, bytes memory data,) = _plain();
        // payer's own key but domain bound to another address (e.g. the implementation)
        bytes memory bad = _signFor(i, payerPk, block.chainid, address(delegate));
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.BadSignature.selector);
        _payer().pay(i, data, bad);
    }

    function test_revert_signatureForAnotherPayerDoesNotReplay() public {
        // A valid order signed by payer A must not work on payer B's delegated EOA.
        (address payerB, uint256 pkB) = makeAddrAndKey("payerB");
        token.mint(payerB, 10 * GROSS);
        vm.signAndAttachDelegation(address(delegate), pkB);
        (IGhostPayPayerDelegate.PayIntent memory i, bytes memory data, bytes memory sigA) = _plain();
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.BadSignature.selector);
        GhostPayPayerDelegate(payable(payerB)).pay(i, data, sigA);
        assertEq(token.balanceOf(payerB), 10 * GROSS);
    }

    function test_revert_everySignedFieldIsBound() public {
        (IGhostPayPayerDelegate.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        _delegateTo(address(delegate));
        IGhostPayPayerDelegate.PayIntent memory m = _copy(i);
        m.sponsorFee += 1;
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.BadSignature.selector);
        _payer().pay(m, data, sig);
        m = _copy(i);
        m.sponsorFeeTo = sponsor;
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.BadSignature.selector);
        _payer().pay(m, data, sig);
        m = _copy(i);
        m.nonce = 2;
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.BadSignature.selector);
        _payer().pay(m, data, sig);
        m = _copy(i);
        m.deadline += 1;
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.BadSignature.selector);
        _payer().pay(m, data, sig);
        m = _copy(i);
        m.router = address(policyRouter);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.BadSignature.selector);
        _payer().pay(m, data, sig);
    }

    function test_revert_replay() public {
        (IGhostPayPayerDelegate.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        _payer().pay(i, data, sig);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.NonceUsed.selector);
        _payer().pay(i, data, sig);
    }

    function test_revert_expired() public {
        (IGhostPayPayerDelegate.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        _delegateTo(address(delegate));
        vm.warp(i.deadline + 1);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.Expired.selector);
        _payer().pay(i, data, sig);
        vm.warp(i.deadline);
        vm.prank(sponsor);
        _payer().pay(i, data, sig); // inclusive deadline
    }

    function test_revert_payloadAndSelector() public {
        (IGhostPayPayerDelegate.PayIntent memory i,, bytes memory sig) = _plain();
        _delegateTo(address(delegate));
        bytes memory other = _plainCalldata(address(token), stealth, GROSS + 1);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.PayloadMismatch.selector);
        _payer().pay(i, other, sig);
        // disallowed selector with consistent payloadHash
        bytes memory good = _plainCalldata(address(token), stealth, GROSS);
        bytes memory bad = good;
        bytes4 sel = IGhostPayRouter.payERC20WithPermit.selector;
        for (uint256 k; k < 4; ++k) {
            bad[k] = sel[k];
        }
        IGhostPayPayerDelegate.PayIntent memory j =
            _intent(address(token), address(router), stealth, GROSS, bad);
        bytes memory sigJ = _signGood(j);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.PayloadMismatch.selector);
        _payer().pay(j, bad, sigJ);
        // intent stealth differs from the calldata stealth
        j = _intent(address(token), address(router), sponsor, GROSS, good);
        sigJ = _signGood(j);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.PayloadMismatch.selector);
        _payer().pay(j, good, sigJ);
    }

    function test_revert_zeroAddressAndAmount() public {
        (IGhostPayPayerDelegate.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        _delegateTo(address(delegate));
        IGhostPayPayerDelegate.PayIntent memory m = _copy(i);
        m.router = address(0);
        vm.expectRevert(IGhostPayPayerDelegate.ZeroAddress.selector);
        _payer().pay(m, data, sig);
        m = _copy(i);
        m.token = address(0);
        vm.expectRevert(IGhostPayPayerDelegate.ZeroAddress.selector);
        _payer().pay(m, data, sig);
        m = _copy(i);
        m.router = payer; // the delegate itself (address(this))
        vm.expectRevert(IGhostPayPayerDelegate.ZeroAddress.selector);
        _payer().pay(m, data, sig);
        m = _copy(i);
        m.token = payer;
        vm.expectRevert(IGhostPayPayerDelegate.ZeroAddress.selector);
        _payer().pay(m, data, sig);
        m = _copy(i);
        m.sponsorFeeTo = address(0);
        vm.expectRevert(IGhostPayPayerDelegate.ZeroAddress.selector);
        _payer().pay(m, data, sig);
        m = _copy(i);
        m.sponsorFeeTo = payer;
        vm.expectRevert(IGhostPayPayerDelegate.ZeroAddress.selector);
        _payer().pay(m, data, sig);
        m = _copy(i);
        m.gross = 0;
        vm.expectRevert(IGhostPayPayerDelegate.InvalidAmount.selector);
        _payer().pay(m, data, sig);
        m = _copy(i);
        m.sponsorFee = type(uint256).max;
        vm.expectRevert(IGhostPayPayerDelegate.InvalidAmount.selector);
        _payer().pay(m, data, sig);
    }

    function test_zeroSponsorFee() public {
        bytes memory data = _plainCalldata(address(token), stealth, GROSS);
        IGhostPayPayerDelegate.PayIntent memory i =
            _intent(address(token), address(router), stealth, GROSS, data);
        i.sponsorFee = 0;
        i.sponsorFeeTo = address(0);
        bytes memory sig = _signGood(i);
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        _payer().pay(i, data, sig);
        assertEq(token.balanceOf(stealth), GROSS - _fee(GROSS));
    }

    // ---------- router / token misbehaviour ----------

    function test_revert_routerReverts() public {
        SpyRouter spy = new SpyRouter();
        spy.setRevert(true);
        bytes memory data = _plainCalldata(address(token), stealth, GROSS);
        IGhostPayPayerDelegate.PayIntent memory i =
            _intent(address(token), address(spy), stealth, GROSS, data);
        bytes memory sig = _signGood(i);
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.RouterCallFailed.selector);
        _payer().pay(i, data, sig);
    }

    function test_revert_residualAllowance() public {
        SpyRouter spy = new SpyRouter();
        spy.setPullPercent(40);
        bytes memory data = _plainCalldata(address(token), stealth, GROSS);
        IGhostPayPayerDelegate.PayIntent memory i =
            _intent(address(token), address(spy), stealth, GROSS, data);
        bytes memory sig = _signGood(i);
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.ResidualAllowance.selector);
        _payer().pay(i, data, sig);
    }

    function test_revert_feeOnTransferToken() public {
        FeeOnTransferToken t = new FeeOnTransferToken();
        t.mint(payer, 10 * GROSS);
        bytes memory data = _plainCalldata(address(t), stealth, GROSS);
        IGhostPayPayerDelegate.PayIntent memory i =
            _intent(address(t), address(router), stealth, GROSS, data);
        bytes memory sig = _signGood(i);
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        vm.expectRevert(); // router's own exact-delta check (UnexpectedBalanceDelta) surfaces as RouterCallFailed
        _payer().pay(i, data, sig);
    }

    function test_revert_debitMismatch_routerRefunds() public {
        // A router that pays back part of the pulled amount makes the payer's debit differ from
        // gross + fee: the delegate must revert instead of silently accepting.
        RefundRouter rr = new RefundRouter();
        token.mint(address(rr), 1000);
        bytes memory data = _plainCalldata(address(token), stealth, GROSS);
        IGhostPayPayerDelegate.PayIntent memory i =
            _intent(address(token), address(rr), stealth, GROSS, data);
        bytes memory sig = _signGood(i);
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.UnexpectedBalanceDelta.selector);
        _payer().pay(i, data, sig);
    }

    function test_reentrantToken_cannotReenter() public {
        ReentrantToken t = new ReentrantToken();
        t.mint(payer, 10 * GROSS);
        bytes memory data = _plainCalldata(address(t), stealth, GROSS);
        IGhostPayPayerDelegate.PayIntent memory i =
            _intent(address(t), address(router), stealth, GROSS, data);
        IGhostPayPayerDelegate.PayIntent memory i2 = _copy(i);
        i2.nonce = 5;
        bytes memory sig = _signGood(i);
        bytes memory sig2 = _signGood(i2);
        t.arm(payer, abi.encodeCall(GhostPayPayerDelegate.pay, (i2, data, sig2)), false);
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        _payer().pay(i, data, sig);
        assertFalse(t.lastSuccess());
        assertEq(
            bytes4(t.lastReturn()), ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector
        );
        assertFalse(_payer().nonceUsed(5));
    }

    // ---------- adversarial behaviour documented by audit findings ----------

    /// @dev Audit C-02: the router address is part of the signed order and is NOT restricted by the
    /// contract. A signed order naming a hostile "router" lets that contract take exactly `gross` (the
    /// approved amount) to itself, never more, and the approval is cleared afterwards.
    function test_hostileRouterCanTakeExactlyGrossAndNoMore() public {
        GreedyRouter g = new GreedyRouter();
        bytes memory data = _plainCalldata(address(token), stealth, GROSS);
        IGhostPayPayerDelegate.PayIntent memory i =
            _intent(address(token), address(g), stealth, GROSS, data);
        bytes memory sig = _signGood(i);
        _delegateTo(address(delegate));

        g.setExtra(1); // tries to pull gross + 1: reverts inside the router, whole order fails
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.RouterCallFailed.selector);
        _payer().pay(i, data, sig);

        g.setExtra(0); // pulls exactly gross to itself: succeeds, the payer lost gross to the hostile router
        vm.prank(sponsor);
        _payer().pay(i, data, sig);
        assertEq(token.balanceOf(address(g)), GROSS);
        assertEq(token.allowance(payer, address(g)), 0);
        assertEq(token.balanceOf(stealth), 0);
    }

    // ---------- implementation safety ----------

    function test_implementationDirectCall_cannotMoveFunds() public {
        // The implementation address holds tokens (e.g. mistakenly sent); nobody can move them.
        token.mint(address(delegate), GROSS * 2);
        bytes memory data = _plainCalldata(address(token), stealth, GROSS);
        IGhostPayPayerDelegate.PayIntent memory i =
            _intent(address(token), address(router), stealth, GROSS, data);
        // signature by payer key, by a random key, and garbage: none can equal address(delegate)
        bytes[3] memory sigs = [
            _signFor(i, payerPk, block.chainid, address(delegate)),
            _signFor(i, uint256(keccak256("rand")), block.chainid, address(delegate)),
            hex"00"
        ];
        for (uint256 k; k < 3; ++k) {
            vm.prank(sponsor);
            vm.expectRevert(IGhostPayPayerDelegate.BadSignature.selector);
            delegate.pay(i, data, sigs[k]);
        }
        assertEq(token.balanceOf(address(delegate)), GROSS * 2);
    }

    function test_noGenericExecuteNoDelegatecall_surface() public {
        // Unknown selectors revert (no fallback): there is no generic execute/multicall entry point.
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        (bool ok,) =
            payer.call(abi.encodeWithSignature("execute(address,uint256,bytes)", sponsor, 0, ""));
        assertFalse(ok);
        vm.prank(sponsor);
        (ok,) = payer.call(abi.encodeWithSignature("initialize(address)", sponsor));
        assertFalse(ok);
        vm.prank(sponsor);
        (ok,) = payer.call(hex"deadbeef");
        assertFalse(ok);
    }

    // ---------- clearing ----------

    function test_clearDelegation_thenOldIntentIsDead() public {
        (IGhostPayPayerDelegate.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        _payer().pay(i, data, sig);

        // clearing authorisation (address 0x0)
        Vm.SignedDelegation memory clear = vm.signDelegation(address(0), payerPk);
        vm.attachDelegation(clear);
        assertEq(payer.code.length, 0, "delegation cleared");

        // re-delegate; the old order's nonce is still used (storage persists), so it cannot replay
        _delegateTo(address(delegate));
        assertEq(payer.code.length, 23);
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.NonceUsed.selector);
        _payer().pay(i, data, sig);
        // and a call to the cleared address does nothing (no code) while cleared
        Vm.SignedDelegation memory clear2 = vm.signDelegation(address(0), payerPk);
        vm.attachDelegation(clear2);
        vm.prank(sponsor);
        (bool ok, bytes memory ret) =
            payer.call(abi.encodeCall(GhostPayPayerDelegate.pay, (i, data, sig)));
        assertTrue(ok);
        assertEq(ret.length, 0);
    }

    // ---------- chain guard ----------

    function test_constructor_chainGuard() public {
        uint256[3] memory ok = [uint256(31_337), 11_155_111, 84_532];
        for (uint256 k; k < 3; ++k) {
            vm.chainId(ok[k]);
            new GhostPayPayerDelegate();
        }
        uint256[3] memory bad = [uint256(1), 10, 8453];
        for (uint256 k; k < 3; ++k) {
            vm.chainId(bad[k]);
            vm.expectRevert(abi.encodeWithSelector(ChainGuard.UnsupportedChain.selector, bad[k]));
            new GhostPayPayerDelegate();
        }
    }

    // ---------- fuzz ----------

    function testFuzz_pay_accounting(uint96 gross, uint96 fee, uint256 nonce) public {
        gross = uint96(bound(gross, 400, type(uint96).max / 4));
        fee = uint96(bound(fee, 0, type(uint96).max / 4));
        MockERC20 t = new MockERC20("T", "T", 18);
        t.mint(payer, uint256(gross) + fee);
        bytes memory data = _plainCalldata(address(t), stealth, gross);
        IGhostPayPayerDelegate.PayIntent memory i =
            _intent(address(t), address(router), stealth, gross, data);
        i.sponsorFee = fee;
        if (fee == 0) i.sponsorFeeTo = address(0);
        i.nonce = nonce;
        bytes memory sig = _signGood(i);
        _delegateTo(address(delegate));
        vm.prank(sponsor);
        _payer().pay(i, data, sig);
        assertEq(t.balanceOf(payer), 0);
        assertEq(t.balanceOf(stealth), gross - _fee(gross));
        assertEq(t.balanceOf(feeRecipient), _fee(gross));
        assertEq(t.allowance(payer, address(router)), 0);
        assertTrue(_payer().nonceUsed(nonce));
        assertEq(payer.balance, 0);
    }

    function testFuzz_tamperNeverVerifies(uint256 field, uint256 delta) public {
        (IGhostPayPayerDelegate.PayIntent memory i, bytes memory data, bytes memory sig) = _plain();
        _delegateTo(address(delegate));
        delta = bound(delta, 1, type(uint64).max);
        field %= 4;
        if (field == 0) i.sponsorFee += delta;
        else if (field == 1) i.deadline += delta;
        else if (field == 2) i.nonce += delta;
        else i.sponsorFeeTo = address(uint160(uint256(uint160(i.sponsorFeeTo)) + delta));
        vm.prank(sponsor);
        vm.expectRevert(IGhostPayPayerDelegate.BadSignature.selector);
        _payer().pay(i, data, sig);
    }
}

/// @notice Router that pulls `gross`, then pays 1000 base units back to the caller.
contract RefundRouter {
    function payERC20(
        IERC20 token,
        address stealth,
        uint256 gross,
        uint256,
        uint256,
        bytes calldata,
        bytes calldata
    ) external {
        token.transferFrom(msg.sender, stealth, gross);
        token.transfer(msg.sender, 1000);
    }
}

/// @notice Hostile router that keeps the tokens it pulls (optionally trying to pull more than approved).
contract GreedyRouter {
    uint256 public extra;

    function setExtra(uint256 e) external {
        extra = e;
    }

    function payERC20(
        IERC20 token,
        address,
        uint256 gross,
        uint256,
        uint256,
        bytes calldata,
        bytes calldata
    ) external {
        token.transferFrom(msg.sender, address(this), gross + extra);
    }
}
