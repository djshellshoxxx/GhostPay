import { parseStrictJson } from '@ghostpay/invoice-schema';
import { keccak256, toBytes } from 'viem/utils';
import { UserFacingError } from './errors';
import { updateJournalSnapshot } from './attemptJournalStorage';

export const ATTEMPT_JOURNAL_KEY = 'ghostpay.wallet-attempts.v1';
export const DUPLICATE_ATTEMPT_MESSAGE = 'error.duplicateAttemptJournal.aPreviousWalletAttemptForThisActionAlreadyExistsIn';
export const ATTEMPT_JOURNAL_EVENT = 'ghostpay:wallet-attempts';
/**
 * One exclusive Web Lock serializes every read-modify-write of the durable journal across this browser's tabs
 * (payments, approvals, registry and policy records share one key). Web Locks are not reentrant.
 */
export const ATTEMPT_JOURNAL_LOCK = 'ghostpay:durable-wallet-attempts:v1';
const MAX_ATTEMPTS = 128;
const MAX_BYTES = 100_000;
/** Bound on user-linked replacement hashes per record. */
export const MAX_REPLACEMENTS = 8;
/** Longest wait for the cross-tab journal lock before refusing a new wallet request. */
export const LOCK_WAIT_MS = 20_000;
const HASH = /^0x[0-9a-f]{64}$/;
export interface AttemptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
/** The pre-durable, tab-scoped store (sessionStorage) that is migrated once and then emptied. */
export interface LegacyAttemptStorage extends AttemptStorage {
  removeItem(key: string): void;
}
/** Subset of `navigator.locks`; injectable for tests. The callback's promise holds the lock until it settles. */
export interface AttemptLockManager {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}
export interface JournalAccess {
  /** Explicit store (tests, policy). Omitted: durable `localStorage`, after merging this tab's legacy records into it. */
  readonly storage?: AttemptStorage;
  /** Defaults to `navigator.locks`; missing locks refuse. */
  readonly lockManager?: AttemptLockManager;
  /** Only callers already holding the journal lock. */
  readonly lockHeld?: boolean;
  /**
   * Wait for `navigator.locks` without the {@link LOCK_WAIT_MS} limit. Only for recording a hash the wallet already
   * returned: that write must never be abandoned, however long another tab holds the lock.
   */
  readonly unboundedWait?: boolean;
  /** Legacy store to migrate when `storage` is omitted; defaults to `window.sessionStorage`, `null` skips migration. */
  readonly legacyStorage?: LegacyAttemptStorage | null;
}
export interface AttemptInput {
  readonly key: string;
  readonly chainId: number;
  readonly account: string;
  readonly kind: 'payment' | 'approval' | 'registry' | 'transaction';
  /** {@link attemptTxDigest} of the exact requested call; neither calldata nor amount is stored. */
  readonly txDigest?: string;
}
export interface WalletAttempt extends AttemptInput {
  readonly id: string;
  readonly createdAt: number;
  readonly status: 'unknown' | 'submitted';
  readonly hash?: string;
  /** Account nonce of the transaction observed on the user's RPC for `hash`; set once, never changed. */
  readonly nonce?: number;
  /** User-linked replacement hashes (speed-up or cancel), each verified on an RPC as same sender, nonce and chain. */
  readonly replacements?: readonly string[];
}
function fail(): never { throw new UserFacingError({ key: 'error.duplicateAttemptJournal.theWalletAttemptJournalIsUnavailableOrInvalidNoNew' }); }

/** keccak256 of canonical JSON `[chainId, from, to, data, value (decimal)]`: identifies the exact call without storing it. */
export function attemptTxDigest(chainId: number, from: string, to: string, data: string, value: bigint): string {
  return keccak256(toBytes(JSON.stringify([chainId, from.toLowerCase(), to.toLowerCase(), data.toLowerCase(), value.toString()])));
}

