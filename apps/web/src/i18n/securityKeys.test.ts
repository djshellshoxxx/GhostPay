import { afterEach, describe, expect, it, vi } from 'vitest';
import es from '../../locales/es.json';
import ar from '../../locales/ar.json';
import ja from '../../locales/ja.json';
import { loadLayers, SOURCE_CATALOG, type Catalog, type CatalogLayer, type MessageKey } from './catalog';
import * as registry from './languages';
import { NEUTRAL_KEY_LIST, SECURITY_KEY_GROUPS, SECURITY_KEYS } from './securityKeys';
import { createTranslator, type I18nIssue } from './translator';



const en: CatalogLayer = { locale: registry.SOURCE_LOCALE, messages: SOURCE_CATALOG.messages };
const drafts = [es, ar, ja];
afterEach(() => { vi.restoreAllMocks(); });

describe('critical translation native-review boundary (IN-3)', () => {
  it('classifies every current English key exactly once without unknown or duplicate policy keys', () => {
    const critical = Object.values(SECURITY_KEY_GROUPS).flat();
    const classified = [...critical, ...NEUTRAL_KEY_LIST];
    expect(new Set(classified).size).toBe(classified.length);
    expect(new Set(classified)).toEqual(new Set(Object.keys(SOURCE_CATALOG.messages)));
    expect(SECURITY_KEYS.size).toBe(critical.length);
  });

  it('includes the accepted consent, fee, irreversibility, loss, recovery and tamper boundaries', () => {
    const required: readonly MessageKey[] = [
      'registry.consent', 'registry.what.registration', 'registry.what.clear',
      'backupGate.waiverLabel', 'backupGate.waiverPhrase', 'backupGate.waive',
      'about.feeNote', 'sweep.relayerFee', 'btc.review.approve', 'btc.sweep.destinationHint',
      'sellerKeys.wipeUnsaved.body', 'sellerKeys.wipeSignerOnly.body', 'app.idle.signerLost',
      'policy.create.keepBody', 'policy.account.withdrawal', 'policy.account.cancel',
      'sweep.attempt.unknownDirect', 'sweep.note.pendingDirect', 'settings.outside.title',
      'settings.outside.body', 'errorBoundary.reloadHint', 'ledger.import.invalidated',
      'sellerKeys.pairing.title', 'sellerKeys.pairing.caption', 'sellerKeys.pairing.importLabel', 'sellerKeys.pairing.previewHeading',
      'sellerKeys.pairing.compare.none', 'sellerKeys.pairing.refused', 'sellerKeys.pairing.exportFailed', 'registry.exportHint',
      'scan.tag.label', 'scan.tags.unlocked', 'scan.tags.locked', 'scan.tags.deleted', 'scan.tags.deleteAll',
      'camera.consent', 'camera.error.denied', 'walletAttempts.confirmClear', 'disclosure.fee.signed', 'proof.disclaimer', 'bill.bearerWarning',
      'secret.keys.warning', 'tagArchive.rotate.warning', 'tagArchive.wipe.final', 'tagArchive.import.replace', 'sol.warning.body', 'sol.destination.hint',
      'tron.warning.body', 'tron.appLocked', 'tron.sameAddress',
    ];
    for (const key of required) expect(SECURITY_KEYS.has(key), key).toBe(true);
  });

  it.each(drafts)('keeps all critical text English in the $_meta.locale draft despite complete translated content', (catalog) => {
    const locale = catalog._meta.locale;
    expect(catalog._meta.status).toBe(registry.MACHINE_DRAFTED_STATUS);
    expect(registry.isReviewed(locale)).toBe(false);
    // Give every source key a valid distinguishable candidate, including keys missing in an older draft snapshot.
    const messages = Object.fromEntries(Object.keys(SOURCE_CATALOG.messages).map((key) => [key, `DRAFT ${locale}: ${key}`]));
    const tr = createTranslator(locale, [{ locale, messages }, en]);
    const source = createTranslator(locale, [en]);
    for (const key of SECURITY_KEYS) {
      expect(tr.t(key), key).toBe(source.t(key));
      expect(tr.parts(key), key).toEqual(source.parts(key));
      expect(tr.t(key), key).not.toContain(`DRAFT ${locale}:`);
    }
    expect(tr.t('settings.title')).toBe(`DRAFT ${locale}: settings.title`);
  });

  it('retains actual Spanish neutral labels, neutral plurals, and locale display formatting', () => {
    const tr = createTranslator('es', [{ locale: 'es', messages: es.messages }, en]);
    expect(tr.t('settings.title')).toBe('Ajustes');
    expect(tr.t('settings.lock.summary', { minutes: 2 })).toBe('Locks after 2 minutes without activity.');
    const neutralPlural = createTranslator('es', [{ locale: 'es', messages: { 'settings.title': '{count, plural, one {un elemento} other {# elementos}}' } }, en]);
    expect(neutralPlural.t('settings.title', { count: 2 })).toBe('2 elementos');
    expect(tr.t('settings.outside.title')).toBe(SOURCE_CATALOG.messages['settings.outside.title']);
    expect(createTranslator('de-DE', [en]).number(1234.5)).toBe('1.234,5');
  });

  it('does not accept a catalog metadata reviewed claim as native-review authority', async () => {
    const impostor: Catalog = {
      _meta: { locale: 'es', status: registry.REVIEWED_STATUS },
      messages: { 'registry.consent': 'UNAPPROVED CONSENT', 'settings.title': 'Ajustes' },
    };
    const layers = await loadLayers(['es', 'en'], (locale) => Promise.resolve(locale === 'es' ? impostor : SOURCE_CATALOG));
    const tr = createTranslator('es', layers);
    expect(registry.isReviewed('es')).toBe(false);
    expect(tr.t('registry.consent')).toBe(SOURCE_CATALOG.messages['registry.consent']);
    expect(tr.t('settings.title')).toBe('Ajustes');
  });

  it('uses the actual catalog locale registry decision, not approval inferred from a regional tag', () => {
    // Test-only simulation of a future reviewed registry entry; never mutate REVIEWED_LOCALES or catalog flags.
    vi.spyOn(registry, 'isReviewed').mockImplementation((locale) => locale === 'es');
    const tr = createTranslator('es-MX', [
      { locale: 'es-MX', messages: { 'registry.consent': 'UNREVIEWED REGION' } },
      { locale: 'es', messages: { 'registry.consent': 'Reviewed consent fixture' } },
      en,
    ]);
    expect(tr.t('registry.consent')).toBe('Reviewed consent fixture');
  });

  it('still skips broken reviewed messages and diagnoses the English fallback once', () => {
    vi.spyOn(registry, 'isReviewed').mockImplementation((locale) => locale === 'es');
    const issues: I18nIssue[] = [];
    const tr = createTranslator('es', [{ locale: 'es', messages: { 'registry.consent': '{broken' } }, en], { onIssue: (issue) => issues.push(issue) });
    expect(tr.t('registry.consent')).toBe(SOURCE_CATALOG.messages['registry.consent']);
    tr.parts('registry.consent');
    expect(issues.map((issue) => issue.kind)).toEqual(['syntax', 'fallback']);
  });

  it('always has bundled source critical text even when a caller omits or replaces the English layer', () => {
    const tr = createTranslator('es', [{ locale: 'es', messages: { 'registry.consent': 'DRAFT' } }]);
    expect(tr.t('registry.consent')).toBe(SOURCE_CATALOG.messages['registry.consent']);
    const replaced = createTranslator('en', [{ locale: 'en', messages: { 'registry.consent': 'REPLACED SOURCE', 'settings.title': 'Custom neutral label' } }]);
    expect(replaced.t('registry.consent')).toBe(SOURCE_CATALOG.messages['registry.consent']);
    expect(replaced.t('settings.title')).toBe('Custom neutral label');
    expect(registry.isReviewed(registry.SOURCE_LOCALE)).toBe(false); // Source does not need native-translation approval.
  });

  it('refuses draft text for an unknown runtime key before the classification census can run', () => {
    // Exercise the JavaScript boundary: a future source key must not become draft-eligible merely by being absent
    // from SECURITY_KEYS. No such key exists in the bundled source today, so fail visibly to its key, never the draft.
    const futureKey = 'future.unclassifiedConsent' as MessageKey;
    const issues: I18nIssue[] = [];
    const tr = createTranslator('es', [{ locale: 'es', messages: { [futureKey]: 'UNREVIEWED FUTURE CONSENT' } }, en], { onIssue: (issue) => issues.push(issue) });
    expect(tr.t(futureKey)).toBe(futureKey);
    expect(tr.parts(futureKey)).toEqual([futureKey]);
    expect(issues).toEqual([{ kind: 'missing-key', key: futureKey, locale: 'es' }]);
  });

  it('reports policy fallback once and gives pseudo locales no production review exemption', () => {
    const issues: I18nIssue[] = [];
    const tr = createTranslator('en-XA', [{ locale: 'en-XA', messages: { 'settings.outside.title': 'PSEUDO WARNING' } }, en], { onIssue: (issue) => issues.push(issue) });
    expect(tr.t('settings.outside.title')).toBe(SOURCE_CATALOG.messages['settings.outside.title']);
    tr.parts('settings.outside.title');
    expect(issues).toEqual([{ kind: 'fallback', key: 'settings.outside.title', locale: 'en-XA', usedLocale: 'en' }]);
  });
});
