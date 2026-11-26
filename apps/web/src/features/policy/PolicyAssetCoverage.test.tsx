// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, importSession } from '../../lib/session';
import { SETTINGS_KEY } from '../../lib/settings';
import { makeServices, renderApp } from '../../test/render';
import { MockWallet } from '../../test/mockWallet';
import type { WalletInfo } from '../../lib/wallet';
import { POLICY_FLAG } from './flag';
import { createPolicyMetaAddress } from './create';
import { serializePolicyRecord } from '@ghostpay/policy-scheme';
import * as chainModule from './chain';
import { installPolicyTestLocks } from './withdrawal.testutil';
import { DEPLOYMENT, LOCAL_POLICY_PROFILE, ROUTER, SEPOLIA, account, clientVectors, deploymentCalls, fakeChain, walletMirror } from './fixtures.testutil';
import { useAutoApprovedWalletDisclosures } from '../../test/walletDisclosure';

// Suites written before the wallet disclosure gate approve each real dialog as a user would.
useAutoApprovedWalletDisclosures();

const realVerifyDeployment = chainModule.verifyPolicyDeployment;
const LABEL = 'Policy accounts (experimental)';
const a1 = account('acct-001'); // limits: native and USDC
const a2 = account('acct-002'); // no limits
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const canonical = (id: string): string => clientVectors.records.valid.find((v) => v.id === id)!.canonical;
const SIGNING_KEY = '33'.repeat(32);

beforeEach(() => {
  vi.spyOn(chainModule, 'verifyPolicyDeployment').mockImplementation((client, chain, input) => realVerifyDeployment(client, chain, input, LOCAL_POLICY_PROFILE));
  installPolicyTestLocks();
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function open(services = makeServices()): Promise<ReturnType<typeof userEvent.setup>> {
  vi.stubEnv(POLICY_FLAG, '1');
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { [String(SEPOLIA)]: 'https://rpc.test' } }));
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

async function importRecord(user: ReturnType<typeof userEvent.setup>, id: string): Promise<void> {
  const box = screen.getByLabelText('Paste a policy record (JSON)');
  await user.clear(box);
  await user.click(box);
  await user.paste(canonical(id));
  await user.click(screen.getByRole('button', { name: 'Import record' }));
}

async function review(user: ReturnType<typeof userEvent.setup>, meta: string, token: string): Promise<void> {
  const metaBox = screen.getByLabelText(/Payee policy meta-address/);
  await user.clear(metaBox);
  await user.click(metaBox);
  await user.paste(meta);
  const tokenBox = screen.getByLabelText(/^Token \("native" or ERC-20 address\)/);
  await user.clear(tokenBox);
  await user.type(tokenBox, token);
  const amount = screen.getByLabelText('Amount (base units)');
  await user.clear(amount);
  await user.type(amount, '1000000');
  await user.click(screen.getByRole('button', { name: 'Review payment' }));
}

