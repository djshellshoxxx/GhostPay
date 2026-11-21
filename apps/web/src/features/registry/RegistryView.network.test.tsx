// @vitest-environment jsdom
import { ERC6538_ENTRY_TYPEHASH, metaAddressToRegistryBytes } from '@ghostpay/chain-adapters';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { encodeAbiParameters, keccak256, toBytes } from 'viem/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNetworkAuthority, type NetworkAuthority } from '../../lib/networkAuthorization';
import type { Services } from '../../lib/services';
import { clearSession, generateSession } from '../../lib/session';
import { SETTINGS_KEY } from '../../lib/settings';
import { mockRpc } from '../../test/mockRpc';
import { makeServices, renderApp } from '../../test/render';

const SEPOLIA = 11155111;
const TYPEHASH_CALL = keccak256(toBytes('ERC6538REGISTRY_ENTRY_TYPE_HASH()')).slice(0, 10);
const authorities: NetworkAuthority[] = [];

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { [String(SEPOLIA)]: 'https://rpc.test' } }));
});
afterEach(() => {
  for (const authority of authorities.splice(0)) authority.dispose();
  vi.restoreAllMocks();
});

describe('registry UI network authority revocation', () => {
  it('discards a held lookup after revocation and permits only a new explicit lookup to display it', async () => {
    const meta = generateSession().metaAddress;
    clearSession();
    const encoded = encodeAbiParameters([{ type: 'bytes' }], [metaAddressToRegistryBytes(meta)]);
    let release!: (value: string) => void;
    const held = new Promise<string>((resolve) => { release = resolve; });
    let waiting = false;
    const rpc = mockRpc(SEPOLIA, (method, params) => {
      if (method === 'eth_getCode') return '0x6001';
      if (method === 'eth_call') {
        if ((params[0] as { data: string }).data === TYPEHASH_CALL) return ERC6538_ENTRY_TYPEHASH;
        if (!waiting) { waiting = true; return held; }
        return encoded;
      }
      throw new Error('Unexpected fixture RPC method');
    });
    const authority = createNetworkAuthority({ fetchFn: () => Promise.reject(new Error('No external network in this fixture')) });
    authorities.push(authority);
    const authorize = vi.fn(authority.authorize);
    // Keeping this RPC deliberately non-cooperative proves the view also rejects a late decoded answer.
    const createRpc = vi.fn<Services['createRpc']>(() => Promise.resolve(rpc));
    const user = userEvent.setup();
    renderApp(makeServices({ network: { ...authority, authorize }, createRpc }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Public registry' }));
    await user.type(screen.getByLabelText(/Wallet address/), '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    expect(createRpc).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    await vi.waitFor(() => { expect(waiting).toBe(true); });
    const grants = authorize.mock.calls.length;
    const calls = rpc.calls.length;
    const capability = createRpc.mock.calls.at(-1)?.[2];
    expect(capability).toBeDefined();
    act(() => { authority.invalidate(); });
    expect(capability!.signal.aborted).toBe(true);
    await act(async () => { release(encoded); await held; });
    expect(screen.queryByText(/Read-only call/)).toBeNull();
    expect(screen.queryByText(meta)).toBeNull();
    expect(createRpc).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenCalledTimes(grants);
    expect(rpc.calls).toHaveLength(calls);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Look up' }).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText(/Read-only call/)).toBeTruthy();
    expect(screen.getAllByText(meta).length).toBeGreaterThan(0);
    expect(createRpc).toHaveBeenCalledTimes(2);
    expect(authorize).toHaveBeenCalledTimes(grants + 1);
  });
});
