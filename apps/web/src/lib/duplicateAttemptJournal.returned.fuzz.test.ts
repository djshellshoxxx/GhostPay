// @vitest-environment jsdom
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ATTEMPT_JOURNAL_KEY, beginAttempt, clearAttemptLocked, finishReturnedAttempt, readAttempts, readReturnedAttempts,
  retryReturnedAttempts, withAttemptJournal, type AttemptStorage, type JournalAccess, type WalletAttempt,
} from './duplicateAttemptJournal';
import { createTestLocks, installTestLocks } from '../test/locks';

// Light model-based fuzz of the returned-hash fallback: random interleavings of begin, returned hashes (including a
// conflicting second hash), storage failures, explicit clears and retries, some of them concurrent. Fixed seeds keep
// failures reproducible; run counts stay small enough for the ordinary unit lane.
const RUNS = { seed: 0x52455430, numRuns: 150 } as const;
const stage = vi.hoisted(() => ({ fail: false }));
vi.mock('./attemptJournalStorage', async (load) => {
  const actual = await load<typeof import('./attemptJournalStorage')>();
  return { ...actual, updateJournalSnapshot: <T,>(update: (saved: unknown) => { readonly result: T; readonly snapshot: string }) =>
    actual.updateJournalSnapshot((saved) => {
      const next = update(saved);
      if (stage.fail) throw new Error('synthetic IndexedDB commit failure after staging');
      return next;
    }),
  };
});

const account = `0x${'1'.repeat(40)}`;
const KEYS = ['a', 'b', 'c'].map((c) => `0x${c.repeat(64)}`);
const HASHES = ['d', 'e'].map((c) => `0x${c.repeat(64)}`);

type Op =
  | { readonly op: 'begin'; readonly slot: number }
  | { readonly op: 'finish'; readonly slot: number; readonly hash: number }
  | { readonly op: 'retry' }
  | { readonly op: 'clear'; readonly slot: number }
  | { readonly op: 'fail'; readonly on: boolean };
const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ op: fc.constant('begin' as const), slot: fc.integer({ min: 0, max: 2 }) }),
  fc.record({ op: fc.constant('finish' as const), slot: fc.integer({ min: 0, max: 2 }), hash: fc.integer({ min: 0, max: 1 }) }),
  fc.record({ op: fc.constant('retry' as const) }),
  fc.record({ op: fc.constant('clear' as const), slot: fc.integer({ min: 0, max: 2 }) }),
  fc.record({ op: fc.constant('fail' as const), on: fc.boolean() }),
);
/** Each batch runs concurrently; batches run in order. */
const scheduleArb = fc.array(fc.array(opArb, { minLength: 1, maxLength: 3 }), { minLength: 1, maxLength: 8 });
/** One hash per attempt: nothing may stay unsaved once storage recovers. */
const noConflictArb = scheduleArb.map((batches) => batches.map((batch) => batch.map((op) => op.op === 'finish' ? { ...op, hash: 0 } : op)));

interface Harness {
  readonly access: JournalAccess;
  readonly store: AttemptStorage | undefined;
  readonly setFail: (on: boolean) => void;
  readonly durable: () => readonly WalletAttempt[];
}
function memoryHarness(): Harness {
  let raw: string | null = null;
  let failing = false;
  const storage: AttemptStorage = {
    getItem: () => raw,
    setItem: (_key, value) => { if (failing) throw new Error('synthetic unavailable write'); raw = value; },
  };
  return {
    access: { storage, lockManager: createTestLocks() }, store: storage,
    setFail: (on) => { failing = on; },
    durable: () => JSON.parse(raw ?? '[]') as WalletAttempt[],
  };
}
function browserHarness(): Harness {
  return {
    access: {}, store: undefined,
    setFail: (on) => { stage.fail = on; },
    durable: () => JSON.parse(localStorage.getItem(ATTEMPT_JOURNAL_KEY) ?? '[]') as WalletAttempt[],
  };
}

