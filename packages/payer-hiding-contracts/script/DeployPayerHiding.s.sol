// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";

import {GhostPayPayRelay} from "../src/GhostPayPayRelay.sol";
import {GhostPayPayerDelegate} from "../src/GhostPayPayerDelegate.sol";
import {GhostPayPayerAccountFactory} from "../src/GhostPayPayerAccountFactory.sol";
import {GhostPayVerifyingPaymaster} from "../src/GhostPayVerifyingPaymaster.sol";

/// @title DeployPayerHiding
/// @notice Deploys the payer-hiding contracts (relay, EIP-7702 delegate, account factory, verifying
/// paymaster) to a TESTNET or a local anvil chain. Every constructor reverts on other chain ids.
/// @dev Environment only; nothing is hard-coded and no key is read:
/// - `ENTRY_POINT` (required, must have code): the ERC-4337 v0.7 EntryPoint. If
///   `EXPECTED_ENTRY_POINT_CODEHASH` is set the EntryPoint's `codehash` must equal it (PH-4-REQ-2).
/// - `PAYMASTER_SIGNER` and `SPONSOR_ADMIN` (required for the paymaster, non-zero): the verifying signer
///   and the sole privileged admin of the paymaster. Set `SKIP_PAYMASTER=1` to deploy without PH-4.
/// Sign with `--account`, `--ledger` or `--trezor`; dry-run without `--broadcast` (this repository
/// deploys nothing to a real network from CI). Addresses are only logged; add them to the local
/// manifest after reading the code hashes back from the chain.
contract DeployPayerHiding is Script {
    /// @notice `ENTRY_POINT` is unset, the zero address or has no code.
    error EntryPointMissing();
    /// @notice The EntryPoint code hash differs from `EXPECTED_ENTRY_POINT_CODEHASH`.
    /// @param actual The actual code hash.
    /// @param expected The expected code hash.
    error EntryPointCodehashMismatch(bytes32 actual, bytes32 expected);
    /// @notice The chain id is not one of the testnet ids the contracts accept.
    /// @param chainId The offending chain id.
    error ChainNotAllowed(uint256 chainId);

    /// @notice Deploy and print the addresses.
    /// @return relay The PH-2 relay.
    /// @return delegate The PH-3 delegate implementation.
    /// @return factory The PH-4 account factory (zero when `SKIP_PAYMASTER=1`).
    /// @return paymaster The PH-4 paymaster (zero when `SKIP_PAYMASTER=1`).
    function run()
        external
        returns (
            GhostPayPayRelay relay,
            GhostPayPayerDelegate delegate,
            GhostPayPayerAccountFactory factory,
            GhostPayVerifyingPaymaster paymaster
        )
    {
        uint256 id = block.chainid;
        if (id != 31_337 && id != 11_155_111 && id != 84_532) revert ChainNotAllowed(id);
        bool skip = vm.envOr("SKIP_PAYMASTER", false);
        address entryPoint = vm.envOr("ENTRY_POINT", address(0));
        if (!skip) {
            if (entryPoint == address(0) || entryPoint.code.length == 0) {
                revert EntryPointMissing();
            }
            bytes32 expected = vm.envOr("EXPECTED_ENTRY_POINT_CODEHASH", bytes32(0));
            if (expected != bytes32(0) && entryPoint.codehash != expected) {
                revert EntryPointCodehashMismatch(entryPoint.codehash, expected);
            }
        }

        vm.startBroadcast();
        relay = new GhostPayPayRelay();
        delegate = new GhostPayPayerDelegate();
        if (!skip) {
            factory = new GhostPayPayerAccountFactory(entryPoint);
            paymaster = new GhostPayVerifyingPaymaster(
                entryPoint, vm.envAddress("PAYMASTER_SIGNER"), vm.envAddress("SPONSOR_ADMIN")
            );
        }
        vm.stopBroadcast();

        console2.log("chainid", id);
        console2.log("relay", address(relay));
        console2.log("delegate", address(delegate));
        console2.log("delegate codehash");
        console2.logBytes32(address(delegate).codehash);
        console2.log("factory", address(factory));
        console2.log("paymaster", address(paymaster));
        console2.log(
            "PRIVILEGED ROLE: paymaster SPONSOR_ADMIN (deposit/stake only), testnet use only"
        );
    }
}
