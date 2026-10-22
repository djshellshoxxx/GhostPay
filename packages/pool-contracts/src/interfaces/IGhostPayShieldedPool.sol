// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC5564Announcer} from "./IERC5564Announcer.sol";
import {IGhostPayAssociationSetRegistry} from "./IGhostPayAssociationSetRegistry.sol";
import {IWithdrawVerifier, IRagequitVerifier} from "./IGroth16Verifier.sol";
import {IPoseidonT3, IPoseidonT4} from "./IPoseidon.sol";

/// @title IGhostPayShieldedPool
/// @notice Testnet-only, immutable, admin-free Privacy-Pools-style pool for one asset
/// (spec `docs/remote/privacy-specs/shielded-pool.md` section 6.1).
/// @dev Notes are `commitment = Poseidon(value, label, Poseidon(nullifier, secret))`, stored as
/// leaves of a LeanIMT (Poseidon T3). A withdrawal proves membership of a note, spends its
/// nullifier hash and inserts a change note; `context` binds every `Withdrawal` field into the proof.
interface IGhostPayShieldedPool {
    /// @notice Data bound into a withdrawal proof through `context`.
    /// @param recipient Receives `withdrawnValue - relayerFee`; not zero and not the pool.
    /// @param relayer The only allowed `msg.sender`; `address(0)` lets anyone submit.
    /// @param relayerFee Paid to `feeTo` out of `withdrawnValue`; capped by `MAX_RELAYER_FEE_BPS`.
    /// @param feeTo Fee receiver; must be non-zero (and not the pool) when `relayerFee > 0`.
    /// @param deadline Last valid `block.timestamp`.
    /// @param aspPublisher Association-set publisher; `address(0)` iff the proof has `aspEnabled == 0`.
    /// @param announce Empty, or `abi.encode(bytes ephemeralPubKey, bytes metadata)` for an
    /// ERC-5564 announcement made by the pool (SP-PAY).
    struct Withdrawal {
        address recipient;
        address relayer;
        uint256 relayerFee;
        address feeTo;
        uint256 deadline;
        address aspPublisher;
        bytes announce;
    }

    /// @notice Groth16 withdrawal proof. Public signal order: `[newCommitmentHash,
    /// existingNullifierHash, withdrawnValue, stateRoot, stateTreeDepth, aspEnabled, ASPRoot,
    /// ASPTreeDepth, context]`.
    /// @param pA Proof element A.
    /// @param pB Proof element B.
    /// @param pC Proof element C.
    /// @param pubSignals The 9 public signals.
    struct WithdrawProof {
        uint256[2] pA;
        uint256[2][2] pB;
        uint256[2] pC;
        uint256[9] pubSignals;
    }

    /// @notice Groth16 ragequit (commitment-opening) proof. Public signal order:
    /// `[commitment, nullifierHash, value, label]`.
    /// @param pA Proof element A.
    /// @param pB Proof element B.
    /// @param pC Proof element C.
    /// @param pubSignals The 4 public signals.
    struct RagequitProof {
        uint256[2] pA;
        uint256[2][2] pB;
        uint256[2] pC;
        uint256[4] pubSignals;
    }

    /// @notice Immutable deployment configuration.
    /// @param asset ERC-20 token, or `address(0)` for the native-asset pool.
    /// @param announcer ERC-5564 announcer used for SP-PAY announcements.
    /// @param registry Association-set root registry.
    /// @param withdrawVerifier Generated Groth16 verifier of the withdraw circuit.
    /// @param ragequitVerifier Generated Groth16 verifier of the commitment circuit.
    /// @param poseidonT3 Deployed `poseidon-solidity` `PoseidonT3` (tree hashing).
    /// @param poseidonT4 Deployed `poseidon-solidity` `PoseidonT4` (deposit commitment).
    /// @param denomination Fixed deposit value, or 0 for variable values.
    /// @param maxDeposit Largest accepted deposit value (`<= 2**128 - 1`).
    /// @param maxRelayerFeeBps Relayer fee cap in basis points of `withdrawnValue` (`<= 1_000`).
    /// @param aspGraceSeconds How long a superseded ASP root stays usable (`<= 1 days`).
    struct PoolConfig {
        address asset;
        IERC5564Announcer announcer;
        IGhostPayAssociationSetRegistry registry;
        IWithdrawVerifier withdrawVerifier;
        IRagequitVerifier ragequitVerifier;
        IPoseidonT3 poseidonT3;
        IPoseidonT4 poseidonT4;
        uint256 denomination;
        uint256 maxDeposit;
        uint256 maxRelayerFeeBps;
        uint256 aspGraceSeconds;
    }

    /// @notice A note was deposited.
    /// @param depositor The recorded depositor (the only address that may ragequit this label).
    /// @param commitment The inserted leaf `Poseidon(value, label, precommitment)`.
    /// @param label The deposit label `keccak256(abi.encodePacked(SCOPE, nonce)) % P`.
    /// @param value Deposited value.
    /// @param precommitment `Poseidon(nullifier, secret)` supplied by the depositor.
    event Deposited(
        address indexed depositor,
        uint256 commitment,
        uint256 label,
        uint256 value,
        uint256 precommitment
    );

