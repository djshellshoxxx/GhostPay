/** Stable error codes thrown by this package. Messages are fixed text and never contain caller data. */
export type DonationErrorCode =
  | 'INVALID_PPM'
  | 'INVALID_AMOUNT'
  | 'INVALID_DECIMALS'
  | 'INVALID_ADDRESS'
  | 'INVALID_HASH'
  | 'INVALID_STATE';

/** Error carrying a stable {@link DonationErrorCode}. */
export class DonationError extends Error {
  /** Machine-readable code. */
  public readonly code: DonationErrorCode;

  /**
   * @param code Stable code.
   * @param message Fixed text (no caller data).
   */
  public constructor(code: DonationErrorCode, message: string) {
    super(message);
    this.name = 'DonationError';
    this.code = code;
  }
}
