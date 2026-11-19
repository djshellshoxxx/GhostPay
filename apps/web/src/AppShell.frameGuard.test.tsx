// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLean } from './AppLean';
import * as frameGuard from './lib/frameGuard';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from './lib/keyVault';
import { clearSession } from './lib/session';
import { renderWith, setHash } from './test/render';

// The full App (and with it the BTC packages) is not needed for the lean shell under test.
vi.mock('./App', () => ({ App: () => null }));

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setHash('');
  setKeyVaultStoreForTests(new MemoryKeyVaultStore());
});
afterEach(() => { vi.restoreAllMocks(); setKeyVaultStoreForTests(undefined); });

const REFUSAL = /Open GhostPay in its own tab/;

// SEC-18: a framed instance (simulated: window.top !== window.self) refuses seller/key/sweep views.
describe('AppShell frame guard (SEC-18)', () => {
  it('refuses seller, create, scan, sweep, registry and settings views when framed, with a new-tab link', async () => {
    vi.spyOn(frameGuard, 'isFramed').mockReturnValue(true);
    const user = userEvent.setup();
    renderWith(<AppLean />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const label of ['Seller keys', 'Create invoice', 'Scan and receive', 'Sweep', 'Public registry', 'Settings']) {
      await user.click(within(nav).getByRole('button', { name: label }));
      const main = screen.getByRole('main');
      expect(within(main).getByText(REFUSAL), label).toBeTruthy();
      // No key material controls render behind the refusal.
      expect(within(main).queryByRole('button', { name: /Generate|Import|Sweep|Scan|Save/i }), label).toBeNull();
      const link = within(main).getByRole('link', { name: /Open in a new tab/ });
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')?.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
      expect(link.getAttribute('href')).toBe('./');
    }
  });

  it('keeps home, pay and about usable when framed', async () => {
    vi.spyOn(frameGuard, 'isFramed').mockReturnValue(true);
    const user = userEvent.setup();
    renderWith(<AppLean />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const label of ['Home', 'Pay', 'About and privacy']) {
      await user.click(within(nav).getByRole('button', { name: label }));
      expect(within(screen.getByRole('main')).queryByText(REFUSAL), label).toBeNull();
    }
  });

  it('renders every view normally in a top-level context', async () => {
    const user = userEvent.setup();
    renderWith(<AppLean />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    await user.click(within(nav).getByRole('button', { name: 'Seller keys' }));
    expect(within(screen.getByRole('main')).queryByText(REFUSAL)).toBeNull();
  });
});

// SEC-09: a build served from another origin than the declared one says so on every view.
describe('AppShell declared-origin warning (SEC-09)', () => {
  it('shows a visible warning when the page origin differs from the declared origin', () => {
    vi.spyOn(frameGuard, 'currentOriginCheck').mockReturnValue({ declared: 'https://pay.example', actual: 'https://djshellshoxxx.github.io' });
    renderWith(<AppLean />);
    const main = screen.getByRole('main');
    expect(within(main).getByText(/not served from its declared address/)).toBeTruthy();
    expect(within(main).getByText(/made for https:\/\/pay\.example, but this page is served from https:\/\/djshellshoxxx\.github\.io/)).toBeTruthy();
  });

  it('shows nothing on the declared origin or when no origin is declared', () => {
    vi.spyOn(frameGuard, 'currentOriginCheck').mockReturnValue({ declared: window.location.origin, actual: window.location.origin });
    const first = renderWith(<AppLean />);
    expect(screen.queryByText(/not served from its declared address/)).toBeNull();
    first.unmount();
    vi.spyOn(frameGuard, 'currentOriginCheck').mockReturnValue({ declared: undefined, actual: window.location.origin });
    renderWith(<AppLean />);
    expect(screen.queryByText(/not served from its declared address/)).toBeNull();
  });
});
