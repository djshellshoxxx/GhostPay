// @vitest-environment jsdom
// R12-2: with scan privacy "local-proxy" + "Require the private path", opening a found payment in Sweep must not contact
// the Settings RPC about the one-time address until the user asks; every other configuration keeps the automatic read.
import type { RpcClient } from '@ghostpay/chain-adapters';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, generateSession } from '../lib/session';
import { DEFAULT_SCAN_PRIVACY, SCAN_PRIVACY_KEY, type ScanPrivacySettings } from '../lib/scanPrivacy';
import { ServicesContext } from '../lib/services';
import type { ScanMatch } from '../lib/scanClient';
import { AppContext, resetSweepAttemptsForTests, type AppState } from '../state';
import { makeServices } from '../test/render';
import { Sweep } from './Sweep';

const CHAIN = 84532;
const STEALTH = '0x1111111111111111111111111111111111111111';
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

function mount(): { calls: { method: string; params: readonly unknown[] }[]; getRpcCalls: () => number } {
  const calls: { method: string; params: readonly unknown[] }[] = [];
  let getRpcCalls = 0;
  const settingsRpc: RpcClient = {
    chainId: CHAIN,
    request: (method, params) => { calls.push({ method, params }); return Promise.resolve('0xde0b6b3a7640000'); },
    blockNumber: () => Promise.resolve(0n),
    getBlock: () => Promise.resolve(null),
    getLogs: () => Promise.resolve([]),
  };
  const match = {
    chainId: CHAIN, stealthAddress: STEALTH, viaRouter: false, tagMatches: true, receipt: 'claimed',
    metadata: { kind: 'native' }, announcement: {},
  } as unknown as ScanMatch;
  const app = {
    view: 'sweep', setView: () => undefined, settings: { relayerUrl: '', rpcUrls: { [String(CHAIN)]: 'https://rpc.example/' }, rpcUrlsSecondary: {} },
    updateSettings: () => true, session: generateSession(), fragment: undefined, setFragment: () => undefined,
    matches: [match], setMatches: () => undefined, sweepTarget: { match, chainId: CHAIN }, selectForSweep: () => undefined,
    getRpc: () => { getRpcCalls += 1; return Promise.resolve(settingsRpc); }, getSecondaryRpc: () => Promise.resolve(undefined), announce: () => undefined,
  } as unknown as AppState;
  render(<ServicesContext.Provider value={makeServices()}><AppContext.Provider value={app}><Sweep /></AppContext.Provider></ServicesContext.Provider>);
  return { calls, getRpcCalls: () => getRpcCalls };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 50));

describe('Sweep balance read and scan privacy', () => {
  it('behind a required local proxy, reads nothing from the Settings RPC until the user asks, then exactly the balance', async () => {
    store(PRIVATE);
    const m = mount();
    await settle();
    expect(m.calls).toEqual([]);
    expect(m.getRpcCalls()).toBe(0);
    expect(screen.getByText(/goes directly to the RPC in Settings, not through your private scan path/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Read balance from the Settings RPC' }));
    await waitFor(() => { expect(m.calls).toHaveLength(1); });
    expect(m.calls[0]).toEqual({ method: 'eth_getBalance', params: [STEALTH, 'latest'] });
    expect(await screen.findByText(/^1 /)).toBeTruthy();
    await settle();
    expect(m.calls).toHaveLength(1);
  });

  it('with the default configuration, still reads the balance automatically', async () => {
    const m = mount();
    await waitFor(() => { expect(m.calls).toEqual([{ method: 'eth_getBalance', params: [STEALTH, 'latest'] }]); });
    expect(screen.queryByRole('button', { name: 'Read balance from the Settings RPC' })).toBeNull();
  });

  it('with a local proxy that is not required, still reads the balance automatically', async () => {
    store({ ...PRIVATE, requireProxy: false });
    const m = mount();
    await waitFor(() => { expect(m.calls.map((c) => c.method)).toEqual(['eth_getBalance']); });
    expect(screen.queryByRole('button', { name: 'Read balance from the Settings RPC' })).toBeNull();
  });
});
