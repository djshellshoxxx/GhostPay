// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {PoseidonT4} from "poseidon-solidity/PoseidonT4.sol";

import {GhostPayAssociationSetRegistry} from "../src/GhostPayAssociationSetRegistry.sol";
import {GhostPayShieldedPool} from "../src/GhostPayShieldedPool.sol";
import {GhostPayShieldedPoolERC20} from "../src/GhostPayShieldedPoolERC20.sol";
import {GhostPayShieldedPoolNative} from "../src/GhostPayShieldedPoolNative.sol";
import {IERC5564Announcer} from "../src/interfaces/IERC5564Announcer.sol";
import {
    IGhostPayAssociationSetRegistry
} from "../src/interfaces/IGhostPayAssociationSetRegistry.sol";
import {IGhostPayShieldedPool} from "../src/interfaces/IGhostPayShieldedPool.sol";
import {IWithdrawVerifier, IRagequitVerifier} from "../src/interfaces/IGroth16Verifier.sol";
import {IPoseidonT3, IPoseidonT4} from "../src/interfaces/IPoseidon.sol";

/// @title DeployPool
/// @notice Testnet-only deployment of the Poseidon hashers, (optionally) the registry, and one pool.
/// NOT RUN by this package's authors against any network. Env:
///   ASSET (address, 0x0 = native pool), ANNOUNCER, WITHDRAW_VERIFIER, RAGEQUIT_VERIFIER (required),
///   REGISTRY (optional; deployed if unset), DENOMINATION (default 0), MAX_DEPOSIT (required),
///   MAX_RELAYER_FEE_BPS (default 500), ASP_GRACE_SECONDS (default 600), ALLOW_LOCAL=1 for 31337,
///   ACK_INSECURE_DEV_CEREMONY=1 (required: the verifiers are forgeable, never use with value).
/// The verifiers come from `packages/pool-circuits` (INSECURE DEV CEREMONY: forged proofs can drain
/// the pool); deploy them first with `forge create` from that package's `verifiers/`.
contract DeployPool is Script {
    error ChainNotAllowed(uint256 chainId);
    error DevCeremonyNotAcknowledged();
    error NoCode(string what, address at);
    error ReadBackMismatch(string what);

    struct Out {
        address pool;
        address registry;
        address poseidonT3;
        address poseidonT4;
    }

    function run() external returns (Out memory o) {
        if (!vm.envOr("ACK_INSECURE_DEV_CEREMONY", false)) revert DevCeremonyNotAcknowledged();
        if (block.chainid != 11_155_111 && block.chainid != 84_532) {
            if (!(block.chainid == 31_337 && vm.envOr("ALLOW_LOCAL", false))) {
                revert ChainNotAllowed(block.chainid);
            }
        }
        IGhostPayShieldedPool.PoolConfig memory c = _config();
        vm.startBroadcast();
        o.poseidonT3 = _create(type(PoseidonT3).creationCode);
        o.poseidonT4 = _create(type(PoseidonT4).creationCode);
        c.poseidonT3 = IPoseidonT3(o.poseidonT3);
        c.poseidonT4 = IPoseidonT4(o.poseidonT4);
        if (address(c.registry) == address(0)) {
            c.registry =
                IGhostPayAssociationSetRegistry(address(new GhostPayAssociationSetRegistry()));
        }
        o.registry = address(c.registry);
        o.pool = c.asset == address(0)
            ? address(new GhostPayShieldedPoolNative(c))
            : address(new GhostPayShieldedPoolERC20(c));
        vm.stopBroadcast();
        _readBack(GhostPayShieldedPool(payable(o.pool)), c);
        console2.log("WARNING: verifiers from an INSECURE dev ceremony; testnet only");
        console2.log("pool", o.pool);
        console2.log("registry", o.registry);
        console2.log("poseidonT3", o.poseidonT3);
        console2.log("poseidonT4", o.poseidonT4);
    }

    function _config() internal view returns (IGhostPayShieldedPool.PoolConfig memory c) {
        c.asset = vm.envOr("ASSET", address(0));
        c.announcer = IERC5564Announcer(vm.envAddress("ANNOUNCER"));
        c.withdrawVerifier = IWithdrawVerifier(vm.envAddress("WITHDRAW_VERIFIER"));
        c.ragequitVerifier = IRagequitVerifier(vm.envAddress("RAGEQUIT_VERIFIER"));
        c.registry = IGhostPayAssociationSetRegistry(vm.envOr("REGISTRY", address(0)));
        c.denomination = vm.envOr("DENOMINATION", uint256(0));
        c.maxDeposit = vm.envUint("MAX_DEPOSIT");
        c.maxRelayerFeeBps = vm.envOr("MAX_RELAYER_FEE_BPS", uint256(500));
        c.aspGraceSeconds = vm.envOr("ASP_GRACE_SECONDS", uint256(600));
        if (c.asset != address(0) && c.asset.code.length == 0) revert NoCode("ASSET", c.asset);
        if (address(c.announcer).code.length == 0) {
            revert NoCode("ANNOUNCER", address(c.announcer));
        }
        if (address(c.withdrawVerifier).code.length == 0) {
            revert NoCode("WITHDRAW_VERIFIER", address(c.withdrawVerifier));
        }
        if (address(c.ragequitVerifier).code.length == 0) {
            revert NoCode("RAGEQUIT_VERIFIER", address(c.ragequitVerifier));
        }
        if (address(c.registry) != address(0) && address(c.registry).code.length == 0) {
            revert NoCode("REGISTRY", address(c.registry));
        }
    }

    function _readBack(GhostPayShieldedPool p, IGhostPayShieldedPool.PoolConfig memory c)
        internal
        view
    {
        if (p.ASSET() != c.asset) revert ReadBackMismatch("ASSET");
        if (p.ANNOUNCER() != address(c.announcer)) revert ReadBackMismatch("ANNOUNCER");
        if (p.REGISTRY() != address(c.registry)) revert ReadBackMismatch("REGISTRY");
        if (p.WITHDRAW_VERIFIER() != address(c.withdrawVerifier)) {
            revert ReadBackMismatch("WITHDRAW_VERIFIER");
        }
        if (p.RAGEQUIT_VERIFIER() != address(c.ragequitVerifier)) {
            revert ReadBackMismatch("RAGEQUIT_VERIFIER");
        }
        if (p.DENOMINATION() != c.denomination) revert ReadBackMismatch("DENOMINATION");
        if (p.MAX_DEPOSIT() != c.maxDeposit) revert ReadBackMismatch("MAX_DEPOSIT");
        if (p.MAX_RELAYER_FEE_BPS() != c.maxRelayerFeeBps) revert ReadBackMismatch("FEE_BPS");
        if (p.ASP_GRACE_SECONDS() != c.aspGraceSeconds) revert ReadBackMismatch("GRACE");
    }

    function _create(bytes memory code) internal returns (address a) {
        assembly ("memory-safe") {
            a := create(0, add(code, 0x20), mload(code))
        }
        if (a == address(0)) revert NoCode("poseidon", a);
    }
}
