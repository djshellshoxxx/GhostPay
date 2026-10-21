// @vitest-environment jsdom
import { ERC6538_ENTRY_TYPEHASH, ERC6538_REGISTRY, erc6538RegistryAbi, registryBytesFor } from '@ghostpay/chain-adapters';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { decodeFunctionData, encodeAbiParameters } from 'viem/utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, getSessionPublic } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import type { WalletInfo } from '../lib/wallet';
import { MOCK_ACCOUNT, MockWallet } from '../test/mockWallet';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test', '11155111': 'https://rpc2.test' } }));
  window.history.replaceState(null, '', '/');
});

const walletInfo = (w: MockWallet): WalletInfo => ({ id: 'mock', name: 'Mock Wallet', rdns: 'io.mock', kind: 'eip6963', provider: w });

interface Chain {
  code?: string;
  typehash?: string;
  entry?: string;
}
function registryRpc(wallet: MockWallet, c: Chain = {}) {
  return mockRpc(84532, (method, params) => {
    if (method === 'eth_getCode') return c.code ?? '0x6001';
    if (method === 'eth_call') {
      const data = (params[0] as { data: string }).data;
      return data.length === 10 ? (c.typehash ?? ERC6538_ENTRY_TYPEHASH) : encodeAbiParameters([{ type: 'bytes' }], [(c.entry ?? '0x') as `0x${string}`]);
    }
    if (method === 'eth_getTransactionByHash') {
      const s = wallet.sent;
      return s === undefined ? null : { hash: params[0], from: s['from'], to: s['to'], input: s['data'], value: s['value'], chainId: '0x14a34' };
    }
    if (method === 'eth_getTransactionReceipt') return { status: '0x1', blockNumber: '0x64', to: wallet.sent?.['to'] };
    throw new Error(`unexpected ${method}`);
  });
}

async function open(wallet: MockWallet, rpc: ReturnType<typeof registryRpc>): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
  await user.click(screen.getByRole('button', { name: 'Generate new keys' }));
  await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
  return user;
}

describe('ERC-6538 registry (G-07)', () => {
  it('names the canonical registry and says plainly that publishing is public and permanent', async () => {
    await open(new MockWallet(), registryRpc(new MockWallet()));
    expect(screen.getByText(ERC6538_REGISTRY)).toBeTruthy();
    expect(screen.getByText('This is public and permanent')).toBeTruthy();
    expect(screen.getByText(/Publishing associates the wallet address you sign with, in public/)).toBeTruthy();
  });

  it('cannot publish before the explicit confirmation, then registers exactly the meta-address under scheme 1', async () => {
    const wallet = new MockWallet();
    const user = await open(wallet, registryRpc(wallet));
    const choose = screen.getByRole<HTMLButtonElement>('button', { name: 'Choose a wallet to publish from' });
    expect(choose.disabled).toBe(true);
    await user.click(screen.getByLabelText(/I understand this publicly links my wallet address/));
    await user.click(choose);
    const publish = await screen.findByRole('button', { name: /Publish meta-address with Mock Wallet \(io\.mock\)/ });
    expect(wallet.calls.some((c) => c.method === 'eth_sendTransaction')).toBe(false);
    await user.click(publish);
    expect(await screen.findByText(/is now publicly linked to this meta-address/)).toBeTruthy();
    expect(wallet.sent?.['to']).toBe(ERC6538_REGISTRY);
    const d = decodeFunctionData({ abi: erc6538RegistryAbi, data: wallet.sent?.['data'] as `0x${string}` });
    expect(d.functionName).toBe('registerKeys');
    expect(d.args).toEqual([1n, registryBytesFor(getSessionPublic()!.metaAddress)]);
    expect(screen.getByText(new RegExp(MOCK_ACCOUNT))).toBeTruthy();
  });

  it('refuses to use a registry that is not deployed or does not answer as the canonical one', async () => {
    for (const [chain, re] of [
      [{ code: '0x' }, /not deployed on this chain/],
      [{ typehash: `0x${'11'.repeat(32)}` }, /did not answer as expected/],
    ] as const) {
      const wallet = new MockWallet();
      const user = await open(wallet, registryRpc(wallet, chain));
      await user.click(screen.getByLabelText(/I understand this publicly links/));
      await user.click(screen.getByRole('button', { name: 'Choose a wallet to publish from' }));
      await user.click(await screen.findByRole('button', { name: /Publish meta-address/ }));
      expect((await screen.findByRole('alert')).textContent).toMatch(/Cannot confirm/);
      expect((await screen.findByRole('alert')).textContent).toMatch(re);
      expect(wallet.sent).toBeUndefined();
      clearSession();
      cleanup();
    }
  });

  it('looks a wallet address up and shows the registered meta-address, or says there is none', async () => {
    const wallet = new MockWallet();
    const user = await open(wallet, registryRpc(wallet));
    await user.type(screen.getByLabelText('Wallet address'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/valid wallet address/);
    await user.clear(screen.getByLabelText('Wallet address'));
    await user.type(screen.getByLabelText('Wallet address'), MOCK_ACCOUNT);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText(/No scheme-1 meta-address is registered/)).toBeTruthy();
  });

  it('shows a registered entry as self-published', async () => {
    const wallet = new MockWallet();
    const meta = (await import('@ghostpay/core-crypto')).encodeMetaAddress((await import('@ghostpay/core-crypto')).generateKeySet());
    const user = await open(wallet, registryRpc(wallet, { entry: registryBytesFor(meta) }));
    await user.type(screen.getByLabelText('Wallet address'), MOCK_ACCOUNT);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText(meta)).toBeTruthy();
    expect(screen.getByText(/proves nothing about who owns the wallet/)).toBeTruthy();
  });

  it('needs an RPC for the chosen chain', async () => {
    window.localStorage.removeItem(SETTINGS_KEY);
    const wallet = new MockWallet();
    const user = userEvent.setup();
    renderApp(makeServices({ discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
    await user.type(screen.getByLabelText('Wallet address'), MOCK_ACCOUNT);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Configure an RPC/);
  });
});
