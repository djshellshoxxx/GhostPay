/**
 * Stable machine-readable failure codes. Messages are fixed strings: they never
 * embed key bytes, scalars, addresses or any caller-supplied value.
 */
export type BtcFamilyErrorCode =
  | 'INVALID_SCALAR'
  | 'INVALID_POINT'
  | 'INVALID_ADDRESS'
  | 'NETWORK_MISMATCH'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_LABEL'
  | 'RESERVED_LABEL'
  | 'INVALID_INPUT'
  | 'NO_ELIGIBLE_INPUTS'
  | 'INELIGIBLE_INPUT_TYPE'
  | 'INPUT_SUM_ZERO'
  | 'INPUT_HASH_INVALID'
  | 'TWEAK_INVALID'
  | 'DERIVED_KEY_INVALID'
  | 'GROUP_LIMIT_EXCEEDED'
  | 'INVALID_SEED'
  | 'DERIVATION_FAILED'
  | 'INVALID_AMOUNT'
  | 'INVALID_PARAMS'
  | 'CHAIN_MISMATCH'
  | 'EXPERIMENTAL_CHAIN'
  | 'RNG_UNAVAILABLE'
  | 'RNG_FAILURE'
  | 'REORG_DETECTED'
  | 'UNSUPPORTED';

const MESSAGES: Readonly<Record<BtcFamilyErrorCode, string>> = {
  INVALID_SCALAR: 'invalid secret scalar (must be 32 bytes in [1, n-1])',
  INVALID_POINT: 'invalid public key (must be a valid compressed secp256k1 point)',
  INVALID_ADDRESS: 'invalid silent payment address',
  NETWORK_MISMATCH: 'silent payment address is for a different chain or network',
  UNSUPPORTED_VERSION: 'unsupported silent payment address version',
  INVALID_LABEL: 'invalid label (must be an integer in [0, 2^32-1])',
  RESERVED_LABEL: 'label 0 is reserved for change',
  INVALID_INPUT: 'invalid input',
  NO_ELIGIBLE_INPUTS: 'transaction has no input eligible for shared secret derivation',
  INELIGIBLE_INPUT_TYPE: 'input type is not eligible for shared secret derivation on this chain',
  INPUT_SUM_ZERO: 'sum of input keys is zero / the point at infinity',
  INPUT_HASH_INVALID: 'input_hash is not a valid scalar',
  TWEAK_INVALID: 'shared secret tweak is not a valid scalar',
  DERIVED_KEY_INVALID: 'derived key is invalid',
  GROUP_LIMIT_EXCEEDED: 'more recipients share one scan key than K_max allows',
  INVALID_SEED: 'invalid seed (must be 16 to 64 bytes)',
  DERIVATION_FAILED: 'BIP-32 derivation produced an invalid key',
  INVALID_AMOUNT: 'invalid amount',
  INVALID_PARAMS: 'invalid chain parameters',
  CHAIN_MISMATCH: 'object is for another chain',
  EXPERIMENTAL_CHAIN: 'experimental, non-standardised chain parameters must not be used with mainnet funds',
  RNG_UNAVAILABLE: 'no secure random source available',
  RNG_FAILURE: 'random source failed to produce a valid scalar',
  REORG_DETECTED: 'tweak source returned inconsistent block data (possible reorg)',
  UNSUPPORTED: 'operation is not supported',
};

/** Error type thrown by every function in this package. */
export class BtcFamilyError extends Error {
  /** Machine-readable failure code. */
  public readonly code: BtcFamilyErrorCode;

  public constructor(code: BtcFamilyErrorCode) {
    super(MESSAGES[code]);
    this.name = 'BtcFamilyError';
    this.code = code;
  }
}

/** @internal */
export function fail(code: BtcFamilyErrorCode): never {
  throw new BtcFamilyError(code);
}
