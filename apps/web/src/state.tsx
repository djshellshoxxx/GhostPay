import { createContext, useContext, useSyncExternalStore } from 'react';
import type { RpcClient } from '@ghostpay/chain-adapters';
import type { ScanMatch } from './lib/scanClient';
import type { SweepLock } from './lib/sweep';
import { UserFacingError } from './lib/errors';
import { browserSweepStorage, readSweepAttempts, SWEEP_JOURNAL_KEY, sweepAttemptKey, SweepJournalUnavailableError, toSweepLock, writeSweepAttempt } from './lib/sweepAttemptJournal';
import type { SessionPublic } from './lib/session';
import type { Settings } from './lib/settings';

export type ViewId = 'home' | 'seller' | 'create' | 'pay' | 'scan' | 'sweep' | 'btc' | 'solana' | 'tron' | 'registry' | 'policy' | 'settings' | 'about';

export const VIEW_LABELS: Readonly<Record<ViewId, string>> = {
  home: 'Home',
  seller: 'Seller keys',
  create: 'Create invoice',
  pay: 'Pay',
  scan: 'Scan and receive',
  sweep: 'Sweep',
  btc: 'Bitcoin (test)',
  solana: 'Solana (test)',
  tron: 'TRON (test)',
  registry: 'Public registry',
  policy: 'Policy accounts (experimental)',
  settings: 'Settings',
  about: 'About and privacy',
};

export interface AppState {
  readonly view: ViewId;
  readonly setView: (v: ViewId) => void;
  readonly settings: Settings;
  /** Persists settings; returns false if browser storage refused (settings still apply for this tab). */
  readonly updateSettings: (s: Settings) => boolean;
  readonly session: SessionPublic | undefined;
  /** Invoice fragment read at load or pasted by the user; held in memory only. */
  readonly fragment: string | undefined;
  readonly setFragment: (f: string | undefined) => void;
  readonly matches: readonly ScanMatch[];
  readonly setMatches: (m: readonly ScanMatch[]) => void;
  readonly sweepTarget: { readonly match: ScanMatch; readonly chainId: number } | undefined;
  readonly selectForSweep: (m: { readonly match: ScanMatch; readonly chainId: number } | undefined) => void;
  /** Verified RPC for a chain from the user's settings, or undefined when none is configured. */
  readonly getRpc: (chainId: number) => Promise<RpcClient | undefined>;
  /** Independent second RPC for a chain (Settings), or undefined when none is configured. Used to cross-check scans. */
  readonly getSecondaryRpc: (chainId: number) => Promise<RpcClient | undefined>;
  /** Announces a short status message to the polite live region. */
  readonly announce: (message: string) => void;
}

export const AppContext = createContext<AppState | undefined>(undefined);

export function useApp(): AppState {
  const s = useContext(AppContext);
  if (s === undefined) throw new Error('AppContext missing');
  return s;
}

/*
 * App-session holder for direct-sweep attempts (GP-SWEEP-OUTCOME-01). It lives above route-local view state so that
 * navigating away and back cannot re-arm signing after an uncertain broadcast. It holds only the public descriptor
 * (never key material). Every record is written through to the tab-scoped journal (sessionStorage), so a reload of
 * this tab keeps signing disarmed; other tabs do not see it (recorded limit). If the journal cannot be read or
 * written, signing is disarmed for the rest of this page session instead of trusting memory alone. Direct sweeps
 * persist the lock before handoff (beginSweepAttempt); relayed sweeps record it once the relayer returns a hash.
 */
const sweepAttempts = new Map<string, SweepLock>();
const sweepAttemptListeners = new Set<() => void>();
let sweepJournalHydrated = false;
let sweepJournalBroken = false;

function notifySweepAttempts(): void {
  for (const l of sweepAttemptListeners) l();
}

function hydrateSweepAttempts(): void {
  if (sweepJournalHydrated) return;
  sweepJournalHydrated = true;
  try {
    const storage = browserSweepStorage();
    if (storage === undefined) return;
    for (const a of readSweepAttempts(storage)) sweepAttempts.set(sweepAttemptKey(a.chainId, a.owner), a);
  } catch {
    sweepJournalBroken = true;
  }
}

/**
 * Persists the lock BEFORE the signed bytes leave the page. Throws (and records nothing) when the tab journal cannot
 * hold it, so the caller aborts without broadcasting.
 *
 * `replaces` is passed only by a same-nonce re-sign of an unresolved direct sweep (L2-F2): the new lock takes over
 * exactly that lock (compare-and-swap) and only with the same owner nonce, so at most one of the two transactions can be
 * mined. Any other unresolved lock still refuses.
 */
