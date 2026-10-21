// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title IGhostPayPayRelay
/// @notice External interface, events and errors of the permit-based pay relay (payer-hiding mode PH-2).
/// @dev See docs/remote/privacy-specs/payer-hiding.md section 6.2.
interface IGhostPayPayRelay {
    /// @notice A payer-signed payment order. The sponsor (caller of {pay}) cannot change any field.
    /// @param payer The account whose tokens are spent and whose signature authorises the order.
    /// @param router The GhostPay router (plain or policy) that is called.
    /// @param token The ERC-20 token paid.
    /// @param stealth The stealth address that must be the recipient inside `routerCalldata`.
    /// @param gross Amount the router pulls (router fee included), must equal the router calldata.
    /// @param sponsorFee Extra tokens paid from the payer to `sponsorFeeTo` as gas reimbursement.
    /// @param sponsorFeeTo Recipient of `sponsorFee`.
    /// @param deadline Last timestamp (inclusive) at which the order is valid.
    /// @param nonce Unordered single-use nonce, per payer.
    /// @param payloadHash `keccak256(routerCalldata)`.
    struct PayIntent {
        address payer;
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

    /// @notice ERC-2612 permit granted by the payer to this relay.
    /// @param value Permit value; must be at least `gross + sponsorFee` when `deadline != 0`.
    /// @param deadline Permit deadline; `0` means "no permit, allowance was granted beforehand".
    /// @param v Permit signature recovery id.
    /// @param r Permit signature r.
    /// @param s Permit signature s.
    struct PermitSig {
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @notice Emitted once per successful payment. Carries no payer and no stealth address.
    /// @param token The token paid.
    /// @param router The router called.
    /// @param gross The gross amount pulled by the router.
    /// @param sponsorFee The sponsor reimbursement.
    event Paid(address indexed token, address indexed router, uint256 gross, uint256 sponsorFee);

    /// @notice `block.timestamp` is past the intent deadline.
    error Expired();
    /// @notice The intent signature does not verify for `payer`.
    error BadSignature();
    /// @notice The nonce was already consumed.
    error NonceUsed();
    /// @notice `routerCalldata` does not hash to `payloadHash`, has a disallowed selector, or its
    /// token, stealth or gross do not equal the signed intent fields.
    error PayloadMismatch();
    /// @notice A token balance did not change by exactly the expected amount.
    error UnexpectedBalanceDelta();
    /// @notice The router call reverted.
    error RouterCallFailed();
    /// @notice The router left a non-zero allowance (it pulled less than `gross`).
    error ResidualAllowance();
    /// @notice A required address (payer, router, token, fee recipient) was zero or this contract.
    error ZeroAddress();
    /// @notice `gross` is zero, the permit value is too low, or `gross + sponsorFee` overflows.
    error InvalidAmount();

    /// @notice Execute a payer-signed payment through a GhostPay router and pay the sponsor fee.
    /// @param i The signed intent.
    /// @param routerCalldata Calldata for the router's `payERC20`; bound by `i.payloadHash`.
    /// @param sig EIP-712 signature of `i` by `i.payer` (EOA or ERC-1271 account).
    /// @param permit ERC-2612 permit to this relay (or `deadline == 0` for a pre-granted allowance).
    function pay(
        PayIntent calldata i,
        bytes calldata routerCalldata,
        bytes calldata sig,
        PermitSig calldata permit
    ) external;

    /// @notice Whether `nonce` has been consumed for `payer`.
    /// @param payer The payer.
    /// @param nonce The nonce.
    /// @return used True if already consumed.
    function nonceUsed(address payer, uint256 nonce) external view returns (bool used);

    /// @notice The EIP-712 domain separator.
    /// @return The domain separator.
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
