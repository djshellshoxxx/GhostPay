// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title ChainGuard
/// @author GhostPay
/// @notice Constructor-time testnet allowlist shared by every payer-hiding contract.
/// @dev The contracts are chain-agnostic by design, but this proof of concept must never be deployed
/// on a production network. The check runs once, in the constructor of the including contract, so the
/// deployed code carries no runtime gating. It is a guardrail against operator mistakes, not a
/// security boundary: anyone can fork the source and remove it.
abstract contract ChainGuard {
    /// @notice The deployment chain id is not one of 31337 (local), 11155111 (Ethereum Sepolia) or
    /// 84532 (Base Sepolia).
    /// @param chainId The offending `block.chainid`.
    error UnsupportedChain(uint256 chainId);

    /// @notice Local development chain (anvil / hardhat).
    uint256 internal constant CHAIN_LOCAL = 31_337;
    /// @notice Ethereum Sepolia.
    uint256 internal constant CHAIN_SEPOLIA = 11_155_111;
    /// @notice Base Sepolia.
    uint256 internal constant CHAIN_BASE_SEPOLIA = 84_532;

    constructor() {
        uint256 id = _chainId();
        if (id != CHAIN_LOCAL && id != CHAIN_SEPOLIA && id != CHAIN_BASE_SEPOLIA) {
            revert UnsupportedChain(id);
        }
    }

    /// @dev Chain id used by the constructor check. Overridden ONLY by test harnesses whose VM cannot
    /// set `block.chainid` (Echidna's default is 1); production contracts do not override it.
    function _chainId() internal view virtual returns (uint256) {
        return block.chainid;
    }
}
