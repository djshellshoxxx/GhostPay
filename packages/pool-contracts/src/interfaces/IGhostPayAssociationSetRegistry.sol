// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title IGhostPayAssociationSetRegistry
/// @notice Permissionless registry of association-set (ASP) roots: every address publishes roots
/// for itself only. A withdrawal that opts into an association set names a publisher, and the pool
/// checks the proof's ASP root against that publisher's history here.
interface IGhostPayAssociationSetRegistry {
    /// @notice A publisher published (or re-published) `root` as its latest root.
    /// @param publisher The publishing address (`msg.sender`).
    /// @param root The published root (a bn254 field element, non-zero).
    /// @param index 1-based count of this publisher's publications, including this one.
    /// @param uri Where the set (`set.json`) can be fetched; informational, not stored.
    event RootPublished(address indexed publisher, uint256 indexed root, uint64 index, string uri);

    /// @notice The root is zero or not below the bn254 scalar field modulus.
    error InvalidRoot();
    /// @notice The registry was deployed on a chain id other than 31337, 11155111 or 84532.
    error WrongChain();

    /// @notice Publishes `root` as the caller's latest association-set root.
    /// @param root The root; `0 < root < P`.
    /// @param uri Location of the set contents; emitted only.
    function publish(uint256 root, string calldata uri) external;

    /// @notice The publisher's latest root.
    /// @param publisher The publisher.
    /// @return root The latest root (0 if never published).
    /// @return publishedAt Timestamp of the latest publication (0 if never).
    /// @return index 1-based publication count (0 if never).
    function latest(address publisher)
        external
        view
        returns (uint256 root, uint64 publishedAt, uint64 index);

    /// @notice When `root` stopped being the publisher's latest root.
    /// @param publisher The publisher.
    /// @param root The root.
    /// @return Timestamp at which a different root replaced it; 0 if it is the latest or was never
    /// published.
    function supersededAt(address publisher, uint256 root) external view returns (uint64);

    /// @notice Whether the publisher ever published `root`.
    /// @param publisher The publisher.
    /// @param root The root.
    /// @return True if `root` was published by `publisher` at least once.
    function wasPublished(address publisher, uint256 root) external view returns (bool);
}
