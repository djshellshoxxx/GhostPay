// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, importSession } from '../../lib/session';
import { SETTINGS_KEY } from '../../lib/settings';
import { makeServices, renderApp } from '../../test/render';
import { POLICY_FLAG } from './flag';
import { ROUTER, SEPOLIA, account, accountCalls, accountLog, clientVectors, deploymentCalls, fakeChain, fixedRng, scheme2Log, walletMirror, DEPLOYMENT } from './fixtures.testutil';
import { policyAccountAbi, ghostPayPolicyRouterAbi, ZERO_ADDRESS } from '@ghostpay/policy-scheme';
import { decodeFunctionData } from 'viem/utils';
import { MockWallet } from '../../test/mockWallet';
import type { WalletInfo } from '../../lib/wallet';
import { preparePolicyPayment } from './pay';

const LABEL = 'Policy accounts (experimental)';
const a1 = account('acct-001');
const a2 = account('acct-002');
const canonical = (id: string): string => clientVectors.records.valid.find((v) => v.id === id)!.canonical;
/** Imported with their signing key, the keys have a copy elsewhere, so the create form opens without the backup gate. */
const SIGNING_KEY = '33'.repeat(32);

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const nav = () => screen.getByRole('navigation', { name: 'Main' });

async function open(services = makeServices()): Promise<ReturnType<typeof userEvent.setup>> {
  vi.stubEnv(POLICY_FLAG, '1');
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { [String(SEPOLIA)]: 'https://rpc.test' } }));
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(nav()).getByRole('button', { name: LABEL }));
  return user;
}

describe('policy view flag', () => {
  it('is not in the navigation by default', () => {
    renderApp();
    expect(within(nav()).queryByRole('button', { name: LABEL })).toBeNull();
  });
  it('with the flag on, shows the experimental, unaudited warning and keeps actions gated', async () => {
    await open();
    expect(screen.getByRole('heading', { level: 2, name: LABEL })).toBeTruthy();
    expect(screen.getByText('Experimental and unaudited')).toBeTruthy();
    expect(screen.getByText(/no pinned deployment on any network/)).toBeTruthy();
    expect(screen.getAllByText('Verify the contracts above first.')).toHaveLength(2);
    expect(screen.getByText('Load or generate seller keys first (Seller keys).')).toBeTruthy();
    // Only test networks are offered.
    const options = within(screen.getByLabelText('Test network')).getAllByRole('option').map((o) => o.textContent);
    expect(options.every((o) => o !== null && !['Ethereum', 'Base', 'OP Mainnet'].includes(o))).toBe(true);
  });
});

