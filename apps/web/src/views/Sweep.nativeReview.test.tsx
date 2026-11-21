// @vitest-environment jsdom
import { deriveStealthPayment } from '@ghostpay/core-crypto';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { keccak256, parseTransaction } from 'viem/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from '../lib/keyVault';
import type { ScanMatch } from '../lib/scanClient';
import { clearSession, generateSession } from '../lib/session';
import { ServicesContext } from '../lib/services';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { AppContext, beginSweepAttempt, getSweepAttempt, resetSweepAttemptsForTests, type AppState } from '../state';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { mockRpc } from '../test/mockRpc';
import { makeServices } from '../test/render';
import { Sweep } from './Sweep';

const CHAIN = 11155111;
const BALANCE = 10n ** 17n;
const DESTINATION = '0x6666666666666666666666666666666666666666';
const OTHER = '0x7777777777777777777777777777777777777777';
const SIGN = 'Sign and broadcast directly';
const PREPARE = 'Review native sweep fees';
const TITLE = 'Review this native sweep';
const NOW = 1_800_000_000_000;

beforeEach(() => {
  clearSession(); window.localStorage.clear(); window.sessionStorage.clear();
  resetSweepAttemptsForTests(); setKeyVaultStoreForTests(new MemoryKeyVaultStore());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); setKeyVaultStoreForTests(undefined); });

