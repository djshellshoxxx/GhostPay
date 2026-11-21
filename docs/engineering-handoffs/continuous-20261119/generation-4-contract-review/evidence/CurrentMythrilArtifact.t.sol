// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {PolicyAccount} from "../src/PolicyAccount.sol";
import {PolicyAccountFactory} from "../src/PolicyAccountFactory.sol";
import {GhostPaySweepRelayer} from "../src/GhostPaySweepRelayer.sol";
import {IGhostPaySweepRelayer} from "../src/interfaces/IGhostPaySweepRelayer.sol";
import {IPolicyAccount} from "../src/interfaces/IPolicyAccount.sol";
import {ViewRevertToken} from "./MythrilFactoryDispositions.t.sol";

contract CurrentMythrilArtifactTest is Test {
    function test_currentFactoryConstructorsRejected() public {
        assertEq(address(1).code.length, 0);
        vm.expectRevert(PolicyAccountFactory.ImplementationHasNoCode.selector);
        new PolicyAccountFactory(
            address(bytes20(hex"0000000000000000000000000000000000000001")),
            address(bytes20(hex"0000000000000000000000000000000000000000")),
            0,
            address(bytes20(hex"0204040108020401080101010101011001010101"))
        );
        vm.expectRevert(PolicyAccountFactory.ImplementationHasNoCode.selector);
        new PolicyAccountFactory(
            address(bytes20(hex"0000000000000000000000000000000000000001")),
            address(bytes20(hex"deadbeefdeadbeefdeadbeefdeadbeefdeadbeef")),
            42466053570842937252319430899433128741022514264199356410331660828949766586335,
            address(bytes20(hex"0101010202010101080101040101010101010201"))
        );
        vm.expectRevert(PolicyAccountFactory.ImplementationHasNoCode.selector);
        new PolicyAccountFactory(
            address(bytes20(hex"0000000000000000000000000000000000000001")),
            address(bytes20(hex"0000000000000000000000000000000000000000")),
            0,
            address(bytes20(hex"4004084001010202100402028002808001020101"))
        );
        vm.expectRevert(PolicyAccountFactory.ImplementationHasNoCode.selector);
        new PolicyAccountFactory(
            address(bytes20(hex"0000000000000000000000000000000000000001")),
            address(bytes20(hex"0801010101010402010120010101010101400101")),
            42466053570842937233488221453789411236373699277260273224739694614160898703095,
            address(bytes20(hex"0201080120020401010101010210080101014040"))
        );
        vm.expectRevert(PolicyAccountFactory.ImplementationHasNoCode.selector);
        new PolicyAccountFactory(
            address(bytes20(hex"0000000000000000000000000000000000000001")),
            address(bytes20(hex"deadbeefdeadbeefdeadbeefdeadbeefdeadbeef")),
            42466053570842937252319430899433128741022514264199356410331660828949766586335,
            address(bytes20(hex"0101010202010101080101040101010101010201"))
        );
        vm.expectRevert(PolicyAccountFactory.ImplementationHasNoCode.selector);
        new PolicyAccountFactory(
            address(bytes20(hex"0000000000000000000000000000000000000001")),
            address(bytes20(hex"deadbeefdeadbeefdeadbeefdeadbeefdeadbeef")),
            42466053577477610007946285914103139962104623768856854182631556546998942265327,
            address(bytes20(hex"0801010101048001020201010101000101020101"))
        );
        vm.expectRevert(PolicyAccountFactory.ImplementationHasNoCode.selector);
        new PolicyAccountFactory(
            address(bytes20(hex"0000000000000000000000000000000000000001")),
            address(bytes20(hex"0101010101010140010120010101010101010101")),
            42466053570842937239765227408198744900472378137321350156138583727826235337387,
            address(bytes20(hex"0101010101010101010140010104010101010101"))
        );
    }

    function test_current_GhostPaySweepRelayer_0_allTimestampsRevert() public {
        GhostPaySweepRelayer target = new GhostPaySweepRelayer();
        bytes memory input =
            hex"bad66243000000000000000000000000000000000000000000000000000000000000010004000000000000000000000000000000000000008400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        uint256[4] memory times = [uint256(0), uint256(1), uint256(1700000000), type(uint256).max];
        for (uint256 i; i < times.length; i++) {
            vm.warp(times[i]);
            vm.prank(address(bytes20(hex"affeaffeaffeaffeaffeaffeaffeaffeaffeaffe")));
            (bool ok, bytes memory ret) = address(target).call(input);
            assertFalse(ok);
            assertEq(
                ret,
                abi.encodeWithSelector(
                    times[i] == 0
                        ? IGhostPaySweepRelayer.InvalidAmount.selector
                        : IGhostPaySweepRelayer.Expired.selector
                )
            );
            assertFalse(target.nonceUsed(address(0), 0));
            assertEq(address(target).balance, 0);
        }
    }

    function test_current_PolicyAccount_0_allTimestampsRevert() public {
        PolicyAccount target = new PolicyAccount();
        bytes memory input =
            hex"30d513070000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000180000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000067";
        uint256[4] memory times = [uint256(0), uint256(1), uint256(1700000000), type(uint256).max];
        for (uint256 i; i < times.length; i++) {
            vm.warp(times[i]);
            vm.prank(address(bytes20(hex"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")));
            (bool ok, bytes memory ret) = address(target).call(input);
            assertFalse(ok);
            assertEq(
                ret,
                abi.encodeWithSelector(
                    times[i] == 0 ? IPolicyAccount.ZeroAmount.selector : IPolicyAccount.Expired.selector
                )
            );
            assertFalse(target.nonceUsed(0));
            assertEq(target.pendingEffectiveAt(), 0);
            assertEq(target.owner(), address(0));
        }
    }

    function test_current_PolicyAccount_1_allTimestampsRevert() public {
        PolicyAccount target = new PolicyAccount();
        bytes memory input =
            hex"a950552f0000000000000000000000000000000000000000000000000000000000000000000000000055000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006";
        uint256[4] memory times = [uint256(0), uint256(1), uint256(1700000000), type(uint256).max];
        for (uint256 i; i < times.length; i++) {
            vm.warp(times[i]);
            vm.prank(address(bytes20(hex"deadbeefdeadbeefdeadbeefdeadbeefdeadbeef")));
            (bool ok, bytes memory ret) = address(target).call(input);
            assertFalse(ok);
            assertEq(
                ret,
                abi.encodeWithSelector(
                    times[i] == type(uint256).max
                        ? IPolicyAccount.Expired.selector
                        : IPolicyAccount.InvalidDestination.selector
                )
            );
            assertFalse(target.nonceUsed(0));
            assertEq(target.pendingEffectiveAt(), 0);
            assertEq(target.owner(), address(0));
        }
    }

    function test_currentPolicyPayloadsRejectOnFundedClone() public {
        PolicyAccount impl = new PolicyAccount();
        PolicyAccountFactory factory = new PolicyAccountFactory(address(impl), address(0), 0, address(0xCAFE));
        PolicyAccount account = PolicyAccount(
            payable(factory.deploy(address(0xBEEF), address(0xCAFE), 3600, bytes32(0)))
        );
        vm.deal(address(account), 1 ether);
        uint256[3] memory times = [uint256(0), uint256(1700000000), type(uint256).max];
        for (uint256 i; i < times.length; i++) {
            vm.warp(times[i]);
            vm.prank(address(bytes20(hex"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")));
            (bool ok, bytes memory ret) = address(account)
                .call(
                    hex"30d513070000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000180000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000067"
                );
            assertFalse(ok);
            assertEq(
                ret,
                abi.encodeWithSelector(
                    times[i] == 0 ? IPolicyAccount.ZeroAmount.selector : IPolicyAccount.Expired.selector
                )
            );
            assertEq(account.owner(), address(0xBEEF));
            assertEq(account.destination(), address(0xCAFE));
            assertEq(account.pendingEffectiveAt(), 0);
            assertFalse(account.nonceUsed(0));
            assertEq(address(account).balance, 1 ether);
        }
        for (uint256 i; i < times.length; i++) {
            vm.warp(times[i]);
            vm.prank(address(bytes20(hex"deadbeefdeadbeefdeadbeefdeadbeefdeadbeef")));
            (bool ok, bytes memory ret) = address(account)
                .call(
                    hex"a950552f0000000000000000000000000000000000000000000000000000000000000000000000000055000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006"
                );
            assertFalse(ok);
            assertEq(
                ret,
                abi.encodeWithSelector(
                    times[i] == type(uint256).max
                        ? IPolicyAccount.Expired.selector
                        : IPolicyAccount.InvalidDestination.selector
                )
            );
            assertEq(account.owner(), address(0xBEEF));
            assertEq(account.destination(), address(0xCAFE));
            assertEq(account.pendingEffectiveAt(), 0);
            assertFalse(account.nonceUsed(0));
            assertEq(address(account).balance, 1 ether);
        }
    }

    function test_residualFailingFeeViewBlocksPrefundedCounterfactualUntilRepaired() public {
        PolicyAccount impl = new PolicyAccount();
        ViewRevertToken token = new ViewRevertToken();
        address owner = address(0xBEEF);
        address destination = address(0xCAFE);
        address recipient = address(0xFEE);
        address payer = address(0xAA);
        PolicyAccountFactory factory = new PolicyAccountFactory(address(impl), address(token), 100, recipient);
        bytes32 policyHash = factory.policyHashOf(destination, 3600, bytes32(0));
        address predicted = factory.predictAddress(owner, policyHash);
        vm.deal(predicted, 2 ether);
        token.mint(payer, 100);
        vm.prank(payer);
        token.approve(address(factory), 100);
        token.setBlockedBalanceOf(recipient);
        vm.prank(payer);
        vm.expectRevert(ViewRevertToken.ViewUnavailable.selector);
        factory.deploy(owner, destination, 3600, bytes32(0));
        assertEq(predicted.code.length, 0);
        assertEq(predicted.balance, 2 ether);
        assertEq(token.balanceOf(payer), 100);
        assertEq(token.allowance(payer, address(factory)), 100);
        PolicyAccountFactory feeFree = new PolicyAccountFactory(address(impl), address(0), 0, recipient);
        assertTrue(feeFree.predictAddress(owner, policyHash) != predicted);
        address alternative = feeFree.deploy(owner, destination, 3600, bytes32(0));
        assertEq(alternative.balance, 0);
        assertEq(predicted.balance, 2 ether);
        token.setBlockedBalanceOf(address(0));
        vm.prank(payer);
        address restored = factory.deploy(owner, destination, 3600, bytes32(0));
        assertEq(restored, predicted);
        assertEq(restored.balance, 2 ether);
        assertEq(PolicyAccount(payable(restored)).owner(), owner);
        assertEq(PolicyAccount(payable(restored)).destination(), destination);
        assertEq(token.balanceOf(recipient), 100);
    }
}
