// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../lib/settings';
import { exportSettingsExchange } from '../lib/settingsExchange';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  document.documentElement.removeAttribute('data-theme');
});

const stored = (): Record<string, unknown> =>
  JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;

describe('Settings partial import: unselected unsaved form drafts (GP-BUG-04)', () => {
  it('applies selected preferences without erasing or prematurely saving unrelated RPC, relayer and signer drafts', async () => {
    const user = userEvent.setup();
    renderApp(makeServices());
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }));

    const rpc = screen.getByLabelText<HTMLInputElement>('Base Sepolia RPC URL');
    const secondary = screen.getByLabelText<HTMLInputElement>('Base Sepolia second RPC URL (optional)');
    const relayer = screen.getByLabelText<HTMLInputElement>('Relayer URL (optional)');
    const pins = screen.getByLabelText<HTMLTextAreaElement>(/Pinned seller signing keys/);
    const signer = `02${'ab'.repeat(32)}`;

    await user.type(rpc, 'https://pending-rpc.example');
    await user.type(secondary, 'https://pending-secondary.example');
    await user.type(relayer, 'https://pending-relayer.example');
    await user.type(pins, signer);
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBeNull();

    const transfer = exportSettingsExchange({ ...DEFAULT_SETTINGS, theme: 'light' });
    fireEvent.change(screen.getByLabelText('Or paste QR text'), { target: { value: transfer } });
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect(await screen.findByText('Review imported settings')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Apply selected settings' }));

    await waitFor(() => { expect(screen.getByLabelText<HTMLSelectElement>('Theme').value).toBe('light'); });
    expect(rpc.value).toBe('https://pending-rpc.example');
    expect(secondary.value).toBe('https://pending-secondary.example');
    expect(relayer.value).toBe('https://pending-relayer.example');
    expect(pins.value).toBe(signer);
    // Import writes only selected preferences; the unselected drafts must not leak into persistent settings.
    expect(stored()['rpcUrls']).toEqual({});
    expect(stored()['rpcUrlsSecondary']).toEqual({});
    expect(stored()['relayerUrl']).toBe('');
    expect(stored()['pinnedSigners']).toEqual([]);

    // A later explicit save keeps both the imported preferences and the previously unsaved drafts.
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => {
      expect(stored()).toMatchObject({
        theme: 'light',
        rpcUrls: { '84532': 'https://pending-rpc.example/' },
        rpcUrlsSecondary: { '84532': 'https://pending-secondary.example/' },
        relayerUrl: 'https://pending-relayer.example',
        pinnedSigners: [signer],
      });
    });
  });
});
