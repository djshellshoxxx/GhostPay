// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, generateSession, getSessionPublic, hasSession, importSession, revealViewingKey } from './lib/session';
import { MemoryKeyVaultStore, saveEncryptedVault, setKeyVaultStoreForTests, unlockEncryptedVault } from './lib/keyVault';
import { SETTINGS_KEY } from './lib/settings';
import { subscribeAppLock } from './lib/appLock';
import * as disclosure from './components/Disclosure';
import { makeServices, renderApp, setHash } from './test/render';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setHash('');
  document.documentElement.removeAttribute('data-theme');
});

describe('App shell', () => {
  it('renders navigation with the current page marked, and every view heading', async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByRole('heading', { level: 1, name: 'GhostPay' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    const views: [string, RegExp][] = [
      ['Seller keys', /^Seller keys$/],
      ['Create invoice', /^Create invoice$/],
      ['Pay', /^Pay an invoice$/],
      ['Scan and receive', /^Scan and receive$/],
      ['Sweep', /^Sweep$/],
      ['Settings', /^Settings$/],
      ['About and privacy', /^About and privacy$/],
      ['Home', /^What do you want to do\?$/],
    ];
    for (const [label, heading] of views) {
      await user.click(within(nav).getByRole('button', { name: label }));
      expect(within(nav).getByRole('button', { name: label }).getAttribute('aria-current')).toBe('page');
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy();
    }
  });

  it('moves focus to the main region on navigation and has a skip link', async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#main');
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(document.activeElement?.id).toBe('main');
  });

  it('home buttons navigate', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Seller keys' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Seller keys' })).toBeTruthy();
  });

  it('applies the saved theme to the document', () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'dark' }));
    renderApp(makeServices());
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('locks local tags after the idle timeout', async () => {
    const services = makeServices();
    await services.vault.unlock(new Uint8Array(32).fill(3));
    expect(services.vault.unlocked).toBe(true);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin: 1 }));
    vi.useFakeTimers();
    try {
      renderApp(services);
      vi.advanceTimersByTime(61_000);
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => { expect(services.vault.unlocked).toBe(false); });
  });

  it('L1-04: locks local tags whenever the seller keys are wiped or replaced', async () => {
    const services = makeServices();
    renderApp(services);
    act(() => { generateSession(); });
    await services.vault.unlock(revealViewingKey());
    const lock = vi.spyOn(services.vault, 'lock');
    act(() => { clearSession(); });
    expect(lock).toHaveBeenCalledTimes(1);
    act(() => { generateSession(); });
    expect(lock).toHaveBeenCalledTimes(2);
  });

  it('clears backed-up seller keys at idle lock, says so visibly and preserves the encrypted vault', async () => {
    const services = makeServices();
    const store = new MemoryKeyVaultStore();
    await store.putIfEmpty('{"ciphertext":"encrypted-only"}');
    setKeyVaultStoreForTests(store);
    importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32), signingKeyHex: '33'.repeat(32) });
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin: 1 }));
    vi.useFakeTimers();
    try {
      renderApp(services);
      expect(hasSession()).toBe(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
      expect(hasSession()).toBe(false);
      expect(services.vault.unlocked).toBe(false);
      expect(await store.get()).toBe('{"ciphertext":"encrypted-only"}');
      // These keys came with their signing key: nothing was lost, so the notice names no lost signing key (C-R10).
      expect(screen.getByText(/Seller keys were wiped from memory after 1 minute without activity/).textContent).not.toMatch(/signing key/);
    } finally {
      vi.useRealTimers();
      setKeyVaultStoreForTests(undefined);
    }
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/Seller keys were wiped from memory/)).toBeNull();
  });

  it('L1-01: the idle lock never wipes keys that exist nowhere else and keeps a visible backup banner', async () => {
    const services = makeServices();
    setKeyVaultStoreForTests(new MemoryKeyVaultStore());
    const pub = generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin: 15 }));
    vi.useFakeTimers();
    try {
      renderApp(services);
      await act(async () => { await services.vault.unlock(revealViewingKey()); });
      await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60_000 + 1000); });
      expect(hasSession()).toBe(true);
      expect(getSessionPublic()?.metaAddress).toBe(pub.metaAddress);
      expect(services.vault.unlocked).toBe(false);
      const banner = screen.getByText('These seller keys have no backup').closest('.notice');
      expect(banner?.closest('.sr-only')).toBeNull();
      expect(document.querySelector('[role="status"][aria-live]')?.textContent).toBe('Local tags locked after inactivity. Seller keys stay loaded because they have no backup yet.');
    } finally {
      vi.useRealTimers();
      setKeyVaultStoreForTests(undefined);
    }
  });

  it('C-R10: the idle lock wipes hex keys whose signing key was generated here, and says that this key is gone', async () => {
    setKeyVaultStoreForTests(new MemoryKeyVaultStore());
    importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32) });
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin: 1 }));
    vi.useFakeTimers();
    try {
      renderApp(makeServices());
      // The typed hex loads the spending and viewing keys again: only the generated signing key has no copy.
      const banner = screen.getByText('The invoice-signing key has no backup').closest('.notice');
      expect(banner?.textContent).toMatch(/Payments to your meta-address stay sweepable with the spending and viewing keys you imported\./);
      expect(banner?.textContent).not.toMatch(/every payment/);
      expect(screen.queryByText('These seller keys have no backup')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
      expect(hasSession()).toBe(false);
      expect(document.querySelector('[role="status"][aria-live]')?.textContent).toBe('Seller keys wiped from memory and local tags locked after inactivity.');
      expect(screen.getByText(/Seller keys were wiped from memory after 1 minute without activity/).textContent)
        .toMatch(/The invoice-signing key generated when the hex keys were imported had no backup and is gone: loading them again generates a new one\./);
    } finally {
      vi.useRealTimers();
      setKeyVaultStoreForTests(undefined);
    }
  });

  it('C-R10: keeps Create invoice behind the backup gate while the generated signing key has no backup, saying why', async () => {
    importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32) });
    const user = userEvent.setup();
    renderApp(makeServices());
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Create invoice' }));
    const gate = screen.getByText('Back up these seller keys first').closest('.notice');
    expect(gate?.textContent).toMatch(/Payments stay sweepable with the spending and viewing keys you imported, but invoices are signed with an invoice-signing key that exists only in this tab\./);
    expect(gate?.textContent).not.toMatch(/lost for good/);
    expect(screen.queryByRole('button', { name: 'Create invoice link' })).toBeNull();
    await user.type(screen.getByLabelText(/To continue without a backup/), 'continue without backup');
    await user.click(screen.getByRole('button', { name: 'Continue without a backup' }));
    expect(screen.getByRole('button', { name: 'Create invoice link' })).toBeTruthy();
    expect(screen.getByText('The invoice-signing key has no backup')).toBeTruthy();
  });

  it('L1-01: wipes vault-only keys at idle lock while their vault is saved, and keeps them once another tab deleted it', async () => {
    const store = new MemoryKeyVaultStore();
    setKeyVaultStoreForTests(store);
    generateSession();
    await saveEncryptedVault('violet comet maple lantern', { N: 1 << 14 });
    const record = (await store.get())!;
    clearSession();
    await unlockEncryptedVault('violet comet maple lantern');
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin: 1 }));
    vi.useFakeTimers();
    try {
      renderApp(makeServices());
      await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
      expect(hasSession()).toBe(false);
      expect(document.querySelector('[role="status"][aria-live]')?.textContent).toBe('Seller keys wiped from memory and local tags locked after inactivity.');
      vi.useRealTimers();
      await act(async () => { await unlockEncryptedVault('violet comet maple lantern'); });
      await store.delete(record);                     // removed from another tab: the keys in memory are the only copy
      vi.useFakeTimers();
      fireEvent.pointerDown(window);                  // activity re-arms the idle timer
      await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
      expect(document.querySelector('[role="status"][aria-live]')?.textContent).toBe('Local tags locked after inactivity. Seller keys stay loaded because they have no backup yet.');
      expect(hasSession()).toBe(true);
      expect(screen.getByText('These seller keys have no backup')).toBeTruthy();
    } finally {
      vi.useRealTimers();
      setKeyVaultStoreForTests(undefined);
    }
  });
});