/** Durable journal store shared by this browser's tabs; `undefined` only outside a browser (no journal is kept there). */
export function browserAttemptStorage(): AttemptStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const store: unknown = window.localStorage;
    return store === null || store === undefined ? fail() : store as AttemptStorage;
  } catch { return fail(); }
}
function legacyAttemptStorage(): LegacyAttemptStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    // Typed non-null, but an embedding or a test can expose none: nothing to migrate then.
    const store: unknown = window.sessionStorage;
    return store === null || store === undefined ? undefined : store as LegacyAttemptStorage;
  } catch { return fail(); }
}

/** `navigator.locks` as an exclusive {@link AttemptLockManager}; refuses (typed) where the Web Locks API is missing. */
export function browserAttemptLocks(bounded = true): AttemptLockManager {
  let found: unknown;
  try { found = typeof navigator === 'undefined' ? undefined : navigator.locks; } catch { found = undefined; }
  const locks = found as LockManager | null | undefined;
  if (locks === undefined || locks === null || typeof locks.request !== 'function') {
    throw new UserFacingError({ key: 'error.duplicateAttemptJournal.locksUnavailable' });
  }
  const manager = locks;
  return {
    request: async <T>(name: string, callback: () => Promise<T>): Promise<T> => {
      // Another tab may hold the lock across a wallet prompt (policy actions). Waiting is safe because nothing has been
      // sent yet, but never indefinitely: refuse with the typed journal error instead (JRNL-L1).
      let signal: AbortSignal | undefined;
      if (bounded) { try { signal = AbortSignal.timeout(LOCK_WAIT_MS); } catch { signal = undefined; } }
      try {
        return await manager.request(name, signal === undefined ? { mode: 'exclusive' } : { mode: 'exclusive', signal }, callback);
      } catch (e) {
        if (signal?.aborted === true) throw new UserFacingError({ key: 'error.duplicateAttemptJournal.theWalletAttemptJournalIsUnavailableOrInvalidNoNew' });
        throw e;
      }
    },
  };
}

// Synchronous operation only. Restored before returning control to the browser.
let lockedStorage: AttemptStorage | undefined;
let stagedStorage: AttemptStorage | undefined;
function requiredStorage(storage?: AttemptStorage): AttemptStorage {
  return storage ?? lockedStorage ?? fail();
}

function validReplacements(v: unknown, hash: unknown): boolean {
  return Array.isArray(v) && v.length > 0 && v.length <= MAX_REPLACEMENTS && v.every((h) => typeof h === 'string' && HASH.test(h) && h !== hash) &&
    new Set(v).size === v.length;
}
const FIELDS = ['id', 'key', 'chainId', 'account', 'kind', 'createdAt', 'status', 'hash', 'txDigest', 'nonce', 'replacements'];
function validAttempt(v: unknown): v is WalletAttempt {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const a = v as Record<string, unknown>;
  if (Object.keys(a).some((key) => !FIELDS.includes(key))) return false;
  return typeof a['id'] === 'string' && /^[0-9a-f-]{36}$/.test(a['id']) && typeof a['key'] === 'string' && HASH.test(a['key']) &&
    Number.isSafeInteger(a['chainId']) && (a['chainId'] as number) > 0 &&
    typeof a['account'] === 'string' && /^0x[0-9a-f]{40}$/.test(a['account']) &&
    typeof a['kind'] === 'string' && ['payment', 'approval', 'registry', 'transaction'].includes(a['kind']) &&
    Number.isSafeInteger(a['createdAt']) && (a['createdAt'] as number) > 0 &&
    ((a['status'] === 'unknown' && a['hash'] === undefined) ||
      (a['status'] === 'submitted' && typeof a['hash'] === 'string' && HASH.test(a['hash']))) &&
    (a['txDigest'] === undefined || (typeof a['txDigest'] === 'string' && HASH.test(a['txDigest']))) &&
    // A nonce is only ever observed for a returned hash; replacements are verified against that nonce.
    (a['nonce'] === undefined || (a['status'] === 'submitted' && Number.isSafeInteger(a['nonce']) && (a['nonce'] as number) >= 0)) &&
    (a['replacements'] === undefined || (a['nonce'] !== undefined && validReplacements(a['replacements'], a['hash'])));
}
function parseRaw(raw: string | null): readonly WalletAttempt[] {
  if (raw === null) return [];
  // A non-conforming Storage can return anything; only a string is a journal (QA-3).
  if (typeof raw !== 'string') return fail();
  if (raw.length > MAX_BYTES || new TextEncoder().encode(raw).byteLength > MAX_BYTES) return fail();
  let data: unknown;
  try { data = parseStrictJson(raw); } catch { return fail(); }
  if (!Array.isArray(data) || data.length > MAX_ATTEMPTS || !data.every(validAttempt) || new Set(data.map((a) => a.id)).size !== data.length) return fail();
  return data;
}
function readStore(store: AttemptStorage): readonly WalletAttempt[] {
  let raw: string | null;
  try { raw = store.getItem(ATTEMPT_JOURNAL_KEY); } catch { return fail(); }
  return parseRaw(raw);
}
const sameAction = (a: WalletAttempt, b: WalletAttempt): boolean =>
  a.key === b.key && a.chainId === b.chainId && a.account === b.account && a.kind === b.kind && a.createdAt === b.createdAt;
