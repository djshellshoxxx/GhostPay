export type I18nErrorCode =
  | 'bad_locale'
  | 'bad_key'
  | 'bad_catalog'
  | 'syntax'
  | 'too_deep'
  | 'too_long'
  | 'too_complex'
  | 'unsupported_type'
  | 'bad_argument'
  | 'missing_argument'
  | 'output_too_long'
  | 'missing_key';

/** Error thrown for every i18n failure; `code` is stable, `message` never echoes untrusted values. */
export class I18nError extends Error {
  readonly code: I18nErrorCode;
  constructor(code: I18nErrorCode, message: string) {
    super(message);
    this.name = 'I18nError';
    this.code = code;
  }
}
