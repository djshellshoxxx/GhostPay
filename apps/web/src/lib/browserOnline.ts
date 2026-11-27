import { useSyncExternalStore } from 'react';

/** The browser's own connectivity signal. `false` is reliable; `true` only means "not known to be offline". */
export const browserOnline = (): boolean => navigator.onLine !== false;

function subscribe(listener: () => void): () => void {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

export const useBrowserOnline = (): boolean => useSyncExternalStore(subscribe, browserOnline);
