import type { Address, Hex } from '@ghostpay/chain-adapters';
import { UserFacingError } from './errors';
import type { RelayedOrderRef, SweepLock, SweepLockStatus } from './sweep';

/*
 * Tab-scoped persistence for sweep signing locks (GP-SWEEP-OUTCOME-01 follow-up). Same storage contract as the wallet
 * duplicate-attempt journal: sessionStorage, so the lock survives a reload of this tab but is not shared with other
 * tabs. Only what the lock needs is stored (chain, stealth owner, nonce, expected hash, relayed order nonce/deadline/
 * contract, status): never key material, destination or amount.
 *
 * Fail closed: an unreadable, oversized or malformed journal disarms signing until the user resolves it; it is never
 * silently treated as "no pending attempt". Unresolved locks are never evicted.
 */
export const SWEEP_JOURNAL_KEY = 'ghostpay.sweep-attempts.v1';
export const MAX_SWEEP_ATTEMPTS = 64;
const MAX_BYTES = 32_000;
/** Valid JSON that is not a journal: written after a failed update so a reload cannot read an older, armed state. */
const TOMBSTONE = '"unavailable"';
const FIELDS = ['chainId', 'owner', 'nonce', 'expectedHash', 'order', 'status'];
const ORDER_FIELDS = ['relayer', 'nonce', 'deadline'];
const STATUSES: readonly string[] = ['submitted', 'unknown-after-handoff', 'included', 'reverted', 'expired', 'refused', 'replaced'];

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

interface StoredOrder { readonly relayer: string; readonly nonce: string; readonly deadline: number }

function decodeOrder(v: unknown): RelayedOrderRef | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).some((k) => !ORDER_FIELDS.includes(k))) return undefined;
  const { relayer, nonce, deadline } = o;
  if (!isAddress(relayer)) return undefined;
  // uint256 nonce as a canonical decimal string.
  if (typeof nonce !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(nonce) || BigInt(nonce) >= 2n ** 256n) return undefined;
  if (typeof deadline !== 'number' || !Number.isSafeInteger(deadline) || deadline <= 0) return undefined;
  return { relayer, nonce: BigInt(nonce), deadline };
}

function decode(v: unknown): SweepLock | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const a = v as Record<string, unknown>;
  if (Object.keys(a).some((k) => !FIELDS.includes(k))) return undefined;
  const { chainId, owner, nonce, expectedHash, status } = a;
  if (typeof chainId !== 'number' || !Number.isSafeInteger(chainId) || chainId <= 0) return undefined;
  if (!isAddress(owner)) return undefined;
  if (nonce !== undefined && (typeof nonce !== 'number' || !Number.isSafeInteger(nonce) || nonce < 0)) return undefined;
  if (expectedHash !== undefined && (typeof expectedHash !== 'string' || !/^0x[0-9a-f]{64}$/.test(expectedHash))) return undefined;
  if (typeof status !== 'string' || !STATUSES.includes(status)) return undefined;
  const order = a['order'] === undefined ? undefined : decodeOrder(a['order']);
  if (a['order'] !== undefined && order === undefined) return undefined;
  // A lock must be resolvable: by the exact transaction hash (direct) or by the order's nonce and deadline (relayed).
  if (expectedHash === undefined && order === undefined) return undefined;
  return {
    chainId,
    owner,
    status: status as SweepLockStatus,
    ...(nonce === undefined ? {} : { nonce }),
    ...(expectedHash === undefined ? {} : { expectedHash: expectedHash as Hex }),
    ...(order === undefined ? {} : { order }),
  };
}

/** Projects any attempt onto the persisted lock fields (drops destination, asset and amount). */
export function toSweepLock(a: SweepLock): SweepLock {
  return {
    chainId: a.chainId,
    owner: a.owner,
    status: a.status,
    ...(a.nonce === undefined ? {} : { nonce: a.nonce }),
    ...(a.expectedHash === undefined ? {} : { expectedHash: a.expectedHash.toLowerCase() as Hex }),
    ...(a.order === undefined ? {} : { order: a.order }),
  };
}

function encode(a: SweepLock): Record<string, unknown> {
  const { order, ...rest } = toSweepLock(a);
  if (order === undefined) return rest;
  const stored: StoredOrder = { relayer: order.relayer, nonce: order.nonce.toString(), deadline: order.deadline };
  return { ...rest, order: stored };
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
  const stored = encode(lock);
  if (decode(stored) === undefined) throw new SweepJournalUnavailableError();
  const key = sweepAttemptKey(lock.chainId, lock.owner);
  const records = readSweepAttempts(storage).filter((a) => sweepAttemptKey(a.chainId, a.owner) !== key);
  if (records.length >= MAX_SWEEP_ATTEMPTS) {
    const idx = records.findIndex((a) => a.status !== 'submitted' && a.status !== 'unknown-after-handoff');
    if (idx < 0) throw new UserFacingError('Too many sweeps are still pending in this tab. Check their status before signing another.');
    records.splice(idx, 1);
  }
  const text = JSON.stringify([...records.map(encode), stored]);
  try {
    if (text.length > MAX_BYTES) throw new SweepJournalUnavailableError();
    storage.setItem(SWEEP_JOURNAL_KEY, text);
    if (storage.getItem(SWEEP_JOURNAL_KEY) !== text) throw new SweepJournalUnavailableError();
  } catch {
    try { storage.setItem(SWEEP_JOURNAL_KEY, TOMBSTONE); } catch { /* storage refused even the tombstone */ }
    throw new SweepJournalUnavailableError();
  }
}
