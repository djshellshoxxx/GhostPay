// @vitest-environment jsdom
import { cleanup, configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, SOURCE_TRANSLATOR, useI18n } from '../i18n/context';
import { SOURCE_CATALOG, type MessageKey } from '../i18n/catalog';
import { NEUTRAL_KEYS, SECURITY_KEYS } from '../i18n/securityKeys';
import ar from '../../locales/ar.json';
import es from '../../locales/es.json';
import ja from '../../locales/ja.json';
import { mockChain, walletA } from '../features/solana/fixtures.testutil';
import { SolanaView } from '../features/solana/SolanaView';
import { TronView } from '../features/tron/TronView';
import { beginAttempt } from '../lib/duplicateAttemptJournal';
import { clearSession, generateSession, getSessionPublic, type SessionPublic } from '../lib/session';
import { AppContext, type AppState } from '../state';
import { makeParsed } from '../test/invoiceFixtures';
import { makeServices, renderWith } from '../test/render';
import { LIMITS, OBSERVERS, ObserverTable, limitKey, observerKey, useLimits } from './Disclosure';
import { PaymentProofQr, PlainPaymentRequest } from './PaymentRequestQr';
import { PrintableBill } from './PrintableBill';
import { SecretBackup, englishBackupText, localizedBackupText } from './SecretBackup';
import { TagArchive } from './TagArchive';
import { WalletAttempts } from './WalletAttempts';

// Catalogs load by dynamic import; allow for a slow machine.
configure({ asyncUtilTimeout: 5000 });

const drafts = { es, ja, ar } as const;
type Draft = keyof typeof drafts;
const draft = (locale: Draft, key: string): string => {
  const text = (drafts[locale].messages as Record<string, string>)[key];
  expect(text, `${locale} has ${key}`).toBeTypeOf('string');
  return text ?? '';
};
const english = (key: string): string => (SOURCE_CATALOG.messages as Record<string, string>)[key] ?? `MISSING ${key}`;

beforeEach(() => { window.sessionStorage.clear(); });
afterEach(() => { cleanup(); });

function inLocale(locale: string, ui: React.ReactNode): React.ReactNode {
  return <I18nProvider initialPreference={locale} target={document.documentElement}>{ui}</I18nProvider>;
}

describe('classification of the keys this lane added', () => {
  const owned = ['camera.', 'walletAttempts.', 'disclosure.', 'paymentRequest.', 'proof.', 'plainRequest.', 'bill.', 'secret.', 'tagArchive.', 'chainView.', 'sol.', 'tron.'];
  const keys = Object.keys(SOURCE_CATALOG.messages).filter((k) => owned.some((p) => k.startsWith(p)));

  it('puts every one in exactly one of the two lists', () => {
    expect(keys.length).toBeGreaterThan(150);
    for (const k of keys) expect(NEUTRAL_KEYS.has(k as MessageKey) !== SECURITY_KEYS.has(k as MessageKey), k).toBe(true);
  });

  it('never marks consent, warnings, risk disclosures, key handling, destructive actions or address display neutral', () => {
    const critical = [
      'camera.consent', 'camera.error.denied', 'walletAttempts.hint', 'walletAttempts.confirmClear', 'walletAttempts.clear',
      'disclosure.fee.signed', 'disclosure.fee.none', 'disclosure.observer.1.learns', 'disclosure.limit.3',
      'paymentRequest.textVersion', 'proof.disclaimer', 'plainRequest.hint', 'bill.bearerWarning', 'bill.fiatStated', 'bill.passphraseNote',
      'secret.keys.warning', 'tagArchive.format', 'tagArchive.rotate.warning', 'tagArchive.wipe.start', 'tagArchive.wipe.final', 'tagArchive.import.replace',
      'tagArchive.msg.downloaded', 'tagArchive.msg.incomplete', 'tagArchive.missing.unsupportedMany',
      'sol.warning.body', 'sol.rpc.hint', 'sol.destination.hint', 'sol.instr.3', 'sol.review.fee', 'tron.warning.body', 'tron.node.hint', 'tron.appLocked', 'tron.import.hint', 'tron.sameAddress',
      'chainView.metaAddress', 'chainView.foundCount',
    ];
    for (const k of critical) expect(SECURITY_KEYS.has(k as MessageKey), k).toBe(true);
  });

  it('has a translated draft of every added key in es, ja and ar, and all remain machine drafted', () => {
    for (const locale of ['es', 'ja', 'ar'] as const) {
      expect(drafts[locale]._meta.status).toBe('machine-drafted: needs native review');
      for (const k of keys) expect((drafts[locale].messages as Record<string, string>)[k], `${locale} ${k}`).toBeTypeOf('string');
    }
  });
});

