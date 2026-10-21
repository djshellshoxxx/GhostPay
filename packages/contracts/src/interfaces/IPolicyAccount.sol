// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title IPolicyAccount
/// @notice External interface, types, events and errors of the policy-guarded stealth account.
/// @dev See docs/CONTRACTS_SPEC.md section 4 and packages/contracts/DEVIATIONS.md (items P1-P19).
interface IPolicyAccount {
    /// @notice Lifecycle of a withdrawal request.
    /// @dev `None` is the zero value of an unknown id.
    enum Status {
        None,
        Pending,
        Executed,
        Cancelled
    }

    /// @notice Owner-signed (EIP-712) withdrawal order. The destination is never part of the order:
    /// funds can only ever move to the account's current `destination`, and only if it is still the
    /// destination that was current when the request was accepted (`DestinationChangedSinceRequest`).
    /// @param token ERC-20 token to withdraw, or `address(0)` for the native coin.
    /// @param amount Amount in base units; must be non-zero.
    /// @param deadline Last timestamp (inclusive) at which the request may be submitted.
    /// @param nonce Unordered single-use nonce, scoped to this account.
    /// @param limitLeafHash The merkle leaf `keccak256(bytes.concat(keccak256(abi.encode(token, limit,
    /// windowSeconds))))` of the limit the owner authorises this withdrawal under. The supplied
    /// {LimitProof} must produce exactly this leaf, so a submitter cannot choose another leaf of the
    /// tree. Ignored (but still signed; use zero) when the account has `limitsRoot == bytes32(0)`.
    struct Withdraw {
        address token;
        uint256 amount;
        uint256 deadline;
        uint256 nonce;
        bytes32 limitLeafHash;
    }

    /// @notice Per-token rolling-window cap together with its merkle proof against `limitsRoot`.
    /// @dev The leaf is `keccak256(bytes.concat(keccak256(abi.encode(token, limit, windowSeconds))))`.
    /// Ignored (may be empty) when the account was created with `limitsRoot == bytes32(0)`.
    /// @param limit Maximum amount that may leave per window; `type(uint256).max` means unlimited.
    /// @param windowSeconds Window length in seconds; must be non-zero unless `limit` is unlimited.
    /// @param proof Merkle proof of the leaf against `limitsRoot`.
    struct LimitProof {
        uint256 limit;
        uint64 windowSeconds;
        bytes32[] proof;
    }

    /// @notice A stored withdrawal request.
    /// @param token Token (or `address(0)` for native).
    /// @param status Lifecycle state.
    /// @param executeAfter First timestamp at which the request can be executed.
    /// @param windowSeconds Window length proven at request time.
    /// @param amount Amount to withdraw.
    /// @param limit Cap per window proven at request time.
    struct Request {
        address token;
        Status status;
        uint64 executeAfter;
        uint64 windowSeconds;
        uint256 amount;
        uint256 limit;
    }

    /// @notice Emitted when a withdrawal request is accepted and its timer starts.
    /// @param id Request id (EIP-712 struct hash of the signed {Withdraw}).
    /// @param token Token (or `address(0)` for native).
    /// @param amount Requested amount.
    /// @param executeAfter First timestamp at which anyone may execute it.
    event WithdrawRequested(bytes32 indexed id, address token, uint256 amount, uint64 executeAfter);
    /// @notice Emitted when a request has been paid out to the destination.
    /// @param id Request id.
    /// @param destination Recipient (the destination at execution time, equal to the one at request time).
    /// @param token Token (or `address(0)` for native).
    /// @param amount Amount paid.
    event WithdrawExecuted(bytes32 indexed id, address destination, address token, uint256 amount);
    /// @notice Emitted when the owner cancels a pending request.
    /// @param id Request id.
    event WithdrawCancelled(bytes32 indexed id);
    /// @notice Emitted when a destination change is proposed.
    /// @param id Proposal id (EIP-712 struct hash of the signed {ProposeDestination}).
    /// @param newDestination Proposed destination.
    /// @param effectiveAt First timestamp at which anyone may execute the change.
    event DestinationProposed(bytes32 indexed id, address newDestination, uint64 effectiveAt);
    /// @notice Emitted when the owner cancels the pending destination change.
    /// @param id Proposal id.
    event DestinationChangeCancelled(bytes32 indexed id);
    /// @notice Emitted when a destination change takes effect.
    /// @param id Proposal id.
    /// @param newDestination The destination from now on.
    event DestinationChanged(bytes32 indexed id, address newDestination);

