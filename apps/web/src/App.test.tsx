// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, generateSession, getSessionPublic, hasSession, importSession, revealViewingKey } from './lib/session';
import { MemoryKeyVaultStore, saveEncryptedVault, setKeyVaultStoreForTests, unlockEncryptedVault } from './lib/keyVault';
import { SETTINGS_KEY } from './lib/settings';
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
    importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32) });
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin: 1 }));
    vi.useFakeTimers();
    try {
      renderApp(services);
      expect(hasSession()).toBe(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
      expect(hasSession()).toBe(false);
      expect(services.vault.unlocked).toBe(false);
      expect(await store.get()).toBe('{"ciphertext":"encrypted-only"}');
      expect(screen.getByText(/Seller keys were wiped from memory after 1 minute without activity/)).toBeTruthy();
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
      expect(document.querySelector('[role="status"][aria-live]')?.textContent).toBe('Seller keys and local tags locked after inactivity.');
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
