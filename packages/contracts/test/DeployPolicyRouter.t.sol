// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {DeployPolicyRouter} from "../script/DeployPolicyRouter.s.sol";
import {DeployBase} from "../script/DeployBase.s.sol";
import {GhostPayPolicyRouter} from "../src/GhostPayPolicyRouter.sol";
import {PolicyAccount} from "../src/PolicyAccount.sol";
import {PolicyAccountFactory} from "../src/PolicyAccountFactory.sol";
import {ERC5564Announcer} from "./utils/ERC5564Announcer.sol";

/// @notice `DeployPolicyRouter` with an in-memory environment (the process environment is shared by
/// parallel suites).
contract DeployPolicyRouterHarness is DeployPolicyRouter {
    mapping(bytes32 => string) internal _vars;

    function setVar(string memory name, string memory value) external {
        _vars[keccak256(bytes(name))] = value;
    }

    function _env(string memory name) internal view override returns (string memory) {
        return _vars[keccak256(bytes(name))];
    }
}

/// @notice Exercises the policy router deployment script. Scenarios run sequentially in one test
/// function because the harness configuration is cumulative.
contract DeployPolicyRouterTest is Test {
    address internal constant CANONICAL = 0x55649E01B5Df198D18D95b5cc5051630cfD45564;

    function test_deployPolicyRouterScenarios() public {
        DeployPolicyRouterHarness script = new DeployPolicyRouterHarness();
        address fee = makeAddr("multisig");
        PolicyAccount impl = new PolicyAccount();
        PolicyAccountFactory factory = new PolicyAccountFactory(address(impl), address(0), 0, fee);
        vm.chainId(11_155_111);
        vm.etch(CANONICAL, address(new ERC5564Announcer()).code);

        // 1. FEE_RECIPIENT unset / zero / broadcaster -> revert.
        vm.expectRevert(DeployBase.FeeRecipientNotSet.selector);
        script.run();
        script.setVar("FEE_RECIPIENT", vm.toString(address(0)));
        vm.expectRevert(DeployBase.FeeRecipientNotSet.selector);
        script.run();
        script.setVar("FEE_RECIPIENT", vm.toString(address(this)));
        vm.expectRevert(
            abi.encodeWithSelector(DeployBase.FeeRecipientIsBroadcaster.selector, address(this))
        );
        script.run();
        script.setVar("FEE_RECIPIENT", vm.toString(fee));

        // 2. POLICY_FACTORY unset / zero / without code / implementation without code -> revert.
        vm.expectRevert(DeployPolicyRouter.PolicyFactoryNotSet.selector);
        script.run();
        script.setVar("POLICY_FACTORY", vm.toString(address(0)));
        vm.expectRevert(DeployPolicyRouter.PolicyFactoryNotSet.selector);
        script.run();
        address eoa = makeAddr("eoaFactory");
        script.setVar("POLICY_FACTORY", vm.toString(eoa));
        vm.expectRevert(
            abi.encodeWithSelector(DeployPolicyRouter.PolicyFactoryHasNoCode.selector, eoa)
        );
        script.run();
        PolicyAccount impl2 = new PolicyAccount();
        PolicyAccountFactory orphan = new PolicyAccountFactory(address(impl2), address(0), 0, fee);
        vm.etch(address(impl2), "");
        script.setVar("POLICY_FACTORY", vm.toString(address(orphan)));
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployPolicyRouter.PolicyFactoryHasNoCode.selector, address(impl2)
            )
        );
        script.run();

        // 3. Valid configuration: canonical announcer default, every immutable read back.
        script.setVar("POLICY_FACTORY", vm.toString(address(factory)));
        GhostPayPolicyRouter router = script.run();
        assertEq(address(router.ANNOUNCER()), CANONICAL);
        assertEq(router.FEE_RECIPIENT(), fee);
        assertEq(address(router.FACTORY()), address(factory));
        assertEq(router.SCHEME_ID(), 0x47500002);

        // 3b. A contract fee recipient only warns.
        address contractFee = address(new ERC5564Announcer());
        script.setVar("FEE_RECIPIENT", vm.toString(contractFee));
        router = script.run();
        assertEq(router.FEE_RECIPIENT(), contractFee);
        script.setVar("FEE_RECIPIENT", vm.toString(fee));

        // 4. Factory code hash pin.
        bytes32 fhash = address(factory).codehash;
        script.setVar("EXPECTED_POLICY_FACTORY_CODEHASH", vm.toString(fhash));
        script.run();
        script.setVar("EXPECTED_POLICY_FACTORY_CODEHASH", vm.toString(bytes32(uint256(1))));
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployPolicyRouter.PolicyFactoryCodehashMismatch.selector,
                fhash,
                bytes32(uint256(1))
            )
        );
        script.run();
        script.setVar("EXPECTED_POLICY_FACTORY_CODEHASH", "");

        // 5. Chain allowlist (shared helper): mainnet rejected unless listed.
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(DeployBase.ChainNotAllowed.selector, 1));
        script.run();
        script.setVar("ALLOWED_CHAIN_IDS", "8453, 1");
        script.run();
        script.setVar("ALLOWED_CHAIN_IDS", "");
        vm.chainId(11_155_111);

        // 6. Announcer without code; custom announcer needs ALLOW_CUSTOM_ANNOUNCER=1.
        vm.etch(CANONICAL, "");
        vm.expectRevert(
            abi.encodeWithSelector(DeployPolicyRouter.AnnouncerHasNoCode.selector, CANONICAL)
        );
        script.run();
        vm.etch(CANONICAL, address(new ERC5564Announcer()).code);
        address custom = address(new ERC5564Announcer());
        script.setVar("ANNOUNCER", vm.toString(custom));
        vm.expectRevert(
            abi.encodeWithSelector(DeployPolicyRouter.CustomAnnouncerNotAllowed.selector, custom)
        );
        script.run();
        script.setVar("ALLOW_CUSTOM_ANNOUNCER", "1");
        router = script.run();
        assertEq(address(router.ANNOUNCER()), custom);
        script.setVar("ALLOW_CUSTOM_ANNOUNCER", "");
        script.setVar("ANNOUNCER", vm.toString(CANONICAL));

        // 7. Announcer code hash pin.
        bytes32 ahash = CANONICAL.codehash;
        script.setVar("EXPECTED_ANNOUNCER_CODEHASH", vm.toString(ahash));
        script.run();
        script.setVar("EXPECTED_ANNOUNCER_CODEHASH", vm.toString(bytes32(uint256(1))));
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployPolicyRouter.AnnouncerCodehashMismatch.selector, ahash, bytes32(uint256(1))
            )
        );
        script.run();
    }
}
