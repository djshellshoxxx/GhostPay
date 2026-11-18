// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {DeployBase} from "../script/DeployBase.s.sol";
import {GhostPayRouter} from "../src/GhostPayRouter.sol";
import {GhostPayPolicyRouter} from "../src/GhostPayPolicyRouter.sol";
import {PolicyAccount} from "../src/PolicyAccount.sol";
import {PolicyAccountFactory} from "../src/PolicyAccountFactory.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {ERC5564Announcer} from "./utils/ERC5564Announcer.sol";
import {DeployHarness} from "./Deploy.t.sol";
import {DeployPolicyHarness} from "./DeployPolicy.t.sol";
import {DeployPolicyRouterHarness} from "./DeployPolicyRouter.t.sol";

/// @notice R08-1: an address read from the environment that becomes an immutable constructor argument
/// or a trust root must be spelled in EIP-55 checksummed form, so that a mistyped address is refused
/// instead of being deployed (and then read back as "matching" the same mistyped value).
contract DeployChecksumTest is Test {
    address internal constant CANONICAL = 0x55649E01B5Df198D18D95b5cc5051630cfD45564;

    /// @dev Flips the letter case of the first hex letter after "0x": a wrong checksum, same address.
    /// Works on a copy (`bytes(s)` would alias and modify the caller's string).
    function _wrongChecksum(string memory s) internal pure returns (string memory) {
        bytes memory b = abi.encodePacked(s);
        for (uint256 i = 2; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c >= 0x61 && c <= 0x66) {
                b[i] = bytes1(c - 0x20);
                return string(b);
            }
            if (c >= 0x41 && c <= 0x46) {
                b[i] = bytes1(c + 0x20);
                return string(b);
            }
        }
        revert("no hex letter");
    }

    function _expectNotChecksummed(string memory name, string memory value) internal {
        vm.expectRevert(
            abi.encodeWithSelector(DeployBase.AddressNotChecksummed.selector, name, value)
        );
    }

    /// @dev The fix relies on `vm.toString(address)` returning the EIP-55 form.
    function test_vmToStringIsEip55() public pure {
        assertEq(
            vm.toString(address(0x55649E01B5Df198D18D95b5cc5051630cfD45564)),
            "0x55649E01B5Df198D18D95b5cc5051630cfD45564"
        );
        assertEq(
            vm.toString(address(0x70997970C51812dc3A010C7d01b50e0d17dc79C8)),
            "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
        );
    }

    function test_deployRejectsNonChecksummedFeeRecipient() public {
        DeployHarness script = new DeployHarness();
        vm.chainId(11_155_111);
        vm.etch(CANONICAL, address(new ERC5564Announcer()).code);
        address good = makeAddr("multisig");
        string memory goodStr = vm.toString(good);

        // Lowercase spelling of the right address.
        string memory lower = vm.toLowercase(goodStr);
        script.setVar("FEE_RECIPIENT", lower);
        _expectNotChecksummed("FEE_RECIPIENT", lower);
        script.run();

        // Wrong checksum (one letter's case flipped).
        string memory wrong = _wrongChecksum(goodStr);
        script.setVar("FEE_RECIPIENT", wrong);
        _expectNotChecksummed("FEE_RECIPIENT", wrong);
        script.run();

        // Lowercase with a typo in the last digit: parses to a different, valid-looking address.
        bytes memory typo = abi.encodePacked(lower);
        typo[typo.length - 1] = typo[typo.length - 1] == bytes1("0") ? bytes1("1") : bytes1("0");
        assertTrue(vm.parseAddress(string(typo)) != good);
        script.setVar("FEE_RECIPIENT", string(typo));
        _expectNotChecksummed("FEE_RECIPIENT", string(typo));
        script.run();

        // A lowercase custom ANNOUNCER (a constructor immutable) is refused the same way.
        script.setVar("FEE_RECIPIENT", goodStr);
        string memory annLower = vm.toLowercase(vm.toString(CANONICAL));
        script.setVar("ANNOUNCER", annLower);
        _expectNotChecksummed("ANNOUNCER", annLower);
        script.run();

        // The checksummed spellings deploy as before.
        script.setVar("ANNOUNCER", vm.toString(CANONICAL));
        (GhostPayRouter router,) = script.run();
        assertEq(router.FEE_RECIPIENT(), good);
        assertEq(address(router.ANNOUNCER()), CANONICAL);
    }

    function test_deployPolicyRejectsNonChecksummedAddresses() public {
        DeployPolicyHarness script = new DeployPolicyHarness();
        vm.chainId(11_155_111);
        address fee = makeAddr("multisig");
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);
        script.setVar("FLAT_FEE", "3000000");
        script.setVar("MAX_FLAT_FEE", "5000000");

        string memory feeLower = vm.toLowercase(vm.toString(fee));
        script.setVar("FEE_RECIPIENT", feeLower);
        _expectNotChecksummed("FEE_RECIPIENT", feeLower);
        script.run();

        script.setVar("FEE_RECIPIENT", vm.toString(fee));
        string memory tokenWrong = _wrongChecksum(vm.toString(address(usdc)));
        script.setVar("FEE_TOKEN", tokenWrong);
        _expectNotChecksummed("FEE_TOKEN", tokenWrong);
        script.run();

        script.setVar("FEE_TOKEN", vm.toString(address(usdc)));
        (, PolicyAccountFactory factory) = script.run();
        assertEq(factory.FEE_RECIPIENT(), fee);
        assertEq(factory.FEE_TOKEN(), address(usdc));
    }

    function test_deployPolicyRouterRejectsNonChecksummedAddresses() public {
        DeployPolicyRouterHarness script = new DeployPolicyRouterHarness();
        vm.chainId(11_155_111);
        vm.etch(CANONICAL, address(new ERC5564Announcer()).code);
        address fee = makeAddr("multisig");
        PolicyAccountFactory factory =
            new PolicyAccountFactory(address(new PolicyAccount()), address(0), 0, fee);

        string memory feeWrong = _wrongChecksum(vm.toString(fee));
        script.setVar("FEE_RECIPIENT", feeWrong);
        _expectNotChecksummed("FEE_RECIPIENT", feeWrong);
        script.run();

        script.setVar("FEE_RECIPIENT", vm.toString(fee));
        string memory factoryLower = vm.toLowercase(vm.toString(address(factory)));
        script.setVar("POLICY_FACTORY", factoryLower);
        _expectNotChecksummed("POLICY_FACTORY", factoryLower);
        script.run();

        script.setVar("POLICY_FACTORY", vm.toString(address(factory)));
        string memory annLower = vm.toLowercase(vm.toString(CANONICAL));
        script.setVar("ANNOUNCER", annLower);
        _expectNotChecksummed("ANNOUNCER", annLower);
        script.run();

        script.setVar("ANNOUNCER", vm.toString(CANONICAL));
        GhostPayPolicyRouter router = script.run();
        assertEq(router.FEE_RECIPIENT(), fee);
        assertEq(address(router.ANNOUNCER()), CANONICAL);
    }
}
