// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PolicyBase} from "./PolicyBase.t.sol";
import {PolicyAccount} from "../src/PolicyAccount.sol";
import {IPolicyAccount} from "../src/interfaces/IPolicyAccount.sol";
import {PolicyAccountFactory} from "../src/PolicyAccountFactory.sol";
import {FeeOnTransferToken} from "./mocks/FeeOnTransferToken.sol";
import {BlacklistToken} from "./mocks/BlacklistToken.sol";

/// @dev Malicious false-return token that moves balances before reporting failure.
contract FalseAfterTransferToken is ERC20 {
    constructor() ERC20("False after transfer", "FAT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        _spendAllowance(from, _msgSender(), value);
        _transfer(from, to, value);
        return false;
    }
}

/// @dev Returns true and credits the recipient but debits either nothing or an incorrect amount.
contract MisaccountingSuccessToken is ERC20 {
    uint256 public immutable debitAmount;

    constructor(uint256 debitAmount_) ERC20("Misaccounting success", "MST") {
        debitAmount = debitAmount_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        _spendAllowance(from, _msgSender(), value);
        _burn(from, debitAmount);
        _mint(to, value);
        return true;
    }
}
import {ReentrantToken} from "./mocks/ReentrantToken.sol";

/// @notice Unit and fuzz tests of `PolicyAccountFactory`.
contract PolicyAccountFactoryTest is PolicyBase {
    event AccountDeployed(address indexed account);
    event FeeWaived(address indexed account);

    // ------------------------------------------------------------------ constructor

    function test_constructor_storesImmutables() public view {
        assertEq(factory.IMPLEMENTATION(), address(impl));
        assertEq(factory.FEE_TOKEN(), address(feeToken));
        assertEq(factory.FLAT_FEE(), FLAT_FEE);
        assertEq(factory.FEE_RECIPIENT(), feeRecipient);
        assertEq(factory.MAX_DELAY(), 30 days);
    }

    function test_constructor_zeroAddresses_revert() public {
        vm.expectRevert(PolicyAccountFactory.ZeroAddress.selector);
        new PolicyAccountFactory(address(0), address(feeToken), FLAT_FEE, feeRecipient);
        vm.expectRevert(PolicyAccountFactory.ZeroAddress.selector);
        new PolicyAccountFactory(address(impl), address(feeToken), FLAT_FEE, address(0));
        vm.expectRevert(PolicyAccountFactory.ZeroAddress.selector);
        new PolicyAccountFactory(address(impl), address(0), FLAT_FEE, feeRecipient);
    }

    function test_constructor_zeroFeeAllowsZeroToken() public {
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(0), 0, feeRecipient);
        assertEq(f.FEE_TOKEN(), address(0));
        // Deploys without any approval.
        address a = f.deploy(owner, destination, DELAY, root);
        assertGt(a.code.length, 0);
    }

    function test_constructor_implementationWithoutCode_reverts() public {
        vm.expectRevert(PolicyAccountFactory.ImplementationHasNoCode.selector);
        new PolicyAccountFactory(makeAddr("eoa"), address(feeToken), FLAT_FEE, feeRecipient);
    }

    // ------------------------------------------------------------------ deploy

    function test_deploy_happy_chargesFeeOnceAndInitialises() public {
        address predicted =
            factory.predictAddress(owner, factory.policyHashOf(newDest, 2 days, bytes32(0)));
        assertEq(predicted.code.length, 0);
        uint256 payerBefore = feeToken.balanceOf(payer);
        uint256 recBefore = feeToken.balanceOf(feeRecipient);
        vm.expectEmit(true, false, false, true, address(factory));
        emit AccountDeployed(predicted);
        vm.prank(payer);
        address a = factory.deploy(owner, newDest, 2 days, bytes32(0));
        assertEq(a, predicted);
        assertEq(feeToken.balanceOf(payer), payerBefore - FLAT_FEE);
        assertEq(feeToken.balanceOf(feeRecipient), recBefore + FLAT_FEE);
        assertEq(feeToken.balanceOf(address(factory)), 0);
        PolicyAccount p = PolicyAccount(payable(a));
        assertEq(p.owner(), owner);
        assertEq(p.destination(), newDest);
        assertEq(p.delay(), 2 days);
        assertEq(p.limitsRoot(), bytes32(0));
    }

    function test_deploy_addressIndependentOfPayer() public {
        address predicted =
            factory.predictAddress(owner, factory.policyHashOf(newDest, 3 days, root));
        feeToken.mint(relayer, FLAT_FEE);
        vm.startPrank(relayer);
        feeToken.approve(address(factory), FLAT_FEE);
        address a = factory.deploy(owner, newDest, 3 days, root);
        vm.stopPrank();
        assertEq(a, predicted);
    }

    function test_deploy_emitsOnlyAccountDeployed_noOwnerInEvent() public {
        vm.recordLogs();
        vm.prank(payer);
        address a = factory.deploy(owner, newDest, 2 days, root);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 fromFactory;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter != address(factory)) continue;
            fromFactory++;
            assertEq(logs[i].topics.length, 2);
            assertEq(logs[i].topics[0], keccak256("AccountDeployed(address)"));
            assertEq(address(uint160(uint256(logs[i].topics[1]))), a);
            assertEq(logs[i].data.length, 0);
        }
        assertEq(fromFactory, 1);
    }

    function test_deploy_twice_reverts_noSecondFee() public {
        uint256 recBefore = feeToken.balanceOf(feeRecipient);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PolicyAccountFactory.AlreadyDeployed.selector, address(acct))
        );
        factory.deploy(owner, destination, DELAY, root);
        assertEq(feeToken.balanceOf(feeRecipient), recBefore);
    }

    function test_deploy_zeroInputs_revert() public {
        vm.startPrank(payer);
        vm.expectRevert(PolicyAccountFactory.ZeroAddress.selector);
        factory.deploy(address(0), destination, DELAY, root);
        vm.expectRevert(PolicyAccountFactory.ZeroAddress.selector);
        factory.deploy(owner, address(0), DELAY, root);
        vm.stopPrank();
    }

    function test_deploy_delayBounds() public {
        vm.startPrank(payer);
        vm.expectRevert(PolicyAccountFactory.InvalidDelay.selector);
        factory.deploy(owner, newDest, 0, root);
        vm.expectRevert(PolicyAccountFactory.InvalidDelay.selector);
        factory.deploy(owner, newDest, 30 days + 1, root);
        address lo = factory.deploy(owner, newDest, 1 hours, root);
        address hi = factory.deploy(owner, newDest, 30 days, root);
        vm.stopPrank();
        assertEq(PolicyAccount(payable(lo)).delay(), 1 hours);
        assertEq(PolicyAccount(payable(hi)).delay(), 30 days);
    }

    /// @dev I-02: delays below MIN_DELAY are rejected by the factory (zero keeps InvalidDelay).
    function test_deploy_delayBelowMin_reverts() public {
        assertEq(factory.MIN_DELAY(), 1 hours);
        assertEq(factory.MAX_DELAY(), 30 days);
        vm.startPrank(payer);
        vm.expectRevert(abi.encodeWithSelector(PolicyAccountFactory.DelayTooShort.selector, 1));
        factory.deploy(owner, newDest, 1, root);
        vm.expectRevert(
            abi.encodeWithSelector(PolicyAccountFactory.DelayTooShort.selector, 1 hours - 1)
        );
        factory.deploy(owner, newDest, 1 hours - 1, root);
        vm.expectRevert(PolicyAccountFactory.InvalidDelay.selector);
        factory.deploy(owner, newDest, 0, root);
        // Exactly the minimum works and a rejected deploy took no fee.
        uint256 before = feeToken.balanceOf(feeRecipient);
        factory.deploy(owner, newDest, 1 hours, root);
        vm.stopPrank();
        assertEq(feeToken.balanceOf(feeRecipient), before + FLAT_FEE);
    }

    function testFuzz_deploy_delayBelowMin_reverts(uint256 delay) public {
        delay = bound(delay, 1, 1 hours - 1);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(PolicyAccountFactory.DelayTooShort.selector, delay));
        factory.deploy(owner, newDest, delay, root);
    }

    function test_deploy_noAllowance_reverts() public {
        vm.prank(relayer);
        vm.expectRevert(PolicyAccountFactory.FeeTransferFailed.selector);
        factory.deploy(owner, newDest, DELAY, root);
        assertEq(
            factory.predictAddress(owner, factory.policyHashOf(newDest, DELAY, root)).code.length, 0
        );
    }

    function test_deploy_blacklistedRecipientWaivesFeeAndDeploys() public {
        BlacklistToken token = new BlacklistToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FLAT_FEE, feeRecipient);
        token.mint(payer, FLAT_FEE);
        vm.prank(payer);
        token.approve(address(f), FLAT_FEE);
        token.setBlacklisted(feeRecipient, true);
        address predicted = f.predictAddress(owner, f.policyHashOf(newDest, DELAY, root));

        vm.expectEmit(true, false, false, true, address(f));
        emit FeeWaived(predicted);
        vm.prank(payer);
        address deployed = f.deploy(owner, newDest, DELAY, root);

        assertEq(deployed, predicted);
        assertGt(deployed.code.length, 0);
        assertEq(token.balanceOf(payer), FLAT_FEE, "failed fee call did not debit payer");
        assertEq(token.balanceOf(feeRecipient), 0);
        assertEq(PolicyAccount(payable(deployed)).owner(), owner);
    }

    function test_deploy_failedFeeWithInsufficientBalanceDoesNotWaive() public {
        BlacklistToken token = new BlacklistToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FLAT_FEE, feeRecipient);
        token.mint(payer, FLAT_FEE - 1);
        vm.prank(payer);
        token.approve(address(f), FLAT_FEE);
        token.setBlacklisted(feeRecipient, true);
        address predicted = f.predictAddress(owner, f.policyHashOf(newDest, DELAY, root));

        vm.expectRevert(PolicyAccountFactory.FeeTransferFailed.selector);
        vm.prank(payer);
        f.deploy(owner, newDest, DELAY, root);

        assertEq(predicted.code.length, 0);
        assertEq(token.balanceOf(payer), FLAT_FEE - 1);
    }

    function test_deploy_failedFeeWithInsufficientAllowanceDoesNotWaive() public {
        BlacklistToken token = new BlacklistToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FLAT_FEE, feeRecipient);
        token.mint(payer, FLAT_FEE);
        vm.prank(payer);
        token.approve(address(f), FLAT_FEE - 1);
        token.setBlacklisted(feeRecipient, true);
        address predicted = f.predictAddress(owner, f.policyHashOf(newDest, DELAY, root));

        vm.expectRevert(PolicyAccountFactory.FeeTransferFailed.selector);
        vm.prank(payer);
        f.deploy(owner, newDest, DELAY, root);

        assertEq(predicted.code.length, 0);
        assertEq(token.balanceOf(payer), FLAT_FEE);
    }

    function test_deploy_feeFailureCannotBypassInvalidPrerequisites() public {
        BlacklistToken token = new BlacklistToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FLAT_FEE, feeRecipient);
        token.mint(payer, FLAT_FEE);
        vm.prank(payer);
        token.approve(address(f), FLAT_FEE);
        token.setBlacklisted(feeRecipient, true);

        vm.expectRevert(abi.encodeWithSelector(PolicyAccountFactory.DelayTooShort.selector, 1));
        vm.prank(payer);
        f.deploy(owner, newDest, 1, root);
        assertEq(f.predictAddress(owner, f.policyHashOf(newDest, 1, root)).code.length, 0);
    }

    function test_deploy_mutatingFalseReturnFeeTokenRevertsAtomically() public {
        FalseAfterTransferToken token = new FalseAfterTransferToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FLAT_FEE, feeRecipient);
        token.mint(payer, FLAT_FEE);
        vm.prank(payer);
        token.approve(address(f), FLAT_FEE);
        address predicted = f.predictAddress(owner, f.policyHashOf(newDest, DELAY, root));

        vm.expectRevert(PolicyAccountFactory.UnexpectedFeeDelta.selector);
        vm.prank(payer);
        f.deploy(owner, newDest, DELAY, root);

        assertEq(token.balanceOf(payer), FLAT_FEE);
        assertEq(token.balanceOf(feeRecipient), 0);
        assertEq(token.allowance(payer, address(f)), FLAT_FEE);
        assertEq(predicted.code.length, 0);
    }

    function test_deploy_trueReturnWithoutPayerDebitReverts() public {
        MisaccountingSuccessToken token = new MisaccountingSuccessToken(0);
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FLAT_FEE, feeRecipient);
        token.mint(payer, FLAT_FEE);
        vm.prank(payer);
        token.approve(address(f), FLAT_FEE);
        address predicted = f.predictAddress(owner, f.policyHashOf(newDest, DELAY, root));

        vm.expectRevert(PolicyAccountFactory.UnexpectedFeeDelta.selector);
        vm.prank(payer);
        f.deploy(owner, newDest, DELAY, root);

        assertEq(token.balanceOf(payer), FLAT_FEE);
        assertEq(token.balanceOf(feeRecipient), 0);
        assertEq(predicted.code.length, 0);
    }

    function test_deploy_trueReturnWithWrongPayerDebitReverts() public {
        MisaccountingSuccessToken token = new MisaccountingSuccessToken(FLAT_FEE + 1);
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FLAT_FEE, feeRecipient);
        token.mint(payer, FLAT_FEE + 1);
        vm.prank(payer);
        token.approve(address(f), FLAT_FEE);
        address predicted = f.predictAddress(owner, f.policyHashOf(newDest, DELAY, root));

        vm.expectRevert(PolicyAccountFactory.UnexpectedFeeDelta.selector);
        vm.prank(payer);
        f.deploy(owner, newDest, DELAY, root);

        assertEq(token.balanceOf(payer), FLAT_FEE + 1);
        assertEq(token.balanceOf(feeRecipient), 0);
        assertEq(predicted.code.length, 0);
    }

    function test_deploy_gasStarvationCannotTriggerFeeWaiver() public {
        uint256 recipientBefore = feeToken.balanceOf(feeRecipient);
        uint256 deployed;
        for (uint256 gasLimit = 30_000; gasLimit < 400_000; gasLimit += 1500) {
            uint256 snapshot = vm.snapshotState();
            vm.prank(payer);
            (bool ok,) = address(factory).call{gas: gasLimit}(
                abi.encodeCall(factory.deploy, (owner, newDest, DELAY, root))
            );
            if (ok) {
                deployed++;
                assertEq(
                    feeToken.balanceOf(feeRecipient), recipientBefore + FLAT_FEE, "fee charged"
                );
            }
            vm.revertToState(snapshot);
        }
        assertGt(deployed, 0, "range reaches a successful deployment");
    }

    function test_deploy_feeOnTransferFeeToken_reverts() public {
        FeeOnTransferToken fot = new FeeOnTransferToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(fot), 1000, feeRecipient);
        fot.mint(payer, 10_000);
        vm.startPrank(payer);
        fot.approve(address(f), type(uint256).max);
        vm.expectRevert(PolicyAccountFactory.UnexpectedFeeDelta.selector);
        f.deploy(owner, newDest, DELAY, root);
        vm.stopPrank();
        assertEq(fot.balanceOf(payer), 10_000);
    }

    function test_deploy_payerIsRecipient_reverts() public {
        feeToken.mint(feeRecipient, FLAT_FEE);
        vm.startPrank(feeRecipient);
        feeToken.approve(address(factory), type(uint256).max);
        vm.expectRevert(PolicyAccountFactory.UnexpectedFeeDelta.selector);
        factory.deploy(owner, newDest, DELAY, root);
        vm.stopPrank();
    }

    function test_deploy_reentrantFeeToken_isBlocked() public {
        ReentrantToken rt = new ReentrantToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(rt), 5, feeRecipient);
        rt.mint(payer, 100);
        vm.prank(payer);
        rt.approve(address(f), type(uint256).max);
        // During the fee transfer the token tries to deploy another account through the factory.
        rt.arm(address(f), abi.encodeCall(f.deploy, (owner, newDest, 5 days, root)), false);
        vm.prank(payer);
        address a = f.deploy(owner, newDest, DELAY, root);
        assertGt(a.code.length, 0);
        assertEq(rt.attempts(), 1);
        assertFalse(rt.lastSuccess());
        assertEq(f.predictAddress(owner, f.policyHashOf(newDest, 5 days, root)).code.length, 0);
        assertEq(rt.balanceOf(feeRecipient), 5);
    }

    function test_deploy_afterDeploy_cloneRejectsExternalInit() public {
        vm.expectRevert(IPolicyAccount.AlreadyInitialized.selector);
        acct.initialize(owner, destination, DELAY, root);
    }

    // ------------------------------------------------------------------ helpers

    function test_policyHashOf_matchesSpecFormula() public view {
        assertEq(
            factory.policyHashOf(destination, DELAY, root),
            keccak256(abi.encode(destination, DELAY, root))
        );
    }

    function test_predictAddress_matchesDeployed() public view {
        assertEq(factory.predictAddress(owner, acct.policyHash()), address(acct));
    }

    function test_differentFactoryOrImplementation_differentAddresses() public {
        PolicyAccount impl2 = new PolicyAccount();
        PolicyAccountFactory f2 =
            new PolicyAccountFactory(address(impl2), address(feeToken), FLAT_FEE, feeRecipient);
        PolicyAccountFactory f3 =
            new PolicyAccountFactory(address(impl), address(feeToken), FLAT_FEE, feeRecipient);
        bytes32 ph = acct.policyHash();
        assertTrue(f2.predictAddress(owner, ph) != address(acct));
        assertTrue(f3.predictAddress(owner, ph) != address(acct));
        assertTrue(f2.predictAddress(owner, ph) != f3.predictAddress(owner, ph));
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_predictAddress_equalsDeployed(
        address o,
        address d,
        uint256 delay,
        bytes32 limitsRoot,
        address who
    ) public {
        vm.assume(o != address(0) && d != address(0) && d != address(impl));
        vm.assume(who != address(0) && who != address(factory) && who != feeRecipient);
        delay = bound(delay, 1 hours, 30 days);
        address predicted = factory.predictAddress(o, factory.policyHashOf(d, delay, limitsRoot));
        vm.assume(d != predicted);
        feeToken.mint(who, FLAT_FEE);
        vm.startPrank(who);
        feeToken.approve(address(factory), FLAT_FEE);
        address a = factory.deploy(o, d, delay, limitsRoot);
        vm.stopPrank();
        assertEq(a, predicted);
        PolicyAccount p = PolicyAccount(payable(a));
        assertEq(p.owner(), o);
        assertEq(p.destination(), d);
        assertEq(p.delay(), delay);
        assertEq(p.limitsRoot(), limitsRoot);
        assertEq(p.policyHash(), factory.policyHashOf(d, delay, limitsRoot));
    }

    function testFuzz_saltUniqueness(
        address o1,
        address d1,
        uint256 delay1,
        bytes32 r1,
        address o2,
        address d2,
        uint256 delay2,
        bytes32 r2
    ) public view {
        bool same = o1 == o2 && d1 == d2 && delay1 == delay2 && r1 == r2;
        address a1 = factory.predictAddress(o1, factory.policyHashOf(d1, delay1, r1));
        address a2 = factory.predictAddress(o2, factory.policyHashOf(d2, delay2, r2));
        if (same) assertEq(a1, a2);
        else assertTrue(a1 != a2);
    }

    function testFuzz_feeChargedExactlyOnce(uint8 attempts) public {
        attempts = uint8(bound(attempts, 1, 6));
        uint256 recBefore = feeToken.balanceOf(feeRecipient);
        uint256 payerBefore = feeToken.balanceOf(payer);
        uint256 ok;
        for (uint256 i; i < attempts; i++) {
            vm.prank(payer);
            try factory.deploy(owner, newDest, DELAY, bytes32(uint256(77))) returns (address) {
                ok++;
            } catch {}
        }
        assertEq(ok, 1);
        assertEq(feeToken.balanceOf(feeRecipient) - recBefore, FLAT_FEE);
        assertEq(payerBefore - feeToken.balanceOf(payer), FLAT_FEE);
    }

    function testFuzz_feeAmount(uint128 fee) public {
        fee = uint128(bound(fee, 1, type(uint128).max));
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(feeToken), fee, feeRecipient);
        feeToken.mint(payer, fee);
        vm.startPrank(payer);
        feeToken.approve(address(f), fee);
        uint256 recBefore = feeToken.balanceOf(feeRecipient);
        uint256 payerBefore = feeToken.balanceOf(payer);
        f.deploy(owner, newDest, DELAY, root);
        vm.stopPrank();
        assertEq(feeToken.balanceOf(feeRecipient) - recBefore, fee);
        assertEq(payerBefore - feeToken.balanceOf(payer), fee);
    }
}
