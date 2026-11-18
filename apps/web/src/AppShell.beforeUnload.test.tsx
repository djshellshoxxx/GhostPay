// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLean } from './AppLean';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from './lib/keyVault';
import { captureSessionVersionGuard, clearSession, generateSession, importSession, markKeystoreDownloaded, waiveSessionBackup } from './lib/session';
import { renderWith, setHash } from './test/render';

vi.mock('./App', () => ({ App: () => null }));

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setHash('');
  setKeyVaultStoreForTests(new MemoryKeyVaultStore());
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
  it('prompts only while loaded keys have no verified backup', () => {
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

  it('removes the listener when the shell unmounts', () => {
    const view = renderWith(<AppLean />);
    act(() => { generateSession(); });
    view.unmount();
    expect(leavePrompts()).toBe(false);
  });
});
