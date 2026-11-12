import { CHAINS } from '@ghostpay/chain-adapters';
import { FIRST_USE_NOTICE, TOR_BROWSER_NOTICE } from '@ghostpay/net-transport/browser';
import { describe, expect, it } from 'vitest';
import en from '../../locales/en.json';
import es from '../../locales/es.json';
import ja from '../../locales/ja.json';
import ar from '../../locales/ar.json';
import { isReviewed } from '../i18n/languages';
import { SECURITY_KEY_GROUPS, SECURITY_KEYS } from '../i18n/securityKeys';
import { SOURCE_TRANSLATOR } from '../i18n/source';
import { createTranslator } from '../i18n/translator';
import { UserFacingError, captureUserMessage, displayMessage, type MessageDescriptor } from './errors';
import { DEFAULT_SCAN_PRIVACY, describeScanDisclosure, describeScanDisclosureMessages, planScan, type ScanPrivacySettings } from './scanPrivacy';
import { describeAnonymitySet } from './scanSpam';

const chain = CHAINS.find((c) => c.chainId === 84532)!;
const disclosureCases = (['direct', 'tor-browser', 'local-proxy'] as const).flatMap((transport) =>
  (['rpc', 'indexer'] as const).flatMap((source) => [0, 1234].flatMap((windowBlocks) =>
    [false, true].flatMap((requireProxy) => [false, true].map((hasSecondary) => ({ transport, source, windowBlocks, requireProxy, hasSecondary }))),
  )),
);

