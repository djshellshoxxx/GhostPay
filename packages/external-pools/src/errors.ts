/** Stable error codes thrown by `@ghostpay/external-pools` and its adapter packages. */
export type ExternalPoolErrorCode =
  | 'CHAIN_NOT_ALLOWED'
  | 'MANIFEST_INVALID'
  | 'MANIFEST_MISMATCH'
  | 'CODE_HASH_MISMATCH'
  | 'POOL_NOT_ACTIVE'
  | 'ROUTE_REQUIRED'
  | 'ROUTE_UNKNOWN'
  | 'ROUTE_NOT_AVAILABLE'
  | 'ACCOUNTING_MISMATCH'
  | 'KEY_REQUIRED_FOR_NOTE'
  | 'SCOPE_INCOMPLETE'
  | 'VAULT_LOCKED'
  | 'VAULT_CORRUPT'
  | 'VAULT_BAD_PASSPHRASE'
  | 'NOTE_NOT_FOUND'
  | 'NOTE_STATE'
  | 'INVALID_INPUT'
  | 'DEPOSITOR_MISMATCH'
  | 'ARTIFACT_HASH_MISMATCH'
  | 'RELAYER_SCHEMA_DRIFT'
  | 'RELAYER_REJECTED'
  | 'RELAYER_NOT_ALLOWED'
  | 'FEE_TOO_HIGH'
  | 'PROOF_INVALID'
  | 'PRECOMMITMENT_EXHAUSTED'
  | 'RECEIPT_INVALID'
  | 'ASP_UNAVAILABLE'
  | 'STATE_UNAVAILABLE'
  | 'SDK_OUTPUT_REJECTED'
  | 'ACK_REQUIRED'
  | 'NOT_SUPPORTED';

/**
 * Error with a stable {@link ExternalPoolErrorCode}.
 *
 * @security Messages are fixed text or contain only public data (chain ids, addresses, hashes).
 *   Callers MUST NOT put secret material into `message` or `detail` (EP-VAULT-1).
 */
export class ExternalPoolError extends Error {
  /** Machine-readable code. */
  public readonly code: ExternalPoolErrorCode;

  /**
   * @param code Stable code.
   * @param message Human-readable text without secrets.
   */
  public constructor(code: ExternalPoolErrorCode, message: string) {
    super(message);
    this.name = 'ExternalPoolError';
    this.code = code;
  }
}

/**
 * Throws an {@link ExternalPoolError}.
 *
 * @param code Stable code.
 * @param message Text without secrets.
 */
export function fail(code: ExternalPoolErrorCode, message: string): never {
  throw new ExternalPoolError(code, message);
}
