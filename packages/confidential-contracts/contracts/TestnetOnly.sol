// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title TestnetOnly
/// @notice Constructor guard that refuses deployment on any chain other than the two where the
/// Zama fhEVM host contracts are available to this proof of concept.
/// @dev Allowed chain ids: 31337 (local Hardhat/anvil mock) and 11155111 (Ethereum Sepolia). Base
/// Sepolia (84532) is a GhostPay testnet but is NOT supported by the Zama protocol (see
/// `docs/remote/privacy-specs/confidential-tokens.md` section 3), so it is refused here too.
/// @custom:security The guard is a deployment-time safety net, not an access control: it only
/// stops accidental deployment on a mainnet. A mainnet fork that reports chain id 31337 or
/// 11155111 passes it by design.
abstract contract TestnetOnly {
    /// @notice Thrown by the constructor when `block.chainid` is not an allowed testnet.
    /// @param chainId The chain id the deployment was attempted on.
    error UnsupportedChain(uint256 chainId);

    /// @dev Local development chain id.
    uint256 private constant LOCAL_CHAIN_ID = 31_337;
    /// @dev Ethereum Sepolia chain id.
    uint256 private constant SEPOLIA_CHAIN_ID = 11_155_111;

    /// @notice Reverts with {UnsupportedChain} unless the chain id is 31337 or 11155111.
    constructor() {
        if (block.chainid != LOCAL_CHAIN_ID && block.chainid != SEPOLIA_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }
    }
}
