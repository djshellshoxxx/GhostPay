// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZERO_ADDRESS } from '@ghostpay/policy-scheme';
import { clearSession, getSessionPublic, importSession } from '../../lib/session';
import { beginAttempt, finishAttempt } from '../../lib/duplicateAttemptJournal';
import { SETTINGS_KEY } from '../../lib/settings';
import { MockWallet } from '../../test/mockWallet';
import { makeServices, renderApp } from '../../test/render';
import { POLICY_FLAG } from './flag';
import * as chainModule from './chain';
import * as withdrawalState from './withdrawalState';
import { policyActionKey } from './withdrawalJournal';
import { withdrawalChain, installPolicyTestLocks } from './withdrawal.testutil';
import { LOCAL_POLICY_PROFILE, DEPLOYMENT, ROUTER, SEPOLIA, account, accountCalls, clientVectors, deploymentCalls, fixedRng, scheme2Log, walletMirror } from './fixtures.testutil';
import { preparePolicyPayment } from './pay';

const vector = account('acct-001');
const realVerify = chainModule.verifyPolicyDeployment;
const realSnapshot = withdrawalState.readWithdrawalSnapshot;
const requestId = `0x${'ab'.repeat(32)}` as const;
const priorHash = `0x${'cd'.repeat(32)}`;

beforeEach(() => {
  vi.spyOn(chainModule, 'verifyPolicyDeployment').mockImplementation((client, chain, input) => realVerify(client, chain, input, LOCAL_POLICY_PROFILE));
  installPolicyTestLocks();
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.stubEnv(POLICY_FLAG, '1');
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { [String(SEPOLIA)]: 'https://rpc.test' } }));
  act(() => { importSession({ spendingKeyHex: vector.spendingPrivateKey, viewingKeyHex: vector.viewingPrivateKey }); });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function openReceive(rejectSend = false) {
  const pay = preparePolicyPayment({ metaAddress: vector.metaAddress, deployment: DEPLOYMENT, token: 'native', gross: 1_000_000n, nowSec: 1n, rng: fixedRng(vector.ephemeralPrivateKey) });
  const wallet = new MockWallet({ chainId: SEPOLIA, rejectSend });
  const base = deploymentCalls();
  base.code.add(vector.accountAddress.toLowerCase());
  const rpc = withdrawalChain(SEPOLIA, {
    ...base, calls: { ...base.calls, ...accountCalls(vector) }, head: 900,
    balances: { [`native@${vector.accountAddress.toLowerCase()}`]: 3n * 10n ** 18n },
    logs: [scheme2Log({ stealth: vector.accountAddress, ephemeralPublicKey: vector.ephemeralPublicKey, metadata: pay.built.metadata, block: 500 })],
    extra: walletMirror(wallet),
  });
  const user = userEvent.setup();
  renderApp(makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([{ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: wallet }]) }));
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Policy accounts (experimental)' }));
  await user.click(screen.getByLabelText('PolicyAccountFactory address')); await user.paste(DEPLOYMENT.factory);
  await user.click(screen.getByLabelText('GhostPayPolicyRouter address')); await user.paste(ROUTER);
  await user.click(screen.getByRole('button', { name: 'Verify on-chain' }));
  await screen.findByLabelText('Verified policy deployment');
  await user.click(screen.getByLabelText('Paste a policy record (JSON)'));
  await user.paste(clientVectors.records.valid.find((record) => record.id === vector.id)!.canonical);
  await user.click(screen.getByRole('button', { name: 'Import record' }));
  await user.click(screen.getByRole('button', { name: 'Scan for policy payments' }));
  await screen.findByText(/1 new for your keys/);
  await user.click(screen.getByRole('button', { name: 'Find wallets' }));
  await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
  await screen.findByText(/Connected:/);
  return { user, wallet };
}

describe('policy receive audit regressions', () => {
  it('keeps withdrawal controls usable when chain timestamps exceed the JavaScript date range', async () => {
    const distant = (1n << 64n) - 1n;
    vi.spyOn(withdrawalState, 'readWithdrawalSnapshot').mockImplementation(async (input) => {
      const next = await realSnapshot(input);
      return {
        ...next, plan: { ...next.plan, executeAfter: distant },
        summary: { ...next.summary, pending: [{ id: requestId, token: ZERO_ADDRESS, amount: 1n, executeAfter: distant, known: true }] },
      };
    });
    const { user } = await openReceive();
    await user.click(screen.getByRole('button', { name: 'Check account' }));
    expect(await screen.findByText(`${distant} s (Unix)`)).toBeTruthy();
    expect(screen.getByText((text) => text.startsWith(`After ${distant} s (Unix) anyone can execute request`))).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Execute withdrawal' })).toBeTruthy();
  });

  it.each([false, true])('retains attempts discovered during the final refresh when wallet rejection is %s', async (rejectSend) => {
    let reads = 0;
    vi.spyOn(withdrawalState, 'readWithdrawalSnapshot').mockImplementation(async (input) => {
      const next = await realSnapshot(input);
      if (++reads === 1) return next;
      // Another tab's request and submitted cancellation are discovered by the final chain refresh.
      const scope = `${withdrawalState.withdrawalActionScope(getSessionPublic()!, next.deployment, vector.accountAddress, ZERO_ADDRESS)}:cancel:withdraw:${requestId}`;
      const key = policyActionKey({ chainId: SEPOLIA, account: ZERO_ADDRESS }, { to: vector.accountAddress, data: '0x', value: 0n }, scope);
      const attempt = beginAttempt({ key, chainId: SEPOLIA, account: ZERO_ADDRESS, kind: 'transaction' }, window.localStorage);
      finishAttempt(attempt, priorHash, window.localStorage);
      return { ...next, requests: [...next.requests, { id: requestId, token: ZERO_ADDRESS, amount: 1n, executeAfter: 1n, destination: vector.policy.destination, status: 1 }] };
    });
    const { user } = await openReceive(rejectSend);
    await user.click(screen.getByRole('button', { name: 'Check account' }));
    await user.type(await screen.findByLabelText('Amount to withdraw (base units)'), '1');
    await user.click(screen.getByRole('button', { name: 'Sign and send withdrawal request' }));
    await screen.findByText(rejectSend ? 'You rejected the request in your wallet.' : /Withdrawal request submitted/);
    expect(within(screen.getByRole('region', { name: 'Saved policy wallet attempts' })).getByText(priorHash)).toBeTruthy();
  });
});
