import { useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppContext, type AppState } from '../state';
import { subscribeAppLock } from '../lib/appLock';
import { clearFragment, readInvoiceFragment } from '../lib/fragment';
import { subscribeSession } from '../lib/session';

/** Revoke shell-owned transient values even while the route that produced them is unmounted. */
export function SessionPresentationBoundary({ children }: { readonly children: ReactNode }): ReactNode {
  const app = useContext(AppContext);
  const current = useRef(app);
  current.current = app;
  const revision = useRef(0);
  const [generation, setGeneration] = useState(0);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    const clear = (): void => {
      const state = current.current;
      if (state === undefined) return;
      ++revision.current;
      setGeneration(revision.current);
      state.setMatches([]);
      state.selectForSweep(undefined);
      state.announce('');
      state.setFragment(undefined);
      if (readInvoiceFragment(window.location) !== undefined) clearFragment(window.location, window.history);
    };
    const stopSession = subscribeSession(clear);
    const stopLock = subscribeAppLock(clear);
    return () => { mounted.current = false; stopSession(); stopLock(); };
  }, []);
  // Keep these setters stable across ordinary renders. A deferred view callback keeps its original generation,
  // including when identical keys are reinstalled before React renders the intermediate account.
  const writers = useMemo(() => {
    const live = (): AppState | undefined => mounted.current && revision.current === generation ? current.current : undefined;
    return {
      setMatches: (matches) => live()?.setMatches(matches),
      selectForSweep: (target) => live()?.selectForSweep(target),
      setFragment: (value) => live()?.setFragment(value),
      announce: (message) => live()?.announce(message),
    } satisfies Pick<AppState, 'setMatches' | 'selectForSweep' | 'setFragment' | 'announce'>;
  }, [generation]);
  const scoped = useMemo(() => app === undefined ? undefined : { ...app, ...writers }, [app, writers]);
  return <AppContext.Provider value={scoped}>{children}</AppContext.Provider>;
}
