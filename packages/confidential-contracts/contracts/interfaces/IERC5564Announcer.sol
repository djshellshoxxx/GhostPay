// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.23;

// Copied unchanged (NatSpec trimmed) from packages/contracts/src/interfaces/IERC5564Announcer.sol,
// itself vendored from https://github.com/ScopeLift/stealth-address-erc-contracts (CC0-1.0).
// Duplicated so this Hardhat package compiles without reaching into the Foundry package.

/// @notice Interface for calling the ERC-5564 announcer. See https://eips.ethereum.org/EIPS/eip-5564.
interface IERC5564Announcer {
    /// @notice Emitted when something is sent to a stealth address.
    /// @param schemeId Stealth address scheme id (1 = secp256k1 with view tags).
    /// @param stealthAddress The computed stealth address for the recipient.
    /// @param caller The caller of `announce`.
    /// @param ephemeralPubKey Ephemeral public key used by the sender.
    /// @param metadata Arbitrary data; the first byte MUST be the view tag.
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    /// @notice Emits an `Announcement` event.
    /// @param schemeId Stealth address scheme id.
    /// @param stealthAddress The computed stealth address for the recipient.
    /// @param ephemeralPubKey Ephemeral public key used by the sender.
    /// @param metadata Arbitrary data; the first byte MUST be the view tag.
    function announce(
        uint256 schemeId,
        address stealthAddress,
        bytes memory ephemeralPubKey,
        bytes memory metadata
    ) external;
}
