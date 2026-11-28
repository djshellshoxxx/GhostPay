// @vitest-environment jsdom
import { ERC6538_ENTRY_TYPEHASH } from '@ghostpay/chain-adapters';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { encodeAbiParameters, keccak256, toBytes } from 'viem/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../../lib/session';
import { SETTINGS_KEY } from '../../lib/settings';
import type { WalletInfo } from '../../lib/wallet';
import { generateWaivedSession } from '../../test/keys';
import { mockRpc } from '../../test/mockRpc';
import { MockWallet } from '../../test/mockWallet';
import { makeServices, renderApp } from '../../test/render';
import { useAutoApprovedWalletDisclosures } from '../../test/walletDisclosure';

useAutoApprovedWalletDisclosures();

const SEPOLIA = 11155111;
const SETTINGS = { rpcUrls: { [String(SEPOLIA)]: 'https://rpc.test' } };
const TYPEHASH_CALL = keccak256(toBytes('ERC6538REGISTRY_ENTRY_TYPE_HASH()')).slice(0, 10);
const CHANGED = /The registry session, network, wallet or consent changed/;

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

function otherTabSaves(): void {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...SETTINGS, theme: 'light' }));
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_KEY })); });
}

/** A wallet that keeps its next answer to `method` open until released, once armed. */
function holdingWallet(method: string) {
  const wallet = new MockWallet({ chainId: SEPOLIA });
  const real = wallet.request.bind(wallet);
  let armed = false;
  let release: (() => void) | undefined;
  vi.spyOn(wallet, 'request').mockImplementation(async (args) => {
    if (armed && args.method === method) {
      armed = false;
      await new Promise<void>((resolve) => { release = resolve; });
    }
    return real(args);
  });
  return {
    wallet,
    arm: () => { armed = true; },
    held: () => release !== undefined,
    release: async () => { await act(async () => { release!(); await Promise.resolve(); }); },
  };
}

async function toWalletList(wallet: MockWallet): Promise<ReturnType<typeof userEvent.setup>> {
  generateWaivedSession();
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS));
  const rpc = mockRpc(SEPOLIA, (method, params) => {
    if (method === 'eth_getCode') return '0x6001';
    if (method === 'eth_call') return (params[0] as { data: string }).data === TYPEHASH_CALL ? ERC6538_ENTRY_TYPEHASH : encodeAbiParameters([{ type: 'bytes' }], ['0x']);
    if (method === 'eth_getTransactionByHash') return null;
    throw new Error(`unexpected ${method}`);
  });
  const info: WalletInfo = { id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: wallet };
  const user = userEvent.setup();
  renderApp(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info]) }));
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Public registry' }));
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Find wallets' }));
  await screen.findByRole('button', { name: 'Connect Mock Wallet' });
  return user;
}

async function toPublish(held: ReturnType<typeof holdingWallet>): Promise<void> {
  const user = await toWalletList(held.wallet);
  await user.click(screen.getByRole('button', { name: 'Connect Mock Wallet' }));
  await user.click(await screen.findByRole('button', { name: 'Review publish transaction' }));
  held.arm();
  await user.click(await screen.findByRole('button', { name: 'Publish to registry' }));
  await waitFor(() => { expect(held.held()).toBe(true); });
}

describe('Registry view: settings saved by another tab', () => {
  it('still shows the hash a wallet returns for a request it already had', async () => {
    const held = holdingWallet('eth_sendTransaction');
    await toPublish(held);
    otherTabSaves();
    await held.release();
    expect(await screen.findByText(/The wallet returned a transaction/)).toBeTruthy();
    expect(document.body.textContent).toContain(`0x${'9'.repeat(64)}`);
  });

  it('says why nothing was published when the wallet had not been asked yet', async () => {
    const held = holdingWallet('net_version');
    await toPublish(held);
    otherTabSaves();
    await held.release();
    expect(await screen.findByText(CHANGED)).toBeTruthy();
    expect(held.wallet.sent).toBeUndefined();
  });

  it('ends a pending connection with that reason instead of waiting for ever', async () => {
    const held = holdingWallet('eth_requestAccounts');
    const user = await toWalletList(held.wallet);
    held.arm();
    await user.click(screen.getByRole('button', { name: 'Connect Mock Wallet' }));
    await waitFor(() => { expect(held.held()).toBe(true); });
    otherTabSaves();
    await held.release();
    expect(await screen.findByText(CHANGED)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Review publish transaction' })).toBeNull();
  });
});
