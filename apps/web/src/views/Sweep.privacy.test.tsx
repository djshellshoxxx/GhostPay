// @vitest-environment jsdom
// Opening a found payment never authorizes a balance lookup. Each click authorizes one UI read invocation;
// the shared RPC transport's bounded retry policy is tested separately by chain-adapters.
import type { RpcClient } from '@ghostpay/chain-adapters';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, generateSession } from '../lib/session';
import { notifyAppLock } from '../lib/appLock';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { DEFAULT_SCAN_PRIVACY, SCAN_PRIVACY_KEY, type ScanPrivacySettings } from '../lib/scanPrivacy';
import { ServicesContext } from '../lib/services';
import type { ScanMatch } from '../lib/scanClient';
import { AppContext, resetSweepAttemptsForTests, type AppState } from '../state';
import { makeServices } from '../test/render';
import { Sweep } from './Sweep';

const CHAIN = 84532;
const STEALTH = '0x1111111111111111111111111111111111111111';
const SECOND = '0x2222222222222222222222222222222222222222';
const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const READ_BALANCE = 'Read balance from the Settings RPC';
const PRIVATE: Partial<ScanPrivacySettings> = { transport: 'local-proxy', endpoints: { [String(CHAIN)]: 'http://127.0.0.1:1/' }, requireProxy: true };

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  resetSweepAttemptsForTests();
});
afterEach(() => { cleanup(); });

function store(patch: Partial<ScanPrivacySettings> | undefined): void {
  if (patch !== undefined) window.localStorage.setItem(SCAN_PRIVACY_KEY, JSON.stringify({ ...DEFAULT_SCAN_PRIVACY, ...patch }));
}

function mount(options: { readonly rpcReady?: Promise<void>; readonly request?: RpcClient['request']; readonly unavailable?: boolean } = {}) {
  const calls: { method: string; params: readonly unknown[] }[] = [];
  let getRpcCalls = 0;
  let secondaryCalls = 0;
  const settingsRpc: RpcClient = {
    chainId: CHAIN,
    request: (method, params) => {
      calls.push({ method, params });
      return options.request?.(method, params) ?? Promise.resolve(method === 'eth_call' ? `0x${(5_000_000n).toString(16).padStart(64, '0')}` : '0xde0b6b3a7640000');
    },
    blockNumber: () => Promise.resolve(0n),
    getBlock: () => Promise.resolve(null),
    getLogs: () => Promise.resolve([]),
  };
  const match = {
    chainId: CHAIN, stealthAddress: STEALTH, viaRouter: false, tagMatches: true, receipt: 'claimed',
    metadata: { kind: 'native' }, announcement: {},
  } as unknown as ScanMatch;
  let app: AppState = {
    view: 'sweep', setView: () => undefined, settings: { ...DEFAULT_SETTINGS, rpcUrls: { [String(CHAIN)]: 'https://rpc.example/' } },
    updateSettings: () => true, session: generateSession(), fragment: undefined, setFragment: () => undefined,
    matches: [match], setMatches: () => undefined, sweepTarget: { match, chainId: CHAIN }, selectForSweep: () => undefined,
    getRpc: () => {
      getRpcCalls += 1;
      return (options.rpcReady ?? Promise.resolve()).then(() => options.unavailable === true ? undefined : settingsRpc);
    },
    getSecondaryRpc: () => { secondaryCalls += 1; return Promise.resolve(settingsRpc); }, announce: () => undefined,
  };
  const services = makeServices();
  const view = () => <ServicesContext.Provider value={services}><AppContext.Provider value={app}><Sweep /></AppContext.Provider></ServicesContext.Provider>;
  const rendered = render(view());
  return {
    calls, rpc: settingsRpc, getRpcCalls: () => getRpcCalls, secondaryCalls: () => secondaryCalls, app: () => app,
    update(patch: Partial<AppState>) { app = { ...app, ...patch }; rendered.rerender(view()); },
    unmount: rendered.unmount,
  };
}

