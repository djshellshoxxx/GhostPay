// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title IGhostPaySweepRelayer
/// @notice External interface, types, events and errors of the gas-sponsored stealth sweep relayer.
/// @dev See docs/CONTRACTS_SPEC.md section 2.
interface IGhostPaySweepRelayer {
    /// @notice Sweep order signed (EIP-712) by the stealth key `owner`.
    /// @param token ERC-20 token being swept.
    /// @param owner Stealth address that holds the tokens and signed the order.
    /// @param destination Address receiving `amount - fee`.
    /// @param feeTo Address receiving `fee` (the relayer's reimbursement).
    /// @param amount Total amount taken from `owner`.
    /// @param fee Portion of `amount` paid to `feeTo`; must be strictly less than `amount`.
    /// @param deadline Last timestamp (inclusive) at which the order is valid.
    /// @param nonce Unordered single-use nonce, scoped to `owner`.
    struct Sweep {
        address token;
        address owner;
        address destination;
        address feeTo;
        uint256 amount;
        uint256 fee;
        uint256 deadline;
        uint256 nonce;
    }

    /// @notice ERC-2612 permit parameters; the permit spender is always the relayer.
    /// @param value Permit allowance value; must be at least `Sweep.amount`.
    /// @param deadline Permit deadline.
    /// @param v Signature recovery id.
    /// @param r Signature r.
    /// @param s Signature s.
    struct PermitSig {
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @notice Emitted after a successful sweep.
    /// @param token The swept token.
    /// @param owner The stealth address swept.
    /// @param destination The address that received `amount - fee`.
    /// @param amount Total amount taken from `owner`.
    /// @param fee Portion of `amount` paid to the fee recipient.
    event Swept(
        address indexed token,
        address indexed owner,
        address indexed destination,
        uint256 amount,
        uint256 fee
    );

    /// @notice A required address was zero.
    error ZeroAddress();
    /// @notice `destination`, `feeTo`, `owner` or `token` is the relayer contract itself.
    error SelfAddress();
    /// @notice `block.timestamp` is greater than the order deadline.
    error Expired();
    /// @notice `amount` is not strictly greater than `fee`.
    error InvalidAmount();
    /// @notice The recovered signer is not `owner`.
    error InvalidSignature();
    /// @notice The nonce was already consumed for this owner.
    error NonceAlreadyUsed();
    /// @notice `permit.value` is lower than the swept `amount`.
    error PermitValueTooLow();
    /// @notice A balance did not change by exactly the expected amount.
    error UnexpectedBalanceDelta();

    /// @notice Sweep tokens after submitting the owner's ERC-2612 permit (try/catch).
    /// @param s The signed sweep order.
    /// @param sweepSig 65-byte EIP-712 signature of `s` by `s.owner`.
    /// @param permit The owner's ERC-2612 permit for the relayer as spender.
    function sweepWithPermit(Sweep calldata s, bytes calldata sweepSig, PermitSig calldata permit)
        external;

    /// @notice Sweep tokens when the owner already granted the relayer an allowance.
    /// @param s The signed sweep order.
    /// @param sweepSig 65-byte EIP-712 signature of `s` by `s.owner`.
    function sweep(Sweep calldata s, bytes calldata sweepSig) external;

    /// @notice Whether `nonce` has been consumed for `owner`.
    /// @param owner The signer the nonce is scoped to.
    /// @param nonce The nonce to query.
    /// @return used True if the nonce was already used.
    function nonceUsed(address owner, uint256 nonce) external view returns (bool used);

    /// @notice The EIP-712 domain separator of this deployment (depends on chain id).
    /// @return separator The current domain separator.
    function DOMAIN_SEPARATOR() external view returns (bytes32 separator);
}
