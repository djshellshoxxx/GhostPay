// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {DeployPool} from "../script/DeployPool.s.sol";
import {IGhostPayShieldedPool} from "../src/interfaces/IGhostPayShieldedPool.sol";

import {MockWithdrawVerifier, MockRagequitVerifier} from "./mocks/PoolMocks.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {ERC5564Announcer} from "./utils/ERC5564Announcer.sol";

/// In-memory runs of the deploy script (no RPC, nothing broadcast anywhere).
contract DeployPoolTest is Test {
    DeployPool internal s;

    function setUp() public {
        s = new DeployPool();
        vm.setEnv("ANNOUNCER", vm.toString(address(new ERC5564Announcer())));
        vm.setEnv("WITHDRAW_VERIFIER", vm.toString(address(new MockWithdrawVerifier())));
        vm.setEnv("RAGEQUIT_VERIFIER", vm.toString(address(new MockRagequitVerifier())));
        vm.setEnv("MAX_DEPOSIT", "1000000000000000000000");
        vm.setEnv("REGISTRY", vm.toString(address(0)));
    }

    /// One sequential test: environment variables are process-global and tests run in parallel.
    function test_deployScript() public {
        _deploysErc20AndNativeOnSepolia();
        _refusesOtherChains();
        _refusesCodelessVerifier();
    }

    function _deploysErc20AndNativeOnSepolia() internal {
        vm.chainId(11_155_111);
        MockERC20 t = new MockERC20("T", "T", 6);
        vm.setEnv("ASSET", vm.toString(address(t)));
        DeployPool.Out memory o = s.run();
        IGhostPayShieldedPool p = IGhostPayShieldedPool(o.pool);
        assertEq(p.ASSET(), address(t));
        assertEq(p.REGISTRY(), o.registry);
        assertEq(p.MAX_RELAYER_FEE_BPS(), 500);
        assertEq(p.ASP_GRACE_SECONDS(), 600);
        vm.setEnv("ASSET", vm.toString(address(0)));
        o = s.run();
        assertEq(IGhostPayShieldedPool(o.pool).ASSET(), address(0));
    }

    function _refusesOtherChains() internal {
        vm.setEnv("ASSET", vm.toString(address(0)));
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(DeployPool.ChainNotAllowed.selector, 1));
        s.run();
        vm.chainId(31_337);
        vm.setEnv("ALLOW_LOCAL", "false");
        vm.expectRevert(abi.encodeWithSelector(DeployPool.ChainNotAllowed.selector, 31_337));
        s.run();
        vm.setEnv("ALLOW_LOCAL", "true");
        s.run();
    }

    function _refusesCodelessVerifier() internal {
        vm.chainId(84_532);
        vm.setEnv("ASSET", vm.toString(address(0)));
        vm.setEnv("WITHDRAW_VERIFIER", vm.toString(makeAddr("eoa")));
        vm.expectRevert(
            abi.encodeWithSelector(DeployPool.NoCode.selector, "WITHDRAW_VERIFIER", makeAddr("eoa"))
        );
        s.run();
    }
}