describe('scan privacy message data', () => {
  it('preserves every source-English party and disclosure across transport, source, window and secondary-path choices', () => {
    expect(disclosureCases).toHaveLength(48);
    for (const { hasSecondary, ...settings } of disclosureCases) {
      const s: ScanPrivacySettings = { ...DEFAULT_SCAN_PRIVACY, ...settings, endpoints: { '84532': 'https://endpoint-do-not-display.test/private' }, indexerUrls: { '84532': 'https://indexer-do-not-display.test/private' } };
      const before = JSON.stringify(s);
      const messages = describeScanDisclosureMessages(s, { hasSecondary });
      const rendered = messages.map((row) => ({ party: displayMessage(row.party), learns: displayMessage(row.learns) }));
      expect(rendered, JSON.stringify(settings)).toEqual(describeScanDisclosure(s, { hasSecondary }));
      expect(JSON.stringify(messages)).not.toMatch(/endpoint-do-not-display|indexer-do-not-display|private/);
      expect(JSON.stringify(s)).toBe(before);
    }
    expect(SOURCE_TRANSLATOR.t('scanPrivacy.disclosure.torBrowserNotice')).toBe(TOR_BROWSER_NOTICE);
    expect(SOURCE_TRANSLATOR.t('scanPrivacy.disclosure.firstUseNotice')).toBe(FIRST_USE_NOTICE);
  });

  it.each([
    { patch: { requireProxy: true }, key: 'scanPrivacy.blocked.requirePrivatePath', text: 'Scan blocked: "Require the private path" is on, but the scan transport is Direct. Choose Tor Browser or a local proxy in Settings, or turn the requirement off.' },
    { patch: { transport: 'local-proxy' }, key: 'scanPrivacy.blocked.proxyEndpoint', text: 'Scan blocked: the local proxy has no endpoint for this chain. GhostPay does not fall back to your normal RPC.' },
    { patch: { source: 'indexer' }, key: 'scanPrivacy.blocked.indexerMissing', text: 'Scan blocked: no indexer URL is set for this chain.' },
    { patch: { source: 'indexer' }, chainId: 11155420, key: 'scanPrivacy.blocked.indexerChain', text: 'Scan blocked: the indexer source supports only Anvil, Ethereum Sepolia and Base Sepolia in this build.' },
  ] satisfies readonly { patch: Partial<ScanPrivacySettings>; chainId?: number; key: MessageDescriptor['key']; text: string }[])('keeps $key structured through UserFacingError while retaining the existing source reason', ({ patch, chainId, key, text }) => {
    const settings: ScanPrivacySettings = { ...DEFAULT_SCAN_PRIVACY, ...patch };
    const before = JSON.stringify(settings);
    const plan = planScan(settings, chainId === undefined ? chain : CHAINS.find((c) => c.chainId === chainId)!);
    expect(plan.kind).toBe('blocked');
    if (plan.kind !== 'blocked') throw new Error('expected a blocked plan');
    expect(plan.reasonMessage).toEqual({ key });
    expect(plan.reason).toBe(text);
    const error = new UserFacingError(plan.reasonMessage);
    expect(error.message).toBe(text);
    expect(captureUserMessage(error)).toBe(plan.reasonMessage);
    expect(displayMessage(captureUserMessage(error), (message) => `current:${message}`)).toBe(`current:${key}`);
    expect(JSON.stringify(settings)).toBe(before);
  });

  it.each([
    { patch: { endpoints: { '84532': 'http://insecure.example' } }, key: 'error.scanPrivacy.scanEndpointRejectedUseHttpsWithNoUsernamePasswordOr' },
    { patch: { transport: 'local-proxy', endpoints: { '84532': 'https://remote.example' } }, key: 'error.scanPrivacy.aLocalProxyEndpointMustBeOnThisComputerFor' },
    { patch: { transport: 'local-proxy', endpoints: { '84532': 'http://private-user:private-password@127.0.0.1' } }, key: 'error.scanPrivacy.localProxyEndpointRejectedNoUsernamePasswordOrFragment' },
    { patch: { source: 'indexer', indexerUrls: { '84532': 'invalid URL' } }, key: 'error.scanPrivacy.indexerURLIsNotAValidURL' },
    { patch: { source: 'indexer', indexerUrls: { '84532': 'https://private-user:private-password@indexer.example' } }, key: 'error.scanPrivacy.indexerURLMustBeHttpsOrHttpOn1270' },
    { patch: { transport: 'local-proxy', endpoints: { '84532': 'http://127.0.0.1:8545' }, source: 'indexer', indexerUrls: { '84532': 'https://indexer.example' } }, key: 'error.scanPrivacy.withALocalProxyTheIndexerMustAlsoBeReached' },
  ] satisfies readonly { patch: Partial<ScanPrivacySettings>; key: MessageDescriptor['key'] }[])('retains the endpoint validation descriptor $key without retaining the rejected URL', ({ patch, key }) => {
    const plan = planScan({ ...DEFAULT_SCAN_PRIVACY, ...patch }, chain);
    expect(plan.kind).toBe('blocked');
    if (plan.kind !== 'blocked') throw new Error('expected a blocked plan');
    expect(plan.reasonMessage).toEqual({ key });
    expect(plan.reason).toBe(SOURCE_TRANSLATOR.t(key));
    expect(JSON.stringify(plan)).not.toMatch(/private-user|private-password|insecure\.example|remote\.example|indexer\.example/);
    expect(captureUserMessage(new UserFacingError(plan.reasonMessage))).toEqual({ key });
  });

  it('keeps all new security copy in source English for unreviewed catalogs, even if a supplied draft claims otherwise', () => {
    const keys = SECURITY_KEY_GROUPS.scanPrivacyDisclosure;
    expect(keys).toHaveLength(38);
    for (const catalog of [es, ja, ar]) {
      expect(isReviewed(catalog._meta.locale)).toBe(false);
      const fakeDraft = { locale: catalog._meta.locale, messages: Object.fromEntries(keys.map((key) => [key, `unapproved:${key}`])) };
      const translator = createTranslator(catalog._meta.locale, [fakeDraft], { onIssue: () => undefined });
      for (const key of keys) {
        expect(SECURITY_KEYS.has(key), key).toBe(true);
        expect(catalog.messages[key], key).toBe(en.messages[key]);
      }
      for (const { hasSecondary, ...settings } of disclosureCases) {
        const s: ScanPrivacySettings = { ...DEFAULT_SCAN_PRIVACY, ...settings };
        const rendered = describeScanDisclosureMessages(s, { hasSecondary }).map((row) => ({ party: displayMessage(row.party, translator.t), learns: displayMessage(row.learns, translator.t) }));
        expect(rendered).toEqual(describeScanDisclosure(s, { hasSecondary }));
      }
      const plan = planScan({ ...DEFAULT_SCAN_PRIVACY, requireProxy: true }, chain);
      if (plan.kind !== 'blocked') throw new Error('expected a blocked plan');
      expect(displayMessage(captureUserMessage(new UserFacingError(plan.reasonMessage)), translator.t)).toBe(plan.reason);
    }
  });

  it('preserves the privacy-set statement and counts exactly for each level and incomplete-coverage flag', () => {
    const levels = { low: 'scan.privacySet.low', medium: 'scan.privacySet.medium', high: 'scan.privacySet.high' } as const;
    for (const level of ['low', 'medium', 'high'] as const) for (const partial of [false, true]) {
      const data = { level, count7d: 1234, count30d: 5678, partial };
      const rendered = SOURCE_TRANSLATOR.t('scan.privacySet.body', { level: SOURCE_TRANSLATOR.t(levels[level]), count7d: String(data.count7d), count30d: String(data.count30d), partial: partial ? 'yes' : 'no' });
      expect(rendered).toBe(describeAnonymitySet(data));
    }
  });
});