    /// @notice A note was (partially) withdrawn with a membership proof.
    /// @param recipient Receiver of `value - relayerFee`.
    /// @param value Total withdrawn value (including the relayer fee).
    /// @param relayerFee Part of `value` paid to `feeTo`.
    /// @param spentNullifier The spent nullifier hash.
    /// @param newCommitment The inserted change commitment.
    /// @param aspPublisher The chosen association-set publisher, or `address(0)`.
    /// @param aspRoot The association-set root used (0 when none).
    event Withdrawn(
        address indexed recipient,
        uint256 value,
        uint256 relayerFee,
        uint256 spentNullifier,
        uint256 newCommitment,
        address indexed aspPublisher,
        uint256 aspRoot
    );

    /// @notice A note was publicly withdrawn by its original depositor.
    /// @param depositor The original depositor, also the receiver.
    /// @param commitment The opened commitment.
    /// @param label Its label.
    /// @param value Its full value.
    event Ragequit(address indexed depositor, uint256 commitment, uint256 label, uint256 value);

    /// @notice A leaf was appended to the state tree.
    /// @param index 0-based leaf position.
    /// @param leaf The leaf.
    /// @param root The new root.
    event LeafInserted(uint256 index, uint256 leaf, uint256 root);

    /// @notice Deployed on a chain id other than 31337, 11155111 or 84532.
    error WrongChain();
    /// @notice A required address is zero.
    error ZeroAddress();
    /// @notice A constructor parameter is out of range or a hasher fails its known-answer test.
    error InvalidConfig();
    /// @notice Value is zero, above `2**128 - 1`, differs from `DENOMINATION`, or `msg.value` is wrong.
    error InvalidValue();
    /// @notice Precommitment is zero or not below P.
    error InvalidPrecommitment();
    /// @notice `block.timestamp > deadline`.
    error Expired();
    /// @notice `msg.sender` is not the bound relayer.
    error InvalidRelayer();
    /// @notice Recipient is zero or the pool.
    error InvalidRecipient();
    /// @notice Fee above cap or above the withdrawn value, or a fee with a zero/pool `feeTo`.
    error FeeTooHigh();
    /// @notice Proof `context` differs from `keccak256(abi.encode(w, SCOPE)) % P`.
    error ContextMismatch();
    /// @notice A tree depth public signal is above `MAX_TREE_DEPTH`.
    error InvalidTreeDepth();
    /// @notice State root is not among the last `ROOT_HISTORY_SIZE` roots.
    error UnknownStateRoot();
    /// @notice ASP public signals and `aspPublisher` are inconsistent.
    error AspMismatch();
    /// @notice ASP root not published by the publisher, or superseded longer than the grace period.
    error UnknownAspRoot();
    /// @notice The Groth16 verifier rejected the proof.
    error InvalidProof();
    /// @notice The nullifier hash was already spent.
    error NullifierSpent();
    /// @notice Ragequit caller is not the label's recorded depositor.
    error NotDepositor();
    /// @notice The ragequit commitment is not a leaf of the state tree.
    error InvalidCommitment();
    /// @notice The `announce` payload violates the router metadata rules.
    error InvalidAnnounce();
    /// @notice A token balance moved by a different amount than transferred.
    error UnexpectedBalanceDelta();
    /// @notice A native-asset transfer failed.
    error NativeTransferFailed();
    /// @notice Deposit value above `MAX_DEPOSIT`.
    error DepositCapExceeded();
    /// @notice The state tree holds `2**32` leaves.
    error TreeFull();
    /// @notice The leaf is zero, not below P, or already in the tree.
    error InvalidLeaf();
    /// @notice Plain native transfers are rejected.
    error NoDirectETH();

    /// @notice Deposits `value` and appends `Poseidon(value, label, precommitment)` to the tree.
    /// @dev ERC-20 pool: pulls `value` from `msg.sender` (`msg.value` must be 0). Native pool:
    /// `msg.value == value`. `msg.sender` becomes the depositor of the new label.
    /// @param value Deposit value; `0 < value <= MAX_DEPOSIT`, `== DENOMINATION` if that is set.
    /// @param precommitment `Poseidon(nullifier, secret)`; `0 < precommitment < P`.
    /// @return commitment The inserted leaf.
    /// @return label The new label.
    function deposit(uint256 value, uint256 precommitment)
        external
        payable
        returns (uint256 commitment, uint256 label);

    /// @notice Withdraws part or all of a note with a membership proof (SP-EXIT / SP-PAY).
    /// @param w The withdrawal data; must hash to the proof's `context`.
    /// @param p The Groth16 proof.
    function withdraw(Withdrawal calldata w, WithdrawProof calldata p) external;

    /// @notice Withdraws a note's full value publicly to its original depositor (SP-RQ).
    /// @param p Proof of knowledge of the commitment opening.
    function ragequit(RagequitProof calldata p) external;

