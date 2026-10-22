// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {EntryPoint} from "account-abstraction/core/EntryPoint.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation as EpOp} from "account-abstraction/interfaces/PackedUserOperation.sol";

import {GhostPayPayerAccount} from "../src/GhostPayPayerAccount.sol";
import {GhostPayPayerAccountFactory} from "../src/GhostPayPayerAccountFactory.sol";
import {GhostPayVerifyingPaymaster} from "../src/GhostPayVerifyingPaymaster.sol";
import {ChainGuard} from "../src/ChainGuard.sol";
import {IPaymaster, PackedUserOperation as MyOp} from "../src/interfaces/IERC4337.sol";
import {IGhostPayRouter} from "ghostpay-contracts/interfaces/IGhostPayRouter.sol";
import {MockERC20} from "ghostpay-mocks/MockERC20.sol";
import {SpyRouter} from "./mocks/SpyRouter.sol";
import {PHBase} from "./PHBase.t.sol";

contract GhostPayErc4337Test is PHBase {
    EntryPoint internal ep;
    GhostPayPayerAccountFactory internal factory;
    GhostPayVerifyingPaymaster internal paymaster;

    uint256 internal ownerPk;
    address internal owner;
    uint256 internal signerPk;
    address internal signerAddr;
    address internal admin = makeAddr("admin");
    address payable internal bundler = payable(makeAddr("bundler"));
    address payable internal beneficiary = payable(makeAddr("beneficiary"));

    uint256 internal constant SALT = 7;
    uint256 internal constant PM_MAX_FEE = 50 gwei;
    uint256 internal constant PM_MAX_PRIO = 2 gwei;
    uint256 internal constant PM_MAX_PVG = 200_000;

    function setUp() public override {
        super.setUp();
        (owner, ownerPk) = makeAddrAndKey("accountOwner");
        (signerAddr, signerPk) = makeAddrAndKey("pmSigner");
        ep = new EntryPoint();
        factory = new GhostPayPayerAccountFactory(address(ep));
        paymaster = new GhostPayVerifyingPaymaster(
            address(ep), signerAddr, admin, PM_MAX_FEE, PM_MAX_PRIO, PM_MAX_PVG
        );
        vm.deal(address(this), 100 ether);
        paymaster.deposit{value: 10 ether}();
        token.mint(factory.getAddress(owner, SALT), 10 * GROSS); // counterfactual account holds tokens, no ETH
    }

    // ---------- op building ----------

    function _account() internal view returns (address) {
        return factory.getAddress(owner, SALT);
    }

    function _calls(address routerAddr, uint256 gross, uint256 fee)
        internal
        view
        returns (GhostPayPayerAccount.Call[] memory c)
    {
        c = new GhostPayPayerAccount.Call[](4);
        c[0] = GhostPayPayerAccount.Call(
            address(token), 0, abi.encodeCall(IERC20.approve, (routerAddr, gross))
        );
        c[1] = GhostPayPayerAccount.Call(
            routerAddr, 0, _plainCalldata(address(token), stealth, gross)
        );
        c[2] = GhostPayPayerAccount.Call(
            address(token), 0, abi.encodeCall(IERC20.approve, (routerAddr, 0))
        );
        c[3] = GhostPayPayerAccount.Call(
            address(token), 0, abi.encodeCall(IERC20.transfer, (sponsorFeeTo, fee))
        );
    }

    function _baseOp(bytes memory callData, bool withInit) internal view returns (EpOp memory op) {
        op.sender = _account();
        op.nonce = 0;
        op.initCode = withInit
            ? abi.encodePacked(
                address(factory), abi.encodeCall(factory.createAccount, (owner, SALT))
            )
            : new bytes(0);
        op.callData = callData;
        op.accountGasLimits = bytes32(abi.encodePacked(uint128(1_500_000), uint128(1_000_000)));
        op.preVerificationGas = 100_000;
        op.gasFees = bytes32(abi.encodePacked(uint128(1 gwei), uint128(1 gwei)));
    }

    function _my(EpOp memory o) internal pure returns (MyOp memory m) {
        m = MyOp(
            o.sender,
            o.nonce,
            o.initCode,
            o.callData,
            o.accountGasLimits,
            o.preVerificationGas,
            o.gasFees,
            o.paymasterAndData,
            o.signature
        );
    }

    function _pmData(
        EpOp memory op,
        uint48 validUntil,
        uint48 validAfter,
        uint256 pk,
        address pm,
        uint256 chainId
    ) internal pure returns (bytes memory) {
        bytes memory head = abi.encodePacked(pm, uint128(300_000), uint128(50_000));
        op.paymasterAndData = abi.encodePacked(head, validUntil, validAfter, new bytes(65));
        bytes32 h = _paymasterHash(op, validUntil, validAfter, pm, chainId);
        bytes memory sig = _sig(pk, MessageHashUtils.toEthSignedMessageHash(h));
        return abi.encodePacked(head, validUntil, validAfter, sig);
    }

    /// @dev Independent recomputation of the documented signed hash (not a call to paymaster.getHash).
    function _paymasterHash(
        EpOp memory op,
        uint48 validUntil,
        uint48 validAfter,
        address pm,
        uint256 chainId
    ) internal pure returns (bytes32) {
        bytes32 h1 = keccak256(
            abi.encode(
                op.sender,
                op.nonce,
                keccak256(op.initCode),
                keccak256(op.callData),
                op.accountGasLimits,
                op.preVerificationGas,
                op.gasFees
            )
        );
        bytes32 pmGas;
        bytes memory pmd = op.paymasterAndData;
        assembly ("memory-safe") {
            pmGas := mload(add(pmd, 52)) // bytes [20:52]
        }
        return keccak256(abi.encode(h1, pmGas, chainId, pm, validUntil, validAfter));
    }

    function _ownerSign(EpOp memory op) internal view returns (bytes memory) {
        return _sig(ownerPk, ep.getUserOpHash(op));
    }

    function _fullOp(bool withInit) internal view returns (EpOp memory op) {
        op = _baseOp(
            abi.encodeCall(
                GhostPayPayerAccount.executeBatch, (_calls(address(router), GROSS, SPONSOR_FEE))
            ),
            withInit
        );
        op.paymasterAndData = _pmData(
            op, uint48(T0 + 1 hours), uint48(T0 - 1), signerPk, address(paymaster), block.chainid
        );
        op.signature = _ownerSign(op);
    }

    function _handle(EpOp memory op) internal {
        EpOp[] memory ops = new EpOp[](1);
        ops[0] = op;
        vm.prank(bundler);
        ep.handleOps(ops, beneficiary);
    }

    // ---------- happy path ----------

    function test_counterfactualAccount_paysThroughPaymaster_zeroNative() public {
        EpOp memory op = _fullOp(true);
        address acct = _account();
        assertEq(acct.code.length, 0, "not deployed yet");
        assertEq(acct.balance, 0);
        uint256 depositBefore = ep.balanceOf(address(paymaster));

        vm.recordLogs();
        _handle(op);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertGt(acct.code.length, 0, "deployed by initCode");
        assertEq(acct.balance, 0, "account native stays zero");
        assertEq(GhostPayPayerAccount(payable(acct)).OWNER(), owner);
        assertEq(token.balanceOf(stealth), GROSS - _fee(GROSS));
        assertEq(token.balanceOf(feeRecipient), _fee(GROSS));
        assertEq(token.balanceOf(sponsorFeeTo), SPONSOR_FEE);
        assertEq(token.balanceOf(acct), 10 * GROSS - GROSS - SPONSOR_FEE);
        assertEq(token.allowance(acct, address(router)), 0);
        assertLt(ep.balanceOf(address(paymaster)), depositBefore, "paymaster paid gas");
        assertGt(beneficiary.balance, 0, "bundler beneficiary compensated");

        bool success;
        for (uint256 k; k < logs.length; ++k) {
            if (logs[k].topics[0] == IEntryPoint.UserOperationEvent.selector) {
                (, success,,) = abi.decode(logs[k].data, (uint256, bool, uint256, uint256));
            }
        }
        assertTrue(success, "UserOperationEvent.success");
    }

    function test_routerSeesAccountAsSender() public {
        SpyRouter spy = new SpyRouter();
        EpOp memory op = _baseOp(
            abi.encodeCall(
                GhostPayPayerAccount.executeBatch, (_calls(address(spy), GROSS, SPONSOR_FEE))
            ),
            true
        );
        op.paymasterAndData =
            _pmData(op, uint48(T0 + 1 hours), 0, signerPk, address(paymaster), block.chainid);
        op.signature = _ownerSign(op);
        _handle(op);
        assertEq(spy.lastCaller(), _account());
    }

    function test_secondOp_noInitCode_replayProtectedByNonce() public {
        _handle(_fullOp(true));
        token.mint(_account(), GROSS);
        EpOp memory op2 = _baseOp(
            abi.encodeCall(
                GhostPayPayerAccount.executeBatch, (_calls(address(router), GROSS, SPONSOR_FEE))
            ),
            false
        );
        op2.nonce = 1;
        op2.paymasterAndData =
            _pmData(op2, uint48(T0 + 1 hours), 0, signerPk, address(paymaster), block.chainid);
        op2.signature = _ownerSign(op2);
        _handle(op2);
        // replaying op2 fails on the nonce (AA25)
        EpOp[] memory ops = new EpOp[](1);
        ops[0] = op2;
        vm.prank(bundler);
        vm.expectRevert(
            abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA25 invalid account nonce")
        );
        ep.handleOps(ops, beneficiary);
    }

    function test_factory_addressMatchesIndependentCreate2() public {
        bytes32 salt = keccak256(abi.encode(owner, SALT));
        bytes32 h = keccak256(
            bytes.concat(type(GhostPayPayerAccount).creationCode, abi.encode(address(ep), owner))
        );
        address expect = address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(factory), salt, h))))
        );
        assertEq(factory.getAddress(owner, SALT), expect);
        GhostPayPayerAccount a = factory.createAccount(owner, SALT);
        assertEq(address(a), expect);
        // idempotent
        assertEq(address(factory.createAccount(owner, SALT)), expect);
        // different owner or salt -> different address
        assertTrue(factory.getAddress(owner, SALT + 1) != expect);
        assertTrue(factory.getAddress(sponsor, SALT) != expect);
    }

    // ---------- CONTRACTS-POOLS-01: self-bundled op with attacker-chosen gas fields ----------

    /// @dev Signs a valid sponsored op with the given fee fields and pvg and self-bundles it with an
    /// attacker beneficiary; returns the paymaster deposit lost (0 when the op is refused).
    function _selfBundleLoss(uint128 maxPriority, uint128 maxFee, uint256 pvg)
        internal
        returns (uint256 lost)
    {
        EpOp memory op = _baseOp(
            abi.encodeCall(
                GhostPayPayerAccount.executeBatch, (_calls(address(router), GROSS, SPONSOR_FEE))
            ),
            true
        );
        op.accountGasLimits = bytes32(abi.encodePacked(uint128(500_000), uint128(200_000)));
        op.preVerificationGas = pvg;
        op.gasFees = bytes32(abi.encodePacked(maxPriority, maxFee));
        op.paymasterAndData =
            _pmData(op, uint48(T0 + 1 hours), 0, signerPk, address(paymaster), block.chainid);
        op.signature = _ownerSign(op);
        EpOp[] memory ops = new EpOp[](1);
        ops[0] = op;
        vm.fee(1 gwei);
        vm.txGasPrice(1 gwei);
        uint256 before = ep.balanceOf(address(paymaster));
        address payable attacker = payable(makeAddr("attacker"));
        vm.prank(attacker);
        try ep.handleOps(ops, attacker) {} catch {}
        lost = before - ep.balanceOf(address(paymaster));
    }

    function test_pools01_selfBundleHighFees_refused() public {
        assertEq(_selfBundleLoss(90 gwei, 90 gwei, 50_000), 0, "deposit drained via tip");
    }

    function test_pools01_selfBundleHugePvg_refused() public {
        assertEq(_selfBundleLoss(2 gwei, 2 gwei, 5_000_000), 0, "deposit drained via pvg");
    }

    function test_pools01_capsEnforcedInValidation() public {
        EpOp memory op = _baseOp("", false);
        // exactly at the caps: accepted
        op.gasFees = bytes32(abi.encodePacked(uint128(PM_MAX_PRIO), uint128(PM_MAX_FEE)));
        op.preVerificationGas = PM_MAX_PVG;
        op.paymasterAndData =
            _pmData(op, uint48(T0 + 1 hours), 0, signerPk, address(paymaster), block.chainid);
        vm.prank(address(ep));
        (, uint256 vd) = paymaster.validatePaymasterUserOp(_my(op), bytes32(0), 0);
        assertEq(vd & type(uint160).max, 0, "at caps: valid");
        // one above each cap: reverts even with a valid signature
        for (uint256 k; k < 3; ++k) {
            EpOp memory o = _baseOp("", false);
            o.gasFees = bytes32(abi.encodePacked(uint128(PM_MAX_PRIO), uint128(PM_MAX_FEE)));
            o.preVerificationGas = PM_MAX_PVG;
            if (k == 0) {
                o.gasFees = bytes32(abi.encodePacked(uint128(PM_MAX_PRIO), uint128(PM_MAX_FEE + 1)));
            }
            if (k == 1) {
                o.gasFees = bytes32(abi.encodePacked(uint128(PM_MAX_PRIO + 1), uint128(PM_MAX_FEE)));
            }
            if (k == 2) o.preVerificationGas = PM_MAX_PVG + 1;
            o.paymasterAndData =
                _pmData(o, uint48(T0 + 1 hours), 0, signerPk, address(paymaster), block.chainid);
            vm.prank(address(ep));
            vm.expectRevert(GhostPayVerifyingPaymaster.GasAboveCap.selector);
            paymaster.validatePaymasterUserOp(_my(o), bytes32(0), 0);
        }
        assertEq(paymaster.MAX_FEE_PER_GAS(), PM_MAX_FEE);
        assertEq(paymaster.MAX_PRIORITY_FEE_PER_GAS(), PM_MAX_PRIO);
        assertEq(paymaster.MAX_PRE_VERIFICATION_GAS(), PM_MAX_PVG);
    }

    function test_pools01_selfBundleAboveCap_failsAA33() public {
        EpOp memory op = _baseOp(
            abi.encodeCall(
                GhostPayPayerAccount.executeBatch, (_calls(address(router), GROSS, SPONSOR_FEE))
            ),
            true
        );
        op.gasFees = bytes32(abi.encodePacked(uint128(90 gwei), uint128(90 gwei)));
        op.paymasterAndData =
            _pmData(op, uint48(T0 + 1 hours), 0, signerPk, address(paymaster), block.chainid);
        op.signature = _ownerSign(op);
        EpOp[] memory ops = new EpOp[](1);
        ops[0] = op;
        vm.prank(bundler);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA33 reverted",
                abi.encodeWithSelector(GhostPayVerifyingPaymaster.GasAboveCap.selector)
            )
        );
        ep.handleOps(ops, beneficiary);
    }

    function test_pools01_constructorRejectsBadCaps() public {
        vm.expectRevert(GhostPayVerifyingPaymaster.BadGasCap.selector);
        new GhostPayVerifyingPaymaster(address(ep), signerAddr, admin, 0, PM_MAX_PRIO, PM_MAX_PVG);
        vm.expectRevert(GhostPayVerifyingPaymaster.BadGasCap.selector);
        new GhostPayVerifyingPaymaster(address(ep), signerAddr, admin, PM_MAX_FEE, 0, PM_MAX_PVG);
        vm.expectRevert(GhostPayVerifyingPaymaster.BadGasCap.selector);
        new GhostPayVerifyingPaymaster(address(ep), signerAddr, admin, PM_MAX_FEE, PM_MAX_PRIO, 0);
        vm.expectRevert(GhostPayVerifyingPaymaster.BadGasCap.selector);
        new GhostPayVerifyingPaymaster(address(ep), signerAddr, admin, 1 gwei, 2 gwei, PM_MAX_PVG);
    }

    // ---------- paymaster rejections ----------

    function _expectFailedOp(EpOp memory op, string memory reason) internal {
        EpOp[] memory ops = new EpOp[](1);
        ops[0] = op;
        vm.prank(bundler);
        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, reason));
        ep.handleOps(ops, beneficiary);
    }

    function test_paymaster_rejectsOtherSigner() public {
        EpOp memory op = _baseOp(
            abi.encodeCall(
                GhostPayPayerAccount.executeBatch, (_calls(address(router), GROSS, SPONSOR_FEE))
            ),
            true
        );
        op.paymasterAndData = _pmData(
            op,
            uint48(T0 + 1 hours),
            0,
            uint256(keccak256("evil")),
            address(paymaster),
            block.chainid
        );
        op.signature = _ownerSign(op);
        _expectFailedOp(op, "AA34 signature error");
    }

    function test_paymaster_rejectsExpired() public {
        EpOp memory op = _baseOp(
            abi.encodeCall(
                GhostPayPayerAccount.executeBatch, (_calls(address(router), GROSS, SPONSOR_FEE))
            ),
            true
        );
        op.paymasterAndData =
            _pmData(op, uint48(T0 - 1), 0, signerPk, address(paymaster), block.chainid);
        op.signature = _ownerSign(op);
        _expectFailedOp(op, "AA32 paymaster expired or not due");
    }

    function test_paymaster_rejectsNotYetValid() public {
        EpOp memory op = _baseOp(
            abi.encodeCall(
                GhostPayPayerAccount.executeBatch, (_calls(address(router), GROSS, SPONSOR_FEE))
            ),
            true
        );
        op.paymasterAndData = _pmData(
            op,
            uint48(T0 + 1 hours),
            uint48(T0 + 10 minutes),
            signerPk,
            address(paymaster),
            block.chainid
        );
        op.signature = _ownerSign(op);
        _expectFailedOp(op, "AA32 paymaster expired or not due");
    }

    function test_paymaster_rejectsWrongChainInSignedData() public {
        EpOp memory op = _baseOp(
            abi.encodeCall(
                GhostPayPayerAccount.executeBatch, (_calls(address(router), GROSS, SPONSOR_FEE))
            ),
            true
        );
        op.paymasterAndData = _pmData(op, uint48(T0 + 1 hours), 0, signerPk, address(paymaster), 1);
        op.signature = _ownerSign(op);
        _expectFailedOp(op, "AA34 signature error");
    }

    function test_paymaster_rejectsWrongPaymasterInSignedData() public {
        EpOp memory op = _baseOp(
            abi.encodeCall(
                GhostPayPayerAccount.executeBatch, (_calls(address(router), GROSS, SPONSOR_FEE))
            ),
            true
        );
        op.paymasterAndData = _pmData(
            op, uint48(T0 + 1 hours), 0, signerPk, makeAddr("otherPaymaster"), block.chainid
        );
        // paymaster address is also the first 20 bytes of paymasterAndData: restore ours but keep the foreign-signed digest
        bytes memory pd = op.paymasterAndData;
        bytes20 ours = bytes20(address(paymaster));
        for (uint256 k; k < 20; ++k) {
            pd[k] = ours[k];
        }
        op.paymasterAndData = pd;
        op.signature = _ownerSign(op);
        _expectFailedOp(op, "AA34 signature error");
    }

    function test_paymaster_bindsSenderAndCallData() public {
        // Sign for one callData, submit a different callData (owner re-signs so only the paymaster check can fail).
        EpOp memory op = _baseOp(
            abi.encodeCall(
                GhostPayPayerAccount.executeBatch, (_calls(address(router), GROSS, SPONSOR_FEE))
            ),
            true
        );
        op.paymasterAndData =
            _pmData(op, uint48(T0 + 1 hours), 0, signerPk, address(paymaster), block.chainid);
        op.callData = abi.encodeCall(
            GhostPayPayerAccount.executeBatch, (_calls(address(router), GROSS, SPONSOR_FEE + 1))
        );
        op.signature = _ownerSign(op);
        _expectFailedOp(op, "AA34 signature error");
    }

    function test_paymaster_bindsGasFields() public {
        EpOp memory op = _baseOp(
            abi.encodeCall(
                GhostPayPayerAccount.executeBatch, (_calls(address(router), GROSS, SPONSOR_FEE))
            ),
            true
        );
        op.paymasterAndData =
            _pmData(op, uint48(T0 + 1 hours), 0, signerPk, address(paymaster), block.chainid);
        op.preVerificationGas += 1;
        op.signature = _ownerSign(op);
        _expectFailedOp(op, "AA34 signature error");
    }

    function test_paymaster_directCallsAndBadData() public {
        MyOp memory m;
        vm.expectRevert(GhostPayVerifyingPaymaster.NotEntryPoint.selector);
        paymaster.validatePaymasterUserOp(m, bytes32(0), 0);
        vm.prank(address(ep));
        vm.expectRevert(GhostPayVerifyingPaymaster.BadPaymasterData.selector);
        paymaster.validatePaymasterUserOp(m, bytes32(0), 0);
        // validUntil == 0 refused
        EpOp memory op = _baseOp("", false);
        op.paymasterAndData = abi.encodePacked(
            address(paymaster), uint128(1), uint128(1), uint48(0), uint48(0), new bytes(65)
        );
        vm.prank(address(ep));
        vm.expectRevert(GhostPayVerifyingPaymaster.NoExpiry.selector);
        paymaster.validatePaymasterUserOp(_my(op), bytes32(0), 0);
        // postOp always reverts
        vm.expectRevert(GhostPayVerifyingPaymaster.PostOpUnsupported.selector);
        paymaster.postOp(IPaymaster.PostOpMode.opSucceeded, "", 0, 0);
    }

    function test_paymaster_validationDataPacking() public {
        EpOp memory op = _baseOp("", false);
        op.paymasterAndData = _pmData(op, 5000, 100, signerPk, address(paymaster), block.chainid);
        vm.prank(address(ep));
        (bytes memory ctx, uint256 vd) = paymaster.validatePaymasterUserOp(_my(op), bytes32(0), 0);
        assertEq(ctx.length, 0);
        assertEq(
            vd,
            (uint256(5000) << 160) | (uint256(100) << 208),
            "sigFailed=0, validUntil, validAfter"
        );
        op.paymasterAndData =
            _pmData(op, 5000, 100, uint256(keccak256("evil")), address(paymaster), block.chainid);
        vm.prank(address(ep));
        (, vd) = paymaster.validatePaymasterUserOp(_my(op), bytes32(0), 0);
        assertEq(vd & type(uint160).max, 1, "sigFailed");
    }

    // ---------- account rejections ----------

    function test_account_rejectsWrongOwnerSignature() public {
        EpOp memory op = _baseOp(
            abi.encodeCall(
                GhostPayPayerAccount.executeBatch, (_calls(address(router), GROSS, SPONSOR_FEE))
            ),
            true
        );
        op.paymasterAndData =
            _pmData(op, uint48(T0 + 1 hours), 0, signerPk, address(paymaster), block.chainid);
        op.signature = _sig(uint256(keccak256("notOwner")), ep.getUserOpHash(op));
        _expectFailedOp(op, "AA24 signature error");
        op.signature = hex"1234";
        _expectFailedOp(op, "AA24 signature error");
    }

    function test_account_onlyEntryPoint() public {
        GhostPayPayerAccount a = factory.createAccount(owner, SALT);
        GhostPayPayerAccount.Call[] memory none = new GhostPayPayerAccount.Call[](0);
        vm.expectRevert(GhostPayPayerAccount.NotEntryPoint.selector);
        a.executeBatch(none);
        vm.prank(owner); // even the owner cannot bypass the EntryPoint
        vm.expectRevert(GhostPayPayerAccount.NotEntryPoint.selector);
        a.executeBatch(none);
        MyOp memory m;
        vm.expectRevert(GhostPayPayerAccount.NotEntryPoint.selector);
        a.validateUserOp(m, bytes32(0), 0);
    }

    function test_account_batchFailureRevertsAll() public {
        GhostPayPayerAccount a = factory.createAccount(owner, SALT);
        GhostPayPayerAccount.Call[] memory c = new GhostPayPayerAccount.Call[](2);
        c[0] = GhostPayPayerAccount.Call(
            address(token), 0, abi.encodeCall(IERC20.transfer, (sponsor, 1))
        );
        c[1] = GhostPayPayerAccount.Call(
            address(token), 0, abi.encodeCall(IERC20.transfer, (sponsor, type(uint256).max))
        );
        vm.prank(address(ep));
        vm.expectRevert();
        a.executeBatch(c);
        assertEq(token.balanceOf(sponsor), 0);
    }

    function test_account_prefundPath_withoutPaymaster() public {
        // Without a paymaster the account must prefund the EntryPoint itself.
        EpOp memory op = _baseOp(
            abi.encodeCall(
                GhostPayPayerAccount.executeBatch, (_calls(address(router), GROSS, SPONSOR_FEE))
            ),
            true
        );
        op.signature = _ownerSign(op);
        EpOp[] memory ops = new EpOp[](1);
        ops[0] = op;
        vm.prank(bundler);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(GhostPayPayerAccount.PrefundFailed.selector)
            )
        );
        ep.handleOps(ops, beneficiary);
        vm.deal(_account(), 10 ether);
        _handle(op);
        assertEq(token.balanceOf(stealth), GROSS - _fee(GROSS));
    }

    // ---------- admin / constructors ----------

    function test_paymaster_adminOnly() public {
        vm.expectRevert(GhostPayVerifyingPaymaster.NotAdmin.selector);
        paymaster.withdrawTo(payable(sponsor), 1);
        vm.expectRevert(GhostPayVerifyingPaymaster.NotAdmin.selector);
        paymaster.addStake{value: 1 ether}(1);
        vm.expectRevert(GhostPayVerifyingPaymaster.NotAdmin.selector);
        paymaster.unlockStake();
        vm.expectRevert(GhostPayVerifyingPaymaster.NotAdmin.selector);
        paymaster.withdrawStake(payable(sponsor));

        vm.deal(admin, 5 ether);
        vm.startPrank(admin);
        paymaster.withdrawTo(payable(sponsor), 1 ether);
        paymaster.addStake{value: 1 ether}(1 days);
        paymaster.unlockStake();
        vm.stopPrank();
        assertEq(sponsor.balance, 1 ether);
        vm.warp(T0 + 2 days);
        vm.prank(admin);
        paymaster.withdrawStake(payable(sponsor));
        assertEq(sponsor.balance, 2 ether);
    }

    function test_paymaster_depositByAnyone() public {
        uint256 b = ep.balanceOf(address(paymaster));
        vm.deal(sponsor, 1 ether);
        vm.prank(sponsor);
        paymaster.deposit{value: 1 ether}();
        assertEq(ep.balanceOf(address(paymaster)), b + 1 ether);
    }

    function test_constructors_zeroAddressAndNoCode() public {
        vm.expectRevert(GhostPayPayerAccountFactory.ZeroAddress.selector);
        new GhostPayPayerAccountFactory(address(0));
        vm.expectRevert(GhostPayPayerAccountFactory.ZeroAddress.selector);
        new GhostPayPayerAccountFactory(makeAddr("noCode"));
        vm.expectRevert(GhostPayPayerAccount.ZeroAddress.selector);
        new GhostPayPayerAccount(address(0), owner);
        vm.expectRevert(GhostPayPayerAccount.ZeroAddress.selector);
        new GhostPayPayerAccount(address(ep), address(0));
        vm.expectRevert(GhostPayPayerAccount.ZeroAddress.selector);
        new GhostPayPayerAccount(makeAddr("noCode"), owner);
        vm.expectRevert(GhostPayVerifyingPaymaster.ZeroAddress.selector);
        new GhostPayVerifyingPaymaster(
            address(0), signerAddr, admin, PM_MAX_FEE, PM_MAX_PRIO, PM_MAX_PVG
        );
        vm.expectRevert(GhostPayVerifyingPaymaster.ZeroAddress.selector);
        new GhostPayVerifyingPaymaster(
            address(ep), address(0), admin, PM_MAX_FEE, PM_MAX_PRIO, PM_MAX_PVG
        );
        vm.expectRevert(GhostPayVerifyingPaymaster.ZeroAddress.selector);
        new GhostPayVerifyingPaymaster(
            address(ep), signerAddr, address(0), PM_MAX_FEE, PM_MAX_PRIO, PM_MAX_PVG
        );
        vm.expectRevert(GhostPayVerifyingPaymaster.ZeroAddress.selector);
        new GhostPayVerifyingPaymaster(
            makeAddr("noCode"), signerAddr, admin, PM_MAX_FEE, PM_MAX_PRIO, PM_MAX_PVG
        );
    }

    function test_constructors_chainGuard() public {
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(ChainGuard.UnsupportedChain.selector, 1));
        new GhostPayPayerAccountFactory(address(ep));
        vm.expectRevert(abi.encodeWithSelector(ChainGuard.UnsupportedChain.selector, 1));
        new GhostPayPayerAccount(address(ep), owner);
        vm.expectRevert(abi.encodeWithSelector(ChainGuard.UnsupportedChain.selector, 1));
        new GhostPayVerifyingPaymaster(
            address(ep), signerAddr, admin, PM_MAX_FEE, PM_MAX_PRIO, PM_MAX_PVG
        );
        vm.chainId(84_532);
        new GhostPayPayerAccountFactory(address(ep));
        vm.chainId(11_155_111);
        new GhostPayVerifyingPaymaster(
            address(ep), signerAddr, admin, PM_MAX_FEE, PM_MAX_PRIO, PM_MAX_PVG
        );
    }

    // ---------- fuzz ----------

    function testFuzz_paymasterSigBindsEveryField(uint256 field, uint256 delta) public {
        EpOp memory op = _baseOp(
            abi.encodeCall(
                GhostPayPayerAccount.executeBatch, (_calls(address(router), GROSS, SPONSOR_FEE))
            ),
            true
        );
        op.paymasterAndData =
            _pmData(op, uint48(T0 + 1 hours), 0, signerPk, address(paymaster), block.chainid);
        delta = bound(delta, 1, type(uint32).max);
        field %= 4;
        if (field == 0) op.nonce += delta;
        else if (field == 1) op.preVerificationGas += delta;
        else if (field == 2) op.gasFees = bytes32(uint256(op.gasFees) + delta);
        else op.accountGasLimits = bytes32(uint256(op.accountGasLimits) + delta);
        vm.prank(address(ep));
        if (op.preVerificationGas > PM_MAX_PVG || uint128(uint256(op.gasFees)) > PM_MAX_FEE) {
            // beyond the immutable caps the op is refused outright (CONTRACTS-POOLS-01)
            vm.expectRevert(GhostPayVerifyingPaymaster.GasAboveCap.selector);
            paymaster.validatePaymasterUserOp(_my(op), bytes32(0), 0);
            return;
        }
        (, uint256 vd) = paymaster.validatePaymasterUserOp(_my(op), bytes32(0), 0);
        assertEq(vd & type(uint160).max, 1, "any change invalidates the paymaster signature");
    }

    function testFuzz_factoryAddressBoundToOwnerAndSalt(
        address o1,
        address o2,
        uint256 s1,
        uint256 s2
    ) public view {
        vm.assume(o1 != address(0) && o2 != address(0));
        if (o1 == o2 && s1 == s2) {
            assertEq(factory.getAddress(o1, s1), factory.getAddress(o2, s2));
        } else {
            assertTrue(factory.getAddress(o1, s1) != factory.getAddress(o2, s2));
        }
    }
}
