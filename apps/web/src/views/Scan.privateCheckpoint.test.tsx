// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as scanClient from '../lib/scanClient';
import { clearSession, generateSession, getSessionBackup, getSessionPublic, importSession } from '../lib/session';
import { notifyAppLock } from '../lib/appLock';
import { PrivateScanVault } from '../lib/privateScanStore';
import type { ReconciliationVaultStore } from '../lib/reconciliationVault';
import type { Services } from '../lib/services';
import { SETTINGS_KEY } from '../lib/settings';
import { FAKE_ANNOUNCER } from '../test/fakeManifest';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { InlineWorker } from '../test/inlineWorker';
import { makeLog } from '../test/announcements';
import { chainWithLogs } from '../test/mockChain';
import { makeServices, renderApp } from '../test/render';
import { AUTO_RESCAN_MAX_MS } from './Scan';

const scalar = (value: number): string => value.toString(16).padStart(64, '0');
const KEYS = { spendingKeyHex: scalar(11), viewingKeyHex: scalar(12), signingKeyHex: scalar(13) };
const OTHER = { spendingKeyHex: scalar(21), viewingKeyHex: scalar(22), signingKeyHex: scalar(23) };
const loaded: Services['loadManifest'] = (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id), trust: 'unsigned-dev', warning: 'UNSIGNED DEV MANIFEST: test.' });

function memoryStore() {
  const data = new Map<string, string>();
  let gate: Promise<void> | undefined;
  let waiting = false;
  let reject = false;
  const store: ReconciliationVaultStore = {
    read: (key) => Promise.resolve(data.get(key) ?? null),
    compareAndSwap: async (key, expected, next, guard) => {
      if (gate !== undefined) { waiting = true; await gate; }
      guard();
      if (reject) throw new Error('synthetic private RPC diagnostic must not be rendered');
      if ((data.get(key) ?? null) !== expected) return false;
      data.set(key, next);
      return true;
    },
  };
  return { store, data, setGate: (value: Promise<void> | undefined) => { gate = value; }, waiting: () => waiting, fail: () => { reject = true; } };
}

function setup(custody: 'imported' | 'sole-copy' = 'imported') {
  const pub = custody === 'sole-copy' ? generateSession() : importSession(KEYS);
  const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 120, index: 0, caller: `0x${'8'.repeat(40)}`, amount: 2_500_000n });
  const rpc = chainWithLogs(84532, 500, [mine.log]);
  const saved = memoryStore();
  const legacy = { load: vi.fn(() => ({ nextBlock: 999_999n })), save: vi.fn(), clear: vi.fn() };
  const services = makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)), createScanWorker: () => new InlineWorker(), checkpoints: legacy, privateScanStore: saved.store });
  return { pub, mine, saved, services, legacy };
}

async function open(services: Services, ready = true) {
  const user = userEvent.setup();
  const view = renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
  await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
  if (ready) await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Start scan' }).disabled).toBe(false));
  return { user, view };
}

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
});
afterEach(() => { cleanup(); clearSession(); vi.restoreAllMocks(); });