/**
 * Merges legacy records by id. An existing record is never overwritten, except that an unknown record gains the hash the
 * same attempt returned elsewhere (a hash is never dropped). Conflicting hashes or identities refuse.
 */
function mergeRecords(existing: readonly WalletAttempt[], incoming: readonly WalletAttempt[]): readonly WalletAttempt[] {
  const merged = [...existing];
  for (const record of incoming) {
    const index = merged.findIndex((a) => a.id === record.id);
    const current = index < 0 ? undefined : merged[index];
    if (current === undefined) { merged.push(record); continue; }
    if (JSON.stringify(current) === JSON.stringify(record)) continue;
    if (!sameAction(current, record) || (current.txDigest !== undefined && record.txDigest !== undefined && current.txDigest !== record.txDigest)) return fail();
    if (current.status === 'submitted' && record.status === 'unknown') continue;
    if (current.status === 'submitted' && record.status === 'submitted' && current.hash === record.hash) {
      // Same submission seen by two stores: keep the union of what each observed. A different nonce is a conflict.
      if (current.nonce !== undefined && record.nonce !== undefined && current.nonce !== record.nonce) return fail();
      const nonce = current.nonce ?? record.nonce;
      const replacements = [...new Set([...(current.replacements ?? []), ...(record.replacements ?? [])])];
      const combined: WalletAttempt = {
        ...current,
        ...(nonce === undefined ? {} : { nonce }),
        ...(replacements.length === 0 ? {} : { replacements }),
      };
      if (!validAttempt(combined)) return fail();
      merged[index] = combined;
      continue;
    }
    if (current.status === 'unknown' && record.status === 'unknown') continue;
    if (current.status === 'unknown' && record.status === 'submitted') { merged[index] = record; continue; }
    return fail();
  }
  if (merged.length > MAX_ATTEMPTS) return fail();
  return merged;
}
interface ReturnedAttempt {
  readonly record: WalletAttempt;
  readonly retryAccess: JournalAccess;
  inFlight: Promise<void> | undefined;
}
// The stable backing store owns this fallback, never an ephemeral IndexedDB staging store or a route component.
// No expiry or lock cleanup: a returned hash remains evidence even after its originating view loses authority.
const returnedAttempts = new WeakMap<AttemptStorage, Map<string, ReturnedAttempt>>();
function notifyAttempts(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ATTEMPT_JOURNAL_EVENT));
}
// Closing the tab loses an unsaved returned hash. Ask before unload on every route, without revealing which account
// or transaction it belongs to: the browser shows only its generic leave-page prompt.
let unloadGuarded = false;
function guardUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = true;
}
function syncUnloadGuard(): void {
  if (typeof window === 'undefined') return;
  let pending: boolean;
  try {
    const store = browserAttemptStorage();
    pending = store !== undefined && (returnedAttempts.get(store)?.size ?? 0) > 0;
  } catch { pending = false; } // Without browser storage no browser-store outcome can be retained.
  if (pending === unloadGuarded) return;
  // Best effort: an embedding without event targets loses only the prompt, never the retained hash or its write.
  try {
    if (pending) window.addEventListener('beforeunload', guardUnload);
    else window.removeEventListener('beforeunload', guardUnload);
    unloadGuarded = pending;
  } catch { /* The in-page unsaved notice still states the open-tab limitation. */ }
}
/** Hashes awaiting a complete durable write; usable for owner-scoped recovery even when the durable read fails. */
export function readReturnedAttempts(storage?: AttemptStorage): readonly WalletAttempt[] {
  const store = storage ?? browserAttemptStorage();
  return store === undefined ? [] : [...(returnedAttempts.get(store)?.values() ?? [])].map((entry) => entry.record);
}
function persistReturnedAttempt(storage: AttemptStorage, key: string, entry: ReturnedAttempt, access: JournalAccess): Promise<void> {
  if (entry.inFlight !== undefined) return entry.inFlight;
  // Publish the in-flight promise before invoking a lock manager or notifying subscribers, including reentrant ones.
  const pending = Promise.resolve().then(async () => {
    let committed = false;
    await withAttemptJournal((store) => { finishAttempt(entry.record, entry.record.hash!, store); }, { ...access, unboundedWait: true }, () => { committed = true; });
    if (!committed) return fail();
    if (returnedAttempts.get(storage)?.get(key) === entry) returnedAttempts.get(storage)?.delete(key);
    syncUnloadGuard();
    notifyAttempts();
  }).finally(() => { entry.inFlight = undefined; });
  entry.inFlight = pending;
  return pending;
}
/**
 * Retain a returned outcome before attempting persistence. Resolve only after the entire lock/IndexedDB/mirror write,
 * not after a staging-store mutation. The wallet caller may stop waiting while this promise continues recording.
 */
