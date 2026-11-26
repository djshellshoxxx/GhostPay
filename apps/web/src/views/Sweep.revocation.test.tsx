// @vitest-environment jsdom
import type { RpcClient } from '@ghostpay/chain-adapters';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../AppShell';
import { notifyAppLock } from '../lib/appLock';
import * as keyVault from '../lib/keyVault';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from '../lib/keyVault';
import type { ScanMatch } from '../lib/scanClient';
import { clearSession } from '../lib/session';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../lib/settings';
import * as sweepLib from '../lib/sweep';
import { SWEEP_JOURNAL_KEY } from '../lib/sweepAttemptJournal';
import { beginSweepAttempt, getSweepAttempt, resetSweepAttemptsForTests, useApp } from '../state';
import { generateWaivedSession } from '../test/keys';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { makeServices, renderWith } from '../test/render';

const CHAIN = 84532;
const OWNER = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const DESTINATION = '0x6666666666666666666666666666666666666666';
const HASH = `0x${'34'.repeat(32)}` as const;
const READ = 'Read balance from the Settings RPC';
const DIRECT = 'Sign and broadcast directly';
const CHOOSE = 'Choose a payment to sweep from Scan and receive.';
const PASS = 'Vault passphrase (required for each sweep action)';
const match = { chainId: CHAIN, stealthAddress: OWNER, metadata: { kind: 'erc20', token: TOKEN }, announcement: {} } as unknown as ScanMatch;

function SelectRecordedPayment() {
  const app = useApp();
  return <button type="button" onClick={() => {
    app.setMatches([match]);
    app.selectForSweep({ chainId: CHAIN, match });
    app.setView('sweep');
  }}>Open recorded payment</button>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '/');
  resetSweepAttemptsForTests();
  setKeyVaultStoreForTests(new MemoryKeyVaultStore());
  generateWaivedSession();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, rpcUrls: { [String(CHAIN)]: 'https://rpc.test/' } }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); setKeyVaultStoreForTests(undefined); });

function mount(rpcReady: Promise<void> = Promise.resolve()) {
  const request = vi.fn<RpcClient['request']>(() => Promise.resolve(`0x${(5_000_000n).toString(16).padStart(64, '0')}`));
  const rpc = withManifestChain({
    chainId: CHAIN, request, blockNumber: () => Promise.resolve(0n),
    getBlock: () => Promise.resolve(null), getLogs: () => Promise.resolve([]),
  });
  const createRpc = vi.fn(async () => { await rpcReady; return rpc; });
  const fetchFn = vi.fn(() => Promise.reject(new Error('No network expected')));
  renderWith(<AppShell order={['home', 'sweep']} mainPrelude={<SelectRecordedPayment />} />, makeServices({
    createRpc, fetchFn, loadManifest: (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id) }),
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Open recorded payment' }));
  return { request, createRpc, fetchFn };
}

async function ready(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: READ }));
  await screen.findByText('5 USDC');
  fireEvent.change(screen.getByLabelText(/^Destination address/), { target: { value: DESTINATION } });
  fireEvent.click(screen.getByLabelText(/^Directly/));
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: DIRECT }).disabled).toBe(false); });
}

