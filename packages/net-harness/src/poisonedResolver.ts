import dns from 'node:dns';

/** Handle returned by {@link installPoisonedResolver}. */
export interface PoisonedResolver {
  /** Names the process tried to resolve locally since install (each is a leak for SOCKS5h). */
  readonly calls: readonly string[];
  /** Restores the original resolver functions. Idempotent. */
  restore(): void;
}

const CALLBACK_FNS = ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny'] as const;

/**
 * Replaces `dns.lookup`, `dns.resolve*` and the `dns.promises` equivalents with functions that record
 * the queried name and fail. Used to prove a SOCKS5h agent never resolves hostnames locally (NP-T-3).
 *
 * @remarks Process-global; tests using it must not run concurrently with other DNS users. Node's
 * `net.connect` calls `dns.lookup` through the module object, so a connect to a non-IP name is caught.
 * @returns A handle with the recorded `calls` and `restore()`.
 */
export function installPoisonedResolver(): PoisonedResolver {
  const calls: string[] = [];
  const mutable = dns as unknown as Record<string, unknown>;
  const promises = dns.promises as unknown as Record<string, unknown>;
  const saved: [Record<string, unknown>, string, unknown][] = [];
  const err = (name: string): Error => {
    const e = new Error(`poisoned resolver: ${name}`) as NodeJS.ErrnoException;
    e.code = 'ENOTFOUND';
    return e;
  };
  for (const fn of CALLBACK_FNS) {
    saved.push([mutable, fn, mutable[fn]]);
    mutable[fn] = (name: unknown, ...rest: unknown[]): void => {
      const nameStr = typeof name === 'string' ? name : '?';
      calls.push(nameStr);
      const cb = rest.find((r) => typeof r === 'function') as ((e: Error) => void) | undefined;
      if (cb !== undefined) queueMicrotask(() => cb(err(nameStr)));
    };
    saved.push([promises, fn, promises[fn]]);
    promises[fn] = (name: unknown): Promise<never> => {
      const nameStr = typeof name === 'string' ? name : '?';
      calls.push(nameStr);
      return Promise.reject(err(nameStr));
    };
  }
  let restored = false;
  return {
    calls,
    restore() {
      if (restored) return;
      restored = true;
      for (const [obj, key, val] of saved) obj[key] = val;
    },
  };
}
