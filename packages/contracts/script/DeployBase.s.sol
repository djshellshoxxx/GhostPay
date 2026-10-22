// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";

/// @title DeployBase
/// @notice Shared configuration helpers of the deployment scripts: environment access, chain allowlist
/// and strict list parsing. Contains no deployment logic.
abstract contract DeployBase is Script {
    /// @notice An entry of `ALLOWED_CHAIN_IDS` is empty or not a plain decimal number.
    /// @param entry The offending entry after whitespace trimming.
    error InvalidChainIdEntry(string entry);
    /// @notice The chain id is neither a built-in testnet nor listed in `ALLOWED_CHAIN_IDS`.
    /// @param chainId The rejected chain id.
    error ChainNotAllowed(uint256 chainId);
    /// @notice `FEE_RECIPIENT` is unset or the zero address.
    error FeeRecipientNotSet();
    /// @notice `FEE_RECIPIENT` equals the broadcasting account (a signer key must not collect fees).
    /// @param recipient The offending address.
    error FeeRecipientIsBroadcaster(address recipient);

    /// @dev Reads one environment variable as a string (unset reads as empty). Virtual so that tests can
    /// inject configuration without touching the process-global environment shared by parallel suites.
    function _env(string memory name) internal view virtual returns (string memory) {
        return vm.envOr(name, string(""));
    }

    /// @dev True only when the variable is exactly "1".
    function _flag(string memory name) internal view returns (bool) {
        return keccak256(bytes(_env(name))) == keccak256(bytes("1"));
    }

    /// @dev Parses and validates the common `FEE_RECIPIENT` variable.
    function _feeRecipient(address broadcaster) internal view returns (address feeRecipient) {
        string memory feeRaw = _env("FEE_RECIPIENT");
        if (bytes(feeRaw).length == 0) revert FeeRecipientNotSet();
        feeRecipient = vm.parseAddress(feeRaw);
        if (feeRecipient == address(0)) revert FeeRecipientNotSet();
        if (feeRecipient == broadcaster) revert FeeRecipientIsBroadcaster(feeRecipient);
    }

    /// @dev Built-in testnets (plus anvil only with `ALLOW_LOCAL=1`) plus the env allowlist.
    function _chainAllowed(uint256 chainId) internal view returns (bool) {
        uint256[6] memory testnets = [
            uint256(11_155_111), // Ethereum Sepolia
            84_532, // Base Sepolia
            11_155_420, // OP Sepolia
            421_614, // Arbitrum Sepolia
            80_002, // Polygon Amoy
            560_048 // Ethereum Hoodi
        ];
        for (uint256 i; i < testnets.length; i++) {
            if (testnets[i] == chainId) return true;
        }
        // 31337 is also what a forked anvil reports, so it is opt-in.
        if (chainId == 31_337 && _flag("ALLOW_LOCAL")) return true;
        string memory raw = _env("ALLOWED_CHAIN_IDS");
        if (bytes(raw).length == 0) return false;
        string[] memory parts = vm.split(raw, ",");
        for (uint256 i; i < parts.length; i++) {
            if (_parseChainId(parts[i]) == chainId) return true;
        }
        return false;
    }

    /// @dev Trims spaces/tabs and parses a plain decimal number; anything else reverts with a clear error.
    function _parseChainId(string memory entry) internal pure returns (uint256 value) {
        bytes memory b = bytes(entry);
        uint256 start;
        uint256 end = b.length;
        while (start < end && (b[start] == 0x20 || b[start] == 0x09)) start++;
        while (end > start && (b[end - 1] == 0x20 || b[end - 1] == 0x09)) end--;
        if (start == end) revert InvalidChainIdEntry(entry);
        for (uint256 i = start; i < end; i++) {
            uint8 c = uint8(b[i]);
            if (c < 0x30 || c > 0x39) revert InvalidChainIdEntry(entry);
            value = value * 10 + (c - 0x30);
        }
    }
}