async function exercise(h: Harness, schedule: readonly (readonly Op[])[]): Promise<void> {
  const attempts: (WalletAttempt | undefined)[] = [undefined, undefined, undefined];
  /** Every hash the wallet "returned" per attempt id, with the batch it arrived in. */
  const returned = new Map<string, { readonly hash: string; readonly batch: number }[]>();
  /** Hashes whose finishReturnedAttempt promise resolved (claimed durable), with that batch. */
  const resolved = new Map<string, { readonly hash: string; readonly batch: number }[]>();
  /** Last batch in which an explicit, confirmed clear of the id was requested: the only legitimate removal. */
  const cleared = new Map<string, number>();
  let batch = 0;
  const run = async (op: Op): Promise<void> => {
    switch (op.op) {
      case 'fail': h.setFail(op.on); return;
      case 'begin': {
        attempts[op.slot] = await withAttemptJournal((s) => beginAttempt({ key: KEYS[op.slot]!, chainId: 1, account, kind: 'payment' }, s), h.access);
        return;
      }
      case 'finish': {
        const attempt = attempts[op.slot];
        if (attempt === undefined) return;
        const hash = HASHES[op.hash]!;
        const at = batch;
        returned.set(attempt.id, [...(returned.get(attempt.id) ?? []), { hash, batch: at }]);
        await finishReturnedAttempt(attempt, hash, h.access, h.store);
        resolved.set(attempt.id, [...(resolved.get(attempt.id) ?? []), { hash, batch: at }]);
        return;
      }
      case 'retry': await retryReturnedAttempts(h.store); return;
      case 'clear': {
        const attempt = attempts[op.slot];
        if (attempt === undefined) return;
        cleared.set(attempt.id, batch);
        await clearAttemptLocked(attempt.id, true, h.access);
      }
    }
  };
  /** A clear in the same or a later batch may legitimately have removed this outcome. */
  const mayBeCleared = (id: string, at: number): boolean => (cleared.get(id) ?? -1) >= at;
  const check = (): void => {
    const durable = h.durable();
    const fallback = readReturnedAttempts(h.store);
    const ids = durable.map((a) => a.id);
    // One durable record per attempt: a second hash never overwrites or duplicates the first.
    expect(new Set(ids).size).toBe(ids.length);
    for (const [id, events] of returned) {
      for (const { hash, batch: at } of events) {
        if (mayBeCleared(id, at)) continue;
        const isDurable = durable.some((a) => a.id === id && a.hash === hash);
        const isRetained = fallback.some((a) => a.id === id && a.hash === hash);
        expect(isDurable || isRetained, `returned hash ${hash.slice(0, 6)} for ${id} was lost`).toBe(true);
      }
    }
    for (const [id, events] of resolved) {
      for (const { hash, batch: at } of events) {
        // A resolved finish was a complete durable write: it stays durable unless explicitly cleared afterwards.
        if (!mayBeCleared(id, at)) expect(durable.some((a) => a.id === id && a.hash === hash)).toBe(true);
      }
    }
  };
  for (const ops of schedule) {
    await Promise.allSettled(ops.map(run));
    check();
    batch++;
  }
  // Quiesce: storage recovers and one explicit retry persists every non-conflicting outcome, with no wallet request.
  h.setFail(false);
  await retryReturnedAttempts(h.store).catch(() => undefined);
  check();
  const durable = h.durable();
  for (const entry of readReturnedAttempts(h.store)) {
    // Only an outcome that conflicts with recorded evidence may remain unsaved after recovery.
    const recorded = durable.find((a) => a.id === entry.id);
    expect(recorded !== undefined && recorded.hash !== entry.hash, `non-conflicting ${(entry.hash ?? '').slice(0, 6)} stayed unsaved`).toBe(true);
  }
  // A key with a submitted or unknown record (durable or retained) is never started again.
  let visible: readonly WalletAttempt[] | undefined;
  try { visible = readAttempts(h.store); } catch { visible = undefined; } // A retained conflict fails closed for every key.
  for (const key of KEYS) {
    if (visible !== undefined && !visible.some((a) => a.key === key)) continue;
    await expect(withAttemptJournal((s) => beginAttempt({ key, chainId: 1, account, kind: 'payment' }, s), h.access)).rejects.toThrow();
  }
}

async function drainFallback(store: AttemptStorage | undefined): Promise<void> {
  // The fallback map is module state keyed by the backing store; never let one case's evidence leak into the next.
  stage.fail = false;
  await retryReturnedAttempts(store).catch(() => undefined);
}

beforeEach(() => { stage.fail = false; localStorage.clear(); sessionStorage.clear(); installTestLocks(); });
afterEach(() => { stage.fail = false; vi.restoreAllMocks(); });

describe('returned-hash fallback under random interleavings (fuzz)', () => {
  it('never loses or overwrites a returned hash with an explicit store', async () => {
    await fc.assert(fc.asyncProperty(scheduleArb, async (schedule) => {
      const h = memoryHarness();
      await exercise(h, schedule);
    }), RUNS);
  });

  it('never loses or overwrites a returned hash through the IndexedDB snapshot and localStorage mirror', async () => {
    await fc.assert(fc.asyncProperty(noConflictArb, async (schedule) => {
      localStorage.clear();
      try { await exercise(browserHarness(), schedule); }
      finally { await drainFallback(undefined); }
      // The browser fallback is module state keyed by localStorage: it must be fully drained, never leak to the next case.
      expect(readReturnedAttempts()).toEqual([]);
    }), { ...RUNS, numRuns: 40 });
  }, 120_000);
});
