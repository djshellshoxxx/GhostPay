// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {GhostPayAssociationSetRegistry} from "../src/GhostPayAssociationSetRegistry.sol";
import {GhostPayShieldedPoolERC20} from "../src/GhostPayShieldedPoolERC20.sol";
import {GhostPayShieldedPoolNative} from "../src/GhostPayShieldedPoolNative.sol";
import {
    IGhostPayAssociationSetRegistry
} from "../src/interfaces/IGhostPayAssociationSetRegistry.sol";
import {IGhostPayShieldedPool} from "../src/interfaces/IGhostPayShieldedPool.sol";

import {PoolBase} from "./PoolBase.t.sol";

/// CONTRACTS-POOLS-09: the dev-ceremony verifiers are forgeable, so the pools must fail closed on a
/// mainnet fork that was started with `--chain-id 31337` (the chain-id allowlist alone cannot tell).
contract DevCeremonyGuardTest is PoolBase {
    address internal constant MAINNET_WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    function test_refusesMainnetForkOnLocalChainId() public {
        vm.chainId(31_337);
        vm.etch(MAINNET_WETH, hex"00");
        IGhostPayShieldedPool.PoolConfig memory c = _config(address(0), 0);
        vm.expectRevert(IGhostPayShieldedPool.WrongChain.selector);
        new GhostPayShieldedPoolNative(c);
        c = _config(address(token), 0);
        vm.expectRevert(IGhostPayShieldedPool.WrongChain.selector);
        new GhostPayShieldedPoolERC20(c);
        vm.expectRevert(IGhostPayAssociationSetRegistry.WrongChain.selector);
        new GhostPayAssociationSetRegistry();
    }

    function test_allowsPlainLocalChain() public {
        vm.chainId(31_337);
        new GhostPayShieldedPoolNative(_config(address(0), 0));
    }
}
