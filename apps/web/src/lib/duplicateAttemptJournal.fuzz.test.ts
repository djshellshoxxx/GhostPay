// @vitest-environment jsdom
// Seeded model-based fuzzing of the wallet-attempt journal invariants that protect against duplicate payments and
// lost evidence: a recorded hash is never replaced, a present action key always refuses a new attempt, and malformed
// stored data refuses (typed) instead of being read as an empty journal.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ATTEMPT_JOURNAL_KEY, DUPLICATE_ATTEMPT_MESSAGE, beginAttempt, clearAttempt, finishAttempt, finishReturnedAttempt, readAttempts,
  withAttemptJournal, type AttemptStorage, type WalletAttempt,
} from './duplicateAttemptJournal';
import { UserFacingError } from './errors';
import { installTestLocks } from '../test/locks';

const hex64 = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;
const KEYS = [1, 2, 3, 4].map((n) => hex64(0xa000 + n));
const HASHES = [1, 2, 3].map((n) => hex64(0xb000 + n));
const ACCOUNTS = [`0x${'1'.repeat(40)}`, `0x${'2'.repeat(40)}`];

function memory(): AttemptStorage & { raw: () => string | null } {
  let raw: string | null = null;
  return { getItem: () => raw, setItem: (_key, value) => { raw = value; }, raw: () => raw };
}
function messageKey(error: unknown): string | undefined {
  return error instanceof UserFacingError ? error.translation?.key : undefined;
}

type Op =
  | { readonly t: 'begin'; readonly key: number; readonly account: number }
  | { readonly t: 'finish'; readonly attempt: number; readonly hash: number }
  | { readonly t: 'returned'; readonly attempt: number; readonly hash: number }
  | { readonly t: 'clear'; readonly key: number };
const op: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ t: fc.constant('begin' as const), key: fc.nat(KEYS.length - 1), account: fc.nat(ACCOUNTS.length - 1) }),
  fc.record({ t: fc.constant('finish' as const), attempt: fc.nat(7), hash: fc.nat(HASHES.length - 1) }),
  fc.record({ t: fc.constant('returned' as const), attempt: fc.nat(7), hash: fc.nat(HASHES.length - 1) }),
  fc.record({ t: fc.constant('clear' as const), key: fc.nat(KEYS.length - 1) }),
);

describe('wallet attempt journal model fuzzing', () => {
  it('never replaces a recorded hash and always refuses a present action key', async () => {
    await fc.assert(fc.asyncProperty(fc.array(op, { minLength: 1, maxLength: 24 }), async (ops) => {
      const storage = memory();
      const started: WalletAttempt[] = [];
      // Model: hash recorded per attempt id, and whether a conflicting returned outcome now refuses every read.
      const recorded = new Map<string, string>();
      let poisoned = false;
      for (const step of ops) {
        if (step.t === 'begin') {
          const key = KEYS[step.key]!;
          let present: boolean;
          try { present = readAttempts(storage).some((a) => a.key === key); } catch {
            expect(poisoned).toBe(true);
            expect(() => beginAttempt({ key, chainId: 1, account: ACCOUNTS[step.account]!, kind: 'payment' }, storage)).toThrow(UserFacingError);
            continue;
          }
          if (present) {
            let thrown: unknown;
            try { beginAttempt({ key, chainId: 1, account: ACCOUNTS[step.account]!, kind: 'payment' }, storage); } catch (e) { thrown = e; }
            expect(thrown).toBeInstanceOf(UserFacingError);
            expect(messageKey(thrown)).toBe(DUPLICATE_ATTEMPT_MESSAGE);
          } else {
            started.push(beginAttempt({ key, chainId: 1, account: ACCOUNTS[step.account]!, kind: 'payment' }, storage));
          }
        } else if (step.t === 'finish' || step.t === 'returned') {
          const attempt = started[step.attempt % Math.max(started.length, 1)];
          if (attempt === undefined) continue;
          const hash = HASHES[step.hash]!;
          const prior = recorded.get(attempt.id);
          let failed = false;
          try {
            if (step.t === 'finish') finishAttempt(attempt, hash, storage);
            else await finishReturnedAttempt(attempt, hash, { storage });
          } catch (e) {
            expect(e).toBeInstanceOf(UserFacingError);
            failed = true;
          }
          if (prior !== undefined && prior !== hash) {
            // A different hash for an already-submitted attempt must refuse, never overwrite.
            expect(failed).toBe(true);
            // A refused returned outcome stays retained in memory as evidence, so reads now refuse instead of guessing.
            if (step.t === 'returned') poisoned = true;
          } else if (!poisoned) {
            expect(failed).toBe(false);
            recorded.set(attempt.id, hash);
          }
        } else {
          const key = KEYS[step.key]!;
          try { clearAttempt(key, true, storage); } catch (e) {
            expect(e).toBeInstanceOf(UserFacingError);
            expect(poisoned).toBe(true);
            continue;
          }
          for (const attempt of started) if (attempt.key === key) recorded.delete(attempt.id);
        }
        // Invariant: every hash the model recorded is exactly the one the journal holds.
        if (!poisoned) {
          const records = readAttempts(storage);
          for (const [id, hash] of recorded) {
            const record = records.find((a) => a.id === id);
            if (record !== undefined) expect(record.hash).toBe(hash);
          }
          for (const record of records) if (record.status === 'submitted') expect(recorded.get(record.id)).toBe(record.hash);
        }
      }
    }), { seed: 691692, numRuns: 150 });
  });

  it('admits exactly one of many concurrent same-action begins through the locked durable journal (stress)', async () => {
    installTestLocks();
    localStorage.clear();
    const key = KEYS[3]!;
    const results = await Promise.allSettled(Array.from({ length: 40 }, (_, i) =>
      withAttemptJournal((storage) => beginAttempt({ key, chainId: 1, account: ACCOUNTS[i % 2]!, kind: 'payment' }, storage))));
    const won = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(refused).toHaveLength(39);
    for (const r of refused) expect(messageKey(r.reason)).toBe(DUPLICATE_ATTEMPT_MESSAGE);
    expect(readAttempts().filter((a) => a.key === key)).toHaveLength(1);
  });

  it('refuses malformed or mutated stored journals with a typed error instead of reading them as empty', () => {
    const base = memory();
    const a = beginAttempt({ key: KEYS[0]!, chainId: 1, account: ACCOUNTS[0]!, kind: 'payment' }, base);
    finishAttempt(a, HASHES[0]!, base);
    beginAttempt({ key: KEYS[1]!, chainId: 1, account: ACCOUNTS[1]!, kind: 'approval' }, base);
    const valid = base.raw()!;
    fc.assert(fc.property(fc.nat(valid.length - 1), fc.string({ minLength: 0, maxLength: 3 }), fc.nat(3), (at, insert, drop) => {
      const mutated = valid.slice(0, at) + insert + valid.slice(Math.min(valid.length, at + drop));
      const storage: AttemptStorage = { getItem: (k) => (k === ATTEMPT_JOURNAL_KEY ? mutated : null), setItem: () => { throw new Error('read-only'); } };
      let records: readonly WalletAttempt[] | undefined;
      try { records = readAttempts(storage); } catch (e) {
        expect(e).toBeInstanceOf(UserFacingError);
        return;
      }
      // A mutation that still parses must remain a well-formed journal; it can never silently lose the duplicate guard.
      expect(Array.isArray(records)).toBe(true);
      if (mutated === valid) expect(records.map((r) => r.key)).toEqual([KEYS[0], KEYS[1]]);
    }), { seed: 287695, numRuns: 400 });
  });
});