describe('private seller checkpoint UI', () => {
  it('atomically saves discovery and resumes it after remount without using legacy plaintext progress', async () => {
    const s = setup();
    const runner = vi.spyOn(scanClient, 'runScan');
    const first = await open(s.services);
    await first.user.clear(screen.getByLabelText('Start block'));
    await first.user.type(screen.getByLabelText('Start block'), '100');
    await first.user.click(screen.getByRole('button', { name: 'Start scan' }));
    await screen.findByText(/Finished\./);
    expect(screen.getByText(s.mine.stealthAddress)).toBeTruthy();
    const encrypted = [...s.saved.data.values()].filter((text) => text.includes('ciphertext'));
    expect(encrypted).toHaveLength(1);
    expect(encrypted[0]).not.toContain(s.mine.stealthAddress.toLowerCase());
    expect(encrypted[0]).not.toContain(KEYS.viewingKeyHex);
    expect(s.legacy.load).not.toHaveBeenCalled();
    expect(s.legacy.save).not.toHaveBeenCalled();
    first.view.unmount();

    const second = await open(s.services);
    expect(await screen.findByText(/1 saved payment observation/)).toBeTruthy();
    expect(screen.queryByText(s.mine.stealthAddress)).toBeNull();
    await second.user.click(screen.getByRole('button', { name: 'Start scan' }));
    await screen.findByText(/Finished\./);
    expect(screen.getByText(s.mine.stealthAddress)).toBeTruthy();
    expect(runner.mock.calls[1]?.[0].cursor.nextBlock).toBeGreaterThan(120n);
    expect((runner.mock.calls[1]?.[0] as scanClient.ScanParams & { replayBlocks?: readonly bigint[] }).replayBlocks).toEqual([120n]);
  });

  it('keeps the completed checkpoint behind a failed durable write and reports a fixed recoverable failure', async () => {
    const s = setup();
    const { user } = await open(s.services);
    s.saved.fail();
    await user.clear(screen.getByLabelText('Start block'));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/saved|storage|checkpoint/i);
    expect(alert.textContent).not.toContain('synthetic private RPC diagnostic');
    expect(screen.queryByText(/Finished\./)).toBeNull();
    expect([...s.saved.data.values()].filter((text) => text.includes('ciphertext'))).toHaveLength(0);
  });

  it('rejects a pending save after replacement with the same seller keys', async () => {
    const s = setup();
    let release!: () => void;
    const { user } = await open(s.services);
    s.saved.setGate(new Promise<void>((resolve) => { release = resolve; }));
    await user.clear(screen.getByLabelText('Start block'));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    try {
      await waitFor(() => expect(s.saved.waiting()).toBe(true));
      act(() => { clearSession(false); importSession(KEYS); });
      release();
      await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Start scan' }).disabled).toBe(false));
      expect([...s.saved.data.values()].filter((text) => text.includes('ciphertext'))).toHaveLength(0);
      expect(screen.queryByText(/Finished\./)).toBeNull();
      expect(screen.queryByText(s.mine.stealthAddress)).toBeNull();
    } finally { release(); }
  });

  it('does not reuse discovery after changing seller or enabling deep scanning', async () => {
    const s = setup();
    const { user } = await open(s.services);
    await user.clear(screen.getByLabelText('Start block'));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await screen.findByText(/Finished\./);
    await user.click(screen.getByLabelText(/Deep scan/));
    await waitFor(() => expect(screen.queryByText(/1 saved payment observation/)).toBeNull());
    expect(screen.queryByLabelText('Resume from the last checkpoint')).toBeNull();
    act(() => { importSession(OTHER); });
    await waitFor(() => expect(screen.queryByText(s.mine.stealthAddress)).toBeNull());
    expect(screen.queryByText(/Finished\./)).toBeNull();
  });

  it.each(['corrupt', 'oversized'] as const)('invalidates %s history and allows an explicit reset followed by safe rediscovery', async (kind) => {
    const s = setup();
    const first = await open(s.services);
    await first.user.click(screen.getByRole('button', { name: 'Start scan' }));
    await screen.findByText(/Finished\./);
    first.view.unmount();
    const key = [...s.saved.data.entries()].find(([, text]) => text.includes('ciphertext'))?.[0];
    expect(key).toBeDefined();
    s.saved.data.set(key!, kind === 'corrupt' ? '{"version":99,"privateDiagnostic":"do-not-echo"}' : 'x'.repeat(4_000_513));
    const second = await open(s.services, false);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(kind === 'corrupt' ? /could not be authenticated|incompatible format/ : /safety limit/);
    expect(alert.textContent).not.toContain('do-not-echo');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Start scan' }).disabled).toBe(true);
    await second.user.click(screen.getByRole('button', { name: 'Clear saved scan history' }));
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Start scan' }).disabled).toBe(false));
    expect(s.saved.data.get(key!)).not.toContain('do-not-echo');
    await second.user.click(screen.getByRole('button', { name: 'Start scan' }));
    await screen.findByText(/Finished\./);
    expect(screen.getByText(s.mine.stealthAddress)).toBeTruthy();
  });

  it('preserves the old durable journal when a manual rescan has an invalid start block', async () => {
    const s = setup();
    const { user } = await open(s.services);
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await screen.findByText(/Finished\./);
    const before = [...s.saved.data.entries()];
    await user.click(screen.getByLabelText('Resume from checkpoint'));
    await user.clear(screen.getByLabelText('Start block'));
    await user.type(screen.getByLabelText('Start block'), 'invalid');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Enter the block number/);
    expect([...s.saved.data.entries()]).toEqual(before);
    expect(screen.getByText(/1 saved payment observation/)).toBeTruthy();
  });

  it('cancels a pending durable write when network settings change and uses the newly selected RPC', async () => {
    const s = setup();
    const createRpc = vi.fn(s.services.createRpc);
    const { user } = await open({ ...s.services, createRpc });
    let release!: () => void;
    s.saved.setGate(new Promise<void>((resolve) => { release = resolve; }));
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    try {
      await waitFor(() => expect(s.saved.waiting()).toBe(true));
      act(() => {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://replacement-rpc.test' } }));
        window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_KEY }));
      });
      release();
      s.saved.setGate(undefined);
      await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Start scan' }).disabled).toBe(false));
      expect([...s.saved.data.values()].filter((text) => text.includes('ciphertext'))).toHaveLength(0);
      expect(screen.queryByText(/Finished\./)).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Start scan' }));
      await screen.findByText(/Finished\./);
      expect(createRpc.mock.calls.map(([, endpoint]) => endpoint)).toEqual(['https://rpc.test/', 'https://replacement-rpc.test/']);
    } finally { release(); }
  });

  it('pauses before a pending checkpoint commits and retains the last complete position', async () => {
    const s = setup();
    const { user } = await open(s.services);
    let release!: () => void;
    s.saved.setGate(new Promise<void>((resolve) => { release = resolve; }));
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    try {
      await waitFor(() => expect(s.saved.waiting()).toBe(true));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      release();
      await screen.findByText(/Paused\. Resume from the last durably saved checkpoint/);
      await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Start scan' }).disabled).toBe(false));
      expect([...s.saved.data.values()].filter((text) => text.includes('ciphertext'))).toHaveLength(0);
      expect(screen.queryByText(/Finished\./)).toBeNull();
    } finally { release(); }
  });

  it.each(['RPC setup', 'checkpoint commit'] as const)('pauses on app idle lock during %s while retaining the sole seller-key copy', async (stage) => {
    const s = setup('sole-copy');
    const runner = vi.spyOn(scanClient, 'runScan');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let opening = false;
    let firstRpc = true;
    const createRpc: Services['createRpc'] = async (chain, endpoint) => {
      const client = await s.services.createRpc(chain, endpoint);
      if (stage === 'RPC setup' && firstRpc) {
        firstRpc = false;
        opening = true;
        await gate;
      }
      return client;
    };
    const { user } = await open({ ...s.services, createRpc });
    const lock = vi.spyOn(PrivateScanVault.prototype, 'lock');
    const retainedSession = getSessionPublic();
    expect(getSessionBackup()?.backedUp).toBe(false);
    const automatic = screen.getByLabelText<HTMLInputElement>('Keep checking for new payments while this page is open');
    await user.click(automatic);
    if (stage === 'checkpoint commit') s.saved.setGate(gate);
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    try {
      await waitFor(() => expect(stage === 'RPC setup' ? opening : s.saved.waiting()).toBe(true));
      const before = [...s.saved.data.entries()];
      expect(lock).not.toHaveBeenCalled();
      act(() => { notifyAppLock('idle'); });
      expect(lock).toHaveBeenCalled();
      expect(getSessionPublic()).toBe(retainedSession);
      expect(automatic.checked).toBe(false);
      await screen.findByText(/Paused\. Resume from the last durably saved checkpoint/);
      await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Start scan' }).disabled).toBe(false));
      await act(async () => {
        release();
        await gate;
        if (stage === 'checkpoint commit') await Promise.allSettled(runner.mock.results.map((result) => result.value as Promise<unknown>));
      });
      expect([...s.saved.data.entries()]).toEqual(before);
      expect(screen.queryByText(/Finished\./)).toBeNull();
      expect(getSessionPublic()).toBe(retainedSession);
      s.saved.setGate(undefined);
      await user.click(screen.getByRole('button', { name: 'Start scan' }));
      await screen.findByText(/Finished\./);
      expect(screen.getByText(s.mine.stealthAddress)).toBeTruthy();
      expect(automatic.checked).toBe(false);
    } finally { release(); }
  });

  it('disarms an already scheduled automatic scan synchronously on app idle lock', async () => {
    const s = setup('sole-copy');
    const runner = vi.spyOn(scanClient, 'runScan');
    const { user } = await open(s.services);
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await screen.findByText(/Finished\./);
    const retainedSession = getSessionPublic();
    const automatic = screen.getByLabelText<HTMLInputElement>('Keep checking for new payments while this page is open');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      fireEvent.click(automatic);
      expect(automatic.checked).toBe(true);
      act(() => {
        notifyAppLock('idle');
        // Run the due callback before React can flush the checkbox state or clean up the timer effect.
        vi.advanceTimersByTime(AUTO_RESCAN_MAX_MS);
      });
      expect(automatic.checked).toBe(false);
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Start scan' }).disabled).toBe(false);
      expect(runner).toHaveBeenCalledTimes(1);
      expect(getSessionPublic()).toBe(retainedSession);
    } finally { vi.useRealTimers(); }
  });

  it.each(['RPC opening', 'manifest readback'] as const)('cancels noncooperative %s promptly and allows a fresh scan', async (stage) => {
    const s = setup();
    const runner = vi.spyOn(scanClient, 'runScan');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let opening = false;
    let clients = 0;
    let oldRequests = 0;
    const createRpc: Services['createRpc'] = async (chain, endpoint) => {
      const client = await s.services.createRpc(chain, endpoint);
      clients++;
      if (clients !== 1) return client;
      if (stage === 'RPC opening') {
        opening = true;
        await gate;
        return client;
      }
      return { ...client, request: async (method, params) => {
        oldRequests++;
        if (oldRequests === 1) { opening = true; await gate; }
        return client.request(method, params);
      } };
    };
    const { user } = await open({ ...s.services, createRpc });
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    try {
      await waitFor(() => expect(opening).toBe(true));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Start scan' }).disabled).toBe(false));
      expect(screen.getByText(/Paused\. Resume from the last durably saved checkpoint/)).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Start scan' }));
      await screen.findByText(/Finished\./);
      expect(screen.getByText(s.mine.stealthAddress)).toBeTruthy();
      await act(async () => { release(); await gate; });
      expect(runner).toHaveBeenCalledTimes(1);
      if (stage === 'manifest readback') expect(oldRequests).toBe(1);
    } finally { release(); }
  });

  it('retains the saved incomplete-coverage warning after a clean resume', async () => {
    const s = setup();
    let runs = 0;
    vi.spyOn(scanClient, 'runScan').mockImplementation(async (p) => {
      try {
        const blocks = ++runs === 1 ? [120n] : [];
        const nextBlock = runs === 1 ? 140n : 180n;
        const cursor = { nextBlock, last: { number: nextBlock - 1n, hash: `0x${scalar(Number(nextBlock - 1n))}` as const } };
        await p.onCheckpoint?.(cursor, [], blocks);
        p.onProgress?.({ nextBlock: cursor.nextBlock, scanned: 0, matches: 0, skipped: 0, caughtUp: true, routerOnlyBlocks: blocks });
        return { cursor, matches: [], scanned: 0, discrepancies: [], limitReached: false, routerOnlyBlocks: blocks };
      } finally { p.viewingKey.fill(0); }
    });
    const first = await open(s.services);
    await first.user.click(screen.getByRole('button', { name: 'Start scan' }));
    await screen.findByText(/Finished\./);
    first.view.unmount();
    const second = await open(s.services);
    expect(screen.getByText(/Block 120 held more announcements/)).toBeTruthy();
    await second.user.click(screen.getByRole('button', { name: 'Start scan' }));
    await screen.findByText(/Finished\./);
    expect(screen.getByText(/Block 120 held more announcements/)).toBeTruthy();
  });

  it('stops instead of truncating accumulated incomplete-coverage history', async () => {
    const s = setup();
    let runs = 0;
    vi.spyOn(scanClient, 'runScan').mockImplementation(async (p) => {
      try {
        const blocks = ++runs === 1 ? Array.from({ length: 1000 }, (_, index) => BigInt(index)) : [1000n];
        const nextBlock = runs === 1 ? 1000n : 1001n;
        const cursor = { nextBlock, last: { number: nextBlock - 1n, hash: `0x${scalar(Number(nextBlock - 1n))}` as const } };
        await p.onCheckpoint?.(cursor, [], blocks);
        return { cursor, matches: [], scanned: 0, discrepancies: [], limitReached: false, routerOnlyBlocks: blocks };
      } finally { p.viewingKey.fill(0); }
    });
    const { user } = await open(s.services);
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await screen.findByText(/Finished\./);
    const before = [...s.saved.data.entries()];
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/safety limit/);
    expect([...s.saved.data.entries()]).toEqual(before);
    expect(screen.queryByText(/Finished\./)).toBeNull();
  });

  it('offers reload after a conflicting checkpoint write and safely retries', async () => {
    const s = setup();
    const { user } = await open(s.services);
    vi.spyOn(s.saved.store, 'compareAndSwap').mockImplementationOnce((_key, _expected, _next, guard) => { guard(); return Promise.resolve(false); });
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/another tab|changed in another/i);
    await user.click(screen.getByRole('button', { name: 'Reload saved scan history' }));
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Start scan' }).disabled).toBe(false));
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await screen.findByText(/Finished\./);
    expect(screen.getByText(s.mine.stealthAddress)).toBeTruthy();
  });

  it.each(['500', '501'])('does not claim completed coverage for an unchanged checkpoint at block %s', async (startBlock) => {
    const s = setup();
    const { user } = await open(s.services);
    await user.clear(screen.getByLabelText('Start block'));
    await user.type(screen.getByLabelText('Start block'), startBlock);
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await screen.findByText(/Finished\./);
    expect(screen.queryByText(/Completed through block/)).toBeNull();
    expect(screen.queryByText(/Last durably completed block:/)).toBeNull();
    expect(screen.getByTestId('private-scan-state').textContent).toMatch(/Not started|Saved scan history is available/);
  });
});
