/**
 * Stable machine-readable failure codes. Messages derived from these codes are
 * fixed strings: they never embed key bytes, scalars, announcement contents or
 * any caller-supplied value.
 */
export type CryptoErrorCode =
  | 'INVALID_SCALAR'
  | 'INVALID_POINT'
  | 'INVALID_META_ADDRESS'
  | 'INVALID_ANNOUNCEMENT'
  | 'INVALID_ADDRESS'
  | 'INVALID_METADATA'
  | 'INVALID_VIEW_TAG'
  | 'INVALID_AMOUNT'
  | 'ZERO_HASH'
  | 'INFINITY_POINT'
  | 'ZERO_STEALTH_KEY'
  | 'VIEW_TAG_MISMATCH'
  | 'ADDRESS_MISMATCH'
  | 'KEY_REUSE'
  | 'RNG_UNAVAILABLE'
  | 'RNG_FAILURE';

const MESSAGES: Readonly<Record<CryptoErrorCode, string>> = {
  INVALID_SCALAR: 'invalid secret scalar (must be 32 bytes in [1, n-1])',
  INVALID_POINT: 'invalid public key (must be a valid compressed secp256k1 point)',
  INVALID_META_ADDRESS: 'invalid stealth meta-address',
  INVALID_ANNOUNCEMENT: 'invalid announcement',
  INVALID_ADDRESS: 'invalid address',
  INVALID_METADATA: 'invalid metadata',
  INVALID_VIEW_TAG: 'invalid view tag (must be one byte)',
  INVALID_AMOUNT: 'invalid amount (must be in [1, 2^256-1])',
  ZERO_HASH: 'shared-secret hash reduced to zero',
  INFINITY_POINT: 'derived point is the point at infinity',
  ZERO_STEALTH_KEY: 'derived stealth key is zero',
  VIEW_TAG_MISMATCH: 'announcement view tag does not match',
  ADDRESS_MISMATCH: 'derived key does not map to the announced address',
  KEY_REUSE: 'spending and viewing keys must be distinct',
  RNG_UNAVAILABLE: 'no secure random source available',
  RNG_FAILURE: 'random source failed to produce a valid scalar',
};

/** Error type thrown by every function in this package. */
export class GhostPayCryptoError extends Error {
  /** Machine-readable failure code. */
  public readonly code: CryptoErrorCode;

  public constructor(code: CryptoErrorCode) {
    super(MESSAGES[code]);
    this.name = 'GhostPayCryptoError';
    this.code = code;
  }
}

/** @internal */
export function fail(code: CryptoErrorCode): never {
  throw new GhostPayCryptoError(code);
}
