// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, importSession } from '../../lib/session';
import { SETTINGS_KEY } from '../../lib/settings';
import { MockWallet } from '../../test/mockWallet';
import { makeServices, renderApp } from '../../test/render';
import { POLICY_FLAG } from './flag';
import * as chainModule from './chain';
const realVerifyDeployment = chainModule.verifyPolicyDeployment;
import { LOCAL_POLICY_PROFILE, DEPLOYMENT, ROUTER, SEPOLIA, account, clientVectors, deploymentCalls, fakeChain, fixedRng, scheme2Log, walletMirror } from './fixtures.testutil';
import { preparePolicyPayment } from './pay';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.spyOn(chainModule, 'verifyPolicyDeployment').mockImplementation((client, chain, input) => realVerifyDeployment(client, chain, input, LOCAL_POLICY_PROFILE));
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.stubEnv(POLICY_FLAG, '1');
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { [String(SEPOLIA)]: 'https://rpc.test' } }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function open(services: ReturnType<typeof makeServices>) {
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Policy accounts (experimental)' }));
  await user.click(screen.getByLabelText('PolicyAccountFactory address'));
  await user.paste(DEPLOYMENT.factory);
  await user.click(screen.getByLabelText('GhostPayPolicyRouter address'));
  await user.paste(ROUTER);
  return user;
}

describe('policy deployment scope', () => {
  it.each(['PolicyAccountFactory address', 'GhostPayPolicyRouter address', 'Test network'])(
    'discards late verification after changing %s and permits another attempt', async (field) => {
      const first = deferred<string>();
      let blocked = false;
      const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: (method) => {
        if (method === 'eth_getCode' && !blocked) { blocked = true; return first.promise; }
        return undefined;
      } });
      const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc) }));
      await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
      await vi.waitFor(() => { expect(blocked).toBe(true); });
      if (field === 'Test network') {
        const select = screen.getByLabelText(field);
        const other = within(select).getAllByRole('option')[1] as HTMLOptionElement;
        await user.selectOptions(select, other.value);
      } else await user.clear(screen.getByLabelText(field));
      await act(async () => { first.resolve('0x6001'); await first.promise; });
      expect(screen.queryByLabelText('Verified policy deployment')).toBeNull();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Verify on-chain' }).disabled).toBe(false);
    },
  );

  it('does not replace a newer successful verification with an older failure', async () => {
    const first = deferred<string>();
    let blocked = false;
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: (method) => {
      if (method === 'eth_getCode' && !blocked) { blocked = true; return first.promise; }
      return undefined;
    } });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc) }));
    await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
    await vi.waitFor(() => { expect(blocked).toBe(true); });
    await user.clear(screen.getByLabelText('GhostPayPolicyRouter address'));
    await user.click(screen.getByLabelText('GhostPayPolicyRouter address'));
    await user.paste(ROUTER);
    await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
    await screen.findByLabelText('Verified policy deployment');
    await act(async () => { first.reject(new Error('old failure')); await first.promise.catch(() => undefined); });
    expect(screen.getByLabelText('Verified policy deployment')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears a reviewed payment after a router edit and a fresh verification', async () => {
    const rpc = fakeChain(SEPOLIA, deploymentCalls());
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc) }));
    await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
    await screen.findByLabelText('Verified policy deployment');
    await user.click(screen.getByLabelText(/Payee policy meta-address/));
    await user.paste(account('acct-001').metaAddress);
    await user.type(screen.getByLabelText('Amount (base units)'), '1000');
    await user.click(screen.getByRole('button', { name: 'Review payment' }));
    expect(screen.getByLabelText('Policy payment review')).toBeTruthy();
    await user.clear(screen.getByLabelText('GhostPayPolicyRouter address'));
    expect(screen.queryByLabelText('Verified policy deployment')).toBeNull();
    await user.click(screen.getByLabelText('GhostPayPolicyRouter address'));
    await user.paste(ROUTER);
    await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
    await screen.findByLabelText('Verified policy deployment');
    expect(screen.queryByLabelText('Policy payment review')).toBeNull();
  });

  it('refuses a pending wallet request if the deployment is edited during the final wallet check', async () => {
    const w = new MockWallet({ chainId: SEPOLIA });
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: walletMirror(w) });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([{ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: w }]) }));
    await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
    await screen.findByLabelText('Verified policy deployment');
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    await screen.findByText(/Connected:/);
    await user.click(screen.getByLabelText(/Payee policy meta-address/));
    await user.paste(account('acct-001').metaAddress);
    await user.type(screen.getByLabelText('Amount (base units)'), '1000');
    await user.click(screen.getByRole('button', { name: 'Review payment' }));
    const gate = deferred<unknown>();
    const original = w.request.bind(w);
    let waiting = false;
    w.request = (args) => {
      if (args.method === 'eth_accounts') { waiting = true; return gate.promise; }
      return original(args);
    };
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    await vi.waitFor(() => { expect(waiting).toBe(true); });
    await user.clear(screen.getByLabelText('GhostPayPolicyRouter address'));
    await act(async () => { gate.resolve(await original({ method: 'eth_accounts' })); await gate.promise; });
    expect(w.calls.filter((c) => c.method === 'eth_sendTransaction')).toHaveLength(0);
  });
});

