// @vitest-environment jsdom
import { REGISTRY_ADDRESS, buildClearKeys, buildRegisterKeys, erc6538RegistryAbi, type Hex } from '@ghostpay/chain-adapters';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { encodeFunctionResult, keccak256 } from 'viem/utils';
import { encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import { registryMetaBytes } from '@ghostpay/chain-adapters';
import { clearSession, generateSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import type { Services } from '../lib/services';
import type { WalletInfo } from '../lib/wallet';
import { MockWallet } from '../test/mockWallet';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp } from '../test/render';

const REGISTRY_CODE = '0x600160005260206000f3' as const;
const PIN = keccak256(REGISTRY_CODE);
const OWNER = '0x5555555555555555555555555555555555555555';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

function registryRpc(published: string | undefined, code: string = REGISTRY_CODE) {
  return mockRpc(84532, (method) => {
    if (method === 'eth_getCode') return code;
    if (method === 'eth_call') {
      return encodeFunctionResult({ abi: erc6538RegistryAbi, functionName: 'stealthMetaAddressOf', result: published === undefined ? '0x' : registryMetaBytes(published) });
    }
    throw new Error(`unexpected ${method}`);
  });
}

async function open(over: Partial<Services> = {}, withRpc = true): Promise<ReturnType<typeof userEvent.setup>> {
  if (withRpc) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
  const user = userEvent.setup();
  renderApp(makeServices(over));
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
  await user.selectOptions(screen.getByLabelText('Registry chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
  return user;
}
const walletInfo = (w: MockWallet): WalletInfo => ({ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: w });

describe('ERC-6538 registry section', () => {
  it('is opt-in: labelled optional, warns about the public link, and sends nothing by itself', async () => {
    const w = new MockWallet();
    const user = await open({ discoverWallets: () => Promise.resolve([walletInfo(w)]) });
    expect(screen.getByText('Public registry (ERC-6538), optional')).toBeTruthy();
    expect(screen.getByText(/Publishing links your wallet address to your meta-address in a public, permanent on-chain record/)).toBeTruthy();
    expect(screen.getByText('Load or generate keys above to publish a meta-address.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Generate new keys' }));
    const publish = screen.getByRole<HTMLButtonElement>('button', { name: 'Publish my meta-address' });
    const clear = screen.getByRole<HTMLButtonElement>('button', { name: 'Clear my entry' });
    expect(publish.disabled).toBe(true);
    expect(clear.disabled).toBe(true);
    await user.click(screen.getByLabelText(/I understand this publicly and permanently links/));
    expect(publish.disabled).toBe(false);
    expect(w.calls.some((c) => c.method === 'eth_sendTransaction')).toBe(false);
  });

  it('fails closed without a pinned code hash: neither lookup nor publish reaches the registry', async () => {
    const rpc = registryRpc(undefined);
    const w = new MockWallet();
    const user = await open({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([walletInfo(w)]) });
    act(() => { generateSession(); });
    await user.type(screen.getByLabelText('Wallet address to look up'), OWNER);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect((await screen.findAllByRole('alert'))[0]?.textContent).toMatch(/registry could not be trusted/);
    await user.click(screen.getByLabelText(/I understand this publicly/));
    await user.click(screen.getByRole('button', { name: 'Publish my meta-address' }));
    await waitFor(() => { expect(screen.getAllByRole('alert')[0]?.textContent).toMatch(/registry could not be trusted/); });
    expect(rpc.calls.some((c) => c.method === 'eth_call')).toBe(false);
    expect(w.calls.some((c) => c.method === 'eth_sendTransaction')).toBe(false);
  });

  it('refuses a registry whose code hash differs from the pinned one', async () => {
    const rpc = registryRpc(undefined, '0x6009600955');
    const user = await open({ createRpc: () => Promise.resolve(rpc) });
    await user.type(screen.getByLabelText('Expected registry code hash'), PIN);
    await user.type(screen.getByLabelText('Wallet address to look up'), OWNER);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/registry could not be trusted/);
    expect(rpc.calls.some((c) => c.method === 'eth_call')).toBe(false);
  });

  it('looks up a published meta-address and labels it unverified third-party data', async () => {
    const other = encodeMetaAddress(generateKeySet());
    const user = await open({ createRpc: () => Promise.resolve(registryRpc(other)) });
    await user.type(screen.getByLabelText('Expected registry code hash'), PIN);
    await user.type(screen.getByLabelText('Wallet address to look up'), OWNER);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    const res = await screen.findByText('Lookup result');
    expect(res.closest('.notice')?.textContent).toContain(other);
    expect(res.closest('.notice')?.textContent).toMatch(/unverified third-party data/);
  });

  it('reports an empty entry, recognises its own entry and rejects bad input', async () => {
    const pub = generateSession();
    const rpcs = [registryRpc(undefined), registryRpc(pub.metaAddress)];
    let n = 0;
    const user = await open({ createRpc: () => Promise.resolve(rpcs[Math.min(n++, 1)]!) });
    await user.type(screen.getByLabelText('Expected registry code hash'), 'nothex');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/0x followed by 64 hexadecimal/);
    await user.clear(screen.getByLabelText('Expected registry code hash'));
    await user.type(screen.getByLabelText('Expected registry code hash'), PIN);
    await user.type(screen.getByLabelText('Wallet address to look up'), 'not-an-address');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => { expect(screen.getAllByRole('alert')[0]?.textContent).toMatch(/safety check/); });
    await user.clear(screen.getByLabelText('Wallet address to look up'));
    await user.type(screen.getByLabelText('Wallet address to look up'), OWNER);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText(/No valid scheme-1 meta-address is published/)).toBeTruthy();
  });

  it('publishes exactly registerKeys(meta) to the canonical registry after explicit consent', async () => {
    const pub = generateSession();
    const w = new MockWallet({ account: OWNER });
    const rpc = registryRpc(undefined);
    const user = await open({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([walletInfo(w)]) });
    await user.type(screen.getByLabelText('Expected registry code hash'), PIN);
    await user.click(screen.getByLabelText(/I understand this publicly/));
    await user.click(screen.getByRole('button', { name: 'Publish my meta-address' }));
    expect(await screen.findByText(/Meta-address published\. Transaction 0x9{64}\./)).toBeTruthy();
    const tx = w.sent as { to: string; data: Hex; value: string };
    const expected = buildRegisterKeys(pub.metaAddress);
    expect(tx.to.toLowerCase()).toBe(REGISTRY_ADDRESS.toLowerCase());
    expect(tx.data).toBe(expected.data);
    expect(BigInt(tx.value)).toBe(0n);
    expect(screen.getByLabelText<HTMLInputElement>(/I understand this publicly/).checked).toBe(false);
  });

  it('clears the entry with registerKeys(1, 0x)', async () => {
    generateSession();
    const w = new MockWallet({ account: OWNER });
    const user = await open({ createRpc: () => Promise.resolve(registryRpc(undefined)), discoverWallets: () => Promise.resolve([walletInfo(w), { ...walletInfo(new MockWallet()), id: 'other', name: 'Other' }]) });
    await user.type(screen.getByLabelText('Expected registry code hash'), PIN);
    await user.click(screen.getByLabelText(/I understand this publicly/));
    await user.click(screen.getByRole('button', { name: 'Clear my entry' }));
    expect((await screen.findAllByText(/Registry entry cleared\./)).length).toBeGreaterThan(0);
    expect((w.sent as { data: string }).data).toBe(buildClearKeys().data);
    expect(screen.getByLabelText('Wallet')).toBeTruthy();
  });

  it('needs an RPC and a wallet', async () => {
    generateSession();
    const user = await open({}, false);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Configure an RPC/);
  });

  it('reports a missing wallet', async () => {
    generateSession();
    const user = await open({ createRpc: () => Promise.resolve(registryRpc(undefined)) });
    await user.type(screen.getByLabelText('Expected registry code hash'), PIN);
    await user.click(screen.getByLabelText(/I understand this publicly/));
    await user.click(screen.getByRole('button', { name: 'Publish my meta-address' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/No wallet was found/);
  });
});
