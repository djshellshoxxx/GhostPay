// @vitest-environment jsdom
// Seeded model-based fuzzing of the wallet-attempt journal invariants that protect against duplicate payments and
// lost evidence: a recorded hash is never replaced, a present action key always refuses a new attempt (including one
// present only as an unsaved returned hash), an unsaved returned hash cannot be cleared, a late hash of a cleared
// attempt is kept again, and stored data that breaks the schema refuses (typed) instead of being read as an empty
// journal. Expected state comes from an independent model, never from a production read.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ATTEMPT_JOURNAL_KEY, DUPLICATE_ATTEMPT_MESSAGE, beginAttempt, clearAttempt, finishAttempt, finishReturnedAttempt, readAttempts,
  readReturnedAttempts, retryReturnedAttempts, withAttemptJournal, type AttemptInput, type AttemptStorage, type WalletAttempt,
} from './duplicateAttemptJournal';
import { UserFacingError } from './errors';
import { installTestLocks } from '../test/locks';

const hex64 = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;
const KEYS = [1, 2, 3, 4].map((n) => hex64(0xa000 + n));
const HASHES = [1, 2, 3].map((n) => hex64(0xb000 + n));
const ACCOUNTS = [`0x${'1'.repeat(40)}`, `0x${'2'.repeat(40)}`];

function memory(initial: string | null = null): AttemptStorage & { raw: () => string | null; faulted: boolean; writes: number } {
  let raw = initial;
  const store = {
    faulted: false,
    writes: 0,
    getItem: (): string | null => raw,
    setItem: (_key: string, value: string): void => {
      if (store.faulted) throw new Error('synthetic unavailable write');
      store.writes++;
      raw = value;
    },
    raw: (): string | null => raw,
  };
  return store;
}
function messageKey(error: unknown): string | undefined {
  return error instanceof UserFacingError ? error.translation?.key : undefined;
}
const UNAVAILABLE = 'error.duplicateAttemptJournal.theWalletAttemptJournalIsUnavailableOrInvalidNoNew';
const STILL_SAVING = 'error.duplicateAttemptJournal.returnedHashStillSaving';

type Op =
  | { readonly t: 'begin'; readonly key: number; readonly account: number }
  | { readonly t: 'finish'; readonly attempt: number; readonly hash: number | undefined }
  | { readonly t: 'returned'; readonly attempt: number; readonly hash: number | undefined }
  | { readonly t: 'clear'; readonly key: number }
  | { readonly t: 'clearId'; readonly attempt: number }
  | { readonly t: 'fault'; readonly on: boolean }
  | { readonly t: 'retry' };
// Mostly the attempt's own wallet hash (index `undefined`); sometimes a shared, conflicting one.
const hashChoice = fc.oneof({ weight: 6, arbitrary: fc.constant(undefined) }, { weight: 1, arbitrary: fc.nat(HASHES.length - 1) });
const op: fc.Arbitrary<Op> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ t: fc.constant('begin' as const), key: fc.nat(KEYS.length - 1), account: fc.nat(ACCOUNTS.length - 1) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('finish' as const), attempt: fc.nat(7), hash: hashChoice }) },
  { weight: 3, arbitrary: fc.record({ t: fc.constant('returned' as const), attempt: fc.nat(7), hash: hashChoice }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('clear' as const), key: fc.nat(KEYS.length - 1) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('clearId' as const), attempt: fc.nat(7) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('fault' as const), on: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('retry' as const) }) },
);

interface ModelRecord { readonly id: string; readonly key: string; readonly hash?: string }
interface Retained { readonly id: string; readonly key: string; readonly hash: string }
type Outcome = 'ok' | 'duplicate' | 'saving' | 'refused';
/**
 * Reference model of the journal, kept from the operations alone: it never consults a production read, so a production
 * read that drops or invents a record disagrees with it. `durable` is what the stable store holds; `unsaved` is every
 * returned hash retained in memory until a complete durable write, in retention order. A record leaves the model only
 * through a successful explicit clear; a late finish of such an attempt puts it back (documented resurrection).
 */
