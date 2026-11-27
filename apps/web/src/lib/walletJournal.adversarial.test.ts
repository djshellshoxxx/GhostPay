// @vitest-environment jsdom
/**
 * Adversarial QA for the durable cross-tab wallet journal (REC-P1-03): seeded multi-tab scheduling, storage, lock and
 * provider fault injection, legacy migration and wallet-authority changes, on both journal paths: an explicit store
 * (policy, tests: the operation runs synchronously in the lock) and the default browser journal (authoritative IndexedDB
 * snapshot, localStorage only a mirror). Fully deterministic: scheduling comes from a seeded LCG over awaited microtasks
 * (Math.random is banned), and nothing waits on wall-clock time except bounded races.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ATTEMPT_JOURNAL_KEY,
  ATTEMPT_JOURNAL_LOCK,
  clearAttemptLocked,
  LOCK_WAIT_MS,

  readAttempts,
  readReturnedAttempts,
  retryReturnedAttempts,
  withAttemptJournal,
  type AttemptLockManager,
  type AttemptStorage,
  type LegacyAttemptStorage,
  type WalletAttempt,
} from './duplicateAttemptJournal';
import { updateJournalSnapshot } from './attemptJournalStorage';
import { memoryIndexedDb } from '../test/memoryIndexedDb';
import { MockWallet } from '../test/mockWallet';
import { createTestLocks, installTestLocks, type TestLockManager } from '../test/locks';
import {
  connectWallet,
  paymentAttemptKey,
  sendViaWallet,
  WalletBroadcastError,
  WalletRequestRejectedError,
  WalletSubmissionUnknownError,
  type Eip1193Provider,
  type TxRequest,
  type WalletAttemptOptions,
  type WalletInfo,
  type WalletSession,
} from './wallet';

const CHAIN = 84532;
const TABS = 20;
const hex = (n: number, width: number): string => n.toString(16).padStart(width, '0');
const hashOf = (n: number): `0x${string}` => `0x${hex(n, 64)}`;
const scopeOf = (n: number): string => `0x${hex(0x5c09e + n, 64)}`;
const keyOf = (invoice: number): string => paymentAttemptKey(CHAIN, scopeOf(invoice));
const accountOf = (i: number): string => `0x${hex(0x1000 + i, 40)}`;
const txOf = (n: number): TxRequest => ({ to: `0x${'1'.repeat(40)}`, data: `0x${hex(n, 8)}`, value: 1n });
const pay = (invoice: number): WalletAttemptOptions => ({ kind: 'payment', scope: scopeOf(invoice) });
const info = (provider: Eip1193Provider): WalletInfo => ({ id: 'mock', name: 'Mock', kind: 'injected', provider });
const record = (i: number, over: Partial<WalletAttempt> = {}): WalletAttempt => ({
  id: `00000000-0000-4000-8000-${hex(i, 12)}`, key: hashOf(0xf00000 + i), chainId: CHAIN, account: accountOf(0), kind: 'payment',
  createdAt: 1_700_000_000_000 + i, status: 'unknown', ...over,
});
const JOURNAL_ERROR = /wallet attempt journal is unavailable or invalid/;
const DUPLICATE_ERROR = /previous wallet attempt/i;

/** Seeded linear congruential generator (Numerical Recipes constants): deterministic "randomness" for scheduling. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 8;
  };
}
async function ticks(n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) await Promise.resolve();
}
const macrotask = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

interface ChaosLocks extends AttemptLockManager {
  active(): number;
  maxActive(): number;
  grants(): number;
}
/**
 * Exclusive lock whose grant order is an arbitrary (seeded) choice among the waiters and whose grants are delayed by a
 * seeded number of microtasks: models requests from several processes arriving in any order. Release waits for the
 * callback's promise, as navigator.locks does.
 */
function chaosLocks(next: () => number): ChaosLocks {
  const waiters: (() => void)[] = [];
  let busy = false;
  let active = 0;
  let max = 0;
  let grants = 0;
  const pump = async (): Promise<void> => {
    if (busy || waiters.length === 0) return;
    busy = true;
    await ticks(next() % 5);
    const [grant] = waiters.splice(next() % waiters.length, 1);
    grant?.();
  };
  return {
    request: <T>(_name: string, callback: () => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
      waiters.push(() => {
        grants += 1;
        active += 1;
        max = Math.max(max, active);
        let result: Promise<T>;
        try { result = Promise.resolve(callback()); } catch (e) { result = Promise.reject(e instanceof Error ? e : new Error('callback')); }
        void result.then(resolve, reject).finally(() => {
          active -= 1;
          busy = false;
          void pump();
        });
      });
      void pump();
    }),
    active: () => active,
    maxActive: () => max,
    grants: () => grants,
  };
}

/** One profile's localStorage seen by many tabs: one backing Map, a facade per tab; writes outside the lock counted. */
function profile(isHeld: () => boolean): { backing: Map<string, string>; tab: () => AttemptStorage; raw: () => string | null; outside: () => number } {
  const backing = new Map<string, string>();
  let outside = 0;
  return {
    backing,
    tab: () => ({ getItem: (k) => backing.get(k) ?? null, setItem: (k, v) => { if (!isHeld()) outside += 1; backing.set(k, v); } }),
    raw: () => backing.get(ATTEMPT_JOURNAL_KEY) ?? null,
    outside: () => outside,
  };
}

interface SendEntry { readonly data: string; readonly from: string; readonly held: boolean }
interface TabWallet extends Eip1193Provider { emit(event: string): void }
/**
 * A MockWallet per tab with seeded latency on every answer. `send` decides the eth_sendTransaction answer; the entry
 * point records the send synchronously (so `held` shows whether the journal lock was held at invocation).
 */
function tabWallet(o: {
  readonly account: string;
  readonly log: SendEntry[];
  readonly next?: () => number;
  readonly isHeld?: () => boolean;
  readonly send?: (n: number) => unknown;
}): TabWallet {
  const base = new MockWallet({ account: o.account });
  const listeners = new Map<string, Set<() => void>>();
  const delay = async (): Promise<void> => { await ticks(o.next === undefined ? 0 : o.next() % 4); };
  return {
    request: (args) => {
      if (args.method === 'eth_sendTransaction') {
        const p = (args.params as readonly [{ readonly data: string; readonly from: string }])[0];
        o.log.push({ data: p.data, from: p.from, held: o.isHeld?.() ?? false });
        const n = o.log.length;
        if (o.send !== undefined) return o.send(n) as Promise<unknown>;
        return delay().then(() => hashOf(n));
      }
      return delay().then(() => base.request(args));
    },
    on: (event, listener) => { const set = listeners.get(event) ?? new Set(); set.add(listener); listeners.set(event, set); },
    removeListener: (event, listener) => { listeners.get(event)?.delete(listener); },
    emit: (event) => { for (const l of listeners.get(event) ?? []) l(); },
  };
}

/** A wallet whose eth_sendTransaction answers the test releases explicitly (one pending resolver per send). */
function heldSends(): { send: (n: number) => Promise<unknown>; release: (n: number, value?: unknown) => void } {
  const pending = new Map<number, (v: unknown) => void>();
  return {
    send: (n) => new Promise((resolve) => { pending.set(n, resolve); }),
    release: (n, value = hashOf(0x100 + n)) => { pending.get(n)?.(value); },
  };
}

async function sessionFor(provider: Eip1193Provider): Promise<WalletSession> {
  return connectWallet(info(provider), CHAIN);
}
const sends = (log: readonly SendEntry[]): number => log.length;

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); installTestLocks(); });
afterEach(() => { vi.restoreAllMocks(); installTestLocks(); });

