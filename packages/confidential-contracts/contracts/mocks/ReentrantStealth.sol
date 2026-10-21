// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {GhostPayConfidentialRouter} from "../GhostPayConfidentialRouter.sol";

/// @title ReentrantStealth
/// @notice Test double: a "stealth address" whose ETH receive hook tries to re-enter
/// `payConfidential` and records the revert data of the attempt. Lets tests prove the router's
/// reentrancy guard holds on the ETH-forwarding path.
contract ReentrantStealth {
    /// @notice The router under test.
    GhostPayConfidentialRouter public immutable ROUTER;
    /// @notice Token passed to the re-entrant call.
    IERC7984 public immutable TOKEN;
    /// @notice Revert data of the last re-entrant attempt (empty if it did not revert).
    bytes public lastRevert;
    /// @notice Number of times the hook ran.
    uint256 public hookCalls;

    /// @notice Binds the mock to a router and token.
    /// @param router The router under test.
    /// @param token The accepted token.
    constructor(GhostPayConfidentialRouter router, IERC7984 token) {
        ROUTER = router;
        TOKEN = token;
    }

    /// @notice Re-enters `payConfidential` with dummy arguments and records the outcome.
    receive() external payable {
        ++hookCalls;
        bytes memory key = new bytes(33);
        key[0] = 0x02;
        try ROUTER.payConfidential(
            TOKEN,
            address(0xBEEF),
            externalEuint64.wrap(bytes32(0)),
            "",
            type(uint256).max,
            0,
            key,
            0x00
        ) {
            delete lastRevert;
        } catch (bytes memory reason) {
            lastRevert = reason;
        }
    }
}