    /// @notice The pool asset.
    /// @return The ERC-20 token, or `address(0)` for the native pool.
    function ASSET() external view returns (address);
    /// @notice Domain value bound into labels and contexts.
    /// @return `keccak256(abi.encode(address(this), block.chainid, ASSET)) % P`.
    function SCOPE() external view returns (uint256);
    /// @notice Fixed deposit value.
    /// @return The denomination, 0 for variable values.
    function DENOMINATION() external view returns (uint256);
    /// @notice Largest accepted deposit.
    /// @return The deposit cap.
    function MAX_DEPOSIT() external view returns (uint256);
    /// @notice Relayer fee cap.
    /// @return Cap in basis points of the withdrawn value.
    function MAX_RELAYER_FEE_BPS() external view returns (uint256);
    /// @notice Grace period for superseded ASP roots.
    /// @return Seconds.
    function ASP_GRACE_SECONDS() external view returns (uint256);
    /// @notice The ERC-5564 announcer.
    /// @return Announcer address.
    function ANNOUNCER() external view returns (address);
    /// @notice The association-set registry.
    /// @return Registry address.
    function REGISTRY() external view returns (address);
    /// @notice The withdraw-circuit verifier.
    /// @return Verifier address.
    function WITHDRAW_VERIFIER() external view returns (address);
    /// @notice The commitment-circuit verifier.
    /// @return Verifier address.
    function RAGEQUIT_VERIFIER() external view returns (address);
    /// @notice The Poseidon T3 hasher.
    /// @return Hasher address.
    function POSEIDON_T3() external view returns (address);
    /// @notice The Poseidon T4 hasher.
    /// @return Hasher address.
    function POSEIDON_T4() external view returns (address);
    /// @notice Current state root.
    /// @return The root (0 for an empty tree).
    function currentRoot() external view returns (uint256);
    /// @notice Current LeanIMT depth.
    /// @return The depth.
    function currentTreeDepth() external view returns (uint256);
    /// @notice Number of leaves.
    /// @return The size.
    function currentTreeSize() external view returns (uint256);
    /// @notice Whether `root` is one of the last `ROOT_HISTORY_SIZE` roots.
    /// @param root The root.
    /// @return True if known.
    function isKnownRoot(uint256 root) external view returns (bool);
    /// @notice Whether a nullifier hash was spent.
    /// @param nullifierHash The nullifier hash.
    /// @return True if spent.
    function nullifierSpent(uint256 nullifierHash) external view returns (bool);
    /// @notice Recorded depositor of a label.
    /// @param label The label.
    /// @return The depositor, or `address(0)`.
    function depositorOf(uint256 label) external view returns (address);
    /// @notice Whether a leaf is in the state tree.
    /// @param leaf The leaf.
    /// @return True if present.
    function isLeaf(uint256 leaf) external view returns (bool);
    /// @notice Number of deposits so far (labels are derived from it).
    /// @return The deposit nonce.
    function depositNonce() external view returns (uint256);
}

/// @title IGhostPayShieldedPoolERC20
/// @notice ERC-20 pool extension: sponsored deposits authorised by an EIP-712 signature of the owner.
interface IGhostPayShieldedPoolERC20 is IGhostPayShieldedPool {
    /// @notice Deposit authorisation signed by `owner` (EIP-712, domain "GhostPayShieldedPool" "1").
    /// @param owner Pays `value + sponsorFee` and becomes the depositor.
    /// @param value Deposit value.
    /// @param precommitment The note precommitment.
    /// @param feeTo Receives `sponsorFee` (the sponsor's address).
    /// @param sponsorFee Token amount paid to `feeTo` for submitting.
    /// @param deadline Last valid timestamp (also used for the permit).
    /// @param nonce Single-use nonce (bitmap per owner).
    struct DepositAuth {
        address owner;
        uint256 value;
        uint256 precommitment;
        address feeTo;
        uint256 sponsorFee;
        uint256 deadline;
        uint256 nonce;
    }

    /// @notice Optional ERC-2612 permit, tried before pulling funds; its failure is ignored.
    /// @param value Allowance to set (normally `value + sponsorFee`).
    /// @param deadline Permit deadline.
    /// @param v Signature v.
    /// @param r Signature r.
    /// @param s Signature s.
    struct PermitSig {
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @notice The signature does not recover to `a.owner`.
    error InvalidSignature();
    /// @notice The owner's nonce was already used.
    error NonceUsed();

    /// @notice Deposit submitted by a sponsor on behalf of `a.owner` (SP-EXIT `permit-sponsored`).
    /// @param a The signed authorisation.
    /// @param authSig 65-byte ECDSA signature of `a` by `a.owner` (low-s only).
    /// @param permit ERC-2612 permit signed by `a.owner`, tried in `try/catch`.
    /// @return commitment The inserted leaf.
    /// @return label The new label.
    function depositWithPermit(
        DepositAuth calldata a,
        bytes calldata authSig,
        PermitSig calldata permit
    ) external returns (uint256 commitment, uint256 label);

    /// @notice Whether `owner` used `nonce`.
    /// @param owner The owner.
    /// @param nonce The nonce.
    /// @return True if used.
    function nonceUsed(address owner, uint256 nonce) external view returns (bool);

    /// @notice The EIP-712 domain separator.
    /// @return The separator for this chain and pool.
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