export function finishReturnedAttempt(
  attempt: WalletAttempt, hash: string, access: JournalAccess = {}, storage = access.storage ?? browserAttemptStorage(),
): Promise<void> {
  if (storage === undefined || typeof hash !== 'string') return Promise.reject(new UserFacingError({ key: 'error.duplicateAttemptJournal.theWalletAttemptJournalIsUnavailableOrInvalidNoNew' }));
  const record: WalletAttempt = Object.freeze({ ...attempt, status: 'submitted', hash: hash.toLowerCase() });
  if (!validAttempt(record)) return Promise.reject(new UserFacingError({ key: 'error.duplicateAttemptJournal.theWalletAttemptJournalIsUnavailableOrInvalidNoNew' }));
  const entries = returnedAttempts.get(storage) ?? new Map<string, ReturnedAttempt>();
  returnedAttempts.set(storage, entries);
  // Preserve conflicting outcomes as well: merging them must refuse rather than silently overwrite either hash.
  const key = JSON.stringify([record.id, record.hash, record.key, record.chainId, record.account, record.kind, record.createdAt, record.txDigest]);
  const entry = entries.get(key) ?? {
    record,
    // A later retry is outside the caller's original lock, even if its initial write was already inside that lock.
    retryAccess: Object.freeze({ ...access, lockHeld: false, unboundedWait: true }),
    inFlight: undefined,
  };
  entries.set(key, entry);
  syncUnloadGuard();
  const pending = persistReturnedAttempt(storage, key, entry, access);
  notifyAttempts();
  return pending;
}
/** Retry existing returned outcomes through the same cross-tab merge path; never sends a wallet or RPC request. */
export async function retryReturnedAttempts(storage?: AttemptStorage): Promise<void> {
  const store = storage ?? browserAttemptStorage();
  if (store === undefined) return;
  // Settle every write before reporting: an early rejection would end the caller's retry while others still run.
  const results = await Promise.allSettled([...(returnedAttempts.get(store)?.entries() ?? [])].map(([key, entry]) =>
    persistReturnedAttempt(store, key, entry, entry.retryAccess)));
  const failed = results.find((result) => result.status === 'rejected');
  if (failed !== undefined) throw failed.reason;
}

/**
 * Every record of the journal. Without an explicit store, the durable store plus any not yet migrated legacy records of
 * this tab, so a pre-send check never misses one. Read-only: writes go through {@link withAttemptJournal}.
 */