describe('App wiring of the audit 24 fixes', () => {
  it('G2-02: the idle lock signals the views that hold their own keys', () => {
    const reasons: string[] = [];
    const off = subscribeAppLock((reason) => { reasons.push(reason); });
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin: 1 }));
    vi.useFakeTimers();
    try {
      renderApp();
      vi.advanceTimersByTime(59_000);
      expect(reasons).toEqual([]);
      vi.advanceTimersByTime(2_000);
    } finally {
      vi.useRealTimers();
      off();
    }
    expect(reasons).toEqual(['idle']);
  });

  it('G1-01: a view that fails to render shows the error panel inside the app, and Back to Home leaves it', async () => {
    const user = userEvent.setup();
    const failing = vi.spyOn(disclosure, 'ChainFeeList').mockImplementation(() => { throw new Error('render failed'); });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      renderApp();
      const nav = screen.getByRole('navigation', { name: 'Main' });
      await user.click(within(nav).getByRole('button', { name: 'About and privacy' }));
      expect(await screen.findByText('This page stopped after an unexpected error')).toBeTruthy();
      expect(screen.getByRole('heading', { level: 1, name: 'GhostPay' })).toBeTruthy();
      failing.mockRestore();
      await user.click(screen.getByRole('button', { name: 'Back to Home' }));
      expect(within(nav).getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
      expect(screen.queryByText('This page stopped after an unexpected error')).toBeNull();
    } finally {
      failing.mockRestore();
      quiet.mockRestore();
    }
  });
});
