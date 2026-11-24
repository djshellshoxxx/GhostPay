// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FRAGMENT_PREFIX } from '@ghostpay/invoice-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLean } from './AppLean';
import { App } from './App';
import { AppShell } from './AppShell';
import * as home from './views/Home';
import * as disclosure from './components/Disclosure';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from './lib/keyVault';
import * as keyVault from './lib/keyVault';
import { clearSession, generateSession, getSessionPublic, hasSession, importSession, revealViewingKey } from './lib/session';
import { SETTINGS_KEY } from './lib/settings';
import { useApp } from './state';
import { makeServices, renderWith, setHash } from './test/render';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setHash('');
  document.documentElement.removeAttribute('data-theme');
  setKeyVaultStoreForTests(new MemoryKeyVaultStore());
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); setKeyVaultStoreForTests(undefined); });

describe('one-EVM AppLean boundary', () => {
  it('exposes core EVM routes without optional chain/policy navigation', () => {
    renderWith(<AppLean />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Home', 'Seller keys', 'Create invoice', 'Pay', 'Scan and receive', 'Sweep', 'Public registry', 'Settings', 'About and privacy',
    ]);
    for (const label of [/Bitcoin/, /Solana/, /TRON/, /Policy/]) expect(within(nav).queryByRole('button', { name: label })).toBeNull();
  });

  it('preserves navigation, focus and fragment-to-Pay behavior', async () => {
    const user = userEvent.setup();
    renderWith(<AppLean />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    await user.click(within(nav).getByRole('button', { name: 'Settings' }));
    expect(document.activeElement?.id).toBe('main');
    expect(within(nav).getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');
    setHash(`${FRAGMENT_PREFIX}controlled-invalid-invoice`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => { expect(within(nav).getByRole('button', { name: 'Pay' }).getAttribute('aria-current')).toBe('page'); });
    expect(window.location.hash).toBe('');
  });

  it('rejects unsupported internal navigation rather than selecting a hidden route', async () => {
    vi.spyOn(home, 'Home').mockImplementation(function NavigationProbe() {
      const app = useApp();
      return <button type="button" onClick={() => { app.setView('btc'); }}>Request deferred route</button>;
    });
    const user = userEvent.setup();
    renderWith(<AppLean />);
    await user.click(screen.getByRole('button', { name: 'Request deferred route' }));
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
  });

  it('retains the core public EVM registry view', async () => {
    const user = userEvent.setup();
    renderWith(<AppLean />);
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Public registry' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Public registry (ERC-6538)' })).toBeTruthy();
  });

  it('omits tag archive in lean Seller keys while retaining its key backup flow', async () => {
    generateSession();
    const user = userEvent.setup();
    renderWith(<AppLean />);
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
    expect(screen.queryByRole('button', { name: 'Download encrypted tag archive' })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Seller keys' })).toBeTruthy();
    expect(screen.getByText('These seller keys have no backup')).toBeTruthy();
  });

  it('retains the create-invoice backup gate', async () => {
    generateSession();
    const user = userEvent.setup();
    renderWith(<AppLean />);
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Create invoice' }));
    expect(screen.getByText('Back up these seller keys first')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create invoice link' })).toBeNull();
  });

  it('does not wipe the only copy of seller keys at idle', async () => {
    const services = makeServices();
    const original = generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin: 1 }));
    vi.useFakeTimers();
    renderWith(<AppLean />, services);
    await act(async () => { await services.vault.unlock(revealViewingKey()); await vi.advanceTimersByTimeAsync(61_000); });
    expect(services.vault.unlocked).toBe(false);
    expect(hasSession()).toBe(true);
    expect(getSessionPublic()?.metaAddress).toBe(original.metaAddress);
    expect(screen.getByText('These seller keys have no backup')).toBeTruthy();
  });

  it('still wipes backed-up keys and explains the idle wipe', async () => {
    importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32), signingKeyHex: '33'.repeat(32) });
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin: 1 }));
    vi.useFakeTimers();
    renderWith(<AppLean />);
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
    expect(hasSession()).toBe(false);
    expect(screen.getByText(/Seller keys were wiped from memory after 1 minute/)).toBeTruthy();
  });

  it('keeps the current render ErrorBoundary and its Home recovery', async () => {
    const user = userEvent.setup();
    const failing = vi.spyOn(disclosure, 'ChainFeeList').mockImplementation(() => { throw new Error('controlled render failure'); });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderWith(<AppLean />);
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'About and privacy' }));
    expect(await screen.findByText('This page stopped after an unexpected error')).toBeTruthy();
    failing.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Back to Home' }));
    expect(screen.queryByText('This page stopped after an unexpected error')).toBeNull();
  });

  it('preserves full default navigation and TagArchive', async () => {
    generateSession();
    const user = userEvent.setup();
    renderWith(<App />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('button', { name: /Bitcoin/ })).toBeTruthy();
    await user.click(within(nav).getByRole('button', { name: 'Seller keys' }));
    expect(screen.getByRole('button', { name: 'Download encrypted tag archive' })).toBeTruthy();
  });

  it('keeps optional full-profile views when the shell profile is unspecified', async () => {
    const user = userEvent.setup();
    renderWith(<AppShell order={['home', 'btc']} extraViews={{ btc: <h2>Controlled additional view</h2> }} />);
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Bitcoin (test)' }));
    expect(screen.getByRole('heading', { name: 'Controlled additional view' })).toBeTruthy();
  });

  it('keeps full-profile Home fallback for an unsupplied optional view', async () => {
    const user = userEvent.setup();
    renderWith(<AppShell order={['home', 'btc']} />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    await user.click(within(nav).getByRole('button', { name: 'Bitcoin (test)' }));
    expect(within(nav).getByRole('button', { name: 'Bitcoin (test)' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { name: /^What do you want to do\?$/ })).toBeTruthy();
  });

  it('cannot let a delayed idle recoverability answer wipe a replacement session', async () => {
    let complete: ((value: boolean) => void) | undefined;
    const answer = new Promise<boolean>((resolve) => { complete = resolve; });
    const checking = vi.spyOn(keyVault, 'loadedKeysRecoverable').mockReturnValue(answer);
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin: 1 }));
    vi.useFakeTimers();
    renderWith(<AppLean />);
    act(() => { vi.advanceTimersByTime(61_000); });
    expect(checking).toHaveBeenCalledTimes(1);
    let replacement: ReturnType<typeof generateSession> | undefined;
    act(() => { replacement = generateSession(); });
    await act(async () => { complete?.(true); await Promise.resolve(); });
    expect(hasSession()).toBe(true);
    expect(getSessionPublic()?.metaAddress).toBe(replacement?.metaAddress);
    expect(screen.getByText('These seller keys have no backup')).toBeTruthy();
  });
});
