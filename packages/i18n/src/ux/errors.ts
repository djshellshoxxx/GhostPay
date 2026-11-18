/** Error codes raised by ux-i18n. */
export type I18nErrorCode =
  | 'syntax'
  | 'too-long'
  | 'too-deep'
  | 'missing-param'
  | 'bad-param'
  | 'bad-locale'
  | 'bad-number'
  | 'bad-date'
  | 'bad-input';

/**
 * Typed error. Messages never echo untrusted input verbatim beyond short, code-point-limited excerpts.
 * @security Safe to log; contains no secrets.
 */
export class I18nError extends Error {
  public readonly code: I18nErrorCode;
  public constructor(code: I18nErrorCode, message: string) {
    super(message);
    this.name = 'I18nError';
    this.code = code;
  }
}