function mount() {
  const session = generateSession();
  const payment = deriveStealthPayment(session.metaAddress);
  const hex = (bytes: Uint8Array): `0x${string}` => `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  const match = {
    chainId: CHAIN, stealthAddress: payment.stealthAddress, metadata: { kind: 'native' },
    announcement: { schemeId: 1n, stealthAddress: payment.stealthAddress,
      ephemeralPublicKey: hex(payment.ephemeralPublicKey), metadata: hex(payment.viewTag) },
  } as unknown as ScanMatch;
  const state = { gasPrice: 1_000_000_000n, balance: BALANCE, wall: NOW,
    gasGate: undefined as Promise<void> | undefined, gasReached: false,
    manifestGate: undefined as Promise<void> | undefined, manifestReached: false, requests: [] as string[],
    raw: undefined as `0x${string}` | undefined, actions: [] as string[] };
  const inner = mockRpc(CHAIN, async (method, params) => {
    switch (method) {
      case 'eth_getBalance': return `0x${state.balance.toString(16)}`;
      case 'eth_gasPrice': state.gasReached = true; await state.gasGate; return `0x${state.gasPrice.toString(16)}`;
      case 'eth_getTransactionCount': return '0x7';
      case 'eth_estimateGas': return '0x5208';
      case 'eth_call': return '0x';
      case 'eth_sendRawTransaction': state.raw = params[0] as `0x${string}`; return keccak256(state.raw);
      default: throw new Error(`Unexpected public RPC method: ${method}`);
    }
  });
  const backedRpc = withManifestChain(inner);
  const rpc = { ...backedRpc, async request(method: string, params: readonly unknown[]) {
    state.requests.push(method);
    if (state.manifestGate !== undefined && method === 'eth_call' && (params[0] as { to?: string }).to === backedManifest(CHAIN).router) {
      state.manifestReached = true;
      await state.manifestGate;
    }
    return backedRpc.request(method, params);
  } };
  let app: AppState = {
    view: 'sweep', setView: () => undefined, settings: { ...DEFAULT_SETTINGS, rpcUrls: { [CHAIN]: 'https://rpc.test/' } },
    updateSettings: () => true, session, fragment: undefined, setFragment: () => undefined,
    matches: [match], setMatches: () => undefined, sweepTarget: { chainId: CHAIN, match }, selectForSweep: () => undefined,
    getRpc: (_chain, options) => { state.actions.push(options?.action ?? 'missing'); return Promise.resolve(rpc); },
    getSecondaryRpc: () => Promise.resolve(undefined), announce: () => undefined,
  };
  const services = makeServices({ nowMs: () => state.wall, loadManifest: (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id) }) });
  const view = () => <ServicesContext.Provider value={services}><AppContext.Provider value={app}><Sweep /></AppContext.Provider></ServicesContext.Provider>;
  const rendered = render(view());
  return { state, inner, owner: payment.stealthAddress, app: () => app, unmount: rendered.unmount,
    update(patch: Partial<AppState>) { app = { ...app, ...patch }; rendered.rerender(view()); } };
}

async function ready(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Read balance from the Settings RPC' }));
  await screen.findByText('0.1 ETH');
  fireEvent.click(screen.getByLabelText(/^Directly/));
  fireEvent.change(screen.getByLabelText(/^Destination address/), { target: { value: DESTINATION } });
}
async function review(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: PREPARE }));
  return screen.findByRole('region', { name: TITLE });
}

describe('native sweep explicit fee review', () => {
  it('keeps native signing disabled until exact fees have been reviewed', async () => {
    const h = mount(); await ready();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: SIGN }).disabled).toBe(true);
    expect(h.state.actions).toEqual(['sweep-balance']); expect(h.state.raw).toBeUndefined();
  });

  it('shows exact destination, gas, reserve and net before a separate signing click', async () => {
    const h = mount(); await ready(); const panel = within(await review());
    expect(panel.getByText(DESTINATION)).toBeTruthy();
    expect(panel.getByText('21000')).toBeTruthy(); expect(panel.getByText('7')).toBeTruthy();
    expect(panel.getByText('2 gwei')).toBeTruthy(); expect(panel.getByText('0.1 gwei')).toBeTruthy();
    expect(panel.getAllByText('0.000042 ETH')).toHaveLength(2);
    expect(panel.getByText('0 ETH')).toBeTruthy();
    expect(panel.getByText('You receive: 0.099958 ETH')).toBeTruthy();
    expect(h.state.actions).toEqual(['sweep-balance', 'sweep-quote']); expect(h.state.raw).toBeUndefined();
    expect(getSweepAttempt(CHAIN, h.owner)).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: SIGN }));
    await waitFor(() => { expect(getSweepAttempt(CHAIN, h.owner)?.status).toBe('submitted'); });
    expect(parseTransaction(h.state.raw!).value).toBe(BALANCE - 42_000_000_000_000n);
    expect(h.state.actions).toEqual(['sweep-balance', 'sweep-quote', 'sweep-submit']);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: SIGN }).disabled).toBe(true);
  });

  it.each(['destination', 'destination restored', 'balance', 'RPC', 'session', 'network revision', 'mode', 'lock', 'cancel'] as const)(
    'discards fee authority when %s changes', async (change) => {
      const h = mount(); await ready(); await review(); const original = h.app();
      if (change === 'destination' || change === 'destination restored') fireEvent.change(screen.getByLabelText(/^Destination address/), { target: { value: OTHER } });
      if (change === 'destination restored') fireEvent.change(screen.getByLabelText(/^Destination address/), { target: { value: DESTINATION } });
      if (change === 'balance') fireEvent.click(screen.getByRole('button', { name: 'Read balance from the Settings RPC' }));
      if (change === 'RPC') h.update({ settings: { ...original.settings, rpcUrls: { [CHAIN]: 'https://another-rpc.test/' } } });
      if (change === 'session') h.update({ session: generateSession() });
      if (change === 'network revision') h.update({ networkRevision: (original.networkRevision ?? 0) + 1 });
      if (change === 'mode') {
        fireEvent.click(screen.getByLabelText(/^Through the relayer/)); fireEvent.click(screen.getByLabelText(/^Directly/));
      }
      if (change === 'lock') act(() => { notifyAppLock('idle'); });
      if (change === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'Cancel fee review' }));
      await waitFor(() => { expect(screen.queryByRole('region', { name: TITLE })).toBeNull(); });
      expect(screen.getByRole<HTMLButtonElement>('button', { name: SIGN }).disabled).toBe(true);
      expect(h.state.raw).toBeUndefined(); expect(getSweepAttempt(CHAIN, h.owner)).toBeUndefined();
    },
  );

  it('cannot publish a pending preparation after the destination changes', async () => {
    const h = mount(); await ready();
    let release!: () => void; h.state.gasGate = new Promise<void>((resolve) => { release = resolve; });
    fireEvent.click(screen.getByRole('button', { name: PREPARE }));
    await waitFor(() => { expect(h.state.gasReached).toBe(true); });
    fireEvent.change(screen.getByLabelText(/^Destination address/), { target: { value: OTHER } });
    await act(async () => { release(); await h.state.gasGate; });
    expect(screen.queryByRole('region', { name: TITLE })).toBeNull(); expect(h.state.raw).toBeUndefined();
    expect(h.inner.calls.map((call) => call.method)).not.toContain('eth_getTransactionCount');
  });

  it('requires another explicit review when fees change before confirmation', async () => {
    const h = mount(); await ready(); await review(); h.state.gasPrice += 1n;
    fireEvent.click(screen.getByRole('button', { name: SIGN }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/review.*expired or changed/i);
    expect(h.state.raw).toBeUndefined(); expect(getSweepAttempt(CHAIN, h.owner)).toBeUndefined();
    expect(screen.queryByRole('region', { name: TITLE })).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: SIGN }).disabled).toBe(true);
    await review(); expect(screen.getByRole<HTMLButtonElement>('button', { name: SIGN }).disabled).toBe(false);
  });

  it('rejects an expired review before creating another RPC or obtaining a signature', async () => {
    const h = mount(); await ready(); await review(); h.state.wall += 60_000;
    fireEvent.click(screen.getByRole('button', { name: SIGN }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/review.*expired or changed/i);
    expect(h.state.actions).toEqual(['sweep-balance', 'sweep-quote']); expect(h.state.raw).toBeUndefined();
  });

  it('stops remaining public manifest reads when the fee review expires during confirmation readback', async () => {
    const h = mount(); await ready(); await review();
    const before = h.state.requests.length;
    let release!: () => void;
    h.state.manifestGate = new Promise<void>((resolve) => { release = resolve; });
    fireEvent.click(screen.getByRole('button', { name: SIGN }));
    await waitFor(() => { expect(h.state.manifestReached).toBe(true); });
    h.state.wall += 60_000;
    await act(async () => { release(); await h.state.manifestGate; });
    expect((await screen.findByRole('alert')).textContent).toMatch(/review.*expired or changed/i);
    expect(h.state.requests.slice(before)).toEqual(['eth_call']);
    expect(h.state.raw).toBeUndefined(); expect(getSweepAttempt(CHAIN, h.owner)).toBeUndefined();
  });

  it('presents a separate fee review for the exact same-nonce replacement', async () => {
    const h = mount(); await ready();
    act(() => { beginSweepAttempt({ chainId: CHAIN, owner: h.owner, nonce: 7, expectedHash: `0x${'12'.repeat(32)}`, status: 'unknown-after-handoff' }); });
    fireEvent.click(screen.getByRole('button', { name: 'Review replacement fees' }));
    await screen.findByRole('region', { name: TITLE });
    expect(h.state.raw).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Sign a replacement with the same nonce' }));
    await waitFor(() => { expect(getSweepAttempt(CHAIN, h.owner)?.status).toBe('submitted'); });
    expect(parseTransaction(h.state.raw!).nonce).toBe(7);
    expect(getSweepAttempt(CHAIN, h.owner)?.otherHashes).toEqual([`0x${'12'.repeat(32)}`]);
  });
});
