import { parseAbi } from 'viem';

/** ABI of `GhostPayConfidentialRouter` (packages/confidential-contracts). `euint64` / `externalEuint64` are `bytes32` on the wire. */
export const ROUTER_ABI = parseAbi([
  'function payConfidential(address token, address stealth, bytes32 encGross, bytes inputProof, uint256 deadline, uint256 maxBufferWei, bytes ephemeralPubKey, bytes1 viewTag) payable returns (bytes32 netSent)',
  'function flushFees(address token)',
  'event ConfidentialPayment(address indexed token, bytes32 netHandle)',
  'event FeesFlushed(address indexed token, bytes32 feeHandle)',
]);

/** Subset of the OpenZeppelin `ERC7984` / `ERC7984ERC20Wrapper` ABI used by GhostPay. */
export const TOKEN_ABI = parseAbi([
  'function setOperator(address operator, uint48 until)',
  'function isOperator(address holder, address spender) view returns (bool)',
  'function confidentialBalanceOf(address account) view returns (bytes32)',
  'function confidentialTransfer(address to, bytes32 amount) returns (bytes32)',
  'function wrap(address to, uint256 amount) returns (bytes32)',
  'function unwrap(address from, address to, bytes32 amount) returns (bytes32)',
  'function finalizeUnwrap(bytes32 unwrapRequestId, uint64 unwrapAmountCleartext, bytes decryptionProof)',
  'event ConfidentialTransfer(address indexed from, address indexed to, bytes32 indexed amount)',
  'event OperatorSet(address indexed holder, address indexed operator, uint48 until)',
  'event UnwrapRequested(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 amount)',
]);

/** Selector of `confidentialTransfer(address,bytes32)`: first metadata marker of a confidential payment (GhostPay convention). */
export const CT_SELECTOR = '0x5bebed7e' as const;
/** Exact length of the announcement metadata: view tag + selector + token + handle. */
export const METADATA_LENGTH = 57;
/** Fee divisor of the router: fee = amount / 400 (25 bps). */
export const FEE_DIVISOR = 400n;
/** Largest amount an `euint64` can hold. */
export const UINT64_MAX = (1n << 64n) - 1n;
/** Maximum operator window the client allows (CT-PAY-2). */
export const MAX_OPERATOR_WINDOW_SECONDS = 900;
