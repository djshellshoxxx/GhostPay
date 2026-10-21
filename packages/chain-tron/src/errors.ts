/** Stable machine-readable failure codes for `@ghostpay/chain-tron`. */
export type TronErrorCode =
  | 'INVALID_ADDRESS'
  | 'INVALID_CHECKSUM'
  | 'INVALID_PREFIX'
  | 'INVALID_LENGTH'
  | 'INVALID_PUBLIC_KEY'
  | 'INVALID_AMOUNT'
  | 'INVALID_FEE_LIMIT'
  | 'INVALID_CALL_VALUE'
  | 'INVALID_ABI_DATA'
  | 'INVALID_INPUT';

const MESSAGES: Readonly<Record<TronErrorCode, string>> = {
  INVALID_ADDRESS: 'invalid Tron address',
  INVALID_CHECKSUM: 'invalid Tron address checksum',
  INVALID_PREFIX: 'invalid Tron address prefix (expected 0x41)',
  INVALID_LENGTH: 'invalid Tron address length',
  INVALID_PUBLIC_KEY: 'invalid secp256k1 public key',
  INVALID_AMOUNT: 'invalid amount (must be in [1, 2^256-1])',
  INVALID_FEE_LIMIT: 'invalid fee_limit (sun out of bounds)',
  INVALID_CALL_VALUE: 'invalid call_value (sun out of bounds)',
  INVALID_ABI_DATA: 'invalid ABI-encoded data',
  INVALID_INPUT: 'invalid input',
};

/**
 * Error thrown by every function in this package.
 *
 * @security Messages are fixed strings and never embed caller-supplied values
 * (addresses, keys, amounts) so they are safe to log.
 */
export class TronError extends Error {
  /** Machine-readable failure code. */
  public readonly code: TronErrorCode;

  public constructor(code: TronErrorCode) {
    super(MESSAGES[code]);
    this.name = 'TronError';
    this.code = code;
  }
}

/** @internal */
export function fail(code: TronErrorCode): never {
  throw new TronError(code);
}
