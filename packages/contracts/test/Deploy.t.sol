// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {Deploy} from "../script/Deploy.s.sol";
import {GhostPayRouter} from "../src/GhostPayRouter.sol";
import {GhostPaySweepRelayer} from "../src/GhostPaySweepRelayer.sol";
import {ERC5564Announcer} from "./utils/ERC5564Announcer.sol";

/// @notice Exercises the deployment script. Process environment variables are global and cannot be
/// unset from Foundry, so every scenario runs sequentially inside one test function.
contract DeployTest is Test {
    address internal constant CANONICAL = 0x55649E01B5Df198D18D95b5cc5051630cfD45564;

    function test_deployScriptScenarios() public {
        Deploy script = new Deploy();
        address fee = makeAddr("multisig");
        vm.chainId(11_155_111);
        vm.etch(CANONICAL, address(new ERC5564Announcer()).code);

        // 1. FEE_RECIPIENT unset (never set in this process) -> revert.
        vm.expectRevert(Deploy.FeeRecipientNotSet.selector);
        script.run();

        // 2. FEE_RECIPIENT zero -> revert.
        vm.setEnv("FEE_RECIPIENT", vm.toString(address(0)));
        vm.expectRevert(Deploy.FeeRecipientNotSet.selector);
        script.run();

        // 3. Valid fee recipient, ANNOUNCER unset -> canonical default.
        vm.setEnv("FEE_RECIPIENT", vm.toString(fee));
        (GhostPayRouter router, GhostPaySweepRelayer relayer) = script.run();
        assertEq(address(router.ANNOUNCER()), CANONICAL);
        assertEq(router.FEE_RECIPIENT(), fee);
        assertEq(router.FEE_BPS(), 25);
        assertGt(address(relayer).code.length, 0);

        // 4. Mainnet is rejected unless explicitly allowlisted.
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(Deploy.ChainNotAllowed.selector, 1));
        script.run();
        vm.setEnv("ALLOWED_CHAIN_IDS", "8453,1");
        script.run();
        vm.chainId(11_155_111);

        // 5. Announcer without code -> revert.
        vm.etch(CANONICAL, "");
        vm.expectRevert(abi.encodeWithSelector(Deploy.AnnouncerHasNoCode.selector, CANONICAL));
        script.run();

        // 6. Custom announcer override.
        address custom = address(new ERC5564Announcer());
        vm.setEnv("ANNOUNCER", vm.toString(custom));
        (router,) = script.run();
        assertEq(address(router.ANNOUNCER()), custom);
    }
}
