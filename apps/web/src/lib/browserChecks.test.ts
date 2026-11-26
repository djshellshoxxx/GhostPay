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

function withWindow<T>(fake: object, run: () => Promise<T>): Promise<T> {
  vi.stubGlobal('window', fake);
  return run().finally(() => { vi.unstubAllGlobals(); });
}

describe('local-only browser capability checks', () => {
  it('omits unavailable optional browser providers and reports them as unavailable without exposing storage errors', async () => {
    await withWindow({
      isSecureContext: false,
      crypto: {},
      get localStorage() { throw new Error('storage access denied'); },
    }, async () => {
      const env = browserCheckEnvironment();
      expect(Object.hasOwn(env, 'digest')).toBe(false);
      expect(Object.hasOwn(env, 'storage')).toBe(false);
      const checks = await runBrowserChecks(env);
      expect(checks).toEqual([
        { id: 'secure', status: 'fail' },
        { id: 'digest', status: 'unavailable' },
        { id: 'storage', status: 'unavailable' },
      ]);
      expect(JSON.stringify(checks)).not.toContain('storage access denied');
    });
  });

  it('treats a missing secure-context flag, a non-function digest and a null localStorage as unavailable', async () => {
    await withWindow({ crypto: { subtle: { digest: 'not callable' } }, localStorage: null }, async () => {
      const env = browserCheckEnvironment();
      expect(Object.hasOwn(env, 'secureContext')).toBe(false);
      expect(Object.hasOwn(env, 'digest')).toBe(false);
      expect(Object.hasOwn(env, 'storage')).toBe(false);
      expect((await runBrowserChecks(env)).map((check) => check.status)).toEqual(['unavailable', 'unavailable', 'unavailable']);
    });
  });

  it('keeps a usable digest provider when randomUUID or the crypto getter itself throws', async () => {
    const { storage } = temporaryStorage();
    await withWindow({
      isSecureContext: true,
      crypto: { subtle: { digest: (_name: string, data: ArrayBuffer) => validDigest(data) }, randomUUID() { throw new Error('denied'); } },
      localStorage: storage,
    }, async () => {
      const env = browserCheckEnvironment();
      expect(env.probeKey).toMatch(/^__ghostpay_capability_/);
      expect((await runBrowserChecks(env)).map((check) => check.status)).toEqual(['pass', 'pass', 'pass']);
    });
    await withWindow({ isSecureContext: true, get crypto() { throw new Error('blocked'); } }, async () => {
      const env = browserCheckEnvironment();
      expect(Object.hasOwn(env, 'digest')).toBe(false);
      expect((await runBrowserChecks(env))[1]).toEqual({ id: 'digest', status: 'unavailable' });
    });
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

  it('reports an insecure context as failed and absent cryptography as unavailable, never as passed', async () => {
    const checks = await runBrowserChecks({ secureContext: false, probeKey: 'probe' });
    expect(checks).toEqual([
      { id: 'secure', status: 'fail' },
      { id: 'digest', status: 'unavailable' },
      { id: 'storage', status: 'unavailable' },
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

  it('fails the SHA-256 check if the digest rejects or throws without disclosing an exception', async () => {
    for (const digest of [
      () => Promise.reject(new Error('secret provider details')),
      () => { throw new Error('secret provider details'); },
    ]) {
      const checks = await runBrowserChecks({ secureContext: true, digest, probeKey: 'probe' });
      expect(checks.find((check) => check.id === 'digest')?.status).toBe('fail');
      expect(JSON.stringify(checks)).not.toContain('secret provider details');
    }
  });

  it('fails when storage silently loses its write and removes the temporary probe', async () => {
    const { store, storage } = temporaryStorage();
    const checks = await runBrowserChecks({
      secureContext: true,
      digest: validDigest,
      storage: { ...storage, getItem: () => null },
      probeKey: '__ghostpay_test_probe__',
    });
    expect(checks.find((check) => check.id === 'storage')?.status).toBe('fail');
    expect(store.size).toBe(0);
  });

  it('reports storage as unavailable without throwing when the write is refused', async () => {
    const removed: string[] = [];
    const checks = await runBrowserChecks({
      secureContext: true,
      digest: validDigest,
      storage: {
        setItem() { throw new Error('denied'); },
        getItem() { return null; },
        removeItem(key) { removed.push(key); throw new Error('denied'); },
      },
      probeKey: 'probe',
    });
    expect(checks.find((check) => check.id === 'storage')?.status).toBe('unavailable');
    expect(removed).toEqual(['probe']);
  });

  it('fails when the probe cannot be read back or removed after a successful write', async () => {
    const readThrows = temporaryStorage();
    const removeThrows = temporaryStorage();
    const removeIgnored = temporaryStorage();
    const cases = [
      { ...readThrows.storage, getItem(): string | null { throw new Error('read denied'); } },
      { ...removeThrows.storage, removeItem() { throw new Error('remove denied'); } },
      { ...removeIgnored.storage, removeItem() { /* silently keeps the probe */ } },
    ];
    for (const storage of cases) {
      const checks = await runBrowserChecks({ secureContext: true, digest: validDigest, storage, probeKey: 'probe' });
      expect(checks.find((check) => check.id === 'storage')?.status).toBe('fail');
    }
    expect(readThrows.store.size).toBe(0);
  });
});
