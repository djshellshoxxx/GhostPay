// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import {GhostPayShieldedPool} from "./GhostPayShieldedPool.sol";
import {IGhostPayShieldedPoolERC20} from "./interfaces/IGhostPayShieldedPool.sol";

/// @title GhostPayShieldedPoolERC20
/// @author GhostPay
/// @notice Shielded pool for one ERC-20 token (testnet PoC), with sponsored deposits authorised by an
/// EIP-712 `DepositAuth` signature of the paying owner (e.g. a stealth address `S1`).
/// @dev Security properties (in addition to `GhostPayShieldedPool`):
/// - Every token pull/push uses SafeERC20 and an exact balance-delta check on both the pool and the
///   receiver; fee-on-transfer, rebasing-on-transfer and lying tokens revert `UnexpectedBalanceDelta`.
/// - `depositWithPermit`: the sponsor cannot change any signed field (owner, value, precommitment,
///   feeTo, sponsorFee, deadline, nonce); the nonce is consumed before any external call; ECDSA
///   rejects high-s and malformed signatures; the ERC-2612 `permit` is wrapped in `try/catch` so a
///   front-run permit cannot block the deposit (the pull still needs allowance).
/// - EOA signers only (no ERC-1271).
// `deposit` is payable only because the shared interface serves the native pool too; this pool
// reverts on any `msg.value` (`_receiveDeposit`) and `receive()` reverts, so no ETH can be locked
// except by force (selfdestruct/coinbase), which no contract can prevent.
// slither-disable-start locked-ether
contract GhostPayShieldedPoolERC20 is GhostPayShieldedPool, IGhostPayShieldedPoolERC20, EIP712 {
    using SafeERC20 for IERC20;

    /// @notice EIP-712 type hash of `DepositAuth`.
    /// @return The type hash.
    bytes32 public constant DEPOSIT_AUTH_TYPEHASH = keccak256(
        "DepositAuth(address owner,uint256 value,uint256 precommitment,address feeTo,uint256 sponsorFee,uint256 deadline,uint256 nonce)"
    );

    /// @dev Nonce bitmap: owner => word index => bits.
    mapping(address owner => mapping(uint256 word => uint256 bits)) private _nonceBits;

    /// @notice Deploys an ERC-20 pool.
    /// @param c Configuration; `c.asset` must be a contract.
    constructor(PoolConfig memory c) GhostPayShieldedPool(c) EIP712("GhostPayShieldedPool", "1") {
        if (c.asset == address(0)) revert ZeroAddress();
        if (c.asset.code.length == 0) revert InvalidConfig();
    }

    /// @inheritdoc IGhostPayShieldedPoolERC20
    function depositWithPermit(
        DepositAuth calldata a,
        bytes calldata authSig,
        PermitSig calldata permit
    ) external nonReentrant returns (uint256 commitment, uint256 label) {
        // Deadline semantics are inherent to the product; second-level validator drift is acceptable.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > a.deadline) revert Expired();
        if (a.owner == address(0)) revert ZeroAddress();
        _checkDeposit(a.value, a.precommitment);
        if (a.sponsorFee != 0 && (a.feeTo == address(0) || a.feeTo == address(this))) {
            revert InvalidRecipient();
        }
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    DEPOSIT_AUTH_TYPEHASH,
                    a.owner,
                    a.value,
                    a.precommitment,
                    a.feeTo,
                    a.sponsorFee,
                    a.deadline,
                    a.nonce
                )
            )
        );
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, authSig);
        if (err != ECDSA.RecoverError.NoError || signer != a.owner) revert InvalidSignature();
        _useNonce(a.owner, a.nonce);

        // A front-run permit consumes the owner's permit nonce; ignoring the failure is safe because
        // the pull below reverts unless the allowance is sufficient.
        try IERC20Permit(ASSET)
            .permit(
                a.owner, address(this), permit.value, permit.deadline, permit.v, permit.r, permit.s
            ) {}
            catch {}

        (commitment, label) = _recordDeposit(a.owner, a.value, a.precommitment);
        _receiveDeposit(a.owner, a.value);
        if (a.sponsorFee != 0) _pullTo(a.owner, a.feeTo, a.sponsorFee);
    }

    /// @inheritdoc IGhostPayShieldedPoolERC20
    function nonceUsed(address owner, uint256 nonce) external view returns (bool) {
        return _nonceBits[owner][nonce >> 8] & (uint256(1) << (nonce & 0xff)) != 0;
    }

    /// @inheritdoc IGhostPayShieldedPoolERC20
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @dev Consumes `nonce` of `owner`; reverts `NonceUsed` if it was used.
    function _useNonce(address owner, uint256 nonce) private {
        uint256 bit = uint256(1) << (nonce & 0xff);
        uint256 word = _nonceBits[owner][nonce >> 8];
        if (word & bit != 0) revert NonceUsed();
        _nonceBits[owner][nonce >> 8] = word | bit;
    }

    /// @dev Pulls `value` from `from` into the pool with an exact balance-delta check. Rejects `msg.value`.
    function _receiveDeposit(address from, uint256 value) internal override {
        if (msg.value != 0) revert InvalidValue();
        _pullTo(from, address(this), value);
    }

    /// @dev `transferFrom(from, to, value)` with an exact balance-delta check on `to`.
    function _pullTo(address from, address to, uint256 value) private {
        IERC20 token = IERC20(ASSET);
        uint256 before = token.balanceOf(to);
        // `from` is msg.sender, or an owner whose EIP-712 signature was just verified.
        // slither-disable-next-line arbitrary-send-erc20
        // forge-lint: disable-next-line(arbitrary-send-erc20)
        token.safeTransferFrom(from, to, value);
        // Exact deltas are the intended check: any deviation (fee-on-transfer, rebasing) must revert.
        // forge-lint: disable-next-line(incorrect-strict-equality)
        if (token.balanceOf(to) != before + value) revert UnexpectedBalanceDelta();
    }

    /// @dev Transfers `value` to `to`; both the pool and `to` balances must move by exactly `value`.
    function _push(address to, uint256 value) internal override {
        IERC20 token = IERC20(ASSET);
        uint256 poolBefore = token.balanceOf(address(this));
        uint256 toBefore = token.balanceOf(to);
        token.safeTransfer(to, value);
        // Exact deltas are the intended check: any deviation (fee-on-transfer, rebasing) must revert.
        // forge-lint: disable-next-line(incorrect-strict-equality)
        if (token.balanceOf(address(this)) != poolBefore - value) revert UnexpectedBalanceDelta();
        // forge-lint: disable-next-line(incorrect-strict-equality)
        if (token.balanceOf(to) != toBefore + value) revert UnexpectedBalanceDelta();
    }

    /// @dev ERC-20 metadata marker (`transfer` selector).
    function _metadataMarker() internal pure override returns (bytes4) {
        return ERC20_MARKER;
    }

    /// @dev The token address.
    function _metadataAsset() internal view override returns (address) {
        return ASSET;
    }
}
// slither-disable-end locked-ether
