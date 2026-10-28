/**
 * App-wide lock signal. The tag vault and the EVM session are locked directly by the app; views that hold keys of
 * their own (the Bitcoin, Solana and TRON views) subscribe here and run their own lock: wipe the keys and scan
 * secrets, hide any backup and drop results that are still in flight.
 */
export type AppLockReason = 'idle' | 'manual';

type Listener = (reason: AppLockReason) => void;

const listeners = new Set<Listener>();

/** Runs `listener` on every app lock until the returned function is called. */
export function subscribeAppLock(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Locks every subscribed view. A listener that throws does not keep the others unlocked. */
export function notifyAppLock(reason: AppLockReason): void {
  for (const listener of [...listeners]) {
    try {
      listener(reason);
    } catch {
      // Best effort per view; the remaining views still lock.
    }
  }
}
