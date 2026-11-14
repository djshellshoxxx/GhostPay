// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOURCE_CATALOG } from '../i18n/sourceCatalog';
import { I18nProvider, useI18n } from '../i18n/context';
import * as languages from '../i18n/languages';
import es from '../../locales/es.json';
import ar from '../../locales/ar.json';
import { UserFacingError } from '../lib/errors';
import { clearSession, generateSession } from '../lib/session';
import { checkpointKeyId, type ScanMatch } from '../lib/scanClient';
import { recordFromVerifiedMatch } from '../lib/reconciliationLedger';
import { ReconciliationVault, type ReconciliationVaultStore } from '../lib/reconciliationVault';
import { ReconciliationLedger } from './ReconciliationLedger';

const factory = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../lib/reconciliationVault', async (original) => ({
  ...(await original<typeof import('../lib/reconciliationVault')>()),
  createCurrentReconciliationVault: factory.create,
}));
const TX = `0x${'b'.repeat(64)}`;
const BLOCK = `0x${'c'.repeat(64)}`;
const ADDRESS = `0x${'d'.repeat(40)}`;
const DIGEST = `0x${'f'.repeat(64)}`;
const match = {
  chainId: 84532,
  announcement: { id: `${BLOCK}:3`, transactionHash: TX, blockNumber: 120n, blockHash: BLOCK,
    logIndex: 3, schemeId: 1n, caller: `0x${'1'.repeat(40)}`, stealthAddress: ADDRESS,
    ephemeralPublicKey: `0x02${'2'.repeat(64)}`, metadata: '0x' },
  stealthAddress: ADDRESS,
  metadata: { kind: 'native', token: '0x', netAmount: 2500000n, viewTag: 5 },
  viaRouter: true, tagMatches: true, receipt: 'verified',
} as unknown as ScanMatch;
const matches = [match];
let keyId: string;
let vault: ReconciliationVault;
let data: Map<string, string>;
function SwitchLanguage(): React.ReactNode {
  const { setPreference } = useI18n();
  return <><button onClick={() => { setPreference('es'); }}>Spanish fixture</button><button onClick={() => { setPreference('ar'); }}>Arabic fixture</button></>;
}
function panel(): React.ReactNode {
  return <><SwitchLanguage /><ReconciliationLedger chainId={84532} sellerKeyId={keyId} matches={matches} scanMatchesCurrentScope /></>;
}
beforeEach(async () => {
  localStorage.clear();
  clearSession();
  const session = generateSession();
  keyId = checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey);
  data = new Map();
  const store: ReconciliationVaultStore = {
    read: (key) => Promise.resolve(data.get(key) ?? null),
    compareAndSwap: (key, expected, next, guard) => {
      guard();
      if ((data.get(key) ?? null) !== expected) return Promise.resolve(false);
      data.set(key, next);
      return Promise.resolve(true);
    },
  };
  vault = new ReconciliationVault(store, { chainId: 84532, sellerKeyId: keyId }, () => undefined);
  await vault.unlock(new Uint8Array(32).fill(7));
  factory.create.mockReset().mockResolvedValue(vault);
});
afterEach(() => { cleanup(); clearSession(); vi.restoreAllMocks(); });

