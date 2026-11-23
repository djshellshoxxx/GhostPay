import { describe, expect, it, vi } from 'vitest';
import { browserCheckEnvironment, runBrowserChecks } from './browserChecks';

const validDigest = (bytes: ArrayBuffer): Promise<ArrayBuffer> => crypto.subtle.digest('SHA-256', bytes);

function temporaryStorage(): { store: Map<string, string>; storage: Pick<Storage, 'setItem' | 'getItem' | 'removeItem'> } {
  const store = new Map<string, string>();
  return {
    store,
    storage: {
      setItem(key, value) { store.set(key, value); },
      getItem(key) { return store.get(key) ?? null; },
      removeItem(key) { store.delete(key); },
    },
  };
}

describe('local-only browser capability checks', () => {
  it('omits unavailable optional browser providers and reports their absence without exposing storage errors', async () => {
    vi.stubGlobal('window', {
      isSecureContext: false,
      crypto: {},
      get localStorage() { throw new Error('storage access denied'); },
    });
    try {
      const env = browserCheckEnvironment();
      expect(Object.hasOwn(env, 'digest')).toBe(false);
      expect(Object.hasOwn(env, 'storage')).toBe(false);
      expect(await runBrowserChecks(env)).toEqual([
        { id: 'secure', status: 'fail' },
        { id: 'digest', status: 'fail' },
        { id: 'storage', status: 'warn' },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('passes only a genuine SHA-256 known-answer check and a cleaned-up storage round trip', async () => {
    const { store, storage } = temporaryStorage();
    const checks = await runBrowserChecks({
      secureContext: true, digest: validDigest, storage, probeKey: '__ghostpay_test_probe__',
    });
    expect(checks).toEqual([
      { id: 'secure', status: 'pass' },
      { id: 'digest', status: 'pass' },
      { id: 'storage', status: 'pass' },
    ]);
    expect(store.size).toBe(0);
  });

  it('reports insecure context and absent cryptography as failures, not as verified client integrity', async () => {
    const checks = await runBrowserChecks({ secureContext: false, probeKey: 'probe' });
    expect(checks).toEqual([
      { id: 'secure', status: 'fail' },
      { id: 'digest', status: 'fail' },
      { id: 'storage', status: 'warn' },
    ]);
  });

  it('fails the SHA-256 check if the digest resolves to wrong bytes', async () => {
    const checks = await runBrowserChecks({
      secureContext: true,
      digest: () => Promise.resolve(new Uint8Array(32).buffer),
      probeKey: 'probe',
    });
    expect(checks.find((check) => check.id === 'digest')?.status).toBe('fail');
  });

  it('fails the SHA-256 check if the digest rejects without disclosing an exception', async () => {
    const checks = await runBrowserChecks({
      secureContext: true,
      digest: () => Promise.reject(new Error('secret provider details')),
      probeKey: 'probe',
    });
    expect(checks.find((check) => check.id === 'digest')?.status).toBe('fail');
    expect(JSON.stringify(checks)).not.toContain('secret provider details');
  });

  it('warns when storage silently loses its write and removes the temporary probe', async () => {
    const { store, storage } = temporaryStorage();
    const checks = await runBrowserChecks({
      secureContext: true,
      digest: validDigest,
      storage: { ...storage, getItem: () => null },
      probeKey: '__ghostpay_test_probe__',
    });
    expect(checks.find((check) => check.id === 'storage')?.status).toBe('warn');
    expect(store.size).toBe(0);
  });

  it('warns without throwing when storage write or removal is denied', async () => {
    const checks = await runBrowserChecks({
      secureContext: true,
      digest: validDigest,
      storage: {
        setItem() { throw new Error('denied'); },
        getItem() { return null; },
        removeItem() { throw new Error('denied'); },
      },
      probeKey: 'probe',
    });
    expect(checks.find((check) => check.id === 'storage')?.status).toBe('warn');
  });
});
