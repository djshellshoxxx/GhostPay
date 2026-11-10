// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
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

  it('keeps the staged filename reviewable across picker cancellation and replacement, then clears it at lock', async () => {
    const user = userEvent.setup();
    renderApp(makeServices());
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
    await user.click(screen.getByText('Import an encrypted keystore'));
    const input = screen.getByLabelText<HTMLInputElement>('Keystore file');
    const helpIds = input.getAttribute('aria-describedby')!.split(' ');
    const description = (): string => (input.getAttribute('aria-describedby') ?? '').split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '').join(' ');

    await user.upload(input, new File(['encrypted fixture'], 'first-keys.json', { type: 'application/json' }));
    expect(input.value).toBe(''); // Same-file retry remains available through the native picker.
    expect(description()).toContain('Selected file: first-keys.json');
    expect(screen.getByText('first-keys.json').closest('[hidden]')).toBeNull();
    expect(input.getAttribute('aria-describedby')!.split(' ')).toEqual(expect.arrayContaining(helpIds));

    fireEvent.change(input, { target: { files: [] } });
    expect(description()).toContain('Selected file: first-keys.json');

    await user.upload(input, new File(['replacement'], 'second-\u202Egnp.json', { type: 'application/json' }));
    expect(screen.queryByText('first-keys.json')).toBeNull();
    expect(description()).toContain('Selected file: second-⟨U+202E⟩gnp.json');
    expect(description()).not.toContain('\u202E');
    expect(input.getAttribute('aria-describedby')!.split(' ')).toEqual(expect.arrayContaining(helpIds));

    act(() => { notifyAppLock('idle'); });
    expect(description()).not.toContain('Selected file:');
    expect(input.getAttribute('aria-describedby')!.split(' ')).toEqual(helpIds);
    expect(screen.queryByText('second-⟨U+202E⟩gnp.json')).toBeNull();
  });
});
