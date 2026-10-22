/** Stable machine-readable error codes (map to i18n keys in the UI). */
export type ReceiptErrorCode =
  | 'INVALID_FIELD'
  | 'UNKNOWN_FIELD'
  | 'FORBIDDEN_FIELD'
  | 'SECRET_LIKE_MEMO'
  | 'INVALID_POLICY'
  | 'NOT_CANONICALIZABLE'
  | 'NO_WEBCRYPTO'
  | 'TOO_LARGE'
  | 'MALFORMED';

/** A single validation problem, safe to show (never echoes the offending value). */
export interface ReceiptIssue {
  readonly code: ReceiptErrorCode;
  readonly path: string;
  readonly message: string;
}

/**
 * Error thrown by builders. Messages never contain user-supplied values.
 * @security Do not add the rejected value to the message: it may be a secret.
 */
export class ReceiptError extends Error {
  readonly code: ReceiptErrorCode;
  readonly path: string;
  constructor(code: ReceiptErrorCode, path: string, message: string) {
    super(message);
    this.name = 'ReceiptError';
    this.code = code;
    this.path = path;
  }
  toIssue(): ReceiptIssue {
    return { code: this.code, path: this.path, message: this.message };
  }
}
