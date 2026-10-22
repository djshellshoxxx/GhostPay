// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {ChainGuard} from "./ChainGuard.sol";
import {IPaymaster, IEntryPointStake, PackedUserOperation} from "./interfaces/IERC4337.sol";

/// @title GhostPayVerifyingPaymaster
/// @author GhostPay
/// @notice Payer-hiding mode PH-4. ERC-4337 v0.7 paymaster that pays gas for a user operation iff the
/// operation carries a signature by the immutable `VERIFYING_SIGNER` over its fields, a validity window,
/// the chain id and this paymaster's address.
/// @dev `paymasterAndData` layout: `paymaster(20) || verificationGasLimit(16) || postOpGasLimit(16) ||
/// validUntil(6) || validAfter(6) || signature(65)`. The signed hash (EIP-191 personal-sign wrapped) is
/// `keccak256(abi.encode(h1, paymasterGasLimits, chainid, address(this), validUntil, validAfter))` with
/// `h1 = keccak256(abi.encode(sender, nonce, keccak256(initCode), keccak256(callData), accountGasLimits,
/// preVerificationGas, gasFees))`. It covers everything except the signature itself, so a changed
/// `sender`, `callData`, gas field or time window invalidates it, and the account nonce makes a signature
/// single-use per operation.
///
/// Gas-field caps (CONTRACTS-POOLS-01): the signature does not bind the bundler or the `handleOps`
/// beneficiary, so whoever submits the op is paid from this deposit at the op's own fee fields. The
/// immutable caps `MAX_FEE_PER_GAS`, `MAX_PRIORITY_FEE_PER_GAS` and `MAX_PRE_VERIFICATION_GAS` bound
/// what a self-bundling holder of a valid signature (or a stolen or sloppy signer) can extract per op;
/// validation reverts above them. The sponsor service applies tighter, live-gas-price-based limits.
///
/// Privileged role (the ONLY one in the payer-hiding contracts, testnet only): `SPONSOR_ADMIN` (immutable)
/// may withdraw the paymaster's EntryPoint deposit and manage its stake. It cannot change the signer,
/// cannot sponsor operations by itself and cannot touch user funds. If the admin key is lost the deposit
/// is stuck; if the signer key is stolen the attacker can spend the deposit on gas only.
///
/// Not provided by design: ERC-20 gas payment, `postOp` (context is empty so the EntryPoint never calls
/// it), time-range validation beyond what the EntryPoint enforces from `validationData`.
contract GhostPayVerifyingPaymaster is IPaymaster, ChainGuard {
    /// @dev `paymasterAndData` offsets (ERC-4337 v0.7).
    uint256 private constant PM_GAS_OFFSET = 20;
    uint256 private constant PM_DATA_OFFSET = 52;
    uint256 private constant PM_SIG_OFFSET = PM_DATA_OFFSET + 12;
    uint256 private constant SIG_LENGTH = 65;
    uint256 private constant PM_TOTAL_LENGTH = PM_SIG_OFFSET + SIG_LENGTH;

    /// @notice The ERC-4337 v0.7 EntryPoint.
    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    IEntryPointStake public immutable ENTRY_POINT;
    /// @notice Key whose signatures authorise sponsorship.
    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    address public immutable VERIFYING_SIGNER;
    /// @notice Sole privileged role: manages this paymaster's deposit and stake.
    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    address public immutable SPONSOR_ADMIN;
    /// @notice Largest accepted `maxFeePerGas` of a sponsored operation (wei).
    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    uint256 public immutable MAX_FEE_PER_GAS;
    /// @notice Largest accepted `maxPriorityFeePerGas` of a sponsored operation (wei).
    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    uint256 public immutable MAX_PRIORITY_FEE_PER_GAS;
    /// @notice Largest accepted `preVerificationGas` of a sponsored operation.
    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    uint256 public immutable MAX_PRE_VERIFICATION_GAS;

    /// @notice The caller is not the EntryPoint.
    error NotEntryPoint();
    /// @notice The caller is not the sponsor admin.
    error NotAdmin();
    /// @notice A constructor argument was zero or the EntryPoint has no code.
    error ZeroAddress();
    /// @notice `paymasterAndData` does not have the exact expected length.
    error BadPaymasterData();
    /// @notice `validUntil` was zero (open-ended sponsorship is refused).
    error NoExpiry();
    /// @notice `postOp` must never be called (the context is always empty).
    error PostOpUnsupported();
    /// @notice A gas-field cap passed to the constructor was zero, or priority cap above fee cap.
    error BadGasCap();
    /// @notice The operation's fee fields or `preVerificationGas` exceed the immutable caps.
    error GasAboveCap();

    /// @param entryPoint The ERC-4337 v0.7 EntryPoint.
    /// @param verifyingSigner Key whose signatures authorise sponsorship.
    /// @param sponsorAdmin Key that may withdraw the deposit and manage the stake.
    /// @param maxFeePerGas Cap on a sponsored op's `maxFeePerGas` (wei, non-zero).
    /// @param maxPriorityFeePerGas Cap on its `maxPriorityFeePerGas` (wei, non-zero, <= `maxFeePerGas`).
    /// @param maxPreVerificationGas Cap on its `preVerificationGas` (non-zero).
    constructor(
        address entryPoint,
        address verifyingSigner,
        address sponsorAdmin,
        uint256 maxFeePerGas,
        uint256 maxPriorityFeePerGas,
        uint256 maxPreVerificationGas
    ) ChainGuard() {
        if (
            entryPoint == address(0) || verifyingSigner == address(0) || sponsorAdmin == address(0)
                || entryPoint.code.length == 0
        ) revert ZeroAddress();
        if (
            maxFeePerGas == 0 || maxPriorityFeePerGas == 0 || maxPreVerificationGas == 0
                || maxPriorityFeePerGas > maxFeePerGas
        ) revert BadGasCap();
        ENTRY_POINT = IEntryPointStake(entryPoint);
        VERIFYING_SIGNER = verifyingSigner;
        SPONSOR_ADMIN = sponsorAdmin;
        MAX_FEE_PER_GAS = maxFeePerGas;
        MAX_PRIORITY_FEE_PER_GAS = maxPriorityFeePerGas;
        MAX_PRE_VERIFICATION_GAS = maxPreVerificationGas;
    }

    /// @inheritdoc IPaymaster
    function validatePaymasterUserOp(PackedUserOperation calldata userOp, bytes32, uint256)
        external
        view
        returns (bytes memory context, uint256 validationData)
    {
        if (msg.sender != address(ENTRY_POINT)) revert NotEntryPoint();
        bytes calldata pmd = userOp.paymasterAndData;
        if (pmd.length != PM_TOTAL_LENGTH) revert BadPaymasterData();
        uint48 validUntil = uint48(bytes6(pmd[PM_DATA_OFFSET:PM_DATA_OFFSET + 6]));
        uint48 validAfter = uint48(bytes6(pmd[PM_DATA_OFFSET + 6:PM_SIG_OFFSET]));
        if (validUntil == 0) revert NoExpiry();
        // gasFees = maxPriorityFeePerGas (high 128 bits) || maxFeePerGas (low 128 bits).
        uint256 fees = uint256(userOp.gasFees);
        if (
            fees & type(uint128).max > MAX_FEE_PER_GAS || fees >> 128 > MAX_PRIORITY_FEE_PER_GAS
                || userOp.preVerificationGas > MAX_PRE_VERIFICATION_GAS
        ) revert GasAboveCap();

        bytes32 digest =
            MessageHashUtils.toEthSignedMessageHash(getHash(userOp, validUntil, validAfter));
        // The third return value (error argument) is only needed for custom revert data; unused on purpose.
        // slither-disable-next-line unused-return
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, pmd[PM_SIG_OFFSET:]);
        bool failed = err != ECDSA.RecoverError.NoError || signer != VERIFYING_SIGNER;
        // validationData: sigFailed (160 bits) | validUntil (48) | validAfter (48).
        validationData =
            (failed ? 1 : 0) | (uint256(validUntil) << 160) | (uint256(validAfter) << 208);
        context = "";
    }

    /// @inheritdoc IPaymaster
    function postOp(PostOpMode, bytes calldata, uint256, uint256) external pure {
        revert PostOpUnsupported();
    }

    /// @notice Hash that `VERIFYING_SIGNER` signs (before EIP-191 wrapping) for `userOp`.
    /// @param userOp The operation; its `paymasterAndData` signature part is ignored.
    /// @param validUntil Last valid timestamp (must be non-zero).
    /// @param validAfter First valid timestamp.
    /// @return The hash.
    function getHash(PackedUserOperation calldata userOp, uint48 validUntil, uint48 validAfter)
        public
        view
        returns (bytes32)
    {
        bytes32 h1 = keccak256(
            abi.encode(
                userOp.sender,
                userOp.nonce,
                keccak256(userOp.initCode),
                keccak256(userOp.callData),
                userOp.accountGasLimits,
                userOp.preVerificationGas,
                userOp.gasFees
            )
        );
        bytes32 pmGas = bytes32(userOp.paymasterAndData[PM_GAS_OFFSET:PM_DATA_OFFSET]);
        return
            keccak256(abi.encode(h1, pmGas, block.chainid, address(this), validUntil, validAfter));
    }

    /// @notice Add to this paymaster's EntryPoint deposit. Anyone may top it up.
    function deposit() external payable {
        ENTRY_POINT.depositTo{value: msg.value}(address(this));
    }

    /// @notice Withdraw from the deposit. Sponsor admin only.
    /// @param to Recipient.
    /// @param amount Amount in wei.
    function withdrawTo(address payable to, uint256 amount) external {
        _onlyAdmin();
        ENTRY_POINT.withdrawTo(to, amount);
    }

    /// @notice Stake the attached value at the EntryPoint (bundler reputation rules). Sponsor admin only.
    /// @param unstakeDelaySec Unstake delay in seconds.
    function addStake(uint32 unstakeDelaySec) external payable {
        _onlyAdmin();
        ENTRY_POINT.addStake{value: msg.value}(unstakeDelaySec);
    }

    /// @notice Start the unstake delay. Sponsor admin only.
    function unlockStake() external {
        _onlyAdmin();
        ENTRY_POINT.unlockStake();
    }

    /// @notice Withdraw the unlocked stake. Sponsor admin only.
    /// @param to Recipient.
    function withdrawStake(address payable to) external {
        _onlyAdmin();
        ENTRY_POINT.withdrawStake(to);
    }

    function _onlyAdmin() private view {
        if (msg.sender != SPONSOR_ADMIN) revert NotAdmin();
    }
}
