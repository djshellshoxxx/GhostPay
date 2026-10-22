// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IGhostPayAssociationSetRegistry} from "./interfaces/IGhostPayAssociationSetRegistry.sol";
import {PoolConstants} from "./lib/PoolConstants.sol";

/// @title GhostPayAssociationSetRegistry
/// @author GhostPay
/// @notice Permissionless association-set root registry (testnet PoC). Any address publishes roots
/// for itself; nobody can publish for another address; there is no admin.
/// @dev Security properties:
/// - No owner, role, pause, upgrade, `delegatecall` or external call. Deployment reverts outside
///   chain ids 31337, 11155111, 84532.
/// - Publication history per publisher is append-only: `wasPublished` never flips back to false.
///   Re-publishing an old root makes it the latest again (its `supersededAt` is cleared), so a
///   publisher can always re-activate a set it published before; this is the publisher's choice and is
///   visible in events.
/// - The registry says nothing about set contents; clients fetch `uri`, recompute the root and refuse
///   a mismatch. Choosing a publisher is a public disclosure in the pool's `Withdrawn` event.
contract GhostPayAssociationSetRegistry is IGhostPayAssociationSetRegistry {
    /// @dev Latest publication of a publisher.
    struct Latest {
        uint256 root;
        uint64 publishedAt;
        uint64 index;
    }

    /// @dev Latest publication per publisher.
    mapping(address publisher => Latest) private _latest;
    /// @dev Timestamp at which a root stopped being latest (0 if latest or never published).
    mapping(address publisher => mapping(uint256 root => uint64)) private _supersededAt;
    /// @dev Whether a root was ever published by a publisher.
    mapping(address publisher => mapping(uint256 root => bool)) private _published;

    /// @notice Deploys the registry; reverts on non-testnet chains.
    constructor() {
        if (!PoolConstants.isAllowedChain()) revert WrongChain();
    }

    /// @inheritdoc IGhostPayAssociationSetRegistry
    function publish(uint256 root, string calldata uri) external {
        if (root == 0 || root >= PoolConstants.SNARK_SCALAR_FIELD) revert InvalidRoot();
        Latest storage l = _latest[msg.sender];
        uint256 prev = l.root;
        // casting to uint64 is safe: timestamps fit in 64 bits for billions of years.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 nowTs = uint64(block.timestamp);
        if (prev != 0 && prev != root) _supersededAt[msg.sender][prev] = nowTs;
        _supersededAt[msg.sender][root] = 0;
        _published[msg.sender][root] = true;
        uint64 index = l.index + 1;
        l.root = root;
        l.publishedAt = nowTs;
        l.index = index;
        emit RootPublished(msg.sender, root, index, uri);
    }

    /// @inheritdoc IGhostPayAssociationSetRegistry
    function latest(address publisher)
        external
        view
        returns (uint256 root, uint64 publishedAt, uint64 index)
    {
        Latest storage l = _latest[publisher];
        return (l.root, l.publishedAt, l.index);
    }

    /// @inheritdoc IGhostPayAssociationSetRegistry
    function supersededAt(address publisher, uint256 root) external view returns (uint64) {
        return _supersededAt[publisher][root];
    }

    /// @inheritdoc IGhostPayAssociationSetRegistry
    function wasPublished(address publisher, uint256 root) external view returns (bool) {
        return _published[publisher][root];
    }
}
