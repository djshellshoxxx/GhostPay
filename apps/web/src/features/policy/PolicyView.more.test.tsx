// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { policyAccountFactoryAbi } from '@ghostpay/policy-scheme';
import { decodeFunctionData } from 'viem/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, importSession } from '../../lib/session';
import { SETTINGS_KEY } from '../../lib/settings';
import type { WalletInfo } from '../../lib/wallet';
import { MockWallet } from '../../test/mockWallet';
import { makeServices, renderApp } from '../../test/render';
import { POLICY_FLAG } from './flag';
import { DEPLOYMENT, ROUTER, SEPOLIA, account, clientVectors, deploymentCalls, fakeChain, fixedRng, scheme2Log, walletMirror } from './fixtures.testutil';
import { preparePolicyPayment } from './pay';

const LABEL = 'Policy accounts (experimental)';
const a1 = account('acct-001');
const a2 = account('acct-002');
const canonical = (id: string): string => clientVectors.records.valid.find((v) => v.id === id)!.canonical;
const info = (w: MockWallet): WalletInfo => ({ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: w });

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function open(services = makeServices(), withRpc = true): Promise<ReturnType<typeof userEvent.setup>> {
  vi.stubEnv(POLICY_FLAG, '1');
  if (withRpc) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { [String(SEPOLIA)]: 'https://rpc.test' } }));
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: LABEL }));
  return user;
}

async function verify(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByLabelText('PolicyAccountFactory address'));
  await user.paste(DEPLOYMENT.factory);
  await user.click(screen.getByLabelText('GhostPayPolicyRouter address'));
  await user.paste(ROUTER);
  await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
  await screen.findByLabelText('Verified policy deployment');
}

describe('policy view: wallet and network', () => {
  it('reports no wallets, discovery failures and connection failures', async () => {
    const discover = vi.fn<() => Promise<readonly WalletInfo[]>>()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([info(new MockWallet({ chainId: 84532, failSwitch: true }))]);
    const user = await open(makeServices({ discoverWallets: discover }));
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    expect(await screen.findByText('No browser wallet found.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    expect(await screen.findByText('Something went wrong. Nothing was sent.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/Connected:/)).toBeNull();
  });
  it('asks for an RPC before verifying and resets on network change', async () => {
    const user = await open(makeServices(), false);
    await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
    expect(await screen.findByText('Configure an RPC for this network in Settings first.')).toBeTruthy();
    const select = screen.getByLabelText('Test network');
    const other = within(select).getAllByRole('option')[1] as HTMLOptionElement;
    await user.selectOptions(select, other.value);
    expect((select as HTMLSelectElement).value).toBe(other.value);
  });
});

describe('policy view: create and restore', () => {
  it('creates a policy with limits and downloads its record', async () => {
    const spy = vi.fn<(b: Blob | MediaSource) => string>(() => 'blob:x');
    URL.createObjectURL = spy;
    URL.revokeObjectURL = vi.fn();
    act(() => { importSession({ spendingKeyHex: a1.spendingPrivateKey, viewingKeyHex: a1.viewingPrivateKey }); });
    const user = await open();
    await user.type(screen.getByLabelText(/^Destination/), a1.policy.destination);
    await user.type(screen.getByLabelText('Token 1'), 'native');
    await user.type(screen.getByLabelText('Limit 1'), '1000000000000000000');
    await user.type(screen.getByLabelText('Window 1 (seconds)'), '86400');
    await user.click(screen.getByRole('button', { name: 'Add limit' }));
    await user.click(screen.getByLabelText('Token 2'));
    await user.paste('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    await user.type(screen.getByLabelText('Limit 2'), '5000000000');
    await user.type(screen.getByLabelText('Window 2 (seconds)'), '604800');
    await user.click(screen.getByRole('button', { name: 'Create policy meta-address' }));
    expect(screen.getByText(a1.metaAddress)).toBeTruthy();
    expect(screen.getByText(/2 token limit\(s\)/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Download policy record' }));
    const blob = spy.mock.calls[0]?.[0] as Blob;
    expect(await blob.text()).toBe(canonical('acct-001'));
  });
  it('restore search reports bad input and misses', async () => {
    const user = await open();
    await user.click(screen.getByText('Lost the record?'));
    await user.type(screen.getByLabelText('Policy meta-address'), 'st:eth:0x00');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText('Enter the policy meta-address (st:eth:gp2:0x...).')).toBeTruthy();
    await user.clear(screen.getByLabelText('Policy meta-address'));
    await user.click(screen.getByLabelText('Policy meta-address'));
    await user.paste(a2.metaAddress);
    await user.type(screen.getByLabelText(/Candidate destinations/), 'nope');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText('Enter one or more checksummed destination addresses.')).toBeTruthy();
    await user.clear(screen.getByLabelText(/Candidate destinations/));
    await user.click(screen.getByLabelText(/Candidate destinations/));
    await user.paste(a1.policy.destination);
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText(/No match among these destinations/)).toBeTruthy();
  });
  it('restores a limited policy from a known limits root of a loaded record', async () => {
    const user = await open();
    await user.click(screen.getByLabelText('Paste a policy record (JSON)'));
    await user.paste(canonical('acct-001'));
    await user.click(screen.getByRole('button', { name: 'Import record' }));
    await user.click(screen.getByText('Lost the record?'));
    await user.click(screen.getByLabelText('Policy meta-address'));
    await user.paste(a1.metaAddress);
    await user.click(screen.getByLabelText(/Candidate destinations/));
    await user.paste(a1.policy.destination);
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText('Policy found and restored. Download the record now.')).toBeTruthy();
  });
});

