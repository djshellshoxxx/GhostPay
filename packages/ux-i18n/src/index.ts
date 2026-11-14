// Deprecated: thin re-export of @ghostpay/i18n kept for compatibility.
// Explicit exports below shadow same-named i18n exports so old ux-i18n names keep their old meaning.
export * from '@ghostpay/i18n';
export {
  UxI18nError as I18nError,
  uxParseLocale as parseLocale,
  uxIsRtl as isRtl,
  uxTextDirection as textDirection,
  uxFallbackChain as fallbackChain,
  uxNegotiateLocale as negotiateLocale,
  uxParseAcceptLanguage as parseAcceptLanguage,
  uxParseMessage as parseMessage,
  uxEscapeHtml as escapeHtml,
  uxFormatMessage as formatMessage,
  type UxI18nErrorCode as I18nErrorCode,
  type UxParsedLocale as ParsedLocale,
  type UxTranslator as Translator,
  type UxCompletenessReport as CompletenessReport,
} from '@ghostpay/i18n';
