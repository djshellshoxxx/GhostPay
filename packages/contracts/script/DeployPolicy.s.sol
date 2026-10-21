// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";

import {PolicyAccount} from "../src/PolicyAccount.sol";
import {PolicyAccountFactory} from "../src/PolicyAccountFactory.sol";

/// @title DeployPolicy
/// @notice Deploys the `PolicyAccount` implementation and its `PolicyAccountFactory` (scheme 0x47500002).
/// @dev Configuration comes only from the environment; no key, token or fee address is hard-coded:
/// - `FEE_RECIPIENT` (required, non-zero): flat-fee recipient, ideally a hardware wallet or multisig.
/// - `FEE_TOKEN` (required, non-zero, must have code): the chain's stablecoin used for the F-SECURE fee.
/// - `FLAT_FEE` (required): fee per account in `FEE_TOKEN` base units (default policy: USD 3.00 equivalent);
///   `0` explicitly disables the fee.
/// - `ALLOWED_CHAIN_IDS` (optional, comma separated): extra chain ids allowed besides the built-in
///   testnet list. Mainnet deployments MUST list their chain id explicitly.
/// Sign with `--account`, `--ledger` or `--trezor`; never pass a raw private key on a shared machine.
contract DeployPolicy is Script {
    /// @notice `FEE_RECIPIENT` is unset or the zero address.
    error FeeRecipientNotSet();
    /// @notice `FEE_TOKEN` is unset or the zero address.
    error FeeTokenNotSet();
    /// @notice `FLAT_FEE` is unset or empty.
    error FlatFeeNotSet();
    /// @notice No contract code exists at the fee token address on this chain.
    /// @param feeToken The fee token address without code.
    error FeeTokenHasNoCode(address feeToken);
    /// @notice The chain id is neither a built-in testnet nor listed in `ALLOWED_CHAIN_IDS`.
    /// @param chainId The rejected chain id.
    error ChainNotAllowed(uint256 chainId);

    /// @notice Deploy and print the addresses.
    /// @return implementation The deployed (self-locked) implementation.
    /// @return factory The deployed factory.
    function run() external returns (PolicyAccount implementation, PolicyAccountFactory factory) {
        // Read as strings so that unset and empty variables (common in CI) behave identically.
        string memory feeRaw = _env("FEE_RECIPIENT");
        if (bytes(feeRaw).length == 0) revert FeeRecipientNotSet();
        address feeRecipient = vm.parseAddress(feeRaw);
        if (feeRecipient == address(0)) revert FeeRecipientNotSet();

        string memory tokenRaw = _env("FEE_TOKEN");
        if (bytes(tokenRaw).length == 0) revert FeeTokenNotSet();
        address feeToken = vm.parseAddress(tokenRaw);
        if (feeToken == address(0)) revert FeeTokenNotSet();

        string memory flatRaw = _env("FLAT_FEE");
        if (bytes(flatRaw).length == 0) revert FlatFeeNotSet();
        uint256 flatFee = vm.parseUint(flatRaw);

        if (!_chainAllowed(block.chainid)) revert ChainNotAllowed(block.chainid);
        if (feeToken.code.length == 0) revert FeeTokenHasNoCode(feeToken);

        vm.startBroadcast();
        implementation = new PolicyAccount();
        factory = new PolicyAccountFactory(address(implementation), feeToken, flatFee, feeRecipient);
        vm.stopBroadcast();

        console2.log("chainId           :", block.chainid);
        console2.log("feeRecipient      :", feeRecipient);
        console2.log("feeToken          :", feeToken);
        console2.log("flatFee           :", flatFee);
        console2.log("implementation    :", address(implementation));
        console2.log("policyFactory     :", address(factory));
        console2.log("implementation codehash:");
        console2.logBytes32(address(implementation).codehash);
        console2.log("factory codehash:");
        console2.logBytes32(address(factory).codehash);
    }

    /// @dev Reads one environment variable as a string (unset reads as empty). Virtual so that tests can
    /// inject configuration without touching the process-global environment shared by parallel suites.
    function _env(string memory name) internal view virtual returns (string memory) {
        return vm.envOr(name, string(""));
    }

    /// @dev Built-in testnets plus the env allowlist (same list as `Deploy`).
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
        string memory raw = _env("ALLOWED_CHAIN_IDS");
        if (bytes(raw).length == 0) return false;
        string[] memory parts = vm.split(raw, ",");
        for (uint256 i; i < parts.length; i++) {
            if (vm.parseUint(parts[i]) == chainId) return true;
        }
        return false;
    }
}