describe('policy receive scope', () => {
  const a = account('acct-001');
  const importKeys = (): void => { importSession({ spendingKeyHex: a.spendingPrivateKey, viewingKeyHex: a.viewingPrivateKey }); };
  async function openReceive(rpc: ReturnType<typeof fakeChain>) {
    act(importKeys);
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc) }));
    await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
    await screen.findByLabelText('Verified policy deployment');
    await user.click(screen.getByLabelText('Paste a policy record (JSON)'));
    await user.paste(clientVectors.records.valid.find((r) => r.id === a.id)!.canonical);
    await user.click(screen.getByRole('button', { name: 'Import record' }));
    await user.type(screen.getByLabelText('Start block (optional)'), '400');
    return user;
  }

  it('discards a scan if seller keys change while fetching announcements', async () => {
    const gate = deferred<unknown[]>();
    let waiting = false;
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), head: 900, extra: (method) => {
      if (method === 'eth_getLogs') { waiting = true; return gate.promise; }
      return undefined;
    } });
    const user = await openReceive(rpc);
    await user.click(screen.getByRole('button', { name: 'Scan for policy payments' }));
    await vi.waitFor(() => { expect(waiting).toBe(true); });
    act(importKeys);
    await act(async () => { gate.resolve([]); await gate.promise; });
    expect(await screen.findByText('Seller keys changed during this action. Try again.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue scan' })).toBeNull();
  });

  it('keeps the checked asset fixed while an account read is pending', async () => {
    const gate = deferred<string>();
    let waiting = false;
    const pay = preparePolicyPayment({ metaAddress: a.metaAddress, deployment: DEPLOYMENT, token: 'native', gross: 1_000_000n, nowSec: 1n, rng: fixedRng(a.ephemeralPrivateKey) });
    const rpc = fakeChain(SEPOLIA, {
      ...deploymentCalls(), head: 900,
      logs: [scheme2Log({ stealth: a.accountAddress, ephemeralPublicKey: a.ephemeralPublicKey, metadata: pay.built.metadata, block: 500 })],
      extra: (method) => { if (method === 'eth_getBalance') { waiting = true; return gate.promise; } return undefined; },
    });
    const user = await openReceive(rpc);
    await user.click(screen.getByRole('button', { name: 'Scan for policy payments' }));
    await screen.findByText(/1 new for your keys/);
    await user.click(screen.getByRole('button', { name: 'Check account' }));
    await vi.waitFor(() => { expect(waiting).toBe(true); });
    const token = screen.getByLabelText<HTMLInputElement>('Token to withdraw');
    expect(token.disabled).toBe(true);
    await user.type(token, 'another-token');
    await act(async () => { gate.resolve('0x0'); await gate.promise; });
    await vi.waitFor(() => { expect(token.disabled).toBe(false); });
    expect(token.value).toBe('native');
  });
});
