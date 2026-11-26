// @vitest-environment jsdom
// #622 x #689 composition: while the session is idle-suspended, Seller keys keeps the keystore recovery export and the
// stealth-export recovery opener, but does not offer the master-key backup, which needs active authority.
import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from '../lib/keyVault';
import { clearSession, generateSession, isSessionSuspended, suspendSession } from '../lib/session';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => {
  clearSession();
  setKeyVaultStoreForTests(new MemoryKeyVaultStore());
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => { cleanup(); clearSession(); setKeyVaultStoreForTests(undefined); });

describe('stealth key exports while idle-suspended', () => {
  it('hides the master backup but keeps the keystore export and the recovery opener', async () => {
    generateSession();
    const user = userEvent.setup();
    renderApp(makeServices());
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
    expect(screen.getByRole('heading', { name: 'Master stealth key backup (encrypted)' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Open a stealth key export' })).toBeTruthy();

    act(() => { suspendSession(); });
    expect(isSessionSuspended()).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Master stealth key backup (encrypted)' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download master backup' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Open a stealth key export' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download encrypted keystore' })).toBeTruthy();
  });
});
