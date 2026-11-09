// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import * as session from '../lib/session';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from '../lib/keyVault';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => { session.clearSession(); setKeyVaultStoreForTests(new MemoryKeyVaultStore()); window.localStorage.clear(); window.history.replaceState(null, '', '/'); });
afterEach(() => { setKeyVaultStoreForTests(undefined); vi.restoreAllMocks(); });

describe('keystore import lock boundary', () => {
  it('does not decrypt or install keys after a pending file read outlives the app lock', async () => {
    let finish!: (text: string) => void;
    const file = new File(['encrypted fixture'], 'keys.json', { type: 'application/json' });
    const read = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
    Object.defineProperty(file, 'text', { value: read });
    const load = vi.spyOn(session, 'importKeystore').mockImplementation(() => Promise.resolve(session.generateSession()));
    const user = userEvent.setup();
    renderApp(makeServices());
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
    await user.click(screen.getByText('Import an encrypted keystore'));
    await user.upload(screen.getByLabelText('Keystore file'), file);
    await user.type(screen.getByLabelText('Passphrase'), 'fixture passphrase');
    await user.click(screen.getByRole('button', { name: 'Decrypt and load' }));
    await waitFor(() => { expect(read).toHaveBeenCalledOnce(); });
    act(() => { notifyAppLock('idle'); });
    await act(async () => { finish('encrypted fixture'); await Promise.resolve(); });
    expect(load).not.toHaveBeenCalled();
    expect(session.getSessionPublic()).toBeUndefined();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Decrypt and load' }).disabled).toBe(false);
  });
});
