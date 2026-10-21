// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {DeployPolicy} from "../script/DeployPolicy.s.sol";
import {PolicyAccount} from "../src/PolicyAccount.sol";
import {PolicyAccountFactory} from "../src/PolicyAccountFactory.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice `DeployPolicy` with an in-memory environment (the real process environment is shared by
/// parallel test suites, e.g. `DeployTest` expects `FEE_RECIPIENT` to be unset).
contract DeployPolicyHarness is DeployPolicy {
    mapping(bytes32 => string) internal _vars;

    function setVar(string memory name, string memory value) external {
        _vars[keccak256(bytes(name))] = value;
    }

    function _env(string memory name) internal view override returns (string memory) {
        return _vars[keccak256(bytes(name))];
    }
}

/// @notice Exercises the policy deployment script; scenarios run sequentially in one test function.
contract DeployPolicyTest is Test {
    function test_deployPolicyScriptScenarios() public {
        DeployPolicyHarness script = new DeployPolicyHarness();
        address fee = makeAddr("multisig");
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);
        vm.chainId(11_155_111);

        // 1. Nothing set.
        vm.expectRevert(DeployPolicy.FeeRecipientNotSet.selector);
        script.run();

        // 2. Zero fee recipient.
        script.setVar("FEE_RECIPIENT", vm.toString(address(0)));
        vm.expectRevert(DeployPolicy.FeeRecipientNotSet.selector);
        script.run();

        // 3. Fee token unset / zero.
        script.setVar("FEE_RECIPIENT", vm.toString(fee));
        vm.expectRevert(DeployPolicy.FeeTokenNotSet.selector);
        script.run();
        script.setVar("FEE_TOKEN", vm.toString(address(0)));
        vm.expectRevert(DeployPolicy.FeeTokenNotSet.selector);
        script.run();

        // 4. Flat fee unset.
        script.setVar("FEE_TOKEN", vm.toString(address(usdc)));
        vm.expectRevert(DeployPolicy.FlatFeeNotSet.selector);
        script.run();

        // 5. Valid configuration.
        script.setVar("FLAT_FEE", "3000000");
        (PolicyAccount implementation, PolicyAccountFactory factory) = script.run();
        assertEq(factory.IMPLEMENTATION(), address(implementation));
        assertEq(factory.FEE_TOKEN(), address(usdc));
        assertEq(factory.FLAT_FEE(), 3_000_000);
        assertEq(factory.FEE_RECIPIENT(), fee);
        assertTrue(implementation.initialized());

        // 6. Explicit zero fee is allowed.
        script.setVar("FLAT_FEE", "0");
        (, factory) = script.run();
        assertEq(factory.FLAT_FEE(), 0);

        // 7. Mainnet is rejected unless explicitly allowlisted.
        script.setVar("FLAT_FEE", "3000000");
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(DeployPolicy.ChainNotAllowed.selector, 1));
        script.run();
        script.setVar("ALLOWED_CHAIN_IDS", "8453,1");
        script.run();
        vm.chainId(11_155_111);

        // 8. Fee token without code.
        address noCode = makeAddr("eoaToken");
        script.setVar("FEE_TOKEN", vm.toString(noCode));
        vm.expectRevert(abi.encodeWithSelector(DeployPolicy.FeeTokenHasNoCode.selector, noCode));
        script.run();
    }
}
