// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, importSession } from '../../lib/session';
import { SETTINGS_KEY } from '../../lib/settings';
import type { WalletInfo } from '../../lib/wallet';
import { MockWallet } from '../../test/mockWallet';
import { makeServices, renderApp } from '../../test/render';
import { POLICY_FLAG } from './flag';
import { ZERO_ADDRESS } from '@ghostpay/policy-scheme';
import { encodeAbiParameters } from 'viem/utils';
import { DEPLOYMENT, ROUTER, SEPOLIA, account, accountCalls, accountLog, clientVectors, deploymentCalls, fakeChain, fixedRng, scheme2Log, walletMirror } from './fixtures.testutil';
import { preparePolicyPayment } from './pay';

const LABEL = 'Policy accounts (experimental)';
const a1 = account('acct-001');
const canonical = (id: string): string => clientVectors.records.valid.find((v) => v.id === id)!.canonical;
const info = (w: MockWallet): WalletInfo => ({ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: w });
const walletSends = (w: MockWallet): number => w.calls.filter((c) => c.method === 'eth_sendTransaction').length;
const importA1 = (): void => { importSession({ spendingKeyHex: a1.spendingPrivateKey, viewingKeyHex: a1.viewingPrivateKey }); };

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

async function open(services: ReturnType<typeof makeServices>): Promise<ReturnType<typeof userEvent.setup>> {
  vi.stubEnv(POLICY_FLAG, '1');
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { [String(SEPOLIA)]: 'https://rpc.test' } }));
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: LABEL }));
  await user.click(screen.getByLabelText('PolicyAccountFactory address'));
  await user.paste(DEPLOYMENT.factory);
  await user.click(screen.getByLabelText('GhostPayPolicyRouter address'));
  await user.paste(ROUTER);
  await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
  await screen.findByLabelText('Verified policy deployment');
  return user;
}

async function connect(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Find wallets' }));
  await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
  await screen.findByText(/Connected:/);
}

describe('policy view: session guard before the wallet request', () => {
  it('stays unreachable with the flag off', () => {
    renderApp(makeServices());
    expect(within(screen.getByRole('navigation', { name: 'Main' })).queryByRole('button', { name: LABEL })).toBeNull();
  });

  it('refuses a reviewed policy payment after a session change without contacting the wallet', async () => {
    const w = new MockWallet({ chainId: SEPOLIA });
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: walletMirror(w) });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info(w)]) }));
    await connect(user);
    await user.click(screen.getByLabelText(/Payee policy meta-address/));
    await user.paste(a1.metaAddress);
    await user.type(screen.getByLabelText('Amount (base units)'), '1000');
    await user.click(screen.getByRole('button', { name: 'Review payment' }));
    act(() => { clearSession(); });
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    expect(await screen.findByText('Seller keys changed during this action. Try again.')).toBeTruthy();
    expect(walletSends(w)).toBe(0);
    // A fresh review under the current session sends.
    await user.click(screen.getByRole('button', { name: 'Review payment' }));
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    expect(await screen.findByText(/Payment submitted/)).toBeTruthy();
    expect(walletSends(w)).toBe(1);
  });

  it('refuses an account deployment when the keys are re-imported during the wallet re-check', async () => {
    act(importA1);
    const pay = preparePolicyPayment({ metaAddress: a1.metaAddress, deployment: DEPLOYMENT, token: 'native', gross: 1_000_000n, nowSec: 1n, rng: fixedRng(a1.ephemeralPrivateKey) });
    const w = new MockWallet({ chainId: SEPOLIA });
    const rpc = fakeChain(SEPOLIA, {
      ...deploymentCalls(),
      head: 900,
      logs: [scheme2Log({ stealth: a1.accountAddress, ephemeralPublicKey: a1.ephemeralPublicKey, metadata: pay.built.metadata, block: 500 })],
      extra: walletMirror(w),
    });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info(w)]) }));
    await user.click(screen.getByLabelText('Paste a policy record (JSON)'));
    await user.paste(canonical('acct-001'));
    await user.click(screen.getByRole('button', { name: 'Import record' }));
    await user.type(screen.getByLabelText('Start block (optional)'), '400');
    await user.click(screen.getByRole('button', { name: 'Scan for policy payments' }));
    await screen.findByText(/1 new for your keys/);
    await connect(user);
    await user.click(screen.getByRole('button', { name: 'Check account' }));
    const deploy = await screen.findByRole('button', { name: 'Deploy account' });

    // The wallet re-check (eth_accounts) is the last await before the provider call: re-import the keys there.
    let armed = true;
    const orig = w.request.bind(w);
    w.request = (args) => {
      if (armed && args.method === 'eth_accounts') { armed = false; importA1(); }
      return orig(args);
    };
    await user.click(deploy);
    expect(await screen.findByText('Seller keys changed during this action. Try again.')).toBeTruthy();
    expect(armed).toBe(false);
    expect(walletSends(w)).toBe(0);
  });
});

const TOKEN = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

async function reviewPay(user: ReturnType<typeof userEvent.setup>, token: string, amount: string): Promise<void> {
  await user.clear(screen.getByLabelText(/Payee policy meta-address/));
  await user.click(screen.getByLabelText(/Payee policy meta-address/));
  await user.paste(a1.metaAddress);
  await user.clear(screen.getByLabelText('Token ("native" or ERC-20 address)'));
  await user.type(screen.getByLabelText('Token ("native" or ERC-20 address)'), token);
  await user.clear(screen.getByLabelText('Amount (base units)'));
  await user.type(screen.getByLabelText('Amount (base units)'), amount);
  await user.click(screen.getByRole('button', { name: 'Review payment' }));
}