describe('20 concurrent tabs under seeded cross-process scheduling', () => {
  it.each([
    [1, 1], [7, 1], [99, 1], [42, 3], [2026, 7], [1337, TABS], [31337, TABS],
  ])('seed %i, %i distinct invoices: exactly one wallet request per invoice, no record lost', async (seed, invoices) => {
    const next = lcg(seed);
    const locks = chaosLocks(next);
    const held = (): boolean => locks.active() > 0;
    const shared = profile(held);
    const log: SendEntry[] = [];
    const sessions: WalletSession[] = [];
    for (let i = 0; i < TABS; i += 1) sessions.push(await sessionFor(tabWallet({ account: accountOf(i), log, next, isHeld: held })));
    const runs: Promise<string>[] = [];
    for (const [i, s] of sessions.entries()) {
      runs.push(sendViaWallet(s, txOf(i), undefined, { ...pay(i % invoices), storage: shared.tab(), lockManager: locks }));
      await ticks(next() % 3);
    }
    const settled = await Promise.allSettled(runs);
    const hashes = settled.flatMap((r) => r.status === 'fulfilled' ? [r.value] : []);
    const refused = settled.flatMap((r) => r.status === 'rejected' ? [r.reason as unknown] : []);
    expect(hashes).toHaveLength(invoices);
    expect(refused).toHaveLength(TABS - invoices);
    for (const e of refused) expect(e).toMatchObject({ name: 'UserFacingError', message: expect.stringMatching(DUPLICATE_ERROR) as unknown });
    // One provider request per invoice, each started while the journal lock was held.
    expect(sends(log)).toBe(invoices);
    expect(new Set(log.map((e) => Number.parseInt(e.data.slice(2), 16) % invoices)).size).toBe(invoices);
    expect(log.every((e) => e.held)).toBe(true);
    // The final journal holds every record, submitted with the hash its tab returned, as valid JSON.
    const raw = shared.raw() ?? '';
    expect(() => JSON.parse(raw) as unknown).not.toThrow();
    const records = readAttempts(shared.tab());
    expect(records).toHaveLength(invoices);
    expect(records.every((r) => r.status === 'submitted')).toBe(true);
    expect(records.map((r) => r.hash).sort()).toEqual([...hashes].sort());
    expect(records.map((r) => r.key).sort()).toEqual(Array.from({ length: invoices }, (_, i) => keyOf(i)).sort());
    expect(locks.maxActive()).toBe(1);
    expect(locks.active()).toBe(0);
    expect(shared.outside()).toBe(0);
  });
});

describe('interleaved begin, finish and clear across tabs', () => {
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  it.each(orders.map((o) => [o.join(','), o] as const))('keeps a late hash that returns after another tab cleared its record (release order %s)', async (_label, order) => {
    const locks = createTestLocks();
    const shared = profile(() => locks.isHeld(ATTEMPT_JOURNAL_LOCK));
    const log: SendEntry[] = [];
    const wallet = heldSends();
    const tab = async (i: number): Promise<WalletSession> => sessionFor(tabWallet({ account: accountOf(i), log, send: wallet.send }));
    const [a, c, d, e] = [await tab(0), await tab(2), await tab(3), await tab(4)];
    const opts = (invoice: number): WalletAttemptOptions => ({ ...pay(invoice), storage: shared.tab(), lockManager: locks });
    const sendA = sendViaWallet(a, txOf(1), undefined, opts(1));
    await vi.waitFor(() => { expect(sends(log)).toBe(1); });
    // Tab B confirms a clear of invoice 1 while tab A's wallet prompt is still open.
    await clearAttemptLocked(keyOf(1), true, { storage: shared.tab(), lockManager: locks });
    expect(readAttempts(shared.tab())).toEqual([]);
    const sendC = sendViaWallet(c, txOf(2), undefined, opts(1));
    await vi.waitFor(() => { expect(sends(log)).toBe(2); });
    const sendD = sendViaWallet(d, txOf(3), undefined, opts(2));
    await vi.waitFor(() => { expect(sends(log)).toBe(3); });
    await expect(sendViaWallet(e, txOf(4), undefined, opts(1))).rejects.toThrow(DUPLICATE_ERROR);
    const pending = [sendA, sendC, sendD];
    for (const i of order) {
      wallet.release(i + 1);
      await expect(pending[i]).resolves.toBe(hashOf(0x101 + i));
    }
    const records = readAttempts(shared.tab());
    expect(records.map((r) => [r.key, r.status, r.hash]).sort()).toEqual([
      [keyOf(1), 'submitted', hashOf(0x101)], [keyOf(1), 'submitted', hashOf(0x102)], [keyOf(2), 'submitted', hashOf(0x103)],
    ].sort());
    expect(sends(log)).toBe(3);
    expect(shared.outside()).toBe(0);
  });

  it('surfaces a late hash in WalletBroadcastError when re-adding its cleared record would exceed the record limit', async () => {
    const locks = createTestLocks();
    const shared = profile(() => locks.isHeld(ATTEMPT_JOURNAL_LOCK));
    const fillers = Array.from({ length: 127 }, (_, i) => record(i + 1));
    shared.backing.set(ATTEMPT_JOURNAL_KEY, JSON.stringify(fillers));
    const log: SendEntry[] = [];
    const wallet = heldSends();
    const a = await sessionFor(tabWallet({ account: accountOf(0), log, send: wallet.send }));
    const c = await sessionFor(tabWallet({ account: accountOf(1), log, send: wallet.send }));
    const opts: WalletAttemptOptions = { ...pay(1), storage: shared.tab(), lockManager: locks };
    const sendA = sendViaWallet(a, txOf(1), undefined, opts);
    await vi.waitFor(() => { expect(sends(log)).toBe(1); });
    await clearAttemptLocked(keyOf(1), true, { storage: shared.tab(), lockManager: locks });
    const sendC = sendViaWallet(c, txOf(2), undefined, opts);
    await vi.waitFor(() => { expect(sends(log)).toBe(2); });
    wallet.release(1);
    const error = await sendA.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletBroadcastError);
    expect(error).toMatchObject({ hash: hashOf(0x101) });
    // No existing record was evicted to make room.
    expect(readAttempts(shared.tab())).toHaveLength(128);
    wallet.release(2);
    await expect(sendC).resolves.toBe(hashOf(0x102));
    expect(readAttempts(shared.tab()).filter((r) => r.key === keyOf(1))).toMatchObject([{ status: 'submitted', hash: hashOf(0x102) }]);
  });
});

type Fault = 'set-throws' | 'set-dropped' | 'readback-throws' | 'readback-stale' | 'readback-other';
/** A journal store that misbehaves only in one phase: before the wallet was invoked (`begin`) or after (`finish`). */
function faultyStore(fault: Fault, active: () => boolean): { store: AttemptStorage; backing: Map<string, string> } {
  const backing = new Map<string, string>();
  let wrote = false;
  let before: string | null = null;
  return {
    backing,
    store: {
      getItem: (k) => {
        if (active() && wrote) {
          wrote = false;
          if (fault === 'readback-throws') throw new DOMException('denied', 'SecurityError');
          if (fault === 'readback-stale') return before;
          if (fault === 'readback-other') return '[]';
        }
        return backing.get(k) ?? null;
      },
      setItem: (k, v) => {
        if (active()) {
          if (fault === 'set-throws') throw new DOMException('quota', 'QuotaExceededError');
          before = backing.get(k) ?? null;
          wrote = true;
          if (fault === 'set-dropped') return;
        }
        backing.set(k, v);
      },
    },
  };
}

