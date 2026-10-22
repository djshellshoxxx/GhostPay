/** Stable machine-readable rejection codes. */
export type PaymentUriErrorCode =
  | 'INVALID_INPUT'
  | 'TOO_LONG'
  | 'INVALID_SCHEME'
  | 'INVALID_ENCODING'
  | 'INVALID_QUERY'
  | 'DUPLICATE_PARAM'
  | 'UNKNOWN_REQUIRED_PARAM'
  | 'UNSUPPORTED'
  | 'INVALID_ADDRESS'
  | 'BAD_CHECKSUM'
  | 'CHAIN_MISMATCH'
  | 'NETWORK_MISMATCH'
  | 'INVALID_CHAIN_ID'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_OVERFLOW'
  | 'UNSAFE_TEXT'
  | 'INVALID_LINK';

const MESSAGES: Readonly<Record<PaymentUriErrorCode, string>> = {
  INVALID_INPUT: 'Invalid input.',
  TOO_LONG: 'Input exceeds the size limit.',
  INVALID_SCHEME: 'Unrecognised or invalid URI scheme.',
  INVALID_ENCODING: 'Invalid percent-encoding or character set.',
  INVALID_QUERY: 'Malformed query string.',
  DUPLICATE_PARAM: 'Duplicate parameter.',
  UNKNOWN_REQUIRED_PARAM: 'Unsupported required parameter.',
  UNSUPPORTED: 'Unsupported feature.',
  INVALID_ADDRESS: 'Invalid address.',
  BAD_CHECKSUM: 'Address checksum mismatch.',
  CHAIN_MISMATCH: 'Chain does not match the expected chain.',
  NETWORK_MISMATCH: 'Network does not match the expected network.',
  INVALID_CHAIN_ID: 'Invalid chain id.',
  INVALID_AMOUNT: 'Invalid amount.',
  AMOUNT_OVERFLOW: 'Amount out of range.',
  UNSAFE_TEXT: 'Text contains disallowed characters.',
  INVALID_LINK: 'Invalid invoice link.',
};

/**
 * Typed rejection. The message is fixed per code and never contains caller data, so it is safe to log and show.
 */
export class PaymentUriError extends Error {
  readonly code: PaymentUriErrorCode;
  constructor(code: PaymentUriErrorCode) {
    super(MESSAGES[code]);
    this.name = 'PaymentUriError';
    this.code = code;
  }
}

/** Throws a {@link PaymentUriError}. */
export function fail(code: PaymentUriErrorCode): never {
  throw new PaymentUriError(code);
}
