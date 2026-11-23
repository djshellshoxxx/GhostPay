// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ATTEMPT_JOURNAL_KEY,
  ATTEMPT_JOURNAL_LOCK,
  attemptTxDigest,
  migrateBrowserAttempts,
  readAttempts,
  type AttemptLockManager,
  type AttemptStorage,
} from './duplicateAttemptJournal';
import { MockWallet } from '../test/mockWallet';
import { createTestLocks, installTestLocks, removeTestLocks, type TestLockManager } from '../test/locks';
import { connectWallet, sendViaWallet, WalletBroadcastError, type TxRequest, type WalletInfo, type WalletSession } from './wallet';
import { sendPolicyAction } from '../features/policy/withdrawalJournal';

const tx: TxRequest = { to: `0x${'1'.repeat(40)}`, data: '0xABCD', value: 5n };
const info = (provider: WalletInfo['provider']): WalletInfo => ({ id: 'mock', name: 'Mock', kind: 'injected', provider });
const invoice = (n: string) => ({ kind: 'payment' as const, scope: `0x${n.repeat(64)}` });
const hashOf = (n: number): `0x${string}` => `0x${n.toString(16).padStart(64, '0')}`;

/** A wallet whose eth_sendTransaction answers are released by the test, one distinct hash each. */
function heldWallet(): { provider: WalletInfo['provider']; sends: () => number; release: (i: number) => void; onSend: (f: () => void) => void } {
  const base = new MockWallet();
  const pending: ((hash: string) => void)[] = [];
  let hook = (): void => undefined;
  return {
    provider: { request: (args) => {
      if (args.method !== 'eth_sendTransaction') return base.request(args);
      hook();
      return new Promise((resolve) => { pending.push(resolve); });
    } },
    sends: () => pending.length,
    release: (i) => { pending[i]?.(hashOf(i + 1)); },
    onSend: (f) => { hook = f; },
  };
}

/** Two tabs of one profile: separate facades over one backing Map; a write outside the shared lock is counted. */
function profile(locks: TestLockManager): { tab: () => AttemptStorage; outside: () => number } {
  const backing = new Map<string, string>();
  let outside = 0;
  return {
    tab: () => ({ getItem: (k) => backing.get(k) ?? null, setItem: (k, v) => { if (!locks.isHeld(ATTEMPT_JOURNAL_LOCK)) outside += 1; backing.set(k, v); } }),
    outside: () => outside,
  };
}