describe('storage fault injection', () => {
  const faults: readonly Fault[] = ['set-throws', 'set-dropped', 'readback-throws', 'readback-stale', 'readback-other'];

  it.each(faults)('%s at begin: no wallet request, typed journal error, lock released', async (fault) => {
    const locks = createTestLocks();
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    const { store } = faultyStore(fault, () => sends(log) === 0);
    await expect(sendViaWallet(s, txOf(1), undefined, { ...pay(1), storage: store, lockManager: locks })).rejects.toThrow(JOURNAL_ERROR);
    expect(sends(log)).toBe(0);
    expect(locks.isHeld(ATTEMPT_JOURNAL_LOCK)).toBe(false);
  });

  it.each(faults)('%s at finish: WalletBroadcastError carries the normalized hash', async (fault) => {
    const locks = createTestLocks();
    const log: SendEntry[] = [];
    const upper = `0x${'AB'.repeat(32)}`;
    const s = await sessionFor(tabWallet({ account: accountOf(0), log, send: () => Promise.resolve(upper) }));
    const { store, backing } = faultyStore(fault, () => sends(log) > 0);
    const error = await sendViaWallet(s, txOf(1), undefined, { ...pay(1), storage: store, lockManager: locks }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletBroadcastError);
    expect(error).toMatchObject({ hash: upper.toLowerCase() });
    expect(sends(log)).toBe(1);
    // The pre-send record is never removed by a failed completion.
    expect(readAttempts({ getItem: (k) => backing.get(k) ?? null, setItem: () => undefined })).toHaveLength(1);
  });

  const valid = record(1);
  const validText = JSON.stringify(valid).slice(1, -1);
  const corrupt: readonly (readonly [string, string])[] = [
    ['truncated JSON', JSON.stringify([valid]).slice(0, 40)],
    ['empty string', ''],
    ['oversized text', `[${' '.repeat(100_001)}]`],
    ['oversized in UTF-8 bytes only', `["${'€'.repeat(40_000)}"]`],
    ['top-level __proto__ object', '{"__proto__":{"polluted":true}}'],
    ['record with a __proto__ key', `[{${validText},"__proto__":{"polluted":true}}]`],
    ['record with a constructor key', `[{${validText},"constructor":{"prototype":{"polluted":true}}}]`],
    ['duplicate ids', JSON.stringify([valid, { ...valid, key: hashOf(7) }])],
    ['duplicate JSON fields', `[{${validText},"status":"unknown"}]`],
    ['sparse array syntax', `[,${JSON.stringify(valid)}]`],
    ['trailing comma', `[${JSON.stringify(valid)},]`],
    ['null element', '[null]'],
    ['number element', '[1]'],
    ['nested array element', '[[]]'],
    ['deep nesting', `${'['.repeat(12)}${']'.repeat(12)}`],
    ['JSON string of an array', JSON.stringify('[]')],
    ['plain object', '{}'],
    ['JSON null', 'null'],
    ['trailing garbage', '[]x'],
    ['byte order mark', '﻿[]'],
    ['chainId as string', JSON.stringify([{ ...valid, chainId: String(CHAIN) }])],
    ['chainId zero', JSON.stringify([{ ...valid, chainId: 0 }])],
    ['fractional createdAt', JSON.stringify([valid]).replace(/"createdAt":\d+/, '"createdAt":1.5')],
    ['negative createdAt', JSON.stringify([valid]).replace(/"createdAt":\d+/, '"createdAt":-1')],
    ['exponent createdAt', JSON.stringify([valid]).replace(/"createdAt":\d+/, '"createdAt":1e12')],
    ['submitted without hash', JSON.stringify([{ ...valid, status: 'submitted' }])],
    ['unknown with hash', JSON.stringify([{ ...valid, hash: hashOf(1) }])],
    ['uppercase hash', JSON.stringify([{ ...valid, status: 'submitted', hash: hashOf(0xabc).toUpperCase().replace('0X', '0x') }])],
    ['uppercase account', JSON.stringify([{ ...valid, account: valid.account.replace('0x', '0X') }])],
    ['capitalised kind', JSON.stringify([{ ...valid, kind: 'Payment' }])],
    ['boolean status', JSON.stringify([{ ...valid, status: true }])],
    ['malformed id', JSON.stringify([{ ...valid, id: 'x'.repeat(36) }])],
    ['unknown extra field', JSON.stringify([{ ...valid, amount: 1 }])],
    ['above the record limit', JSON.stringify(Array.from({ length: 129 }, (_, i) => record(i + 1)))],
  ];
  it.each(corrupt)('fails closed on a durable store with %s: no wallet request, nothing written, no prototype pollution', async (_name, raw) => {
    const locks = createTestLocks();
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    let writes = 0;
    const store: AttemptStorage = { getItem: () => raw, setItem: () => { writes += 1; } };
    await expect(sendViaWallet(s, txOf(1), undefined, { ...pay(1), storage: store, lockManager: locks })).rejects.toThrow(JOURNAL_ERROR);
    expect(sends(log)).toBe(0);
    expect(writes).toBe(0);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(locks.isHeld(ATTEMPT_JOURNAL_LOCK)).toBe(false);
  });

  it.each([
    ['a number', 0], ['an object', {}], ['an array of text', ['[]']],
  ] as const)('fails closed with the typed journal error when getItem returns %s', async (_name, value) => {
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    const store = { getItem: () => value, setItem: () => undefined } as unknown as AttemptStorage;
    await expect(sendViaWallet(s, txOf(1), undefined, { ...pay(1), storage: store, lockManager: createTestLocks() })).rejects.toThrow(JOURNAL_ERROR);
    expect(sends(log)).toBe(0);
  });

  // QA-3 (low): parseRaw reads `raw.length` of a non-null, non-string getItem answer, so an `undefined` answer (a
  // non-conforming Storage polyfill) surfaces as an untyped TypeError instead of the journal error. Still fail-closed:
  // no wallet request starts. Flip to `it` once parseRaw refuses a non-string as the typed journal error.
  it('fails closed with the typed journal error when getItem returns undefined', async () => {
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    const store = { getItem: () => undefined, setItem: () => undefined } as unknown as AttemptStorage;
    const error = await sendViaWallet(s, txOf(1), undefined, { ...pay(1), storage: store, lockManager: createTestLocks() }).catch((e: unknown) => e);
    expect(sends(log)).toBe(0);
    expect(error).toMatchObject({ message: expect.stringMatching(JOURNAL_ERROR) as unknown });
  });
});

describe('lock manager faults', () => {
  async function setup(): Promise<{ s: WalletSession; log: SendEntry[]; shared: ReturnType<typeof profile>; base: TestLockManager }> {
    const base = createTestLocks();
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    return { s, log, shared: profile(() => base.isHeld(ATTEMPT_JOURNAL_LOCK)), base };
  }

  it('rejects before the callback ran: no wallet request, no record', async () => {
    const { s, log, shared } = await setup();
    const lockManager: AttemptLockManager = { request: () => Promise.reject(new DOMException('aborted', 'AbortError')) };
    await expect(sendViaWallet(s, txOf(1), undefined, { ...pay(1), storage: shared.tab(), lockManager })).rejects.toThrow('aborted');
    expect(sends(log)).toBe(0);
    expect(shared.raw()).toBeNull();
  });

  it('throws synchronously from request: no wallet request, no record', async () => {
    const { s, log, shared } = await setup();
    const lockManager: AttemptLockManager = { request: () => { throw new TypeError('bad lock name'); } };
    await expect(sendViaWallet(s, txOf(1), undefined, { ...pay(1), storage: shared.tab(), lockManager })).rejects.toThrow('bad lock name');
    expect(sends(log)).toBe(0);
    expect(shared.raw()).toBeNull();
  });

  it.each(['rejects', 'fulfills'] as const)('never starts a wallet request if the lock request %s before its callback', async (settlement) => {
    const { s, log, shared } = await setup();
    // Native Web Locks wait for the callback. An injected adapter may settle too early.
    const lockManager: AttemptLockManager = {
      request: <T>(_name: string, callback: () => Promise<T>): Promise<T> => {
        setTimeout(() => { void callback().catch(() => undefined); }, 0);
        return settlement === 'rejects' ? Promise.reject(new Error('lock aborted')) : Promise.resolve(undefined as T);
      },
    };
    const message = settlement === 'rejects' ? 'lock aborted' : JOURNAL_ERROR;
    await expect(sendViaWallet(s, txOf(1), undefined, { ...pay(1), storage: shared.tab(), lockManager })).rejects.toThrow(message);
    await macrotask();
    await macrotask();
    expect(sends(log)).toBe(0);
    expect(shared.raw()).toBeNull();
  });

  it('runs the callback, then throws synchronously: the request continues and its hash is recorded', async () => {
    const { s, log, shared, base } = await setup();
    let calls = 0;
    const lockManager: AttemptLockManager = {
      request: <T>(name: string, callback: () => Promise<T>): Promise<T> => {
        calls += 1;
        if (calls > 1) return base.request(name, callback);
        void callback().catch(() => undefined);
        throw new Error('lock wrapper failed');
      },
    };
    await expect(sendViaWallet(s, txOf(1), undefined, { ...pay(1), storage: shared.tab(), lockManager })).resolves.toBe(hashOf(1));
    expect(sends(log)).toBe(1);
    expect(readAttempts(shared.tab())).toMatchObject([{ status: 'submitted', hash: hashOf(1) }]);
  });

  it('invokes the callback twice: exactly one wallet request', async () => {
    const { s, log, shared, base } = await setup();
    const lockManager: AttemptLockManager = {
      request: async <T>(name: string, callback: () => Promise<T>): Promise<T> => {
        const first = await base.request(name, callback);
        await base.request(name, callback).catch(() => undefined);
        return first;
      },
    };
    await expect(sendViaWallet(s, txOf(1), undefined, { ...pay(1), storage: shared.tab(), lockManager })).resolves.toBe(hashOf(1));
    expect(sends(log)).toBe(1);
    expect(readAttempts(shared.tab())).toMatchObject([{ status: 'submitted', hash: hashOf(1) }]);
  });

  it('never grants the lock: no wallet request and no record (bounded wait)', async () => {
    const { s, log, shared } = await setup();
    const lockManager: AttemptLockManager = { request: () => new Promise(() => undefined) };
    const outcome = sendViaWallet(s, txOf(1), undefined, { ...pay(1), storage: shared.tab(), lockManager }).then(() => 'settled', () => 'settled');
    const winner = await Promise.race([outcome, new Promise((resolve) => { setTimeout(() => { resolve('pending'); }, 25); })]);
    expect(winner).toBe('pending');
    expect(sends(log)).toBe(0);
    expect(shared.raw()).toBeNull();
  });

  it.each([
    ['a throwing navigator.locks getter', { get: () => { throw new Error('denied'); } }],
    ['navigator.locks without request()', { value: { query: () => Promise.resolve({}) } }],
    ['navigator.locks = null', { value: null }],
  ] as const)('refuses on the durable store with %s: typed error, no wallet request', async (_name, descriptor) => {
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    Object.defineProperty(navigator, 'locks', { configurable: true, ...descriptor });
    await expect(sendViaWallet(s, txOf(1), undefined, pay(1))).rejects.toMatchObject({
      name: 'UserFacingError', message: expect.stringMatching(/cannot lock the wallet attempt journal/) as unknown,
    });
    expect(sends(log)).toBe(0);
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBeNull();
  });
});

