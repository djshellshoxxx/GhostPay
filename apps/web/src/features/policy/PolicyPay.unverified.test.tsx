// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../../lib/session';
import { SETTINGS_KEY } from '../../lib/settings';
import type { WalletInfo } from '../../lib/wallet';
import { MockWallet } from '../../test/mockWallet';
import { makeServices, renderApp } from '../../test/render';
import { POLICY_FLAG } from './flag';
import * as chainModule from './chain';
import { installPolicyTestLocks } from './withdrawal.testutil';
import { LOCAL_POLICY_PROFILE, DEPLOYMENT, ROUTER, SEPOLIA, account, deploymentCalls, fakeChain, walletMirror } from './fixtures.testutil';
import { useAutoApprovedWalletDisclosures } from '../../test/walletDisclosure';

// Suites written before the wallet disclosure gate approve each real dialog as a user would.
useAutoApprovedWalletDisclosures();

const realVerifyDeployment = chainModule.verifyPolicyDeployment;
const LABEL = 'Policy accounts (experimental)';
const payee = account('acct-001');
const info = (w: MockWallet): WalletInfo => ({ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: w });

beforeEach(() => {
  vi.spyOn(chainModule, 'verifyPolicyDeployment').mockImplementation((client, chain, input) => realVerifyDeployment(client, chain, input, LOCAL_POLICY_PROFILE));
  installPolicyTestLocks();
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('policy pay: a receipt alone never confirms', () => {
  it('does not label a payment confirmed when the RPC never returns the transaction for comparison', async () => {
    const w = new MockWallet({ chainId: SEPOLIA });
    const mirror = walletMirror(w);
    // The receipt says success, but the transaction itself is never visible to compare with the preview.
    const hidden = (method: string): unknown => method === 'eth_getTransactionByHash' ? null : mirror(method);
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: hidden });
    vi.stubEnv(POLICY_FLAG, '1');
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { [String(SEPOLIA)]: 'https://rpc.test' } }));
    const user = userEvent.setup();
    renderApp(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info(w)]), sleep: () => Promise.resolve() }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: LABEL }));
    await user.click(screen.getByLabelText('PolicyAccountFactory address'));
    await user.paste(DEPLOYMENT.factory);
    await user.click(screen.getByLabelText('GhostPayPolicyRouter address'));
    await user.paste(ROUTER);
    await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
    await screen.findByLabelText('Verified policy deployment');
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    await screen.findByText(/Connected:/);
    await user.click(screen.getByLabelText(/Payee policy meta-address/));
    await user.paste(payee.metaAddress);
    await user.clear(screen.getByLabelText('Token ("native" or ERC-20 address)'));
    await user.type(screen.getByLabelText('Token ("native" or ERC-20 address)'), 'native');
    await user.type(screen.getByLabelText('Amount (base units)'), '1000');
    await user.click(screen.getByRole('button', { name: 'Review payment' }));
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    expect(await screen.findByText(/Payment submitted: 0x9{64}/)).toBeTruthy();
    expect(screen.queryByText(/\(confirmed\)/)).toBeNull();
    expect(w.calls.filter((c) => c.method === 'eth_sendTransaction').length).toBe(1);
  });
});
