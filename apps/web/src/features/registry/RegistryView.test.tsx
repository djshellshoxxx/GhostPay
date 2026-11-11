// @vitest-environment jsdom
import { buildRegisterKeysCall, ERC6538_ENTRY_TYPEHASH, ERC6538_REGISTRY_ADDRESS, metaAddressToRegistryBytes, erc6538RegistryAbi } from '@ghostpay/chain-adapters';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { decodeFunctionData, encodeAbiParameters, keccak256, toBytes } from 'viem/utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { captureSessionGuard, clearSession, generateSession, getSessionPublic, importSession, markKeystoreDownloaded } from '../../lib/session';
import { buildClearRegistryCall } from '../../lib/registry';
import { SETTINGS_KEY } from '../../lib/settings';
import type { WalletInfo } from '../../lib/wallet';
import { MockWallet } from '../../test/mockWallet';
import { mockRpc } from '../../test/mockRpc';
import { generateWaivedSession } from '../../test/keys';
import { makeServices, renderApp } from '../../test/render';

const SEPOLIA = 11155111;
const TYPEHASH_CALL = keccak256(toBytes('ERC6538REGISTRY_ENTRY_TYPE_HASH()')).slice(0, 10);
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

function chain(wallet: MockWallet, code = '0x6001', stored = '0x', typehash = ERC6538_ENTRY_TYPEHASH) {
  return mockRpc(SEPOLIA, (method, params) => {
    if (method === 'eth_getCode') return code;
    if (method === 'eth_call') {
      const call = params[0] as { data: string };
      return call.data === TYPEHASH_CALL ? typehash : stored === '0x' ? encodeAbiParameters([{ type: 'bytes' }], ['0x']) : stored;
    }
    if (method === 'eth_getTransactionByHash') {
      const s = wallet.sent;
      return s === undefined ? null : { hash: params[0], from: s['from'], to: s['to'], input: s['data'], value: s['value'], chainId: `0x${SEPOLIA.toString(16)}` };
    }
    throw new Error(`unexpected ${method}`);
  });
}