describe('provider faults', () => {
  async function run(provider: (log: SendEntry[]) => Eip1193Provider): Promise<{ result: unknown; log: SendEntry[]; shared: ReturnType<typeof profile>; locks: TestLockManager }> {
    const locks = createTestLocks();
    const shared = profile(() => locks.isHeld(ATTEMPT_JOURNAL_LOCK));
    const log: SendEntry[] = [];
    const s = await sessionFor(provider(log));
    const result = await sendViaWallet(s, txOf(1), undefined, { ...pay(1), storage: shared.tab(), lockManager: locks }).catch((e: unknown) => e);
    return { result, log, shared, locks };
  }
  const answering = (answer: (n: number) => unknown) => (log: SendEntry[]): Eip1193Provider => tabWallet({ account: accountOf(0), log, send: answer });

  it('a synchronous throw from request() is an unknown outcome; the record stays unknown and blocks a retry', async () => {
    const { result, log, shared, locks } = await run((l) => {
      const inner = tabWallet({ account: accountOf(0), log: l });
      return { request: (args) => { if (args.method === 'eth_sendTransaction') { inner.request(args).catch(() => undefined); throw new Error('provider crashed'); } return inner.request(args); } };
    });
    expect(result).toBeInstanceOf(WalletSubmissionUnknownError);
    expect(sends(log)).toBe(1);
    expect(readAttempts(shared.tab())).toMatchObject([{ status: 'unknown', key: keyOf(1) }]);
    expect(locks.isHeld(ATTEMPT_JOURNAL_LOCK)).toBe(false);
  });

  it.each([
    ['a number', 1], ['null', null], ['an object', { hash: hashOf(1) }], ['a String object', Object(hashOf(1)) as unknown],
    ['63 hex digits', `0x${'a'.repeat(63)}`], ['65 hex digits', `0x${'a'.repeat(65)}`], ['a 0X prefix', `0X${'a'.repeat(64)}`],
    ['a trailing newline', `${hashOf(1)}\n`], ['a leading space', ` ${hashOf(1)}`], ['non-hex digits', `0x${'g'.repeat(64)}`],
  ] as const)('a hash that is %s is an unknown outcome; the record stays unknown', async (_name, answer) => {
    const { result, log, shared } = await run(answering(() => Promise.resolve(answer)));
    expect(result).toBeInstanceOf(WalletSubmissionUnknownError);
    expect(sends(log)).toBe(1);
    expect(readAttempts(shared.tab())).toMatchObject([{ status: 'unknown' }]);
    expect(shared.raw()).not.toContain('"hash"');
  });

  it('an uppercase hash is accepted and recorded lowercase', async () => {
    const upper = `0x${'C0FFEE'.repeat(10)}ABCD`;
    const { result, shared } = await run(answering(() => Promise.resolve(upper)));
    expect(result).toBe(upper.toLowerCase());
    expect(readAttempts(shared.tab())).toMatchObject([{ status: 'submitted', hash: upper.toLowerCase() }]);
  });

  it('a hostile rejection (throwing code getter, thenable whose then throws) is an unknown outcome', async () => {
    const hostile = new Proxy(new Error('hostile'), { get: () => { throw new Error('trap'); } });
    for (const answer of [() => Promise.reject(hostile), () => ({ then: () => { throw new Error('then trap'); } })]) {
      const { result, shared } = await run(answering(answer));
      expect(result).toBeInstanceOf(WalletSubmissionUnknownError);
      expect(readAttempts(shared.tab())).toMatchObject([{ status: 'unknown' }]);
    }
  });

  it('a user rejection (4001) keeps the unknown record, so the same invoice stays blocked until an explicit clear', async () => {
    // Intended: "an RPC code is diagnostic data, never proof that nothing was broadcast" (WalletSubmissionUnknownError)
    // and "no expiry or automatic eviction" (beginAttempt); no error path removes a record.
    const { result, shared, locks } = await run(answering(() => Promise.reject(Object.assign(new Error('denied'), { code: 4001 }))));
    expect(result).toBeInstanceOf(WalletRequestRejectedError);
    expect(readAttempts(shared.tab())).toMatchObject([{ status: 'unknown', key: keyOf(1) }]);
    const retry = await sessionFor(new MockWallet({ account: accountOf(0) }));
    await expect(sendViaWallet(retry, txOf(9), undefined, { ...pay(1), storage: shared.tab(), lockManager: locks })).rejects.toThrow(DUPLICATE_ERROR);
  });

  it('a request that never settles does not hold the lock: another tab pays a different invoice, the same invoice stays blocked', async () => {
    const locks = createTestLocks();
    const shared = profile(() => locks.isHeld(ATTEMPT_JOURNAL_LOCK));
    const log: SendEntry[] = [];
    const stuck = await sessionFor(tabWallet({ account: accountOf(0), log, send: () => ({ then: () => undefined }) }));
    let settled = false;
    void sendViaWallet(stuck, txOf(1), undefined, { ...pay(1), storage: shared.tab(), lockManager: locks }).finally(() => { settled = true; });
    await vi.waitFor(() => { expect(sends(log)).toBe(1); });
    expect(locks.isHeld(ATTEMPT_JOURNAL_LOCK)).toBe(false);
    const other = await sessionFor(tabWallet({ account: accountOf(1), log }));
    await expect(sendViaWallet(other, txOf(2), undefined, { ...pay(2), storage: shared.tab(), lockManager: locks })).resolves.toBe(hashOf(2));
    await expect(sendViaWallet(other, txOf(3), undefined, { ...pay(1), storage: shared.tab(), lockManager: locks })).rejects.toThrow(DUPLICATE_ERROR);
    expect(settled).toBe(false);
    expect(readAttempts(shared.tab()).map((r) => [r.key, r.status]).sort()).toEqual([[keyOf(1), 'unknown'], [keyOf(2), 'submitted']].sort());
  });
});