describe('reconciliation live localization', () => {
  it('keeps preview, input bytes, verified evidence and storage unchanged while labels switch and identifiers remain LTR', async () => {
    await vault.save(recordFromVerifiedMatch(match, keyId));
    const backup = await vault.exportEncrypted();
    const user = userEvent.setup();
    const activate = vi.spyOn(vault, 'activateImport');
    const save = vi.spyOn(vault, 'save');
    const confirm = vi.spyOn(vault, 'confirmProposal');
    const preview = vi.spyOn(vault, 'previewImport');
    render(<I18nProvider initialPreference="en" onIssue={() => undefined}>{panel()}</I18nProvider>);
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    await user.type(await screen.findByLabelText('Invoice digest (optional, manual link)'), DIGEST);
    fireEvent.change(screen.getByLabelText('Encrypted reconciliation backup'), { target: { value: backup } });
    await user.click(screen.getByRole('button', { name: 'Preview encrypted backup' }));
    await screen.findByRole('button', { name: 'Activate previewed historical records' });
    const ciphertext = [...data.entries()];
    await user.click(screen.getByRole('button', { name: 'Spanish fixture' }));
    await screen.findByRole('heading', { name: es.messages['ledger.title'] });
    await user.click(screen.getByRole('button', { name: 'Arabic fixture' }));
    await screen.findByRole('heading', { name: ar.messages['ledger.title'] });
    expect(screen.getByLabelText<HTMLInputElement>('Invoice digest (optional, manual link)').value).toBe(DIGEST);
    expect(screen.getByLabelText<HTMLTextAreaElement>('Encrypted reconciliation backup').value).toBe(backup);
    expect(screen.getByLabelText('Invoice digest (optional, manual link)').getAttribute('dir')).toBe('ltr');
    expect(screen.getByLabelText('Encrypted reconciliation backup').getAttribute('dir')).toBe('ltr');
    expect(screen.getByText(TX).getAttribute('dir')).toBe('ltr');
    expect(screen.getByText(ADDRESS).getAttribute('dir')).toBe('ltr');
    expect(screen.getByText(/Router-verified when scanned/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activate previewed historical records' })).toBeTruthy();
    expect(preview).toHaveBeenCalledOnce();
    expect(activate).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect([...data.entries()]).toEqual(ciphertext);
    expect(factory.create).toHaveBeenCalledOnce();
  });

  it('rerenders an existing structured failure without repeating the operation after a reviewed locale change', async () => {
    vi.spyOn(languages, 'isReviewed').mockImplementation((locale) => locale === 'es');
    factory.create.mockRejectedValueOnce(new UserFacingError({ key: 'error.reconciliationVault.invalidEncryptedReconciliationFormat' }));
    const user = userEvent.setup();
    render(<I18nProvider initialPreference="en" onIssue={() => undefined} loader={(locale) => Promise.resolve(locale === 'es' ? {
      _meta: es._meta,
      messages: { ...es.messages, 'error.reconciliationVault.invalidEncryptedReconciliationFormat': 'Reviewed Spanish format error fixture' },
    } : SOURCE_CATALOG)}>{panel()}</I18nProvider>);
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    expect(await screen.findByText('Invalid encrypted reconciliation format.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Spanish fixture' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('Reviewed Spanish format error fixture'); });
    expect(factory.create).toHaveBeenCalledOnce();
    expect(data.size).toBe(0);
  });

  it('redacts an arbitrary underlying exception and keeps security copy English in a machine draft', async () => {
    factory.create.mockRejectedValueOnce(new Error('secret-bearing RPC response: bearer=do-not-display'));
    const user = userEvent.setup();
    render(<I18nProvider initialPreference="en" onIssue={() => undefined} loader={(locale) => Promise.resolve(locale === 'ar' ? {
      _meta: ar._meta,
      messages: { ...ar.messages, 'ledger.error.actionFailed': 'UNREVIEWED ERROR', 'ledger.ui.unlockEncryptedReconciliationVault': 'UNREVIEWED CONSENT' },
    } : SOURCE_CATALOG)}>{panel()}</I18nProvider>);
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    await screen.findByText('Encrypted reconciliation action failed.');
    await user.click(screen.getByRole('button', { name: 'Arabic fixture' }));
    await screen.findByRole('heading', { name: ar.messages['ledger.title'] });
    expect(screen.getByRole('alert').textContent).toContain('Encrypted reconciliation action failed.');
    expect(document.body.textContent).not.toContain('do-not-display');
    expect(document.body.textContent).not.toContain('UNREVIEWED');
    expect(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' })).toBeTruthy();
  });
});
