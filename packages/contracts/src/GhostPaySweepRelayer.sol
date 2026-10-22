// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IGhostPaySweepRelayer} from "./interfaces/IGhostPaySweepRelayer.sol";

/// @title GhostPaySweepRelayer
/// @author GhostPay
/// @notice Lets a stealth EOA that holds ERC-20 tokens but no native gas move them: anyone may submit
/// the stealth key's EIP-712 sweep order (optionally with an ERC-2612 permit) and is reimbursed in
/// tokens through the signed `fee`.
/// @dev Security properties:
/// - No owner, no upgrade path, no pause, no delegatecall, no arbitrary external call, no state other
///   than the nonce bitmap. The relayer never holds tokens: it moves them `owner -> destination/feeTo`.
/// - The signature binds token, owner, destination, feeTo, amount, fee, deadline and nonce, plus chain id
///   and this contract's address through the EIP-712 domain. The submitter cannot change any of them.
/// - Signatures are recovered with OpenZeppelin `ECDSA.recover`, which rejects malleable high-s values.
///   Only EOA signers are supported (no ERC-1271): stealth addresses are EOAs.
/// - The nonce is consumed before any external call. Nonces are unordered (bitmap) and per owner.
/// - The permit is attempted inside try/catch: a front-run permit must not block the sweep. If the
///   resulting allowance is insufficient the token transfer reverts.
/// - Balance deltas of owner, destination and fee recipient must match exactly, which rejects
///   fee-on-transfer and rebasing tokens. DAI-style permit is not supported.
contract GhostPaySweepRelayer is IGhostPaySweepRelayer, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice EIP-712 type hash of {Sweep}.
    /// @return The type hash.
    bytes32 public constant SWEEP_TYPEHASH = keccak256(
        "Sweep(address token,address owner,address destination,address feeTo,uint256 amount,uint256 fee,uint256 deadline,uint256 nonce)"
    );

    /// @dev owner => word index (`nonce >> 8`) => bitmap of used nonces in that word.
    mapping(address owner => mapping(uint256 wordIndex => uint256 bitmap)) private _nonceBitmap;

    /// @notice Deploys the relayer; EIP-712 domain is name "GhostPaySweepRelayer", version "1".
    constructor() EIP712("GhostPaySweepRelayer", "1") {}

    /// @inheritdoc IGhostPaySweepRelayer
    function sweepWithPermit(Sweep calldata s, bytes calldata sweepSig, PermitSig calldata permit)
        external
        nonReentrant
    {
        _authorize(s, sweepSig);
        if (permit.value < s.amount) revert PermitValueTooLow();
        // A front-run permit consumes the owner's permit nonce and makes this call revert; ignoring the
        // failure is safe because the transfer reverts unless the allowance is sufficient.
        try IERC20Permit(s.token)
            .permit(
                s.owner, address(this), permit.value, permit.deadline, permit.v, permit.r, permit.s
            ) {}
            catch {}
        _execute(s);
    }

    /// @inheritdoc IGhostPaySweepRelayer
    function sweep(Sweep calldata s, bytes calldata sweepSig) external nonReentrant {
        _authorize(s, sweepSig);
        _execute(s);
    }

    /// @inheritdoc IGhostPaySweepRelayer
    function nonceUsed(address owner, uint256 nonce) external view returns (bool used) {
        used = _nonceBitmap[owner][nonce >> 8] & (1 << (nonce & 0xff)) != 0;
    }

    /// @inheritdoc IGhostPaySweepRelayer
    // forge-lint: disable-next-line(mixed-case-function)
    function DOMAIN_SEPARATOR() external view returns (bytes32 separator) {
        separator = _domainSeparatorV4();
    }

    /// @dev Validates the order, verifies the signature and consumes the nonce (before any external call).
    function _authorize(Sweep calldata s, bytes calldata sweepSig) private {
        // Deadline semantics are inherent to the product; second-level validator drift is acceptable.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > s.deadline) revert Expired();
        if (s.amount <= s.fee) revert InvalidAmount();
        if (
            s.destination == address(0) || s.feeTo == address(0) || s.owner == address(0)
                || s.token == address(0)
        ) revert ZeroAddress();
        if (
            s.destination == address(this) || s.feeTo == address(this) || s.owner == address(this)
                || s.token == address(this)
        ) revert SelfAddress();

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    SWEEP_TYPEHASH,
                    s.token,
                    s.owner,
                    s.destination,
                    s.feeTo,
                    s.amount,
                    s.fee,
                    s.deadline,
                    s.nonce
                )
            )
        );
        if (ECDSA.recover(digest, sweepSig) != s.owner) revert InvalidSignature();

        uint256 bit = 1 << (s.nonce & 0xff);
        uint256 word = _nonceBitmap[s.owner][s.nonce >> 8];
        if (word & bit != 0) revert NonceAlreadyUsed();
        _nonceBitmap[s.owner][s.nonce >> 8] = word | bit;
    }

    /// @dev Moves `amount - fee` to the destination and `fee` to `feeTo`, verifying exact balance deltas.
    function _execute(Sweep calldata s) private {
        IERC20 token = IERC20(s.token);
        uint256 net = s.amount - s.fee;
        uint256 ownerBefore = token.balanceOf(s.owner);
        uint256 destBefore = token.balanceOf(s.destination);
        uint256 feeBefore = token.balanceOf(s.feeTo);

        // `owner` is authenticated by its EIP-712 signature over exactly these parameters.
        // Slither: `from` is not attacker-chosen; `_authorize` recovered it as the signer of the EIP-712
        // order that fixes token, destination, feeTo, amount and fee, and the nonce is single-use.
        // forge-lint: disable-start(arbitrary-send-erc20)
        // slither-disable-next-line arbitrary-send-erc20
        token.safeTransferFrom(s.owner, s.destination, net);
        if (s.fee != 0) {
            // slither-disable-next-line arbitrary-send-erc20
            token.safeTransferFrom(s.owner, s.feeTo, s.fee);
        }
        // forge-lint: disable-end(arbitrary-send-erc20)

        // Exact deltas are the intended check: any deviation (fee-on-transfer, rebasing) must revert.
        // forge-lint: disable-start(incorrect-strict-equality)
        if (
            token.balanceOf(s.owner) + s.amount != ownerBefore
                || token.balanceOf(s.destination) != destBefore + net
                || token.balanceOf(s.feeTo) != feeBefore + s.fee
        ) revert UnexpectedBalanceDelta();
        // forge-lint: disable-end(incorrect-strict-equality)

        // Relayer is nonReentrant, so callbacks cannot reorder or fabricate this log.
        // forge-lint: disable-next-line(reentrancy-events)
        emit Swept(s.token, s.owner, s.destination, s.amount, s.fee);
    }
}
