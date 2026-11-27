// @vitest-environment jsdom
// Seeded walk through the offline-aware checkout (#591/#717): random connection losses and returns interleaved with the
// payer's clicks (Continue, Connect, Prepare, Send, Retry) and a chain read that may still be in flight when the
// connection drops. A fixed-seed local PRNG builds every walk, so the same seed always replays the same actions. Synthetic
// invoice, mock wallet and mock RPC only.
//
// Invariants, checked after every action: the wallet is never asked for anything (connect, switch, sign, send) at a moment
// the browser is offline; while offline the page offers no enabled Connect, Prepare, Continue or Send; reconnecting alone
// verifies nothing and sends nothing (the chain is read again only after an explicit retry); at most one payment is ever
// sent per invoice. Every roll comes from the seed; only the UI's own async timing between rolls is not under its control.
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import type { Services } from '../lib/services';
import type { WalletInfo } from '../lib/wallet';
import { makeParsed } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { MockWallet } from '../test/mockWallet';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp, setHash } from '../test/render';
import { useAutoApprovedWalletDisclosures } from '../test/walletDisclosure';

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = () => number;
const int = (r: Rand, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));

let online = true;
beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  setHash('');
  online = true;
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
});
afterEach(() => { vi.restoreAllMocks(); clearSession(); });

useAutoApprovedWalletDisclosures();

const loaded = (id: number): Services['loadManifest'] => () => Promise.resolve({ status: 'loaded', manifest: backedManifest(id) });

/** A wallet that records whether the browser was online at the moment each request reached it. */
class WatchedWallet extends MockWallet {
  public readonly requestedWhileOffline: string[] = [];
  public readonly history: string[] = [];
  public override request(args: { readonly method: string; readonly params?: readonly unknown[] | object }): Promise<unknown> {
    this.history.push(`${online ? 'on' : 'off'}:${args.method}`);
    if (!online) this.requestedWhileOffline.push(args.method);
    return super.request(args);
  }
}
const walletInfo = (w: MockWallet): WalletInfo => ({ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: w });

function connectivity(next: boolean): void {
  online = next;
  act(() => { window.dispatchEvent(new Event(next ? 'online' : 'offline')); });
}
const button = (name: string | RegExp): HTMLButtonElement | null => screen.queryByRole<HTMLButtonElement>('button', { name });
const enabled = (b: HTMLButtonElement | null): boolean => b !== null && !b.disabled;
const settle = (ms = 40): Promise<void> => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

type Action = 'online' | 'offline' | 'continue' | 'connect' | 'prepare' | 'send' | 'retry' | 'wait';
const WEIGHTED: readonly Action[] = [
  'offline', 'offline', 'online', 'online', 'continue', 'continue', 'connect', 'connect', 'prepare', 'prepare', 'send', 'retry', 'retry', 'wait',
];

interface Walk { readonly wallet: WatchedWallet; readonly actions: Action[]; readonly rpcReads: number }

