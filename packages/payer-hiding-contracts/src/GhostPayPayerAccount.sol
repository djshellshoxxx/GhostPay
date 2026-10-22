// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {ChainGuard} from "./ChainGuard.sol";
import {IAccount, PackedUserOperation} from "./interfaces/IERC4337.sol";

/// @title GhostPayPayerAccount
/// @author GhostPay
/// @notice Payer-hiding mode PH-4. Minimal single-owner ERC-4337 v0.7 account for one fresh payer. A
/// paymaster sponsors gas, so the account needs no native balance. Its calls (token approve, router
/// pay, approve reset, sponsor-fee transfer) run as the account, so the router sees the account as
/// `msg.sender`.
/// @dev Security properties:
/// - Single immutable ECDSA owner (set in the constructor, so no initializer to front-run), no module
///   system, no `delegatecall`, no upgrade path, no ownership transfer.
/// - Only the immutable EntryPoint may call {validateUserOp} and {executeBatch}. The owner signs the
///   EntryPoint `userOpHash` (it binds chain id, EntryPoint address and every operation field,
///   including `callData` and `paymasterAndData`); OpenZeppelin `ECDSA` rejects high-s signatures.
/// - {executeBatch} is a generic batch call by design (the owner's signature is the authorisation).
///   A payer that holds funds here is exposed to its owner key only.
/// - The account does not validate time ranges itself; paymaster time ranges are enforced by the
///   EntryPoint through the paymaster's `validationData`.
/// - The account is a public fingerprint (factory + code) and does not hide the payer.
contract GhostPayPayerAccount is IAccount, ChainGuard {
    /// @notice A single call in a batch.
    /// @param target Call target.
    /// @param value Native value sent.
    /// @param data Calldata.
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    /// @notice `validationData` value signalling a signature failure.
    uint256 internal constant SIG_VALIDATION_FAILED = 1;

    /// @notice The only caller allowed to validate and execute.
    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    address public immutable ENTRY_POINT;
    /// @notice The only key that can authorise operations.
    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    address public immutable OWNER;

    /// @notice The caller is not the EntryPoint.
    error NotEntryPoint();
    /// @notice A constructor argument was the zero address or the EntryPoint has no code.
    error ZeroAddress();
    /// @notice A call in the batch reverted; `index` is its position and `reason` its return data.
    /// @param index Position of the failing call.
    /// @param reason Raw revert data of the call.
    error CallFailed(uint256 index, bytes reason);
    /// @notice The EntryPoint prefund transfer failed.
    error PrefundFailed();

    /// @param entryPoint The ERC-4337 v0.7 EntryPoint.
    /// @param owner The single signing key.
    constructor(address entryPoint, address owner) ChainGuard() {
        if (entryPoint == address(0) || owner == address(0) || entryPoint.code.length == 0) {
            revert ZeroAddress();
        }
        ENTRY_POINT = entryPoint;
        OWNER = owner;
    }

    /// @notice Accept native token (for the optional prefund path and refunds).
    receive() external payable {}

    /// @inheritdoc IAccount
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData) {
        if (msg.sender != ENTRY_POINT) revert NotEntryPoint();
        // The third return value (error argument) is only needed for custom revert data; unused on purpose.
        // slither-disable-next-line unused-return
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(userOpHash, userOp.signature);
        validationData =
            (err == ECDSA.RecoverError.NoError && signer == OWNER) ? 0 : SIG_VALIDATION_FAILED;
        if (missingAccountFunds != 0) {
            bool ok;
            // The EntryPoint is the immutable, constructor-checked caller; return data is not needed.
            assembly ("memory-safe") {
                ok := call(gas(), caller(), missingAccountFunds, 0, 0, 0, 0)
            }
            if (!ok) revert PrefundFailed();
        }
    }

    /// @notice Execute `calls` in order as this account. Only the EntryPoint may call.
    /// @param calls The calls; any revert reverts the whole batch.
    function executeBatch(Call[] calldata calls) external {
        if (msg.sender != ENTRY_POINT) revert NotEntryPoint();
        uint256 n = calls.length;
        for (uint256 k = 0; k < n; ++k) {
            Call calldata c = calls[k];
            // Generic batch is the account's purpose; the owner signed every call (via `userOpHash`).
            // forge-lint: disable-next-line(calls-loop)
            (bool ok, bytes memory ret) = c.target.call{value: c.value}(c.data);
            // Any failing call must revert the whole batch.
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (!ok) revert CallFailed(k, ret);
        }
    }
}
