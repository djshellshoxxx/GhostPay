// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title IGhostPayPayerDelegate
/// @notice External interface, events and errors of the EIP-7702 payer delegate (payer-hiding mode PH-3).
/// @dev See docs/remote/privacy-specs/payer-hiding.md section 6.3. The delegate runs with
/// `address(this) == payer EOA`; the payer is therefore `msg.sender` at the router.
interface IGhostPayPayerDelegate {
    /// @notice A payer-signed payment order. The payer is `address(this)`; it is not a field.
    /// @param router The GhostPay router (plain or policy) that is called.
    /// @param token The ERC-20 token paid.
    /// @param stealth The stealth address that must be the recipient inside `routerCalldata`.
    /// @param gross Amount the router pulls (router fee included), must equal the router calldata.
    /// @param sponsorFee Tokens paid from the payer to `sponsorFeeTo` as gas reimbursement.
    /// @param sponsorFeeTo Recipient of `sponsorFee`.
    /// @param deadline Last timestamp (inclusive) at which the order is valid.
    /// @param nonce Unordered single-use nonce.
    /// @param payloadHash `keccak256(routerCalldata)`.
    struct PayIntent {
        address router;
        address token;
        address stealth;
        uint256 gross;
        uint256 sponsorFee;
        address sponsorFeeTo;
        uint256 deadline;
        uint256 nonce;
        bytes32 payloadHash;
    }

    /// @notice Emitted once per successful payment. Carries no stealth address.
    /// @param token The token paid.
    /// @param gross The gross amount pulled by the router.
    /// @param sponsorFee The sponsor reimbursement.
    event Paid(address indexed token, uint256 gross, uint256 sponsorFee);

    /// @notice `block.timestamp` is past the intent deadline.
    error Expired();
    /// @notice The signature does not recover to `address(this)`.
    error BadSignature();
    /// @notice The nonce was already consumed.
    error NonceUsed();
    /// @notice `routerCalldata` does not hash to `payloadHash`, has a disallowed selector, or its
    /// token, stealth or gross do not equal the signed intent fields.
    error PayloadMismatch();
    /// @notice The payer's token balance did not fall by exactly `gross + sponsorFee`.
    error UnexpectedBalanceDelta();
    /// @notice The router call reverted.
    error RouterCallFailed();
    /// @notice The router left a non-zero allowance (it pulled less than `gross`).
    error ResidualAllowance();
    /// @notice A required address was zero or the payer itself.
    error ZeroAddress();
    /// @notice `gross` is zero or `gross + sponsorFee` overflows.
    error InvalidAmount();

    /// @notice Execute a payer-signed payment as the payer EOA and pay the sponsor fee. Anyone may call.
    /// @param i The signed intent.
    /// @param routerCalldata Calldata for the router's `payERC20`; bound by `i.payloadHash`.
    /// @param sig EIP-712 signature of `i` by the payer EOA (this account's own key).
    function pay(PayIntent calldata i, bytes calldata routerCalldata, bytes calldata sig) external;

    /// @notice Whether `nonce` has been consumed (read through the delegating EOA).
    /// @param nonce The nonce.
    /// @return used True if already consumed.
    function nonceUsed(uint256 nonce) external view returns (bool used);

    /// @notice The EIP-712 domain separator (verifyingContract is the delegating EOA).
    /// @return The domain separator.
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