class JournalModel {
  readonly durable = new Map<string, ModelRecord>();
  private readonly cleared = new Set<string>();
  unsaved: Retained[] = [];
  faulted = false;
  lateFinishes = 0;
  lateFinishesBesideNewerAttempt = 0;
  /** The journal every read and write sees: durable records plus retained hashes; undefined when they conflict. */
  view(): Map<string, ModelRecord> | undefined {
    const merged = new Map(this.durable);
    for (const u of this.unsaved) {
      const current = merged.get(u.id);
      if (current?.hash !== undefined && current.hash !== u.hash) return undefined;
      merged.set(u.id, { id: u.id, key: u.key, hash: u.hash });
    }
    return merged;
  }
  private replaceDurable(records: Iterable<ModelRecord>): void {
    const next = [...records];
    this.durable.clear();
    for (const r of next) this.durable.set(r.id, r);
  }
  begin(key: string): Outcome {
    const view = this.view();
    if (view === undefined) return 'refused';
    if ([...view.values()].some((r) => r.key === key)) return 'duplicate';
    return this.faulted ? 'refused' : 'ok';
  }
  /** A successful begin rewrites the merged journal, so retained hashes become durable too. */
  began(id: string, key: string): void { this.replaceDurable([...this.view()!.values(), { id, key }]); }
  /** A submission is checked against the durable record only; a recorded hash is never replaced. */
  finish(id: string, key: string, hash: string): Outcome {
    const previous = this.durable.get(id);
    if (previous?.hash !== undefined) return previous.hash === hash ? 'ok' : 'refused';
    if (this.faulted) return 'refused';
    if (previous === undefined) this.resurrect(id, key);
    this.durable.set(id, { id, key, hash });
    return 'ok';
  }
  /**
   * An explicit clear may remove a record while its wallet request is still pending; the late hash is then kept again,
   * beside any newer attempt for the same action. Only a cleared attempt may be absent from the durable record.
   */
  private resurrect(id: string, key: string): void {
    if (!this.cleared.delete(id)) throw new Error('model: an attempt that was never cleared left the durable record');
    this.lateFinishes++;
    if ([...this.durable.values()].some((r) => r.key === key)) this.lateFinishesBesideNewerAttempt++;
  }
  /** A returned hash is retained first and released only after its own durable write succeeds. */
  returned(id: string, key: string, hash: string): Outcome {
    if (!this.unsaved.some((u) => u.id === id && u.hash === hash)) this.unsaved.push({ id, key, hash });
    const outcome = this.finish(id, key, hash);
    if (outcome === 'ok') this.unsaved = this.unsaved.filter((u) => !(u.id === id && u.hash === hash));
    return outcome;
  }
  retry(): Outcome {
    let outcome: Outcome = 'ok';
    for (const u of [...this.unsaved]) {
      if (this.finish(u.id, u.key, u.hash) === 'ok') this.unsaved = this.unsaved.filter((v) => v !== u);
      else outcome = 'refused';
    }
    return outcome;
  }
  clear(target: string): Outcome {
    if (this.unsaved.some((u) => u.id === target || u.key === target)) return 'saving';
    const view = this.view();
    if (view === undefined || this.faulted) return 'refused';
    const matches = (r: ModelRecord): boolean => r.id === target || r.key === target;
    for (const r of view.values()) if (matches(r)) this.cleared.add(r.id);
    this.replaceDurable([...view.values()].filter((r) => !matches(r)));
    return 'ok';
  }
}
const expectedRows = (records: Iterable<ModelRecord>): unknown[] =>
  [...records].map((r) => ({ id: r.id, key: r.key, status: r.hash === undefined ? 'unknown' : 'submitted', hash: r.hash }))
    .sort((a, b) => a.id.localeCompare(b.id));
