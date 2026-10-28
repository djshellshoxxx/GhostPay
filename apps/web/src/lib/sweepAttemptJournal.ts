import type { Address, Hex } from '@ghostpay/chain-adapters';
import { UserFacingError } from './errors';
import type { DirectSweepAttempt } from './sweep';

/*
 * Tab-scoped persistence for sweep attempts (GP-SWEEP-OUTCOME-01 follow-up). Same storage contract as the wallet
 * duplicate-attempt journal: sessionStorage, so the lock survives a reload of this tab but is not written to
 * long-lived storage or shared with other tabs. Only the public descriptor is stored, never key material.
 *
 * Fail closed: an unreadable, oversized or malformed journal disarms signing until the user resolves it; it is never
 * silently treated as "no pending attempt". Unresolved attempts are never evicted.
 */
export const SWEEP_JOURNAL_KEY = 'ghostpay.sweep-attempts.v1';
export const MAX_SWEEP_ATTEMPTS = 64;
const MAX_BYTES = 64_000;
const FIELDS = ['chainId', 'owner', 'nonce', 'destination', 'asset', 'amount', 'expectedHash', 'status'];
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

interface Stored {
  readonly chainId: number;
  readonly owner: string;
  readonly nonce?: number;
  readonly destination: string;
  readonly asset: string;
  readonly amount: string;
  readonly expectedHash: string;
  readonly status: string;
}

function decode(v: unknown): DirectSweepAttempt | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const a = v as Record<string, unknown>;
  if (Object.keys(a).some((k) => !FIELDS.includes(k))) return undefined;
  if (!Number.isSafeInteger(a['chainId']) || (a['chainId'] as number) <= 0) return undefined;
  if (!isAddress(a['owner']) || !isAddress(a['destination'])) return undefined;
  const rawAsset = a['asset'];
  let asset: Address | 'native';
  if (rawAsset === 'native') asset = 'native';
  else if (isAddress(rawAsset)) asset = rawAsset;
  else return undefined;
  if (a['nonce'] !== undefined && (!Number.isSafeInteger(a['nonce']) || (a['nonce'] as number) < 0)) return undefined;
  if (typeof a['amount'] !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(a['amount'])) return undefined;
  if (typeof a['expectedHash'] !== 'string' || !/^0x[0-9a-f]{64}$/.test(a['expectedHash'])) return undefined;
  if (typeof a['status'] !== 'string' || !STATUSES.includes(a['status'])) return undefined;
  const base = {
    chainId: a['chainId'] as number,
    owner: a['owner'],
    destination: a['destination'],
    asset,
    amount: BigInt(a['amount']),
    expectedHash: a['expectedHash'] as Hex,
    status: a['status'] as DirectSweepAttempt['status'],
  };
  return a['nonce'] === undefined ? base : { ...base, nonce: a['nonce'] as number };
}

function encode(a: DirectSweepAttempt): Stored {
  const s: Stored = {
    chainId: a.chainId, owner: a.owner, destination: a.destination, asset: a.asset,
    amount: a.amount.toString(), expectedHash: a.expectedHash.toLowerCase(), status: a.status,
  };
  return a.nonce === undefined ? s : { ...s, nonce: a.nonce };
}

/** All recorded attempts, oldest first. Throws {@link SweepJournalUnavailableError} on any storage or format problem. */
export function readSweepAttempts(storage: SweepJournalStorage): readonly DirectSweepAttempt[] {
  let raw: string | null;
  try { raw = storage.getItem(SWEEP_JOURNAL_KEY); } catch { throw new SweepJournalUnavailableError(); }
  if (raw === null) return [];
  if (raw.length > MAX_BYTES) throw new SweepJournalUnavailableError();
  let data: unknown;
  try { data = JSON.parse(raw) as unknown; } catch { throw new SweepJournalUnavailableError(); }
  if (!Array.isArray(data) || data.length > MAX_SWEEP_ATTEMPTS) throw new SweepJournalUnavailableError();
  const out: DirectSweepAttempt[] = [];
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
 * Replaces the record for the attempt's (chain, owner) and writes it back, verifying the write by read-back. When the
 * journal is full, the oldest resolved record is dropped; if every record is unresolved the write is refused.
 */
export function writeSweepAttempt(attempt: DirectSweepAttempt, storage: SweepJournalStorage): void {
  if (decode(encode(attempt)) === undefined) throw new SweepJournalUnavailableError();
  const key = sweepAttemptKey(attempt.chainId, attempt.owner);
  const records = readSweepAttempts(storage).filter((a) => sweepAttemptKey(a.chainId, a.owner) !== key);
  if (records.length >= MAX_SWEEP_ATTEMPTS) {
    const idx = records.findIndex((a) => a.status === 'included' || a.status === 'reverted');
    if (idx < 0) throw new UserFacingError('Too many sweeps are still pending in this tab. Check their status before signing another.');
    records.splice(idx, 1);
  }
  const text = JSON.stringify([...records, attempt].map(encode));
  if (text.length > MAX_BYTES) throw new SweepJournalUnavailableError();
  try {
    storage.setItem(SWEEP_JOURNAL_KEY, text);
    if (storage.getItem(SWEEP_JOURNAL_KEY) !== text) throw new SweepJournalUnavailableError();
  } catch {
    throw new SweepJournalUnavailableError();
  }
}
