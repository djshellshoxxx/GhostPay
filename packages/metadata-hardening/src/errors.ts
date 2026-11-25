/** Stable error codes thrown by this package. Messages are fixed text and never echo caller data. */
export type MhErrorCode =
  | 'UNSUPPORTED_CHAIN'
  | 'UNSUPPORTED_NETWORK'
  | 'INVALID_INPUT'
  | 'LIMIT_EXCEEDED'
  | 'CONFLICT'
  | 'POLICY_REJECTED';

/** Error carrying a stable {@link MhErrorCode}. */
export class MetadataHardeningError extends Error {
  /** Machine-readable code. */
  public readonly code: MhErrorCode;

  /**
   * @param code Stable code.
   * @param message Fixed text (no caller data, no key material).
   */
  public constructor(code: MhErrorCode, message: string) {
    super(message);
    this.name = 'MetadataHardeningError';
    this.code = code;
  }
}
