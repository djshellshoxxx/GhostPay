// @vitest-environment jsdom
import { ERC6538_REGISTRY_ADDRESS } from '@ghostpay/chain-adapters';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, generateSession } from '../lib/session';
import { renderApp, makeServices } from '../test/render';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => cleanup());

async function openRegistry(services = makeServices()): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Public registry' }));
  return user;
}

describe('Public registry route (G-07)', () => {
  it('opens the canonical registry view and requires keys before publishing', async () => {
    await openRegistry();
    expect(screen.getByText(ERC6538_REGISTRY_ADDRESS)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Public registry (ERC-6538)' })).toBeTruthy();
    expect(screen.getByText(/Load or generate keys under Seller keys first/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publish to registry' })).toBeNull();
  });

  it('requires explicit public-link consent before wallet discovery', async () => {
    generateSession();
    const user = await openRegistry();
    expect(screen.getByText(/Registering writes your meta-address into a public contract/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Find wallets' })).toBeNull();
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Find wallets' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publish to registry' })).toBeNull();
  });

  it('rejects malformed lookup input before making an RPC call', async () => {
    const createRpc = vi.fn();
    const user = await openRegistry(makeServices({ createRpc }));
    await user.type(screen.getByLabelText(/Wallet address/), 'not-an-address');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(createRpc).not.toHaveBeenCalled();
  });
});
