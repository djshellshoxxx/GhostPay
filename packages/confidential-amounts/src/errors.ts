/** Stable error codes thrown by this package. Messages never contain keys, signatures or plaintext amounts. */
export type CtErrorCode =
  | 'INVALID_INPUT'
  | 'MAINNET_REFUSED'
  | 'CHAIN_NOT_SUPPORTED'
  | 'BACKEND_UNAVAILABLE'
  | 'MANIFEST_MISMATCH'
  | 'UNPINNED_CODEHASH'
  | 'OPERATOR_WINDOW'
  | 'METADATA_INVALID'
  | 'DECRYPT_FAILED'
  | 'ACL_DENIED'
  | 'PROOF_UNAVAILABLE'
  | 'QUEUE_FULL'
  | 'CANCELLED'
  | 'LEDGER_REVERT';

/** Error carrying a stable {@link CtErrorCode}. */
export class CtError extends Error {
  /** Machine-readable code. */
  public readonly code: CtErrorCode;

  /**
   * @param code Stable code.
   * @param message Fixed text; must not embed secrets or plaintext amounts.
   */
  public constructor(code: CtErrorCode, message: string) {
    super(message);
    this.name = 'CtError';
    this.code = code;
  }
}

/** @internal Throws an INVALID_INPUT error unless `ok`. */
export function requireInput(ok: boolean, message: string): asserts ok {
  if (!ok) throw new CtError('INVALID_INPUT', message);
}