export function beginSweepAttempt(attempt: SweepLock, replaces?: SweepLock): void {
  hydrateSweepAttempts();
  if (sweepJournalBroken) throw new SweepJournalUnavailableError();
  // Re-checked here, after the signing awaits, so a lock taken meanwhile is never overwritten.
  const key = sweepAttemptKey(attempt.chainId, attempt.owner);
  const existing = sweepAttempts.get(key);
  if (replaces !== undefined) {
    if (existing === undefined || sweepAttemptKey(replaces.chainId, replaces.owner) !== key || !sameLock(existing, toSweepLock(replaces)) || !sameNonceReplacement(existing, attempt)) {
      throw new UserFacingError('The pending sweep this replacement was signed for has changed or cannot be replaced. Nothing was sent; check its status.');
    }
  } else if (existing !== undefined && isUnresolved(existing)) {
    throw new UserFacingError('A sweep from this address may still be pending. Check its status before signing anything new.');
  }
  const storage = browserSweepStorage();
  if (storage === undefined) throw new SweepJournalUnavailableError();
  try {
    writeSweepAttempt(attempt, storage);
  } catch (e) {
    if (e instanceof SweepJournalUnavailableError) { sweepJournalBroken = true; notifySweepAttempts(); }
    throw e;
  }
  sweepAttempts.set(sweepAttemptKey(attempt.chainId, attempt.owner), toSweepLock(attempt));
  notifySweepAttempts();
}

/** Records an outcome after handoff. Memory always keeps it; a failed write disarms signing for this page. */
export function recordSweepAttempt(attempt: SweepLock): void {
  hydrateSweepAttempts();
  sweepAttempts.set(sweepAttemptKey(attempt.chainId, attempt.owner), toSweepLock(attempt));
  try {
    const storage = browserSweepStorage();
    if (storage !== undefined) writeSweepAttempt(attempt, storage);
  } catch {
    sweepJournalBroken = true;
  }
  notifySweepAttempts();
}

function isUnresolved(a: SweepLock): boolean {
  return a.status === 'submitted' || a.status === 'unknown-after-handoff';
}

/** Only an unresolved direct lock (an owner nonce, no relayed order) may be replaced, and only with that same nonce. */
function sameNonceReplacement(existing: SweepLock, next: SweepLock): boolean {
  return isUnresolved(existing) && existing.order === undefined && next.order === undefined && existing.nonce !== undefined && next.nonce === existing.nonce;
}

function sameLock(a: SweepLock, b: SweepLock): boolean {
  return a.status === b.status
    && a.nonce === b.nonce
    && a.expectedHash?.toLowerCase() === b.expectedHash?.toLowerCase()
    && a.order?.relayer.toLowerCase() === b.order?.relayer.toLowerCase()
    && a.order?.nonce === b.order?.nonce
    && a.order?.deadline === b.order?.deadline;
}

/**
 * Compare-and-swap for status-check results: records `next` only while the stored lock for the same (chain, owner) is
 * still the one the check started from. A check that resolves after a newer lock was taken must not overwrite it.
 * Returns false (and records nothing) when the lock changed meanwhile.
 */
export function resolveSweepAttempt(from: SweepLock, next: SweepLock): boolean {
  hydrateSweepAttempts();
  const current = sweepAttempts.get(sweepAttemptKey(from.chainId, from.owner));
  if (current === undefined || !sameLock(current, toSweepLock(from))) return false;
  recordSweepAttempt(next);
  return true;
}

export function getSweepAttempt(chainId: number, owner: string): SweepLock | undefined {
  hydrateSweepAttempts();
  return sweepAttempts.get(sweepAttemptKey(chainId, owner));
}

/** True when the tab's sweep journal could not be read or written; signing must stay disarmed. */
export function isSweepJournalBroken(): boolean {
  hydrateSweepAttempts();
  return sweepJournalBroken;
}

const subscribeSweepAttempts = (listener: () => void): (() => void) => {
  sweepAttemptListeners.add(listener);
  return () => { sweepAttemptListeners.delete(listener); };
};

/** The latest direct-sweep attempt from this stealth address in this tab, if any. */
export function useSweepAttempt(chainId: number | undefined, owner: string | undefined): SweepLock | undefined {
  return useSyncExternalStore(
    subscribeSweepAttempts,
    () => (chainId === undefined || owner === undefined ? undefined : getSweepAttempt(chainId, owner)),
  );
}

export function useSweepJournalBroken(): boolean {
  return useSyncExternalStore(subscribeSweepAttempts, isSweepJournalBroken);
}

/** Clears memory and, unless `keepStorage` (simulates a page reload), the tab journal. */
export function resetSweepAttemptsForTests(opts: { readonly keepStorage?: boolean } = {}): void {
  sweepAttempts.clear();
  sweepJournalHydrated = false;
  sweepJournalBroken = false;
  if (opts.keepStorage !== true && typeof window !== 'undefined') window.sessionStorage.removeItem(SWEEP_JOURNAL_KEY);
  notifySweepAttempts();
}
