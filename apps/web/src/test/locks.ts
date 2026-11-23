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
      const previous = tails.get(name) ?? Promise.resolve();
      let release = (): void => undefined;
      tails.set(name, previous.then(() => new Promise<void>((resolve) => { release = resolve; })));
      return previous.then(async () => {
        held.add(name);
        counts.set(name, (counts.get(name) ?? 0) + 1);
        try {
          return await callback();
        } finally {
          held.delete(name);
          release();
        }
      });
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
