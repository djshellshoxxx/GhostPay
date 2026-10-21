// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {console2} from "forge-std/Script.sol";

import {ERC5564Announcer} from "../test/utils/ERC5564Announcer.sol";
import {DeployBase} from "./DeployBase.s.sol";

/// @title DeployAnnouncer
/// @notice Deterministically (CREATE2 through the keyless deterministic deployer) deploys the CC0 reference
/// ERC-5564 announcer on a chain that lacks the canonical one, then verifies its runtime codehash.
/// @dev Environment:
/// - `ANNOUNCER_SALT` (optional, 32-byte hex): CREATE2 salt, default zero.
/// - `EXPECTED_ANNOUNCER_CODEHASH` (optional): deployed runtime codehash must equal it.
/// - `ALLOW_NONCANONICAL_ANNOUNCER=1`: required when the CREATE2 address differs from the canonical
///   `0x55649E01B5Df198D18D95b5cc5051630cfD45564` (the case for a locally compiled build and any salt not
///   verified against the EIP). Such an announcer must then be passed to `Deploy` with `ALLOW_CUSTOM_ANNOUNCER=1`.
/// The runtime codehash is always compared with a fresh in-memory build of the same source, so a deployer
/// that returns different code fails closed. Idempotent: an existing contract at the address is only verified.
/// Dry-run unless run with `--broadcast` and a human-provided key. Testnets (and anvil with `ALLOW_LOCAL=1`).
contract DeployAnnouncer is DeployBase {
    /// @notice The keyless deterministic deployer (Arachnid), present on most EVM chains.
    address public constant DETERMINISTIC_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    /// @notice Canonical ERC-5564 announcer address.
    address public constant CANONICAL_ANNOUNCER = 0x55649E01B5Df198D18D95b5cc5051630cfD45564;

    /// @notice The deterministic deployer has no code on this chain.
    error DeployerMissing();
    /// @notice The CREATE2 call failed or produced no code at the predicted address.
    /// @param predicted The predicted announcer address.
    error DeployFailed(address predicted);
    /// @notice The CREATE2 address is not canonical and `ALLOW_NONCANONICAL_ANNOUNCER=1` is not set.
    /// @param predicted The predicted announcer address.
    error NonCanonicalAddress(address predicted);
    /// @notice The runtime codehash at the address differs from the expected one.
    /// @param actual The codehash found on chain.
    /// @param expected The local build hash or `EXPECTED_ANNOUNCER_CODEHASH` value.
    error CodehashMismatch(bytes32 actual, bytes32 expected);

    /// @notice CREATE2 address of the announcer for `salt` via the deterministic deployer.
    /// @param salt CREATE2 salt.
    /// @return predicted The address.
    function predict(bytes32 salt) public pure returns (address predicted) {
        predicted = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            DETERMINISTIC_DEPLOYER,
                            salt,
                            keccak256(type(ERC5564Announcer).creationCode)
                        )
                    )
                )
            )
        );
    }

    /// @notice Deploy (if absent) and verify the announcer.
    /// @return announcer The announcer address.
    function run() external returns (address announcer) {
        if (!_chainAllowed(block.chainid)) revert ChainNotAllowed(block.chainid);
        if (DETERMINISTIC_DEPLOYER.code.length == 0) revert DeployerMissing();

        string memory saltRaw = _env("ANNOUNCER_SALT");
        bytes32 salt = bytes(saltRaw).length == 0 ? bytes32(0) : vm.parseBytes32(saltRaw);
        announcer = predict(salt);
        if (announcer != CANONICAL_ANNOUNCER && !_flag("ALLOW_NONCANONICAL_ANNOUNCER")) {
            revert NonCanonicalAddress(announcer);
        }

        if (announcer.code.length == 0) {
            vm.startBroadcast();
            (bool ok,) = DETERMINISTIC_DEPLOYER.call(
                abi.encodePacked(salt, type(ERC5564Announcer).creationCode)
            );
            vm.stopBroadcast();
            if (!ok || announcer.code.length == 0) revert DeployFailed(announcer);
        }

        bytes32 actual = announcer.codehash;
        bytes32 localHash = address(new ERC5564Announcer()).codehash;
        if (actual != localHash) revert CodehashMismatch(actual, localHash);
        string memory expectedRaw = _env("EXPECTED_ANNOUNCER_CODEHASH");
        if (bytes(expectedRaw).length != 0) {
            bytes32 expected = vm.parseBytes32(expectedRaw);
            if (expected != actual) revert CodehashMismatch(actual, expected);
        }

        console2.log("chainId   :", block.chainid);
        console2.log("announcer :", announcer);
        console2.log("codehash:");
        console2.logBytes32(actual);
    }
}