describe('Registry view', () => {
  it('reads a strict public meta-address QR for review without changing seller keys or publishing', async () => {
    const scanned = generateSession().metaAddress;
    const loaded = generateSession().metaAddress;
    const wallet = new MockWallet({ chainId: SEPOLIA });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(chain(wallet)) }));
    const paste = screen.getByLabelText('Or paste QR text');
    await user.type(paste, scanned);
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect(await screen.findByText('Scanned public meta-address (untrusted)')).toBeTruthy();
    expect(getSessionPublic()?.metaAddress).toBe(loaded);
    expect(wallet.sent).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Publish to registry' })).toBeNull();
  });
  it('needs keys before publishing', async () => {
    await open();
    expect(screen.getByText(/Load or generate keys/)).toBeTruthy();
  });

  it('C-R1: keys without a backup cannot reach publishing; once backed up they can', async () => {
    const pub = generateSession();
    const wallet = new MockWallet({ chainId: SEPOLIA });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(chain(wallet)), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    expect(screen.getByText('Back up these seller keys first')).toBeTruthy();
    expect(screen.queryByText(pub.metaAddress)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Find wallets' })).toBeNull();
    // The lookup and the QR review stay available: they publish nothing.
    expect(screen.getByRole('button', { name: 'Look up' })).toBeTruthy();
    act(() => { markKeystoreDownloaded(captureSessionGuard()); });
    expect(screen.queryByText('Back up these seller keys first')).toBeNull();
    expect(screen.getByText(pub.metaAddress)).toBeTruthy();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    expect(await screen.findByRole('button', { name: 'Review publish transaction' })).toBeTruthy();
  });

  it('payment keys imported without an invoice signer can reach the registry consent gate', async () => {
    const pub = importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32) });
    await open();
    expect(screen.getByText(pub.metaAddress)).toBeTruthy();
    expect(screen.getByRole('checkbox')).toBeTruthy();
    expect(screen.queryByText('Back up these seller keys first')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Find wallets' })).toBeNull();
  });

  it('publishes only after explicit consent, previews the call, and verifies it on the RPC', async () => {
    generateWaivedSession();
    const meta = getSessionPublic()!.metaAddress;
    const wallet = new MockWallet({ chainId: SEPOLIA });
    const rpc = chain(wallet);
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    expect(screen.getByText(/public association with your wallet address/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Find wallets' })).toBeNull();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Review publish transaction' }));
    expect(screen.getAllByText(ERC6538_REGISTRY_ADDRESS).length).toBeGreaterThan(0);
    expect(wallet.sent).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Publish to registry' }));
    expect(await screen.findByText(/same transaction you reviewed/)).toBeTruthy();
    const call = buildRegisterKeysCall(meta);
    expect(wallet.sent?.['to']).toBe(ERC6538_REGISTRY_ADDRESS);
    expect(wallet.sent?.['data']).toBe(call.data);
    expect(wallet.sent?.['value']).toBe('0x0');
  });

  it('does not publish if consent is withdrawn during the wallet network recheck', async () => {
    generateWaivedSession();
    const wallet = new MockWallet({ chainId: SEPOLIA });
    let block = false;
    let release: (() => void) | undefined;
    const info: WalletInfo = { ...walletInfo(wallet), provider: {
      request: async (args) => {
        const answer = await wallet.request(args);
        if (block && args.method === 'net_version') await new Promise<void>((resolve) => { release = resolve; });
        return answer;
      },
    } };
    const user = await open(makeServices({ createRpc: () => Promise.resolve(chain(wallet)), discoverWallets: () => Promise.resolve([info]) }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Review publish transaction' }));
    block = true;
    await user.click(screen.getByRole('button', { name: 'Publish to registry' }));
    await waitFor(() => { expect(release).toBeTypeOf('function'); });
    await user.click(screen.getByRole('checkbox'));
    await act(async () => { release?.(); await Promise.resolve(); });
    expect(wallet.sent).toBeUndefined();
  });
  it('unchecking consent drops the connection and review', async () => {
    generateWaivedSession();
    const wallet = new MockWallet({ chainId: SEPOLIA });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(chain(wallet)), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Review publish transaction' }));
    await user.click(screen.getByRole('checkbox'));
    expect(screen.queryByRole('button', { name: 'Publish to registry' })).toBeNull();
  });

  it('refuses to review when the registry has no code on the chain (fail closed)', async () => {
    generateWaivedSession();
    const wallet = new MockWallet({ chainId: SEPOLIA });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(chain(wallet, '0x')), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Review publish transaction' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/DEPLOYMENT_UNVERIFIED/);
    expect(screen.queryByRole('button', { name: 'Publish to registry' })).toBeNull();
    expect(wallet.sent).toBeUndefined();
  });

  it('requires the expected ERC-6538 type hash before registry use', async () => {
    generateWaivedSession();
    const wallet = new MockWallet({ chainId: SEPOLIA });
    const rpc = chain(wallet, '0x6001', '0x', `0x${'11'.repeat(32)}`);
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Review publish transaction' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/DEPLOYMENT_UNVERIFIED/);
    expect(wallet.sent).toBeUndefined();
  });

  it('reviews and clears the current entry through registerKeys(1, empty bytes)', async () => {
    generateWaivedSession();
    const wallet = new MockWallet({ chainId: SEPOLIA });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(chain(wallet)), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Review clear transaction' }));
    expect(screen.getByText(/clear current entry/)).toBeTruthy();
    expect(wallet.sent).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Clear registry entry' }));
    expect(await screen.findByText(/Clear submitted: .*public chain history remains visible/)).toBeTruthy();
    const tx = wallet.sent as { readonly data: `0x${string}` };
    const decoded = decodeFunctionData({ abi: erc6538RegistryAbi, data: tx.data });
    expect(decoded.functionName).toBe('registerKeys');
    expect(decoded.args).toEqual([1n, '0x']);
    expect(tx.data).toBe(buildClearRegistryCall().data);
  });

  it('requires an RPC endpoint', async () => {
    generateWaivedSession();
    const wallet = new MockWallet({ chainId: SEPOLIA });
    const user = await open(makeServices({ discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }), false);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Review publish transaction' }));
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
