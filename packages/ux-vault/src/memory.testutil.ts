import type { VaultStorage } from './vault.js';

/** In-memory storage for tests. */
export class MemoryStorage implements VaultStorage {
  readonly data = new Map<string, Uint8Array>();
  failNext: 'get' | 'put' | undefined;
  get(key: string): Promise<Uint8Array | undefined> {
    if (this.failNext === 'get') {
      this.failNext = undefined;
      return Promise.reject(new Error('boom'));
    }
    const v = this.data.get(key);
    return Promise.resolve(v ? new Uint8Array(v) : undefined);
  }
  put(key: string, value: Uint8Array): Promise<void> {
    if (this.failNext === 'put') {
      this.failNext = undefined;
      return Promise.reject(new Error('boom'));
    }
    this.data.set(key, new Uint8Array(value));
    return Promise.resolve();
  }
}

/** Deterministic NON-SECURE rng (xorshift32) for tests. */
export function seededRng(seed: number): (n: number) => Uint8Array {
  let s = seed >>> 0 || 1;
  return (n) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      out[i] = s & 0xff;
    }
    return out;
  };
}

/** Fast KDF policy for tests. */
export const TEST_KDF = { iterations: 1000, minIterations: 1000 };