const settle = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const clickRead = (): void => { fireEvent.click(screen.getByRole('button', { name: READ_BALANCE })); };

describe('Sweep balance read and scan privacy', () => {
  it('shows "not read yet" before any click, with an RPC configured', async () => {
    const m = mount();
    await settle();
    expect(screen.getByText('not read yet (press the button below)')).toBeTruthy();
    expect(screen.queryByText('unknown (an RPC for this chain is required)')).toBeNull();
    expect(m.calls).toEqual([]);
  });

  it('tells the user when no RPC is available for the chain after a click, without any request', async () => {
    const m = mount({ unavailable: true });
    clickRead();
    await settle();
    expect(screen.getByText(/No RPC is configured for this chain in Settings/)).toBeTruthy();
    expect(screen.getByText('unknown (an RPC for this chain is required)')).toBeTruthy();
    expect(m.calls).toEqual([]);
  });

  it('behind a required local proxy, reads nothing from the Settings RPC until the user asks, then exactly the balance', async () => {
    store(PRIVATE);
    const m = mount();
    await settle();
    expect(m.calls).toEqual([]);
    expect(m.getRpcCalls()).toBe(0);
    expect(screen.getByText(/goes directly to the RPC in Settings, not through your private scan path/)).toBeTruthy();
    clickRead();
    await waitFor(() => { expect(m.calls).toHaveLength(1); });
    expect(m.calls[0]).toEqual({ method: 'eth_getBalance', params: [STEALTH, 'latest'] });
    expect(await screen.findByText(/^1 /)).toBeTruthy();
    await settle();
    expect(m.calls).toHaveLength(1);
  });

  it.each([
    ['default configuration', undefined],
    ['optional local proxy', { ...PRIVATE, requireProxy: false }],
  ] as const)('with %s, waits for an explicit click and reads exactly one balance', async (_label, privacy) => {
    store(privacy);
    const m = mount();
    await settle();
    expect(m.calls).toEqual([]);
    expect(m.getRpcCalls()).toBe(0);
    expect(screen.getByText(/read only when you click the button below/)).toBeTruthy();
    clickRead();
    await waitFor(() => { expect(m.calls).toEqual([{ method: 'eth_getBalance', params: [STEALTH, 'latest'] }]); });
    await settle();
    expect(m.calls).toHaveLength(1);
  });

  it('does not read again after ordinary context changes or destination edits; another click deliberately refreshes', async () => {
    store(PRIVATE);
    const m = mount();
    clickRead();
    await waitFor(() => { expect(m.calls.map((c) => c.method)).toEqual(['eth_getBalance']); });
    m.update({ fragment: 'unrelated' });
    fireEvent.change(screen.getByLabelText(/^Destination address/), { target: { value: SECOND } });
    await settle();
    expect(m.calls).toHaveLength(1);
    expect(m.getRpcCalls()).toBe(1);
    clickRead();
    await waitFor(() => { expect(m.calls).toHaveLength(2); });
    expect(m.getRpcCalls()).toBe(2);
  });

  it('clears the old balance and needs a new click for a different payment, including when returning to the first', async () => {
    store(PRIVATE);
    const m = mount();
    const original = m.app().sweepTarget!;
    clickRead();
    await screen.findByText(/^1 /);
    m.update({ sweepTarget: { ...original, match: { ...original.match, stealthAddress: SECOND } } });
    await settle();
    expect(screen.getByText('not read yet (press the button below)')).toBeTruthy();
    expect(m.calls).toHaveLength(1);
    m.update({ sweepTarget: original });
    await settle();
    expect(screen.getByText('not read yet (press the button below)')).toBeTruthy();
    expect(m.calls).toHaveLength(1);
    clickRead();
    await waitFor(() => { expect(m.calls).toHaveLength(2); });
  });

  it('requires a new click when the asset changes at the same address', async () => {
    store(PRIVATE);
    const m = mount();
    const original = m.app().sweepTarget!;
    clickRead();
    await screen.findByText(/^1 /);
    const match = { ...original.match, metadata: { kind: 'erc20', token: TOKEN } } as unknown as ScanMatch;
    m.update({ sweepTarget: { ...original, match } });
    await settle();
    expect(m.calls).toHaveLength(1);
    expect(screen.queryByText('1 USDC')).toBeNull();
    clickRead();
    await screen.findByText('5 USDC');
    expect(m.calls).toEqual([
      { method: 'eth_getBalance', params: [STEALTH, 'latest'] },
      { method: 'eth_call', params: [{ to: TOKEN, data: `0x70a08231${STEALTH.slice(2).padStart(64, '0')}` }, 'latest'] },
    ]);
  });

  it.each(['payment', 'asset', 'chain', 'provider', 'RPC factory', 'session', 'app lock', 'unmount'] as const)(
    'does not disclose the address if %s changes while RPC creation is pending', async (change) => {
      store(PRIVATE);
      let release!: () => void;
      const rpcReady = new Promise<void>((resolve) => { release = resolve; });
      const m = mount({ rpcReady });
      const original = m.app().sweepTarget!;
      clickRead();
      expect(m.getRpcCalls()).toBe(1);
      if (change === 'payment') m.update({ sweepTarget: { ...original, match: { ...original.match, stealthAddress: SECOND } } });
      if (change === 'asset') m.update({ sweepTarget: { ...original, match: { ...original.match, metadata: { kind: 'erc20', token: TOKEN } } as unknown as ScanMatch } });
      if (change === 'chain') m.update({ sweepTarget: { ...original, chainId: 8453 } });
      if (change === 'provider') m.update({ settings: { ...m.app().settings, rpcUrls: { [String(CHAIN)]: 'https://other.example/' } } });
      if (change === 'RPC factory') m.update({ getRpc: () => Promise.resolve(m.rpc) });
      if (change === 'session') clearSession();
      if (change === 'app lock') act(() => { notifyAppLock('idle'); });
      if (change === 'unmount') m.unmount();
      await act(async () => { release(); await Promise.resolve(); });
      await settle();
      expect(m.calls).toEqual([]);
      expect(m.getRpcCalls()).toBe(1);
      expect(m.secondaryCalls()).toBe(0);
    },
  );

  it('ignores a completed balance for a payment that is no longer selected', async () => {
    store(PRIVATE);
    let release!: (value: string) => void;
    const result = new Promise<string>((resolve) => { release = resolve; });
    const m = mount({ request: () => result });
    const original = m.app().sweepTarget!;
    clickRead();
    await waitFor(() => { expect(m.calls).toHaveLength(1); });
    m.update({ sweepTarget: { ...original, match: { ...original.match, stealthAddress: SECOND } } });
    await act(async () => { release('0xde0b6b3a7640000'); await Promise.resolve(); });
    expect(screen.queryByText(/^1 /)).toBeNull();
    expect(m.calls).toHaveLength(1);
  });

  it('does not retry or fall back after a rejected read until the user clicks again', async () => {
    store(PRIVATE);
    const m = mount({ request: () => Promise.reject(new Error('unavailable')) });
    clickRead();
    await waitFor(() => { expect(m.calls).toHaveLength(1); });
    m.update({ fragment: 'unrelated' });
    await settle();
    expect(m.calls).toHaveLength(1);
    expect(m.secondaryCalls()).toBe(0);
    clickRead();
    await waitFor(() => { expect(m.calls).toHaveLength(2); });
    expect(m.secondaryCalls()).toBe(0);
  });

  it('does not retry an unavailable RPC when settings change without another click', async () => {
    store(PRIVATE);
    const m = mount({ unavailable: true });
    clickRead();
    await settle();
    m.update({ settings: { ...m.app().settings, rpcUrls: { [String(CHAIN)]: 'https://other.example/' } } });
    await settle();
    expect(m.getRpcCalls()).toBe(1);
    expect(m.calls).toEqual([]);
    expect(m.secondaryCalls()).toBe(0);
  });
});
