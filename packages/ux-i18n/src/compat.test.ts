import { describe, expect, it } from 'vitest';
import * as api from './index.js';

describe('ux-i18n compat re-export', () => {
  it('still resolves every legacy export name', () => {
    const names = [
      'I18nError', 'defaultIntl', 'parseLocale', 'requireLocale', 'isRtl', 'textDirection', 'fallbackChain',
      'negotiateLocale', 'parseAcceptLanguage', 'parseMessage', 'messageParamNames', 'sanitizeValue',
      'escapeHtml', 'renderMessage', 'formatMessage', 'CATALOG_KEY_RE', 'createTranslator',
      'checkCatalogCompleteness', 'checkCatalogSet', 'formatNumberParts', 'partsToString', 'formatNumber',
      'formatDateParts', 'formatDate', 'buildAccessibleName', 'buildLiveRegionMessage', 'parseHexColor',
      'relativeLuminance', 'contrastRatio', 'rateContrast', 'validateFocusOrder', 'validateAriaLabels',
      'countSyllables', 'estimateReadingLevel', 'HELP_ID_RE', 'validateRegistry', 'searchGlossary', 'getTerm',
      'lookupHelp', 'termsForTopic', 'linkGlossaryTerms', 'assertRegistry', 'EN_CATALOG', 'EN_GLOSSARY',
      'EN_HELP_TOPICS', 'EN_HELP',
    ];
    for (const n of names) expect((api as Record<string, unknown>)[n], n).toBeDefined();
  });
  it('legacy parseLocale keeps its old (lenient) shape', () => {
    expect(api.parseLocale('en-US')?.language).toBe('en');
    expect(api.parseLocale(42)).toBeUndefined();
  });
});
