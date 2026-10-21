// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {GhostPayShieldedPool} from "./GhostPayShieldedPool.sol";

/// @title GhostPayShieldedPoolNative
/// @author GhostPay
/// @notice Shielded pool for the chain's native asset (testnet PoC). `ASSET()` is `address(0)`.
/// @dev Security properties (in addition to `GhostPayShieldedPool`):
/// - Deposits require `msg.value == value`; plain transfers revert (`NoDirectETH`). Forced ETH
///   (`selfdestruct`, coinbase) only raises the balance above the notes' total and is unrecoverable.
/// - Payouts use an assembly `call` that forwards all gas and copies no return data (no
///   return-data bomb). A recipient contract can burn the submitter's gas or revert; the
///   withdrawal then fails atomically. Reentrancy into the pool is blocked by `nonReentrant`.
contract GhostPayShieldedPoolNative is GhostPayShieldedPool {
    /// @notice Deploys a native-asset pool.
    /// @param c Configuration; `c.asset` must be `address(0)`.
    constructor(PoolConfig memory c) GhostPayShieldedPool(c) {
        if (c.asset != address(0)) revert InvalidConfig();
    }

    /// @dev Requires `msg.value == value`.
    function _receiveDeposit(address, uint256 value) internal override {
        if (msg.value != value) revert InvalidValue();
    }

    /// @dev Sends `value` wei to `to` with all remaining gas; reverts on failure.
    function _push(address to, uint256 value) internal override {
        bool ok;
        // `to` is the proof-bound recipient/feeTo (validated non-zero and not the pool) or the
        // recorded depositor of a ragequit.
        // forge-lint: disable-next-line(arbitrary-send-eth)
        assembly ("memory-safe") {
            ok := call(gas(), to, value, 0, 0, 0, 0)
        }
        if (!ok) revert NativeTransferFailed();
    }

    /// @dev Native metadata marker.
    function _metadataMarker() internal pure override returns (bytes4) {
        return NATIVE_MARKER;
    }

    /// @dev Native sentinel address.
    function _metadataAsset() internal pure override returns (address) {
        return NATIVE_SENTINEL;
    }
}
