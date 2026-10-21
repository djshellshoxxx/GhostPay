// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC5564Announcer} from "./interfaces/IERC5564Announcer.sol";
import {TestnetOnly} from "./TestnetOnly.sol";

/// @title GhostPayConfidentialRouter
/// @notice CT-1 checkout router: moves an ERC-7984 confidential token from a payer to a stealth
/// address with the amount, the 25 bps fee and the stealth balance all encrypted (Zama fhEVM),
/// and announces the payment through ERC-5564 with the encrypted-amount HANDLE in the metadata.
/// @dev Spec: `docs/remote/privacy-specs/confidential-tokens.md` section 6.1. No owner, admin, pause,
/// upgrade path, `delegatecall` or arbitrary external call. TESTNET ONLY (chain ids 31337 and
/// 11155111; constructor reverts elsewhere).
///
/// What is hidden: gross, fee and net amounts (on-chain they are 32-byte handles).
/// What is NOT hidden: payer, stealth address, token, router use, time, the ERC-5564 announcement,
/// and the plaintext ETH gas buffer. The payer, the stealth owner and (after `flushFees`) the fee
/// recipient can decrypt the handles they are ACL-allowed on. See the spec's section 2.
///
/// Fee: `fee = floor(t / 400)` and `net = t - fee` where `t` is the amount the token actually
/// moved. This equals the plaintext router's `floor(t * 25 / 10000)`. Fees stay in the router's
/// encrypted balance and are flushed to `FEE_RECIPIENT` only after a full `FEE_EPOCH` has elapsed since the first unflushed payment so the
/// recipient never gets decrypt rights on a single payment's fee (spec 6.3); it only receives the
/// sum of the fees of at least one full epoch.
/// @custom:security Deviations from the spec (documented in DEVIATIONS.md): (1) the set of accepted
/// tokens is fixed at construction, because a caller-chosen token would receive transient ACL
/// rights on router-computed handles; (2) the fee epoch of a token starts at the first payment
/// after the previous flush (`epochStart`), not at the previous flush, so a payment after an idle
/// period can never be flushed on its own; (3) `flushFees` with no unflushed payment reverts
/// `FlushTooEarly`.
contract GhostPayConfidentialRouter is TestnetOnly, ZamaEthereumConfig, ReentrancyGuard {
    /// @notice The fee is `amount / FEE_DIVISOR`: 25 bps exactly (`floor(x*25/10000) == floor(x/400)`).
    uint64 public constant FEE_DIVISOR = 400;
    /// @notice Minimum time between two `flushFees` calls for the same token.
    uint256 public constant FEE_EPOCH = 7 days;
    /// @notice Selector of `confidentialTransfer(address,bytes32)`: metadata marker for confidential payments.
    bytes4 public constant CT_SELECTOR = 0x5bebed7e;
    /// @notice ERC-5564 scheme id used for every announcement (secp256k1 with view tags).
    uint256 public constant SCHEME_ID = 1;
    /// @notice Maximum number of tokens that can be accepted by one router.
    uint256 public constant MAX_TOKENS = 8;

    /// @dev Exact metadata length: view tag (1) + selector (4) + token (20) + net handle (32).
    uint256 private constant METADATA_LENGTH = 57;
    /// @dev Length of a compressed secp256k1 public key.
    uint256 private constant EPHEMERAL_KEY_LENGTH = 33;

    /// @notice The ERC-5564 announcer that receives every announcement.
    IERC5564Announcer public immutable ANNOUNCER;
    /// @notice Recipient of the aggregated fees.
    address public immutable FEE_RECIPIENT;

    /// @notice Whether `token` is accepted by this router (fixed at construction).
    mapping(address token => bool) public isTokenAllowed;
    /// @notice Start of the current fee epoch for `token`: the time of the first payment since the last
    /// flush (0 when no unflushed payment exists). `flushFees` needs `FEE_EPOCH` to have elapsed since it.
    mapping(address token => uint256) public epochStart;

    /// @notice A confidential payment was made. Carries no payer, stealth or amount.
    /// @param token The confidential token used.
    /// @param netHandle Handle of the encrypted net amount sent to the stealth address.
    event ConfidentialPayment(address indexed token, euint64 netHandle);
    /// @notice Aggregated fees were sent to `FEE_RECIPIENT`.
    /// @param token The confidential token flushed.
    /// @param feeHandle Handle of the encrypted flushed fee sum.
    event FeesFlushed(address indexed token, euint64 feeHandle);

    /// @notice A required address argument was zero.
    error ZeroAddress();
    /// @notice The stealth address is zero, this router or the fee recipient.
    error InvalidStealth();
    /// @notice `block.timestamp` is after the payment deadline.
    error Expired();
    /// @notice The ephemeral public key is not a 33-byte compressed key.
    error InvalidEphemeralKey();
    /// @notice `msg.value` exceeds `maxBufferWei`.
    error BufferTooLarge();
    /// @notice The payer has not set this router as an unexpired operator on the token.
    error NotOperator();
    /// @notice A flush was attempted before `FEE_EPOCH` elapsed.
    error FlushTooEarly();
    /// @notice Forwarding the ETH buffer to the stealth address failed.
    error NativeTransferFailed();
    /// @notice Plain ETH transfers and unknown calls are rejected.
    error NoDirectETH();
    /// @notice The token is not in this router's accepted set.
    error TokenNotAllowed();
    /// @notice The accepted-token list is empty, too long or contains a duplicate.
    error InvalidTokenList();

    /// @notice Deploys the router with immutable configuration.
    /// @param announcer The ERC-5564 announcer; non-zero.
    /// @param feeRecipient The fee recipient; non-zero and not this contract.
    /// @param tokens Accepted ERC-7984 tokens: 1 to `MAX_TOKENS` distinct non-zero addresses.
    constructor(IERC5564Announcer announcer, address feeRecipient, IERC7984[] memory tokens) {
        if (address(announcer) == address(0) || feeRecipient == address(0)) revert ZeroAddress();
        if (feeRecipient == address(this)) revert InvalidStealth();
        uint256 n = tokens.length;
        if (n == 0 || n > MAX_TOKENS) revert InvalidTokenList();
        for (uint256 i = 0; i < n; ++i) {
            address t = address(tokens[i]);
            if (t == address(0)) revert ZeroAddress();
            if (isTokenAllowed[t]) revert InvalidTokenList();
            isTokenAllowed[t] = true;
        }
        ANNOUNCER = announcer;
        FEE_RECIPIENT = feeRecipient;
    }

    /// @notice Pays `encGross` of confidential `token` from the caller to `stealth`, minus the fee.
    /// @dev The caller must have called `token.setOperator(router, until)` first. If the caller's
    /// confidential balance is below the amount, the token transfers 0 and this call still succeeds
    /// (silent zero transfer, spec section 2 item 7): the seller must decrypt to confirm receipt.
    /// @param token Accepted confidential token.
    /// @param stealth One-time stealth address of the seller.
    /// @param encGross Encrypted gross amount (input bound to this router and the caller).
    /// @param inputProof Zero-knowledge proof of knowledge for `encGross`.
    /// @param deadline Latest valid `block.timestamp`.
    /// @param maxBufferWei Maximum ETH the payer accepts to forward to `stealth`.
    /// @param ephemeralPubKey 33-byte compressed ephemeral key (prefix 02/03).
    /// @param viewTag ERC-5564 view tag byte.
    /// @return netSent Handle of the encrypted amount delivered to `stealth` (also in the metadata).
    function payConfidential(
        IERC7984 token,
        address stealth,
        externalEuint64 encGross,
        bytes calldata inputProof,
        uint256 deadline,
        uint256 maxBufferWei,
        bytes calldata ephemeralPubKey,
        bytes1 viewTag
    ) external payable nonReentrant returns (euint64 netSent) {
        _validate(token, stealth, deadline, maxBufferWei, ephemeralPubKey);

        netSent = _move(token, stealth, encGross, inputProof);

        if (epochStart[address(token)] == 0) epochStart[address(token)] = block.timestamp;

        if (msg.value != 0) {
            // `stealth` is non-zero (checked in `_validate`); the call target is the payer-chosen stealth address.
            // slither-disable-next-line low-level-calls,missing-zero-check
            (bool ok,) = stealth.call{value: msg.value}("");
            if (!ok) revert NativeTransferFailed();
        }

        bytes memory metadata =
            abi.encodePacked(viewTag, CT_SELECTOR, address(token), euint64.unwrap(netSent));
        assert(metadata.length == METADATA_LENGTH);
        ANNOUNCER.announce(SCHEME_ID, stealth, ephemeralPubKey, metadata);
        emit ConfidentialPayment(address(token), netSent);
    }

    /// @notice Sends the router's entire encrypted fee balance of `token` to `FEE_RECIPIENT`.
    /// @dev Callable by anyone. The epoch of a token starts at the first payment after the previous
    /// flush; flushing is allowed `FEE_EPOCH` later, and reverts `FlushTooEarly` before that or when
    /// no payment is pending.
    /// @param token Accepted confidential token.
    function flushFees(IERC7984 token) external nonReentrant {
        if (!isTokenAllowed[address(token)]) revert TokenNotAllowed();
        uint256 start = epochStart[address(token)];
        if (start == 0 || block.timestamp < start + FEE_EPOCH) revert FlushTooEarly();

        epochStart[address(token)] = 0;
        // Once `epochStart != 0` a payment has credited the router, so its balance handle is
        // initialised and the router (as recipient of `confidentialTransferFrom`) is ACL-allowed on it.
        euint64 sent =
            token.confidentialTransfer(FEE_RECIPIENT, token.confidentialBalanceOf(address(this)));
        emit FeesFlushed(address(token), sent);
    }

    /// @notice Always reverts: the router does not accept ETH outside `payConfidential`.
    receive() external payable {
        revert NoDirectETH();
    }

    /// @notice Always reverts: the router has no fallback behaviour.
    fallback() external payable {
        revert NoDirectETH();
    }

    /// @dev Pulls the gross amount from the payer, splits the fee and pays the net to `stealth`.
    /// Returns the handle the token produced for the `router -> stealth` transfer.
    function _move(
        IERC7984 token,
        address stealth,
        externalEuint64 encGross,
        bytes calldata inputProof
    ) private returns (euint64 netSent) {
        euint64 gross = FHE.fromExternal(encGross, inputProof);
        // slither-disable-next-line unused-return
        FHE.allowTransient(gross, address(token));
        // `t` is what the token really moved (0 if the payer lacked balance); router is allowed on it.
        euint64 t = token.confidentialTransferFrom(msg.sender, address(this), gross);

        euint64 fee = FHE.div(t, FEE_DIVISOR);
        euint64 net = FHE.sub(t, fee);
        // slither-disable-next-line unused-return
        FHE.allowTransient(net, address(token));

        netSent = token.confidentialTransfer(stealth, net);
        // slither-disable-next-line unused-return
        FHE.allow(netSent, msg.sender);
    }

    /// @dev Checks that do not touch FHE state. Order follows spec 6.1 step 1.
    function _validate(
        IERC7984 token,
        address stealth,
        uint256 deadline,
        uint256 maxBufferWei,
        bytes calldata ephemeralPubKey
    ) private view {
        if (block.timestamp > deadline) revert Expired();
        if (stealth == address(0) || stealth == address(this) || stealth == FEE_RECIPIENT) {
            revert InvalidStealth();
        }
        if (
            ephemeralPubKey.length != EPHEMERAL_KEY_LENGTH
                || (ephemeralPubKey[0] != 0x02 && ephemeralPubKey[0] != 0x03)
        ) revert InvalidEphemeralKey();
        if (msg.value > maxBufferWei) revert BufferTooLarge();
        if (!isTokenAllowed[address(token)]) revert TokenNotAllowed();
        if (!token.isOperator(msg.sender, address(this))) revert NotOperator();
    }
}