describe('legacy sessionStorage migration', () => {
  const legacy = (initial: readonly WalletAttempt[] | string | null, faults: { get?: boolean; remove?: 'throws' | 'ignored' } = {}): LegacyAttemptStorage & { raw: () => string | null } => {
    let value = initial === null ? null : typeof initial === 'string' ? initial : JSON.stringify(initial);
    return {
      getItem: () => { if (faults.get === true) throw new DOMException('denied', 'SecurityError'); return value; },
      setItem: (_k, v) => { value = v; },
      removeItem: () => {
        if (faults.remove === 'throws') throw new DOMException('denied', 'SecurityError');
        if (faults.remove !== 'ignored') value = null;
      },
      raw: () => value,
    };
  };
  const byId = (records: readonly WalletAttempt[]): readonly WalletAttempt[] => [...records].sort((a, b) => a.id.localeCompare(b.id));

  it('merges overlapping ids and keys: the first hash is kept, an unknown record gains its hash, nothing is dropped', async () => {
    const a = record(1, { status: 'submitted', hash: hashOf(1) });
    const b = record(2);
    const sameKeyOtherId = record(3, { key: a.key, status: 'submitted', hash: hashOf(3) });
    window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([a, b]));
    const tab = legacy([a, { ...b, status: 'submitted', hash: hashOf(2) }, sameKeyOtherId]);
    await withAttemptJournal(() => undefined, { legacyStorage: tab });
    expect(readAttempts(window.localStorage)).toEqual([a, { ...b, status: 'submitted', hash: hashOf(2) }, sameKeyOtherId]);
    expect(tab.raw()).toBeNull();
    // A later stale copy with a different hash for a recorded id refuses and changes neither store.
    const before = window.localStorage.getItem(ATTEMPT_JOURNAL_KEY);
    const conflicting = legacy([{ ...a, hash: hashOf(9) }]);
    await expect(withAttemptJournal(() => undefined, { legacyStorage: conflicting })).rejects.toThrow(JOURNAL_ERROR);
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBe(before);
    expect(conflicting.raw()).not.toBeNull();
  });

  it.each([
    ['__proto__ pollution', '[{"__proto__":{"polluted":true}}]'],
    ['truncated JSON', '[{"id":"00000000-0000-4000-8000-0000'],
    ['duplicate ids', JSON.stringify([record(1), record(1, { key: hashOf(5) })])],
    ['a null element', '[null]'],
    ['an object', '{"0":{}}'],
  ])('fails closed on a corrupt legacy store with %s: operation not run, neither store changed', async (_name, raw) => {
    const durable = JSON.stringify([record(7)]);
    window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, durable);
    const tab = legacy(raw);
    const operation = vi.fn();
    await expect(withAttemptJournal(operation, { legacyStorage: tab })).rejects.toThrow(JOURNAL_ERROR);
    expect(operation).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBe(durable);
    expect(tab.raw()).toBe(raw);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it.each([
    ['getItem throws', { get: true }],
    ['removeItem throws', { remove: 'throws' }],
    ['removeItem is silently ignored', { remove: 'ignored' }],
  ] as const)('fails closed when the legacy store\'s %s, without dropping a record from either store', async (_name, faults) => {
    const tab = legacy([record(1)], faults);
    const operation = vi.fn();
    await expect(withAttemptJournal(operation, { legacyStorage: tab })).rejects.toThrow(JOURNAL_ERROR);
    expect(operation).not.toHaveBeenCalled();
    expect(tab.raw()).toBe(JSON.stringify([record(1)]));
    const durable = window.localStorage.getItem(ATTEMPT_JOURNAL_KEY);
    if (durable !== null) expect(readAttempts(window.localStorage)).toEqual([record(1)]);
  });

  it.each([3, 17, 404])('runs once per tab and is idempotent across concurrent tabs (seed %i)', async (seed) => {
    const next = lcg(seed);
    const locks = chaosLocks(next);
    const shared = record(1);
    // Tabs 1 and 2 are duplicates of one pre-upgrade tab (sessionStorage is cloned on duplication).
    const stores = [
      legacy([shared, record(2)]),
      legacy([{ ...shared, status: 'submitted', hash: hashOf(1) }, record(2)]),
      legacy([record(3)]),
      legacy(null),
      legacy([record(4), record(5)]),
    ];
    await Promise.all(stores.map(async (tab) => { await ticks(next() % 4); await withAttemptJournal(() => undefined, { legacyStorage: tab, lockManager: locks }); }));
    const expected = byId([{ ...shared, status: 'submitted', hash: hashOf(1) }, record(2), record(3), record(4), record(5)]);
    expect(byId(readAttempts(window.localStorage))).toEqual(expected);
    expect(stores.every((tab) => tab.raw() === null)).toBe(true);
    expect(locks.maxActive()).toBe(1);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await Promise.all(stores.map((tab) => withAttemptJournal(() => undefined, { legacyStorage: tab, lockManager: locks })));
    // A tab whose copy is already fully migrated (another duplicate) only empties its own store.
    const late = legacy([record(3), record(5)]);
    await withAttemptJournal(() => undefined, { legacyStorage: late, lockManager: locks });
    expect(setItem.mock.contexts.filter((c) => c === window.localStorage)).toHaveLength(0);
    expect(late.raw()).toBeNull();
    expect(byId(readAttempts(window.localStorage))).toEqual(expected);
  });
});

describe('wallet authority changes while waiting for the journal lock', () => {
  /** Lock that is held by "another tab" until the test releases it; `queued` resolves once this tab's request waits. */
  function contendedLocks(): { lockManager: AttemptLockManager; queued: Promise<void>; release: () => void; beforeGrant: (f: () => void) => void } {
    const base = createTestLocks();
    let release = (): void => undefined;
    void base.request(ATTEMPT_JOURNAL_LOCK, () => new Promise<void>((resolve) => { release = resolve; }));
    let signalQueued = (): void => undefined;
    const queued = new Promise<void>((resolve) => { signalQueued = resolve; });
    let hook = (): void => undefined;
    return {
      lockManager: { request: <T>(name: string, callback: () => Promise<T>): Promise<T> => {
        signalQueued();
        return base.request(name, () => { hook(); return callback(); });
      } },
      queued,
      release: () => { release(); },
      beforeGrant: (f) => { hook = f; },
    };
  }

  it.each(['accountsChanged', 'chainChanged', 'disconnect'])('%s while queued for the lock: no record, no wallet request', async (event) => {
    const log: SendEntry[] = [];
    const wallet = tabWallet({ account: accountOf(0), log });
    const s = await sessionFor(wallet);
    const shared = profile(() => true);
    const locks = contendedLocks();
    const result = sendViaWallet(s, txOf(1), undefined, { ...pay(1), storage: shared.tab(), lockManager: locks.lockManager }).catch((e: unknown) => e);
    await locks.queued;
    wallet.emit(event);
    locks.release();
    expect(await result).toMatchObject({ message: expect.stringMatching(/account, network or provider changed/) as unknown });
    expect(sends(log)).toBe(0);
    expect(shared.raw()).toBeNull();
  });

  it('accountsChanged delivered at lock grant, just before the journal step: no record, no wallet request', async () => {
    const log: SendEntry[] = [];
    const wallet = tabWallet({ account: accountOf(0), log });
    const s = await sessionFor(wallet);
    const shared = profile(() => true);
    const locks = contendedLocks();
    locks.beforeGrant(() => { wallet.emit('accountsChanged'); });
    const result = sendViaWallet(s, txOf(1), undefined, { ...pay(1), storage: shared.tab(), lockManager: locks.lockManager }).catch((e: unknown) => e);
    await locks.queued;
    locks.release();
    expect(await result).toMatchObject({ message: expect.stringMatching(/account, network or provider changed/) as unknown });
    expect(sends(log)).toBe(0);
    expect(shared.raw()).toBeNull();
  });

  it('application authority (assertCurrent) revoked while queued: no record, no wallet request', async () => {
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    const shared = profile(() => true);
    const locks = contendedLocks();
    let current = true;
    const assertCurrent = (): void => { if (!current) throw new Error('page changed'); };
    const result = sendViaWallet(s, txOf(1), assertCurrent, { ...pay(1), storage: shared.tab(), lockManager: locks.lockManager }).catch((e: unknown) => e);
    await locks.queued;
    current = false;
    locks.release();
    expect(await result).toMatchObject({ message: 'page changed' });
    expect(sends(log)).toBe(0);
    expect(shared.raw()).toBeNull();
  });
});

