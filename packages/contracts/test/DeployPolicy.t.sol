// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {DeployBase} from "../script/DeployBase.s.sol";
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

/// @dev Token-like contract without `decimals()`.
contract NoDecimalsToken {
    fallback() external {
        revert();
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
        vm.expectRevert(DeployBase.FeeRecipientNotSet.selector);
        script.run();

        // 2. Zero fee recipient.
        script.setVar("FEE_RECIPIENT", vm.toString(address(0)));
        vm.expectRevert(DeployBase.FeeRecipientNotSet.selector);
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

        // 4b. MAX_FLAT_FEE is required (no default) and bounds FLAT_FEE.
        script.setVar("FLAT_FEE", "3000000");
        vm.expectRevert(DeployPolicy.MaxFlatFeeNotSet.selector);
        script.run();
        script.setVar("MAX_FLAT_FEE", "2999999");
        vm.expectRevert(
            abi.encodeWithSelector(DeployPolicy.FlatFeeAboveMax.selector, 3_000_000, 2_999_999)
        );
        script.run();
        // A 18-decimals typo on a 6-decimals token is caught.
        script.setVar("FLAT_FEE", "3000000000000000000");
        script.setVar("MAX_FLAT_FEE", "100000000");
        vm.expectRevert(
            abi.encodeWithSelector(DeployPolicy.FlatFeeAboveMax.selector, 3e18, 100_000_000)
        );
        script.run();

        // 5. Valid configuration (fee exactly at the bound is accepted).
        script.setVar("FLAT_FEE", "3000000");
        script.setVar("MAX_FLAT_FEE", "3000000");
        (PolicyAccount implementation, PolicyAccountFactory factory) = script.run();
        assertEq(factory.IMPLEMENTATION(), address(implementation));
        assertEq(factory.FEE_TOKEN(), address(usdc));
        assertEq(factory.FLAT_FEE(), 3_000_000);
        assertEq(factory.FEE_RECIPIENT(), fee);
        assertTrue(implementation.initialized());
        assertEq(factory.MIN_DELAY(), 1 hours);
        assertEq(factory.MAX_DELAY(), 30 days);

        // 6. Explicit zero fee is allowed.
        script.setVar("FLAT_FEE", "0");
        (, factory) = script.run();
        assertEq(factory.FLAT_FEE(), 0);

        // 6b. FEE_RECIPIENT equal to the broadcaster is rejected; a contract recipient only warns.
        script.setVar("FEE_RECIPIENT", vm.toString(address(this)));
        vm.expectRevert(
            abi.encodeWithSelector(DeployBase.FeeRecipientIsBroadcaster.selector, address(this))
        );
        script.run();
        script.setVar("FEE_RECIPIENT", vm.toString(address(usdc))); // has code
        (, factory) = script.run();
        assertEq(factory.FEE_RECIPIENT(), address(usdc));
        script.setVar("FEE_RECIPIENT", vm.toString(fee));

        // 6c. A fee token without decimals() only warns.
        address noDecimals = address(new NoDecimalsToken());
        script.setVar("FEE_TOKEN", vm.toString(noDecimals));
        (, factory) = script.run();
        assertEq(factory.FEE_TOKEN(), noDecimals);
        script.setVar("FEE_TOKEN", vm.toString(address(usdc)));

        // 7. Mainnet is rejected unless explicitly allowlisted.
        script.setVar("FLAT_FEE", "3000000");
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(DeployBase.ChainNotAllowed.selector, 1));
        script.run();
        script.setVar("ALLOWED_CHAIN_IDS", "8453, 1");
        script.run();
        script.setVar("ALLOWED_CHAIN_IDS", "8453;1");
        vm.expectRevert(abi.encodeWithSelector(DeployBase.InvalidChainIdEntry.selector, "8453;1"));
        script.run();
        script.setVar("ALLOWED_CHAIN_IDS", "");
        vm.chainId(31_337);
        vm.expectRevert(abi.encodeWithSelector(DeployBase.ChainNotAllowed.selector, 31_337));
        script.run();
        script.setVar("ALLOW_LOCAL", "1");
        script.run();
        script.setVar("ALLOW_LOCAL", "");
        vm.chainId(11_155_111);

        // 8. Fee token without code.
        address noCode = makeAddr("eoaToken");
        script.setVar("FEE_TOKEN", vm.toString(noCode));
        vm.expectRevert(abi.encodeWithSelector(DeployPolicy.FeeTokenHasNoCode.selector, noCode));
        script.run();
    }
}
