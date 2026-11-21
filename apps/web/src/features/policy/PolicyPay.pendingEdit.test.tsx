// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearSession } from '../../lib/session';
import { SETTINGS_KEY } from '../../lib/settings';
import { MockWallet } from '../../test/mockWallet';
import { makeServices, renderApp } from '../../test/render';
import { POLICY_FLAG } from './flag';
import * as chainModule from './chain';
import { LOCAL_POLICY_PROFILE, DEPLOYMENT, ROUTER, SEPOLIA, account, deploymentCalls, fakeChain, walletMirror } from './fixtures.testutil';

// GP-BUG-07: reproduce the audit's UI edit during a paused wallet account recheck.
// No network transaction is submitted; MockWallet records eth_sendTransaction requests.
const payee = account('acct-001');
const realVerify = chainModule.verifyPolicyDeployment;

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.stubEnv(POLICY_FLAG, '1');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('revokes an in-flight reviewed policy payment when amount changes before wallet handoff', async () => {
  vi.spyOn(chainModule, 'verifyPolicyDeployment').mockImplementation(
    (client, chain, input) => realVerify(client, chain, input, LOCAL_POLICY_PROFILE),
  );
  const wallet = new MockWallet({ chainId: SEPOLIA });
  const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: walletMirror(wallet) });
  let pause = false;
  let pausedAccountCheck = false;
  let releaseAccountCheck: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { releaseAccountCheck = resolve; });
  const originalRequest = wallet.request.bind(wallet);
  wallet.request = async (args) => {
    if (pause && args.method === 'eth_accounts') {
      pausedAccountCheck = true;
      await gate;
    }
    return originalRequest(args);
  };
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    rpcUrls: { [String(SEPOLIA)]: 'https://rpc.test' },
  }));
  const user = userEvent.setup();
  renderApp(makeServices({
    createRpc: () => Promise.resolve(rpc),
    discoverWallets: () => Promise.resolve([{ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: wallet }]),
  }));
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Policy accounts (experimental)' }));
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
  const amount = screen.getByLabelText('Amount (base units)');
  await user.type(amount, '1000');
  await user.click(screen.getByRole('button', { name: 'Review payment' }));
  pause = true;
  await user.click(screen.getByRole('button', { name: 'Send payment' }));
  await vi.waitFor(() => { expect(pausedAccountCheck).toBe(true); });
  await user.clear(amount);
  await user.type(amount, '2000');
  await act(async () => { releaseAccountCheck?.(); await Promise.resolve(); });
  await vi.waitFor(() => {
    expect(wallet.calls.filter((call) => call.method === 'eth_sendTransaction')).toHaveLength(0);
    expect(screen.getByText(/form changed after review/i)).toBeTruthy();
  });
}, 30_000);