describe('Sweep presentation revocation and retained outcomes', () => {
  it.each(['manual', 'idle', 'session replacement'] as const)('clears selection and draft credentials on %s while retaining an unresolved sweep', async (change) => {
    // Only the presence of an encrypted record is needed to render this draft field; no authorization is requested.
    vi.spyOn(keyVault, 'readEncryptedVault').mockResolvedValue('opaque encrypted vault record');
    const original = beginSweepAttempt({ chainId: CHAIN, owner: OWNER, nonce: 7, expectedHash: HASH, status: 'unknown-after-handoff' });
    const journal = sessionStorage.getItem(SWEEP_JOURNAL_KEY);
    const direct = vi.spyOn(sweepLib, 'directSweep');
    const m = mount();
    const password = await screen.findByLabelText<HTMLInputElement>(PASS);
    const destination = screen.getByLabelText<HTMLInputElement>(/^Destination address/);
    fireEvent.change(password, { target: { value: 'private unfinished vault credential' } });
    fireEvent.change(destination, { target: { value: DESTINATION } });
    expect(screen.getByText(HASH)).toBeTruthy();

    act(() => { if (change === 'session replacement') generateWaivedSession(); else notifyAppLock(change); });
    expect(screen.getByText(CHOOSE)).toBeTruthy();
    expect(password.isConnected).toBe(false);
    expect(password.value).toBe('');
    expect(password.hasAttribute('value')).toBe(false);
    expect(destination.isConnected).toBe(false);
    expect(document.body.textContent).not.toContain(OWNER);
    expect(document.body.textContent).not.toContain(HASH);
    expect(screen.queryByDisplayValue(DESTINATION)).toBeNull();
    expect(screen.queryByRole('button', { name: DIRECT })).toBeNull();
    expect(getSweepAttempt(CHAIN, OWNER)).toEqual(original);
    expect(sessionStorage.getItem(SWEEP_JOURNAL_KEY)).toBe(journal);
    expect(m.createRpc).not.toHaveBeenCalled();
    expect(m.request).not.toHaveBeenCalled();
    expect(m.fetchFn).not.toHaveBeenCalled();
    expect(direct).not.toHaveBeenCalled();

    // Recovery requires an explicit new selection and does not silently discard the signing lock.
    fireEvent.click(screen.getByRole('button', { name: 'Open recorded payment' }));
    expect(screen.getByText(HASH)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/^Directly/));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: DIRECT }).disabled).toBe(true);
    expect(await screen.findByLabelText<HTMLInputElement>(PASS)).toHaveProperty('value', '');
    expect(screen.getByLabelText<HTMLInputElement>(/^Destination address/).value).toBe('');
    expect(m.createRpc).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(SWEEP_JOURNAL_KEY)).toBe(journal);
  });

  it('does not disclose the old address when a pending RPC factory resolves after the selection is revoked', async () => {
    const gate = deferred<void>();
    const direct = vi.spyOn(sweepLib, 'directSweep');
    const m = mount(gate.promise);
    fireEvent.click(screen.getByRole('button', { name: READ }));
    expect(m.createRpc).toHaveBeenCalledOnce();
    act(() => { notifyAppLock('idle'); });
    await act(async () => { gate.resolve(undefined); await gate.promise; });
    expect(screen.getByText(CHOOSE)).toBeTruthy();
    expect(document.body.textContent).not.toContain(OWNER);
    expect(screen.queryByText('5 USDC')).toBeNull();
    expect(m.request).not.toHaveBeenCalled();
    expect(m.fetchFn).not.toHaveBeenCalled();
    expect(direct).not.toHaveBeenCalled();
    expect(getSweepAttempt(CHAIN, OWNER)).toBeUndefined();
  });

  it.each(['submitted', 'unknown-after-handoff'] as const)('retains a %s outcome that settles after lock without restoring the private view or sending again', async (status) => {
    const result = deferred<sweepLib.DirectSweepResult>();
    const attempted: sweepLib.DirectSweepAttempt = {
      chainId: CHAIN, owner: OWNER, nonce: 7, destination: DESTINATION, asset: TOKEN,
      amount: 5_000_000n, expectedHash: HASH, status: 'unknown-after-handoff',
    };
    const direct = vi.spyOn(sweepLib, 'directSweep').mockImplementation((input) => {
      input.onBeforeHandoff?.(attempted);
      return result.promise;
    });
    const m = mount();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: DIRECT }));
    await waitFor(() => { expect(direct).toHaveBeenCalledOnce(); });
    expect(getSweepAttempt(CHAIN, OWNER)).toMatchObject({ expectedHash: HASH, status: 'unknown-after-handoff' });
    const readCalls = m.request.mock.calls.length;
    act(() => { notifyAppLock('manual'); });
    await act(async () => {
      if (status === 'submitted') result.resolve({ hash: HASH, sent: attempted.amount, maxGasCost: 1n, attempt: { ...attempted, status }, simulation: 'ok' });
      else result.reject(new sweepLib.DirectSweepOutcomeUnknownError('Synthetic response ended after handoff', attempted, 'unavailable'));
      await result.promise.catch(() => undefined);
    });
    expect(screen.getByText(CHOOSE)).toBeTruthy();
    expect(document.body.textContent).not.toContain(OWNER);
    expect(document.body.textContent).not.toContain(HASH);
    expect(screen.queryByText('Sweep broadcast.')).toBeNull();
    expect(screen.queryByText(/Synthetic response ended/)).toBeNull();
    expect(getSweepAttempt(CHAIN, OWNER)).toMatchObject({ expectedHash: HASH, nonce: 7, status });
    expect(sessionStorage.getItem(SWEEP_JOURNAL_KEY)).toContain(HASH);
    expect(sessionStorage.getItem(SWEEP_JOURNAL_KEY)).toContain(status);
    expect(m.request).toHaveBeenCalledTimes(readCalls);
    expect(m.fetchFn).not.toHaveBeenCalled();
    expect(direct).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Open recorded payment' }));
    expect(screen.getByText(HASH)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: READ }));
    await screen.findByText('5 USDC');
    fireEvent.change(screen.getByLabelText(/^Destination address/), { target: { value: DESTINATION } });
    fireEvent.click(screen.getByLabelText(/^Directly/));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: DIRECT }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: DIRECT }));
    expect(direct).toHaveBeenCalledOnce();
    expect(getSweepAttempt(CHAIN, OWNER)).toMatchObject({ expectedHash: HASH, nonce: 7, status });
  });
});
