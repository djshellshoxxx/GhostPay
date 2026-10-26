import { createContext, useContext, useSyncExternalStore } from 'react';
import type { RpcClient } from '@ghostpay/chain-adapters';
import type { ScanMatch } from './lib/scanClient';
import { isUnresolvedAttempt, type DirectSweepAttempt } from './lib/sweep';
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
 * (never key material) and only in memory: a page reload clears it (durable persistence is out of scope).
 */
const sweepAttempts = new Map<string, DirectSweepAttempt>();
const sweepAttemptListeners = new Set<() => void>();
const sweepAttemptKey = (chainId: number, owner: string): string => `${String(chainId)}:${owner.toLowerCase()}`;

export function recordSweepAttempt(attempt: DirectSweepAttempt): void {
  sweepAttempts.set(sweepAttemptKey(attempt.chainId, attempt.owner), attempt);
  for (const l of sweepAttemptListeners) l();
}

/** Atomically records a new handoff only when the previous attempt is terminal or absent. */
export function tryRecordSweepAttempt(attempt: DirectSweepAttempt): boolean {
  const key = sweepAttemptKey(attempt.chainId, attempt.owner);
  const current = sweepAttempts.get(key);
  if (current !== undefined && isUnresolvedAttempt(current)) return false;
  recordSweepAttempt(attempt);
  return true;
}

/** Updates a read/send result only while the exact attempt snapshot it observed is still current. */
export function updateSweepAttemptIfCurrent(expected: DirectSweepAttempt, next: DirectSweepAttempt): boolean {
  const key = sweepAttemptKey(expected.chainId, expected.owner);
  const current = sweepAttempts.get(key);
  if (current === undefined || current.expectedHash.toLowerCase() !== expected.expectedHash.toLowerCase() || current.status !== expected.status) return false;
  if (sweepAttemptKey(next.chainId, next.owner) !== key || next.expectedHash.toLowerCase() !== expected.expectedHash.toLowerCase()) return false;
  if (current === next) return true;
  sweepAttempts.set(key, next);
  for (const l of sweepAttemptListeners) l();
  return true;
}

export function getSweepAttempt(chainId: number, owner: string): DirectSweepAttempt | undefined {
  return sweepAttempts.get(sweepAttemptKey(chainId, owner));
}

/** The latest direct-sweep attempt from this stealth address in this app session, if any. */
export function useSweepAttempt(chainId: number | undefined, owner: string | undefined): DirectSweepAttempt | undefined {
  return useSyncExternalStore(
    (listener) => {
      sweepAttemptListeners.add(listener);
      return () => { sweepAttemptListeners.delete(listener); };
    },
    () => (chainId === undefined || owner === undefined ? undefined : getSweepAttempt(chainId, owner)),
  );
}

export function resetSweepAttemptsForTests(): void {
  sweepAttempts.clear();
  for (const l of sweepAttemptListeners) l();
}
