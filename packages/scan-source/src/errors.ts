/** Stable error codes thrown by this package. Messages are fixed text: never URLs, keys, tags or addresses. */
export type ScanErrorCode =
  | 'INVALID_ARGUMENT'
  | 'TESTNET_ONLY'
  | 'TRANSPORT'
  | 'BAD_RESPONSE'
  | 'CONTINUITY'
  | 'SOURCE_DISAGREE'
  | 'QUORUM_UNAVAILABLE'
  | 'TRUNCATED'
  | 'OUT_OF_RANGE'
  | 'HEAD_MISMATCH'
  | 'PIR_INTEGRITY'
  | 'PIR_FAILED';

/** Error carrying a stable {@link ScanErrorCode}. */
export class ScanSourceError extends Error {
  /** Machine-readable code. */
  public readonly code: ScanErrorCode;

  /**
   * @param code Stable code.
   * @param message Fixed text (no caller data).
   */
  public constructor(code: ScanErrorCode, message: string) {
    super(message);
    this.name = 'ScanSourceError';
    this.code = code;
  }
}

/** @internal Throws INVALID_ARGUMENT unless `ok`. */
export function requireArg(ok: boolean, message: string): asserts ok {
  if (!ok) throw new ScanSourceError('INVALID_ARGUMENT', message);
}
