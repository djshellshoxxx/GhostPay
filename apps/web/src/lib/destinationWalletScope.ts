import type { Eip1193Provider } from './wallet';

/**
 * Observe local signals only. For a request-only wallet, leaving the page (hidden or unloaded) ends the
 * connected-account snapshot. Window blur is deliberately not a signal: the wallet's own signing popup takes focus.
 */
export function watchDestinationWallet(provider: Eip1193Provider, invalidate: () => void): () => void {
  const events = ['accountsChanged', 'chainChanged', 'disconnect'];
  const remove = (): void => {
    for (const event of events) {
      try { provider.removeListener?.(event, invalidate); } catch { /* Optional wallet interface. */ }
    }
  };
  try {
    if (provider.on !== undefined && provider.removeListener !== undefined) {
      for (const event of events) provider.on(event, invalidate);
      return remove;
    }
  } catch { remove(); }
  const onVisibility = (): void => { if (document.hidden) invalidate(); };
  window.addEventListener('pagehide', invalidate);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('pagehide', invalidate);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