export function readAttempts(storage?: AttemptStorage): readonly WalletAttempt[] {
  if (storage !== undefined) return mergeRecords(readStore(storage), readReturnedAttempts(storage));
  const store = browserAttemptStorage() ?? fail();
  const durable = readStore(store);
  const legacy = legacyAttemptStorage();
  return mergeRecords(legacy === undefined ? durable : mergeRecords(durable, readStore(legacy)), readReturnedAttempts(store));
}
function storedRaw(storage: AttemptStorage): string | null {
  try { return storage.getItem(ATTEMPT_JOURNAL_KEY); } catch { return fail(); }
}

function writeRaw(text: string, storage: AttemptStorage): void {
  try {
    storage.setItem(ATTEMPT_JOURNAL_KEY, text);
    if (storedRaw(storage) !== text) return fail();
  } catch { return fail(); }
  if (storage !== stagedStorage && typeof window !== 'undefined') window.dispatchEvent(new Event(ATTEMPT_JOURNAL_EVENT));
}

function write(records: readonly WalletAttempt[], storage: AttemptStorage): void {
  const text = JSON.stringify(records);
  if (records.length > MAX_ATTEMPTS || text.length > MAX_BYTES) return fail();
  writeRaw(text, storage);
}

function runOperation<T>(operation: (storage: AttemptStorage) => T, storage: AttemptStorage): T {
  const previous = lockedStorage;
  lockedStorage = storage;
  try { return operation(storage); }
  finally { lockedStorage = previous; }
}

async function updateBrowserJournal<T>(
  operation: (storage: AttemptStorage) => T, storage: AttemptStorage, legacy: LegacyAttemptStorage | undefined,
): Promise<{ readonly result: T; readonly mirror: () => void }> {
  const local = storedRaw(storage);
  const old = legacy === undefined ? null : storedRaw(legacy);
  parseRaw(local); // Malformed or unreadable browser storage still prevents a send.
  let updated: Awaited<ReturnType<typeof updateJournalSnapshot<T>>>;
  try {
    updated = await updateJournalSnapshot((saved) => {
      if (saved !== undefined && typeof saved !== 'string') return fail();
      // Union, never replacement: a record only this browser's localStorage mirror holds (written by an older build or
      // committed before this snapshot existed) still blocks its action and keeps its hash (QA-4). A record cleared in
      // another process within the mirror's propagation delay can reappear; that only blocks a send until cleared again.
      const committed = saved === undefined ? parseRaw(local) : mergeRecords(parseRaw(saved), parseRaw(local));
      let raw = JSON.stringify(mergeRecords(mergeRecords(committed, parseRaw(old)), readReturnedAttempts(storage)));
      const staged: AttemptStorage = {
        getItem: () => raw,
        setItem: (_key, value) => { raw = value; },
      };
      stagedStorage = staged;
      try {
        const result = runOperation(operation, staged);
        parseRaw(raw);
        return { result, snapshot: raw };
      } finally { stagedStorage = undefined; }
    });
  } catch (error) {
    if (error instanceof UserFacingError) throw error;
    return fail();
  }
  return {
    result: updated.result,
    mirror: () => {
      if ((local ?? '[]') !== updated.snapshot) writeRaw(updated.snapshot, storage);
      if (legacy !== undefined && old !== null) {
        try {
          legacy.removeItem(ATTEMPT_JOURNAL_KEY);
          if (storedRaw(legacy) !== null) return fail();
        } catch { return fail(); }
      }
    },
  };
}

/** Run a synchronous mutation under the Web Lock; invoke the optional callback immediately after committing. */
export async function withAttemptJournal<T>(
  operation: (storage: AttemptStorage) => T, access: JournalAccess = {}, committed?: (result: T) => void,
): Promise<T> {
  const run = async (): Promise<T> => {
    if (access.storage !== undefined) {
      const result = runOperation(operation, access.storage);
      committed?.(result);
      return result;
    }
    const storage = browserAttemptStorage() ?? fail();
    const legacy = access.legacyStorage === undefined ? legacyAttemptStorage() : access.legacyStorage ?? undefined;
    if (legacy !== undefined && storedRaw(legacy) !== null) {
      // Commit and remove legacy data even if the new operation then sees and refuses a duplicate.
      const migrated = await updateBrowserJournal(() => undefined, storage, legacy);
      migrated.mirror();
    }
    const { result, mirror } = await updateBrowserJournal(operation, storage, undefined);
    mirror();
    committed?.(result);
    return result;
  };
  return access.lockHeld === true ? run() : (access.lockManager ?? browserAttemptLocks(access.unboundedWait !== true)).request(ATTEMPT_JOURNAL_LOCK, run);
}

