import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewId } from '../state';
import { clearFragment, readInvoiceFragment } from './fragment';
import { captureSessionVersionGuard, isSessionSuspended } from './session';

interface ViewEntry { readonly view: ViewId; readonly position: number }

// The only data owned by routing. Never copy another entry's URL, state or form values into a new entry.
function entryFrom(state: unknown, allowed: readonly ViewId[]): ViewEntry | undefined {
  if (typeof state !== 'object' || state === null || !('ghostPayView' in state)) return;
  const value = state.ghostPayView;
  if (typeof value !== 'object' || value === null || !('position' in value) || !('view' in value)
    || typeof value.position !== 'number' || !Number.isSafeInteger(value.position) || value.position < 0) return;
  return { view: allowed.find((id) => id === value.view) ?? 'home', position: value.position };
}

function markEntry(entry: ViewEntry): void {
  const previous: unknown = window.history.state;
  // Preserve unrelated same-entry metadata. New entries start with only our own view and position.
  const state = typeof previous === 'object' && previous !== null ? previous : {};
  window.history.replaceState({ ...state, ghostPayView: entry }, '');
}

function guard(proceed: () => void, cancel: () => void = () => {}): void {
  const event = new CustomEvent('ghostpay:settings-navigation', { cancelable: true, detail: { proceed, cancel } });
  if (window.dispatchEvent(event)) proceed();
}

export function useViewHistory(allowed: readonly ViewId[], autoClear: boolean) {
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  const [fragment, writeFragment] = useState(() => readInvoiceFragment(window.location));
  const [initial] = useState(() => {
    const prior = entryFrom(window.history.state, allowed);
    return { view: fragment === undefined ? prior?.view ?? 'home' : 'pay', position: prior?.position ?? 0 } satisfies ViewEntry;
  });
  const current = useRef<ViewEntry>(initial);
  const [view, selectView] = useState<ViewId>(initial.view);
  const setFragment = useCallback((value: string | undefined) => {
    if (value === undefined && readInvoiceFragment(window.location) !== undefined) clearFragment(window.location, window.history);
    writeFragment(value);
  }, []);

  const show = useCallback((entry: ViewEntry) => {
    current.current = entry;
    selectView(entry.view);
  }, []);

  useEffect(() => { markEntry(current.current); }, []);
  useEffect(() => {
    if (autoClear && readInvoiceFragment(window.location) !== undefined) clearFragment(window.location, window.history);
  }, [autoClear]);

  const setView = useCallback((requested: ViewId) => {
    const next = allowedRef.current.includes(requested) ? requested : 'home';
    if (next === current.current.view || isSessionSuspended()) return;
    guard(() => {
      if (isSessionSuspended() || next === current.current.view) return;
      setFragment(undefined);
      const entry = { view: next, position: current.current.position + 1 };
      // An absolute same-origin URL also handles paths beginning with two slashes.
      const clean = new URL(window.location.href);
      clean.hash = '';
      clean.search = '';
      window.history.pushState({ ghostPayView: entry }, '', clean.href);
      show(entry);
    });
  }, [setFragment, show]);

  useEffect(() => {
    const restore = (): void => {
      const at = entryFrom(window.history.state, allowedRef.current);
      if (at && at.position !== current.current.position) window.history.go(current.current.position - at.position);
    };
    const onPop = (event: PopStateEvent): void => {
      const target = entryFrom(event.state, allowedRef.current);
      if (!target) return; // A fresh same-document anchor is handled by hashchange.
      // An already visited, explicitly retained invoice URL can return through native traversal.
      // Revisit only the public view. Redact before its following hashchange can deliver the old invoice.
      if (readInvoiceFragment(window.location) !== undefined) clearFragment(window.location, window.history);
      if (target.position === current.current.position && target.view === current.current.view) return;
      const apply = (): void => {
        const at = entryFrom(window.history.state, allowedRef.current);
        if (!at) return;
        setFragment(undefined);
        const next = isSessionSuspended() ? { ...at, view: 'seller' as const } : at;
        if (next.view !== at.view) markEntry(next);
        show(next);
      };
      if (isSessionSuspended() || target.view === current.current.view) apply();
      else guard(apply, restore);
    };
    const onHash = (): void => {
      const f = readInvoiceFragment(window.location);
      const prior = entryFrom(window.history.state, allowedRef.current);
      if (f === undefined && prior) return;
      const entry = { view: current.current.view, position: prior?.position ?? current.current.position + 1 };
      markEntry(entry);
      if (f === undefined) { show(entry); return; }
      const unchanged = captureSessionVersionGuard();
      if (autoClear || isSessionSuspended()) clearFragment(window.location, window.history);
      if (isSessionSuspended()) { show(entry); return; }
      guard(() => {
        try { unchanged(); } catch { return; }
        if (isSessionSuspended()) return;
        const at = entryFrom(window.history.state, allowedRef.current);
        if (at?.position !== entry.position) return;
        const pay = { ...entry, view: 'pay' as const };
        markEntry(pay);
        writeFragment(f);
        show(pay);
      }, () => {
        if (window.location.hash === f) clearFragment(window.location, window.history);
        restore();
      });
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onHash);
    };
  }, [autoClear, setFragment, show]);

  return { view, setView, fragment, setFragment };
}
