// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, generateSession, hasSession } from './lib/session';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from './lib/keyVault';
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
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    try {
      renderApp(services);
      vi.advanceTimersByTime(61_000);
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => { expect(services.vault.unlocked).toBe(false); });
  });

  it('clears seller keys at idle lock while preserving the encrypted vault', async () => {
    const services = makeServices();
    const store = new MemoryKeyVaultStore();
    await store.putIfEmpty('{"ciphertext":"encrypted-only"}');
    setKeyVaultStoreForTests(store);
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin: 1 }));
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    try {
      renderApp(services);
      expect(hasSession()).toBe(true);
      vi.advanceTimersByTime(61_000);
      expect(hasSession()).toBe(false);
      expect(services.vault.unlocked).toBe(false);
      expect(await store.get()).toBe('{"ciphertext":"encrypted-only"}');
    } finally {
      vi.useRealTimers();
      setKeyVaultStoreForTests(undefined);
    }
  });
});