/** Reconcile this tab with the committed journal and migrate any session-scoped records. */
export async function migrateBrowserAttempts(): Promise<void> {
  if (readAttempts().length === 0 && typeof indexedDB === 'undefined') return;
  await withAttemptJournal(() => undefined);
}

/** No expiry or automatic eviction: a wallet may have broadcast even when its response was lost. */
export function beginAttempt(input: AttemptInput, storage?: AttemptStorage): WalletAttempt {
  const store = requiredStorage(storage);
  const records = readAttempts(store);
  if (records.some((a) => a.key === input.key)) throw new UserFacingError({ key: DUPLICATE_ATTEMPT_MESSAGE });
  if (records.length >= MAX_ATTEMPTS) throw new UserFacingError({ key: 'error.duplicateAttemptJournal.theWalletAttemptJournalReachedItsSafetyLimitReviewAnd' });
  const attempt: WalletAttempt = { ...input, id: crypto.randomUUID(), account: input.account.toLowerCase(), createdAt: Date.now(), status: 'unknown' };
  if (!validAttempt(attempt)) return fail();
  write([...records, attempt], store);
  return attempt;
}
/** Called immediately on the returned hash, even when the initiating page/session has changed. */
export function finishAttempt(attempt: WalletAttempt, hash: string, storage?: AttemptStorage): void {
  const store = requiredStorage(storage);
  if (typeof hash !== 'string') return fail();
  const next = { ...attempt, status: 'submitted' as const, hash: hash.toLowerCase() };
  if (!validAttempt(next)) return fail();
  // An in-memory outcome is evidence, not proof of a successful write to this persistent/staged store.
  const records = readStore(store);
  const previous = records.find((a) => a.id === attempt.id);
  if (previous !== undefined) {
    // A returned wallet hash must never overwrite the hash of a recorded submission.
    // Refuse an id collision with another action rather than silently replacing it.
    if (!sameAction(previous, attempt)) return fail();
    if (previous.status === 'submitted') {
      if (previous.hash !== next.hash) return fail();
      return; // The same provider result has already been recorded.
    }
  }
  // An explicit clear may remove the original record while the wallet request is
  // still pending. In that case preserve its late hash alongside any replacement.
  write([...records.filter((a) => a.id !== attempt.id), next], store);
}
/** Clearing is only bookkeeping; it cannot cancel or roll back a wallet request or transaction. */
export function clearAttempt(key: string, confirmed: boolean, storage?: AttemptStorage): void {
  if (!confirmed) throw new UserFacingError({ key: 'error.duplicateAttemptJournal.explicitConfirmationIsRequiredToClearAWalletAttempt' });
  const store = requiredStorage(storage);
  // A returned hash still awaiting its durable write lives only in memory, keyed by the stable store; every later read and
  // write merges it back. Clearing it would report success and then restore the record, so refuse until it is saved.
  const stable = store === stagedStorage ? browserAttemptStorage() : store;
  if (stable !== undefined && readReturnedAttempts(stable).some((a) => a.id === key || a.key === key)) {
    throw new UserFacingError({ key: 'error.duplicateAttemptJournal.returnedHashStillSaving' });
  }
  write(readAttempts(store).filter((a) => a.id !== key && a.key !== key), store);
}
/**
 * Removes the `unknown` record of an attempt whose wallet request was never started (its final authority check failed
 * after the record was committed). Only that exact record, only while it is still `unknown`; anything else is kept.
 */
