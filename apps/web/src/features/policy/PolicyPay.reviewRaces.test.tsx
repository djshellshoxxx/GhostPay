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

const payee = account('acct-001');
const otherPayee = account('acct-002');
const TOKEN = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const originalVerify = chainModule.verifyPolicyDeployment;

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.stubEnv(POLICY_FLAG, '1');
  vi.spyOn(chainModule, 'verifyPolicyDeployment').mockImplementation(
    (client, chain, input) => originalVerify(client, chain, input, LOCAL_POLICY_PROFILE),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function openPolicy(wallet: MockWallet, rpc: ReturnType<typeof fakeChain>): Promise<ReturnType<typeof userEvent.setup>> {
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
  return user;
}

it.each(['payee', 'token', 're-review'] as const)(
  'refuses a pending reviewed native send after %s changes, before the wallet handoff',
  async (change) => {
    const wallet = new MockWallet({ chainId: SEPOLIA });
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: walletMirror(wallet) });
    let hold = false;
    let paused = false;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const originalRequest = wallet.request.bind(wallet);
    wallet.request = async (args) => {
      if (hold && args.method === 'eth_accounts') {
        paused = true;
        await gate;
      }
      return originalRequest(args);
    };
    const user = await openPolicy(wallet, rpc);
    await user.click(screen.getByRole('button', { name: 'Review payment' }));
    hold = true;
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    await vi.waitFor(() => { expect(paused).toBe(true); });

    if (change === 'payee') {
      const field = screen.getByLabelText(/Payee policy meta-address/);
      await user.clear(field);
      await user.click(field);
      await user.paste(otherPayee.metaAddress);
    } else if (change === 'token') {
      const field = screen.getByLabelText(/^Token \("native" or ERC-20 address\)/);
      await user.clear(field);
      await user.click(field);
      await user.paste(TOKEN);
    } else {
      // Re-reviewing identical input still replaces the authorization for an earlier send.
      await user.click(screen.getByRole('button', { name: 'Review payment' }));
    }

    await act(async () => { release?.(); await Promise.resolve(); });
    await vi.waitFor(() => {
      expect(screen.getByText(/form changed after review/i)).toBeTruthy();
    });
    expect(wallet.calls.filter((c) => c.method === 'eth_sendTransaction')).toHaveLength(0);
  },
  30_000,
);

it('does not pay after a mined ERC-20 approval if amount is edited during the next wallet recheck', async () => {
  const gross = 1000n;
  const wallet = new MockWallet({ chainId: SEPOLIA });
  let approvalSent = false;
  let paymentCheckPaused = false;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const originalRequest = wallet.request.bind(wallet);
  wallet.request = async (args) => {
    if (approvalSent && args.method === 'eth_accounts' && !paymentCheckPaused) {
      paymentCheckPaused = true;
      await gate;
    }
    const answer = await originalRequest(args);
    if (args.method === 'eth_sendTransaction') approvalSent = true;
    return answer;
  };
  const mirror = walletMirror(wallet);
  const rpc = fakeChain(SEPOLIA, {
    ...deploymentCalls(),
    extra: (method, params) => {
      if (method === 'eth_call') {
        const tx = params[0] as { to: string };
        if (tx.to.toLowerCase() === TOKEN.toLowerCase()) {
          const amount = approvalSent ? gross : 0n;
          return `0x${amount.toString(16).padStart(64, '0')}`;
        }
      }
      return mirror(method);
    },
  });
  const user = await openPolicy(wallet, rpc);
  const token = screen.getByLabelText(/^Token \("native" or ERC-20 address\)/);
  await user.clear(token);
  await user.click(token);
  await user.paste(TOKEN);
  await user.click(screen.getByRole('button', { name: 'Review payment' }));
  await user.click(screen.getByRole('button', { name: 'Send payment' }));
  await vi.waitFor(() => { expect(paymentCheckPaused).toBe(true); });
  expect(wallet.calls.filter((c) => c.method === 'eth_sendTransaction')).toHaveLength(1);

  const amount = screen.getByLabelText('Amount (base units)');
  await user.clear(amount);
  await user.type(amount, '2000');
  await act(async () => { release?.(); await Promise.resolve(); });
  await vi.waitFor(() => {
    expect(screen.getByText(/router allowance remains/i)).toBeTruthy();
  });
  // The first wallet request was the approval. No policy payment reached the wallet.
  expect(wallet.calls.filter((c) => c.method === 'eth_sendTransaction')).toHaveLength(1);
  expect(String(wallet.sent?.['to']).toLowerCase()).toBe(TOKEN.toLowerCase());
}, 30_000);