    /// @notice A required address was zero.
    error ZeroAddress();
    /// @notice The delay is zero or above `MAX_DELAY`.
    error InvalidDelay();
    /// @notice `initialize` was called twice, or on the implementation.
    error AlreadyInitialized();
    /// @notice `initialize` caller is not the CREATE2 deployer that derives this address from the arguments.
    error UnauthorizedInitializer();
    /// @notice `block.timestamp` is greater than the signed deadline.
    error Expired();
    /// @notice The amount is zero.
    error ZeroAmount();
    /// @notice The token is the account itself.
    error InvalidToken();
    /// @notice The recovered signer is not the account owner.
    error InvalidSignature();
    /// @notice The nonce was already consumed.
    error NonceAlreadyUsed();
    /// @notice The merkle proof does not prove the limit leaf against `limitsRoot`.
    error InvalidLimitProof();
    /// @notice The leaf of the supplied {LimitProof} differs from the signed `limitLeafHash`.
    error LimitLeafMismatch();
    /// @notice The limit is malformed (zero window with a finite limit).
    error InvalidLimit();
    /// @notice The requested amount exceeds the per-window limit, so it could never execute.
    error AmountExceedsLimit();
    /// @notice Executing now would exceed the per-window cap; retry after the window advanced.
    error WindowLimitExceeded();
    /// @notice The proven window length differs from the one already recorded for the token.
    error WindowMismatch();
    /// @notice The request is unknown or not pending.
    error NotPending();
    /// @notice The timelock has not elapsed.
    /// @param availableAt First timestamp at which the action becomes available.
    error TimelockActive(uint64 availableAt);
    /// @notice A destination change is already pending; cancel it first.
    error ProposalPending();
    /// @notice There is no matching pending destination change.
    error NoProposal();
    /// @notice The proposed destination is zero or the account itself.
    error InvalidDestination();
    /// @notice The native transfer to the destination failed.
    error NativeTransferFailed();
    /// @notice Token balances did not change by exactly the transferred amount.
    error UnexpectedBalanceDelta();
    /// @notice The destination changed after the request was accepted; the request can only be cancelled.
    /// @param requested Destination at request time.
    /// @param current Destination now.
    error DestinationChangedSinceRequest(address requested, address current);

    /// @notice One-time initialisation by the CREATE2 deployer.
    /// @param owner_ Stealth EOA that signs every action.
    /// @param destination_ Initial and only recipient of funds.
    /// @param delay_ Withdrawal timelock in seconds (1 to `MAX_DELAY`).
    /// @param limitsRoot_ Merkle root of per-token limits, or zero for no limits.
    function initialize(address owner_, address destination_, uint256 delay_, bytes32 limitsRoot_)
        external;

    /// @notice Start the timer of an owner-signed withdrawal. Anyone may relay.
    /// @param w The signed order.
    /// @param lp Limit leaf data and proof for `w.token`.
    /// @param sig 65-byte owner signature over {Withdraw}.
    /// @return id The request id.
    function requestWithdraw(Withdraw calldata w, LimitProof calldata lp, bytes calldata sig)
        external
        returns (bytes32 id);

    /// @notice Pay a matured request to the destination. Anyone may call. Reverts
    /// `DestinationChangedSinceRequest` while the destination differs from the one at request time.
    /// @param id The request id.
    function executeWithdraw(bytes32 id) external;

    /// @notice Cancel a pending request with an owner signature. Anyone may relay.
    /// @param id The request id.
    /// @param sig 65-byte owner signature over {CancelWithdraw}.
    function cancel(bytes32 id, bytes calldata sig) external;

    /// @notice Propose a new destination; it takes effect after `2 * delay`. Anyone may relay.
    /// @param newDestination The proposed destination.
    /// @param deadline Last timestamp (inclusive) at which the signed proposal may be submitted.
    /// @param nonce Unordered single-use nonce.
    /// @param sig 65-byte owner signature over {ProposeDestination}.
    /// @return id The proposal id.
    function proposeDestination(
        address newDestination,
        uint256 deadline,
        uint256 nonce,
        bytes calldata sig
    ) external returns (bytes32 id);

    /// @notice Apply the pending destination change once its timelock elapsed. Anyone may call.
    function executeDestinationChange() external;

    /// @notice Cancel the pending destination change with an owner signature. Anyone may relay.
    /// @param id The proposal id.
    /// @param sig 65-byte owner signature over {CancelDestination}.
    function cancelDestination(bytes32 id, bytes calldata sig) external;
}
