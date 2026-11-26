import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { subscribeAppLock } from './appLock';
import { subscribeSession } from './session';

// Ported from #569 `c30283d2` (lib/privacyMode.tsx) onto current main; the preference store below is new here.

/** A visual reveal is deliberately short and never persisted with preferences or history. */
export const PRIVACY_REVEAL_MS = 30_000;
const CLOCK_CHECK_MS = 1_000;
export const PRIVACY_MODE_KEY = 'ghostpay.privacy-mode.v1';

/* ------------------------------------------------------------------ preference */

// Kept apart from Settings on purpose: Pay authority and Sweep consent are bound to the saved settings object, and
// toggling a visual mask must never cancel an in-flight payment or a consented balance read.
let override: boolean | undefined;
const preferenceListeners = new Set<() => void>();
function storage(): Storage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; }
}
/** Absent means off. A present but unreadable or invalid value fails closed to masked. */
export function readPrivacyMode(): boolean {
  if (override !== undefined) return override;
  const store = storage();
  if (store === undefined) return false;
  let raw: string | null;
  try { raw = store.getItem(PRIVACY_MODE_KEY); } catch { return true; }
  if (raw === null || raw === '0') return false;
  return true; // '1', or anything this build does not recognise.
}
/** Applies in this tab immediately; returns whether the choice was also saved for later visits and other tabs. */
export function savePrivacyMode(enabled: boolean): boolean {
  let saved = false;
  try {
    const store = storage();
    if (store !== undefined) {
      store.setItem(PRIVACY_MODE_KEY, enabled ? '1' : '0');
      saved = store.getItem(PRIVACY_MODE_KEY) === (enabled ? '1' : '0');
    }
  } catch { saved = false; }
  override = saved ? undefined : enabled;
  for (const listener of [...preferenceListeners]) listener();
  return saved;
}
function subscribePreference(listener: () => void): () => void {
  preferenceListeners.add(listener);
  const onStorage = (event: StorageEvent): void => { if (event.key === null || event.key === PRIVACY_MODE_KEY) listener(); };
  window.addEventListener('storage', onStorage);
  return () => { preferenceListeners.delete(listener); window.removeEventListener('storage', onStorage); };
}
export function usePrivacyModePreference(): boolean {
  return useSyncExternalStore(subscribePreference, readPrivacyMode, () => false);
}
/** Test-only: forget an in-memory choice made while storage was unavailable. */
export function resetPrivacyModeForTests(): void { override = undefined; }

/* ---------------------------------------------------------------------- reveal */

let revision = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getRevision = (): number => revision;

/** Shared lifecycle hook: account, vault and session owners can revoke every temporary UI reveal. */
export function revokePrivacyReveal(): void {
  revision++;
  for (const listener of [...listeners]) {
    try { listener(); } catch { /* One observer cannot keep another reveal alive. */ }
  }
}

interface Clock { readonly wall: number; readonly monotonic: number }
function clock(): Clock | undefined {
  try {
    const wall = Date.now();
    const monotonic = performance.now();
    return Number.isFinite(wall) && wall >= 0 && Number.isFinite(monotonic) && monotonic >= 0 ? { wall, monotonic } : undefined;
  } catch { return undefined; }
}
export interface RevealGrant {
  readonly scope: unknown;
  readonly revision: number;
  readonly started: Clock;
  observed: Clock;
  expired: boolean;
}
/** Pure deadline check, exported for property tests. Expiry is sticky: nothing revives an expired grant. */
export function revealCurrent(grant: RevealGrant | undefined, scope: unknown, allowed: boolean, currentRevision: number, now: Clock | undefined, visible: boolean): boolean {
  if (grant === undefined || grant.expired) return false;
  if (!allowed || grant.scope !== scope || grant.revision !== currentRevision || !visible || now === undefined
    || now.wall < grant.observed.wall || now.monotonic < grant.observed.monotonic
    || now.wall - grant.started.wall >= PRIVACY_REVEAL_MS || now.monotonic - grant.started.monotonic >= PRIVACY_REVEAL_MS) {
    grant.expired = true;
    return false;
  }
  grant.observed = now;
  return true;
}
const visible = (): boolean => typeof document === 'undefined' || document.visibilityState === 'visible';
const currentGrant = (grant: RevealGrant | undefined, scope: unknown, allowed: boolean, currentRevision: number): boolean =>
  revealCurrent(grant, scope, allowed, currentRevision, clock(), visible());