/** Reads the committed IndexedDB snapshot without changing it. */
async function committedSnapshot(): Promise<unknown> {
  return (await updateJournalSnapshot((saved) => ({ result: saved, snapshot: saved as string }))).result;
}
async function seedSnapshot(value: unknown): Promise<void> {
  await updateJournalSnapshot(() => ({ result: undefined, snapshot: value as string }));
}
async function committedRecords(): Promise<readonly WalletAttempt[]> {
  const saved = await committedSnapshot();
  return typeof saved === 'string' ? readAttempts({ getItem: () => saved, setItem: () => undefined }) : [];
}

type IdbFault = 'open-throws' | 'open-error' | 'open-blocked' | 'transaction-throws' | 'get-error' | 'put-throws' | 'commit-abort';
/**
 * Wraps an in-memory IndexedDB with faults that apply while `active()`: open refused (throws, error, blocked), a
 * transaction that cannot start, a read error (which aborts the transaction, as an unhandled request error does), a put
 * refused for quota, and an abort at commit (quota at commit). `onCommit` runs in the task that completes a write.
 */
function faultyIdb(inner: IDBFactory, fault: IdbFault | 'none', active: () => boolean, onCommit?: () => void): IDBFactory {
  const bound = (target: object, prop: string | symbol): unknown => {
    const value: unknown = Reflect.get(target, prop);
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
  };
  const wrapTx = (tx: IDBTransaction): IDBTransaction => {
    let wrote = false;
    return new Proxy(tx, {
      get: (target, prop) => prop !== 'objectStore' ? bound(target, prop) : (name: string) => {
        const store = target.objectStore(name);
        return {
          get: (key: IDBValidKey) => {
            const real = store.get(key);
            if (fault !== 'get-error' || !active()) return real;
            const fake: { result: unknown; error: DOMException | null; onsuccess: (() => void) | null; onerror: (() => void) | null } = { result: undefined, error: null, onsuccess: null, onerror: null };
            real.onsuccess = () => { fake.error = new DOMException('read failed', 'UnknownError'); fake.onerror?.(); target.abort(); };
            return fake;
          },
          put: (value: unknown, key: IDBValidKey) => {
            if (active() && fault === 'put-throws') throw new DOMException('quota', 'QuotaExceededError');
            wrote = true;
            const request = store.put(value, key);
            if (active() && fault === 'commit-abort') target.abort();
            return request;
          },
        };
      },
      set: (target, prop, value: unknown) => {
        if (prop !== 'oncomplete' || typeof value !== 'function' || onCommit === undefined) return Reflect.set(target, prop, value);
        return Reflect.set(target, prop, () => { if (wrote) onCommit(); (value as () => void)(); });
      },
    });
  };
  const wrapDb = (db: IDBDatabase): IDBDatabase => new Proxy(db, {
    get: (target, prop) => prop !== 'transaction' ? bound(target, prop) : (...args: Parameters<IDBDatabase['transaction']>) => {
      if (active() && fault === 'transaction-throws') throw new DOMException('closing', 'InvalidStateError');
      return wrapTx(target.transaction(...args));
    },
  });
  return {
    open: (name: string, version?: number): unknown => {
      if (active() && fault === 'open-throws') throw new DOMException('denied', 'SecurityError');
      if (active() && (fault === 'open-error' || fault === 'open-blocked')) {
        const request: Record<string, unknown> = { result: undefined, error: null, onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null };
        setTimeout(() => { const handler = request[fault === 'open-error' ? 'onerror' : 'onblocked']; if (typeof handler === 'function') (handler as () => void)(); }, 0);
        return request;
      }
      return new Proxy(inner.open(name, version), {
        get: (target, prop) => {
          if (prop !== 'result') return Reflect.get(target, prop) as unknown;
          const db = (target as { result: unknown }).result;
          return db === undefined ? db : wrapDb(db as IDBDatabase);
        },
        set: (target, prop, value: unknown) => Reflect.set(target, prop, value),
      });
    },
  } as unknown as IDBFactory;
}

/**
 * A per-process localStorage cache that lags other tabs: a read right after this facade's own write sees that write;
 * any other read returns a seeded choice among every version ever written (including "absent").
 */
function laggingMirror(next: () => number): { store: Storage; latest: () => string | null; staleReads: () => number } {
  const history: (string | null)[] = [null];
  let fresh = false;
  let stale = 0;
  const latest = (): string | null => history[history.length - 1] ?? null;
  const store = {
    getItem: (k: string): string | null => {
      if (k !== ATTEMPT_JOURNAL_KEY) return null;
      if (fresh) { fresh = false; return latest(); }
      const pick = history[next() % history.length] ?? null;
      if (pick !== latest()) stale += 1;
      return pick;
    },
    setItem: (k: string, v: string): void => { if (k === ATTEMPT_JOURNAL_KEY) { history.push(v); fresh = true; } },
    removeItem: (): void => undefined,
    clear: (): void => undefined,
    key: (): null => null,
    length: 0,
  };
  return { store, latest, staleReads: () => stale };
}