async function session(provider: WalletInfo['provider']): Promise<WalletSession> {
  return connectWallet(info(provider), 84532);
}

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); installTestLocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('sendViaWallet on the durable cross-tab journal', () => {
  it('lets exactly one of two tabs reach the wallet for the same invoice', async () => {
    const locks = createTestLocks();
    const shared = profile(locks);
    const wallet = heldWallet();
    let heldAtProvider = false;
    wallet.onSend(() => { heldAtProvider = locks.isHeld(ATTEMPT_JOURNAL_LOCK); });
    const s = await session(wallet.provider);
    const tabA = sendViaWallet(s, tx, undefined, { ...invoice('a'), storage: shared.tab(), lockManager: locks });
    const tabB = sendViaWallet(s, { ...tx, data: '0x1234' }, undefined, { ...invoice('a'), storage: shared.tab(), lockManager: locks });
    await expect(tabB).rejects.toThrow(/previous wallet attempt/);
    expect(wallet.sends()).toBe(1);
    expect(heldAtProvider).toBe(true);
    wallet.release(0);
    await expect(tabA).resolves.toBe(hashOf(1));
    expect(wallet.sends()).toBe(1);
    expect(shared.outside()).toBe(0);
  });

  it('releases the lock while a wallet prompt is open, then records each hash without a lost update', async () => {
    const locks = createTestLocks();
    const shared = profile(locks);
    const wallet = heldWallet();
    const s = await session(wallet.provider);
    const storeA = shared.tab();
    const a = sendViaWallet(s, tx, undefined, { ...invoice('a'), storage: storeA, lockManager: locks });
    await vi.waitFor(() => { expect(wallet.sends()).toBe(1); });
    expect(locks.isHeld(ATTEMPT_JOURNAL_LOCK)).toBe(false);
    const b = sendViaWallet(s, tx, undefined, { ...invoice('b'), storage: shared.tab(), lockManager: locks });
    await vi.waitFor(() => { expect(wallet.sends()).toBe(2); });
    wallet.release(1);
    await expect(b).resolves.toBe(hashOf(2));
    wallet.release(0);
    await expect(a).resolves.toBe(hashOf(1));
    expect(readAttempts(storeA).map((r) => [r.status, r.hash]).sort()).toEqual([['submitted', hashOf(1)], ['submitted', hashOf(2)]]);
    expect(shared.outside()).toBe(0);
  });

  it('refuses a duplicate when the localStorage view is stale', async () => {
    const first = new MockWallet();
    const firstSession = await session(first);
    await sendViaWallet(firstSession, tx, undefined, invoice('a'));
    const firstRecord = readAttempts()[0];
    expect(firstRecord).toMatchObject({ status: 'submitted' });

    // Simulate a second renderer reading its older cached localStorage snapshot.
    window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, '[]');
    const second = new MockWallet();
    const secondSession = await session(second);
    await expect(sendViaWallet(secondSession, tx, undefined, invoice('a'))).rejects.toThrow(/previous wallet attempt/);
    expect(second.sent).toBeUndefined();
    await migrateBrowserAttempts();
    expect(readAttempts()).toEqual([firstRecord]);
  });

  it('invokes the provider in the same synchronous step as the journal write (no microtask gap)', async () => {
    const order: string[] = [];
    const base = new MockWallet();
    const s = await session({ request: (args) => { if (args.method === 'eth_sendTransaction') order.push('provider'); return base.request(args); } });
    const original = Storage.prototype.setItem.bind(window.localStorage);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k: string, v: string) => {
      if (k === ATTEMPT_JOURNAL_KEY && order.length === 0) {
        order.push('begin');
        queueMicrotask(() => { order.push('microtask'); });
      }
      original(k, v);
    });
    await sendViaWallet(s, tx, undefined, invoice('a'));
    expect(order.slice(0, 3)).toEqual(['begin', 'provider', 'microtask']);
  });

  it('stores the call digest, never the calldata or amount, at begin', async () => {
    const base = new MockWallet();
    let atSend: string | null = null;
    const s = await session({ request: (args) => { if (args.method === 'eth_sendTransaction') atSend = window.localStorage.getItem(ATTEMPT_JOURNAL_KEY); return base.request(args); } });
    await sendViaWallet(s, tx, undefined, invoice('a'));
    const digest = attemptTxDigest(84532, s.account, tx.to, tx.data, tx.value);
    expect(JSON.parse(atSend ?? '[]')).toMatchObject([{ status: 'unknown', txDigest: digest }]);
    expect(readAttempts()[0]).toMatchObject({ status: 'submitted', txDigest: digest });
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).not.toMatch(/abcd/i);
  });

  it('refuses before any wallet request when browser locks are unavailable', async () => {
    const base = new MockWallet();
    const s = await session(base);
    removeTestLocks();
    await expect(sendViaWallet(s, tx, undefined, invoice('a'))).rejects.toMatchObject({ name: 'UserFacingError', message: expect.stringMatching(/lock/i) as unknown });
    expect(base.sent).toBeUndefined();
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBeNull();
  });

  it('refuses when an injected lock manager resolves without running the journal step', async () => {
    const base = new MockWallet();
    const s = await session(base);
    const skipping: AttemptLockManager = { request: () => Promise.resolve(undefined as never) };
    await expect(sendViaWallet(s, tx, undefined, { ...invoice('a'), lockManager: skipping })).rejects.toThrow(/journal/i);
    expect(base.sent).toBeUndefined();
  });

  it('keeps the hash when the lock request fails after the wallet was invoked', async () => {
    const base = new MockWallet();
    const s = await session(base);
    const locks = createTestLocks();
    let calls = 0;
    const flaky: AttemptLockManager = { request: (name, cb) => { calls += 1; return calls === 1 ? locks.request(name, cb).then(() => { throw new Error('lock lost'); }) : locks.request(name, cb); } };
    await expect(sendViaWallet(s, tx, undefined, { ...invoice('a'), lockManager: flaky })).resolves.toBe(`0x${'9'.repeat(64)}`);
    expect(base.calls.filter((c) => c.method === 'eth_sendTransaction')).toHaveLength(1);
    expect(readAttempts()).toMatchObject([{ status: 'submitted', hash: `0x${'9'.repeat(64)}` }]);
  });

  it.each(['storage', 'locks'] as const)('raises WalletBroadcastError with the hash when %s fail after broadcast', async (failure) => {
    let sent = false;
    const base = new MockWallet();
    const s = await session({ request: (args) => { if (args.method === 'eth_sendTransaction') sent = true; return base.request(args); } });
    if (failure === 'storage') {
      const original = Storage.prototype.setItem.bind(window.localStorage);
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k: string, v: string) => {
        if (sent) throw new Error('quota');
        original(k, v);
      });
    }
    const locks = createTestLocks();
    const lockManager: AttemptLockManager = { request: (name, cb) => sent && failure === 'locks' ? Promise.reject(new Error('lock lost')) : locks.request(name, cb) };
    const error = await sendViaWallet(s, tx, undefined, { ...invoice('a'), lockManager }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletBroadcastError);
    expect(error).toMatchObject({ hash: `0x${'9'.repeat(64)}` });
    expect(readAttempts()).toMatchObject([{ status: 'unknown' }]);
  });

  it('migrates this tab\'s legacy sessionStorage record first, so it still blocks the same invoice', async () => {
    const first = new MockWallet();
    const s = await session(first);
    const options = invoice('a');
    await sendViaWallet(s, tx, undefined, options);
    // Simulate a record written by the previous, tab-scoped release.
    window.sessionStorage.setItem(ATTEMPT_JOURNAL_KEY, window.localStorage.getItem(ATTEMPT_JOURNAL_KEY) ?? '');
    window.localStorage.clear();
    await expect(sendViaWallet(s, { ...tx, data: '0x1234' }, undefined, options)).rejects.toThrow(/previous wallet attempt/);
    expect(first.calls.filter((c) => c.method === 'eth_sendTransaction')).toHaveLength(1);
    expect(window.sessionStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBeNull();
    expect(readAttempts(window.localStorage)).toHaveLength(1);
  });

  it('does not deadlock a policy action that already holds the non-reentrant journal lock', async () => {
    const locks = installTestLocks();
    const base = new MockWallet({ chainId: 11155111 });
    const s = await connectWallet(info(base), 11155111);
    const result = sendPolicyAction({ wallet: s, prepare: () => Promise.resolve(tx), scope: 'seller:deployment:account:token:request', assertCurrent: () => undefined, lockManager: locks });
    await expect(Promise.race([result, new Promise((_, reject) => setTimeout(() => { reject(new Error('deadlock')); }, 2000))])).resolves.toBe(`0x${'9'.repeat(64)}`);
    expect(readAttempts(window.localStorage)).toMatchObject([{ kind: 'transaction', status: 'submitted' }]);
    expect(locks.isHeld(ATTEMPT_JOURNAL_LOCK)).toBe(false);
  });
});