describe('policy view flows', () => {
  it('C-R1: derives no policy meta-address for keys without a backup until the waiver is typed', async () => {
    // Without its signing key the import generates one that exists only in this tab: no backup yet (C-R6).
    act(() => { importSession({ spendingKeyHex: a2.spendingPrivateKey, viewingKeyHex: a2.viewingPrivateKey }); });
    const user = await open();
    expect(screen.getByText('Back up these seller keys first')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create policy meta-address' })).toBeNull();
    expect(screen.queryByLabelText(/^Destination/)).toBeNull();
    // Importing or restoring a record derives nothing from the loaded keys and stays available.
    expect(screen.getByRole('button', { name: 'Import record' })).toBeTruthy();
    await user.type(screen.getByLabelText(/To continue without a backup/), 'continue without backup');
    await user.click(screen.getByRole('button', { name: 'Continue without a backup' }));
    expect(screen.getByRole('button', { name: 'Create policy meta-address' })).toBeTruthy();
  });
  it('creates the vector meta-address and offers the record download', async () => {
    act(() => { importSession({ spendingKeyHex: a2.spendingPrivateKey, viewingKeyHex: a2.viewingPrivateKey, signingKeyHex: SIGNING_KEY }); });
    const user = await open();
    await user.type(screen.getByLabelText(/^Destination/), a2.policy.destination);
    await user.selectOptions(screen.getByLabelText('Withdrawal delay'), '3600');
    await user.click(screen.getByRole('button', { name: 'Create policy meta-address' }));
    expect(screen.getByText(a2.metaAddress)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download policy record' })).toBeTruthy();
    expect(screen.getByText('Keep the policy record')).toBeTruthy();
  });
  it('shows input errors without echoing them', async () => {
    act(() => { importSession({ spendingKeyHex: a2.spendingPrivateKey, viewingKeyHex: a2.viewingPrivateKey, signingKeyHex: SIGNING_KEY }); });
    const user = await open();
    await user.type(screen.getByLabelText(/^Destination/), '0xdeadbeef');
    await user.click(screen.getByRole('button', { name: 'Create policy meta-address' }));
    expect(screen.getByText('The destination must be a checksummed address.')).toBeTruthy();
  });
  it('imports a record, warns about foreign keys, rejects tampered ones', async () => {
    act(() => { importSession({ spendingKeyHex: a2.spendingPrivateKey, viewingKeyHex: a2.viewingPrivateKey }); });
    const user = await open();
    const box = screen.getByLabelText('Paste a policy record (JSON)');
    await user.click(box);
    await user.paste(canonical('acct-001').replace('"86400"', '"3600"'));
    await user.click(screen.getByRole('button', { name: 'Import record' }));
    expect(screen.getByText(/The record was rejected: invalid policy/)).toBeTruthy();
    await user.clear(box);
    await user.click(box);
    await user.paste(canonical('acct-001'));
    await user.click(screen.getByRole('button', { name: 'Import record' }));
    expect(screen.getByText(/belongs to other seller keys/)).toBeTruthy();
    expect(screen.getByText(a1.metaAddress)).toBeTruthy();
  });
  it('restores a lost no-limits record from candidate destinations', async () => {
    const user = await open();
    await user.click(screen.getByText('Lost the record?'));
    await user.click(screen.getByLabelText('Policy meta-address'));
    await user.paste(a2.metaAddress);
    await user.click(screen.getByLabelText(/Candidate destinations/));
    await user.paste(`${a1.policy.destination} ${a2.policy.destination}`);
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText('Policy found and restored. Download the record now.')).toBeTruthy();
    expect(screen.getByText(a2.metaAddress)).toBeTruthy();
  });
  it('verifies a deployment, reviews a payment and scans a scheme-2 payment to the loaded keys', async () => {
    act(() => { importSession({ spendingKeyHex: a1.spendingPrivateKey, viewingKeyHex: a1.viewingPrivateKey }); });
    const pay = preparePolicyPayment({ metaAddress: a1.metaAddress, deployment: DEPLOYMENT, token: 'native', gross: 1_000_000n, nowSec: 1n, rng: fixedRng(a1.ephemeralPrivateKey) });
    const log = scheme2Log({ stealth: a1.accountAddress, ephemeralPublicKey: a1.ephemeralPublicKey, metadata: pay.built.metadata, block: 500 });
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), head: 900, logs: [log] });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc) }));
    await user.click(screen.getByLabelText('PolicyAccountFactory address'));
    await user.paste(DEPLOYMENT.factory);
    await user.click(screen.getByLabelText('GhostPayPolicyRouter address'));
    await user.paste(ROUTER);
    await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
    const dep = await screen.findByLabelText('Verified policy deployment');
    expect(within(dep).getByText(DEPLOYMENT.implementation)).toBeTruthy();

    // Pay review (no wallet connected: send stays unavailable).
    await user.click(screen.getByLabelText(/Payee policy meta-address/));
    await user.paste(a1.metaAddress);
    await user.type(screen.getByLabelText('Amount (base units)'), '1000000');
    await user.click(screen.getByRole('button', { name: 'Review payment' }));
    const review = screen.getByLabelText('Policy payment review');
    expect(within(review).getByText('payNative')).toBeTruthy();
    expect(within(review).getByText('2500')).toBeTruthy();
    expect(screen.getByText('Connect a wallet on this network to send.')).toBeTruthy();

    // Scan needs a record for the policy hash.
    expect(screen.getByText(/Create or import a policy record first/)).toBeTruthy();
    await user.click(screen.getByLabelText('Paste a policy record (JSON)'));
    await user.paste(canonical('acct-001'));
    await user.click(screen.getByRole('button', { name: 'Import record' }));
    expect(screen.getByText('Policy record verified and loaded.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Scan for policy payments' }));
    expect(await screen.findByText(/1 policy announcement\(s\) read, 1 new for your keys/)).toBeTruthy();
    expect(screen.getByText(a1.accountAddress)).toBeTruthy();

    // Not deployed yet: the panel offers deployment.
    await user.click(screen.getByRole('button', { name: 'Check account' }));
    expect(await screen.findByRole('button', { name: 'Deploy account' })).toBeTruthy();
    expect(screen.getByLabelText('Withdrawal limits')).toBeTruthy();
    expect(screen.getByText(/The account is not deployed yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign and send withdrawal request' })).toBeNull();
  });
  it('reports a deployment that fails verification', async () => {
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls({ [`SCHEME_ID@${ROUTER.toLowerCase()}`]: 1n }) });
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc) }));
    await user.click(screen.getByLabelText('PolicyAccountFactory address'));
    await user.paste(DEPLOYMENT.factory);
    await user.click(screen.getByLabelText('GhostPayPolicyRouter address'));
    await user.paste(ROUTER);
    await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
    expect(await screen.findByText('The router is not a scheme 0x47500002 router.')).toBeTruthy();
  });
  it('pays with a wallet, flags a foreign pending withdrawal, cancels it, and withdraws within the limit', async () => {
    act(() => { importSession({ spendingKeyHex: a1.spendingPrivateKey, viewingKeyHex: a1.viewingPrivateKey }); });
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
    const info: WalletInfo = { id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: w };
    const user = await open(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info]) }));
    await user.click(screen.getByLabelText('PolicyAccountFactory address'));
    await user.paste(DEPLOYMENT.factory);
    await user.click(screen.getByLabelText('GhostPayPolicyRouter address'));
    await user.paste(ROUTER);
    await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
    await screen.findByLabelText('Verified policy deployment');
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
    expect(await screen.findByText(/Connected:/)).toBeTruthy();

    // Pay through the router.
    await user.click(screen.getByLabelText(/Payee policy meta-address/));
    await user.paste(a1.metaAddress);
    await user.type(screen.getByLabelText('Amount (base units)'), '1000000');
    await user.click(screen.getByRole('button', { name: 'Review payment' }));
    await user.click(screen.getByRole('button', { name: 'Send payment' }));
    expect(await screen.findByText(/Payment submitted/)).toBeTruthy();
    expect(decodeFunctionData({ abi: ghostPayPolicyRouterAbi, data: w.sent?.['data'] as `0x${string}` }).functionName).toBe('payNative');

    // Receive side.
    await user.click(screen.getByLabelText('Paste a policy record (JSON)'));
    await user.paste(canonical('acct-001'));
    await user.click(screen.getByRole('button', { name: 'Import record' }));
    await user.click(screen.getByRole('button', { name: 'Scan for policy payments' }));
    await screen.findByText(/1 new for your keys/);
    await user.click(screen.getByRole('button', { name: 'Check account' }));
    expect(await screen.findByText(/A withdrawal you did not sign on this device is pending/)).toBeTruthy();
    // 1 ETH leaf minus the 0.1 ETH foreign request that may execute first.
    expect(within(screen.getByLabelText('Withdrawal limits')).getByText('900000000000000000')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Cancel it' }));
    expect(await screen.findByText(/Cancel submitted/)).toBeTruthy();
    const cancel = decodeFunctionData({ abi: policyAccountAbi, data: w.sent?.['data'] as `0x${string}` });
    expect(cancel.functionName).toBe('cancel');
    expect(cancel.args[0]).toBe(foreign);
    expect(w.sent?.['to']).toBe(a1.accountAddress);

    await user.type(screen.getByLabelText('Amount to withdraw (base units)'), '1000000000000000000');
    await user.click(screen.getByRole('button', { name: 'Sign and send withdrawal request' }));
    expect(await screen.findByText('The amount is above what the policy allows right now.')).toBeTruthy();
    await user.clear(screen.getByLabelText('Amount to withdraw (base units)'));
    await user.type(screen.getByLabelText('Amount to withdraw (base units)'), '500000000000000000');
    await user.click(screen.getByRole('button', { name: 'Sign and send withdrawal request' }));
    expect(await screen.findByText(/Withdrawal request submitted/)).toBeTruthy();
    const req = decodeFunctionData({ abi: policyAccountAbi, data: w.sent?.['data'] as `0x${string}` });
    expect(req.functionName).toBe('requestWithdraw');
    expect((req.args[0] as { amount: bigint }).amount).toBe(5n * 10n ** 17n);
    await user.click(screen.getByRole('button', { name: 'Execute withdrawal' }));
    expect(await screen.findByText(/Execution submitted/)).toBeTruthy();
    expect(decodeFunctionData({ abi: policyAccountAbi, data: w.sent?.['data'] as `0x${string}` }).functionName).toBe('executeWithdraw');
  });
});
