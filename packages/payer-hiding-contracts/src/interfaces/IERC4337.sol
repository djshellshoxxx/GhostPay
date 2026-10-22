// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @notice ERC-4337 v0.7 packed user operation (field layout from the ERC-4337 text and the
/// EntryPoint v0.7 ABI; written here independently so no GPL EntryPoint source is imported).
/// @param sender The account.
/// @param nonce Anti-replay parameter (EntryPoint nonce: key in the high 192 bits).
/// @param initCode Factory address (20 bytes) followed by factory calldata, or empty.
/// @param callData Calldata executed on the account.
/// @param accountGasLimits `verificationGasLimit` (16 bytes) || `callGasLimit` (16 bytes).
/// @param preVerificationGas Gas paid for overhead outside the verification/execution loops.
/// @param gasFees `maxPriorityFeePerGas` (16 bytes) || `maxFeePerGas` (16 bytes).
/// @param paymasterAndData Empty, or paymaster (20) || verificationGasLimit (16) || postOpGasLimit (16) || data.
/// @param signature Account-defined signature.
struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    bytes32 gasFees;
    bytes paymasterAndData;
    bytes signature;
}

/// @title IAccount
/// @notice ERC-4337 v0.7 account interface.
interface IAccount {
    /// @notice Validate a user operation; called by the EntryPoint.
    /// @param userOp The operation.
    /// @param userOpHash The EntryPoint hash of the operation (binds chain id and EntryPoint).
    /// @param missingAccountFunds Native amount the account must pay to the EntryPoint (0 with a paymaster).
    /// @return validationData `0` for success, `1` for signature failure, or packed time range data.
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData);
}

/// @title IPaymaster
/// @notice ERC-4337 v0.7 paymaster interface.
interface IPaymaster {
    /// @notice Whether `postOp` ran for a successful or a reverted user operation.
    enum PostOpMode {
        opSucceeded,
        opReverted,
        postOpReverted
    }

    /// @notice Decide whether to sponsor `userOp`; called by the EntryPoint.
    /// @param userOp The operation.
    /// @param userOpHash The EntryPoint hash of the operation.
    /// @param maxCost Maximum native cost the EntryPoint may charge the paymaster deposit.
    /// @return context Opaque value passed to `postOp` (empty skips `postOp`).
    /// @return validationData `0` for success, `1` for signature failure, or packed time range data.
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external returns (bytes memory context, uint256 validationData);

    /// @notice Post-operation hook.
    /// @param mode Outcome of the user operation.
    /// @param context Value returned by `validatePaymasterUserOp`.
    /// @param actualGasCost Actual native cost charged.
    /// @param actualUserOpFeePerGas Actual gas price paid.
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) external;
}

/// @title IEntryPointStake
/// @notice The subset of the ERC-4337 v0.7 EntryPoint used by the account factory and the paymaster.
interface IEntryPointStake {
    /// @notice Deposit native token for `account`.
    /// @param account The deposit owner.
    function depositTo(address account) external payable;

    /// @notice Native deposit of `account`.
    /// @param account The deposit owner.
    /// @return The deposit.
    function balanceOf(address account) external view returns (uint256);

    /// @notice Withdraw from the caller's deposit.
    /// @param withdrawAddress The recipient.
    /// @param withdrawAmount The amount.
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external;

    /// @notice Stake the attached value for the caller.
    /// @param unstakeDelaySec Delay in seconds before a stake can be withdrawn after unlocking.
    function addStake(uint32 unstakeDelaySec) external payable;

    /// @notice Start the unstake delay.
    function unlockStake() external;

    /// @notice Withdraw the unlocked stake.
    /// @param withdrawAddress The recipient.
    function withdrawStake(address payable withdrawAddress) external;
}