const actualRows = (records: readonly WalletAttempt[]): unknown[] =>
  records.map((r) => ({ id: r.id, key: r.key, status: r.status, hash: r.hash })).sort((a, b) => a.id.localeCompare(b.id));
const storedRecords = (storage: AttemptStorage): WalletAttempt[] => JSON.parse(storage.getItem(ATTEMPT_JOURNAL_KEY) ?? '[]') as WalletAttempt[];
async function outcome(run: () => unknown): Promise<Outcome> {
  try { await run(); } catch (e) {
    const key = messageKey(e);
    if (key === DUPLICATE_ATTEMPT_MESSAGE) return 'duplicate';
    if (key === STILL_SAVING) return 'saving';
    if (key === UNAVAILABLE) return 'refused';
    throw e;
  }
  return 'ok';
}

/** The journal operations under test; the sensitivity checks substitute deliberately broken ones. */
interface Journal {
  readonly begin: (input: AttemptInput, storage: AttemptStorage) => WalletAttempt;
  readonly finish: (attempt: WalletAttempt, hash: string, storage: AttemptStorage) => void;
  readonly returned: (attempt: WalletAttempt, hash: string, storage: AttemptStorage) => Promise<void>;
  readonly clear: (target: string, storage: AttemptStorage) => void;
  readonly retry: (storage: AttemptStorage) => Promise<void>;
  readonly read: (storage: AttemptStorage) => readonly WalletAttempt[];
}
const PRODUCTION: Journal = {
  begin: beginAttempt,
  finish: finishAttempt,
  returned: (attempt, hash, storage) => finishReturnedAttempt(attempt, hash, { storage }),
  clear: (target, storage) => { clearAttempt(target, true, storage); },
  retry: retryReturnedAttempts,
  read: readAttempts,
};

interface Reached {
  duplicateFromUnsavedOnly: number; stillSaving: number; conflictingEvidence: number; savedOnRetry: number;
  lateFinish: number; lateFinishBesideNewerAttempt: number;
}
const noneReached = (): Reached =>
  ({ duplicateFromUnsavedOnly: 0, stillSaving: 0, conflictingEvidence: 0, savedOnRetry: 0, lateFinish: 0, lateFinishBesideNewerAttempt: 0 });