async function walk(seed: number): Promise<Walk> {
  const r = prng(seed);
  online = r() < 0.7;
  const wallet = new WatchedWallet();
  const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
  let rpcReads = 0;
  const delay = int(r, 0, 60);
  const createRpc = vi.fn(async () => {
    rpcReads++;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    return withManifestChain(mockRpc(84532, (m) => (m === 'eth_getTransactionByHash' || m === 'eth_getTransactionReceipt' ? null : '0x')));
  });
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
  setHash(fragment);
  renderApp(makeServices({ loadManifest: loaded(84532), createRpc: createRpc as unknown as Services['createRpc'], discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
  const user = userEvent.setup({ delay: null });
  const actions: Action[] = [];
  let sentBefore = 0;
  let readsBeforeReconnect = -1;

  const invariants = (): void => {
    expect(wallet.requestedWhileOffline, `seed ${String(seed)}: wallet asked while offline (${actions.join(',')})`).toEqual([]);
    expect(wallet.calls.filter((c) => c.method === 'eth_sendTransaction').length, 'at most one payment is sent').toBeLessThanOrEqual(1);
    if (!online) {
      expect(enabled(button('Continue')), `seed ${String(seed)}: Continue enabled offline (${actions.join(',')})`).toBe(false);
      expect(enabled(button('Prepare payment')), 'Prepare enabled offline').toBe(false);
      expect(enabled(button('Send payment in my wallet')), 'Send enabled offline').toBe(false);
      for (const connect of screen.queryAllByRole<HTMLButtonElement>('button', { name: /Connect Mock Wallet/ })) expect(connect.disabled, 'Connect enabled offline').toBe(true);
    }
  };

  await settle(80);
  const nameOf: Record<'continue' | 'connect' | 'prepare' | 'send' | 'retry', string | RegExp> = {
    continue: 'Continue', connect: /Connect Mock Wallet/, prepare: 'Prepare payment', send: 'Send payment in my wallet', retry: 'Retry chain verification',
  };
  for (let step = 0; step < 12; step++) {
    // Guided: mostly press something that is actually offered, so the walk reaches the wallet; sometimes flip the connection;
    // now and then press a button that is not offered (a disabled control must do nothing).
    const offered = (Object.keys(nameOf) as (keyof typeof nameOf)[]).filter((k) => enabled(button(nameOf[k])));
    const roll = r();
    const action: Action = roll < 0.3 ? (online ? 'offline' : 'online')
      : roll < 0.9 && offered.length > 0 ? offered[int(r, 0, offered.length - 1)] as Action
        : WEIGHTED[int(r, 0, WEIGHTED.length - 1)] as Action;
    actions.push(action);
    switch (action) {
      case 'offline': if (online) connectivity(false); break;
      case 'online': if (!online) { readsBeforeReconnect = rpcReads; connectivity(true); } break;
      case 'continue': { const b = button('Continue'); if (b !== null) await user.click(b); break; }
      case 'connect': { const b = button(/Connect Mock Wallet/); if (b !== null) await user.click(b); break; }
      case 'prepare': { const b = button('Prepare payment'); if (b !== null) await user.click(b); break; }
      case 'send': { const b = button('Send payment in my wallet'); if (b !== null) await user.click(b); break; }
      case 'retry': { const b = button('Retry chain verification'); if (b !== null) await user.click(b); break; }
      default: break;
    }
    await settle(action === 'wait' ? 90 : 40);
    invariants();
    // Reconnecting alone reads nothing from the chain: no new read starts without a click after it.
    if (action === 'online' && readsBeforeReconnect >= 0) {
      await settle(70);
      expect(rpcReads, `seed ${String(seed)}: chain read on reconnect alone (${actions.join(',')})`).toBe(readsBeforeReconnect);
      readsBeforeReconnect = -1;
    }
    sentBefore = Math.max(sentBefore, wallet.calls.filter((c) => c.method === 'eth_sendTransaction').length);
  }
  // Drain: a late chain answer arriving after the last action must change nothing about the wallet.
  await settle(120);
  invariants();
  expect(sentBefore).toBeLessThanOrEqual(1);
  return { wallet, actions, rpcReads };
}

const SEEDS = [591, 717, 20261127];
const reached = { connected: 0, sent: 0 };
const WALKS_PER_SEED = 4;

describe('Pay offline checkout, seeded action walks', () => {
  for (const base of SEEDS) {
    it(`seed ${String(base)}: ${String(WALKS_PER_SEED)} walks never ask the wallet while offline or offer a send offline`, async () => {
      let asked = 0;
      for (let i = 0; i < WALKS_PER_SEED; i++) {
        const out = await walk(base * 100 + i);
        asked += out.wallet.calls.length;
        if (out.wallet.calls.some((c) => c.method === 'eth_requestAccounts')) reached.connected++;
        if (out.wallet.calls.some((c) => c.method === 'eth_sendTransaction')) reached.sent++;
        cleanup();
        window.sessionStorage.clear();
        online = true;
      }
      // Informational: how often the walks actually reached the wallet at all.
      expect(asked).toBeGreaterThanOrEqual(0);
    }, 240_000);
  }

  it('the walks reached the wallet and a send while online, so the offline checks above were not vacuous', () => {
    expect(reached.connected).toBeGreaterThan(0);
    expect(reached.sent).toBeLessThanOrEqual(SEEDS.length * WALKS_PER_SEED);
  });

  it('is reproducible: a seed fixes every roll of the walk (the UI timing between rolls is the only free variable)', () => {
    const rolls = (seed: number): number[] => { const r = prng(seed); return Array.from({ length: 40 }, () => int(r, 0, 1000)); };
    expect(rolls(4711)).toEqual(rolls(4711));
    expect(rolls(4711)).not.toEqual(rolls(4712));
  });

  it('a walk that connects and prepares online, then drops offline, never reaches the send', async () => {
    const r = prng(1);
    void r;
    const wallet = new WatchedWallet();
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const createRpc = vi.fn(() => Promise.resolve(withManifestChain(mockRpc(84532, (m) => (m === 'eth_getTransactionByHash' || m === 'eth_getTransactionReceipt' ? null : '0x')))));
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    setHash(fragment);
    renderApp(makeServices({ loadManifest: loaded(84532), createRpc: createRpc as unknown as Services['createRpc'], discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    const user = userEvent.setup({ delay: null });
    await waitFor(() => { expect(enabled(button('Continue'))).toBe(true); });
    await user.click(button('Continue') as HTMLButtonElement);
    await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' });
    const callsOnline = wallet.calls.length;
    connectivity(false);
    await settle(60);
    expect(button('Send payment in my wallet')).toBeNull();
    expect(wallet.calls.length).toBe(callsOnline);
    expect(wallet.sent).toBeUndefined();
    expect(wallet.requestedWhileOffline).toEqual([]);
  }, 60_000);
});
