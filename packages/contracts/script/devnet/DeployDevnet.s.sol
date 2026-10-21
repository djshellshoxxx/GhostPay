// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {console2} from "forge-std/Script.sol";

import {DeployBase} from "../DeployBase.s.sol";
import {GhostPayRouter} from "../../src/GhostPayRouter.sol";
import {GhostPaySweepRelayer} from "../../src/GhostPaySweepRelayer.sol";
import {IERC5564Announcer} from "../../src/interfaces/IERC5564Announcer.sol";
import {ERC5564Announcer} from "../../test/utils/ERC5564Announcer.sol";
import {DevPermitStablecoin, DevPlainStablecoin} from "./DevTokens.sol";

/// @title DeployDevnet
/// @notice Local anvil devnet (chain id 31337) full stack: reference ERC-5564 announcer, router, sweep
/// relayer and three stablecoin stand-ins (permit USDC/DAI-like, plain USDT-like). Refuses any other chain.
/// @dev `FEE_RECIPIENT` env (required). The announcer is the CC0 reference implementation because the
/// canonical one does not exist on a fresh devnet. The broadcast file (`broadcast/DeployDevnet.s.sol/31337`)
/// is consumed by `scripts/testnet/make-manifest.mjs`.
contract DeployDevnet is DeployBase {
    /// @notice Script was started on a chain other than 31337.
    /// @param chainId The offending chain id.
    error NotDevnet(uint256 chainId);

    /// @notice Deploy the stack.
    /// @return announcer Reference announcer.
    /// @return router Router.
    /// @return relayer Sweep relayer.
    function run()
        external
        returns (ERC5564Announcer announcer, GhostPayRouter router, GhostPaySweepRelayer relayer)
    {
        if (block.chainid != 31_337) revert NotDevnet(block.chainid);
        address feeRecipient = _feeRecipient(msg.sender);

        vm.startBroadcast();
        (, address signer,) = vm.readCallers();
        if (signer == feeRecipient) revert FeeRecipientIsBroadcaster(feeRecipient);
        announcer = new ERC5564Announcer();
        router = new GhostPayRouter(IERC5564Announcer(address(announcer)), feeRecipient);
        relayer = new GhostPaySweepRelayer();
        DevPermitStablecoin usdc = new DevPermitStablecoin("Devnet USD Coin", "USDC", 6);
        DevPlainStablecoin usdt = new DevPlainStablecoin("Devnet Tether USD", "USDT", 6);
        DevPermitStablecoin dai = new DevPermitStablecoin("Devnet Dai", "DAI", 18);
        vm.stopBroadcast();

        require(router.FEE_RECIPIENT() == feeRecipient, "router.FEE_RECIPIENT mismatch");
        require(address(router.ANNOUNCER()) == address(announcer), "router.ANNOUNCER mismatch");
        require(router.FEE_BPS() == 25, "router.FEE_BPS mismatch");

        console2.log("announcer :", address(announcer));
        console2.log("router    :", address(router));
        console2.log("relayer   :", address(relayer));
        console2.log("USDC      :", address(usdc));
        console2.log("USDT      :", address(usdt));
        console2.log("DAI       :", address(dai));
    }
}
