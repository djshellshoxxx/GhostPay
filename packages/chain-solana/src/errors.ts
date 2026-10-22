/**
 * Stable machine-readable failure codes. Messages are fixed strings: they never
 * embed key bytes, scalars, announcement contents or any caller-supplied value.
 */
export type SolanaStealthErrorCode =
  | 'INVALID_SCALAR'
  | 'INVALID_POINT'
  | 'INVALID_META_ADDRESS'
  | 'INVALID_ANNOUNCEMENT'
  | 'INVALID_ADDRESS'
  | 'INVALID_SEEDS'
  | 'NO_VIABLE_BUMP'
  | 'ZERO_HASH'
  | 'IDENTITY_POINT'
  | 'ZERO_STEALTH_KEY'
  | 'KEY_REUSE'
  | 'KEY_MISMATCH'
  | 'CHAIN_DISABLED'
  | 'INVALID_INVOICE'
  | 'ABORTED'
  | 'RNG_UNAVAILABLE'
  | 'RNG_FAILURE';

const MESSAGES: Readonly<Record<SolanaStealthErrorCode, string>> = {
  INVALID_SCALAR: 'invalid secret scalar (must be 32 little-endian bytes in [1, L-1])',
  INVALID_POINT: 'invalid public key (must be a canonical, prime-order ed25519 point)',
  INVALID_META_ADDRESS: 'invalid Solana stealth meta-address',
  INVALID_ANNOUNCEMENT: 'invalid Solana stealth announcement',
  INVALID_ADDRESS: 'invalid Solana address (must be base58 of 32 bytes)',
  INVALID_SEEDS: 'invalid program-derived-address seeds',
  NO_VIABLE_BUMP: 'no bump seed yields an off-curve program address',
  ZERO_HASH: 'shared-secret hash reduced to zero',
  IDENTITY_POINT: 'derived point is the identity',
  ZERO_STEALTH_KEY: 'derived stealth key is zero',
  KEY_REUSE: 'spending and viewing keys must be distinct',
  KEY_MISMATCH: 'secret key does not match the expected public key',
  CHAIN_DISABLED: 'Solana cluster is not enabled (devnet/testnet only)',
  INVALID_INVOICE: 'invalid Solana invoice',
  ABORTED: 'operation aborted',
  RNG_UNAVAILABLE: 'no secure random source available',
  RNG_FAILURE: 'random source failed to produce a valid scalar',
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
