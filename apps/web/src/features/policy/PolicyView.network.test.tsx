// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNetworkAuthority, type NetworkAuthority } from '../../lib/networkAuthorization';
import type { Services } from '../../lib/services';
import { clearSession, importSession } from '../../lib/session';
import { SETTINGS_KEY } from '../../lib/settings';
import { MockWallet } from '../../test/mockWallet';
import { approveWalletDisclosure } from '../../test/walletDisclosure';
import { makeServices, renderApp } from '../../test/render';
import * as chainModule from './chain';
import { POLICY_FLAG } from './flag';
import { LOCAL_POLICY_PROFILE, DEPLOYMENT, ROUTER, SEPOLIA, account, clientVectors, deploymentCalls, fakeChain, fixedRng, scheme2Log, walletMirror } from './fixtures.testutil';
import { preparePolicyPayment } from './pay';

const realVerifyDeployment = chainModule.verifyPolicyDeployment;
const authorities: NetworkAuthority[] = [];
const fixture = account('acct-001');
let originalLocks: PropertyDescriptor | undefined;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.spyOn(chainModule, 'verifyPolicyDeployment').mockImplementation((client, chain, input) => realVerifyDeployment(client, chain, input, LOCAL_POLICY_PROFILE));
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.stubEnv(POLICY_FLAG, '1');
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { [String(SEPOLIA)]: 'https://rpc.test' } }));
  originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
});
afterEach(() => {
  for (const authority of authorities.splice(0)) authority.dispose();
  if (originalLocks === undefined) Reflect.deleteProperty(navigator, 'locks');
  else Object.defineProperty(navigator, 'locks', originalLocks);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function servicesFor(rpc: ReturnType<typeof fakeChain>, wallet?: MockWallet) {
  const authority = createNetworkAuthority({ fetchFn: () => Promise.reject(new Error('No external network in this fixture')) });
  authorities.push(authority);
  const authorize = vi.fn(authority.authorize);
  // The fake RPC deliberately ignores abort, so late-result and continuation checks exercise the real UI scope.
  const createRpc = vi.fn<Services['createRpc']>(() => Promise.resolve(rpc));
  const services = makeServices({
    network: { ...authority, authorize }, createRpc,
    discoverWallets: () => Promise.resolve(wallet === undefined ? [] : [{ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: wallet }]),
  });
  return { authority, authorize, createRpc, services };
}

async function open(services: Services) {
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Policy accounts (experimental)' }));
  await user.click(screen.getByLabelText('PolicyAccountFactory address'));
  await user.paste(DEPLOYMENT.factory);
  await user.click(screen.getByLabelText('GhostPayPolicyRouter address'));
  await user.paste(ROUTER);
  return user;
}

async function verify(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
  await screen.findByLabelText('Verified policy deployment');
}

async function connect(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Find wallets' }));
  await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
  await approveWalletDisclosure(user, 'eth_requestAccounts');
  await screen.findByText(/Connected:/);
}

describe('policy UI network authority revocation', () => {
  it.each(['explicit revoke', 'cross-tab settings change'])('discards held deployment verification after %s and requires a fresh action', async (reason) => {
    const held = deferred<string>();
    let waiting = false;
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: (method) => {
      if (method === 'eth_getCode' && !waiting) { waiting = true; return held.promise; }
      return undefined;
    } });
    const h = servicesFor(rpc);
    const user = await open(h.services);
    await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
    await vi.waitFor(() => { expect(waiting).toBe(true); });
    const capability = h.createRpc.mock.calls.at(-1)?.[2];
    expect(capability).toBeDefined();
    act(() => {
      if (reason === 'explicit revoke') h.authority.invalidate();
      else {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { [String(SEPOLIA)]: 'https://rpc.test' }, relayerUrl: 'https://new-relayer.test' }));
        window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_KEY }));
      }
    });
    expect(capability!.signal.aborted).toBe(true);
    await act(async () => { held.resolve('0x6001'); await held.promise; });
    expect(screen.queryByLabelText('Verified policy deployment')).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Verify on-chain' }).disabled).toBe(false);
    await verify(user);
    expect(h.createRpc).toHaveBeenCalledTimes(2);
  });

  it('cancels a verified payment while the wallet recheck is held without minting another RPC or sending', async () => {
    const wallet = new MockWallet({ chainId: SEPOLIA });
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: walletMirror(wallet) });
    const h = servicesFor(rpc, wallet);
    const user = await open(h.services);
    await verify(user);
    await connect(user);
    await user.click(screen.getByLabelText(/Payee policy meta-address/));
    await user.paste(fixture.metaAddress);
    await user.type(screen.getByLabelText('Amount (base units)'), '1000');
    await user.click(screen.getByRole('button', { name: 'Review payment' }));
    const held = deferred<unknown>();
    const original = wallet.request.bind(wallet);
    let waiting = false;
    wallet.request = (args) => {
      if (args.method === 'eth_accounts') { waiting = true; return held.promise; }
      return original(args);
    };
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await vi.waitFor(() => { expect(waiting).toBe(true); });
    const clients = h.createRpc.mock.calls.length;
    const grants = h.authorize.mock.calls.length;
    const calls = rpc.calls.length;
    const capability = h.createRpc.mock.calls.at(-1)?.[2];
    act(() => { h.authority.invalidate(); });
    expect(capability!.signal.aborted).toBe(true);
    expect(screen.queryByLabelText('Verified policy deployment')).toBeNull();
    expect(screen.queryByLabelText('Policy payment review')).toBeNull();
    await act(async () => { held.resolve(await original({ method: 'eth_accounts' })); await held.promise; });
    expect(h.createRpc).toHaveBeenCalledTimes(clients);
    expect(h.authorize).toHaveBeenCalledTimes(grants);
    expect(rpc.calls).toHaveLength(calls);
    expect(wallet.calls.filter((call) => call.method === 'eth_sendTransaction')).toHaveLength(0);
  });

  it('refuses a queued deployment lock before its delayed fresh read can create an RPC or contact the wallet', async () => {
    importSession({ spendingKeyHex: fixture.spendingPrivateKey, viewingKeyHex: fixture.viewingPrivateKey });
    const payment = preparePolicyPayment({ metaAddress: fixture.metaAddress, deployment: DEPLOYMENT, token: 'native', gross: 1_000_000n, nowSec: 1n, rng: fixedRng(fixture.ephemeralPrivateKey) });
    const wallet = new MockWallet({ chainId: SEPOLIA });
    const rpc = fakeChain(SEPOLIA, {
      ...deploymentCalls(), head: 900,
      logs: [scheme2Log({ stealth: fixture.accountAddress, ephemeralPublicKey: fixture.ephemeralPublicKey, metadata: payment.built.metadata, block: 500 })],
      extra: walletMirror(wallet),
    });
    const h = servicesFor(rpc, wallet);
    const user = await open(h.services);
    await verify(user);
    await user.click(screen.getByLabelText('Paste a policy record (JSON)'));
    await user.paste(clientVectors.records.valid.find((record) => record.id === fixture.id)!.canonical);
    await user.click(screen.getByRole('button', { name: 'Import record' }));
    await user.type(screen.getByLabelText('Start block (optional)'), '400');
    await user.click(screen.getByRole('button', { name: 'Scan for policy payments' }));
    await screen.findByText(/1 new for your keys/);
    await connect(user);
    await user.click(screen.getByRole('button', { name: 'Check account' }));
    const deploy = await screen.findByRole('button', { name: 'Deploy account' });
    const lock = deferred<void>();
    let waiting = false;
    let completed: Promise<unknown> | undefined;
    Object.defineProperty(navigator, 'locks', { configurable: true, value: {
      request<T>(_name: string, _options: unknown, callback: () => Promise<T>): Promise<T> {
        waiting = true;
        const pending = lock.promise.then(callback);
        completed = pending;
        return pending;
      },
    } });
    await user.click(deploy);
    await vi.waitFor(() => { expect(waiting).toBe(true); });
    const clients = h.createRpc.mock.calls.length;
    const grants = h.authorize.mock.calls.length;
    const calls = rpc.calls.length;
    const walletCalls = wallet.calls.length;
    act(() => { h.authority.invalidate(); });
    expect(screen.queryByRole('button', { name: 'Deploy account' })).toBeNull();
    expect(h.createRpc.mock.calls.every((call) => call[2]?.signal.aborted === true)).toBe(true);
    await act(async () => { lock.resolve(); await completed?.catch(() => undefined); });
    expect(h.createRpc).toHaveBeenCalledTimes(clients);
    expect(h.authorize).toHaveBeenCalledTimes(grants);
    expect(rpc.calls).toHaveLength(calls);
    expect(wallet.calls).toHaveLength(walletCalls);
    expect(wallet.sent).toBeUndefined();
  });
});
