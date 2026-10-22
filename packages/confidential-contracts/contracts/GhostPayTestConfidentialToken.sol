// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {
    ERC7984ERC20Wrapper
} from "@openzeppelin/confidential-contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol";
import {TestnetOnly} from "./TestnetOnly.sol";

/// @title GhostPayTestConfidentialToken
/// @notice "Confidential GhostPay Test USD" (cTUSD): an OpenZeppelin `ERC7984ERC20Wrapper` over the
/// test ERC-20. TESTNET ONLY. The name and symbol contain "Test" and imitate no real asset.
/// @dev No owner, no pause, no upgrade. Wrapping and unwrapping reveal plaintext amounts by
/// construction of the wrapper (`wrap` pulls a plaintext ERC-20 transfer; `finalizeUnwrap` pays a
/// plaintext amount).
/// @custom:security The constructor refuses chains other than 31337 and 11155111.
contract GhostPayTestConfidentialToken is TestnetOnly, ZamaEthereumConfig, ERC7984ERC20Wrapper {
    /// @notice Deploys the wrapper.
    /// @param underlying_ The (test) ERC-20 to wrap.
    constructor(IERC20 underlying_)
        ERC7984("Confidential GhostPay Test USD", "cTUSD", "")
        ERC7984ERC20Wrapper(underlying_)
    {}
}
