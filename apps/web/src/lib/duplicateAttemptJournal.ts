import { parseStrictJson } from '@ghostpay/invoice-schema';
import { keccak256, toBytes } from 'viem/utils';
import { UserFacingError } from './errors';

export const ATTEMPT_JOURNAL_KEY = 'ghostpay.wallet-attempts.v1';
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
export function browserAttemptLocks(): AttemptLockManager {
  let found: unknown;
  try { found = typeof navigator === 'undefined' ? undefined : navigator.locks; } catch { found = undefined; }
  const locks = found as LockManager | null | undefined;
  if (locks === undefined || locks === null || typeof locks.request !== 'function') {
    throw new UserFacingError({ key: 'error.duplicateAttemptJournal.locksUnavailable' });
  }
  const manager = locks;
  return { request: async <T>(name: string, callback: () => Promise<T>): Promise<T> => await manager.request(name, { mode: 'exclusive' }, callback) };
}

/** >0 only while a {@link withAttemptJournal} operation runs (synchronously) inside the lock callback. */
let lockDepth = 0;
function requiredStorage(storage?: AttemptStorage): AttemptStorage {
  if (storage !== undefined) return storage;
  // The default store is shared with other tabs: a read-modify-write is only safe inside the journal lock.
  if (lockDepth === 0) return fail();
  return browserAttemptStorage() ?? fail();
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
    if (current.status === 'unknown' && record.status === 'submitted') { merged[index] = record; continue; }
    return fail();
  }
  if (merged.length > MAX_ATTEMPTS) return fail();
  return merged;
}
/**
 * Every record of the journal. Without an explicit store, the durable store plus any not yet migrated legacy records of
 * this tab, so a pre-send check never misses one. Read-only: writes go through {@link withAttemptJournal}.
 */
export function readAttempts(storage?: AttemptStorage): readonly WalletAttempt[] {
  if (storage !== undefined) return readStore(storage);
  const durable = readStore(browserAttemptStorage() ?? fail());
  const legacy = legacyAttemptStorage();
  return legacy === undefined ? durable : mergeRecords(durable, readStore(legacy));
}
function write(records: readonly WalletAttempt[], storage: AttemptStorage): void {
  const text = JSON.stringify(records);
  if (records.length > MAX_ATTEMPTS || text.length > MAX_BYTES) return fail();
  try {
    storage.setItem(ATTEMPT_JOURNAL_KEY, text);
    if (storage.getItem(ATTEMPT_JOURNAL_KEY) !== text) return fail();
  } catch { return fail(); }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ATTEMPT_JOURNAL_EVENT));
}
function migrateLegacy(target: AttemptStorage, legacy: LegacyAttemptStorage): void {
  let raw: string | null;
  try { raw = legacy.getItem(ATTEMPT_JOURNAL_KEY); } catch { return fail(); }
  if (raw === null) return;
  const existing = readStore(target);
  const merged = mergeRecords(existing, parseRaw(raw));
  if (JSON.stringify(merged) !== JSON.stringify(existing)) write(merged, target);
  // Removed only after the merged copy was read back from the durable store; a failed removal stays fail-closed.
  try {
    legacy.removeItem(ATTEMPT_JOURNAL_KEY);
    if (legacy.getItem(ATTEMPT_JOURNAL_KEY) !== null) return fail();
  } catch { return fail(); }
}

/**
 * Runs `operation` synchronously inside the exclusive journal lock (after the one-time legacy migration for the default
 * store). Return a plain, non-thenable value: the lock is released as soon as it settles, so an operation must never
 * leave a wallet prompt inside it. Missing locks or storage refuse before `operation` runs.
 */
export function withAttemptJournal<T>(operation: (storage: AttemptStorage) => T, access: JournalAccess = {}): Promise<T> {
  try {
    const storage = access.storage ?? browserAttemptStorage() ?? fail();
    const legacy = access.storage !== undefined ? undefined : access.legacyStorage === undefined ? legacyAttemptStorage() : access.legacyStorage ?? undefined;
    const locks = access.lockManager ?? browserAttemptLocks();
    return locks.request(ATTEMPT_JOURNAL_LOCK, () => {
      lockDepth += 1;
      try {
        if (legacy !== undefined) migrateLegacy(storage, legacy);
        return Promise.resolve(operation(storage));
      } catch (e) {
        return Promise.reject(e instanceof Error ? e : new Error('journal operation failed'));
      } finally { lockDepth -= 1; }
    });
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error('journal operation failed'));
  }
}

/** No expiry or automatic eviction: a wallet may have broadcast even when its response was lost. */
export function beginAttempt(input: AttemptInput, storage?: AttemptStorage): WalletAttempt {
  const store = requiredStorage(storage);
  const records = readAttempts(store);
  if (records.some((a) => a.key === input.key)) throw new UserFacingError({ key: 'error.duplicateAttemptJournal.aPreviousWalletAttemptForThisActionAlreadyExistsIn' });
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
  const records = readAttempts(store);
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
  write(readAttempts(store).filter((a) => a.id !== key && a.key !== key), store);
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
export function recordNonce(hash: string, nonce: number, storage?: AttemptStorage): void {
  const store = requiredStorage(storage);
  if (typeof hash !== 'string' || !Number.isSafeInteger(nonce) || nonce < 0) return fail();
  const normalized = hash.toLowerCase();
  const records = readAttempts(store);
  if (!records.some((a) => a.hash === normalized && a.nonce !== nonce)) return;
  if (records.some((a) => a.hash === normalized && a.nonce !== undefined && a.nonce !== nonce)) return fail();
  const next = records.map((a) => a.hash === normalized ? { ...a, nonce } : a);
  if (!next.every(validAttempt)) return fail();
  write(next, store);
}
export function recordAttemptNonce(hash: string, nonce: number, access?: JournalAccess): Promise<void> {
  return withAttemptJournal((store) => { recordNonce(hash, nonce, store); }, access);
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