describe('SEC-11: assets a scheme-2 policy can withdraw', () => {
  it('seller side: each record states exactly which assets its policy can withdraw', async () => {
    act(() => { importSession({ spendingKeyHex: a1.spendingPrivateKey, viewingKeyHex: a1.viewingPrivateKey, signingKeyHex: SIGNING_KEY }); });
    const user = await open();
    await importRecord(user, 'acct-001');
    expect(screen.getByText(/This policy can withdraw only: native, 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48\./)).toBeTruthy();
    expect(screen.getByText(/A payment in any other token or coin stays locked in the account forever/)).toBeTruthy();
    await importRecord(user, 'acct-002');
    expect(screen.getByText(/This policy has no limits: it can withdraw any token and the native coin\./)).toBeTruthy();
  });

  it('payer side without the payee record: the review states the risk the payer cannot check', async () => {
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), head: 900 });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc) }));
    await verify(user);
    await review(user, a1.metaAddress, DAI);
    expect(screen.getByLabelText('Policy payment review')).toBeTruthy();
    expect(screen.getByText('This app cannot check that the payee can withdraw this asset')).toBeTruthy();
    expect(screen.getByText(/carries only a hash of the payee's policy/)).toBeTruthy();
    expect(screen.getByText(/stays locked in the policy account forever/)).toBeTruthy();
  });

  it('payer side with the payee record loaded: an asset without a limit is refused, a covered one is confirmed', async () => {
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), head: 900 });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc) }));
    await verify(user);
    await importRecord(user, 'acct-001');
    await review(user, a1.metaAddress, DAI);
    expect(screen.getByText(/Blocked: the payee's policy record loaded in this tab has per-token limits and none for this asset/)).toBeTruthy();
    expect(screen.queryByLabelText('Policy payment review')).toBeNull();
    await review(user, a1.metaAddress, USDC);
    expect(screen.getByLabelText('Policy payment review')).toBeTruthy();
    expect(screen.getByText(/Checked against the payee's policy record loaded in this tab/)).toBeTruthy();
    expect(screen.queryByText('This app cannot check that the payee can withdraw this asset')).toBeNull();
    // Each meta-address is checked against the record of its own policy hash only.
    await importRecord(user, 'acct-002');
    await review(user, a1.metaAddress, DAI);
    expect(screen.getByText(/Blocked: the payee's policy record/)).toBeTruthy();
    await review(user, a2.metaAddress, DAI);
    expect(screen.getByText(/Checked against the payee's policy record loaded in this tab/)).toBeTruthy();
  });

  it('a record loaded after the review that shows the asset is not covered blocks the send before the wallet is asked', async () => {
    const w = new MockWallet({ chainId: SEPOLIA });
    const base = deploymentCalls();
    const rpc = fakeChain(SEPOLIA, { ...base, extra: walletMirror(w), head: 900 });
    const info: WalletInfo = { id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: w };
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info]) }));
    await verify(user);
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    await screen.findByText(/Connected:/);
    // Reviewed while the payer could not know (no record loaded).
    await review(user, a1.metaAddress, DAI);
    expect(screen.getByText('This app cannot check that the payee can withdraw this asset')).toBeTruthy();
    // The payee's record arrives before the send: it has limits and none for DAI.
    await importRecord(user, 'acct-001');
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    expect(await screen.findByText(/Blocked: the payee's policy record loaded in this tab has per-token limits and none for this asset/)).toBeTruthy();
    expect(w.sent).toBeUndefined();
  });
});


it.each([false, true])('rechecks newly imported asset coverage after an asynchronous wallet account recheck (other seller: %s)', async (otherSeller) => {
  const w = new MockWallet({ chainId: SEPOLIA });
  const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: walletMirror(w), head: 900 });
  let pause = false;
  let paused = false;
  let resume: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { resume = resolve; });
  const request = w.request.bind(w);
  w.request = async (args) => {
    if (pause && args.method === 'eth_accounts') {
      paused = true;
      await gate;
    }
    return request(args);
  };
  const record = createPolicyMetaAddress({
    spendingPublicKeyHex: a1.spendingPublicKey, viewingPublicKeyHex: a1.viewingPublicKey,
    destination: a1.policy.destination, delaySeconds: 3600n,
    limits: [{ token: USDC, limit: '1000000', windowSeconds: '3600' }],
  });
  const loadedRecord = otherSeller ? createPolicyMetaAddress({
    spendingPublicKeyHex: a1.spendingPublicKey, viewingPublicKeyHex: a2.viewingPublicKey,
    destination: a1.policy.destination, delaySeconds: 3600n,
    limits: [{ token: USDC, limit: '1000000', windowSeconds: '3600' }],
  }) : record;
  expect(loadedRecord.policyHash).toBe(record.policyHash);
  if (otherSeller) expect(loadedRecord.metaAddress).not.toBe(record.metaAddress);
  const info: WalletInfo = { id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: w };
  const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info]) }));
  await verify(user);
  await user.click(screen.getByRole('button', { name: 'Find wallets' }));
  await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
  await screen.findByText(/Connected:/);
  await review(user, record.metaAddress, 'native');
  expect(screen.getByLabelText('Policy payment review')).toBeTruthy();
  pause = true;
  await user.click(screen.getByRole('button', { name: 'Send payment' }));
  await vi.waitFor(() => { expect(paused).toBe(true); });
  await user.click(screen.getByLabelText('Paste a policy record (JSON)'));
  await user.paste(serializePolicyRecord(loadedRecord));
  await user.click(screen.getByRole('button', { name: 'Import record' }));
  await act(async () => { resume?.(); await Promise.resolve(); });
  await vi.waitFor(() => {
    expect(w.calls.filter((call) => call.method === 'eth_sendTransaction')).toHaveLength(0);
    expect(screen.getByText(otherSeller ? /Blocked: a loaded record matches the payee's policy commitment/ : /Blocked: the payee's policy record loaded in this tab has per-token limits and none for this asset/)).toBeTruthy();
    expect(screen.queryByLabelText('Policy payment review')).toBeNull();
  });
});
