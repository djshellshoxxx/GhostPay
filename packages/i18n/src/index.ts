export { I18nError, type I18nErrorCode } from './errors.js';
export { parseLocale, isValidLocale, canonicalizeLocale, MAX_LOCALE_LENGTH, type ParsedLocale } from './bcp47.js';
export { isRtl, textDirection } from './rtl.js';
export { fallbackChain, truncations, negotiateLocale, parseAcceptLanguage, type Negotiated } from './negotiate.js';
export { parseMessage, argumentNames, MAX_MESSAGE_LENGTH, MAX_DEPTH, MAX_NODES, type Node, type PluralCategory } from './parse.js';
export {
  formatMessage,
  formatNodes,
  escapeHtml,
  pluralCategoriesFor,
  MAX_OUTPUT_LENGTH,
  type FormatArgs,
  type FormatOptions,
  type FormatValue,
} from './format.js';
export {
  createI18n,
  MissingKeyTracker,
  KEY_PATTERN,
  MAX_KEY_LENGTH,
  type Catalog,
  type I18n,
  type I18nOptions,
  type MissingKeyEvent,
  type MissingKind,
  type Translator,
} from './i18n.js';
export { checkCatalogs, type CompletenessReport, type LocaleReport, type PlaceholderMismatch } from './completeness.js';
export { sampleCatalogs, en, es, de } from './catalogs/index.js';

// Merged from the former ux-i18n package (retained in full). Names that collide with the exports
// above carry a `Ux` prefix; the ux-i18n compat package maps them back to their old names.
export { I18nError as UxI18nError, type I18nErrorCode as UxI18nErrorCode } from './ux/errors.js';
export * from './ux/intl.js';
export {
  requireLocale,
  parseLocale as uxParseLocale,
  isRtl as uxIsRtl,
  textDirection as uxTextDirection,
  fallbackChain as uxFallbackChain,
  negotiateLocale as uxNegotiateLocale,
  parseAcceptLanguage as uxParseAcceptLanguage,
  type ParsedLocale as UxParsedLocale,
  type NegotiatedLocale,
} from './ux/locale.js';
export {
  messageParamNames,
  sanitizeValue,
  renderMessage,
  parseMessage as uxParseMessage,
  escapeHtml as uxEscapeHtml,
  formatMessage as uxFormatMessage,
  type MessageNode,
  type MessageCase,
  type MessageParam,
  type MessageParams,
  type EscapeMode,
  type RenderOptions,
} from './ux/message.js';
export {
  CATALOG_KEY_RE,
  createTranslator,
  checkCatalogCompleteness,
  checkCatalogSet,
  type MessageCatalog,
  type CatalogSet,
  type I18nIssue,
  type TranslatorOptions,
  type Translator as UxTranslator,
  type CompletenessReport as UxCompletenessReport,
} from './ux/catalog.js';
export * from './ux/format.js';
export * from './ux/a11y.js';
export * from './ux/readability.js';
export * from './ux/glossary.js';
export { EN_CATALOG } from './ux/content/en.js';
export { EN_GLOSSARY, EN_HELP_TOPICS, EN_HELP } from './ux/content/glossary-en.js';
