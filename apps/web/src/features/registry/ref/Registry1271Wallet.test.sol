// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.23;

/// @dev Local acceptance fixture only. Not a production wallet or signing protocol.
contract Registry1271Wallet {
    address public immutable owner = msg.sender;
    bytes32 private approvedDigest;
    bytes32 private approvedSignature;
    uint8 private responseMode;

    function approve(bytes32 digest, bytes calldata signature, uint8 mode) external {
        require(msg.sender == owner, "owner");
        approvedDigest = digest;
        approvedSignature = keccak256(signature);
        responseMode = mode;
    }

    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        require(responseMode != 2, "unavailable");
        if (responseMode == 0 && digest == approvedDigest && keccak256(signature) == approvedSignature) {
            return this.isValidSignature.selector;
        }
        return 0xffffffff;
    }

    function invalidate(address registry) external {
        require(msg.sender == owner, "owner");
        IRegistryNonce(registry).incrementNonce();
    }
}

interface IRegistryNonce {
    function incrementNonce() external;
}
