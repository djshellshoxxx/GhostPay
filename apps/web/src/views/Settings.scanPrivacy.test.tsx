// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { SCAN_PRIVACY_KEY } from '../lib/scanPrivacy';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

async function open(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(makeServices());
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }));
  return user;
}

const stored = (): Record<string, unknown> => JSON.parse(window.localStorage.getItem(SCAN_PRIVACY_KEY) ?? '{}') as Record<string, unknown>;

describe('Settings: scan privacy', () => {
  it('explains the browser limits plainly and never claims anonymity', async () => {
    await open();
    const section = screen.getByRole('group', { name: 'Scan privacy' });
    expect(within(section).getByText(/cannot open a SOCKS connection/)).toBeTruthy();
    expect(within(section).getByText('Scan RPC:')).toBeTruthy();
    expect(section.textContent).not.toMatch(/anonym|unlinkab|untraceab/i);
  });

  it('saves a local proxy with the paranoid preset and rejects a non-loopback proxy endpoint', async () => {
    const user = await open();
    const section = screen.getByRole('group', { name: 'Scan privacy' });
    await user.selectOptions(within(section).getByLabelText('Scan transport'), 'local-proxy');
    await user.type(within(section).getByLabelText('Base Sepolia scan endpoint'), 'https://rpc.example.org');
    await user.click(within(section).getByRole('button', { name: 'Save scan privacy' }));
    expect(within(section).getByText(/must be on this computer/)).toBeTruthy();
    expect(window.localStorage.getItem(SCAN_PRIVACY_KEY)).toBeNull();

    await user.clear(within(section).getByLabelText('Base Sepolia scan endpoint'));
    await user.type(within(section).getByLabelText('Base Sepolia scan endpoint'), 'http://127.0.0.1:8545');
    await user.click(within(section).getByRole('button', { name: 'Use the paranoid preset' }));
    await user.clear(within(section).getByLabelText('Non-router announcements per scan'));
    await user.type(within(section).getByLabelText('Non-router announcements per scan'), '5000');
    await user.click(within(section).getByRole('button', { name: 'Save scan privacy' }));
    expect(stored()).toMatchObject({ transport: 'local-proxy', requireProxy: true, endpoints: { '84532': 'http://127.0.0.1:8545/' }, windowBlocks: 1000, jitterMinMs: 500, jitterMaxMs: 3000, openLaneBudget: 5000 });
    expect(within(section).getByText(/Your local proxy/)).toBeTruthy();
  });
});
