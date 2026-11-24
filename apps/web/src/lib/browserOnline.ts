import { useSyncExternalStore } from 'react';

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
