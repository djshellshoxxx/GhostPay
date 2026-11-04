// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, importSession } from '../../lib/session';
import { SETTINGS_KEY } from '../../lib/settings';
import type { WalletInfo } from '../../lib/wallet';
import { ATTEMPT_JOURNAL_KEY } from '../../lib/duplicateAttemptJournal';
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

const ALREADY_PAID = /You already sent this exact payment \(same payee, token and amount\) from this tab: transaction 0x9{64}\. Check it in your wallet or a block explorer\. To pay again on purpose, clear this payment under Wallet attempts first, and for a token payment also its approval\./;
const journal = () => screen.getByRole('region', { name: 'Wallet attempt journal' });

describe('policy pay: a verified repeat stays blocked until cleared (by design)', () => {
  it('M2: after a verified successful policy payment, an identical re-review does not reach the wallet', async () => {
    const w = new MockWallet({ chainId: SEPOLIA });
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: walletMirror(w) });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info(w)]), sleep: () => Promise.resolve() }));
    await connect(user);
    await reviewPay(user, 'native', '1000');
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    // Verified on the RPC and confirmed by a successful receipt.
    expect(await screen.findByText(/Payment submitted: 0x9{64} \(confirmed\)/)).toBeTruthy();
    expect(walletSends(w)).toBe(1);
    await reviewPay(user, 'native', '1000');
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    expect(await screen.findByText(ALREADY_PAID)).toBeTruthy();
    expect(walletSends(w)).toBe(1);
    expect(within(journal()).getByText(`0x${'9'.repeat(64)}`)).toBeTruthy();
  });

  it('M2: an identical ERC-20 repeat is refused before its approval reaches the wallet', async () => {
    const w = new MockWallet({ chainId: SEPOLIA });
    const mirror = walletMirror(w);
    const sent: string[] = [];
    const orig = w.request.bind(w);
    w.request = async (args) => {
      const r = await orig(args);
      if (args.method === 'eth_sendTransaction') sent.push(String(w.sent?.['to']).toLowerCase());
      return r;
    };
    // Allowance: granted by the approve, consumed again by the payment.
    const allowance = (): bigint => (sent.at(-1) === TOKEN.toLowerCase() ? 5000n : 0n);
    const rpc = fakeChain(SEPOLIA, {
      ...deploymentCalls(),
      extra: (method, params) => {
        if (method === 'eth_call' && (params[0] as { to: string }).to.toLowerCase() === TOKEN.toLowerCase()) return encodeAbiParameters([{ type: 'uint256' }], [allowance()]);
        return mirror(method);
      },
    });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info(w)]), sleep: () => Promise.resolve() }));
    await connect(user);
    await reviewPay(user, TOKEN, '5000');
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    expect(await screen.findByText(/Payment submitted: 0x9{64} \(confirmed\)/)).toBeTruthy();
    expect(sent).toEqual([TOKEN.toLowerCase(), ROUTER.toLowerCase()]);
    await reviewPay(user, TOKEN, '5000');
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    expect(await screen.findByText(ALREADY_PAID)).toBeTruthy();
    expect(walletSends(w)).toBe(2);
  });

  it('M2: after an explicit clear under Wallet attempts, the same payment can be sent on purpose', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = new MockWallet({ chainId: SEPOLIA });
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: walletMirror(w) });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info(w)]), sleep: () => Promise.resolve() }));
    await connect(user);
    await reviewPay(user, 'native', '1000');
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    await screen.findByText(/Payment submitted/);
    await user.click(within(journal()).getByRole('button', { name: 'Clear this attempt after checking my wallet' }));
    expect(screen.queryByRole('region', { name: 'Wallet attempt journal' })).toBeNull();
    await reviewPay(user, 'native', '1000');
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    await vi.waitFor(() => { expect(walletSends(w)).toBe(2); });
  });

  it('fails closed when the attempt journal cannot be read: no wallet request', async () => {
    const w = new MockWallet({ chainId: SEPOLIA });
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: walletMirror(w) });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info(w)]) }));
    await connect(user);
    await reviewPay(user, 'native', '1000');
    window.sessionStorage.setItem(ATTEMPT_JOURNAL_KEY, '{not json');
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    expect(await screen.findAllByText(/attempt journal is unavailable or invalid/)).not.toHaveLength(0);
    expect(walletSends(w)).toBe(0);
  });
});

/** ERC-20 fixture: the approve grants 5000, a payment request consumes it (it mined, even when the wallet reply was lost). */
async function erc20Fixture(opts: { readonly loseFirstPaymentReply?: boolean } = {}) {
  const w = new MockWallet({ chainId: SEPOLIA });
  const mirror = walletMirror(w);
  const asked: string[] = [];
  let lose = opts.loseFirstPaymentReply === true;
  let granted = false;
  const orig = w.request.bind(w);
  w.request = async (args) => {
    if (args.method !== 'eth_sendTransaction') return orig(args);
    const to = String((args.params as [{ to: string }])[0].to).toLowerCase();
    asked.push(to);
    granted = to === TOKEN.toLowerCase();
    if (lose && to === ROUTER.toLowerCase()) { lose = false; throw new Error('connection lost'); }
    return orig(args);
  };
  const rpc = fakeChain(SEPOLIA, {
    ...deploymentCalls(),
    extra: (method, params) => {
      if (method === 'eth_call' && (params[0] as { to: string }).to.toLowerCase() === TOKEN.toLowerCase()) return encodeAbiParameters([{ type: 'uint256' }], [granted ? 5000n : 0n]);
      return mirror(method);
    },
  });
  const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info(w)]), sleep: () => Promise.resolve() }));
  await connect(user);
  return { user, asked };
}
const clearRecord = async (user: ReturnType<typeof userEvent.setup>, kind: 'approval' | 'payment'): Promise<void> => {
  const item = within(journal()).getAllByRole('listitem').find((li) => li.textContent?.startsWith(`${kind} on chain`) === true);
  if (item === undefined) throw new Error(`no ${kind} record`);
  await user.click(within(item).getByRole('button', { name: 'Clear this attempt after checking my wallet' }));
};

describe('policy pay: ERC-20 repeats and the attempt journal', () => {
  it('after an unknown payment outcome, a re-review sends no new approval even when the approval record was cleared', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, asked } = await erc20Fixture({ loseFirstPaymentReply: true });
    await reviewPay(user, TOKEN, '5000');
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    expect(await screen.findByText(/unknown outcome and may already have been submitted/)).toBeTruthy();
    expect(asked).toEqual([TOKEN.toLowerCase(), ROUTER.toLowerCase()]);
    await clearRecord(user, 'approval');
    await reviewPay(user, TOKEN, '5000');
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    expect(await screen.findByText(/A previous wallet attempt for this action already exists in this tab/)).toBeTruthy();
    expect(asked).toHaveLength(2);
  });

  it('a deliberate ERC-20 repeat is sent after clearing both the payment and its approval', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, asked } = await erc20Fixture();
    await reviewPay(user, TOKEN, '5000');
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    await screen.findByText(/Payment submitted: 0x9{64} \(confirmed\)/);
    await reviewPay(user, TOKEN, '5000');
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    expect(await screen.findByText(ALREADY_PAID)).toBeTruthy();
    expect(asked).toHaveLength(2);
    await clearRecord(user, 'payment');
    await clearRecord(user, 'approval');
    await reviewPay(user, TOKEN, '5000');
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    await vi.waitFor(() => { expect(asked).toEqual([TOKEN.toLowerCase(), ROUTER.toLowerCase(), TOKEN.toLowerCase(), ROUTER.toLowerCase()]); });
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
