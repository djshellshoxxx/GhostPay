/** Stable error codes of this package. */
export type UxPrivacyErrorCode = 'INVALID_INPUT';

/**
 * Error thrown for malformed (untrusted) input.
 *
 * @security Messages contain only the field name, never the offending value.
 */
export class UxPrivacyError extends Error {
  /** Stable machine-readable code. */
  readonly code: UxPrivacyErrorCode;
  /** Name of the offending field. */
  readonly field: string;

  constructor(code: UxPrivacyErrorCode, field: string) {
    super(`${code}: ${field}`);
    this.name = 'UxPrivacyError';
    this.code = code;
    this.field = field;
  }
}

/** @internal Throws an {@link UxPrivacyError}. */
export function fail(field: string): never {
  throw new UxPrivacyError('INVALID_INPUT', field);
}