describe('policy view: pay and receive errors', () => {
  it('rejects a malformed amount and shows a wallet rejection', async () => {
    const w = new MockWallet({ chainId: SEPOLIA, rejectSend: true });
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: walletMirror(w) });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info(w)]) }));
    await verify(user);
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    await screen.findByText(/Connected:/);
    await user.click(screen.getByLabelText(/Payee policy meta-address/));
    await user.paste(a1.metaAddress);
    await user.type(screen.getByLabelText('Amount (base units)'), '1.5');
    await user.click(screen.getByRole('button', { name: 'Review payment' }));
    expect(screen.getByText('Enter the amount as a whole number of base units.')).toBeTruthy();
    await user.clear(screen.getByLabelText('Amount (base units)'));
    await user.type(screen.getByLabelText('Amount (base units)'), '1000');
    await user.click(screen.getByRole('button', { name: 'Review payment' }));
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    expect(await screen.findByText('You rejected the request in your wallet.')).toBeTruthy();
  });
  it('deploys a scanned account through the factory and reports scan failures', async () => {
    act(() => { importSession({ spendingKeyHex: a1.spendingPrivateKey, viewingKeyHex: a1.viewingPrivateKey }); });
    const pay = preparePolicyPayment({ metaAddress: a1.metaAddress, deployment: DEPLOYMENT, token: 'native', gross: 1_000_000n, nowSec: 1n, rng: fixedRng(a1.ephemeralPrivateKey) });
    const w = new MockWallet({ chainId: SEPOLIA });
    let failLogs = false;
    const rpc = fakeChain(SEPOLIA, {
      ...deploymentCalls(),
      head: 900,
      logs: [scheme2Log({ stealth: a1.accountAddress, ephemeralPublicKey: a1.ephemeralPublicKey, metadata: pay.built.metadata, block: 500 })],
      extra: (method) => {
        if ((method === 'eth_getLogs' || method === 'eth_blockNumber') && failLogs) throw new Error('down');
        return walletMirror(w)(method);
      },
    });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info(w)]) }));
    await verify(user);
    await user.click(screen.getByLabelText('Paste a policy record (JSON)'));
    await user.paste(canonical('acct-001'));
    await user.click(screen.getByRole('button', { name: 'Import record' }));
    await user.type(screen.getByLabelText('Start block (optional)'), '400');
    await user.click(screen.getByRole('button', { name: 'Scan for policy payments' }));
    await screen.findByText(/1 new for your keys/);

    await user.clear(screen.getByLabelText('Token to withdraw'));
    await user.type(screen.getByLabelText('Token to withdraw'), 'usdc');
    await user.click(screen.getByRole('button', { name: 'Check account' }));
    expect(await screen.findByText('The token must be "native" or a checksummed address.')).toBeTruthy();
    await user.clear(screen.getByLabelText('Token to withdraw'));
    await user.type(screen.getByLabelText('Token to withdraw'), 'native');
    await user.click(screen.getByRole('button', { name: 'Check account' }));
    await user.click(await screen.findByRole('button', { name: 'Deploy account' }));
    expect(await screen.findByText(/Connect a wallet on this network to relay/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    await screen.findByText(/Connected:/);
    await user.click(screen.getByRole('button', { name: 'Deploy account' }));
    expect(await screen.findByText(/Deployment submitted/)).toBeTruthy();
    const d = decodeFunctionData({ abi: policyAccountFactoryAbi, data: w.sent?.['data'] as `0x${string}` });
    expect(d.functionName).toBe('deploy');
    expect(d.args).toEqual([a1.ownerAddress, a1.policy.destination, 86400n, a1.policy.limitsRoot]);
    expect(w.sent?.['to']).toBe(DEPLOYMENT.factory);

    failLogs = true;
    await user.click(screen.getByRole('button', { name: 'Continue scan' }));
    const section = screen.getByRole('region', { name: 'Find and withdraw policy payments' });
    expect(await within(section).findByText(/Blocked by a safety check|Something went wrong/)).toBeTruthy();
  });
});
