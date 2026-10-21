// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {console2} from "forge-std/Script.sol";

import {DeployBase} from "./DeployBase.s.sol";
import {GhostPayRouter} from "../src/GhostPayRouter.sol";
import {GhostPaySweepRelayer} from "../src/GhostPaySweepRelayer.sol";
import {IERC5564Announcer} from "../src/interfaces/IERC5564Announcer.sol";

/// @title Deploy
/// @notice Deploys `GhostPayRouter` and `GhostPaySweepRelayer` against an existing ERC-5564 announcer.
/// @dev Configuration comes only from the environment; no key or fee address is hard-coded:
/// - `FEE_RECIPIENT` (required, non-zero, not the broadcaster): fee recipient, ideally a hardware wallet
///   or multisig. It must be able to receive ETH (a warning is printed if it is a contract).
/// - `ANNOUNCER` (optional): defaults to the canonical ERC-5564 announcer. Any other address is rejected
///   unless `ALLOW_CUSTOM_ANNOUNCER=1` (testnets with a locally deployed announcer).
/// - `EXPECTED_ANNOUNCER_CODEHASH` (optional): if set, the announcer's `codehash` must equal it.
/// - `ALLOWED_CHAIN_IDS` (optional, comma separated, spaces tolerated): extra chain ids allowed besides
///   the built-in testnet list. Mainnet deployments MUST list their chain id explicitly.
/// - `ALLOW_LOCAL=1` (optional): additionally allows chain id 31337 (anvil / forge test).
/// Every immutable is read back after deployment and compared with the inputs.
/// Sign with `--account`, `--ledger` or `--trezor`; never pass a raw private key on a shared machine.
contract Deploy is DeployBase {
    /// @notice Canonical ERC-5564 announcer address (deterministic deployment).
    address public constant CANONICAL_ANNOUNCER = 0x55649E01B5Df198D18D95b5cc5051630cfD45564;

    /// @notice No contract code exists at the announcer address on this chain.
    /// @param announcer The announcer address without code.
    error AnnouncerHasNoCode(address announcer);
    /// @notice `ANNOUNCER` differs from the canonical address and `ALLOW_CUSTOM_ANNOUNCER=1` is not set.
    /// @param announcer The rejected announcer.
    error CustomAnnouncerNotAllowed(address announcer);
    /// @notice The announcer's code hash differs from `EXPECTED_ANNOUNCER_CODEHASH`.
    /// @param actual The actual code hash.
    /// @param expected The expected code hash.
    error AnnouncerCodehashMismatch(bytes32 actual, bytes32 expected);

    /// @notice Deploy and print the addresses.
    /// @return router The deployed router.
    /// @return relayer The deployed sweep relayer.
    function run() external returns (GhostPayRouter router, GhostPaySweepRelayer relayer) {
        address feeRecipient = _feeRecipient(msg.sender);
        string memory announcerRaw = _env("ANNOUNCER");
        address announcer =
            bytes(announcerRaw).length == 0 ? CANONICAL_ANNOUNCER : vm.parseAddress(announcerRaw);

        if (!_chainAllowed(block.chainid)) revert ChainNotAllowed(block.chainid);
        if (announcer != CANONICAL_ANNOUNCER && !_flag("ALLOW_CUSTOM_ANNOUNCER")) {
            revert CustomAnnouncerNotAllowed(announcer);
        }
        if (announcer.code.length == 0) revert AnnouncerHasNoCode(announcer);
        bytes32 announcerHash = announcer.codehash;
        string memory expectedRaw = _env("EXPECTED_ANNOUNCER_CODEHASH");
        if (bytes(expectedRaw).length != 0) {
            bytes32 expected = vm.parseBytes32(expectedRaw);
            if (expected != announcerHash) {
                revert AnnouncerCodehashMismatch(announcerHash, expected);
            }
        }
        if (feeRecipient.code.length != 0) {
            console2.log("WARNING: feeRecipient is a contract; it MUST accept plain ETH transfers.");
        }

        vm.startBroadcast();
        // The account that will actually sign must not be the fee recipient either.
        (, address signer,) = vm.readCallers();
        if (signer == feeRecipient) revert FeeRecipientIsBroadcaster(feeRecipient);
        router = new GhostPayRouter(IERC5564Announcer(announcer), feeRecipient);
        relayer = new GhostPaySweepRelayer();
        vm.stopBroadcast();

        // Read-back of every immutable and of the relayer's EIP-712 domain.
        require(router.FEE_RECIPIENT() == feeRecipient, "router.FEE_RECIPIENT mismatch");
        require(address(router.ANNOUNCER()) == announcer, "router.ANNOUNCER mismatch");
        require(router.FEE_BPS() == 25, "router.FEE_BPS mismatch");
        require(address(router).code.length != 0, "router has no code");
        require(address(relayer).code.length != 0, "relayer has no code");
        require(relayer.DOMAIN_SEPARATOR() != bytes32(0), "relayer.DOMAIN_SEPARATOR is zero");

        console2.log("chainId        :", block.chainid);
        console2.log("announcer      :", announcer);
        console2.log("announcer codehash:");
        console2.logBytes32(announcerHash);
        console2.log("feeRecipient   :", feeRecipient);
        console2.log("feeBps         :", router.FEE_BPS());
        console2.log("router         :", address(router));
        console2.log("sweepRelayer   :", address(relayer));
        console2.log("router codehash:");
        console2.logBytes32(address(router).codehash);
        console2.log("relayer codehash:");
        console2.logBytes32(address(relayer).codehash);
    }
}
