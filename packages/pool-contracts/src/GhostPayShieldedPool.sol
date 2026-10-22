// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IERC5564Announcer} from "./interfaces/IERC5564Announcer.sol";
import {IGhostPayAssociationSetRegistry} from "./interfaces/IGhostPayAssociationSetRegistry.sol";
import {IGhostPayShieldedPool} from "./interfaces/IGhostPayShieldedPool.sol";
import {IWithdrawVerifier, IRagequitVerifier} from "./interfaces/IGroth16Verifier.sol";
import {IPoseidonT3, IPoseidonT4} from "./interfaces/IPoseidon.sol";
import {PoolConstants} from "./lib/PoolConstants.sol";
import {PoolLeanIMT, LeanTree} from "./lib/PoolLeanIMT.sol";
import {ProofLib} from "./lib/ProofLib.sol";

/// @title GhostPayShieldedPool
/// @author GhostPay
/// @notice Asset-agnostic core of the testnet-only shielded pool: deposits, membership-proof
/// withdrawals with relayer fee and optional association set, and depositor ragequit.
/// @dev Security properties:
/// - No owner, role, pause, upgrade, setter, `selfdestruct` or `delegatecall`. All configuration is
///   immutable. The constructor reverts outside chain ids 31337, 11155111, 84532.
/// - External calls: the asset (subclass), the two verifiers and the two Poseidon hashers (all through
///   `view`/`pure` interfaces, i.e. `STATICCALL`), the immutable registry (`view`), the immutable
///   announcer, and value transfers to the proof-bound `recipient`/`feeTo` or the ragequitting
///   depositor. Every state-changing entry point is `nonReentrant` and changes state before transfers.
/// - Soundness rests entirely on the withdraw/commitment circuits and their trusted setup: a forged
///   proof can drain the pool. The PoC ceremony is insecure by construction (spec N8).
/// - Replay protection is keyed on the nullifier hash (single use across `withdraw` and `ragequit`),
///   never on proof bytes, so Groth16 proof malleability cannot re-spend a note.
/// - `context = keccak256(abi.encode(w, SCOPE)) % P` binds every `Withdrawal` field (recipient,
///   relayer, fee, feeTo, deadline, ASP publisher, announcement) and the pool/chain/asset into the proof.
abstract contract GhostPayShieldedPool is IGhostPayShieldedPool, ReentrancyGuard {
    using ProofLib for WithdrawProof;
    using ProofLib for RagequitProof;
    using PoolLeanIMT for LeanTree;

    /// @notice Number of most recent state roots a proof may reference.
    /// @return The root history size.
    uint256 public constant ROOT_HISTORY_SIZE = PoolConstants.ROOT_HISTORY_SIZE;
    /// @notice Largest accepted tree depth public signal.
    /// @return The maximum tree depth.
    uint256 public constant MAX_TREE_DEPTH = PoolConstants.MAX_TREE_DEPTH;
    /// @notice Largest leaf count of the state tree.
    /// @return `2**MAX_TREE_DEPTH`.
    uint256 public constant MAX_TREE_SIZE = 2 ** PoolConstants.MAX_TREE_DEPTH;

    /// @dev `transfer(address,uint256)` selector, metadata marker for ERC-20 announcements.
    bytes4 internal constant ERC20_MARKER = 0xa9059cbb;
    /// @dev Metadata marker for native announcements.
    bytes4 internal constant NATIVE_MARKER = 0xeeeeeeee;
    /// @dev Native-asset sentinel used in announcement metadata (same as `GhostPayRouter.NATIVE`).
    address internal constant NATIVE_SENTINEL = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    /// @dev Exact announcement metadata length: view tag (1) + marker (4) + asset (20) + amount (32).
    uint256 private constant METADATA_LENGTH = 57;
    /// @dev Length of a compressed secp256k1 public key.
    uint256 private constant EPHEMERAL_KEY_LENGTH = 33;

    /// @inheritdoc IGhostPayShieldedPool
    address public immutable ASSET;
    /// @inheritdoc IGhostPayShieldedPool
    uint256 public immutable SCOPE;
    /// @inheritdoc IGhostPayShieldedPool
    uint256 public immutable DENOMINATION;
    /// @inheritdoc IGhostPayShieldedPool
    uint256 public immutable MAX_DEPOSIT;
    /// @inheritdoc IGhostPayShieldedPool
    uint256 public immutable MAX_RELAYER_FEE_BPS;
    /// @inheritdoc IGhostPayShieldedPool
    uint256 public immutable ASP_GRACE_SECONDS;

    /// @dev ERC-5564 announcer.
    IERC5564Announcer internal immutable _ANNOUNCER;
    /// @dev Association-set registry.
    IGhostPayAssociationSetRegistry internal immutable _REGISTRY;
    /// @dev Withdraw verifier.
    IWithdrawVerifier internal immutable _WITHDRAW_VERIFIER;
    /// @dev Ragequit verifier.
    IRagequitVerifier internal immutable _RAGEQUIT_VERIFIER;
    /// @dev Poseidon T3 hasher.
    IPoseidonT3 internal immutable _POSEIDON_T3;
    /// @dev Poseidon T4 hasher.
    IPoseidonT4 internal immutable _POSEIDON_T4;

    /// @inheritdoc IGhostPayShieldedPool
    uint256 public depositNonce;
    /// @dev The state tree.
    LeanTree internal _tree;
    /// @dev Tree size right after `root` became current; 0 = never a root.
    mapping(uint256 root => uint256 sizeAtRoot) private _rootSize;
    /// @dev Spent nullifier hashes.
    mapping(uint256 nullifierHash => bool) private _spent;
    /// @dev Recorded depositor per label.
    mapping(uint256 label => address) private _depositors;

    /// @notice Validates and stores the immutable configuration.
    /// @param c The configuration; see `PoolConfig`.
    constructor(PoolConfig memory c) {
        if (!PoolConstants.isAllowedChain()) revert WrongChain();
        if (
            address(c.announcer) == address(0) || address(c.registry) == address(0)
                || address(c.withdrawVerifier) == address(0)
                || address(c.ragequitVerifier) == address(0) || address(c.poseidonT3) == address(0)
                || address(c.poseidonT4) == address(0)
        ) revert ZeroAddress();
        if (
            c.maxDeposit == 0 || c.maxDeposit > PoolConstants.MAX_VALUE
                || c.denomination > c.maxDeposit
                || c.maxRelayerFeeBps > PoolConstants.MAX_RELAYER_FEE_BPS_LIMIT
                || c.aspGraceSeconds > PoolConstants.MAX_ASP_GRACE
        ) revert InvalidConfig();
        _checkHashers(c.poseidonT3, c.poseidonT4);

        ASSET = c.asset;
        SCOPE = uint256(keccak256(abi.encode(address(this), block.chainid, c.asset)))
            % PoolConstants.SNARK_SCALAR_FIELD;
        DENOMINATION = c.denomination;
        MAX_DEPOSIT = c.maxDeposit;
        MAX_RELAYER_FEE_BPS = c.maxRelayerFeeBps;
        ASP_GRACE_SECONDS = c.aspGraceSeconds;
        _ANNOUNCER = c.announcer;
        _REGISTRY = c.registry;
        _WITHDRAW_VERIFIER = c.withdrawVerifier;
        _RAGEQUIT_VERIFIER = c.ragequitVerifier;
        _POSEIDON_T3 = c.poseidonT3;
        _POSEIDON_T4 = c.poseidonT4;
    }

    /// @notice Always reverts: plain native transfers are not deposits.
    receive() external payable {
        revert NoDirectETH();
    }

    /// @notice Always reverts: the pool has no fallback behaviour.
    fallback() external {
        revert NoDirectETH();
    }

    /// @inheritdoc IGhostPayShieldedPool
    function deposit(uint256 value, uint256 precommitment)
        external
        payable
        nonReentrant
        returns (uint256 commitment, uint256 label)
    {
        _checkDeposit(value, precommitment);
        (commitment, label) = _recordDeposit(msg.sender, value, precommitment);
        _receiveDeposit(msg.sender, value);
    }

    // Deadline / grace comparisons on block.timestamp are intended (Slither `timestamp`, triaged).
    // slither-disable-start timestamp
    /// @inheritdoc IGhostPayShieldedPool
    function withdraw(Withdrawal calldata w, WithdrawProof calldata p) external nonReentrant {
        // Deadline semantics are inherent to the product; second-level validator drift is acceptable.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > w.deadline) revert Expired();
        if (w.relayer != address(0) && msg.sender != w.relayer) revert InvalidRelayer();
        if (w.recipient == address(0) || w.recipient == address(this)) revert InvalidRecipient();
        uint256 value = p.withdrawnValue();
        if (value == 0 || value > PoolConstants.MAX_VALUE) revert InvalidValue();
        _checkFee(w, value);
        if (
            p.context()
                != uint256(keccak256(abi.encode(w, SCOPE))) % PoolConstants.SNARK_SCALAR_FIELD
        ) {
            revert ContextMismatch();
        }
        if (p.stateTreeDepth() > MAX_TREE_DEPTH || p.aspTreeDepth() > MAX_TREE_DEPTH) {
            revert InvalidTreeDepth();
        }
        if (!_isKnownRoot(p.stateRoot())) revert UnknownStateRoot();
        _checkAsp(w.aspPublisher, p);
        uint256 net = value - w.relayerFee;
        (bytes memory key, bytes memory metadata) = _decodeAnnounce(w.announce, net);
        if (!_WITHDRAW_VERIFIER.verifyProof(p.pA, p.pB, p.pC, p.pubSignals)) revert InvalidProof();

        _spend(p.existingNullifierHash());
        _insert(p.newCommitmentHash());

        _push(w.recipient, net);
        if (w.relayerFee != 0) _push(w.feeTo, w.relayerFee);
        if (key.length != 0) {
            _ANNOUNCER.announce(PoolConstants.SCHEME_ID, w.recipient, key, metadata);
        }
        // nonReentrant: callbacks during the pushes cannot reorder or fabricate this log.
        // forge-lint: disable-next-item(reentrancy-events)
        emit Withdrawn(
            w.recipient,
            value,
            w.relayerFee,
            p.existingNullifierHash(),
            p.newCommitmentHash(),
            w.aspPublisher,
            p.aspRoot()
        );
    }

    // slither-disable-end timestamp

    /// @inheritdoc IGhostPayShieldedPool
    function ragequit(RagequitProof calldata p) external nonReentrant {
        uint256 label = p.label();
        address depositor = _depositors[label];
        if (depositor == address(0) || depositor != msg.sender) revert NotDepositor();
        uint256 value = p.value();
        if (value == 0 || value > PoolConstants.MAX_VALUE) revert InvalidValue();
        uint256 commitment = p.commitment();
        if (!_tree.has(commitment)) revert InvalidCommitment();
        if (!_RAGEQUIT_VERIFIER.verifyProof(p.pA, p.pB, p.pC, p.pubSignals)) revert InvalidProof();

        _spend(p.nullifierHash());
        _push(msg.sender, value);
        // nonReentrant: see `withdraw`.
        // forge-lint: disable-next-line(reentrancy-events)
        emit Ragequit(msg.sender, commitment, label, value);
    }

    /// @inheritdoc IGhostPayShieldedPool
    function ANNOUNCER() external view returns (address) {
        return address(_ANNOUNCER);
    }

    /// @inheritdoc IGhostPayShieldedPool
    function REGISTRY() external view returns (address) {
        return address(_REGISTRY);
    }

    /// @inheritdoc IGhostPayShieldedPool
    function WITHDRAW_VERIFIER() external view returns (address) {
        return address(_WITHDRAW_VERIFIER);
    }

    /// @inheritdoc IGhostPayShieldedPool
    function RAGEQUIT_VERIFIER() external view returns (address) {
        return address(_RAGEQUIT_VERIFIER);
    }

    /// @inheritdoc IGhostPayShieldedPool
    function POSEIDON_T3() external view returns (address) {
        return address(_POSEIDON_T3);
    }

    /// @inheritdoc IGhostPayShieldedPool
    function POSEIDON_T4() external view returns (address) {
        return address(_POSEIDON_T4);
    }

    /// @inheritdoc IGhostPayShieldedPool
    function currentRoot() external view returns (uint256) {
        return _tree.root();
    }

    /// @inheritdoc IGhostPayShieldedPool
    function currentTreeDepth() external view returns (uint256) {
        return _tree.depth;
    }

    /// @inheritdoc IGhostPayShieldedPool
    function currentTreeSize() external view returns (uint256) {
        return _tree.size;
    }

    /// @inheritdoc IGhostPayShieldedPool
    function isKnownRoot(uint256 root) external view returns (bool) {
        return _isKnownRoot(root);
    }

    /// @inheritdoc IGhostPayShieldedPool
    function nullifierSpent(uint256 nullifierHash) external view returns (bool) {
        return _spent[nullifierHash];
    }

    /// @inheritdoc IGhostPayShieldedPool
    function depositorOf(uint256 label) external view returns (address) {
        return _depositors[label];
    }

    /// @inheritdoc IGhostPayShieldedPool
    function isLeaf(uint256 leaf) external view returns (bool) {
        return _tree.has(leaf);
    }

    /// @dev Value/precommitment rules shared by every deposit path.
    function _checkDeposit(uint256 value, uint256 precommitment) internal view {
        if (value == 0) revert InvalidValue();
        if (value > MAX_DEPOSIT) revert DepositCapExceeded();
        if (DENOMINATION != 0 && value != DENOMINATION) revert InvalidValue();
        if (precommitment == 0 || precommitment >= PoolConstants.SNARK_SCALAR_FIELD) {
            revert InvalidPrecommitment();
        }
    }

    /// @dev Assigns a label, records `depositor`, inserts the commitment and emits `Deposited`.
    function _recordDeposit(address depositor, uint256 value, uint256 precommitment)
        internal
        returns (uint256 commitment, uint256 label)
    {
        uint256 n = depositNonce + 1;
        depositNonce = n;
        label = uint256(keccak256(abi.encodePacked(SCOPE, n))) % PoolConstants.SNARK_SCALAR_FIELD;
        _depositors[label] = depositor;
        commitment = _POSEIDON_T4.hash([value, label, precommitment]);
        _insert(commitment);
        // Only the immutable, pure hashers were called (STATICCALL); no reentrancy is possible.
        // forge-lint: disable-next-item(reentrancy-events)
        emit Deposited(depositor, commitment, label, value, precommitment);
    }

    /// @dev Appends a leaf and records the new root in the history.
    function _insert(uint256 leaf) internal {
        if (leaf == 0 || leaf >= PoolConstants.SNARK_SCALAR_FIELD || _tree.has(leaf)) {
            revert InvalidLeaf();
        }
        uint256 size = _tree.size;
        if (size >= MAX_TREE_SIZE) revert TreeFull();
        uint256 root = _tree.insert(_POSEIDON_T3, leaf);
        _rootSize[root] = size + 1;
        // Only the immutable, pure hasher was called (STATICCALL); no reentrancy is possible.
        // forge-lint: disable-next-line(reentrancy-events)
        emit LeafInserted(size, leaf, root);
    }

    /// @dev A root is known iff it was current at some tree size `s` and fewer than
    /// `ROOT_HISTORY_SIZE` leaves were inserted since (accepted for the next 63 inserts).
    function _isKnownRoot(uint256 root) internal view returns (bool) {
        if (root == 0) return false;
        uint256 s = _rootSize[root];
        return s != 0 && _tree.size - s < ROOT_HISTORY_SIZE;
    }

    /// @dev Marks a nullifier hash spent; reverts if it already was.
    function _spend(uint256 nullifierHash) internal {
        if (_spent[nullifierHash]) revert NullifierSpent();
        _spent[nullifierHash] = true;
    }

    /// @dev Relayer-fee rules: fee within the bps cap of `value`; a non-zero fee needs a real `feeTo`.
    function _checkFee(Withdrawal calldata w, uint256 value) private view {
        // MAX_RELAYER_FEE_BPS <= 1_000, so the cap is always below `value`.
        if (w.relayerFee > value * MAX_RELAYER_FEE_BPS / PoolConstants.BPS) revert FeeTooHigh();
        if (w.relayerFee != 0 && (w.feeTo == address(0) || w.feeTo == address(this))) {
            revert InvalidRecipient();
        }
    }

    // slither-disable-start timestamp,unused-return
    /// @dev Association-set rule (spec 6.2).
    function _checkAsp(address publisher, WithdrawProof calldata p) private view {
        uint256 enabled = p.aspEnabled();
        uint256 aspRoot = p.aspRoot();
        if (enabled == 0) {
            if (publisher != address(0) || aspRoot != 0 || p.aspTreeDepth() != 0) {
                revert AspMismatch();
            }
            return;
        }
        if (enabled != 1 || publisher == address(0)) revert AspMismatch();
        if (!_REGISTRY.wasPublished(publisher, aspRoot)) revert UnknownAspRoot();
        // Only the latest root matters here; publishedAt/index are informational.
        // forge-lint: disable-next-line(unused-return)
        (uint256 latestRoot,,) = _REGISTRY.latest(publisher);
        if (aspRoot == latestRoot) return;
        uint256 superseded = _REGISTRY.supersededAt(publisher, aspRoot);
        // Grace window is a policy in seconds; validator drift is irrelevant at this scale.
        // forge-lint: disable-next-line(block-timestamp)
        if (superseded == 0 || block.timestamp - superseded > ASP_GRACE_SECONDS) {
            revert UnknownAspRoot();
        }
    }

    // slither-disable-end timestamp,unused-return

    /// @dev Decodes and validates `announce` against the router metadata rules. Returns empty
    /// key/metadata when `announce` is empty.
    function _decodeAnnounce(bytes calldata announce, uint256 net)
        private
        view
        returns (bytes memory key, bytes memory metadata)
    {
        if (announce.length == 0) return (key, metadata);
        (key, metadata) = abi.decode(announce, (bytes, bytes));
        if (key.length != EPHEMERAL_KEY_LENGTH || (key[0] != 0x02 && key[0] != 0x03)) {
            revert InvalidAnnounce();
        }
        if (metadata.length != METADATA_LENGTH) revert InvalidAnnounce();
        bytes4 marker;
        address asset;
        uint256 amount;
        assembly ("memory-safe") {
            let d := add(metadata, 0x20)
            marker := mload(add(d, 1))
            asset := shr(96, mload(add(d, 5)))
            amount := mload(add(d, 25))
        }
        if (marker != _metadataMarker() || asset != _metadataAsset() || amount != net) {
            revert InvalidAnnounce();
        }
    }

    /// @dev Checks that both hashers reproduce the circomlib reference values.
    function _checkHashers(IPoseidonT3 t3, IPoseidonT4 t4) private pure {
        if (t3.hash([uint256(1), 2]) != PoolConstants.POSEIDON_T3_KAT) revert InvalidConfig();
        if (t4.hash([uint256(1), 2, 3]) != PoolConstants.POSEIDON_T4_KAT) revert InvalidConfig();
    }

    /// @dev Takes custody of a deposit of `value` from `from` (asset specific).
    function _receiveDeposit(address from, uint256 value) internal virtual;

    /// @dev Sends `value` of the asset to `to` (asset specific).
    function _push(address to, uint256 value) internal virtual;

    /// @dev Announcement metadata marker of this asset type.
    function _metadataMarker() internal pure virtual returns (bytes4);

    /// @dev Announcement metadata asset field of this pool.
    function _metadataAsset() internal view virtual returns (address);
}
