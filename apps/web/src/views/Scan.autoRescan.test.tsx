// @vitest-environment jsdom
// Opt-in automatic re-check while the page is open (GitHub Pages release: there is no background server).
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as scanClient from '../lib/scanClient';
import { captureSessionGuard, clearSession, generateSession, revealViewingKey } from '../lib/session';
import type { ReconciliationVaultStore } from '../lib/reconciliationVault';
import { SETTINGS_KEY } from '../lib/settings';
import { FAKE_ANNOUNCER, FAKE_ROUTER } from '../test/fakeManifest';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { InlineWorker } from '../test/inlineWorker';
import { makeLog } from '../test/announcements';
import { chainWithLogs } from '../test/mockChain';
import { makeServices, memoryCheckpoints, renderApp } from '../test/render';
import type { Services } from '../lib/services';
import type { RpcLog } from '@ghostpay/chain-adapters';

// In-memory reconciliation vault (as in Scan.test.tsx): jsdom has no IndexedDB.
let vaultData = new Map<string, string>();
vi.mock('../lib/reconciliationVault', async (original) => {
  const actual = await original<typeof import('../lib/reconciliationVault')>();
  return { ...actual, createCurrentReconciliationVault: async (chainId: number, sellerKeyId: string) => {
    const store: ReconciliationVaultStore = {
      read: (key) => Promise.resolve(vaultData.get(key) ?? null),
      compareAndSwap: (key, expected, next, guard) => {
        guard();
        if ((vaultData.get(key) ?? null) !== expected) return Promise.resolve(false);
        vaultData.set(key, next);
        return Promise.resolve(true);
      },
    };
    const vault = new actual.ReconciliationVault(store, { chainId, sellerKeyId }, captureSessionGuard());
    await vault.unlock(revealViewingKey());
    return vault;
  } };
});

// The production re-check delay is 60-90 s; the behaviour under test is the same with a short one. Only that call is
// shortened: randomDelayMs is also the CSPRNG behind the scan window shuffle, which must stay real.
vi.mock('../lib/jitter', async (original) => {
  const actual = await original<typeof import('../lib/jitter')>();
  return { ...actual, randomDelayMs: (min: number, max: number, c?: Parameters<typeof actual.randomDelayMs>[2]) => (min === 60_000 && max === 90_000 ? 25 : actual.randomDelayMs(min, max, c)) };
});

const AUTO = 'Keep checking for new payments while this page is open';
const loaded: Services['loadManifest'] = (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id), trust: 'unsigned-dev', warning: 'UNSIGNED DEV MANIFEST: test.' });
let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  clearSession();
  vaultData = new Map();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** A chain whose head and announcement list can grow between scans, and whose RPC can be made to fail. */
function growingChain(logs: RpcLog[]): { services: Services; setHead: (n: number) => void; fail: (on: boolean) => void } {
  let head = 500;
  let failing = false;
  const rpc = chainWithLogs(84532, 0, logs, (method) => {
    if (failing) throw new Error('rpc down');
    if (method === 'eth_blockNumber') return `0x${head.toString(16)}`;
    return undefined;
  });
  const services = makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)), checkpoints: memoryCheckpoints(), createScanWorker: () => new InlineWorker() });
  return { services, setHead: (n) => { head = n; }, fail: (on) => { failing = on; } };
}

async function startScan(services: Services, auto: boolean): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
  await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
  const box = screen.getByLabelText<HTMLInputElement>(AUTO);
  expect(box.checked).toBe(false);
  if (auto) await user.click(box);
  await user.type(screen.getByLabelText('Start block'), '100');
  await user.click(screen.getByRole('button', { name: 'Start scan' }));
  await waitFor(() => { expect(screen.getByText(/Finished\./)).toBeTruthy(); });
  return user;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

describe('Scan: automatic re-check while the page is open', () => {
  it('is off by default and discloses the repeated RPC timing', async () => {
    generateSession();
    const runner = vi.spyOn(scanClient, 'runScan');
    const { services } = growingChain([]);
    await startScan(services, false);
    expect(screen.getByText(/Your RPC provider can see the timing of these repeated requests/)).toBeTruthy();
    await sleep(150);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('resumes from the checkpoint, merges new payments and keeps the ones already listed', async () => {
    const pub = generateSession();
    const first = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 120, index: 0, caller: FAKE_ROUTER, amount: 2_500_000n });
    const logs: RpcLog[] = [first.log];
    const runner = vi.spyOn(scanClient, 'runScan');
    const chain = growingChain(logs);
    await startScan(chain.services, true);
    expect(screen.getByText(first.stealthAddress)).toBeTruthy();
    const second = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 700, index: 0, caller: FAKE_ROUTER, amount: 1_000_000n });
    logs.push(second.log);
    chain.setHead(1000);
    expect(await screen.findByText(second.stealthAddress, {}, { timeout: 5000 })).toBeTruthy();
    // Merged, not replaced: the earlier payment is still listed (it may be the one the seller is about to sweep).
    expect(screen.getByText(first.stealthAddress)).toBeTruthy();
    const resumed = runner.mock.calls[1]?.[0];
    expect(resumed?.cursor?.nextBlock).toBeGreaterThanOrEqual(120n);
    expect(resumed?.cursor?.nextBlock).not.toBe(100n);
  });

  it('waits while the tab is hidden and continues once it is visible again', async () => {
    generateSession();
    const runner = vi.spyOn(scanClient, 'runScan');
    const { services } = growingChain([]);
    visibility = 'hidden';
    await startScan(services, true);
    await sleep(200);
    expect(runner).toHaveBeenCalledTimes(1);
    visibility = 'visible';
    await waitFor(() => { expect(runner.mock.calls.length).toBeGreaterThanOrEqual(2); }, { timeout: 5000 });
  });

  it('stops after an error and says so; it does not retry on its own', async () => {
    generateSession();
    const runner = vi.spyOn(scanClient, 'runScan');
    const chain = growingChain([]);
    await startScan(chain.services, true);
    chain.fail(true);
    expect(await screen.findByText(/Automatic checking stopped/, {}, { timeout: 5000 })).toBeTruthy();
    const calls = runner.mock.calls.length;
    await sleep(250);
    expect(runner.mock.calls.length).toBe(calls);
  });

  it('stops when the user turns it off', async () => {
    generateSession();
    const runner = vi.spyOn(scanClient, 'runScan');
    const { services } = growingChain([]);
    const user = await startScan(services, true);
    await user.click(screen.getByLabelText(AUTO));
    expect(screen.getByLabelText<HTMLInputElement>(AUTO).checked).toBe(false);
    const calls = runner.mock.calls.length;
    await sleep(200);
    expect(runner.mock.calls.length).toBe(calls);
  });
});
