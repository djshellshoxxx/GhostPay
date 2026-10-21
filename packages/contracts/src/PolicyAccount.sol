// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPolicyAccount} from "./interfaces/IPolicyAccount.sol";

/// @title PolicyAccount
/// @author GhostPay
/// @notice Policy-guarded stealth account (scheme id 0x47500002). A stealth EOA (`owner`) controls an
/// EIP-1167 clone of this contract; funds can only ever leave to `destination`, after a delay, within
/// a per-token rolling-window cap. A stolen owner key therefore cannot redirect funds before
/// `2 * delay` has elapsed, and the honest owner (holding the same key) can cancel in that window.
/// @dev Security properties:
/// - Deployed once as an implementation (which locks itself in its constructor) and cloned by
///   `PolicyAccountFactory` at a CREATE2 address derived from `(owner, policyHash)`. `initialize`
///   authenticates its caller by recomputing that address: only the deployer that derived this very
///   address from the same arguments can initialise it, exactly once.
/// - No `delegatecall`, no generic `execute`/`call`, no approvals, no admin, no upgrade path. The only
///   outgoing value transfers are `executeWithdraw` to `destination` (ERC-20 via SafeERC20 with
///   balance-delta checks, native via a checked `call`).
/// - Every state change is authorised by an EIP-712 owner signature (domain: name
///   "GhostPayPolicyAccount", version "1", chain id and the clone's own address, so a signature for one
///   clone or chain is invalid on any other). Anyone may relay a signature but cannot alter it.
///   Signatures are recovered with OpenZeppelin `ECDSA.recover` (rejects high-s malleability).
/// - Nonces are unordered (bitmap) and consumed before any external call. Cancel signatures are bound
///   to a unique request/proposal id and need no nonce.
/// - Limits: `limitsRoot` is a merkle root over leaves
///   `keccak256(bytes.concat(keccak256(abi.encode(token, limit, windowSeconds))))`. `limitsRoot == 0`
///   means "no limits"; otherwise a token without a leaf cannot be withdrawn. Limits are immutable.
///   The window is enforced with two fixed buckets of `windowSeconds`: the amount paid in the current
///   and the previous bucket never exceeds `limit`, which guarantees that no interval of
///   `windowSeconds` length ever sees more than `limit` leave (conservative: after a full spend the
///   next spend can be delayed by up to two windows). Merkle trees MUST contain each token at most once.
/// - The caller of `executeWithdraw`/`executeDestinationChange` is irrelevant; recipients are state.
/// - Storage is read from the clone; `ReentrancyGuard` starts at 0 in clones, which is accepted by it.
contract PolicyAccount is IPolicyAccount, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Longest allowed withdrawal delay (30 days).
    uint256 public constant MAX_DELAY = 30 days;

    /// @notice EIP-712 type hash of {Withdraw}.
    /// @return The type hash.
    bytes32 public constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(address token,uint256 amount,uint256 deadline,uint256 nonce)");
    /// @notice EIP-712 type hash of {CancelWithdraw}.
    /// @return The type hash.
    bytes32 public constant CANCEL_WITHDRAW_TYPEHASH = keccak256("CancelWithdraw(bytes32 id)");
    /// @notice EIP-712 type hash of {ProposeDestination}.
    /// @return The type hash.
    bytes32 public constant PROPOSE_DESTINATION_TYPEHASH =
        keccak256("ProposeDestination(address newDestination,uint256 deadline,uint256 nonce)");
    /// @notice EIP-712 type hash of {CancelDestination}.
    /// @return The type hash.
    bytes32 public constant CANCEL_DESTINATION_TYPEHASH =
        keccak256("CancelDestination(bytes32 id)");

    /// @dev Address of the implementation contract; read from a clone it still yields the implementation.
    address private immutable _IMPLEMENTATION;

    /// @notice Stealth EOA that signs every action. Set once by `initialize`.
    address public owner;
    /// @notice Withdrawal delay in seconds. Set once by `initialize`.
    uint64 public delay;
    /// @notice Whether `initialize` has run (always true on the implementation).
    bool public initialized;
    /// @notice The only address that can receive funds. Changes only through the 2x-delay path.
    address public destination;
    /// @notice Merkle root of the per-token limits (zero: no limits). Set once by `initialize`.
    bytes32 public limitsRoot;
    /// @notice `keccak256(abi.encode(destination, delay, limitsRoot))` of the initial policy.
    bytes32 public policyHash;
    /// @notice Destination awaiting its timelock, or zero.
    address public pendingDestination;
    /// @notice Timestamp from which `pendingDestination` can be applied; zero when none pending.
    uint64 public pendingEffectiveAt;
    /// @notice Id of the pending destination proposal.
    bytes32 public pendingProposalId;

    /// @dev Rolling-window bookkeeping of one token.
    struct WindowState {
        uint64 window;
        uint64 bucket;
        uint256 current;
        uint256 previous;
    }

    /// @dev Withdrawal requests by id.
    mapping(bytes32 id => Request) private _requests;
    /// @dev Per-token window state.
    mapping(address token => WindowState) private _windows;
    /// @dev Word index (`nonce >> 8`) => bitmap of used nonces.
    mapping(uint256 wordIndex => uint256 bitmap) private _nonceBitmap;

    /// @notice Deploys the implementation and locks it; EIP-712 name "GhostPayPolicyAccount", version "1".
    constructor() EIP712("GhostPayPolicyAccount", "1") {
        _IMPLEMENTATION = address(this);
        initialized = true;
    }

    /// @notice Accepts native coin. There is no other callback logic.
    receive() external payable {}

    /// @inheritdoc IPolicyAccount
    function initialize(address owner_, address destination_, uint256 delay_, bytes32 limitsRoot_)
        external
    {
        if (initialized) revert AlreadyInitialized();
        if (owner_ == address(0) || destination_ == address(0) || destination_ == address(this)) {
            revert ZeroAddress();
        }
        if (delay_ == 0 || delay_ > MAX_DELAY) revert InvalidDelay();
        bytes32 hash = keccak256(abi.encode(destination_, delay_, limitsRoot_));
        bytes32 salt = keccak256(abi.encode(owner_, hash));
        if (Clones.predictDeterministicAddress(_IMPLEMENTATION, salt, msg.sender) != address(this))
        {
            revert UnauthorizedInitializer();
        }
        initialized = true;
        owner = owner_;
        destination = destination_;
        // Bounded by MAX_DELAY above.
        // forge-lint: disable-next-line(unsafe-typecast)
        delay = uint64(delay_);
        limitsRoot = limitsRoot_;
        policyHash = hash;
    }

    /// @inheritdoc IPolicyAccount
    function requestWithdraw(Withdraw calldata w, LimitProof calldata lp, bytes calldata sig)
        external
        nonReentrant
        returns (bytes32 id)
    {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > w.deadline) revert Expired();
        if (w.amount == 0) revert ZeroAmount();
        if (w.token == address(this)) revert InvalidToken();
        id = keccak256(abi.encode(WITHDRAW_TYPEHASH, w.token, w.amount, w.deadline, w.nonce));
        _checkOwner(id, sig);
        _useNonce(w.nonce);

        uint256 limit = type(uint256).max;
        uint64 window = 0;
        if (limitsRoot != bytes32(0)) {
            bytes32 leaf =
                keccak256(bytes.concat(keccak256(abi.encode(w.token, lp.limit, lp.windowSeconds))));
            if (!MerkleProof.verifyCalldata(lp.proof, limitsRoot, leaf)) {
                revert InvalidLimitProof();
            }
            limit = lp.limit;
            window = lp.windowSeconds;
            if (limit != type(uint256).max) {
                if (window == 0) revert InvalidLimit();
                if (w.amount > limit) revert AmountExceedsLimit();
            }
        }

        // Bounded: timestamp + MAX_DELAY fits in 64 bits for any realistic timestamp.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 executeAfter = uint64(block.timestamp + delay);
        _requests[id] = Request({
            token: w.token,
            status: Status.Pending,
            executeAfter: executeAfter,
            windowSeconds: window,
            amount: w.amount,
            limit: limit
        });
        // Nonreentrant; the only "external call" before this point is the ecrecover precompile.
        // forge-lint: disable-next-line(reentrancy-events)
        emit WithdrawRequested(id, w.token, w.amount, executeAfter);
    }

    /// @inheritdoc IPolicyAccount
    function executeWithdraw(bytes32 id) external nonReentrant {
        Request memory r = _requests[id];
        if (r.status != Status.Pending) revert NotPending();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < r.executeAfter) revert TimelockActive(r.executeAfter);
        _requests[id].status = Status.Executed;
        if (r.limit != type(uint256).max) _consume(r.token, r.amount, r.limit, r.windowSeconds);

        address to = destination;
        if (r.token == address(0)) {
            // Destination is contract state controlled only by the owner's timelocked policy, not by the caller.
            // forge-lint: disable-next-line(arbitrary-send-eth)
            (bool ok,) = to.call{value: r.amount}("");
            if (!ok) revert NativeTransferFailed();
        } else {
            IERC20 token = IERC20(r.token);
            uint256 selfBefore = token.balanceOf(address(this));
            uint256 toBefore = token.balanceOf(to);
            token.safeTransfer(to, r.amount);
            // Exact deltas are the intended check: fee-on-transfer and rebasing tokens must revert.
            // forge-lint: disable-start(incorrect-strict-equality)
            if (
                token.balanceOf(address(this)) + r.amount != selfBefore
                    || token.balanceOf(to) != toBefore + r.amount
            ) revert UnexpectedBalanceDelta();
            // forge-lint: disable-end(incorrect-strict-equality)
        }
        // forge-lint: disable-next-line(reentrancy-events)
        emit WithdrawExecuted(id, to, r.token, r.amount);
    }

    /// @inheritdoc IPolicyAccount
    function cancel(bytes32 id, bytes calldata sig) external nonReentrant {
        if (_requests[id].status != Status.Pending) revert NotPending();
        _checkOwner(keccak256(abi.encode(CANCEL_WITHDRAW_TYPEHASH, id)), sig);
        _requests[id].status = Status.Cancelled;
        // Nonreentrant; the only "external call" before this point is the ecrecover precompile.
        // forge-lint: disable-next-line(reentrancy-events)
        emit WithdrawCancelled(id);
    }

    /// @inheritdoc IPolicyAccount
    function proposeDestination(
        address newDestination,
        uint256 deadline,
        uint256 nonce,
        bytes calldata sig
    ) external nonReentrant returns (bytes32 id) {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert Expired();
        if (newDestination == address(0) || newDestination == address(this)) {
            revert InvalidDestination();
        }
        if (pendingEffectiveAt != 0) revert ProposalPending();
        id = keccak256(abi.encode(PROPOSE_DESTINATION_TYPEHASH, newDestination, deadline, nonce));
        _checkOwner(id, sig);
        _useNonce(nonce);

        // Bounded: 2 * MAX_DELAY plus a timestamp fits in 64 bits.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 effectiveAt = uint64(block.timestamp + 2 * uint256(delay));
        pendingDestination = newDestination;
        pendingEffectiveAt = effectiveAt;
        pendingProposalId = id;
        // Nonreentrant; the only "external call" before this point is the ecrecover precompile.
        // forge-lint: disable-next-line(reentrancy-events)
        emit DestinationProposed(id, newDestination, effectiveAt);
    }

    /// @inheritdoc IPolicyAccount
    function executeDestinationChange() external nonReentrant {
        uint64 effectiveAt = pendingEffectiveAt;
        if (effectiveAt == 0) revert NoProposal();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < effectiveAt) revert TimelockActive(effectiveAt);
        address newDestination = pendingDestination;
        bytes32 id = pendingProposalId;
        destination = newDestination;
        delete pendingDestination;
        delete pendingEffectiveAt;
        delete pendingProposalId;
        emit DestinationChanged(id, newDestination);
    }

    /// @inheritdoc IPolicyAccount
    function cancelDestination(bytes32 id, bytes calldata sig) external nonReentrant {
        if (pendingEffectiveAt == 0 || pendingProposalId != id) revert NoProposal();
        _checkOwner(keccak256(abi.encode(CANCEL_DESTINATION_TYPEHASH, id)), sig);
        delete pendingDestination;
        delete pendingEffectiveAt;
        delete pendingProposalId;
        // Nonreentrant; the only "external call" before this point is the ecrecover precompile.
        // forge-lint: disable-next-line(reentrancy-events)
        emit DestinationChangeCancelled(id);
    }

    /// @notice Stored data of a withdrawal request.
    /// @param id The request id.
    /// @return request The request (status `None` if unknown).
    function requests(bytes32 id) external view returns (Request memory request) {
        request = _requests[id];
    }

    /// @notice Whether an unordered nonce was consumed.
    /// @param nonce The nonce.
    /// @return used True if consumed.
    function nonceUsed(uint256 nonce) external view returns (bool used) {
        used = _nonceBitmap[nonce >> 8] & (1 << (nonce & 0xff)) != 0;
    }

    /// @notice Window bookkeeping of a token.
    /// @param token The token (or `address(0)` for native).
    /// @return window Window length recorded at first use (zero if never used).
    /// @return bucket Index (`timestamp / window`) of the current bucket.
    /// @return current Amount paid out in the current bucket.
    /// @return previous Amount paid out in the previous bucket.
    function windowState(address token)
        external
        view
        returns (uint64 window, uint64 bucket, uint256 current, uint256 previous)
    {
        WindowState memory s = _windows[token];
        return (s.window, s.bucket, s.current, s.previous);
    }

    /// @notice EIP-712 domain separator of this clone.
    /// @return separator The separator (includes chain id and this clone's address).
    // forge-lint: disable-next-line(mixed-case-function)
    function DOMAIN_SEPARATOR() external view returns (bytes32 separator) {
        separator = _domainSeparatorV4();
    }

    /// @dev Reverts unless `sig` is the owner's signature over the struct hash `structHash`.
    function _checkOwner(bytes32 structHash, bytes calldata sig) private view {
        if (ECDSA.recover(_hashTypedDataV4(structHash), sig) != owner) revert InvalidSignature();
    }

    /// @dev Consumes an unordered nonce.
    function _useNonce(uint256 nonce) private {
        uint256 bit = 1 << (nonce & 0xff);
        uint256 word = _nonceBitmap[nonce >> 8];
        if (word & bit != 0) revert NonceAlreadyUsed();
        _nonceBitmap[nonce >> 8] = word | bit;
    }

    /// @dev Books `amount` against the two-bucket window of `token`; reverts if it would exceed `limit`.
    function _consume(address token, uint256 amount, uint256 limit, uint64 window) private {
        WindowState storage s = _windows[token];
        if (s.window == 0) s.window = window;
        else if (s.window != window) revert WindowMismatch();
        // Quotient is below 2^64 because the divisor is at least one and timestamps fit in 64 bits.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 bucket = uint64(block.timestamp / window);
        if (bucket != s.bucket) {
            s.previous = bucket == s.bucket + 1 ? s.current : 0;
            s.current = 0;
            s.bucket = bucket;
        }
        uint256 used = s.previous + s.current;
        if (used > limit || amount > limit - used) revert WindowLimitExceeded();
        s.current += amount;
    }
}