describe('policy pay: no second wallet request after a broadcast or an unknown outcome', () => {
  it('M1: locks the payment after an unverified approval (no Send, no Review until cleared)', async () => {
    const w = new MockWallet({ chainId: SEPOLIA });
    const mirror = walletMirror(w);
    let approved = false;
    const rpc = fakeChain(SEPOLIA, {
      ...deploymentCalls(),
      extra: (method, params) => {
        if (method === 'eth_call' && (params[0] as { to: string }).to.toLowerCase() === TOKEN.toLowerCase()) return encodeAbiParameters([{ type: 'uint256' }], [approved ? 5000n : 0n]);
        // The RPC shows the approval's receipt but never the transaction itself.
        if (method === 'eth_getTransactionByHash' && String(w.sent?.['to']).toLowerCase() === TOKEN.toLowerCase()) { approved = true; return null; }
        return mirror(method);
      },
    });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info(w)]), sleep: () => Promise.resolve() }));
    await connect(user);
    await reviewPay(user, TOKEN, '5000');
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    expect(await screen.findByText(/could not be compared with the preview/)).toBeTruthy();
    expect(walletSends(w)).toBe(1);
    expect(screen.queryByRole('button', { name: 'Send payment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review payment' })).toBeNull();
    expect(screen.getByText(/Your wallet already sent a transaction for this payment/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'I checked my wallet: start over' }));
    expect(screen.getByRole('button', { name: 'Review payment' })).toBeTruthy();
    expect(walletSends(w)).toBe(1);
  });

  it('M2: after an unknown wallet outcome, a fresh review of the same payment does not reach the wallet', async () => {
    const w = new MockWallet({ chainId: SEPOLIA });
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: walletMirror(w) });
    let asked = 0;
    const orig = w.request.bind(w);
    w.request = (args) => {
      if (args.method === 'eth_sendTransaction') { asked++; return Promise.reject(new Error('connection lost')); }
      return orig(args);
    };
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info(w)]) }));
    await connect(user);
    await reviewPay(user, 'native', '1000');
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    expect(await screen.findByText(/unknown outcome and may already have been submitted/)).toBeTruthy();
    expect(asked).toBe(1);
    await reviewPay(user, 'native', '1000');
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    expect(await screen.findByText(/A previous wallet attempt for this action already exists in this tab/)).toBeTruthy();
    expect(asked).toBe(1);
  });
});

describe('policy receive: session guard on withdraw, cancel and execute', () => {
  it('refuses each owner action when the keys are re-imported during the wallet re-check', async () => {
    act(importA1);
    const pay = preparePolicyPayment({ metaAddress: a1.metaAddress, deployment: DEPLOYMENT, token: 'native', gross: 1_000_000n, nowSec: 1n, rng: fixedRng(a1.ephemeralPrivateKey) });
    const foreign = `0x${'ab'.repeat(32)}` as const;
    const x = a1.accountAddress.toLowerCase();
    const base = deploymentCalls();
    base.code.add(x);
    const w = new MockWallet({ chainId: SEPOLIA });
    const rpc = fakeChain(SEPOLIA, {
      ...base,
      extra: walletMirror(w),
      calls: { ...base.calls, ...accountCalls(a1) },
      head: 900,
      balances: { [`native@${x}`]: 3n * 10n ** 18n },
      logs: [
        scheme2Log({ stealth: a1.accountAddress, ephemeralPublicKey: a1.ephemeralPublicKey, metadata: pay.built.metadata, block: 500 }),
        accountLog(a1.accountAddress, 'WithdrawRequested', { id: foreign, token: ZERO_ADDRESS, amount: 10n ** 17n, executeAfter: 1n }, 600),
      ],
    });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info(w)]) }));
    await connect(user);
    await user.click(screen.getByLabelText('Paste a policy record (JSON)'));
    await user.paste(canonical('acct-001'));
    await user.click(screen.getByRole('button', { name: 'Import record' }));
    await user.click(screen.getByRole('button', { name: 'Scan for policy payments' }));
    await screen.findByText(/1 new for your keys/);
    await user.click(screen.getByRole('button', { name: 'Check account' }));
    await screen.findByText(/A withdrawal you did not sign on this device is pending/);

    let armed = false;
    const orig = w.request.bind(w);
    w.request = (args) => {
      if (armed && args.method === 'eth_accounts') { armed = false; importA1(); }
      return orig(args);
    };
    const refused = async (): Promise<void> => {
      expect(await screen.findByText('Seller keys changed during this action. Try again.')).toBeTruthy();
      expect(armed).toBe(false);
      expect(walletSends(w)).toBe(sends);
    };
    let sends = 0;

    armed = true;
    await user.click(screen.getByRole('button', { name: 'Cancel it' }));
    await refused();

    await user.type(screen.getByLabelText('Amount to withdraw (base units)'), '500000000000000000');
    armed = true;
    await user.click(screen.getByRole('button', { name: 'Sign and send withdrawal request' }));
    await refused();

    await user.click(screen.getByRole('button', { name: 'Sign and send withdrawal request' }));
    expect(await screen.findByText(/Withdrawal request submitted/)).toBeTruthy();
    sends = 1;
    expect(walletSends(w)).toBe(sends);
    armed = true;
    await user.click(screen.getByRole('button', { name: 'Execute withdrawal' }));
    await refused();
  });
});
