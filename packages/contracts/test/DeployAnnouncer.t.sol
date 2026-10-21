// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {DeployAnnouncer} from "../script/DeployAnnouncer.s.sol";
import {ERC5564Announcer} from "./utils/ERC5564Announcer.sol";

contract DeployAnnouncerHarness is DeployAnnouncer {
    mapping(bytes32 => string) internal _vars;

    function setVar(string memory name, string memory value) external {
        _vars[keccak256(bytes(name))] = value;
    }

    function _env(string memory name) internal view override returns (string memory) {
        return _vars[keccak256(bytes(name))];
    }
}

/// @notice Deterministic announcer deployment: address, idempotence, gating and codehash checks.
contract DeployAnnouncerTest is Test {
    // Runtime of the keyless deterministic deployer (Arachnid): CREATE2(salt = calldata[0:32], initcode = rest).
    bytes internal constant DEPLOYER_RUNTIME =
        hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";

    DeployAnnouncerHarness internal script;

    function setUp() public {
        script = new DeployAnnouncerHarness();
        vm.chainId(11_155_111);
        vm.etch(script.DETERMINISTIC_DEPLOYER(), DEPLOYER_RUNTIME);
    }

    function test_nonCanonicalRequiresOptIn() public {
        vm.expectRevert(
            abi.encodeWithSelector(DeployAnnouncer.NonCanonicalAddress.selector, script.predict(0))
        );
        script.run();
    }

    function test_deploysAtPredictedAddressWithReferenceCodehash() public {
        script.setVar("ALLOW_NONCANONICAL_ANNOUNCER", "1");
        address predicted = script.predict(0);
        assertEq(predicted.code.length, 0);
        address got = script.run();
        assertEq(got, predicted);
        assertEq(predicted.codehash, address(new ERC5564Announcer()).codehash);
        // Idempotent: second run only verifies.
        assertEq(script.run(), predicted);
    }

    function test_saltChangesAddress() public view {
        assertTrue(script.predict(0) != script.predict(bytes32(uint256(1))));
    }

    function test_expectedCodehashMismatchReverts() public {
        script.setVar("ALLOW_NONCANONICAL_ANNOUNCER", "1");
        script.setVar("EXPECTED_ANNOUNCER_CODEHASH", vm.toString(bytes32(uint256(0xdead))));
        vm.expectRevert();
        script.run();
    }

    function test_expectedCodehashMatchPasses() public {
        script.setVar("ALLOW_NONCANONICAL_ANNOUNCER", "1");
        script.setVar(
            "EXPECTED_ANNOUNCER_CODEHASH", vm.toString(address(new ERC5564Announcer()).codehash)
        );
        script.run();
    }

    function test_wrongCodeAtAddressFailsClosed() public {
        script.setVar("ALLOW_NONCANONICAL_ANNOUNCER", "1");
        vm.etch(script.predict(0), hex"00");
        vm.expectRevert();
        script.run();
    }

    function test_missingDeployerReverts() public {
        script.setVar("ALLOW_NONCANONICAL_ANNOUNCER", "1");
        vm.etch(script.DETERMINISTIC_DEPLOYER(), "");
        vm.expectRevert(DeployAnnouncer.DeployerMissing.selector);
        script.run();
    }

    function test_unlistedChainRejected() public {
        vm.chainId(1);
        vm.expectRevert();
        script.run();
    }
}
