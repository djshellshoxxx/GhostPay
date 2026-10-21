// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChainAdapterError } from '@ghostpay/chain-adapters';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_KEY } from '../lib/settings';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  document.documentElement.removeAttribute('data-theme');
});

async function open(services = makeServices()): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }));
  return user;
}

const stored = (): Record<string, unknown> => JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;

describe('Settings', () => {
  it('warns that settings are plaintext and that no RPC is built in', async () => {
    await open();
    expect(screen.getByText(/kept in this browser in plain text/)).toBeTruthy();
    expect(screen.getByText(/No default RPC is built in/)).toBeTruthy();
  });

  it('validates and saves RPC URL, relayer, delay, lock timeout, theme, pins; applies the theme', async () => {
    const user = await open();
    const pin = `02${'ab'.repeat(32)}`;
    await user.type(screen.getByLabelText('Base Sepolia RPC URL'), 'https://rpc.example/v1');
    await user.type(screen.getByLabelText('Relayer URL (optional)'), 'https://relay.example');
    await user.clear(screen.getByLabelText('Minimum delay (seconds)'));
    await user.type(screen.getByLabelText('Minimum delay (seconds)'), '30');
    await user.clear(screen.getByLabelText('Maximum delay (seconds)'));
    await user.type(screen.getByLabelText('Maximum delay (seconds)'), '90');
    await user.clear(screen.getByLabelText(/Lock local tags/));
    await user.type(screen.getByLabelText(/Lock local tags/), '5');
    await user.selectOptions(screen.getByLabelText('Theme'), 'dark');
    await user.click(screen.getByLabelText('Remove the invoice from the address bar after reading it'));
    await user.type(screen.getByLabelText(/Pinned seller signing keys/), pin);
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Settings saved.')).toBeTruthy();
    expect(stored()).toMatchObject({
      rpcUrls: { '84532': 'https://rpc.example/v1' },
      relayerUrl: 'https://relay.example',
      delayMinSec: 30,
      delayMaxSec: 90,
      lockTimeoutMin: 5,
      theme: 'dark',
      autoClearFragment: false,
      pinnedSigners: [pin],
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(JSON.stringify(stored())).not.toMatch(/secret|private|seed/i);
  });

  it.each([
    ['Base Sepolia RPC URL', 'http://insecure.example', /RPC URL rejected/],
    ['Base Sepolia RPC URL', 'https://user:pw@rpc.example', /RPC URL rejected/],
    ['Relayer URL (optional)', 'http://relay.example', /must be https/],
  ])('rejects bad %s', async (label, value, re) => {
    const user = await open();
    await user.type(screen.getByLabelText(label), value);
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(re);
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBeNull();
  });

  it('rejects an inverted delay range, bad lock timeout and bad pins', async () => {
    const user = await open();
    await user.clear(screen.getByLabelText('Minimum delay (seconds)'));
    await user.type(screen.getByLabelText('Minimum delay (seconds)'), '500');
    await user.clear(screen.getByLabelText('Maximum delay (seconds)'));
    await user.type(screen.getByLabelText('Maximum delay (seconds)'), '5');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Delay range/);
    await user.clear(screen.getByLabelText('Minimum delay (seconds)'));
    await user.type(screen.getByLabelText('Minimum delay (seconds)'), '1');
    await user.clear(screen.getByLabelText(/Lock local tags/));
    await user.type(screen.getByLabelText(/Lock local tags/), '999');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/Lock timeout/); });
    await user.clear(screen.getByLabelText(/Lock local tags/));
    await user.type(screen.getByLabelText(/Lock local tags/), '5');
    await user.type(screen.getByLabelText(/Pinned seller signing keys/), 'not-a-key');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/Pinned signer keys/); });
  });

  it('applies settings for this tab and says so when storage is unavailable', async () => {
    const user = await open();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      await user.selectOptions(screen.getByLabelText('Theme'), 'light');
      await user.click(screen.getByRole('button', { name: 'Save settings' }));
      expect(await screen.findByText(/storage is unavailable/)).toBeTruthy();
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    } finally {
      spy.mockRestore();
    }
  });

  it('tests an RPC endpoint (chain id is verified by the adapter) and reports failures without details', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.example' } }));
    let fail: 'none' | 'chain' | 'other' = 'none';
    const services = makeServices({
      createRpc: () => {
        if (fail === 'chain') return Promise.reject(new ChainAdapterError('CHAIN_MISMATCH', 'secret'));
        if (fail === 'other') return Promise.reject(new TypeError('boom'));
        return Promise.resolve(mockRpc(84532, () => '0x'));
      },
    });
    const user = await open(services);
    await user.click(screen.getByRole('button', { name: 'Test Base Sepolia' }));
    expect(await screen.findByText(/Connected\. The endpoint reports the expected chain id/)).toBeTruthy();
    fail = 'chain';
    await user.click(screen.getByRole('button', { name: 'Test Base Sepolia' }));
    expect(await screen.findByText(/reports a different chain/)).toBeTruthy();
    fail = 'other';
    await user.click(screen.getByRole('button', { name: 'Test Base Sepolia' }));
    await waitFor(() => { expect(screen.getByText(/Something went wrong/)).toBeTruthy(); });
    await user.clear(screen.getByLabelText('Base Sepolia RPC URL'));
    await user.type(screen.getByLabelText('Base Sepolia RPC URL'), 'http://nope');
    await user.click(screen.getByRole('button', { name: 'Test Base Sepolia' }));
    await waitFor(() => { expect(screen.getByText(/RPC URL rejected/)).toBeTruthy(); });
  });
});