/** Runs one operation sequence against a fresh store, comparing every outcome and the exact membership with the model. */
async function check(ops: readonly Op[], journal: Journal = PRODUCTION, reached: Reached = noneReached()): Promise<void> {
  const storage = memory();
  const model = new JournalModel();
  const started: WalletAttempt[] = [];
  const pick = (n: number): WalletAttempt | undefined => started[n % Math.max(started.length, 1)];
  for (const step of ops) {
    if (step.t === 'fault') {
      storage.faulted = step.on;
      model.faulted = step.on;
    } else if (step.t === 'begin') {
      const key = KEYS[step.key]!;
      const expected = model.begin(key);
      if (expected === 'duplicate' && ![...model.durable.values()].some((r) => r.key === key)) reached.duplicateFromUnsavedOnly++;
      let attempt: WalletAttempt | undefined;
      expect(await outcome(() => { attempt = journal.begin({ key, chainId: 1, account: ACCOUNTS[step.account]!, kind: 'payment' }, storage); })).toBe(expected);
      if (expected === 'ok') { started.push(attempt!); model.began(attempt!.id, key); }
    } else if (step.t === 'finish' || step.t === 'returned') {
      const attempt = pick(step.attempt);
      if (attempt === undefined) continue;
      const hash = step.hash === undefined ? hex64(0xc000 + started.indexOf(attempt)) : HASHES[step.hash]!;
      const expected = step.t === 'finish' ? model.finish(attempt.id, attempt.key, hash) : model.returned(attempt.id, attempt.key, hash);
      expect(await outcome(() => (step.t === 'finish' ? journal.finish(attempt, hash, storage) : journal.returned(attempt, hash, storage)))).toBe(expected);
    } else if (step.t === 'clear' || step.t === 'clearId') {
      const target = step.t === 'clear' ? KEYS[step.key]! : pick(step.attempt)?.id;
      if (target === undefined) continue;
      const expected = model.clear(target);
      if (expected === 'saving') reached.stillSaving++;
      expect(await outcome(() => { journal.clear(target, storage); })).toBe(expected);
    } else {
      const retained = model.unsaved.length;
      const expected = model.retry();
      if (model.unsaved.length < retained) reached.savedOnRetry++;
      expect(await outcome(() => journal.retry(storage))).toBe(expected);
      // A rejected retry may leave sibling writes queued behind the FIFO lock; queue behind them before comparing.
      await withAttemptJournal(() => undefined, { storage });
    }
    // The stable store, the retained evidence and the merged read each match the model exactly.
    expect(actualRows(storedRecords(storage))).toEqual(expectedRows(model.durable.values()));
    expect(readReturnedAttempts(storage).map((a) => [a.id, a.hash])).toEqual(model.unsaved.map((u) => [u.id, u.hash]));
    const view = model.view();
    if (view === undefined) {
      reached.conflictingEvidence++;
      expect(await outcome(() => journal.read(storage))).toBe('refused');
      for (const key of KEYS) expect(await outcome(() => journal.begin({ key, chainId: 1, account: ACCOUNTS[0]!, kind: 'payment' }, storage))).toBe('refused');
      // Conflicting retained evidence is permanent (see the deterministic case below), so every later step can only
      // refuse; end this run instead of spending the budget re-checking it.
      break;
    }
    expect(actualRows(journal.read(storage))).toEqual(expectedRows(view.values()));
  }
  reached.lateFinish += model.lateFinishes;
  reached.lateFinishBesideNewerAttempt += model.lateFinishesBesideNewerAttempt;
}

const begin = (key: number): Op => ({ t: 'begin', key, account: 0 });
const finish = (attempt: number): Op => ({ t: 'finish', attempt, hash: undefined });
const returned = (attempt: number, hash?: number): Op => ({ t: 'returned', attempt, hash });
const clear = (key: number): Op => ({ t: 'clear', key });
const fault = (on: boolean): Op => ({ t: 'fault', on });

