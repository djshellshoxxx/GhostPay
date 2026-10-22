// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IGhostPayRouter
/// @notice External interface, events and errors of the GhostPay checkout router.
/// @dev The router takes a fixed protocol fee, moves the net amount to a stealth address and emits
/// an ERC-5564 announcement whose metadata mirrors the transfer. See docs/CONTRACTS_SPEC.md section 1.
interface IGhostPayRouter {
    /// @notice Emitted once per payment whose fee is non-zero.
    /// @dev Carries no payer, stealth address or invoice data on purpose (privacy).
    /// @param token The fee token, or `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` for the native asset.
    /// @param amount The fee amount in base units of `token`.
    event FeeCollected(address indexed token, uint256 amount);

    /// @notice A required address argument (constructor argument or token) was the zero address.
    error ZeroAddress();
    /// @notice The stealth address is zero, the router itself or the fee recipient.
    error InvalidStealth();
    /// @notice `block.timestamp` is greater than the supplied deadline.
    error Expired();
    /// @notice The gross amount (or the resulting net amount) is zero.
    error ZeroAmount();
    /// @notice The net amount after fee is below the caller supplied `minNet`.
    error SlippageExceeded();
    /// @notice The ephemeral public key is not a 33-byte compressed point (prefix 0x02 or 0x03).
    error InvalidEphemeralKey();
    /// @notice The announcement metadata is not the exact 57-byte layout for this payment.
    error InvalidMetadata();
    /// @notice A balance did not change by exactly the expected amount (fee-on-transfer, rebasing, hooks).
    error UnexpectedBalanceDelta();
    /// @notice A native-asset transfer to the fee recipient or stealth address failed.
    error NativeTransferFailed();
    /// @notice `msg.value` exceeds the caller supplied `maxBufferWei`.
    error BufferTooLarge();
    /// @notice `payERC20WithBuffer` was called with `msg.value == 0`.
    error BufferRequired();
    /// @notice Native asset was sent to the router outside of `payNative`/`payERC20WithBuffer`.
    error NoDirectETH();

    /// @notice Pay an ERC-20 token to a stealth address, taking the protocol fee. Requires prior allowance.
    /// @param token The ERC-20 token being paid.
    /// @param stealth The stealth address receiving the net amount.
    /// @param gross Total amount pulled from the caller, in base units.
    /// @param minNet Minimum acceptable net amount (`gross - fee`).
    /// @param deadline Last timestamp (inclusive) at which the call is valid.
    /// @param ephemeralPubKey 33-byte compressed ephemeral public key announced to the recipient.
    /// @param metadata 57-byte announcement metadata: view tag, `transfer` selector, token, net amount.
    function payERC20(
        IERC20 token,
        address stealth,
        uint256 gross,
        uint256 minNet,
        uint256 deadline,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external;

    /// @notice Same as {payERC20} but first submits an ERC-2612 permit signed by the caller.
    /// @dev The permit is wrapped in try/catch so a front-run permit cannot block the payment; if the
    /// allowance is then insufficient the token transfer reverts.
    /// @param token The ERC-20 token being paid (must implement ERC-2612).
    /// @param stealth The stealth address receiving the net amount.
    /// @param gross Total amount pulled from the caller, also the permit value.
    /// @param minNet Minimum acceptable net amount (`gross - fee`).
    /// @param deadline Last timestamp (inclusive) for the payment and the permit.
    /// @param ephemeralPubKey 33-byte compressed ephemeral public key announced to the recipient.
    /// @param metadata 57-byte announcement metadata: view tag, `transfer` selector, token, net amount.
    /// @param v Permit signature recovery id.
    /// @param r Permit signature r.
    /// @param s Permit signature s.
    function payERC20WithPermit(
        IERC20 token,
        address stealth,
        uint256 gross,
        uint256 minNet,
        uint256 deadline,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /// @notice Pay the native asset to a stealth address, taking the protocol fee. `gross = msg.value`.
    /// @param stealth The stealth address receiving the net amount.
    /// @param minNet Minimum acceptable net amount (`msg.value - fee`).
    /// @param deadline Last timestamp (inclusive) at which the call is valid.
    /// @param ephemeralPubKey 33-byte compressed ephemeral public key announced to the recipient.
    /// @param metadata 57-byte announcement metadata: view tag, `0xeeeeeeee`, native sentinel, net amount.
    function payNative(
        address stealth,
        uint256 minNet,
        uint256 deadline,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external payable;

    /// @notice Pay an ERC-20 token like {payERC20} and forward `msg.value` (a gas buffer, no fee) to `stealth`.
    /// @param token The ERC-20 token being paid.
    /// @param stealth The stealth address receiving the net amount and the buffer.
    /// @param gross Total token amount pulled from the caller.
    /// @param minNet Minimum acceptable net token amount.
    /// @param deadline Last timestamp (inclusive) at which the call is valid.
    /// @param maxBufferWei Maximum native buffer the caller accepts to forward (`msg.value <= maxBufferWei`).
    /// @param ephemeralPubKey 33-byte compressed ephemeral public key announced to the recipient.
    /// @param metadata 57-byte announcement metadata: view tag, `transfer` selector, token, net amount.
    function payERC20WithBuffer(
        IERC20 token,
        address stealth,
        uint256 gross,
        uint256 minNet,
        uint256 deadline,
        uint256 maxBufferWei,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external payable;
}
