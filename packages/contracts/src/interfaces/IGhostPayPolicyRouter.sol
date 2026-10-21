// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IGhostPayPolicyRouter
/// @notice External interface, events and errors of the GhostPay scheme-2 (policy account) checkout router.
/// @dev Same fee, checks and metadata layout as `IGhostPayRouter`, but every payment names the policy
/// account's `(owner, policyHash)` and the router requires `stealth` to be the CREATE2 address that the
/// immutable `PolicyAccountFactory` predicts for them. Announcements use scheme id `0x47500002`.
/// Error names (and therefore selectors) shared with `IGhostPayRouter` are identical.
/// See docs/CONTRACTS_SPEC.md section 4 and audit 02 finding M-02.
interface IGhostPayPolicyRouter {
    /// @notice Identifies a policy account by the inputs of its CREATE2 address.
    /// @param owner The account's stealth owner (`A_owner`), the EOA that signs for it.
    /// @param policyHash `keccak256(abi.encode(destination, delaySeconds, limitsRoot))`, see
    /// `PolicyAccountFactory.policyHashOf`.
    struct PolicyRef {
        address owner;
        bytes32 policyHash;
    }

    /// @notice ERC-2612 permit signature of the caller (grouped to keep the ABI decoder within stack limits).
    /// @param v Permit signature recovery id.
    /// @param r Permit signature r.
    /// @param s Permit signature s.
    struct PermitSig {
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @notice Emitted once per payment whose fee is non-zero.
    /// @dev Carries no payer, stealth address, owner, policy or invoice data on purpose (privacy).
    /// @param token The fee token, or `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` for the native asset.
    /// @param amount The fee amount in base units of `token`.
    event FeeCollected(address indexed token, uint256 amount);

    /// @notice A required address (constructor argument, token or policy owner) was the zero address.
    error ZeroAddress();
    /// @notice The stealth address is zero, the router itself or the fee recipient.
    error InvalidStealth();
    /// @notice `block.timestamp` is greater than the supplied deadline.
    error Expired();
    /// @notice The gross amount is zero.
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
    /// @notice The factory passed to the constructor has no code.
    error FactoryHasNoCode();
    /// @notice `stealth` is not the policy account address the factory predicts for `(owner, policyHash)`.
    /// @param expected The address predicted by the factory.
    error NotPolicyAccount(address expected);

    /// @notice Pay an ERC-20 token to a policy account, taking the protocol fee. Requires prior allowance.
    /// @param token The ERC-20 token being paid.
    /// @param stealth The policy account (`A_acct`) receiving the net amount; may be undeployed.
    /// @param policy The policy account's `(owner, policyHash)`; `stealth` must be its predicted address.
    /// @param gross Total amount pulled from the caller, in base units.
    /// @param minNet Minimum acceptable net amount (`gross - fee`).
    /// @param deadline Last timestamp (inclusive) at which the call is valid.
    /// @param ephemeralPubKey 33-byte compressed ephemeral public key announced to the recipient.
    /// @param metadata 57-byte announcement metadata: view tag, `transfer` selector, token, net amount.
    function payERC20(
        IERC20 token,
        address stealth,
        PolicyRef calldata policy,
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
    /// @param stealth The policy account (`A_acct`) receiving the net amount; may be undeployed.
    /// @param policy The policy account's `(owner, policyHash)`; `stealth` must be its predicted address.
    /// @param gross Total amount pulled from the caller, also the permit value.
    /// @param minNet Minimum acceptable net amount (`gross - fee`).
    /// @param deadline Last timestamp (inclusive) for the payment and the permit.
    /// @param ephemeralPubKey 33-byte compressed ephemeral public key announced to the recipient.
    /// @param metadata 57-byte announcement metadata: view tag, `transfer` selector, token, net amount.
    /// @param permit The caller's ERC-2612 signature over `(msg.sender, router, gross, nonce, deadline)`.
    function payERC20WithPermit(
        IERC20 token,
        address stealth,
        PolicyRef calldata policy,
        uint256 gross,
        uint256 minNet,
        uint256 deadline,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata,
        PermitSig calldata permit
    ) external;

    /// @notice Pay the native asset to a policy account, taking the protocol fee. `gross = msg.value`.
    /// @param stealth The policy account (`A_acct`) receiving the net amount; may be undeployed.
    /// @param policy The policy account's `(owner, policyHash)`; `stealth` must be its predicted address.
    /// @param minNet Minimum acceptable net amount (`msg.value - fee`).
    /// @param deadline Last timestamp (inclusive) at which the call is valid.
    /// @param ephemeralPubKey 33-byte compressed ephemeral public key announced to the recipient.
    /// @param metadata 57-byte announcement metadata: view tag, `0xeeeeeeee`, native sentinel, net amount.
    function payNative(
        address stealth,
        PolicyRef calldata policy,
        uint256 minNet,
        uint256 deadline,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external payable;

    /// @notice Pay an ERC-20 token like {payERC20} and forward `msg.value` (a gas buffer, no fee) to `stealth`.
    /// @param token The ERC-20 token being paid.
    /// @param stealth The policy account (`A_acct`) receiving the net amount and the buffer.
    /// @param policy The policy account's `(owner, policyHash)`; `stealth` must be its predicted address.
    /// @param gross Total token amount pulled from the caller.
    /// @param minNet Minimum acceptable net token amount.
    /// @param deadline Last timestamp (inclusive) at which the call is valid.
    /// @param maxBufferWei Maximum native buffer the caller accepts to forward (`msg.value <= maxBufferWei`).
    /// @param ephemeralPubKey 33-byte compressed ephemeral public key announced to the recipient.
    /// @param metadata 57-byte announcement metadata: view tag, `transfer` selector, token, net amount.
    function payERC20WithBuffer(
        IERC20 token,
        address stealth,
        PolicyRef calldata policy,
        uint256 gross,
        uint256 minNet,
        uint256 deadline,
        uint256 maxBufferWei,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external payable;
}
