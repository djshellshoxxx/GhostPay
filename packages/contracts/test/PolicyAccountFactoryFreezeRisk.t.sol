// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {PolicyAccount} from "../src/PolicyAccount.sol";
import {PolicyAccountFactory} from "../src/PolicyAccountFactory.sol";

/// @dev Models a token that changes fee or view behavior after a factory has been configured.
/// It deliberately has mutable test-only authority; no production contract is modified.
contract MutableFeeRiskToken is ERC20 {
    bool public feeEnabled;
    bool public brokenViews;

    error ViewUnavailable();

    constructor() ERC20("Mutable fee risk", "RISK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFeeEnabled(bool enabled) external {
        feeEnabled = enabled;
    }

    function setBrokenViews(bool enabled) external {
        brokenViews = enabled;
    }

    function balanceOf(address account) public view override returns (uint256) {
        if (brokenViews) revert ViewUnavailable();
        return super.balanceOf(account);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (feeEnabled && from != address(0) && to != address(0) && value != 0) {
            super._update(from, address(0), 1);
            value -= 1;
        }
        super._update(from, to, value);
    }
}

/// @notice Residual N1 is a token-selection risk, not authorization to bypass exact fee checks.
contract PolicyAccountFactoryFreezeRiskTest is Test {
    uint256 internal constant FEE = 3_000_000;
    address internal owner = makeAddr("freeze-risk-owner");
    address internal destination = makeAddr("freeze-risk-destination");
    address internal payer = makeAddr("freeze-risk-payer");
    address internal recipient = makeAddr("freeze-risk-recipient");
    PolicyAccount internal implementation;
    MutableFeeRiskToken internal token;
    PolicyAccountFactory internal factory;

    function setUp() public {
        implementation = new PolicyAccount();
        token = new MutableFeeRiskToken();
        factory = new PolicyAccountFactory(address(implementation), address(token), FEE, recipient);
        token.mint(payer, 2 * FEE);
        vm.prank(payer);
        token.approve(address(factory), 2 * FEE);
    }

    function _predicted(PolicyAccountFactory f) internal view returns (address) {
        return f.predictAddress(owner, f.policyHashOf(destination, 1 days, bytes32(0)));
    }

    function test_feeSwitchBlocksPrefundedAccountWithoutPartialFeeOrAlternativeFactoryRecovery()
        public
    {
        address predicted = _predicted(factory);
        vm.deal(predicted, 1 ether);
        token.setFeeEnabled(true);

        vm.prank(payer);
        vm.expectRevert(PolicyAccountFactory.UnexpectedFeeDelta.selector);
        factory.deploy(owner, destination, 1 days, bytes32(0));
        assertEq(predicted.code.length, 0);
        assertEq(predicted.balance, 1 ether, "prefunded value remains at the undeployed account");
        assertEq(token.balanceOf(payer), 2 * FEE, "fee debit rolled back");
        assertEq(token.balanceOf(recipient), 0, "fee credit rolled back");
        assertEq(token.allowance(payer, address(factory)), 2 * FEE, "allowance rolled back");

        PolicyAccountFactory free =
            new PolicyAccountFactory(address(implementation), address(token), 0, recipient);
        address other = free.deploy(owner, destination, 1 days, bytes32(0));
        assertTrue(other != predicted, "another factory cannot recover this counterfactual address");
        assertEq(predicted.code.length, 0);
        assertEq(predicted.balance, 1 ether);

        // Only the test token restoring exact transfers lets the original factory deploy again.
        token.setFeeEnabled(false);
        vm.prank(payer);
        assertEq(factory.deploy(owner, destination, 1 days, bytes32(0)), predicted);
        assertEq(PolicyAccount(payable(predicted)).owner(), owner);
        assertEq(predicted.balance, 1 ether);
        assertEq(token.balanceOf(recipient), FEE);
    }

    function test_brokenViewsBlockFeeFactoryButZeroFeeFactoryDoesNotQueryToken() public {
        address predicted = _predicted(factory);
        vm.deal(predicted, 1 ether);
        PolicyAccountFactory free =
            new PolicyAccountFactory(address(implementation), address(token), 0, recipient);
        token.setBrokenViews(true);

        vm.prank(payer);
        vm.expectRevert(MutableFeeRiskToken.ViewUnavailable.selector);
        factory.deploy(owner, destination, 1 days, bytes32(0));
        assertEq(predicted.code.length, 0);
        assertEq(predicted.balance, 1 ether);

        address other = free.deploy(owner, destination, 1 days, bytes32(0));
        assertEq(other, _predicted(free));
        assertEq(PolicyAccount(payable(other)).owner(), owner);
        assertTrue(other != predicted);
        assertEq(predicted.code.length, 0, "zero-fee deployment is an alternative, not a recovery");

        token.setBrokenViews(false);
        assertEq(token.balanceOf(payer), 2 * FEE);
        assertEq(token.balanceOf(recipient), 0);
        assertEq(token.allowance(payer, address(factory)), 2 * FEE);
    }
}
