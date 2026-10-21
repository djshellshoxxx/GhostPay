// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {IWithdrawVerifier, IRagequitVerifier} from "../../src/interfaces/IGroth16Verifier.sol";

/// @title MockWithdrawVerifier
/// @notice TEST ONLY. Accepts exactly the public-signal vectors registered by the test (a model of a
/// sound verifier), or everything when `acceptAll` is set (a model of a forged-proof / broken setup).
contract MockWithdrawVerifier is IWithdrawVerifier {
    /// @notice Accept every proof.
    bool public acceptAll;
    /// @notice Registered signal hashes.
    mapping(bytes32 => bool) public accepted;

    /// @notice Register a signal vector as provable.
    /// @param s The 9 public signals.
    function accept(uint256[9] calldata s) external {
        accepted[keccak256(abi.encode(s))] = true;
    }

    /// @notice Toggle accept-all.
    /// @param on New value.
    function setAcceptAll(bool on) external {
        acceptAll = on;
    }

    /// @inheritdoc IWithdrawVerifier
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[9] calldata s
    ) external view returns (bool) {
        return acceptAll || accepted[keccak256(abi.encode(s))];
    }
}

/// @title MockRagequitVerifier
/// @notice TEST ONLY. Same model as `MockWithdrawVerifier` for the 4-signal commitment circuit.
contract MockRagequitVerifier is IRagequitVerifier {
    /// @notice Accept every proof.
    bool public acceptAll;
    /// @notice Registered signal hashes.
    mapping(bytes32 => bool) public accepted;

    /// @notice Register a signal vector as provable.
    /// @param s The 4 public signals.
    function accept(uint256[4] calldata s) external {
        accepted[keccak256(abi.encode(s))] = true;
    }

    /// @notice Toggle accept-all.
    /// @param on New value.
    function setAcceptAll(bool on) external {
        acceptAll = on;
    }

    /// @inheritdoc IRagequitVerifier
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[4] calldata s
    ) external view returns (bool) {
        return acceptAll || accepted[keccak256(abi.encode(s))];
    }
}

/// @title BadHasher
/// @notice TEST ONLY. Returns a constant for any input (fails the constructor known-answer test).
contract BadHasher {
    /// @notice Wrong T3 hash.
    /// @return Constant 1.
    function hash(uint256[2] calldata) external pure returns (uint256) {
        return 1;
    }

    /// @notice Wrong T4 hash.
    /// @return Constant 1.
    function hash(uint256[3] calldata) external pure returns (uint256) {
        return 1;
    }
}

/// @title ToggleFeeToken
/// @notice TEST ONLY. Standard ERC-20 until `feeOn` is set; then every transfer burns 1 base unit
/// (models a token that turns fee-on-transfer after deposits, or an upgradeable token gone bad).
contract ToggleFeeToken is ERC20 {
    /// @notice Whether transfers are lossy.
    bool public feeOn;

    constructor() ERC20("ToggleFee", "TGL") {}

    /// @notice Mint `amount` to `to`.
    /// @param to Recipient.
    /// @param amount Amount.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Toggle the fee.
    /// @param on New value.
    function setFee(bool on) external {
        feeOn = on;
    }

    /// @notice Burn `amount` from `from` (models a rebasing-down / clawback event).
    /// @param from Account.
    /// @param amount Amount.
    function clawback(address from, uint256 amount) external {
        _burn(from, amount);
    }

    /// @dev Burns 1 unit of every non-mint/burn transfer when `feeOn`.
    function _update(address from, address to, uint256 value) internal override {
        if (feeOn && from != address(0) && to != address(0) && value > 0) {
            super._update(from, address(0), 1);
            value -= 1;
        }
        super._update(from, to, value);
    }
}
