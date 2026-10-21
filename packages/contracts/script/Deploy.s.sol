// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";

import {GhostPayRouter} from "../src/GhostPayRouter.sol";
import {GhostPaySweepRelayer} from "../src/GhostPaySweepRelayer.sol";
import {IERC5564Announcer} from "../src/interfaces/IERC5564Announcer.sol";

/// @title Deploy
/// @notice Deploys `GhostPayRouter` and `GhostPaySweepRelayer` against an existing ERC-5564 announcer.
/// @dev Configuration comes only from the environment; no key or fee address is hard-coded:
/// - `FEE_RECIPIENT` (required, non-zero): fee recipient, ideally a hardware wallet or multisig.
/// - `ANNOUNCER` (optional): defaults to the canonical ERC-5564 announcer.
/// - `ALLOWED_CHAIN_IDS` (optional, comma separated): extra chain ids allowed besides the built-in
///   testnet list. Mainnet deployments MUST list their chain id explicitly.
/// Sign with `--account`, `--ledger` or `--trezor`; never pass a raw private key on a shared machine.
contract Deploy is Script {
    /// @notice Canonical ERC-5564 announcer address (deterministic deployment).
    address public constant CANONICAL_ANNOUNCER = 0x55649E01B5Df198D18D95b5cc5051630cfD45564;

    /// @notice `FEE_RECIPIENT` is unset or the zero address.
    error FeeRecipientNotSet();
    /// @notice The chain id is neither a built-in testnet nor listed in `ALLOWED_CHAIN_IDS`.
    /// @param chainId The rejected chain id.
    error ChainNotAllowed(uint256 chainId);
    /// @notice No contract code exists at the announcer address on this chain.
    /// @param announcer The announcer address without code.
    error AnnouncerHasNoCode(address announcer);

    /// @notice Deploy and print the addresses.
    /// @return router The deployed router.
    /// @return relayer The deployed sweep relayer.
    function run() external returns (GhostPayRouter router, GhostPaySweepRelayer relayer) {
        // Read as strings so that unset and empty variables (common in CI) behave identically.
        string memory feeRaw = vm.envOr("FEE_RECIPIENT", string(""));
        if (bytes(feeRaw).length == 0) revert FeeRecipientNotSet();
        address feeRecipient = vm.parseAddress(feeRaw);
        if (feeRecipient == address(0)) revert FeeRecipientNotSet();
        string memory announcerRaw = vm.envOr("ANNOUNCER", string(""));
        address announcer =
            bytes(announcerRaw).length == 0 ? CANONICAL_ANNOUNCER : vm.parseAddress(announcerRaw);

        if (!_chainAllowed(block.chainid)) revert ChainNotAllowed(block.chainid);
        if (announcer.code.length == 0) revert AnnouncerHasNoCode(announcer);

        vm.startBroadcast();
        router = new GhostPayRouter(IERC5564Announcer(announcer), feeRecipient);
        relayer = new GhostPaySweepRelayer();
        vm.stopBroadcast();

        console2.log("chainId        :", block.chainid);
        console2.log("announcer      :", announcer);
        console2.log("feeRecipient   :", feeRecipient);
        console2.log("feeBps         :", router.FEE_BPS());
        console2.log("router         :", address(router));
        console2.log("sweepRelayer   :", address(relayer));
        console2.log("router codehash:");
        console2.logBytes32(address(router).codehash);
        console2.log("relayer codehash:");
        console2.logBytes32(address(relayer).codehash);
    }

    /// @dev Built-in testnets plus the env allowlist.
    function _chainAllowed(uint256 chainId) internal view returns (bool) {
        uint256[7] memory testnets = [
            uint256(31_337), // local anvil / forge test
            11_155_111, // Ethereum Sepolia
            84_532, // Base Sepolia
            11_155_420, // OP Sepolia
            421_614, // Arbitrum Sepolia
            80_002, // Polygon Amoy
            560_048 // Ethereum Hoodi
        ];
        for (uint256 i; i < testnets.length; i++) {
            if (testnets[i] == chainId) return true;
        }
        string memory raw = vm.envOr("ALLOWED_CHAIN_IDS", string(""));
        if (bytes(raw).length == 0) return false;
        string[] memory parts = vm.split(raw, ",");
        for (uint256 i; i < parts.length; i++) {
            if (vm.parseUint(parts[i]) == chainId) return true;
        }
        return false;
    }
}
