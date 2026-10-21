/**
 * Stable machine-readable failure codes. Messages are fixed strings: they never
 * embed key bytes, scalars, addresses or any caller-supplied value.
 */
export type SolanaStealthErrorCode =
  | 'INVALID_SCALAR'
  | 'INVALID_POINT'
  | 'INVALID_META_ADDRESS'
  | 'BAD_CHECKSUM'
  | 'UNSUPPORTED_VERSION'
  | 'NETWORK_MISMATCH'
  | 'INVALID_SEED'
  | 'DERIVED_KEY_INVALID'
  | 'INVALID_ANNOUNCEMENT'
  | 'INVALID_ADDRESS'
  | 'INVALID_AMOUNT'
  | 'BELOW_RENT_EXEMPT'
  | 'INVALID_INPUT'
  | 'CHAIN_MISMATCH'
  | 'CHAIN_DISABLED'
  | 'RNG_UNAVAILABLE'
  | 'RNG_FAILURE'
  | 'TRANSPORT_FAILURE'
  | 'INVALID_RESPONSE'
  | 'RPC_ERROR'
  | 'ABORTED'
  | 'UNSUPPORTED'
  | 'SIGNER_NOT_REQUIRED'
  | 'SIGNATURE_INVALID';

const MESSAGES: Readonly<Record<SolanaStealthErrorCode, string>> = {
  INVALID_SCALAR: 'invalid ed25519 secret scalar (must be 32 LE bytes in [1, L-1])',
  INVALID_POINT: 'invalid ed25519 point (non-canonical, small-order or not in the prime-order subgroup)',
  INVALID_META_ADDRESS: 'invalid Solana stealth meta-address',
  BAD_CHECKSUM: 'meta-address checksum mismatch',
  UNSUPPORTED_VERSION: 'unsupported meta-address or announcement version',
  NETWORK_MISMATCH: 'meta-address is for a different Solana cluster',
  INVALID_SEED: 'invalid seed (must be 32 to 64 bytes)',
  DERIVED_KEY_INVALID: 'derived key or tweak is invalid',
  INVALID_ANNOUNCEMENT: 'invalid stealth announcement memo',
  INVALID_ADDRESS: 'invalid Solana address',
  INVALID_AMOUNT: 'invalid amount',
  BELOW_RENT_EXEMPT: 'SOL amount is below the rent-exempt minimum for a new account',
  INVALID_INPUT: 'invalid input',
  CHAIN_MISMATCH: 'object is for another chain',
  CHAIN_DISABLED: 'chain is disabled for this adapter',
  RNG_UNAVAILABLE: 'no secure random source available',
  RNG_FAILURE: 'random source failed to produce a valid scalar',
  TRANSPORT_FAILURE: 'RPC request failed',
  INVALID_RESPONSE: 'RPC returned an invalid response',
  RPC_ERROR: 'RPC returned an error object',
  ABORTED: 'operation aborted',
  UNSUPPORTED: 'operation is not supported',
  SIGNER_NOT_REQUIRED: 'key is not a required signer of this transaction',
  SIGNATURE_INVALID: 'produced signature failed verification',
};

/** Error type thrown by every function in this package. */
export class SolanaStealthError extends Error {
  /** Machine-readable failure code. */
  public readonly code: SolanaStealthErrorCode;

  public constructor(code: SolanaStealthErrorCode) {
    super(MESSAGES[code]);
    this.name = 'SolanaStealthError';
    this.code = code;
  }
}

/** @internal */
export function fail(code: SolanaStealthErrorCode): never {
  throw new SolanaStealthError(code);
}
