import { memoryIndexedDb } from './memoryIndexedDb';
/**
 * Test-only, in-process subset of the Web Locks API (jsdom has none). Exclusive, FIFO and NOT reentrant, like
 * `navigator.locks`: a nested request for a held name waits for the outer one, so a reentrant caller deadlocks here
 * exactly as it would in a browser. Never imported by application code.
 */
export interface TestLockManager {
  request<T>(name: string, ...args: readonly [() => T | Promise<T>] | readonly [object, () => T | Promise<T>]): Promise<T>;
  /** True while a callback for `name` is running or its returned promise is unsettled. */
  isHeld(name: string): boolean;
  /** Number of granted requests so far, per name. */
  granted(name: string): number;
}

export function createTestLocks(): TestLockManager {
  const tails = new Map<string, Promise<void>>();
  const held = new Set<string>();
  const counts = new Map<string, number>();
  return {
    request<T>(name: string, ...args: readonly [() => T | Promise<T>] | readonly [object, () => T | Promise<T>]): Promise<T> {
      const callback = args.length === 1 ? args[0] : args[1];
      // Like navigator.locks: an abort before the grant rejects the request and its callback never runs.
      const signal = args.length === 2 ? (args[0] as { readonly signal?: AbortSignal }).signal : undefined;
      const abortError = (): DOMException => new DOMException('The lock request was aborted.', 'AbortError');
      if (signal?.aborted === true) return Promise.reject(abortError());
      const previous = tails.get(name) ?? Promise.resolve();
      let release = (): void => undefined;
      tails.set(name, previous.then(() => new Promise<void>((resolve) => { release = resolve; })));
      let rejectWaiting: (e: unknown) => void = () => undefined;
      const waiting = new Promise<never>((_resolve, reject) => { rejectWaiting = reject; });
      const onAbort = (): void => { rejectWaiting(abortError()); };
      signal?.addEventListener('abort', onAbort, { once: true });
      const granted = previous.then(async () => {
        if (signal?.aborted === true) { release(); throw abortError(); }
        signal?.removeEventListener('abort', onAbort);
        held.add(name);
        counts.set(name, (counts.get(name) ?? 0) + 1);
        try {
          return await callback();
        } finally {
          held.delete(name);
          release();
        }
      });
      if (signal === undefined) return granted;
      granted.catch(() => undefined);
      return Promise.race([granted, waiting]);
    },
    isHeld: (name) => held.has(name),
    granted: (name) => counts.get(name) ?? 0,
  };
}

/** Installs a fresh in-process lock manager as `navigator.locks` and returns it. */
export function installTestLocks(): TestLockManager {
  const locks = createTestLocks();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });
  return locks;
}

/** Removes `navigator.locks`, as in a browser without the Web Locks API. */
export function removeTestLocks(): void {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
}

/**
 * Node-environment tests: stubs a minimal `window` whose durable journal store (`localStorage`) is `store` (an
 * in-memory one by default), with an empty legacy `sessionStorage`, and installs in-process `navigator.locks`.
 * Call `vi.unstubAllGlobals()` afterwards as usual.
 */
export function stubJournalWindow(
  stubGlobal: (name: string, value: unknown) => unknown,
  store?: { getItem(key: string): string | null; setItem(key: string, value: string): void },
): Map<string, string> {
  const mem = new Map<string, string>();
  const memory = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } });
  stubGlobal('window', { localStorage: store ?? memory(mem), sessionStorage: memory(new Map()), dispatchEvent: () => true });
  stubGlobal('indexedDB', memoryIndexedDb());
  installTestLocks();
  return mem;
}