/** Both clocks bound a reveal; clock rollback/invalidity fails closed and cannot revive an expired grant. */
export function useTemporaryPrivacyReveal(scope: unknown, allowed: boolean): {
  readonly revealed: boolean;
  readonly reveal: () => void;
  readonly hide: () => void;
} {
  const currentRevision = useSyncExternalStore(subscribe, getRevision, getRevision);
  const [grant, setGrant] = useState<RevealGrant | undefined>();
  const latest = useRef({ scope, allowed });
  latest.current = { scope, allowed };
  const revealed = currentGrant(grant, scope, allowed, currentRevision);
  const hide = useCallback(() => { setGrant(undefined); }, []);
  const reveal = useCallback(() => {
    const now = clock();
    if (!latest.current.allowed || !visible() || now === undefined) return;
    setGrant({ scope: latest.current.scope, revision: getRevision(), started: now, observed: now, expired: false });
  }, []);
  useEffect(() => {
    if (grant === undefined) return;
    const check = (): void => {
      if (!currentGrant(grant, latest.current.scope, latest.current.allowed, getRevision())) hide();
    };
    // The timer independently bounds elapsed time if wall clocks move or a performance clock is unavailable.
    const deadline = window.setTimeout(hide, PRIVACY_REVEAL_MS);
    const timer = window.setInterval(check, CLOCK_CHECK_MS);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    document.addEventListener('pointerdown', check, true);
    document.addEventListener('keydown', check, true);
    return () => {
      window.clearTimeout(deadline);
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      document.removeEventListener('pointerdown', check, true);
      document.removeEventListener('keydown', check, true);
    };
  }, [grant, hide]);
  return { revealed, reveal, hide };
}

/* --------------------------------------------------------------------- context */

export interface PrivacyState {
  readonly enabled: boolean;
  readonly masked: boolean;
  readonly reveal: () => void;
  readonly hide: () => void;
}
const absent: PrivacyState = Object.freeze({ enabled: false, masked: false, reveal: () => undefined, hide: () => undefined });
const PrivacyContext = createContext<PrivacyState>(absent);
export const usePrivacy = (): PrivacyState => useContext(PrivacyContext);

/** `scope` changes (navigation, a new invoice) revoke the current reveal, as do lock, session, hidden tab and exit. */
export function PrivacyProvider(props: { readonly enabled: boolean; readonly scope: unknown; readonly children: ReactNode }): ReactNode {
  const { revealed, reveal } = useTemporaryPrivacyReveal(props.scope, props.enabled);
  useLayoutEffect(() => { revokePrivacyReveal(); }, [props.enabled, props.scope]);
  useEffect(() => {
    const onVisibility = (): void => { if (document.visibilityState !== 'visible') revokePrivacyReveal(); };
    const stopSession = subscribeSession(revokePrivacyReveal);
    const stopLock = subscribeAppLock(revokePrivacyReveal);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', revokePrivacyReveal);
    return () => {
      stopSession(); stopLock();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', revokePrivacyReveal);
      revokePrivacyReveal();
    };
  }, []);
  const value = useMemo<PrivacyState>(() => ({ enabled: props.enabled, masked: props.enabled && !revealed, reveal, hide: revokePrivacyReveal }), [props.enabled, revealed, reveal]);
  return <PrivacyContext.Provider value={value}>{props.children}</PrivacyContext.Provider>;
}