export function removeUnsentAttempt(attempt: WalletAttempt, storage?: AttemptStorage): void {
  const store = requiredStorage(storage);
  const records = readAttempts(store);
  const current = records.find((a) => a.id === attempt.id);
  if (current === undefined || current.status !== 'unknown' || !sameAction(current, attempt)) return;
  write(records.filter((a) => a !== current), store);
}
/** {@link clearAttempt} on the durable store, inside the journal lock. */
export function clearAttemptLocked(key: string, confirmed: boolean, access?: JournalAccess): Promise<void> {
  if (!confirmed) return Promise.reject(new UserFacingError({ key: 'error.duplicateAttemptJournal.explicitConfirmationIsRequiredToClearAWalletAttempt' }));
  return withAttemptJournal((store) => { clearAttempt(key, true, store); }, access);
}
/**
 * Saves the account nonce observed on an RPC for a returned hash. Set once: a different nonce for the same hash refuses.
 * A hash with no record (cleared meanwhile) is ignored.
 */
function recordNonce(hash: string, nonce: number, matches: (attempt: WalletAttempt) => boolean, storage: AttemptStorage): void {
  const store = requiredStorage(storage);
  if (typeof hash !== 'string' || !Number.isSafeInteger(nonce) || nonce < 0) return fail();
  const normalized = hash.toLowerCase();
  const records = readAttempts(store);
  const matching = records.filter((a) => a.hash === normalized && matches(a));
  if (!matching.some((a) => a.nonce !== nonce)) return;
  if (matching.length !== 1 || matching[0]?.nonce !== undefined) return fail();
  const next = records.map((a) => a === matching[0] ? { ...a, nonce } : a);
  if (!next.every(validAttempt)) return fail();
  write(next, store);
}
export function recordAttemptNonce(
  hash: string,
  nonce: number,
  identity: Pick<WalletAttempt, 'chainId' | 'account' | 'key' | 'txDigest'>,
  access?: JournalAccess,
): Promise<void> {
  return withAttemptJournal((store) => {
    recordNonce(hash, nonce, (a) => a.chainId === identity.chainId && a.account === identity.account &&
      a.key === identity.key && a.txDigest === identity.txDigest, store);
  }, access);
}
/**
 * Appends an already verified replacement hash to a submitted record whose nonce is `nonce` (saving that nonce if it was
 * not yet recorded). Refuses a cleared, unsubmitted or changed record, a different nonce, a duplicate and the bound.
 */
export function addReplacement(id: string, originalHash: string, nonce: number, replacement: string, storage?: AttemptStorage): WalletAttempt {
  const store = requiredStorage(storage);
  const records = readAttempts(store);
  const index = records.findIndex((a) => a.id === id);
  const current = index < 0 ? undefined : records[index];
  const hash = replacement.toLowerCase();
  if (current?.hash === undefined || current.hash !== originalHash.toLowerCase() || (current.nonce !== undefined && current.nonce !== nonce)) {
    throw new UserFacingError({ key: 'error.attemptStatus.replacementRecordChanged' });
  }
  const existing = current.replacements ?? [];
  if (existing.includes(hash) || hash === current.hash) return current;
  if (existing.length >= MAX_REPLACEMENTS) throw new UserFacingError({ key: 'error.attemptStatus.replacementLimit' });
  const next: WalletAttempt = { ...current, nonce, replacements: [...existing, hash] };
  if (!validAttempt(next)) return fail();
  write(records.map((a, i) => i === index ? next : a), store);
  return next;
}

/** Calls `listener` on this tab's journal writes and on other tabs' `storage` events for the journal key. */
export function subscribeAttempts(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (e: StorageEvent): void => { if (e.key === null || e.key === ATTEMPT_JOURNAL_KEY) listener(); };
  window.addEventListener(ATTEMPT_JOURNAL_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(ATTEMPT_JOURNAL_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

// i18n-use: error.duplicateAttemptJournal.theWalletAttemptJournalIsUnavailableOrInvalidNoNew error.duplicateAttemptJournal.aPreviousWalletAttemptForThisActionAlreadyExistsIn error.duplicateAttemptJournal.theWalletAttemptJournalReachedItsSafetyLimitReviewAnd error.duplicateAttemptJournal.explicitConfirmationIsRequiredToClearAWalletAttempt error.duplicateAttemptJournal.locksUnavailable error.attemptStatus.replacementRecordChanged error.attemptStatus.replacementLimit
