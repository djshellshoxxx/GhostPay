/** Stable error codes thrown by this package. Messages are fixed text and never contain URLs, indices or page data. */
export type PirErrorCode =
  | 'INVALID_ARGUMENT'
  | 'TESTNET_ONLY'
  | 'RNG_FAILURE'
  | 'PIR_INTEGRITY'
  | 'MANIFEST_MISMATCH'
  | 'SAME_OPERATOR'
  | 'BAD_PAGE'
  | 'TOO_MANY_PAGES'
  | 'TRANSPORT';

/** Error carrying a stable {@link PirErrorCode}. */
export class PirError extends Error {
  /** Machine-readable code. */
  public readonly code: PirErrorCode;

  /**
   * @param code Stable code.
   * @param message Fixed text (no caller data).
   */
  public constructor(code: PirErrorCode, message: string) {
    super(message);
    this.name = 'PirError';
    this.code = code;
  }
}

/** @internal Throws an INVALID_ARGUMENT error unless `ok`. */
export function requireArg(ok: boolean, message: string): asserts ok {
  if (!ok) throw new PirError('INVALID_ARGUMENT', message);
}
