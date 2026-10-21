import type { ReasonCode } from './types.js';

/** Stable error codes thrown by this package. Messages never contain calldata or addresses. */
export type TxReviewErrorCode = 'REVIEW_REFUSED' | 'INVALID_POLICY' | 'INVALID_INPUT';

/** Error carrying a stable {@link TxReviewErrorCode}. */
export class TxReviewError extends Error {
  /** Machine-readable code. */
  public readonly code: TxReviewErrorCode;

  /**
   * @param code Stable code.
   * @param message Fixed text (no caller data).
   */
  public constructor(code: TxReviewErrorCode, message: string) {
    super(message);
    this.name = 'TxReviewError';
    this.code = code;
  }
}

/** Thrown by `assertReviewed` when a review yields at least one reason. */
export class ReviewRefusedError extends TxReviewError {
  /** Every reason the review produced (never empty). */
  public readonly reasons: readonly ReasonCode[];

  /** @param reasons See {@link ReviewRefusedError.reasons}. */
  public constructor(reasons: readonly ReasonCode[]) {
    super('REVIEW_REFUSED', `transaction refused: ${reasons.join(',')}`);
    this.name = 'ReviewRefusedError';
    this.reasons = reasons;
  }
}

/** @internal Throws `code` unless `ok`. */
export function require_(ok: boolean, code: TxReviewErrorCode, message: string): void {
  if (!ok) throw new TxReviewError(code, message);
}