describe('Disclosure', () => {
  it('keeps the English constants and their catalog keys in step', () => {
    expect(OBSERVERS).toHaveLength(7);
    OBSERVERS.forEach((o, i) => {
      expect(english(observerKey(i, 'who'))).toBe(o.who);
      expect(english(observerKey(i, 'learns'))).toBe(o.learns);
      expect(english(observerKey(i, 'not'))).toBe(o.not);
    });
    LIMITS.forEach((l, i) => { expect(english(limitKey(i))).toBe(l); });
    expect(Object.keys(SOURCE_CATALOG.messages).filter((k) => k.startsWith('disclosure.limit.'))).toHaveLength(LIMITS.length);
  });

  it('translates only the neutral table labels in a draft locale; the rows stay English', async () => {
    render(inLocale('es', <ObserverTable />));
    expect(await screen.findByRole('columnheader', { name: draft('es', 'disclosure.table.observer') })).toBeTruthy();
    expect(screen.getByText(OBSERVERS[0]?.learns ?? '')).toBeTruthy();
    expect(screen.queryByText(draft('es', 'disclosure.observer.1.learns'))).toBeNull();
  });

  it('keeps the privacy limits English in a draft locale', async () => {
    function Probe(): React.ReactNode { return <p data-testid="limits">{useLimits().join('|')}</p>; }
    render(inLocale('ja', <Probe />));
    await waitFor(() => { expect(document.documentElement.getAttribute('lang')).toBe('ja'); });
    expect(screen.getByTestId('limits').textContent).toBe(LIMITS.join('|'));
  });
});

describe('SecretBackup text', () => {
  it('keeps the English wording exactly as the views showed it before', () => {
    const seed = englishBackupText('seed');
    expect(seed.title).toBe('Backup seed');
    expect(seed.warning).toBe('Anyone with this seed controls the wallet. It is not stored anywhere.');
    expect(seed.show).toBe('Show backup seed');
    const keys = englishBackupText('keys');
    expect(keys.title).toBe('Backup keys');
    expect(keys.warning).toBe('Anyone with these keys controls the wallet. They are not stored anywhere.');
    expect([keys.show, keys.hide, keys.copy]).toEqual(['Show backup keys', 'Hide keys', 'Copy keys']);
    expect(keys.copyConfirm).toBe('Copy anyway');
    expect(keys.copyFailed).toBe('Copy failed: select the text manually.');
  });

  it('translates the neutral button labels and keeps the clipboard and key-handling warnings English', async () => {
    const user = userEvent.setup();
    const unreviewedWarning = 'Borrador de advertencia del portapapeles sin revisión.';
    function Backup(): React.ReactNode { return <SecretBackup reveal={() => 'a'.repeat(128)} text={localizedBackupText(useLocale(), 'keys')} />; }
    // The shipped draft currently retains this warning in English; a distinct draft proves fallback is enforced.
    render(<I18nProvider initialPreference="es" target={document.documentElement} loader={(locale) => Promise.resolve(locale === 'es'
      ? { ...es, messages: { ...es.messages, 'btc.seed.copyWarning': unreviewedWarning } }
      : SOURCE_CATALOG)}><Backup /></I18nProvider>);
    await user.click(await screen.findByRole('button', { name: draft('es', 'secret.keys.show') }));
    expect(screen.getByText(english('secret.keys.warning'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: draft('es', 'secret.keys.copy') }));
    expect(screen.getByText(english('btc.seed.copyWarning'))).toBeTruthy();
    expect(screen.queryByText(unreviewedWarning)).toBeNull();
    expect(screen.getByRole('button', { name: english('btc.seed.copyConfirm') })).toBeTruthy();
  });
});

