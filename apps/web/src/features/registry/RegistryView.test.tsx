// @vitest-environment jsdom
import { buildRegisterKeysCall, ERC6538_REGISTRY_ADDRESS, metaAddressToRegistryBytes } from '@ghostpay/chain-adapters';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { encodeAbiParameters } from 'viem/utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, generateSession, getSessionPublic } from '../../lib/session';
import { SETTINGS_KEY } from '../../lib/settings';
import type { WalletInfo } from '../../lib/wallet';
import { MockWallet } from '../../test/mockWallet';
import { mockRpc } from '../../test/mockRpc';
import { makeServices, renderApp } from '../../test/render';

const SEPOLIA = 11155111;
const walletInfo = (w: MockWallet): WalletInfo => ({ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: w });

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

async function open(services = makeServices(), withRpc = true): Promise<ReturnType<typeof userEvent.setup>> {
  if (withRpc) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { [String(SEPOLIA)]: 'https://rpc.test' } }));
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Public registry' }));
  return user;
}

function chain(wallet: MockWallet, code = '0x6001', stored = '0x') {
  return mockRpc(SEPOLIA, (method, params) => {
    if (method === 'eth_getCode') return code;
    if (method === 'eth_call') return stored;
    if (method === 'eth_getTransactionByHash') {
      const s = wallet.sent;
      return s === undefined ? null : { hash: params[0], from: s['from'], to: s['to'], input: s['data'], value: s['value'], chainId: `0x${SEPOLIA.toString(16)}` };
    }
    throw new Error(`unexpected ${method}`);
  });
}

describe('Registry view', () => {
  it('needs keys before publishing', async () => {
    await open();
    expect(screen.getByText(/Load or generate keys/)).toBeTruthy();
  });

  it('publishes only after explicit consent, previews the call, and verifies it on the RPC', async () => {
    generateSession();
    const meta = getSessionPublic()!.metaAddress;
    const wallet = new MockWallet({ chainId: SEPOLIA });
    const rpc = chain(wallet);
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    expect(screen.getByText(/public association with your wallet address/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Find wallets' })).toBeNull();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Review transaction' }));
    expect(screen.getAllByText(ERC6538_REGISTRY_ADDRESS).length).toBeGreaterThan(0);
    expect(wallet.sent).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Publish to registry' }));
    expect(await screen.findByText(/same transaction you reviewed/)).toBeTruthy();
    const call = buildRegisterKeysCall(meta);
    expect(wallet.sent?.['to']).toBe(ERC6538_REGISTRY_ADDRESS);
    expect(wallet.sent?.['data']).toBe(call.data);
    expect(wallet.sent?.['value']).toBe('0x0');
  });

  it('unchecking consent drops the connection and review', async () => {
    generateSession();
    const wallet = new MockWallet({ chainId: SEPOLIA });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(chain(wallet)), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Review transaction' }));
    await user.click(screen.getByRole('checkbox'));
    expect(screen.queryByRole('button', { name: 'Publish to registry' })).toBeNull();
  });

  it('refuses to review when the registry has no code on the chain (fail closed)', async () => {
    generateSession();
    const wallet = new MockWallet({ chainId: SEPOLIA });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(chain(wallet, '0x')), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Review transaction' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/CHAIN_DISABLED|unavailable|disabled|no code/i);
    expect(screen.queryByRole('button', { name: 'Publish to registry' })).toBeNull();
    expect(wallet.sent).toBeUndefined();
  });

  it('requires an RPC endpoint', async () => {
    generateSession();
    const wallet = new MockWallet({ chainId: SEPOLIA });
    const user = await open(makeServices({ discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }), false);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Review transaction' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/RPC endpoint/);
  });

  it('looks up a registered meta-address and shows the read-only call', async () => {
    generateSession();
    const meta = getSessionPublic()!.metaAddress;
    const stored = encodeAbiParameters([{ type: 'bytes' }], [metaAddressToRegistryBytes(meta)]);
    const rpc = chain(new MockWallet(), '0x6001', stored);
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc) }));
    await user.type(screen.getByLabelText(/Wallet address/), '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText(/Read-only call/)).toBeTruthy();
    expect(screen.getAllByText(meta).length).toBeGreaterThan(0);
  });

  it('reports no entry, bad input and malformed entries', async () => {
    const rpcEmpty = chain(new MockWallet(), '0x6001', encodeAbiParameters([{ type: 'bytes' }], ['0x']));
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpcEmpty) }));
    const box = screen.getByLabelText(/Wallet address/);
    await user.type(box, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText(/No meta-address is registered/)).toBeTruthy();
    await user.clear(box);
    await user.type(box, 'vitalik.eth');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
