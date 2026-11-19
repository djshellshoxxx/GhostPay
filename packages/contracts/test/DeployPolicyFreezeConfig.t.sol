// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DeployPolicy} from "../script/DeployPolicy.s.sol";
import {PolicyAccountFactory} from "../src/PolicyAccountFactory.sol";
import {DeployPolicyHarness} from "./DeployPolicy.t.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract DeployPolicyFreezeConfigTest is Test {
    DeployPolicyHarness internal script;
    MockERC20 internal token;
    address internal recipient = makeAddr("config-fee-recipient");
    uint256 internal constant FEE = 3_000_000;

    function setUp() public {
        vm.chainId(11_155_111);
        script = new DeployPolicyHarness();
        token = new MockERC20("Fee token", "FEE", 6);
        script.setVar("FEE_RECIPIENT", vm.toString(recipient));
        script.setVar("FEE_TOKEN", vm.toString(address(token)));
        script.setVar("FLAT_FEE", vm.toString(FEE));
        script.setVar("MAX_FLAT_FEE", vm.toString(2 * FEE));
        script.setVar("FEE_TOKEN_FREEZE_ACK", vm.toString(address(token)));
        script.setVar(
            "FEE_TOKEN_FREEZE_ACK_CONFIG", vm.toString(_digest(address(token), FEE, recipient))
        );
    }

    function _digest(address token_, uint256 fee_, address recipient_)
        internal
        view
        returns (bytes32)
    {
        return script.feeTokenFreezeConfigHash(
            block.chainid, token_, token_.codehash, fee_, recipient_
        );
    }

    function _expectConfigRevert(address token_, uint256 fee_, address recipient_) internal {
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployPolicy.FeeFreezeConfigurationNotAcknowledged.selector,
                _digest(token_, fee_, recipient_)
            )
        );
        script.run();
    }

    function test_matchingConfigurationDeploysAndReadsBackImmutables() public {
        (, PolicyAccountFactory factory) = script.run();
        assertEq(factory.FEE_TOKEN(), address(token));
        assertEq(factory.FLAT_FEE(), FEE);
        assertEq(factory.FEE_RECIPIENT(), recipient);
    }

    function test_configurationDigestMatchesIndependentCastVector() public view {
        assertEq(
            script.feeTokenFreezeConfigHash(
                11_155_111,
                0x52908400098527886E0F7030069857D2E4169EE7,
                0x309c67890bde4c575dc23d2cc3b5c3a3d599e312e980e9b61b5bc8f3cd87c8bb,
                3_000_000,
                0xde709f2102306220921060314715629080e2fb77
            ),
            0x2a07bdbd15b95b9da2f9a83416c3087deec5b8ae7a26a77c183bfb97411498dc
        );
    }

    function test_missingOrMismatchedConfigurationRejected() public {
        script.setVar("FEE_TOKEN_FREEZE_ACK_CONFIG", "");
        _expectConfigRevert(address(token), FEE, recipient);
        script.setVar("FEE_TOKEN_FREEZE_ACK_CONFIG", vm.toString(bytes32(uint256(1))));
        _expectConfigRevert(address(token), FEE, recipient);
    }

    function test_malformedConfigurationRejected() public {
        script.setVar("FEE_TOKEN_FREEZE_ACK_CONFIG", "not-a-bytes32");
        vm.expectRevert();
        script.run();
    }

    function test_changedChainInvalidatesAcknowledgment() public {
        vm.chainId(84_532); // Another built-in allowed chain, so only the stale acknowledgment fails.
        _expectConfigRevert(address(token), FEE, recipient);
    }

    function test_changedTokenInvalidatesAcknowledgmentEvenWithUpdatedTokenAck() public {
        MockERC20 other = new MockERC20("Other fee token", "OTHER", 6);
        script.setVar("FEE_TOKEN", vm.toString(address(other)));
        script.setVar("FEE_TOKEN_FREEZE_ACK", vm.toString(address(other)));
        _expectConfigRevert(address(other), FEE, recipient);
    }

    function test_changedFeeInvalidatesAcknowledgment() public {
        script.setVar("FLAT_FEE", vm.toString(FEE + 1));
        _expectConfigRevert(address(token), FEE + 1, recipient);
    }

    function test_changedRecipientInvalidatesAcknowledgment() public {
        address other = makeAddr("other-fee-recipient");
        script.setVar("FEE_RECIPIENT", vm.toString(other));
        _expectConfigRevert(address(token), FEE, other);
    }

    function test_changedTokenRuntimeInvalidatesAcknowledgment() public {
        vm.etch(address(token), abi.encodePacked(address(token).code, hex"00"));
        _expectConfigRevert(address(token), FEE, recipient);
    }

    function test_zeroFeeRequiresNeitherAcknowledgment() public {
        script.setVar("FLAT_FEE", "0");
        script.setVar("FEE_TOKEN_FREEZE_ACK", "");
        script.setVar("FEE_TOKEN_FREEZE_ACK_CONFIG", "");
        (, PolicyAccountFactory factory) = script.run();
        assertEq(factory.FLAT_FEE(), 0);
    }
}
