import type { Address, Hex } from '@ghostpay/chain-adapters';
import { UserFacingError } from './errors';
import type { SweepLock } from './sweep';

/*
 * Tab-scoped persistence for sweep signing locks (GP-SWEEP-OUTCOME-01 follow-up). Same storage contract as the wallet
 * duplicate-attempt journal: sessionStorage, so the lock survives a reload of this tab but is not shared with other
 * tabs. Only what the lock needs is stored (chain, stealth owner, nonce, expected hash, status): never key material,
 * destination or amount.
 *
 * Fail closed: an unreadable, oversized or malformed journal disarms signing until the user resolves it; it is never
 * silently treated as "no pending attempt". Unresolved locks are never evicted.
 */
export const SWEEP_JOURNAL_KEY = 'ghostpay.sweep-attempts.v1';
export const MAX_SWEEP_ATTEMPTS = 64;
const MAX_BYTES = 32_000;
/** Valid JSON that is not a journal: written after a failed update so a reload cannot read an older, armed state. */
const TOMBSTONE = '"unavailable"';
const FIELDS = ['chainId', 'owner', 'nonce', 'expectedHash', 'status'];
const STATUSES: readonly string[] = ['submitted', 'unknown-after-handoff', 'included', 'reverted'];

export interface SweepJournalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class SweepJournalUnavailableError extends UserFacingError {
  public constructor() {
    super('The sweep attempt record in this tab is unavailable or invalid. Signing stays disarmed; a sweep may still be pending. Check the address on a block explorer before trying again in a new tab.');
    this.name = 'SweepJournalUnavailableError';
  }
}

export function browserSweepStorage(): SweepJournalStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try { return window.sessionStorage; } catch { throw new SweepJournalUnavailableError(); }
}

export const sweepAttemptKey = (chainId: number, owner: string): string => `${String(chainId)}:${owner.toLowerCase()}`;

const isAddress = (v: unknown): v is Address => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);

function decode(v: unknown): SweepLock | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const a = v as Record<string, unknown>;
  if (Object.keys(a).some((k) => !FIELDS.includes(k))) return undefined;
  const { chainId, owner, nonce, expectedHash, status } = a;
  if (typeof chainId !== 'number' || !Number.isSafeInteger(chainId) || chainId <= 0) return undefined;
  if (!isAddress(owner)) return undefined;
  if (nonce !== undefined && (typeof nonce !== 'number' || !Number.isSafeInteger(nonce) || nonce < 0)) return undefined;
  if (typeof expectedHash !== 'string' || !/^0x[0-9a-f]{64}$/.test(expectedHash)) return undefined;
  if (typeof status !== 'string' || !STATUSES.includes(status)) return undefined;
  const base = { chainId, owner, expectedHash: expectedHash as Hex, status: status as SweepLock['status'] };
  return nonce === undefined ? base : { ...base, nonce };
}

/** Projects any attempt onto the persisted lock fields (drops destination, asset and amount). */
export function toSweepLock(a: SweepLock): SweepLock {
  const base = { chainId: a.chainId, owner: a.owner, expectedHash: a.expectedHash.toLowerCase() as Hex, status: a.status };
  return a.nonce === undefined ? base : { ...base, nonce: a.nonce };
}

/** All recorded locks, oldest first. Throws {@link SweepJournalUnavailableError} on any storage or format problem. */
export function readSweepAttempts(storage: SweepJournalStorage): readonly SweepLock[] {
  let raw: string | null;
  try { raw = storage.getItem(SWEEP_JOURNAL_KEY); } catch { throw new SweepJournalUnavailableError(); }
  if (raw === null) return [];
  if (raw.length > MAX_BYTES) throw new SweepJournalUnavailableError();
  let data: unknown;
  try { data = JSON.parse(raw) as unknown; } catch { throw new SweepJournalUnavailableError(); }
  if (!Array.isArray(data) || data.length > MAX_SWEEP_ATTEMPTS) throw new SweepJournalUnavailableError();
  const out: SweepLock[] = [];
  const keys = new Set<string>();
  for (const item of data) {
    const a = decode(item);
    if (a === undefined) throw new SweepJournalUnavailableError();
    const k = sweepAttemptKey(a.chainId, a.owner);
    if (keys.has(k)) throw new SweepJournalUnavailableError();
    keys.add(k);
    out.push(a);
  }
  return out;
}

/**
 * Replaces the lock for the attempt's (chain, owner) and verifies the write by read-back. When the journal is full,
 * the oldest resolved lock is dropped; if every lock is unresolved the write is refused with a user-facing error.
 * On a storage failure a tombstone is attempted so that a reload reads "unavailable" instead of an older armed state.
 */
export function writeSweepAttempt(attempt: SweepLock, storage: SweepJournalStorage): void {
  const lock = toSweepLock(attempt);
  if (decode(lock) === undefined) throw new SweepJournalUnavailableError();
  const key = sweepAttemptKey(lock.chainId, lock.owner);
  const records = readSweepAttempts(storage).filter((a) => sweepAttemptKey(a.chainId, a.owner) !== key);
  if (records.length >= MAX_SWEEP_ATTEMPTS) {
    const idx = records.findIndex((a) => a.status === 'included' || a.status === 'reverted');
    if (idx < 0) throw new UserFacingError('Too many sweeps are still pending in this tab. Check their status before signing another.');
    records.splice(idx, 1);
  }
  const text = JSON.stringify([...records, lock]);
  try {
    if (text.length > MAX_BYTES) throw new SweepJournalUnavailableError();
    storage.setItem(SWEEP_JOURNAL_KEY, text);
    if (storage.getItem(SWEEP_JOURNAL_KEY) !== text) throw new SweepJournalUnavailableError();
  } catch {
    try { storage.setItem(SWEEP_JOURNAL_KEY, TOMBSTONE); } catch { /* storage refused even the tombstone */ }
    throw new SweepJournalUnavailableError();
  }
}
