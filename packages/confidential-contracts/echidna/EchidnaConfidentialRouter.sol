// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {GhostPayConfidentialRouter} from "../contracts/GhostPayConfidentialRouter.sol";
import {MockAnnouncer} from "../contracts/mocks/MockAnnouncer.sol";

/// @title EchidnaConfidentialRouter
/// @notice LIMITED Echidna harness. Echidna's EVM has no fhEVM host contracts, so every FHE call
/// reverts: only the pre-FHE validation order, the ETH invariant and the flush gate can be
/// fuzzed here. The FHE-dependent properties (fee split, ACL, conservation) are covered by the
/// Hardhat mock tests (`test/fuzz.test.ts`), not by this harness.
contract EchidnaConfidentialRouter {
    GhostPayConfidentialRouter private immutable ROUTER;
    address private immutable TOKEN = address(0x7000);
    address private immutable FEE_RECIPIENT = address(0x8000);

    bool private wrongError;
    bool private payOk;
    bool private flushOk;

    constructor() payable {
        IERC7984[] memory toks = new IERC7984[](1);
        toks[0] = IERC7984(TOKEN);
        ROUTER = new GhostPayConfidentialRouter(new MockAnnouncer(), FEE_RECIPIENT, toks);
    }

    /// @dev Calls payConfidential with fuzzed arguments and checks the revert reason follows the
    /// documented validation order. A success is flagged (it cannot happen without FHE hosts).
    function pay(
        address token,
        address stealth,
        uint256 deadline,
        uint256 maxBuffer,
        bytes calldata eph,
        uint256 value
    ) external {
        value = value % (address(this).balance + 1);
        bytes4 expected;
        if (block.timestamp > deadline) {
            expected = GhostPayConfidentialRouter.Expired.selector;
        } else if (stealth == address(0) || stealth == address(ROUTER) || stealth == FEE_RECIPIENT) {
            expected = GhostPayConfidentialRouter.InvalidStealth.selector;
        } else if (eph.length != 33 || (eph[0] != 0x02 && eph[0] != 0x03)) {
            expected = GhostPayConfidentialRouter.InvalidEphemeralKey.selector;
        } else if (value > maxBuffer) {
            expected = GhostPayConfidentialRouter.BufferTooLarge.selector;
        } else if (token != TOKEN) {
            expected = GhostPayConfidentialRouter.TokenNotAllowed.selector;
        }
        try ROUTER.payConfidential{value: value}(
            IERC7984(token), stealth, externalEuint64.wrap(bytes32(0)), "", deadline, maxBuffer, eph, 0x00
        ) {
            payOk = true;
        } catch (bytes memory reason) {
            if (expected != bytes4(0) && bytes4(reason) != expected) wrongError = true;
        }
    }

    /// @dev Flushing without any successful payment must always revert.
    function flush(address token) external {
        try ROUTER.flushFees(IERC7984(token)) {
            flushOk = true;
        } catch {}
    }

    /// @notice Revert reasons for invalid input follow the documented order.
    function echidna_validation_order() external view returns (bool) {
        return !wrongError;
    }

    /// @notice No payment can succeed without fhEVM hosts, and none may leave ETH in the router.
    function echidna_no_success_no_eth() external view returns (bool) {
        return !payOk && address(ROUTER).balance == 0;
    }

    /// @notice `flushFees` never succeeds when no payment ever happened.
    function echidna_flush_gated() external view returns (bool) {
        return !flushOk;
    }

    /// @notice The constructor-fixed token set and immutables never change.
    function echidna_config_immutable() external view returns (bool) {
        return ROUTER.isTokenAllowed(TOKEN) && ROUTER.FEE_RECIPIENT() == FEE_RECIPIENT
            && ROUTER.FEE_DIVISOR() == 400 && ROUTER.lastFlush(TOKEN) == 0;
    }
}
