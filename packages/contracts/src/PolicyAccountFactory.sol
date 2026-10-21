// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PolicyAccount} from "./PolicyAccount.sol";

/// @title PolicyAccountFactory
/// @author GhostPay
/// @notice Deploys deterministic EIP-1167 clones of `PolicyAccount` and charges the F-SECURE flat fee once
/// per account. Anyone may deploy any account; the address is independent of who pays.
/// @dev Security properties:
/// - `implementation`, `feeToken`, `flatFee` and `feeRecipient` are immutable; there is no owner, admin,
///   upgrade path, pause or rescue.
/// - Address of an account: `CREATE2(factory, salt = keccak256(abi.encode(owner, policyHash)),
///   EIP-1167 clone of implementation)` with `policyHash = keccak256(abi.encode(destination,
///   delaySeconds, limitsRoot))`. The factory is bound to the chain and to the implementation, so
///   a different factory, implementation or chain yields different addresses.
/// - The fee is pulled from `msg.sender` to `feeRecipient` before the clone is created; the recipient's
///   balance must rise by exactly `flatFee` (fee-on-transfer and rebasing tokens revert). Skipped when
///   `flatFee == 0`. An already deployed account reverts before any fee is taken.
/// - The event deliberately omits owner and policy data to avoid additional linkability.
contract PolicyAccountFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Longest allowed withdrawal delay (30 days), equal to `PolicyAccount.MAX_DELAY`.
    uint256 public constant MAX_DELAY = 30 days;
    /// @notice Shortest delay the factory accepts (1 hour); a shorter timelock gives the owner no
    /// realistic reaction window. The account itself only enforces `1 .. MAX_DELAY`.
    uint256 public constant MIN_DELAY = 1 hours;

    /// @notice The `PolicyAccount` implementation that is cloned.
    address public immutable IMPLEMENTATION;
    /// @notice Token in which the flat fee is paid (irrelevant if `FLAT_FEE == 0`).
    address public immutable FEE_TOKEN;
    /// @notice Flat fee in `FEE_TOKEN` base units charged per account.
    uint256 public immutable FLAT_FEE;
    /// @notice Recipient of the flat fee.
    address public immutable FEE_RECIPIENT;

    /// @notice Emitted when an account is deployed. Carries no owner or policy data.
    /// @param account The deployed account.
    event AccountDeployed(address indexed account);

    /// @notice A required address was zero.
    error ZeroAddress();
    /// @notice The delay is zero or above `MAX_DELAY`.
    error InvalidDelay();
    /// @notice The delay is non-zero but below `MIN_DELAY`.
    /// @param delay The rejected delay.
    error DelayTooShort(uint256 delay);
    /// @notice The implementation address has no code.
    error ImplementationHasNoCode();
    /// @notice An account with these parameters already exists.
    /// @param account The existing account.
    error AlreadyDeployed(address account);
    /// @notice The fee recipient's balance did not rise by exactly the flat fee.
    error UnexpectedFeeDelta();

    /// @notice Configures the factory.
    /// @param implementation_ Deployed `PolicyAccount` implementation (must have code).
    /// @param feeToken_ Fee token; may be zero only when `flatFee_ == 0`.
    /// @param flatFee_ Flat fee per account in base units; zero disables the fee.
    /// @param feeRecipient_ Fee recipient, ideally a hardware wallet or multisig.
    constructor(
        address implementation_,
        // Zero is accepted only when the fee is disabled (checked in the body).
        // forge-lint: disable-next-line(missing-zero-check)
        address feeToken_,
        uint256 flatFee_,
        address feeRecipient_
    ) {
        if (
            implementation_ == address(0) || feeRecipient_ == address(0)
                || (flatFee_ != 0 && feeToken_ == address(0))
        ) revert ZeroAddress();
        if (implementation_.code.length == 0) revert ImplementationHasNoCode();
        IMPLEMENTATION = implementation_;
        FEE_TOKEN = feeToken_;
        FLAT_FEE = flatFee_;
        FEE_RECIPIENT = feeRecipient_;
    }

    /// @notice Deploys and initialises the account for `(owner, destination, delay, limitsRoot)`.
    /// @param owner Stealth EOA that will sign for the account.
    /// @param destination Initial destination of all withdrawals.
    /// @param delay Withdrawal timelock in seconds (`MIN_DELAY` to `MAX_DELAY`).
    /// @param limitsRoot Merkle root of per-token limits, or zero for no limits.
    /// @return account The deployed account.
    function deploy(address owner, address destination, uint256 delay, bytes32 limitsRoot)
        external
        nonReentrant
        returns (address account)
    {
        if (owner == address(0) || destination == address(0)) revert ZeroAddress();
        if (delay == 0 || delay > MAX_DELAY) revert InvalidDelay();
        if (delay < MIN_DELAY) revert DelayTooShort(delay);
        bytes32 salt = keccak256(abi.encode(owner, policyHashOf(destination, delay, limitsRoot)));
        address predicted = Clones.predictDeterministicAddress(IMPLEMENTATION, salt);
        if (predicted.code.length != 0) revert AlreadyDeployed(predicted);

        uint256 fee = FLAT_FEE;
        if (fee != 0) {
            IERC20 token = IERC20(FEE_TOKEN);
            uint256 before = token.balanceOf(FEE_RECIPIENT);
            // `msg.sender` pays its own tokens; it must have approved this factory.
            // forge-lint: disable-next-line(arbitrary-send-erc20)
            token.safeTransferFrom(msg.sender, FEE_RECIPIENT, fee);
            // Exact delta is the intended check: fee-on-transfer tokens must revert.
            // forge-lint: disable-next-line(incorrect-strict-equality)
            if (token.balanceOf(FEE_RECIPIENT) != before + fee) revert UnexpectedFeeDelta();
        }

        account = Clones.cloneDeterministic(IMPLEMENTATION, salt);
        PolicyAccount(payable(account)).initialize(owner, destination, delay, limitsRoot);
        // Nonreentrant; the account is a fresh clone of the fixed implementation.
        // forge-lint: disable-next-line(reentrancy-events)
        emit AccountDeployed(account);
    }

    /// @notice Address of the account for an owner and policy hash, whether or not it is deployed.
    /// @param owner Stealth EOA owner.
    /// @param policyHash `policyHashOf(destination, delaySeconds, limitsRoot)`.
    /// @return account The CREATE2 address.
    function predictAddress(address owner, bytes32 policyHash)
        external
        view
        returns (address account)
    {
        account = Clones.predictDeterministicAddress(
            IMPLEMENTATION, keccak256(abi.encode(owner, policyHash))
        );
    }

    /// @notice Policy hash committed to by the scheme-2 meta-address.
    /// @param destination Destination of withdrawals.
    /// @param delaySeconds Withdrawal timelock in seconds.
    /// @param limitsRoot Merkle root of per-token limits, or zero.
    /// @return hash `keccak256(abi.encode(destination, delaySeconds, limitsRoot))`.
    function policyHashOf(address destination, uint256 delaySeconds, bytes32 limitsRoot)
        public
        pure
        returns (bytes32 hash)
    {
        hash = keccak256(abi.encode(destination, delaySeconds, limitsRoot));
    }
}
