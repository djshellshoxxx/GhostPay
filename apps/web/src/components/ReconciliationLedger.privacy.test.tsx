// @vitest-environment jsdom
import { cleanup, isInaccessible, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../AppShell';
import { checkpointKeyId, type ScanMatch } from '../lib/scanClient';
import { clearSession, generateSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import { recordFromVerifiedMatch } from '../lib/reconciliationLedger';
import { ReconciliationVault, type ReconciliationVaultStore } from '../lib/reconciliationVault';
import { makeServices, renderWith } from '../test/render';
import { ReconciliationLedger } from './ReconciliationLedger';

const factory = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../lib/reconciliationVault', async (original) => ({
  ...(await original<typeof import('../lib/reconciliationVault')>()),
  createCurrentReconciliationVault: factory.create,
}));
const TX = `0x${'b'.repeat(64)}`;
const BLOCK = `0x${'c'.repeat(64)}`;
const ADDRESS = `0x${'d'.repeat(40)}`;
const match: ScanMatch = {
  chainId: 84532,
  announcement: { id: `${BLOCK}:3`, transactionHash: TX, blockNumber: 120n, blockHash: BLOCK,
    logIndex: 3, schemeId: 1n, caller: `0x${'1'.repeat(40)}`, stealthAddress: ADDRESS,
    ephemeralPublicKey: `0x02${'2'.repeat(64)}`, metadata: '0x' },
  stealthAddress: ADDRESS,
  metadata: { kind: 'native', token: '0x', netAmount: 2500000n, viewTag: 5 },
  viaRouter: true, tagMatches: true, receipt: 'verified',
} as unknown as ScanMatch;
let keyId: string;
let vault: ReconciliationVault;
let data: Map<string, string>;
beforeEach(async () => {
  clearSession();
  localStorage.clear();
  history.replaceState(null, '', '/');
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ privacyMode: true }));
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
  await vault.save(recordFromVerifiedMatch(match, keyId));
  factory.create.mockResolvedValue(vault);
});
afterEach(() => { cleanup(); clearSession(); vi.restoreAllMocks(); });

describe('required private transaction history', () => {
  it('keeps unlocked history hidden until a separate deliberate reveal and adds no persistence or network lookup', async () => {
    const user = userEvent.setup();
    const fetchFn = vi.fn(() => Promise.reject(new Error('No network expected')));
    const ciphertext = [...data.entries()];
    renderWith(<AppShell order={['policy']} extraViews={{ policy: <ReconciliationLedger chainId={84532} sellerKeyId={keyId} matches={[]} scanMatchesCurrentScope /> }} />, makeServices({ fetchFn }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Policy accounts (experimental)' }));
    // This step is absent on the unchanged baseline; continue to the actual history disclosure regression there.
    const globalReveal = screen.queryByRole('button', { name: 'Reveal details for 30 seconds' });
    if (globalReveal !== null) await user.click(globalReveal);
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    expect(screen.queryByText(TX)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reveal history for 30 seconds' }));
    const transaction = await screen.findByText(TX);
    expect(isInaccessible(transaction)).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Hide transaction history' }));
    expect(transaction.isConnected).toBe(false);
    expect(screen.queryByText(TX)).toBeNull();
    expect([...data.entries()]).toEqual(ciphertext);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(localStorage.getItem(SETTINGS_KEY)).not.toContain(TX);
  });
});
