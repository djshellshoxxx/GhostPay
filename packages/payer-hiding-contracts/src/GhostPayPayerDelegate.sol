// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {ChainGuard} from "./ChainGuard.sol";
import {RouterCall} from "./RouterCall.sol";
import {IGhostPayPayerDelegate} from "./interfaces/IGhostPayPayerDelegate.sol";

/// @title GhostPayPayerDelegate
/// @author GhostPay
/// @notice Payer-hiding mode PH-3. Code that a fresh payer EOA delegates to via EIP-7702 so that a
/// sponsor can submit the payer's signed payment order and pay the gas. Executing as the payer, it
/// approves the router, calls it (the router's `msg.sender` is the payer EOA), clears the approval and
/// reimburses the sponsor in tokens.
/// @dev Security properties:
/// - Single purpose: no generic `execute`, no `delegatecall`, no initializer (nothing to front-run,
///   EIP-7702 "front running initialization"), no owner, no upgrade path.
/// - The only authority is an EIP-712 signature that recovers (OpenZeppelin `ECDSA`, low-s only) to
///   `address(this)`, i.e. the delegating EOA. Called directly on the implementation address,
///   `address(this)` is a contract with no private key, so no signature can verify and no funds can move.
/// - The signature binds router, token, stealth, gross, sponsorFee, sponsorFeeTo, deadline, nonce and
///   payloadHash plus chain id and the payer address (EIP-712 `verifyingContract == address(this)`).
///   A signature for one payer or chain does not verify for another.
/// - Router calldata must hash to `payloadHash`, start with a `payERC20` selector of either router and
///   carry the signed token, stealth and gross.
/// - Nonces live in ERC-7201 namespaced storage `ghostpay.payerdelegate.v1` so they cannot collide with
///   the storage of any other delegate the EOA used before or uses after. They persist across
///   re-delegation. The reentrancy lock is transient storage (no persistent slot is touched).
/// - The payer's token balance must fall by exactly `gross + sponsorFee`; the router allowance is
///   reset to zero and verified to be zero afterwards.
/// - The delegation persists on the payer address after the payment (`0xef0100 || delegate`): a public
///   fingerprint. The payer is NOT hidden from a chain analyst.
/// - A payer that stays delegated is exposed to any future bug in this code; fresh one-shot payers
///   should be abandoned or cleared with a zero-address authorisation.
/// - No `address(this).code`/`tx.origin` assumptions. Self-sponsored use works but gains nothing.
contract GhostPayPayerDelegate is
    IGhostPayPayerDelegate,
    EIP712,
    ReentrancyGuardTransient,
    ChainGuard
{
    using SafeERC20 for IERC20;

    /// @notice EIP-712 type hash of {PayIntent}.
    /// @return The type hash.
    bytes32 public constant PAYINTENT_TYPEHASH = keccak256(
        "PayIntent(address router,address token,address stealth,uint256 gross,uint256 sponsorFee,address sponsorFeeTo,uint256 deadline,uint256 nonce,bytes32 payloadHash)"
    );

    /// @notice ERC-7201 namespace id of the delegate's storage.
    /// @return The namespace string.
    string public constant STORAGE_NAMESPACE = "ghostpay.payerdelegate.v1";

    /// @dev `keccak256(abi.encode(uint256(keccak256("ghostpay.payerdelegate.v1")) - 1)) & ~bytes32(uint256(0xff))`.
    bytes32 private constant STORAGE_LOCATION =
        0x9d7004d76ef74d3509a2cdf67cbe2bd89f87221dc0c90abd32b14484e11e6200;

    /// @custom:storage-location erc7201:ghostpay.payerdelegate.v1
    struct Layout {
        mapping(uint256 wordIndex => uint256 bitmap) nonceBitmap;
    }

    /// @notice Deploys the delegate implementation; EIP-712 domain is name "GhostPayPayerDelegate",
    /// version "1". Reverts on any chain other than 31337, 11155111 and 84532.
    constructor() EIP712("GhostPayPayerDelegate", "1") ChainGuard() {}

    /// @notice Accept plain ETH so that a delegated EOA can still receive native token.
    receive() external payable {}

    /// @inheritdoc IGhostPayPayerDelegate
    function pay(PayIntent calldata i, bytes calldata routerCalldata, bytes calldata sig)
        external
        nonReentrant
    {
        _authorize(i, routerCalldata, sig);
        _execute(i, routerCalldata);
        // The delegate is nonReentrant, so callbacks cannot reorder or fabricate this log.
        // forge-lint: disable-next-line(reentrancy-events)
        emit Paid(i.token, i.gross, i.sponsorFee);
    }

    /// @inheritdoc IGhostPayPayerDelegate
    function nonceUsed(uint256 nonce) external view returns (bool used) {
        return _layout().nonceBitmap[nonce >> 8] & (1 << (nonce & 0xff)) != 0;
    }

    /// @inheritdoc IGhostPayPayerDelegate
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @dev Checks deadline, addresses, amounts, payload binding, nonce and signature; consumes the nonce.
    function _authorize(PayIntent calldata i, bytes calldata routerCalldata, bytes calldata sig)
        private
    {
        // Deadline semantics are inherent to the product; second-level validator drift is acceptable.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > i.deadline) revert Expired();
        if (
            i.router == address(0) || i.token == address(0) || i.router == address(this)
                || i.token == address(this)
        ) revert ZeroAddress();
        if (i.sponsorFee != 0 && (i.sponsorFeeTo == address(0) || i.sponsorFeeTo == address(this)))
        {
            revert ZeroAddress();
        }
        if (i.gross == 0 || i.gross > type(uint256).max - i.sponsorFee) revert InvalidAmount();
        if (
            keccak256(routerCalldata) != i.payloadHash
                || !RouterCall.matches(routerCalldata, i.token, i.stealth, i.gross)
        ) revert PayloadMismatch();

        Layout storage l = _layout();
        uint256 word = i.nonce >> 8;
        uint256 bit = 1 << (i.nonce & 0xff);
        if (l.nonceBitmap[word] & bit != 0) revert NonceUsed();

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(PAYINTENT_TYPEHASH, i)));
        // The third return value (error argument) is only needed for custom revert data; unused on purpose.
        // slither-disable-next-line unused-return
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
        if (err != ECDSA.RecoverError.NoError || signer != address(this)) revert BadSignature();

        l.nonceBitmap[word] |= bit;
    }

    /// @dev Approve, call the router, verify and clear the allowance, pay the sponsor, verify the debit.
    function _execute(PayIntent calldata i, bytes calldata routerCalldata) private {
        IERC20 token = IERC20(i.token);
        uint256 before = token.balanceOf(address(this));
        token.forceApprove(i.router, i.gross);
        _callRouter(i.router, routerCalldata);
        // forge-lint: disable-next-line(incorrect-strict-equality)
        if (token.allowance(address(this), i.router) != 0) revert ResidualAllowance();
        if (i.sponsorFee != 0) token.safeTransfer(i.sponsorFeeTo, i.sponsorFee);
        uint256 afterBal = token.balanceOf(address(this));
        // Exact delta is the intended check: fee-on-transfer and rebasing tokens must revert.
        // forge-lint: disable-next-line(incorrect-strict-equality)
        if (afterBal > before || before - afterBal != i.gross + i.sponsorFee) {
            revert UnexpectedBalanceDelta();
        }
    }

    function _layout() private pure returns (Layout storage l) {
        bytes32 slot = STORAGE_LOCATION;
        // The namespaced slot is a compile-time constant (ERC-7201).
        assembly ("memory-safe") {
            l.slot := slot
        }
    }

    /// @dev The single call to a payer-named target. Return data is not copied (no return-data bomb).
    function _callRouter(address router, bytes calldata data) private {
        bool ok;
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            calldatacopy(ptr, data.offset, data.length)
            ok := call(gas(), router, 0, ptr, data.length, 0, 0)
        }
        if (!ok) revert RouterCallFailed();
    }
}
