// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearRpcSessionOnly, DEFAULT_SETTINGS, SETTINGS_KEY } from '../lib/settings';
import { exportSettingsExchange } from '../lib/settingsExchange';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => {
  clearRpcSessionOnly();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

async function open(services = makeServices()): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }));
  return user;
}

async function preview(user: ReturnType<typeof userEvent.setup>, transfer: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('Or paste QR text'), { target: { value: transfer } });
  await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
  expect(await screen.findByText('Review imported settings')).toBeTruthy();
}

const stored = (): Record<string, unknown> => JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;
const retention = (): HTMLInputElement[] => screen.getAllByRole('checkbox', { name: /Keep this endpoint for this session only/ });

describe('Saved Settings reconciliation boundaries', () => {
  it('retains unsaved endpoint storage choices after a preference import while invalidating an older RPC test', async () => {
    let resolve!: (value: ReturnType<typeof mockRpc>) => void;
    const pending = new Promise<ReturnType<typeof mockRpc>>((done) => { resolve = done; });
    const user = await open(makeServices({ createRpc: () => pending }));
    fireEvent.change(screen.getByLabelText('Base Sepolia RPC URL'), { target: { value: 'https://draft-primary.example/' } });
    fireEvent.change(screen.getByLabelText('Base Sepolia second RPC URL (optional)'), { target: { value: 'https://draft-secondary.example/' } });
    for (const box of retention()) await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Test Base Sepolia' }));
    expect(screen.getByText('Checking…')).toBeTruthy();
    await preview(user, exportSettingsExchange({ ...DEFAULT_SETTINGS, theme: 'dark' }));
    await user.click(screen.getByRole('button', { name: 'Apply selected settings' }));
    expect(retention()).toHaveLength(2);
    expect(retention().every((box) => box.checked)).toBe(true);
    await act(async () => { resolve(mockRpc(84532, () => '0x')); await Promise.resolve(); });
    expect(screen.queryByText('Connected. The endpoint reports the expected chain id.')).toBeNull();
    expect(screen.queryByText('Checking…')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => { expect(stored()).toMatchObject({ theme: 'dark', rpcUrls: {}, rpcUrlsSecondary: {} }); });
    expect(window.localStorage.getItem(SETTINGS_KEY)).not.toContain('draft-');
  });

  it('reconciles only the imported endpoint slot and still applies equal-to-saved fields in selected preferences', async () => {
    const user = await open();
    await user.selectOptions(screen.getByLabelText('Theme'), 'light');
    fireEvent.change(screen.getByLabelText('Base Sepolia RPC URL'), { target: { value: 'https://draft-primary.example/' } });
    fireEvent.change(screen.getByLabelText('Base Sepolia second RPC URL (optional)'), { target: { value: 'https://draft-secondary.example/' } });
    for (const box of retention()) await user.click(box);
    await preview(user, exportSettingsExchange(
      { ...DEFAULT_SETTINGS, lockTimeoutMin: 5, rpcUrls: { '84532': 'https://imported-primary.example/' } },
      ['preferences', 'rpcUrls'],
      makeServices().chains.map((chain) => chain.chainId),
    ));
    await user.click(screen.getByRole('checkbox', { name: 'Apply RPC endpoints' }));
    await user.click(screen.getByRole('button', { name: 'Apply selected settings' }));
    await user.click(within(screen.getByRole('alertdialog', { name: 'Confirm trust changes' })).getByRole('button', { name: 'Confirm and apply' }));
    expect(screen.getByLabelText<HTMLSelectElement>('Theme').value).toBe(DEFAULT_SETTINGS.theme);
    expect(screen.getByLabelText<HTMLInputElement>('Base Sepolia RPC URL').value).toBe('https://imported-primary.example/');
    expect(screen.getByLabelText<HTMLInputElement>('Base Sepolia second RPC URL (optional)').value).toBe('https://draft-secondary.example/');
    expect(retention().map((box) => box.checked)).toEqual([false, true]);
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => { expect(stored()).toMatchObject({ theme: DEFAULT_SETTINGS.theme, rpcUrls: { '84532': 'https://imported-primary.example/' }, rpcUrlsSecondary: {} }); });
  });
});
