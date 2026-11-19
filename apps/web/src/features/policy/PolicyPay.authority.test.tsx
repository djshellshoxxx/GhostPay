// @vitest-environment jsdom
import { startTransition, useLayoutEffect, useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findChain } from '@ghostpay/chain-adapters';
import { parsePolicyRecord, type PolicyRecord } from '@ghostpay/policy-scheme';
import { clearSession } from '../../lib/session';
import type { Eip1193Provider, WalletSession } from '../../lib/wallet';
import { MockWallet } from '../../test/mockWallet';
import { PolicyPay } from './PolicyPay';
import { account, clientVectors, DEPLOYMENT, fakeChain, SEPOLIA, walletMirror } from './fixtures.testutil';

const app = vi.hoisted(() => ({ getRpc: vi.fn(), announce: vi.fn() }));
vi.mock('../../state', () => ({ useApp: () => app }));
vi.mock('../../lib/services', () => ({ useServices: () => ({ nowMs: () => 1_800_000_000_000, sleep: async () => {} }) }));
vi.mock('../../components/WalletAttempts', () => ({ WalletAttempts: () => null }));

const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const payee = account('acct-001'); // This policy covers native and USDC, but not DAI.
const record = parsePolicyRecord(clientVectors.records.valid.find((v) => v.id === 'acct-001')!.canonical);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
  app.getRpc.mockReset();
  app.announce.mockReset();
});
afterEach(() => { cleanup(); });

describe('PolicyPay record authority while a wallet reply is pending', () => {
  it.each([
    { name: 'refuses an asset excluded by the newly committed record', token: DAI, sends: 0 },
    { name: 'allows an asset covered by the newly committed record', token: USDC, sends: 1 },
  ])('$name', async ({ token, sends }) => {
    const wallet = new MockWallet({ chainId: SEPOLIA });
    const reachedFinalAccount = deferred<void>();
    const finalAccount = deferred<unknown>();
    let accountReads = 0;
    const provider: Eip1193Provider = {
      request(args) {
        if (args.method === 'eth_accounts' && ++accountReads === 2) {
          reachedFinalAccount.resolve();
          return finalAccount.promise;
        }
        return wallet.request(args);
      },
    };
    const session: WalletSession = {
      chainId: SEPOLIA, account: wallet.account as WalletSession['account'],
      wallet: { id: 'policy-authority', name: 'Policy authority fixture', kind: 'eip6963', provider },
    };
    const rpc = fakeChain(SEPOLIA, {
      calls: { [`allowance(${wallet.account.toLowerCase()})@${token.toLowerCase()}`]: 1_000_000n },
      extra: walletMirror(wallet),
    });
    app.getRpc.mockResolvedValue(rpc);
    const committed = deferred<void>();
    let importRecord!: () => void;
    function Harness(): ReactNode {
      const [records, setRecords] = useState<readonly PolicyRecord[]>([]);
      importRecord = () => { setRecords([record]); };
      useLayoutEffect(() => {
        if (records.length === 0) return;
        // A reply can settle after the record commit but before passive effects. Exhaust this host frame's
        // budget so React yields its passive work; this avoids relying on incidental machine load. Neither
        // the coverage guard nor the policy send/wallet implementation is mocked.
        const until = performance.now() + 12;
        while (performance.now() < until) { /* bounded commit work */ }
        finalAccount.resolve([wallet.account]);
        committed.resolve();
      }, [records]);
      return <>
        <output aria-label="Imported policy records">{records.length}</output>
        <PolicyPay ctx={{ chain: findChain(SEPOLIA)!, deployment: DEPLOYMENT, wallet: session, records, addRecord: () => {}, assertDeploymentCurrent: () => {} }} />
      </>;
    }
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/Payee policy meta-address/), { target: { value: payee.metaAddress } });
    fireEvent.change(screen.getByLabelText(/^Token \("native" or ERC-20 address\)/), { target: { value: token } });
    fireEvent.change(screen.getByLabelText('Amount (base units)'), { target: { value: '1000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    expect(screen.getByText('This app cannot check that the payee can withdraw this asset')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send payment' }));
      await reachedFinalAccount.promise;
    });
    expect(wallet.calls.filter((call) => call.method === 'eth_sendTransaction')).toHaveLength(0);

    // act deliberately flushes passive work synchronously. For this one host turn, use the real concurrent
    // scheduler so the already pending wallet continuation can run in the commit-to-passive-effect interval.
    const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = environment.IS_REACT_ACT_ENVIRONMENT;
    environment.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      startTransition(() => { importRecord(); });
      await committed.promise;
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    } finally {
      if (previous === undefined) delete environment.IS_REACT_ACT_ENVIRONMENT;
      else environment.IS_REACT_ACT_ENVIRONMENT = previous;
    }
    await act(async () => {});
    expect(screen.getByLabelText('Imported policy records').textContent).toBe('1');
    expect(wallet.calls.filter((call) => call.method === 'eth_sendTransaction')).toHaveLength(sends);
    if (sends === 0) {
      expect(screen.getByText(/Blocked: the payee's policy record loaded in this tab has per-token limits and none for this asset/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Send payment' })).toBeNull();
    } else {
      expect(app.announce).toHaveBeenCalledOnce();
    }
  });
});
