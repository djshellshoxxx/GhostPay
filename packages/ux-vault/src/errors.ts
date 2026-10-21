/**
 * Error codes surfaced by ux-vault. Messages for authentication-related codes are
 * fixed strings so callers cannot (accidentally) distinguish failure causes.
 */
export type VaultErrorCode =
  | 'INVALID_INPUT'
  | 'WEAK_PASSWORD'
  | 'UNLOCK_FAILED'
  | 'DECRYPT_FAILED'
  | 'CORRUPT'
  | 'UNSUPPORTED_VERSION'
  | 'LOCKED'
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'LIMIT'
  | 'STORAGE';

/**
 * Typed error for every failure produced by this package.
 *
 * @security `UNLOCK_FAILED` and `DECRYPT_FAILED` always carry the same constant
 * message regardless of whether the password was wrong, the profile missing, or the
 * ciphertext tampered with (all AEAD failures are indistinguishable by design).
 */
export class VaultError extends Error {
  readonly code: VaultErrorCode;
  constructor(code: VaultErrorCode, message: string) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
  }
}

/** Constant message used for every authentication failure. */
export const AUTH_FAILURE_MESSAGE = 'unable to decrypt: wrong password or data was modified';

/** @internal */
export function fail(code: VaultErrorCode, message: string): never {
  throw new VaultError(code, message);
}