function useLocale(): ReturnType<typeof useI18n>['t'] { return useI18n().t; }

describe('PrintableBill under Arabic', () => {
  it('translates neutral labels, keeps the bearer warning English, and sets address and fingerprint left-to-right', async () => {
    const inv = (await makeParsed({ taxRatePercent: '10' })).parsed.invoice;
    render(inLocale('ar', <PrintableBill invoice={inv} link="#gpi=v1.abc" passphraseProtected={false} chainName="Base Sepolia" tokenLabel="USDC" />));
    await waitFor(() => { expect(document.documentElement.getAttribute('dir')).toBe('rtl'); });
    const bill = screen.getByTestId('printable-bill');
    await waitFor(() => { expect(bill.textContent).toContain(draft('ar', 'bill.reference')); });
    expect(screen.getByTestId('bearer-warning').textContent).toBe(english('bill.bearerWarning'));
    // The seller fingerprint label is a security key, so it stays English; its value is never mirrored.
    const fingerprint = screen.getByText(english('pay.sellerFingerprint'), { selector: 'dt' }).nextElementSibling;
    expect(fingerprint?.getAttribute('dir')).toBe('ltr');
    expect(screen.getByText(inv.nonce).closest('dd')?.getAttribute('dir')).toBe('ltr');
  });
});

describe('PaymentRequestQr under Arabic', () => {
  it('keeps the proof disclaimer English, translates its buttons, and sets the proof text left-to-right', async () => {
    const user = userEvent.setup();
    const receipt = { status: 'included' } as unknown as Parameters<typeof PaymentProofQr>[0]['receipt'];
    render(inLocale('ar', <PaymentProofQr receipt={receipt} />));
    expect(await screen.findByRole('button', { name: draft('ar', 'proof.show') })).toBeTruthy();
    expect(screen.getByTestId('proof-disclaimer').textContent).toBe(english('proof.disclaimer'));
    await user.click(screen.getByRole('button', { name: draft('ar', 'proof.show') }));
    expect(screen.getByLabelText(draft('ar', 'proof.textLabel')).getAttribute('dir')).toBe('ltr');
  });

  it('translates the plain request labels and keeps the stealth-vs-plain warning English', async () => {
    render(inLocale('ja', <PlainPaymentRequest family="solana" testnet networkLabel="Devnet" />));
    expect(await screen.findByText(draft('ja', 'plainRequest.summary'))).toBeTruthy();
    expect(screen.getByLabelText(draft('ja', 'plainRequest.recipient')).getAttribute('dir')).toBe('ltr');
    expect(screen.getByText(english('plainRequest.hint').replace('{network}', 'Devnet'))).toBeTruthy();
  });
});

describe('WalletAttempts', () => {
  it('translates the heading, keeps the unknown-outcome and clear texts English in a draft locale', async () => {
    beginAttempt({ key: `0x${'ab'.repeat(32)}`, chainId: 1, account: `0x${'cd'.repeat(20)}`, kind: 'payment' });
    render(inLocale('es', <WalletAttempts />));
    expect(await screen.findByRole('heading', { name: draft('es', 'walletAttempts.heading') })).toBeTruthy();
    expect(screen.getByText(english('walletAttempts.hint'))).toBeTruthy();
    expect(screen.getByRole('button', { name: english('walletAttempts.clear') })).toBeTruthy();
    expect(screen.getByText(/payment on chain 1/)).toBeTruthy();
  });
});

