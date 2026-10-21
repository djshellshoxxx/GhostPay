// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {Deploy} from "../script/Deploy.s.sol";
import {DeployBase} from "../script/DeployBase.s.sol";
import {GhostPayRouter} from "../src/GhostPayRouter.sol";
import {GhostPaySweepRelayer} from "../src/GhostPaySweepRelayer.sol";
import {ERC5564Announcer} from "./utils/ERC5564Announcer.sol";

/// @notice `Deploy` with an in-memory environment (the process environment is shared by parallel suites).
contract DeployHarness is Deploy {
    mapping(bytes32 => string) internal _vars;

    function setVar(string memory name, string memory value) external {
        _vars[keccak256(bytes(name))] = value;
    }

    function _env(string memory name) internal view override returns (string memory) {
        return _vars[keccak256(bytes(name))];
    }

    function parseChainId(string memory s) external pure returns (uint256) {
        return _parseChainId(s);
    }
}

/// @notice Exercises the deployment script. Scenarios run sequentially in one test function because the
/// harness configuration is cumulative.
contract DeployTest is Test {
    address internal constant CANONICAL = 0x55649E01B5Df198D18D95b5cc5051630cfD45564;

    function test_deployScriptScenarios() public {
        DeployHarness script = new DeployHarness();
        address fee = makeAddr("multisig");
        vm.chainId(11_155_111);
        vm.etch(CANONICAL, address(new ERC5564Announcer()).code);

        // 1. FEE_RECIPIENT unset -> revert.
        vm.expectRevert(DeployBase.FeeRecipientNotSet.selector);
        script.run();

        // 2. FEE_RECIPIENT zero -> revert.
        script.setVar("FEE_RECIPIENT", vm.toString(address(0)));
        vm.expectRevert(DeployBase.FeeRecipientNotSet.selector);
        script.run();

        // 2b. FEE_RECIPIENT equal to the broadcaster (msg.sender of run) -> revert.
        script.setVar("FEE_RECIPIENT", vm.toString(address(this)));
        vm.expectRevert(
            abi.encodeWithSelector(DeployBase.FeeRecipientIsBroadcaster.selector, address(this))
        );
        script.run();

        // 3. Valid fee recipient, ANNOUNCER unset -> canonical default; all immutables read back.
        script.setVar("FEE_RECIPIENT", vm.toString(fee));
        (GhostPayRouter router, GhostPaySweepRelayer relayer) = script.run();
        assertEq(address(router.ANNOUNCER()), CANONICAL);
        assertEq(router.FEE_RECIPIENT(), fee);
        assertEq(router.FEE_BPS(), 25);
        assertGt(address(relayer).code.length, 0);
        assertTrue(relayer.DOMAIN_SEPARATOR() != bytes32(0));

        // 3b. A contract fee recipient only warns.
        address contractFee = address(new ERC5564Announcer());
        script.setVar("FEE_RECIPIENT", vm.toString(contractFee));
        (router,) = script.run();
        assertEq(router.FEE_RECIPIENT(), contractFee);
        script.setVar("FEE_RECIPIENT", vm.toString(fee));

        // 4. Mainnet is rejected unless explicitly allowlisted (spaces around entries are tolerated).
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(DeployBase.ChainNotAllowed.selector, 1));
        script.run();
        script.setVar("ALLOWED_CHAIN_IDS", "8453, 1 ,10");
        script.run();
        script.setVar("ALLOWED_CHAIN_IDS", "8453,\t1");
        script.run();
        // Malformed lists give a clear error instead of a parser panic.
        script.setVar("ALLOWED_CHAIN_IDS", "8453,,1");
        vm.expectRevert(abi.encodeWithSelector(DeployBase.InvalidChainIdEntry.selector, ""));
        script.run();
        script.setVar("ALLOWED_CHAIN_IDS", "8453,0x1");
        vm.expectRevert(abi.encodeWithSelector(DeployBase.InvalidChainIdEntry.selector, "0x1"));
        script.run();
        script.setVar("ALLOWED_CHAIN_IDS", "");
        vm.chainId(11_155_111);

        // 4b. Local chain 31337 is not built in; ALLOW_LOCAL=1 enables it.
        vm.chainId(31_337);
        vm.expectRevert(abi.encodeWithSelector(DeployBase.ChainNotAllowed.selector, 31_337));
        script.run();
        script.setVar("ALLOW_LOCAL", "0");
        vm.expectRevert(abi.encodeWithSelector(DeployBase.ChainNotAllowed.selector, 31_337));
        script.run();
        script.setVar("ALLOW_LOCAL", "1");
        script.run();
        script.setVar("ALLOW_LOCAL", "");
        vm.chainId(11_155_111);

        // 5. Announcer without code -> revert.
        vm.etch(CANONICAL, "");
        vm.expectRevert(abi.encodeWithSelector(Deploy.AnnouncerHasNoCode.selector, CANONICAL));
        script.run();
        vm.etch(CANONICAL, address(new ERC5564Announcer()).code);

        // 6. Custom announcer is rejected unless ALLOW_CUSTOM_ANNOUNCER=1.
        address custom = address(new ERC5564Announcer());
        script.setVar("ANNOUNCER", vm.toString(custom));
        vm.expectRevert(abi.encodeWithSelector(Deploy.CustomAnnouncerNotAllowed.selector, custom));
        script.run();
        script.setVar("ALLOW_CUSTOM_ANNOUNCER", "true"); // only "1" counts
        vm.expectRevert(abi.encodeWithSelector(Deploy.CustomAnnouncerNotAllowed.selector, custom));
        script.run();
        script.setVar("ALLOW_CUSTOM_ANNOUNCER", "1");
        (router,) = script.run();
        assertEq(address(router.ANNOUNCER()), custom);
        // The canonical address passed explicitly needs no override.
        script.setVar("ALLOW_CUSTOM_ANNOUNCER", "");
        script.setVar("ANNOUNCER", vm.toString(CANONICAL));
        (router,) = script.run();
        assertEq(address(router.ANNOUNCER()), CANONICAL);

        // 6b. Custom announcer without code still fails even with the override.
        script.setVar("ALLOW_CUSTOM_ANNOUNCER", "1");
        address noCode = makeAddr("noCodeAnnouncer");
        script.setVar("ANNOUNCER", vm.toString(noCode));
        vm.expectRevert(abi.encodeWithSelector(Deploy.AnnouncerHasNoCode.selector, noCode));
        script.run();

        // 7. Announcer codehash pin.
        script.setVar("ANNOUNCER", vm.toString(CANONICAL));
        bytes32 hash = CANONICAL.codehash;
        script.setVar("EXPECTED_ANNOUNCER_CODEHASH", vm.toString(hash));
        script.run();
        script.setVar("EXPECTED_ANNOUNCER_CODEHASH", vm.toString(bytes32(uint256(1))));
        vm.expectRevert(
            abi.encodeWithSelector(
                Deploy.AnnouncerCodehashMismatch.selector, hash, bytes32(uint256(1))
            )
        );
        script.run();
    }

    function test_parseChainId() public {
        DeployHarness script = new DeployHarness();
        assertEq(script.parseChainId("8453"), 8453);
        assertEq(script.parseChainId("  42 \t"), 42);
        vm.expectRevert(abi.encodeWithSelector(DeployBase.InvalidChainIdEntry.selector, "   "));
        script.parseChainId("   ");
        vm.expectRevert(abi.encodeWithSelector(DeployBase.InvalidChainIdEntry.selector, "1 2"));
        script.parseChainId("1 2");
        vm.expectRevert(abi.encodeWithSelector(DeployBase.InvalidChainIdEntry.selector, "-1"));
        script.parseChainId("-1");
    }
}