describe('default browser journal: authoritative IndexedDB snapshot, localStorage mirror', () => {
  let restoreLocalStorage: (() => void) | undefined;
  function replaceLocalStorage(store: Storage): void {
    const own = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => store });
    restoreLocalStorage = () => {
      if (own !== undefined) Object.defineProperty(window, 'localStorage', own);
      else Reflect.deleteProperty(window, 'localStorage');
    };
  }
  afterEach(() => { restoreLocalStorage?.(); restoreLocalStorage = undefined; });

  it.each([
    [5, 1], [8, 4], [77, TABS], [4242, 1],
  ])('seed %i, %i invoices, 20 tabs with lagging mirrors: one wallet request per invoice, every hash committed', async (seed, invoices) => {
    const next = lcg(seed);
    const locks = chaosLocks(next);
    const held = (): boolean => locks.active() > 0;
    const mirror = laggingMirror(next);
    replaceLocalStorage(mirror.store);
    const log: SendEntry[] = [];
    const sessions: WalletSession[] = [];
    for (let i = 0; i < TABS; i += 1) sessions.push(await sessionFor(tabWallet({ account: accountOf(i), log, next, isHeld: held })));
    const runs: Promise<string>[] = [];
    for (const [i, s] of sessions.entries()) {
      runs.push(sendViaWallet(s, txOf(i), undefined, { ...pay(i % invoices), lockManager: locks }));
      await ticks(next() % 3);
    }
    const settled = await Promise.allSettled(runs);
    const hashes = settled.flatMap((r) => r.status === 'fulfilled' ? [r.value] : []);
    const refused = settled.flatMap((r) => r.status === 'rejected' ? [r.reason as unknown] : []);
    expect(hashes).toHaveLength(invoices);
    for (const e of refused) expect(e).toMatchObject({ message: expect.stringMatching(DUPLICATE_ERROR) as unknown });
    expect(sends(log)).toBe(invoices);
    expect(log.every((e) => e.held)).toBe(true);
    const committed = await committedRecords();
    expect(committed.map((r) => r.hash).sort()).toEqual([...hashes].sort());
    expect(committed.every((r) => r.status === 'submitted')).toBe(true);
    expect(mirror.latest()).toBe(await committedSnapshot());
    expect(mirror.staleReads()).toBeGreaterThan(0);
    expect(locks.maxActive()).toBe(1);
  });

  it('a tab whose mirror predates another tab\'s pending attempt cannot send that invoice and loses no update for another', async () => {
    const locks = installTestLocks();
    const log: SendEntry[] = [];
    const wallet = heldSends();
    const a = await sessionFor(tabWallet({ account: accountOf(0), log, send: wallet.send }));
    const b = await sessionFor(tabWallet({ account: accountOf(1), log }));
    const pendingA = sendViaWallet(a, txOf(1), undefined, pay(1));
    await vi.waitFor(() => { expect(sends(log)).toBe(1); });
    for (const stale of [null, '[]']) {
      if (stale === null) window.localStorage.removeItem(ATTEMPT_JOURNAL_KEY);
      else window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, stale);
      await expect(sendViaWallet(b, txOf(2), undefined, pay(1))).rejects.toThrow(DUPLICATE_ERROR);
    }
    expect(sends(log)).toBe(1);
    // Same stale view, a different invoice: proceeds, and tab A's pending record survives the stale mirror.
    window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, '[]');
    await expect(sendViaWallet(b, txOf(3), undefined, pay(2))).resolves.toBe(hashOf(2));
    window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, '[]');
    wallet.release(1);
    await expect(pendingA).resolves.toBe(hashOf(0x101));
    expect((await committedRecords()).map((r) => [r.key, r.hash]).sort()).toEqual([[keyOf(1), hashOf(0x101)], [keyOf(2), hashOf(2)]].sort());
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBe(await committedSnapshot());
    expect(locks.isHeld(ATTEMPT_JOURNAL_LOCK)).toBe(false);
  });

  const idbFaults: readonly IdbFault[] = ['open-throws', 'open-error', 'open-blocked', 'transaction-throws', 'get-error', 'put-throws', 'commit-abort'];
  it.each(idbFaults)('IndexedDB %s before the send: no wallet request, nothing committed, mirror untouched', async (fault) => {
    const locks = installTestLocks();
    const inner = memoryIndexedDb();
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    vi.stubGlobal('indexedDB', faultyIdb(inner, fault, () => sends(log) === 0));
    await expect(sendViaWallet(s, txOf(1), undefined, pay(1))).rejects.toThrow(JOURNAL_ERROR);
    expect(sends(log)).toBe(0);
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBeNull();
    expect(locks.isHeld(ATTEMPT_JOURNAL_LOCK)).toBe(false);
    vi.stubGlobal('indexedDB', inner);
    expect(await committedSnapshot()).toBeUndefined();
  });

  it.each(idbFaults)('IndexedDB %s after the send: WalletBroadcastError carries the hash; the unknown record stays committed', async (fault) => {
    const inner = memoryIndexedDb();
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    vi.stubGlobal('indexedDB', faultyIdb(inner, fault, () => sends(log) > 0));
    try {
      const error = await sendViaWallet(s, txOf(1), undefined, pay(1)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(WalletBroadcastError);
      expect(error).toMatchObject({ hash: hashOf(1) });
      vi.stubGlobal('indexedDB', inner);
      const committed = await committedRecords();
      expect(committed).toMatchObject([{ key: keyOf(1), status: 'unknown' }]);
      // The durable mirror is still unknown; readAttempts also includes the retained returned hash.
      expect(JSON.parse(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY) ?? '[]')).toEqual(committed);
      expect(readAttempts(window.localStorage)).toMatchObject([{ key: keyOf(1), status: 'submitted', hash: hashOf(1) }]);
      expect(readReturnedAttempts()).toMatchObject([{ key: keyOf(1), hash: hashOf(1) }]);
      await expect(sendViaWallet(s, txOf(1), undefined, pay(1))).rejects.toThrow(DUPLICATE_ERROR);
      expect(sends(log)).toBe(1);
    } finally {
      // End the synthetic fault through real persistence, without deleting the production fallback.
      vi.stubGlobal('indexedDB', inner);
      await retryReturnedAttempts();
    }
    expect(readReturnedAttempts()).toEqual([]);
    expect(await committedRecords()).toMatchObject([{ key: keyOf(1), status: 'submitted', hash: hashOf(1) }]);
    expect(sends(log)).toBe(1);
  });

  it.each([
    ['undefined', undefined], ['an object without open()', {}],
  ] as const)('indexedDB %s: typed journal error, no wallet request', async (_name, factory) => {
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    vi.stubGlobal('indexedDB', factory);
    await expect(sendViaWallet(s, txOf(1), undefined, pay(1))).rejects.toThrow(JOURNAL_ERROR);
    expect(sends(log)).toBe(0);
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBeNull();
  });

  // Observed (QA-6): the lock callback awaits the open with no timeout, so the journal lock stays held and every tab's
  // journal operation waits until this tab is closed or reloaded.
  it('an IndexedDB open that never answers: no wallet request (bounded wait)', async () => {
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    vi.stubGlobal('indexedDB', { open: () => ({ result: undefined, error: null, onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null }) });
    const outcome = sendViaWallet(s, txOf(1), undefined, pay(1)).then(() => 'settled', () => 'settled');
    const winner = await Promise.race([outcome, new Promise((resolve) => { setTimeout(() => { resolve('pending'); }, 25); })]);
    expect(winner).toBe('pending');
    expect(sends(log)).toBe(0);
  });

  it.each([
    ['a number', 1], ['an object', { records: [] }], ['an array', []], ['truncated JSON', '[{"id":'],
    ['__proto__ JSON', '{"__proto__":{"polluted":true}}'], ['duplicate ids', JSON.stringify([record(1), record(1, { key: hashOf(5) })])],
    ['oversized text', `[${' '.repeat(100_001)}]`],
  ] as const)('a committed snapshot that is %s fails closed: no wallet request, snapshot and mirror unchanged', async (_name, value) => {
    await seedSnapshot(value);
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    await expect(sendViaWallet(s, txOf(1), undefined, pay(1))).rejects.toThrow(JOURNAL_ERROR);
    expect(sends(log)).toBe(0);
    expect(await committedSnapshot()).toEqual(value);
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBeNull();
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('a corrupt mirror refuses a send although the committed snapshot is valid', async () => {
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    await sendViaWallet(s, txOf(1), undefined, pay(1));
    const committed = await committedSnapshot();
    window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, '[');
    await expect(sendViaWallet(s, txOf(2), undefined, pay(2))).rejects.toThrow(JOURNAL_ERROR);
    expect(sends(log)).toBe(1);
    expect(await committedSnapshot()).toBe(committed);
  });

  it.each(['accountsChanged', 'chainChanged', 'disconnect'])('%s delivered between the IndexedDB commit and invoke: no wallet request, no hash', async (event) => {
    const inner = memoryIndexedDb();
    const log: SendEntry[] = [];
    const wallet = tabWallet({ account: accountOf(0), log });
    const s = await sessionFor(wallet);
    let armed = true;
    vi.stubGlobal('indexedDB', faultyIdb(inner, 'none', () => false, () => { if (armed) { armed = false; wallet.emit(event); } }));
    const error = await sendViaWallet(s, txOf(1), undefined, pay(1)).catch((e: unknown) => e);
    expect(error).toMatchObject({ message: expect.stringMatching(/account, network or provider changed/) as unknown });
    expect(sends(log)).toBe(0);
    vi.stubGlobal('indexedDB', inner);
    // QA-5: the wallet was never asked, so the committed `unknown` record is rolled back and a retry may proceed.
    expect(await committedRecords()).toEqual([]);
    expect(readAttempts()).toEqual([]);
    const retry = await sessionFor(tabWallet({ account: accountOf(0), log }));
    await expect(sendViaWallet(retry, txOf(1), undefined, pay(1))).resolves.toMatch(/^0x[0-9a-f]{64}$/);
    expect(sends(log)).toBe(1);
  });

  it('a mirror write that fails after the IndexedDB commit starts no wallet request', async () => {
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    const toLocal = Storage.prototype.setItem.bind(window.localStorage);
    const toSession = Storage.prototype.setItem.bind(window.sessionStorage);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (this !== window.localStorage) { toSession(k, v); return; }
      if (k === ATTEMPT_JOURNAL_KEY) throw new DOMException('quota', 'QuotaExceededError');
      toLocal(k, v);
    });
    await expect(sendViaWallet(s, txOf(1), undefined, pay(1))).rejects.toThrow(JOURNAL_ERROR);
    expect(sends(log)).toBe(0);
  });

  it('REV-I5: a mirror write that fails after the IndexedDB commit rolls the unsent record back, so a retry may proceed', async () => {
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    const toLocal = Storage.prototype.setItem.bind(window.localStorage);
    const toSession = Storage.prototype.setItem.bind(window.sessionStorage);
    let mirrorFails = true;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (this !== window.localStorage) { toSession(k, v); return; }
      if (k === ATTEMPT_JOURNAL_KEY && mirrorFails) throw new DOMException('quota', 'QuotaExceededError');
      toLocal(k, v);
    });
    await expect(sendViaWallet(s, txOf(1), undefined, pay(1))).rejects.toThrow(JOURNAL_ERROR);
    expect(sends(log)).toBe(0);
    // The wallet was never asked: the committed `unknown` record would only block a legitimate retry (QA-5's rule).
    expect(await committedRecords()).toEqual([]);
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBeNull();
    mirrorFails = false;
    setItem.mockRestore();
    const retry = await sessionFor(tabWallet({ account: accountOf(0), log }));
    await expect(sendViaWallet(retry, txOf(1), undefined, pay(1))).resolves.toMatch(/^0x[0-9a-f]{64}$/);
    expect(sends(log)).toBe(1);
    expect((await committedRecords()).map((r) => r.key)).toEqual([keyOf(1)]);
  });

  it('REV-I5: if the rollback itself cannot commit, the unsent record stays and a retry is still refused', async () => {
    const inner = memoryIndexedDb();
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    let committedOnce = false;
    // The attempt's own commit succeeds; every later IndexedDB write (the rollback) fails.
    vi.stubGlobal('indexedDB', faultyIdb(inner, 'put-throws', () => committedOnce, () => { committedOnce = true; }));
    const toLocal = Storage.prototype.setItem.bind(window.localStorage);
    const toSession = Storage.prototype.setItem.bind(window.sessionStorage);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (this !== window.localStorage) { toSession(k, v); return; }
      if (k === ATTEMPT_JOURNAL_KEY) throw new DOMException('quota', 'QuotaExceededError');
      toLocal(k, v);
    });
    await expect(sendViaWallet(s, txOf(1), undefined, pay(1))).rejects.toThrow(JOURNAL_ERROR);
    expect(committedOnce).toBe(true);
    expect(sends(log)).toBe(0);
    setItem.mockRestore();
    vi.stubGlobal('indexedDB', inner);
    // Refusing a retry is the safe direction: the record is kept, still `unknown`, and blocks the invoice.
    expect((await committedRecords()).map((r) => [r.key, r.status])).toEqual([[keyOf(1), 'unknown']]);
    const retry = await sessionFor(tabWallet({ account: accountOf(0), log }));
    const again = await sendViaWallet(retry, txOf(1), undefined, pay(1)).catch((e: unknown) => e);
    expect(again).toMatchObject({ message: expect.stringMatching(DUPLICATE_ERROR) as unknown });
    expect(sends(log)).toBe(0);
  });

  it('REV-I5: a refused duplicate never rolls back the record that already holds the invoice', async () => {
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    await sendViaWallet(s, txOf(1), undefined, pay(1));
    const before = await committedRecords();
    expect(before.map((r) => [r.key, r.status])).toEqual([[keyOf(1), 'submitted']]);
    const again = await sendViaWallet(s, txOf(1), undefined, pay(1)).catch((e: unknown) => e);
    expect(again).toMatchObject({ message: expect.stringMatching(DUPLICATE_ERROR) as unknown });
    expect(sends(log)).toBe(1);
    expect(await committedRecords()).toEqual(before);
  });

  it('REV-I5: with an existing mirror, a failed mirror write after the commit still leaves only the earlier records', async () => {
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    await sendViaWallet(s, txOf(1), undefined, pay(1));
    const before = await committedRecords();
    const mirrorBefore = window.localStorage.getItem(ATTEMPT_JOURNAL_KEY);
    const toLocal = Storage.prototype.setItem.bind(window.localStorage);
    const toSession = Storage.prototype.setItem.bind(window.sessionStorage);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (this !== window.localStorage) { toSession(k, v); return; }
      if (k === ATTEMPT_JOURNAL_KEY) throw new DOMException('quota', 'QuotaExceededError');
      toLocal(k, v);
    });
    await expect(sendViaWallet(s, txOf(2), undefined, pay(2))).rejects.toThrow(JOURNAL_ERROR);
    expect(sends(log)).toBe(1);
    expect(await committedRecords()).toEqual(before);
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBe(mirrorBefore);
  });

  // QA-4: once a snapshot is committed, updateBrowserJournal reads `saved ?? local`, so a record present only in the
  // localStorage mirror (written by a pre-IndexedDB build still open in another tab, or any writer that bypasses
  // IndexedDB) is ignored: its invoice is sent again, and mirror() then overwrites the mirror, dropping that record and its
  // hash from both stores. Flip to `it` once mirror-only records are merged (or refused) instead of discarded.
  it('a record only the mirror holds (written without IndexedDB, e.g. by an older build) still blocks its invoice', async () => {
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    await sendViaWallet(s, txOf(1), undefined, pay(1));
    const [first] = await committedRecords();
    const mirrorOnly = record(2, { key: keyOf(2), status: 'submitted', hash: hashOf(0xbeef) });
    window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([first, mirrorOnly]));
    const second = await sendViaWallet(s, txOf(2), undefined, pay(2)).catch((e: unknown) => e);
    expect(second).toMatchObject({ message: expect.stringMatching(DUPLICATE_ERROR) as unknown });
    expect(sends(log)).toBe(1);
    expect(readAttempts(window.localStorage).map((r) => r.hash)).toContain(hashOf(0xbeef));
  });
});

