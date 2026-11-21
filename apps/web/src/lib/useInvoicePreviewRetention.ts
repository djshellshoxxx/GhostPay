import { useLayoutEffect, useRef } from 'react';
import { readRetentionDelay, RETENTION_POLICIES, RETENTION_REGISTRIES, type RetentionScope } from './metadataRetention';

/** Register only a generated screen preview. This hook never receives a vault or a transaction journal. */
export function useInvoicePreviewRetention(identity: object | undefined, clear: () => void): void {
  usePresentationRetention(identity, clear, 'invoice');
}

/** The current presentation identity is the sole cleanup capability; no durable record handle enters the hook. */
export function usePresentationRetention(identity: object | undefined, clear: () => void, scope: RetentionScope): void {
  const latest = useRef({ identity, clear, scope });
  latest.current = { identity, clear, scope };
  useLayoutEffect(() => {
    if (identity === undefined) return;
    const registry = RETENTION_REGISTRIES[scope];
    const policy = RETENTION_POLICIES[scope];
    const unregister = registry.register(() => {
      if (latest.current.identity === identity && latest.current.scope === scope) latest.current.clear();
    });
    const expire = (): void => { registry.expire(readRetentionDelay(undefined, scope)); };
    const onStorage = (event: StorageEvent): void => { if (event.key === policy.key || event.key === null) expire(); };
    const timer = window.setInterval(expire, 1_000);
    window.addEventListener(policy.event, expire);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', expire);
    return () => {
      unregister();
      window.clearInterval(timer);
      window.removeEventListener(policy.event, expire);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', expire);
    };
  }, [identity, scope]);
}
