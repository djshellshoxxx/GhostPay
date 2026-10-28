import { createContext, useContext, useSyncExternalStore } from 'react';
import type { RpcClient } from '@ghostpay/chain-adapters';
import type { ScanMatch } from './lib/scanClient';
import type { DirectSweepAttempt } from './lib/sweep';
import { browserSweepStorage, readSweepAttempts, SWEEP_JOURNAL_KEY, sweepAttemptKey, writeSweepAttempt } from './lib/sweepAttemptJournal';
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
 * written, signing is disarmed for the rest of this page session instead of trusting memory alone.
 */
const sweepAttempts = new Map<string, DirectSweepAttempt>();
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

export function recordSweepAttempt(attempt: DirectSweepAttempt): void {
  hydrateSweepAttempts();
  sweepAttempts.set(sweepAttemptKey(attempt.chainId, attempt.owner), attempt);
  try {
    const storage = browserSweepStorage();
    if (storage !== undefined) writeSweepAttempt(attempt, storage);
  } catch {
    sweepJournalBroken = true;
  }
  notifySweepAttempts();
}

export function getSweepAttempt(chainId: number, owner: string): DirectSweepAttempt | undefined {
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
export function useSweepAttempt(chainId: number | undefined, owner: string | undefined): DirectSweepAttempt | undefined {
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
