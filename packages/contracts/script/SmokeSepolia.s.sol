// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {console2} from "forge-std/Script.sol";

import {DeployBase} from "./DeployBase.s.sol";
import {GhostPayRouter} from "../src/GhostPayRouter.sol";
import {GhostPaySweepRelayer} from "../src/GhostPaySweepRelayer.sol";

/// @title SmokeSepolia
/// @notice Read-only post-deployment smoke check for any allowed testnet. Never broadcasts, needs no key.
/// @dev Env: `ROUTER`, `SWEEP_RELAYER` (required); `FEE_RECIPIENT` (required, compared with the router's
/// immutable); `ANNOUNCER` (optional, compared with the router's immutable); `ALLOWED_CHAIN_IDS`/`ALLOW_LOCAL`
/// as in `Deploy`. Run: `forge script script/SmokeSepolia.s.sol --rpc-url $RPC_URL` (no `--broadcast`).
contract SmokeSepolia is DeployBase {
    /// @notice A required address variable is unset.
    /// @param name The variable name.
    error EnvMissing(string name);
    /// @notice No code at a deployed address.
    /// @param target The address without code.
    error NoCode(address target);

    /// @notice Run the checks; reverts on the first failure.
    function run() external view {
        if (!_chainAllowed(block.chainid)) revert ChainNotAllowed(block.chainid);
        address routerAddr = _addr("ROUTER");
        address relayerAddr = _addr("SWEEP_RELAYER");
        address feeRecipient = _addr("FEE_RECIPIENT");
        if (routerAddr.code.length == 0) revert NoCode(routerAddr);
        if (relayerAddr.code.length == 0) revert NoCode(relayerAddr);

        GhostPayRouter router = GhostPayRouter(payable(routerAddr));
        GhostPaySweepRelayer relayer = GhostPaySweepRelayer(relayerAddr);
        require(router.FEE_RECIPIENT() == feeRecipient, "router.FEE_RECIPIENT mismatch");
        require(router.FEE_BPS() == 25, "router.FEE_BPS mismatch");
        address announcer = address(router.ANNOUNCER());
        require(announcer.code.length != 0, "announcer has no code");
        string memory annRaw = _env("ANNOUNCER");
        if (bytes(annRaw).length != 0) {
            require(vm.parseAddress(annRaw) == announcer, "router.ANNOUNCER mismatch");
        }
        bytes32 sep = relayer.DOMAIN_SEPARATOR();
        require(sep != bytes32(0), "relayer.DOMAIN_SEPARATOR is zero");

        console2.log("chainId       :", block.chainid);
        console2.log("router        :", routerAddr);
        console2.log("sweepRelayer  :", relayerAddr);
        console2.log("announcer     :", announcer);
        console2.log("feeRecipient  :", feeRecipient);
        console2.log("router codehash:");
        console2.logBytes32(routerAddr.codehash);
        console2.log("relayer codehash:");
        console2.logBytes32(relayerAddr.codehash);
        console2.log("relayer domain separator:");
        console2.logBytes32(sep);
        console2.log("SMOKE OK");
    }

    function _addr(string memory name) private view returns (address a) {
        string memory raw = _env(name);
        if (bytes(raw).length == 0) revert EnvMissing(name);
        a = vm.parseAddress(raw);
    }
}
