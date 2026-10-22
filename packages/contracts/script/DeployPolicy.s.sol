// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {console2} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {DeployBase} from "./DeployBase.s.sol";
import {PolicyAccount} from "../src/PolicyAccount.sol";
import {PolicyAccountFactory} from "../src/PolicyAccountFactory.sol";

/// @title DeployPolicy
/// @notice Deploys the `PolicyAccount` implementation and its `PolicyAccountFactory` (scheme 0x47500002).
/// @dev Configuration comes only from the environment; no key, token or fee address is hard-coded:
/// - `FEE_RECIPIENT` (required, non-zero, not the broadcaster): flat-fee recipient, ideally a hardware
///   wallet or multisig. It is used as the recipient of ERC-20 `FEE_TOKEN` transfers, so it must not be
///   blacklistable (see audit M-03); a warning is printed if it is a contract.
/// - `FEE_TOKEN` (required, non-zero, must have code): the chain's stablecoin used for the F-SECURE fee.
///   Its `decimals()` are printed so the operator can sanity-check `FLAT_FEE`.
/// - `FLAT_FEE` (required): fee per account in `FEE_TOKEN` base units (default policy: USD 3.00 equivalent);
///   `0` explicitly disables the fee.
/// - `MAX_FLAT_FEE` (required, no default): hard upper bound; `FLAT_FEE > MAX_FLAT_FEE` aborts. Guards
///   against decimals typos (1e18 on a 6-decimals token would make every deployment unusable).
/// - `ALLOWED_CHAIN_IDS` (optional, comma separated, spaces tolerated) and `ALLOW_LOCAL=1`: see `Deploy`.
/// Every immutable is read back after deployment and compared with the inputs.
/// Sign with `--account`, `--ledger` or `--trezor`; never pass a raw private key on a shared machine.
contract DeployPolicy is DeployBase {
    /// @notice `FEE_TOKEN` is unset or the zero address.
    error FeeTokenNotSet();
    /// @notice `FLAT_FEE` is unset or empty.
    error FlatFeeNotSet();
    /// @notice `MAX_FLAT_FEE` is unset or empty.
    error MaxFlatFeeNotSet();
    /// @notice `FLAT_FEE` exceeds `MAX_FLAT_FEE`.
    /// @param flatFee The configured fee.
    /// @param maxFlatFee The configured bound.
    error FlatFeeAboveMax(uint256 flatFee, uint256 maxFlatFee);
    /// @notice No contract code exists at the fee token address on this chain.
    /// @param feeToken The fee token address without code.
    error FeeTokenHasNoCode(address feeToken);

    /// @notice Deploy and print the addresses.
    /// @return implementation The deployed (self-locked) implementation.
    /// @return factory The deployed factory.
    function run() external returns (PolicyAccount implementation, PolicyAccountFactory factory) {
        address feeRecipient = _feeRecipient(msg.sender);

        string memory tokenRaw = _env("FEE_TOKEN");
        if (bytes(tokenRaw).length == 0) revert FeeTokenNotSet();
        address feeToken = vm.parseAddress(tokenRaw);
        if (feeToken == address(0)) revert FeeTokenNotSet();

        string memory flatRaw = _env("FLAT_FEE");
        if (bytes(flatRaw).length == 0) revert FlatFeeNotSet();
        uint256 flatFee = vm.parseUint(flatRaw);
        string memory maxRaw = _env("MAX_FLAT_FEE");
        if (bytes(maxRaw).length == 0) revert MaxFlatFeeNotSet();
        uint256 maxFlatFee = vm.parseUint(maxRaw);
        if (flatFee > maxFlatFee) revert FlatFeeAboveMax(flatFee, maxFlatFee);

        if (!_chainAllowed(block.chainid)) revert ChainNotAllowed(block.chainid);
        if (feeToken.code.length == 0) revert FeeTokenHasNoCode(feeToken);
        if (feeRecipient.code.length != 0) {
            console2.log(
                "WARNING: feeRecipient is a contract; verify it can receive the fee token."
            );
        }
        try IERC20Metadata(feeToken).decimals() returns (uint8 decimals_) {
            console2.log("feeToken decimals :", uint256(decimals_));
        } catch {
            console2.log("WARNING: feeToken.decimals() unavailable; verify FLAT_FEE manually.");
        }

        vm.startBroadcast();
        // The account that will actually sign must not be the fee recipient either.
        (, address signer,) = vm.readCallers();
        if (signer == feeRecipient) revert FeeRecipientIsBroadcaster(feeRecipient);
        implementation = new PolicyAccount();
        factory = new PolicyAccountFactory(address(implementation), feeToken, flatFee, feeRecipient);
        vm.stopBroadcast();

        // Read-back of every immutable.
        require(
            factory.IMPLEMENTATION() == address(implementation), "factory.IMPLEMENTATION mismatch"
        );
        require(factory.FEE_TOKEN() == feeToken, "factory.FEE_TOKEN mismatch");
        require(factory.FLAT_FEE() == flatFee, "factory.FLAT_FEE mismatch");
        require(factory.FEE_RECIPIENT() == feeRecipient, "factory.FEE_RECIPIENT mismatch");
        require(factory.MIN_DELAY() == 1 hours, "factory.MIN_DELAY mismatch");
        require(factory.MAX_DELAY() == 30 days, "factory.MAX_DELAY mismatch");
        require(implementation.initialized(), "implementation is not locked");
        require(address(factory).code.length != 0, "factory has no code");
        require(implementation.DOMAIN_SEPARATOR() != bytes32(0), "implementation domain is zero");

        console2.log("chainId           :", block.chainid);
        console2.log("feeRecipient      :", feeRecipient);
        console2.log("feeToken          :", feeToken);
        console2.log("flatFee           :", flatFee);
        console2.log("maxFlatFee        :", maxFlatFee);
        console2.log("implementation    :", address(implementation));
        console2.log("policyFactory     :", address(factory));
        console2.log("implementation codehash:");
        console2.logBytes32(address(implementation).codehash);
        console2.log("factory codehash:");
        console2.logBytes32(address(factory).codehash);
    }
}
