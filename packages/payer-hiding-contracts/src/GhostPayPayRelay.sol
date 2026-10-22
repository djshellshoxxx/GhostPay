// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ChainGuard} from "./ChainGuard.sol";
import {RouterCall} from "./RouterCall.sol";
import {IGhostPayPayRelay} from "./interfaces/IGhostPayPayRelay.sol";

/// @title GhostPayPayRelay
/// @author GhostPay
/// @notice Payer-hiding mode PH-2. A sponsor submits a payer-signed order; the relay pulls the payer's
/// tokens (ERC-2612 permit or pre-granted allowance), pays a GhostPay router and reimburses the
/// sponsor in tokens. The payer needs no native token. The router sees the relay as `msg.sender`.
/// @dev Security properties:
/// - No owner, no upgrade path, no pause, no `delegatecall`. The only external calls are: the token
///   (`permit`, `transferFrom`, `approve`, `transfer`, `balanceOf`, `allowance`), an ERC-1271 static call
///   to the payer, and ONE low-level call to the payer-named router with calldata that must hash to the
///   signed `payloadHash`, start with one of two `payERC20` selectors and carry the signed token, stealth
///   and gross.
/// - The signature binds payer, router, token, stealth, gross, sponsorFee, sponsorFeeTo, deadline,
///   nonce and payloadHash plus chain id and this contract's address (EIP-712 domain). The submitter
///   cannot change any of them.
/// - The nonce is consumed before any state-changing external call. Nonces are unordered (bitmap).
/// - A front-run `permit` cannot block the payment: it is attempted in try/catch and the transfer
///   reverts unless the allowance is sufficient.
/// - Balance accounting is by delta against the balance at entry, so tokens donated to the relay cannot
///   block payments; they are unrecoverable (there is no sweep function by design).
/// - Exact deltas reject fee-on-transfer and rebasing tokens. DAI-style permit is not supported.
/// - Known residual: the payer address is the `from` of `Transfer(payer -> relay)` in the same
///   transaction. This contract hides nothing from a chain analyst; it removes the native-gas
///   funding link and changes the seller's casual view only.
/// - Native-token payments are not supported.
contract GhostPayPayRelay is IGhostPayPayRelay, EIP712, ReentrancyGuard, ChainGuard {
    using SafeERC20 for IERC20;

    /// @notice EIP-712 type hash of {PayIntent}.
    /// @return The type hash.
    bytes32 public constant PAYINTENT_TYPEHASH = keccak256(
        "PayIntent(address payer,address router,address token,address stealth,uint256 gross,uint256 sponsorFee,address sponsorFeeTo,uint256 deadline,uint256 nonce,bytes32 payloadHash)"
    );

    /// @dev payer => word index (`nonce >> 8`) => bitmap of used nonces in that word.
    mapping(address payer => mapping(uint256 wordIndex => uint256 bitmap)) private _nonceBitmap;

    /// @notice Deploys the relay; EIP-712 domain is name "GhostPayPayRelay", version "1". Reverts on
    /// any chain other than 31337, 11155111 and 84532.
    constructor() EIP712("GhostPayPayRelay", "1") ChainGuard() {}

    /// @inheritdoc IGhostPayPayRelay
    function pay(
        PayIntent calldata i,
        bytes calldata routerCalldata,
        bytes calldata sig,
        PermitSig calldata permit
    ) external nonReentrant {
        _validate(i, routerCalldata, sig);
        _consumeNonce(i.payer, i.nonce);

        IERC20 token = IERC20(i.token);
        uint256 total = i.gross + i.sponsorFee;

        if (permit.deadline != 0) {
            if (permit.value < total) revert InvalidAmount();
            // A front-run permit consumes the payer's permit nonce and would make this call revert;
            // ignoring the failure is safe because the transfer reverts unless the allowance suffices.
            try IERC20Permit(i.token)
                .permit(
                    i.payer,
                    address(this),
                    permit.value,
                    permit.deadline,
                    permit.v,
                    permit.r,
                    permit.s
                ) {}
                catch {}
        }

        uint256 before = token.balanceOf(address(this));
        // `i.payer` authorised exactly this order by signature (EOA or ERC-1271) and by allowance.
        // forge-lint: disable-next-line(arbitrary-send-erc20)
        token.safeTransferFrom(i.payer, address(this), total);
        // Exact delta is the intended check: fee-on-transfer and rebasing tokens must revert.
        // forge-lint: disable-next-line(incorrect-strict-equality)
        if (token.balanceOf(address(this)) != before + total) revert UnexpectedBalanceDelta();

        token.forceApprove(i.router, i.gross);
        _callRouter(i.router, routerCalldata);
        // forge-lint: disable-next-line(incorrect-strict-equality)
        if (token.allowance(address(this), i.router) != 0) revert ResidualAllowance();
        // forge-lint: disable-next-line(incorrect-strict-equality)
        if (token.balanceOf(address(this)) != before + i.sponsorFee) {
            revert UnexpectedBalanceDelta();
        }

        if (i.sponsorFee != 0) token.safeTransfer(i.sponsorFeeTo, i.sponsorFee);
        // forge-lint: disable-next-line(incorrect-strict-equality)
        if (token.balanceOf(address(this)) != before) revert UnexpectedBalanceDelta();

        // The relay is nonReentrant, so callbacks cannot reorder or fabricate this log.
        // forge-lint: disable-next-line(reentrancy-events)
        emit Paid(i.token, i.router, i.gross, i.sponsorFee);
    }

    /// @inheritdoc IGhostPayPayRelay
    function nonceUsed(address payer, uint256 nonce) external view returns (bool used) {
        return _nonceBitmap[payer][nonce >> 8] & (1 << (nonce & 0xff)) != 0;
    }

    /// @inheritdoc IGhostPayPayRelay
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @dev Pure/view checks: deadline, addresses, amounts, payload binding, nonce, signature.
    function _validate(PayIntent calldata i, bytes calldata routerCalldata, bytes calldata sig)
        private
        view
    {
        // Deadline semantics are inherent to the product; second-level validator drift is acceptable.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > i.deadline) revert Expired();
        if (
            i.payer == address(0) || i.router == address(0) || i.token == address(0)
                || i.router == address(this) || i.token == address(this)
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
        if (_isUsed(i.payer, i.nonce)) revert NonceUsed();

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(PAYINTENT_TYPEHASH, i)));
        if (!SignatureChecker.isValidSignatureNow(i.payer, digest, sig)) revert BadSignature();
    }

    function _isUsed(address payer, uint256 nonce) private view returns (bool) {
        return _nonceBitmap[payer][nonce >> 8] & (1 << (nonce & 0xff)) != 0;
    }

    function _consumeNonce(address payer, uint256 nonce) private {
        _nonceBitmap[payer][nonce >> 8] |= (1 << (nonce & 0xff));
    }

    /// @dev The single call to a payer-named target. Return data is not copied (no return-data bomb).
    function _callRouter(address router, bytes calldata data) private {
        bool ok;
        // The target is bound by the payer's signature and the calldata by `payloadHash`.
        // forge-lint: disable-next-line(unchecked-call)
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            calldatacopy(ptr, data.offset, data.length)
            ok := call(gas(), router, 0, ptr, data.length, 0, 0)
        }
        if (!ok) revert RouterCallFailed();
    }
}
