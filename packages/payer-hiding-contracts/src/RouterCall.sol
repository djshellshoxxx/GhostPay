// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IGhostPayRouter} from "ghostpay-contracts/interfaces/IGhostPayRouter.sol";
import {IGhostPayPolicyRouter} from "ghostpay-contracts/interfaces/IGhostPayPolicyRouter.sol";

/// @title RouterCall
/// @author GhostPay
/// @notice Pure helpers that decide whether opaque router calldata is a `payERC20` call that is
/// consistent with the fields a payer signed.
/// @dev Only two selectors are ever allowed: `GhostPayRouter.payERC20` and
/// `GhostPayPolicyRouter.payERC20`. Both put `token` in head word 0 and `stealth` in head word 1; `gross`
/// is head word 2 (plain router) or word 4 (policy router, after the inlined `PolicyRef` struct). The
/// words are compared in full (no masking), so calldata with dirty upper address bits is rejected.
library RouterCall {
    /// @notice Selector of `IGhostPayRouter.payERC20`.
    bytes4 internal constant SELECTOR_PLAIN = IGhostPayRouter.payERC20.selector;
    /// @notice Selector of `IGhostPayPolicyRouter.payERC20`.
    bytes4 internal constant SELECTOR_POLICY = IGhostPayPolicyRouter.payERC20.selector;

    /// @dev Minimum calldata length: selector + head words up to and including `gross`. The plain
    /// router head has 7 words, the policy router head 8; both are longer than the checked prefix.
    uint256 private constant MIN_PLAIN = 4 + 7 * 32;
    uint256 private constant MIN_POLICY = 4 + 8 * 32;

    /// @notice Whether `data` is an allowed `payERC20` call bound to `token`, `stealth` and `gross`.
    /// @param data The router calldata (selector included).
    /// @param token The token the payer signed.
    /// @param stealth The stealth address the payer signed.
    /// @param gross The gross amount the payer signed.
    /// @return ok True iff selector, length and the three bound head words all match.
    function matches(bytes calldata data, address token, address stealth, uint256 gross)
        internal
        pure
        returns (bool ok)
    {
        if (data.length < 4) return false;
        bytes4 sel = bytes4(data[0:4]);
        uint256 grossWord;
        if (sel == SELECTOR_PLAIN) {
            if (data.length < MIN_PLAIN) return false;
            grossWord = 2;
        } else if (sel == SELECTOR_POLICY) {
            if (data.length < MIN_POLICY) return false;
            grossWord = 4;
        } else {
            return false;
        }
        return _word(data, 0) == uint256(uint160(token))
            && _word(data, 1) == uint256(uint160(stealth)) && _word(data, grossWord) == gross;
    }

    function _word(bytes calldata data, uint256 index) private pure returns (uint256 w) {
        return uint256(bytes32(data[4 + index * 32:4 + index * 32 + 32]));
    }
}