describe('bounded waits (JRNL-L1, QA-6)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('a journal lock held elsewhere past the wait refuses typed and asks no wallet', async () => {
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    // A lock manager that never grants, but honours the abort signal like navigator.locks does.
    Object.defineProperty(navigator, 'locks', { configurable: true, value: {
      request: (_name: string, options: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => { reject(new DOMException('aborted', 'AbortError')); });
      }),
    } });
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      expect(ms).toBe(LOCK_WAIT_MS);
      queueMicrotask(() => { controller.abort(); });
      return controller.signal;
    });
    await expect(sendViaWallet(s, txOf(1), undefined, pay(1))).rejects.toThrow(JOURNAL_ERROR);
    expect(sends(log)).toBe(0);
  });

  it('a returned hash is surfaced while another holder keeps the lock, and recorded once it frees', async () => {
    const log: SendEntry[] = [];
    const held = heldSends();
    const s = await sessionFor(tabWallet({ account: accountOf(0), log, send: held.send }));
    const sending = sendViaWallet(s, txOf(1), undefined, pay(1));
    sending.catch(() => undefined);
    await vi.waitFor(() => { expect(sends(log)).toBe(1); });
    // From now on every bounded lock wait expires at once: recording the hash must not be one of them (Worker F, finding 1).
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => AbortSignal.abort());
    // Another tab takes the journal lock across its own wallet prompt.
    let releaseLock = (): void => undefined;
    const other = navigator.locks.request(ATTEMPT_JOURNAL_LOCK, () => new Promise<void>((resolve) => { releaseLock = resolve; }));
    await macrotask();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    held.release(1);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await sending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletBroadcastError);
    expect((error as WalletBroadcastError).hash).toBe(hashOf(0x101));
    expect(readReturnedAttempts()).toMatchObject([{ status: 'submitted', hash: hashOf(0x101) }]);
    expect(JSON.parse(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY) ?? '[]')).toMatchObject([{ status: 'unknown' }]);
    vi.useRealTimers();
    releaseLock();
    await other;
    await vi.waitFor(async () => { expect((await committedRecords()).map((r) => r.hash)).toEqual([hashOf(0x101)]); });
    await vi.waitFor(() => { expect(readReturnedAttempts()).toEqual([]); });
    expect(sends(log)).toBe(1);
  });

  it('an IndexedDB open that never answers is abandoned after a bounded wait', async () => {
    const log: SendEntry[] = [];
    const s = await sessionFor(tabWallet({ account: accountOf(0), log }));
    vi.stubGlobal('indexedDB', { open: () => ({}) as IDBOpenDBRequest });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const sending = sendViaWallet(s, txOf(1), undefined, pay(1));
    sending.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(sending).rejects.toThrow(JOURNAL_ERROR);
    expect(sends(log)).toBe(0);
  });
});
