// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLean } from './AppLean';
import { MemoryKeyVaultStore, saveEncryptedVault, setKeyVaultStoreForTests } from './lib/keyVault';
import { captureSessionVersionGuard, clearSession, generateSession, getSessionBackup, importSession, markKeystoreDownloaded, sessionHasExternalCopy, verifyDownloadedBackup, waiveSessionBackup } from './lib/session';
import { renderWith, setHash } from './test/render';

vi.mock('./App', () => ({ App: () => null }));

const PASS = 'violet comet maple lantern';
let store: MemoryKeyVaultStore;

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setHash('');
  store = new MemoryKeyVaultStore();
  setKeyVaultStoreForTests(store);
});
afterEach(() => { act(() => { clearSession(); }); vi.restoreAllMocks(); setKeyVaultStoreForTests(undefined); });

/** True when leaving the page would show the browser's "leave site?" prompt. */
function leavePrompts(): boolean {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

// SEC-40 / E-12: closing or navigating the tab while seller keys exist only in memory (backup not verified) loses them.
describe('AppShell beforeunload guard (SEC-40)', () => {
  it('prompts while loaded keys have no verified external backup', () => {
    renderWith(<AppLean />);
    expect(leavePrompts()).toBe(false);
    act(() => { generateSession(); });
    expect(leavePrompts()).toBe(true);
    // A downloaded but unverified keystore may never have reached the disk (GP-PAGES-02): still prompts.
    act(() => { markKeystoreDownloaded(captureSessionVersionGuard()); });
    expect(leavePrompts()).toBe(true);
    // A waiver accepts sharing before a backup; the keys are still not saved anywhere.
    act(() => { waiveSessionBackup(); });
    expect(leavePrompts()).toBe(true);
    act(() => { clearSession(); });
    expect(leavePrompts()).toBe(false);
  });

  it('does not prompt for imported keys (a verified copy exists elsewhere)', () => {
    renderWith(<AppLean />);
    act(() => { importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32), signingKeyHex: '33'.repeat(32) }); });
    expect(leavePrompts()).toBe(false);
  });

  it('protects the only key copy when another tab deletes the saved vault without notifying this tab', async () => {
    renderWith(<AppLean />);
    act(() => { generateSession(); });
    await act(async () => { await saveEncryptedVault(PASS, { N: 1 << 14 }, store); });
    const saved = await store.get();
    expect(saved).toBeDefined();
    const cached = getSessionBackup();
    expect(cached?.verified).toBe(true);
    expect(sessionHasExternalCopy()).toBe(false);

    // A different tab changes the same backing store. It cannot update this tab's in-memory custody summary.
    await store.delete(saved!);
    expect(await store.get()).toBeUndefined();
    expect(getSessionBackup()).toBe(cached);
    expect(leavePrompts()).toBe(true);
  });

  it('uses current external-copy verification even when the cached vault backup summary does not change', async () => {
    renderWith(<AppLean />);
    act(() => { generateSession(); });
    await act(async () => { await saveEncryptedVault(PASS, { N: 1 << 14 }, store); });
    const saved = await store.get();
    expect(saved).toBeDefined();
    const cached = getSessionBackup();
    expect(leavePrompts()).toBe(true);

    await act(async () => { await verifyDownloadedBackup(saved!, PASS); });
    // vaultStored already made the public summary verified: this transition need not cause a React render.
    expect(getSessionBackup()).toBe(cached);
    expect(sessionHasExternalCopy()).toBe(true);
    expect(leavePrompts()).toBe(false);
    await store.delete(saved!);
    expect(leavePrompts()).toBe(false);
  });

  it('still prompts when only a newly generated invoice-signing key lacks an external copy', () => {
    renderWith(<AppLean />);
    act(() => { importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32) }); });
    expect(getSessionBackup()?.signerOnly).toBe(true);
    expect(leavePrompts()).toBe(true);
  });

  it('removes the listener when the shell unmounts', () => {
    const view = renderWith(<AppLean />);
    act(() => { generateSession(); });
    view.unmount();
    expect(leavePrompts()).toBe(false);
  });
});
