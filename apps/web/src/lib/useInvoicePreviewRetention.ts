import { useLayoutEffect, useRef } from 'react';
import { invoicePreviewRetention, readRetentionDelay, RETENTION_EVENT, RETENTION_KEY } from './metadataRetention';

/** Register only a generated screen preview. This hook never receives a vault or a transaction journal. */
export function useInvoicePreviewRetention(identity: object | undefined, clear: () => void): void {
  const latest = useRef({ identity, clear });
  latest.current = { identity, clear };
  useLayoutEffect(() => {
    if (identity === undefined) return;
    const unregister = invoicePreviewRetention.register(() => {
      if (latest.current.identity === identity) latest.current.clear();
    });
    const expire = (): void => { invoicePreviewRetention.expire(readRetentionDelay()); };
    const onStorage = (event: StorageEvent): void => { if (event.key === RETENTION_KEY || event.key === null) expire(); };
    const timer = window.setInterval(expire, 1_000);
    window.addEventListener(RETENTION_EVENT, expire);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', expire);
    return () => {
      unregister();
      window.clearInterval(timer);
      window.removeEventListener(RETENTION_EVENT, expire);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', expire);
    };
  }, [identity]);
}
