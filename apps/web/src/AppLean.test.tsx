// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FRAGMENT_PREFIX } from '@ghostpay/invoice-schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppLean } from './AppLean';
import { AppShell } from './AppShell';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from './lib/keyVault';
import { clearSession, generateSession, hasSession } from './lib/session';
import { SETTINGS_KEY } from './lib/settings';
import { makeServices, renderWith, setHash } from './test/render';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setHash('');
  document.documentElement.removeAttribute('data-theme');
});

describe('AppLean', () => {
  it('exposes only the core routes, in order', () => {
    renderWith(<AppLean />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const labels = within(nav).getAllByRole('button').map((b) => b.textContent);
    expect(labels).toEqual([
      'Home', 'Seller keys', 'Create invoice', 'Pay', 'Scan and receive', 'Sweep', 'Public registry', 'Settings', 'About and privacy',
    ]);
    for (const gone of [/Bitcoin/, /Solana/, /TRON/, /Policy/]) {
      expect(within(nav).queryByRole('button', { name: gone })).toBeNull();
    }
  });

  it('navigates core views, marks current page and moves focus to main', async () => {
    const user = userEvent.setup();
    renderWith(<AppLean />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    await user.click(within(nav).getByRole('button', { name: 'Settings' }));
    expect(within(nav).getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { level: 2, name: /^Settings$/ })).toBeTruthy();
    expect(document.activeElement?.id).toBe('main');
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#main');
  });

  it('falls back to Home when navigating to a view id with no supplied extra view', async () => {
    const user = userEvent.setup();
    renderWith(<AppShell order={['home', 'btc']} />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    await user.click(within(nav).getByRole('button', { name: 'Bitcoin' }));
    expect(within(nav).getByRole('button', { name: 'Bitcoin' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { level: 2, name: /^What do you want to do\?$/ })).toBeTruthy();
  });

  it('opens Pay from an invoice fragment hash and clears the fragment by default', async () => {
    setHash(`${FRAGMENT_PREFIX}synthetic-invoice`);
    renderWith(<AppLean />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('button', { name: 'Pay' }).getAttribute('aria-current')).toBe('page');
    await waitFor(() => { expect(window.location.hash).toBe(''); });
  });

  it('follows a later hashchange to the Pay view', async () => {
    renderWith(<AppLean />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    setHash(`${FRAGMENT_PREFIX}another-synthetic-invoice`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => {
      expect(within(nav).getByRole('button', { name: 'Pay' }).getAttribute('aria-current')).toBe('page');
    });
  });

  it('locks local tags after the idle timeout', async () => {
    const services = makeServices();
    await services.vault.unlock(new Uint8Array(32).fill(3));
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin: 1 }));
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    try {
      renderWith(<AppLean />, services);
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
      renderWith(<AppLean />, services);
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