describe('wallet attempt journal model fuzzing', () => {
  it('matches an independent model of recorded hashes, present keys and unsaved returned hashes', async () => {
    // Anti-vacuity: the fixed seed must reach each guarded situation, not only the happy path.
    const reached = noneReached();
    await fc.assert(
      fc.asyncProperty(fc.array(op, { minLength: 1, maxLength: 40, size: 'max' }), (ops) => check(ops, PRODUCTION, reached)),
      { seed: 691692, numRuns: 500 },
    );
    for (const [situation, count] of Object.entries(reached)) expect(count, situation).toBeGreaterThan(0);
  });

  it('keeps the late hash of a cleared attempt beside its replacement, which still blocks the action', async () => {
    for (const late of [finish(0), returned(0)]) {
      const reached = noneReached();
      await check([begin(0), clear(0), begin(0), late, begin(0)], PRODUCTION, reached);
      expect(reached).toMatchObject({ lateFinish: 1, lateFinishBesideNewerAttempt: 1 });
    }
  });

  it('keeps refusing after conflicting returned hashes: neither retry nor clear can drop either hash', async () => {
    const storage = memory();
    const first = beginAttempt({ key: KEYS[0]!, chainId: 1, account: ACCOUNTS[0]!, kind: 'payment' }, storage);
    storage.faulted = true;
    for (const hash of [HASHES[0]!, HASHES[1]!]) expect(await outcome(() => finishReturnedAttempt(first, hash, { storage }))).toBe('refused');
    storage.faulted = false;
    expect(await outcome(() => readAttempts(storage))).toBe('refused');
    expect(await outcome(() => retryReturnedAttempts(storage))).toBe('refused');
    await withAttemptJournal(() => undefined, { storage });
    expect(await outcome(() => readAttempts(storage))).toBe('refused');
    expect(await outcome(() => { clearAttempt(first.id, true, storage); })).toBe('saving');
    expect(await outcome(() => { clearAttempt(KEYS[1]!, true, storage); })).toBe('refused');
    expect(storedRecords(storage).map((a) => a.hash)).toEqual([HASHES[0]]);
    expect(readReturnedAttempts(storage).map((a) => a.hash)).toEqual([HASHES[1]]);
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
});

/** Test-only fault injection: rewrites the stored journal the way a defective operation would. */
function corrupt(storage: AttemptStorage, edit: (records: WalletAttempt[]) => readonly WalletAttempt[]): void {
  storage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify(edit(storedRecords(storage))));
}
const DEFECTS: readonly (readonly [string, readonly Op[], Journal])[] = [
  ['a begin that loses an unknown record', [begin(0), begin(1)], {
    ...PRODUCTION,
    begin: (input, storage) => {
      const attempt = beginAttempt(input, storage);
      corrupt(storage, (records) => records.filter((a) => a.id === attempt.id || a.status !== 'unknown'));
      return attempt;
    },
  }],
  ['a finish that loses another submitted record', [begin(0), finish(0), begin(1), finish(1)], {
    ...PRODUCTION,
    finish: (attempt, hash, storage) => {
      finishAttempt(attempt, hash, storage);
      corrupt(storage, (records) => records.filter((a) => a.id === attempt.id || a.status !== 'submitted'));
    },
  }],
  ['a begin that evicts the oldest record', [begin(0), finish(0), begin(1)], {
    ...PRODUCTION,
    begin: (input, storage) => {
      const attempt = beginAttempt(input, storage);
      corrupt(storage, (records) => (records.length > 1 ? records.slice(1) : records));
      return attempt;
    },
  }],
  ['a clear that evicts an unrelated record', [begin(0), begin(1), begin(2), clear(2)], {
    ...PRODUCTION,
    clear: (target, storage) => {
      clearAttempt(target, true, storage);
      corrupt(storage, (records) => records.slice(1));
    },
  }],
  ['a read that hides a stored record', [begin(0), begin(1)], { ...PRODUCTION, read: (storage) => readAttempts(storage).slice(1) }],
  ['a read that ignores unsaved returned hashes', [begin(0), fault(true), returned(0)], { ...PRODUCTION, read: storedRecords }],
  ['a begin that admits a second attempt for an unknown action', [begin(0), begin(0)], {
    ...PRODUCTION,
    begin: (input, storage) => {
      const hidden = storedRecords(storage).filter((a) => a.key === input.key && a.status === 'unknown');
      if (hidden.length > 0) corrupt(storage, (records) => records.filter((a) => !hidden.some((h) => h.id === a.id)));
      const attempt = beginAttempt(input, storage);
      if (hidden.length > 0) corrupt(storage, (records) => [...hidden, ...records]);
      return attempt;
    },
  }],
  ['a retry that reports success without saving', [begin(0), fault(true), returned(0), fault(false), { t: 'retry' }], {
    ...PRODUCTION,
    retry: () => Promise.resolve(),
  }],
];

describe('journal model sensitivity (deterministic, test-only defects)', () => {
  it.each(DEFECTS)('detects %s', async (_, ops, defective) => {
    await check(ops);
    await expect(check(ops, defective)).rejects.toMatchObject({ name: 'AssertionError' });
  });
});

/** A valid journal with every optional field in use. */
function sampleJournal(): WalletAttempt[] {
  const storage = memory();
  const paid = beginAttempt({ key: KEYS[0]!, chainId: 1, account: ACCOUNTS[0]!, kind: 'payment', txDigest: hex64(0xd001) }, storage);
  finishAttempt(paid, HASHES[0]!, storage);
  beginAttempt({ key: KEYS[1]!, chainId: 1, account: ACCOUNTS[1]!, kind: 'approval' }, storage);
  const registered = beginAttempt({ key: KEYS[2]!, chainId: 10, account: ACCOUNTS[0]!, kind: 'registry' }, storage);
  finishAttempt(registered, HASHES[1]!, storage);
  return storedRecords(storage).map((a) => (a.id === registered.id ? { ...a, nonce: 7, replacements: [HASHES[2]!] } : a));
}
const REQUIRED = ['id', 'key', 'chainId', 'account', 'kind', 'createdAt', 'status'] as const;
type Row = Record<string, unknown>;
/** Edits that each break exactly one schema rule, applied to record `i` of a valid journal. */
function schemaBreakers(rows: readonly Row[], i: number): (readonly [string, string])[] {
  const withRow = (change: (row: Row) => Row): string => JSON.stringify(rows.map((row, n) => (n === i ? change({ ...row }) : row)));
  const without = (field: string): string => withRow((row) => { delete row[field]; return row; });
  const set = (field: string, value: unknown): string => withRow((row) => ({ ...row, [field]: value }));
  const text = JSON.stringify(rows);
  const row = rows[i]!;
  return [
    ['an object root', JSON.stringify({ attempts: rows })],
    ['a truncated document', text.slice(0, -1)],
    ['trailing data', `${text}[]`],
    ['a duplicate JSON key', text.replace('"status":', '"status":"unknown","status":')],
    ['a duplicate id', JSON.stringify([...rows, row])],
    ['more records than the limit', JSON.stringify(Array.from({ length: 129 }, (_, n) => ({ ...row, id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` })))],
    ['more bytes than the limit', `${' '.repeat(100_000)}${text}`],
    ...REQUIRED.map((field) => [`a missing ${field}`, without(field)] as const),
    ['an unknown field', set('memo', 'x')],
    ['a short id', set('id', 'abc')],
    ['an uppercase key', set('key', String(row['key']).toUpperCase())],
    ['a zero chain id', set('chainId', 0)],
    ['a string chain id', set('chainId', '1')],
    ['a short account', set('account', '0x12')],
    ['an unlisted kind', set('kind', 'refund')],
    ['a negative creation time', set('createdAt', -1)],
    ['an unlisted status', set('status', 'confirmed')],
    ['a submitted record without a hash', withRow((r) => { delete r['hash']; return { ...r, status: 'submitted' }; })],
    ['an unknown record with a hash', withRow((r) => ({ ...r, status: 'unknown', hash: HASHES[0] }))],
    ['a malformed digest', set('txDigest', '0x1234')],
    ['replacements without a nonce', withRow((r) => { delete r['nonce']; return { ...r, status: 'submitted', hash: HASHES[0], replacements: [HASHES[2]] }; })],
  ];
}

interface Edit {
  readonly t: 'remove' | 'rekey' | 'unsubmit' | 'submit' | 'chain' | 'add' | 'reverse';
  readonly at: number;
  readonly pick: number;
}
const edit: fc.Arbitrary<Edit> = fc.record({
  t: fc.constantFrom<Edit['t']>('remove', 'rekey', 'unsubmit', 'submit', 'chain', 'add', 'reverse'),
  at: fc.nat(7),
  pick: fc.nat(KEYS.length - 1),
});
/** Applies a schema-preserving external edit, as another writer of the same storage could. */
function applyEdit(rows: readonly WalletAttempt[], e: Edit, step: number): WalletAttempt[] {
  if (e.t === 'reverse') return [...rows].reverse();
  if (e.t === 'add') {
    const added: WalletAttempt = {
      id: `11111111-1111-4111-8111-${String(step).padStart(12, '0')}`, key: KEYS[e.pick]!, chainId: 1,
      account: ACCOUNTS[0]!, kind: 'transaction', createdAt: 1, status: 'unknown',
    };
    return [...rows, added];
  }
  const i = e.at % Math.max(rows.length, 1);
  if (e.t === 'remove') return rows.filter((_, n) => n !== i);
  return rows.map((row, n) => {
    if (n !== i) return row;
    if (e.t === 'rekey') return { ...row, key: KEYS[e.pick]! };
    if (e.t === 'chain') return { ...row, chainId: e.pick + 1 };
    const { hash: _hash, nonce: _nonce, replacements: _replacements, ...rest } = row;
    return e.t === 'unsubmit' ? { ...rest, status: 'unknown' as const } : { ...rest, status: 'submitted' as const, hash: HASHES[e.pick % HASHES.length]! };
  });
}

describe('stored wallet attempt journal validation', () => {
  it('refuses schema-breaking stored journals with a typed error and never overwrites them', async () => {
    const rows = sampleJournal() as unknown as Row[];
    for (let i = 0; i < rows.length; i++) {
      for (const [broken, text] of schemaBreakers(rows, i)) {
        const storage = memory(text);
        const next = { key: KEYS[3]!, chainId: 1, account: ACCOUNTS[0]!, kind: 'payment' as const };
        expect(await outcome(() => readAttempts(storage)), `${broken} (record ${i}): read`).toBe('refused');
        expect(await outcome(() => beginAttempt(next, storage)), `${broken} (record ${i}): begin`).toBe('refused');
        expect(await outcome(() => { clearAttempt(KEYS[0]!, true, storage); }), `${broken} (record ${i}): clear`).toBe('refused');
        expect(storage.writes, `${broken} (record ${i}): no write`).toBe(0);
        expect(storage.raw()).toBe(text);
      }
    }
  });

  // The journal is local evidence, not authenticated storage: whatever schema-valid content is stored is believed,
  // including a removed or rolled-back record. This pins that boundary; it is not rollback or tamper protection.
  it('reads a schema-valid external edit exactly as written and guards the actions it contains', () => {
    const base = sampleJournal();
    expect(readAttempts(memory(JSON.stringify(base)))).toEqual(base);
    fc.assert(fc.property(fc.array(edit, { minLength: 1, maxLength: 6 }), (edits) => {
      const edited = edits.reduce(applyEdit, base);
      const text = JSON.stringify(edited);
      const read = readAttempts(memory(text));
      expect(read).toEqual(edited);
      for (const key of KEYS) {
        const input = { key, chainId: 1, account: ACCOUNTS[0]!, kind: 'payment' as const };
        const storage = memory(text);
        if (edited.some((a) => a.key === key)) {
          expect(() => beginAttempt(input, storage)).toThrow(UserFacingError);
          expect(storage.writes).toBe(0);
        } else {
          const added = beginAttempt(input, storage);
          expect(storedRecords(storage)).toEqual([...edited, added]);
        }
      }
    }), { seed: 287695, numRuns: 200 });
  });

  it('either refuses a randomly mutated journal or reads exactly the records it stores', () => {
    const valid = JSON.stringify(sampleJournal());
    const reached = { accepted: 0, refused: 0 };
    const insert = fc.oneof(fc.string({ minLength: 0, maxLength: 3 }), fc.constantFrom('0', '1', 'a', 'f', ' '));
    fc.assert(fc.property(fc.nat(valid.length - 1), insert, fc.nat(3), (at, text, drop) => {
      const mutated = valid.slice(0, at) + text + valid.slice(Math.min(valid.length, at + drop));
      let records: readonly WalletAttempt[];
      try { records = readAttempts(memory(mutated)); } catch (e) {
        expect(messageKey(e)).toBe(UNAVAILABLE);
        reached.refused++;
        return;
      }
      // Accepted content is the stored content: nothing dropped, added or rewritten.
      expect(records).toEqual(JSON.parse(mutated));
      reached.accepted++;
    }), { seed: 287695, numRuns: 600 });
    for (const [situation, count] of Object.entries(reached)) expect(count, situation).toBeGreaterThan(0);
  });
});
