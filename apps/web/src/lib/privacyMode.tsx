import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SessionPresentationBoundary } from '../components/SessionPresentationBoundary';
import { subscribeAppLock } from './appLock';
import { subscribeSession } from './session';

/** A visual reveal is deliberately short and never persisted with preferences or history. */
export const PRIVACY_REVEAL_MS = 30_000;
const CLOCK_CHECK_MS = 1_000;
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
  for (const listener of [...listeners]) listener();
}

interface Clock { readonly wall: number; readonly monotonic: number }
function clock(): Clock | undefined {
  try {
    const wall = Date.now();
    const monotonic = performance.now();
    return Number.isFinite(wall) && wall >= 0 && Number.isFinite(monotonic) && monotonic >= 0 ? { wall, monotonic } : undefined;
  } catch { return undefined; }
}
interface Reveal {
  readonly scope: unknown;
  readonly revision: number;
  readonly started: Clock;
  observed: Clock;
  expired: boolean;
}
function current(grant: Reveal | undefined, scope: unknown, allowed: boolean, currentRevision: number): boolean {
  if (grant === undefined || grant.expired) return false;
  const now = clock();
  if (!allowed || grant.scope !== scope || grant.revision !== currentRevision || document.visibilityState !== 'visible' || now === undefined
    || now.wall < grant.observed.wall || now.monotonic < grant.observed.monotonic
    || now.wall - grant.started.wall >= PRIVACY_REVEAL_MS || now.monotonic - grant.started.monotonic >= PRIVACY_REVEAL_MS) {
    grant.expired = true;
    return false;
  }
  grant.observed = now;
  return true;
}

/** Both clocks bound a reveal; clock rollback/invalidity fails closed and cannot revive an expired grant. */
export function useTemporaryPrivacyReveal(scope: unknown, allowed: boolean): {
  readonly revealed: boolean;
  readonly reveal: () => void;
  readonly hide: () => void;
} {
  const currentRevision = useSyncExternalStore(subscribe, getRevision, getRevision);
  const [grant, setGrant] = useState<Reveal | undefined>();
  const latest = useRef({ scope, allowed });
  latest.current = { scope, allowed };
  const revealed = current(grant, scope, allowed, currentRevision);
  const hide = useCallback(() => { setGrant(undefined); }, []);
  const reveal = useCallback(() => {
    const now = clock();
    if (!latest.current.allowed || document.visibilityState !== 'visible' || now === undefined) return;
    setGrant({ scope: latest.current.scope, revision: getRevision(), started: now, observed: now, expired: false });
  }, []);
  useEffect(() => {
    if (grant === undefined) return;
    const check = (): void => {
      if (!current(grant, latest.current.scope, latest.current.allowed, getRevision())) hide();
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

interface PrivacyState {
  readonly enabled: boolean;
  readonly masked: boolean;
  readonly reveal: () => void;
  readonly hide: () => void;
}
const absent: PrivacyState = Object.freeze({ enabled: false, masked: false, reveal: () => undefined, hide: () => undefined });
const PrivacyContext = createContext<PrivacyState>(absent);
export const usePrivacy = (): PrivacyState => useContext(PrivacyContext);

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
  return <PrivacyContext.Provider value={value}><SessionPresentationBoundary>{props.children}</SessionPresentationBoundary></PrivacyContext.Provider>;
}