describe('SolanaView and TronView', () => {
  it('Solana: translated title and section labels, English test-network warning and key hints, left-to-right address', async () => {
    const chain = mockChain('localnet', walletA());
    const user = userEvent.setup();
    renderWith(inLocale('es', <SolanaView />), makeServices({ fetchFn: chain.fetchFn }));
    expect(await screen.findByRole('heading', { level: 2, name: draft('es', 'sol.title') })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: draft('es', 'btc.section.wallet') })).toBeTruthy();
    expect(screen.getByText(english('sol.warning.body'))).toBeTruthy();
    expect(screen.queryByText(draft('es', 'sol.warning.body'))).toBeNull();
    expect(screen.getByText(english('sol.rpc.hint'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: draft('es', 'btc.wallet.create') }));
    const meta = (await screen.findByText(/^Stealth meta-address/)).nextElementSibling;
    expect(meta?.getAttribute('dir')).toBe('ltr');
    expect(screen.getByRole('button', { name: english('btc.lock') })).toBeTruthy();
  });

  it('Tron: translated title and labels, English warning and sweep-destination hint', async () => {
    renderWith(inLocale('ja', <TronView />), makeServices());
    expect(await screen.findByRole('heading', { level: 2, name: draft('ja', 'tron.title') })).toBeTruthy();
    expect(screen.getByLabelText(draft('ja', 'tron.node.label'))).toBeTruthy();
    expect(screen.getByText(english('tron.warning.body'))).toBeTruthy();
    expect(screen.getByRole('button', { name: draft('ja', 'btc.wallet.create') })).toBeTruthy();
  });

  it('English source text is unchanged without a provider', () => {
    expect(SOURCE_TRANSLATOR.t('sol.instr.1', { network: 'Devnet' })).toBe('The payer needs a tool that supports GhostPay Solana stealth payments on Devnet. This view does not send payments.');
    expect(SOURCE_TRANSLATOR.t('tron.tokens', { count: '2' })).toBe('2 TRC-20 payment(s) not shown; this view sweeps TRX only.');
  });
});

function withApp(session: SessionPublic | undefined, ui: React.ReactNode): React.ReactNode {
  const app = { session, announce: () => undefined } as unknown as AppState;
  return <AppContext.Provider value={app}>{ui}</AppContext.Provider>;
}

describe('TagArchive', () => {
  it('without keys: translated heading and prompt; with keys: translated controls, English security text and confirmations', async () => {
    const user = userEvent.setup();
    clearSession();
    const first = renderWith(inLocale('es', withApp(undefined, <TagArchive />)), makeServices());
    expect(await screen.findByRole('heading', { name: draft('es', 'tagArchive.heading') })).toBeTruthy();
    expect(screen.getByText(draft('es', 'tagArchive.loadKeys'))).toBeTruthy();
    first.unmount();

    generateSession();
    renderWith(inLocale('es', withApp(getSessionPublic(), <TagArchive />)), makeServices());
    expect(await screen.findByRole('button', { name: draft('es', 'tagArchive.export') })).toBeTruthy();
    expect(screen.getByLabelText(draft('es', 'tagArchive.passphrase.repeat'))).toBeTruthy();
    expect(screen.getByText(english('tagArchive.format'))).toBeTruthy();
    expect(screen.queryByText(draft('es', 'tagArchive.format'))).toBeNull();
    // Destructive actions keep their English source in a draft locale (security keys), including the two-step confirmation.
    await user.click(screen.getByRole('button', { name: english('tagArchive.wipe.start') }));
    expect(screen.getByText(english('tagArchive.wipe.warning'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: english('tagArchive.wipe.continue') }));
    expect(screen.getByText(english('tagArchive.wipe.last'))).toBeTruthy();
    expect(screen.getByRole('button', { name: draft('es', 'sellerKeys.cancel') })).toBeTruthy();
    clearSession();
  });
});
