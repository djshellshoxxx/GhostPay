// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {console2} from "forge-std/Script.sol";

import {DeployBase} from "./DeployBase.s.sol";
import {GhostPayPolicyRouter} from "../src/GhostPayPolicyRouter.sol";
import {PolicyAccountFactory} from "../src/PolicyAccountFactory.sol";
import {IERC5564Announcer} from "../src/interfaces/IERC5564Announcer.sol";

/// @title DeployPolicyRouter
/// @notice Deploys `GhostPayPolicyRouter` (scheme 0x47500002) against an existing ERC-5564 announcer and
/// an existing `PolicyAccountFactory` (deployed by `DeployPolicy`).
/// @dev Configuration comes only from the environment; no key or fee address is hard-coded:
/// - `FEE_RECIPIENT` (required, non-zero, not the broadcaster): router fee recipient, ideally the same
///   hardware wallet or multisig as the scheme-1 router. It must be able to receive ETH (a warning is
///   printed if it is a contract).
/// - `POLICY_FACTORY` (required, non-zero, must have code): the `PolicyAccountFactory` whose predicted
///   accounts the router accepts. Its `IMPLEMENTATION` must have code.
/// - `EXPECTED_POLICY_FACTORY_CODEHASH` (optional): if set, the factory's `codehash` must equal it.
/// - `ANNOUNCER` (optional): defaults to the canonical ERC-5564 announcer. Any other address is rejected
///   unless `ALLOW_CUSTOM_ANNOUNCER=1`. `EXPECTED_ANNOUNCER_CODEHASH` (optional) pins its code hash.
/// - `ALLOWED_CHAIN_IDS` (optional) and `ALLOW_LOCAL=1`: see `Deploy`.
/// Every immutable is read back after deployment and compared with the inputs.
/// Sign with `--account`, `--ledger` or `--trezor`; never pass a raw private key on a shared machine.
contract DeployPolicyRouter is DeployBase {
    /// @notice Canonical ERC-5564 announcer address (deterministic deployment).
    address public constant CANONICAL_ANNOUNCER = 0x55649E01B5Df198D18D95b5cc5051630cfD45564;

    /// @notice No contract code exists at the announcer address on this chain.
    /// @param announcer The announcer address without code.
    error AnnouncerHasNoCode(address announcer);
    /// @notice `ANNOUNCER` differs from the canonical address and `ALLOW_CUSTOM_ANNOUNCER=1` is not set.
    /// @param announcer The rejected announcer.
    error CustomAnnouncerNotAllowed(address announcer);
    /// @notice The announcer's code hash differs from `EXPECTED_ANNOUNCER_CODEHASH`.
    /// @param actual The actual code hash.
    /// @param expected The expected code hash.
    error AnnouncerCodehashMismatch(bytes32 actual, bytes32 expected);
    /// @notice `POLICY_FACTORY` is unset or the zero address.
    error PolicyFactoryNotSet();
    /// @notice No contract code exists at the factory address, or at its implementation.
    /// @param account The address without code.
    error PolicyFactoryHasNoCode(address account);
    /// @notice The factory's code hash differs from `EXPECTED_POLICY_FACTORY_CODEHASH`.
    /// @param actual The actual code hash.
    /// @param expected The expected code hash.
    error PolicyFactoryCodehashMismatch(bytes32 actual, bytes32 expected);

    /// @notice Deploy and print the address.
    /// @return router The deployed policy router.
    function run() external returns (GhostPayPolicyRouter router) {
        address feeRecipient = _feeRecipient(msg.sender);
        if (!_chainAllowed(block.chainid)) revert ChainNotAllowed(block.chainid);
        address announcer = _announcer();
        PolicyAccountFactory factory = _factory();
        if (feeRecipient.code.length != 0) {
            console2.log("WARNING: feeRecipient is a contract; it MUST accept plain ETH transfers.");
        }

        vm.startBroadcast();
        // The account that will actually sign must not be the fee recipient either.
        (, address signer,) = vm.readCallers();
        if (signer == feeRecipient) revert FeeRecipientIsBroadcaster(feeRecipient);
        router = new GhostPayPolicyRouter(IERC5564Announcer(announcer), feeRecipient, factory);
        vm.stopBroadcast();

        // Read-back of every immutable and constant that clients depend on.
        require(router.FEE_RECIPIENT() == feeRecipient, "router.FEE_RECIPIENT mismatch");
        require(address(router.ANNOUNCER()) == announcer, "router.ANNOUNCER mismatch");
        require(address(router.FACTORY()) == address(factory), "router.FACTORY mismatch");
        require(router.FEE_BPS() == 25, "router.FEE_BPS mismatch");
        require(router.SCHEME_ID() == 0x47500002, "router.SCHEME_ID mismatch");
        require(address(router).code.length != 0, "router has no code");

        console2.log("chainId           :", block.chainid);
        console2.log("announcer         :", announcer);
        console2.log("policyFactory     :", address(factory));
        console2.log("implementation    :", factory.IMPLEMENTATION());
        console2.log("feeRecipient      :", feeRecipient);
        console2.log("feeBps            :", router.FEE_BPS());
        console2.log("schemeId          :", router.SCHEME_ID());
        console2.log("policyRouter      :", address(router));
        console2.log("policyRouter codehash:");
        console2.logBytes32(address(router).codehash);
    }

    /// @dev Resolves and validates `ANNOUNCER` (canonical by default) and its optional code hash pin.
    function _announcer() internal view returns (address announcer) {
        string memory raw = _env("ANNOUNCER");
        announcer = bytes(raw).length == 0 ? CANONICAL_ANNOUNCER : vm.parseAddress(raw);
        if (announcer != CANONICAL_ANNOUNCER && !_flag("ALLOW_CUSTOM_ANNOUNCER")) {
            revert CustomAnnouncerNotAllowed(announcer);
        }
        if (announcer.code.length == 0) revert AnnouncerHasNoCode(announcer);
        bytes32 actual = announcer.codehash;
        string memory expectedRaw = _env("EXPECTED_ANNOUNCER_CODEHASH");
        if (bytes(expectedRaw).length != 0) {
            bytes32 expected = vm.parseBytes32(expectedRaw);
            if (expected != actual) revert AnnouncerCodehashMismatch(actual, expected);
        }
        console2.log("announcer codehash:");
        console2.logBytes32(actual);
    }

    /// @dev Resolves and validates `POLICY_FACTORY` and its optional code hash pin.
    function _factory() internal view returns (PolicyAccountFactory factory) {
        string memory raw = _env("POLICY_FACTORY");
        if (bytes(raw).length == 0) revert PolicyFactoryNotSet();
        address f = vm.parseAddress(raw);
        if (f == address(0)) revert PolicyFactoryNotSet();
        if (f.code.length == 0) revert PolicyFactoryHasNoCode(f);
        factory = PolicyAccountFactory(f);
        address impl = factory.IMPLEMENTATION();
        if (impl.code.length == 0) revert PolicyFactoryHasNoCode(impl);
        bytes32 actual = f.codehash;
        string memory expectedRaw = _env("EXPECTED_POLICY_FACTORY_CODEHASH");
        if (bytes(expectedRaw).length != 0) {
            bytes32 expected = vm.parseBytes32(expectedRaw);
            if (expected != actual) revert PolicyFactoryCodehashMismatch(actual, expected);
        }
        console2.log("policyFactory codehash:");
        console2.logBytes32(actual);
    }
}
