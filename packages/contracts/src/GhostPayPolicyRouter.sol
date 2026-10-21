// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IERC5564Announcer} from "./interfaces/IERC5564Announcer.sol";
import {IGhostPayPolicyRouter} from "./interfaces/IGhostPayPolicyRouter.sol";
import {PolicyAccountFactory} from "./PolicyAccountFactory.sol";

/// @title GhostPayPolicyRouter
/// @author GhostPay
/// @notice Scheme-2 checkout router: like `GhostPayRouter` it splits a payment into the fixed protocol
/// fee and a net amount and emits an ERC-5564 announcement whose metadata mirrors the transfer, but it
/// only pays policy accounts. The caller passes the account's CREATE2 `salt`
/// (`keccak256(abi.encode(owner, policyHash))`, unique per payment because `owner` is) and the router
/// requires `stealth` to be the factory's clone address for that salt; the announcement uses scheme id
/// `0x47500002` (CONTRACTS_SPEC section 4, audit 02 finding M-02). The seller-constant `policyHash`
/// never appears in calldata (round-3 audit N-01).
/// @dev Security properties:
/// - No owner, no upgrade path, no pause, no delegatecall, no arbitrary external call; configuration
///   (announcer, fee recipient, factory) is immutable. The router never keeps funds: it only forwards.
///   Anything sent to it by other means (forced ETH, direct token transfers) is unrecoverable by design.
/// - The policy binding guarantees that the paid address is a `PolicyAccount` clone slot of the
///   immutable factory and implementation, deployed or counterfactual. It does not check that the salt
///   has a meaningful pre-image (non-zero `owner`, sensible `policyHash`) or that `owner` belongs to the
///   payee: those come from the payee's scheme-2 meta-address and stealth derivation, which the
///   contract cannot see. Publishing the salt reveals nothing the address does not: it is a per-payment
///   hash whose pre-image contains the secret-until-used stealth owner.
/// - Every entry point is `nonReentrant`. Native transfers forward all remaining gas, copy no return
///   data, and are the only calls to untrusted code besides the token and the announcer; the factory's
///   implementation is read once in the constructor and the clone address is computed locally. The
///   router modifies no state of its own.
/// - ERC-20 transfers use SafeERC20 and exact balance-delta checks on the stealth address and the fee
///   recipient, which rejects fee-on-transfer and other non-standard tokens.
/// - `fee = gross * FEE_BPS / BPS` rounds down, so payments below 400 base units pay no fee. `gross`
///   above `type(uint256).max / FEE_BPS` reverts with a checked-arithmetic panic.
contract GhostPayPolicyRouter is IGhostPayPolicyRouter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Protocol fee in basis points of the gross amount.
    /// @return The fee in basis points.
    uint256 public constant FEE_BPS = 25;
    /// @notice Basis point denominator.
    /// @return The basis point denominator.
    uint256 public constant BPS = 10_000;
    /// @notice ERC-5564 scheme id used for every announcement: "GP" + 2 (policy-guarded account).
    /// @return The scheme id.
    uint256 public constant SCHEME_ID = 0x47500002;
    /// @notice Pseudo token address used in `FeeCollected` and native metadata.
    /// @return The native-asset sentinel address.
    address public constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @dev `transfer(address,uint256)` selector, metadata marker for ERC-20 payments.
    bytes4 private constant ERC20_MARKER = 0xa9059cbb;
    /// @dev Metadata marker for native payments.
    bytes4 private constant NATIVE_MARKER = 0xeeeeeeee;
    /// @dev Exact announcement metadata length: view tag (1) + selector (4) + token (20) + amount (32).
    uint256 private constant METADATA_LENGTH = 57;
    /// @dev Length of a compressed secp256k1 public key.
    uint256 private constant EPHEMERAL_KEY_LENGTH = 33;

    /// @notice The ERC-5564 announcer that receives every announcement.
    /// @return The announcer contract.
    // Upper-case immutables follow the scheme-1 router's public ABI.
    // slither-disable-next-line naming-convention
    IERC5564Announcer public immutable ANNOUNCER;
    /// @notice Recipient of every protocol fee.
    /// @return The fee recipient address.
    // Upper-case immutables follow the scheme-1 router's public ABI.
    // slither-disable-next-line naming-convention
    address public immutable FEE_RECIPIENT;
    /// @notice The `PolicyAccountFactory` whose predicted addresses are the only accepted recipients.
    /// @return The policy account factory.
    // Upper-case immutables follow the scheme-1 router's public ABI.
    // slither-disable-next-line naming-convention
    PolicyAccountFactory public immutable FACTORY;
    /// @dev `FACTORY.IMPLEMENTATION()` (immutable in the factory), cached for the CREATE2 check.
    // Upper-case like the other immutables of this contract.
    // slither-disable-next-line naming-convention
    address private immutable IMPLEMENTATION;

    /// @notice Deploys the router with immutable configuration.
    /// @param announcer The ERC-5564 announcer; must be non-zero.
    /// @param feeRecipient The fee recipient; must be non-zero and not the router itself.
    /// @param factory The policy account factory; must be non-zero and have code.
    constructor(IERC5564Announcer announcer, address feeRecipient, PolicyAccountFactory factory) {
        if (
            address(announcer) == address(0) || feeRecipient == address(0)
                || address(factory) == address(0)
        ) revert ZeroAddress();
        if (feeRecipient == address(this)) revert InvalidStealth();
        if (address(factory).code.length == 0) revert FactoryHasNoCode();
        ANNOUNCER = announcer;
        FEE_RECIPIENT = feeRecipient;
        FACTORY = factory;
        IMPLEMENTATION = factory.IMPLEMENTATION();
    }

    /// @inheritdoc IGhostPayPolicyRouter
    function payERC20(
        IERC20 token,
        address stealth,
        bytes32 salt,
        uint256 gross,
        uint256 minNet,
        uint256 deadline,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external nonReentrant {
        _checkPolicyAccount(stealth, salt);
        _payERC20(token, stealth, gross, minNet, deadline, ephemeralPubKey, metadata);
        ANNOUNCER.announce(SCHEME_ID, stealth, ephemeralPubKey, metadata);
    }

    /// @inheritdoc IGhostPayPolicyRouter
    function payERC20WithPermit(
        IERC20 token,
        address stealth,
        bytes32 salt,
        uint256 gross,
        uint256 minNet,
        uint256 deadline,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata,
        PermitSig calldata permit
    ) external nonReentrant {
        _checkPolicyAccount(stealth, salt);
        if (address(token) == address(0)) revert ZeroAddress();
        // Deadline semantics are inherent to the product; second-level validator drift is acceptable.
        // slither-disable-start timestamp
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert Expired();
        // slither-disable-end timestamp
        // A front-run permit consumes the nonce and makes this call revert; ignoring the failure is
        // safe because the transfer below reverts unless the allowance is sufficient.
        try IERC20Permit(address(token))
            .permit(msg.sender, address(this), gross, deadline, permit.v, permit.r, permit.s) {}
            catch {}
        _payERC20(token, stealth, gross, minNet, deadline, ephemeralPubKey, metadata);
        ANNOUNCER.announce(SCHEME_ID, stealth, ephemeralPubKey, metadata);
    }

    /// @inheritdoc IGhostPayPolicyRouter
    function payNative(
        address stealth,
        bytes32 salt,
        uint256 minNet,
        uint256 deadline,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external payable nonReentrant {
        _checkPolicyAccount(stealth, salt);
        (uint256 fee, uint256 net) =
            _validate(stealth, msg.value, minNet, deadline, ephemeralPubKey);
        _checkMetadata(metadata, NATIVE_MARKER, NATIVE, net);

        if (fee != 0) {
            _sendNative(FEE_RECIPIENT, fee);
            // Router is nonReentrant, so callbacks cannot reorder or fabricate this log.
            // forge-lint: disable-next-line(reentrancy-events)
            emit FeeCollected(NATIVE, fee);
        }
        _sendNative(stealth, net);
        ANNOUNCER.announce(SCHEME_ID, stealth, ephemeralPubKey, metadata);
    }

    /// @inheritdoc IGhostPayPolicyRouter
    function payERC20WithBuffer(
        IERC20 token,
        address stealth,
        bytes32 salt,
        uint256 gross,
        uint256 minNet,
        uint256 deadline,
        uint256 maxBufferWei,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external payable nonReentrant {
        _checkPolicyAccount(stealth, salt);
        if (msg.value == 0) revert BufferRequired();
        if (msg.value > maxBufferWei) revert BufferTooLarge();
        _payERC20(token, stealth, gross, minNet, deadline, ephemeralPubKey, metadata);
        _sendNative(stealth, msg.value);
        ANNOUNCER.announce(SCHEME_ID, stealth, ephemeralPubKey, metadata);
    }

    /// @notice Always reverts: the router does not accept plain native transfers.
    receive() external payable {
        revert NoDirectETH();
    }

    /// @notice Always reverts: the router has no fallback behaviour.
    fallback() external {
        revert NoDirectETH();
    }

    /// @dev Validates, then pulls `gross` of `token` from the caller: fee to the fee recipient, net to
    /// `stealth`, with exact balance-delta checks. Does not announce.
    function _payERC20(
        IERC20 token,
        address stealth,
        uint256 gross,
        uint256 minNet,
        uint256 deadline,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) private {
        if (address(token) == address(0)) revert ZeroAddress();
        (uint256 fee, uint256 net) = _validate(stealth, gross, minNet, deadline, ephemeralPubKey);
        _checkMetadata(metadata, ERC20_MARKER, address(token), net);

        _pull(token, stealth, fee, net);
    }

    /// @dev Pulls `fee` to the fee recipient and `net` to `stealth` from the caller, then verifies
    /// that the receiving balances rose by exactly those amounts.
    function _pull(IERC20 token, address stealth, uint256 fee, uint256 net) private {
        address feeRecipient = FEE_RECIPIENT;
        uint256 stealthBefore = token.balanceOf(stealth);
        uint256 feeBefore = token.balanceOf(feeRecipient);

        if (fee != 0) {
            token.safeTransferFrom(msg.sender, feeRecipient, fee);
            // Router is nonReentrant, so callbacks cannot reorder or fabricate this log.
            // forge-lint: disable-next-line(reentrancy-events)
            emit FeeCollected(address(token), fee);
        }
        token.safeTransferFrom(msg.sender, stealth, net);

        uint256 stealthAfter = token.balanceOf(stealth);
        uint256 feeAfter = token.balanceOf(feeRecipient);
        // Exact deltas are the intended check: any deviation (fee-on-transfer, rebasing) must revert.
        // forge-lint: disable-next-line(incorrect-strict-equality)
        if (stealthAfter != stealthBefore + net || feeAfter != feeBefore + fee) {
            revert UnexpectedBalanceDelta();
        }
    }

    /// @dev Requires `stealth` to be the EIP-1167 clone address of `IMPLEMENTATION` that `FACTORY`
    /// creates for `salt` (same derivation as `PolicyAccountFactory.predictAddress`).
    /// Runs first in every entry point, so an unrelated address is rejected before any other check or
    /// external call to the token.
    function _checkPolicyAccount(address stealth, bytes32 salt) private view {
        address expected =
            Clones.predictDeterministicAddress(IMPLEMENTATION, salt, address(FACTORY));
        if (stealth != expected) revert NotPolicyAccount(expected);
    }

    /// @dev Common checks (deadline, stealth, amount, slippage, ephemeral key). Returns the
    /// floor-rounded fee and the net amount.
    function _validate(
        address stealth,
        uint256 gross,
        uint256 minNet,
        uint256 deadline,
        bytes calldata ephemeralPubKey
    ) private view returns (uint256 fee, uint256 net) {
        // Deadline semantics are inherent to the product; second-level validator drift is acceptable.
        // slither-disable-start timestamp
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert Expired();
        // slither-disable-end timestamp
        if (stealth == address(0) || stealth == address(this) || stealth == FEE_RECIPIENT) {
            revert InvalidStealth();
        }
        if (gross == 0) revert ZeroAmount();
        fee = gross * FEE_BPS / BPS;
        // fee < gross for every gross > 0 (25/10_000 < 1), so net > 0 is guaranteed here.
        net = gross - fee;
        if (net < minNet) revert SlippageExceeded();
        if (
            ephemeralPubKey.length != EPHEMERAL_KEY_LENGTH
                || (ephemeralPubKey[0] != 0x02 && ephemeralPubKey[0] != 0x03)
        ) revert InvalidEphemeralKey();
    }

    /// @dev Requires `metadata == viewTag || marker || asset || net` (57 bytes). The view tag is free.
    function _checkMetadata(bytes calldata metadata, bytes4 marker, address asset, uint256 net)
        private
        pure
    {
        if (
            metadata.length != METADATA_LENGTH || bytes4(metadata[1:5]) != marker
                || address(bytes20(metadata[5:25])) != asset
                || uint256(bytes32(metadata[25:57])) != net
        ) revert InvalidMetadata();
    }

    /// @dev Sends `amount` of the native asset with all remaining gas; reverts on failure. The call is
    /// written in assembly so that no return data is copied to memory: a payee that returns a huge
    /// buffer (return-data bomb) cannot inflate the payer's gas cost.
    function _sendNative(address to, uint256 amount) private {
        bool ok;
        // Destination is validated by every caller (factory-predicted account) or immutable.
        // Assembly is required to skip the return-data copy (audit 02, L-01).
        // slither-disable-start assembly
        // forge-lint: disable-next-line(arbitrary-send-eth)
        assembly ("memory-safe") {
            ok := call(gas(), to, amount, 0, 0, 0, 0)
        }
        // slither-disable-end assembly
        if (!ok) revert NativeTransferFailed();
    }
}
