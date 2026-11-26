// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import { recordFromVerifiedMatch, RECONCILIATION_LEDGER_DATA_KEY } from '../lib/reconciliationLedger';
import { ReconciliationVault, type ReconciliationVaultStore } from '../lib/reconciliationVault';
import { checkpointKeyId, type ScanMatch } from '../lib/scanClient';
import { clearSession, generateSession } from '../lib/session';
import { ReconciliationLedger } from './ReconciliationLedger';

const factory = vi.hoisted(() => ({ create: vi.fn<(...args: unknown[]) => Promise<ReconciliationVault>>() }));
vi.mock('../lib/reconciliationVault', async (original) => ({
  ...(await original<typeof import('../lib/reconciliationVault')>()),
  createCurrentReconciliationVault: factory.create,
}));
const TX = `0x${'b'.repeat(64)}`;
const BLOCK = `0x${'c'.repeat(64)}`;
const ADDRESS = `0x${'d'.repeat(40)}`;
const match = {
  chainId: 84532,
  announcement: { id: `${BLOCK}:3`, transactionHash: TX, blockNumber: 120n, blockHash: BLOCK,
    logIndex: 3, schemeId: 1n, caller: `0x${'1'.repeat(40)}`, stealthAddress: ADDRESS,
    ephemeralPublicKey: `0x02${'2'.repeat(64)}`, metadata: '0x' },
  stealthAddress: ADDRESS, metadata: { kind: 'native', token: '0x', netAmount: 2500000n, viewTag: 5 },
  viaRouter: true, tagMatches: true, receipt: 'verified',
} as unknown as ScanMatch;
let keyId: string;
let vault: ReconciliationVault;
let data: Map<string, string>;
const panel = () => <ReconciliationLedger chainId={84532} sellerKeyId={keyId} matches={[]} scanMatchesCurrentScope />;

beforeEach(async () => {
  clearSession(); localStorage.clear();
  const session = generateSession();
  keyId = checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey);
  data = new Map();
  const store: ReconciliationVaultStore = {
    read: (key) => Promise.resolve(data.get(key) ?? null),
    compareAndSwap: (key, expected, next, guard) => {
      guard();
      if ((data.get(key) ?? null) !== expected) return Promise.resolve(false);
      data.set(key, next); return Promise.resolve(true);
    },
  };
  vault = new ReconciliationVault(store, { chainId: 84532, sellerKeyId: keyId }, () => undefined);
  await vault.unlock(new Uint8Array(32).fill(7));
  await vault.save(recordFromVerifiedMatch(match, keyId));
  factory.create.mockResolvedValue(vault);
});
afterEach(() => { cleanup(); clearSession(); vi.restoreAllMocks(); factory.create.mockReset(); });

describe('reconciliation presentation revocation', () => {
  it.each(['manual', 'idle'] as const)('clears decrypted history, backup draft and errors at a %s app lock without deleting encrypted or legacy records', async (reason) => {
    const legacy = JSON.stringify({ version: 1, records: [recordFromVerifiedMatch(match, keyId)] });
    localStorage.setItem(RECONCILIATION_LEDGER_DATA_KEY, legacy);
    const ciphertext = [...data.entries()];
    expect(JSON.stringify(ciphertext)).not.toContain(TX);
    const user = userEvent.setup();
    render(panel());
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    expect(await screen.findByText(TX)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Encrypted reconciliation backup'), { target: { value: 'private unfinished backup draft' } });
    await user.click(screen.getByRole('button', { name: 'Preview encrypted backup' }));
    await screen.findByRole('alert');
    act(() => { notifyAppLock(reason); });
    expect(screen.queryByText(TX)).toBeNull();
    expect(screen.queryByText(ADDRESS)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Activate previewed historical records' })).toBeNull();
    expect(screen.queryByDisplayValue('private unfinished backup draft')).toBeNull();
    expect(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' })).toBeTruthy();
    expect([...data.entries()]).toEqual(ciphertext);
    expect(localStorage.getItem(RECONCILIATION_LEDGER_DATA_KEY)).toBe(legacy);
    await vault.unlock(new Uint8Array(32).fill(7));
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    await screen.findByText(TX);
    expect(screen.getByLabelText<HTMLTextAreaElement>('Encrypted reconciliation backup').value).toBe('');
  });

  it('discards a vault that finishes opening after app lock, preserving its durable evidence', async () => {
    const ciphertext = [...data.entries()];
    let release!: (opened: ReconciliationVault) => void;
    const opening = new Promise<ReconciliationVault>((resolve) => { release = resolve; });
    factory.create.mockReturnValue(opening);
    const user = userEvent.setup();
    render(panel());
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    act(() => { notifyAppLock('idle'); });
    await act(async () => { release(vault); await opening; });
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Unlock encrypted reconciliation vault' }).disabled).toBe(false); });
    expect(screen.queryByText(TX)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lock reconciliation vault' })).toBeNull();
    expect([...data.entries()]).toEqual(ciphertext);
    await expect(vault.readState()).rejects.toThrow(/locked/i);
  });
});
