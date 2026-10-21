// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC5564Announcer} from "../interfaces/IERC5564Announcer.sol";

/// @title MockAnnouncer
/// @notice Test double for the ERC-5564 announcer: emits the same `Announcement` event.
contract MockAnnouncer is IERC5564Announcer {
    /// @inheritdoc IERC5564Announcer
    function announce(
        uint256 schemeId,
        address stealthAddress,
        bytes memory ephemeralPubKey,
        bytes memory metadata
    ) external {
        emit Announcement(schemeId, stealthAddress, msg.sender, ephemeralPubKey, metadata);
    }
}
