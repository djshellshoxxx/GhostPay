import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MemoryBackend,
  StoreError,
  createAesGcmSealer,
  createStore,
  deriveSealKey,
  fromWebStorage,
  hasOnlyKeys,
  lookupToken,
  storeErrorToAppCode,
  toStoreError,
  type CollectionDef,
  type KvBackend,
  type StoreErrorCode,
  type WebStorageLike,
} from './store.js';

interface Contact {
  readonly label: string;
  readonly note: string;
}
const contactsV1: CollectionDef<Contact> = {
  name: 'contacts',
  version: 1,
  parse: (r) => {
    if (!hasOnlyKeys(r, ['label', 'note']) || typeof r['label'] !== 'string' || typeof r['note'] !== 'string')
      throw new Error('bad');
    return { label: r['label'], note: r['note'] };
  },
};
// v2 renamed "name" (v1) -> "label" and added "note"
const contactsV2: CollectionDef<Contact> = {
  ...contactsV1,
  version: 2,
  migrations: {
    1: (raw) => {
      if (!hasOnlyKeys(raw, ['name']) || typeof raw['name'] !== 'string') throw new Error('bad');
      return { label: raw['name'], note: '' };
    },
  },
};
const rawV1: CollectionDef<{ name: string }> = {
  name: 'contacts',
  version: 1,
  parse: (r) => {
    if (!hasOnlyKeys(r, ['name']) || typeof r['name'] !== 'string') throw new Error('bad');
    return { name: r['name'] };
  },
};

const code = async (p: Promise<unknown>): Promise<StoreErrorCode | 'no-throw'> => {
  try {
    await p;
    return 'no-throw';
  } catch (e) {
    return e instanceof StoreError ? e.code : ('other' as never);
  }
};
const mk = (quota?: number) => {
  const backend = new MemoryBackend(quota);
  return { backend, store: createStore({ backend, namespace: 'main' }) };
};

describe('basic CRUD and namespacing', () => {
  it('round-trips, lists, counts, deletes', async () => {
    const { store } = mk();
    const c = store.collection(contactsV1);
    await c.put('a1', { label: 'Alice', note: 'x' });
    await c.put('b2', { label: 'Bob', note: '' });
    expect(await c.get('a1')).toEqual({ label: 'Alice', note: 'x' });
    expect(await c.get('zz')).toBeUndefined();
    expect(await c.count()).toBe(2);
    expect(await c.ids()).toEqual(['a1', 'b2']);
    expect((await c.list()).items.map((i) => i.id)).toEqual(['a1', 'b2']);
    await c.delete('a1');
    expect(await c.count()).toBe(1);
  });
  it('namespaces and collections are isolated; wipe only touches own namespace', async () => {
    const backend = new MemoryBackend();
    const a = createStore({ backend, namespace: 'profile-a' });
    const b = createStore({ backend, namespace: 'profile-b' });
    await a.collection(contactsV1).put('x', { label: 'A', note: '' });
    await b.collection(contactsV1).put('x', { label: 'B', note: '' });
    await backend.set('foreign', 'keep');
    expect((await a.collection(contactsV1).get('x'))?.label).toBe('A');
    expect(await a.wipe()).toBe(1);
    expect(await a.collection(contactsV1).count()).toBe(0);
    expect((await b.collection(contactsV1).get('x'))?.label).toBe('B');
    expect(await backend.get('foreign')).toBe('keep');
    expect(await b.usage()).toMatchObject({ keys: 1 });
  });
  it('putMany stores all and rolls back on failure', async () => {
    const { store, backend } = mk();
    const c = store.collection(contactsV1);
    await c.put('keep', { label: 'old', note: '' });
    await c.putMany([
      ['keep', { label: 'new', note: '' }],
      ['n1', { label: 'n', note: '' }],
    ]);
    expect((await c.get('keep'))?.label).toBe('new');
    expect(await c.count()).toBe(2);
    const bad = [
      ['keep', { label: 'again', note: '' }],
      ['n2', { label: 'x', note: '' }],
      ['bad id', { label: 'y', note: '' }],
    ] as const;
    expect(await code(c.putMany(bad))).toBe('INVALID_ID');
    expect((await c.get('keep'))?.label).toBe('new');
    expect(await c.get('n2')).toBeUndefined();
    expect(Object.keys(backend.dump())).toHaveLength(2);
  });
  it('putMany rollback survives a failing restore', async () => {
    const mem = new MemoryBackend();
    let sets = 0;
    const flaky: KvBackend = {
      get: (k) => mem.get(k),
      remove: () => Promise.reject(new Error('x')),
      keys: () => mem.keys(),
      set: (k, v) =>
        ++sets > 1
          ? Promise.reject(Object.assign(new Error('q'), { name: 'QuotaExceededError' }))
          : mem.set(k, v),
    };
    const c = createStore({ backend: flaky, namespace: 'main' }).collection(contactsV1);
    expect(
      await code(
        c.putMany([
          ['a', { label: 'a', note: '' }],
          ['b', { label: 'b', note: '' }],
        ]),
      ),
    ).toBe('QUOTA_EXCEEDED');
  });
  it('T-6 concurrent puts keep consistent counts', async () => {
    const { store } = mk();
    const c = store.collection(contactsV1);
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => c.put(`id${i % 30}`, { label: String(i), note: '' })),
    );
    expect(await c.count()).toBe(30);
  });
  it('serial queue continues after a failure', async () => {
    const { store } = mk();
    const c = store.collection(contactsV1);
    const [r1, r2] = await Promise.all([
      code(c.put('bad id', { label: 'a', note: '' })),
      code(c.put('ok', { label: 'a', note: '' })),
    ]);
    expect(r1).toBe('INVALID_ID');
    expect(r2).toBe('no-throw');
  });
});

describe('no secrets in keys or values', () => {
  it('rejects secret-looking names, ids and properties', async () => {
    const backend = new MemoryBackend();
    expect(() => createStore({ backend, namespace: 'seed-store' })).toThrow(StoreError);
    expect(() => createStore({ backend, namespace: 'Bad Name' })).toThrow(StoreError);
    const store = createStore({ backend, namespace: 'main' });
    expect(() => store.collection({ ...contactsV1, name: 'private-keys' })).toThrow(StoreError);
    expect(() => store.collection({ ...contactsV1, name: 'a:b' })).toThrow(StoreError);
    expect(() => store.collection({ ...contactsV1, version: 0 })).toThrow(StoreError);
    const c = store.collection(contactsV1);
    const addr = '0x' + 'ab'.repeat(20);
    expect(await code(c.put(addr, { label: '', note: '' }))).toBe('SECRET_REJECTED');
    expect(await code(c.put('ab'.repeat(16), { label: '', note: '' }))).toBe('SECRET_REJECTED');
    expect(await code(c.put('a:b', { label: '', note: '' }))).toBe('INVALID_ID');
    expect(await code(c.put('x'.repeat(65), { label: '', note: '' }))).toBe('INVALID_ID');
    const loose = store.collection<unknown>({ name: 'loose', version: 1, parse: (r) => r });
    for (const k of [
      'privateKey',
      'seedPhrase',
      'mnemonic',
      'spendKey',
      'viewingKey',
      'password',
      'secret',
      'wif',
      'signing_key',
    ]) {
      expect(await code(loose.put('r', { [k]: 'x' }))).toBe('SECRET_REJECTED');
    }
    expect(await code(loose.put('r', JSON.parse('{"__proto__":{"a":1}}') as unknown))).toBe('INVALID_VALUE');
    expect(await code(loose.put('r', { nested: { deep: { secret: 1 } } }))).toBe('SECRET_REJECTED');
    expect(Object.keys(backend.dump())).toHaveLength(0);
  });
  it('allows a tx hash value (64 hex) and a base64url token id', async () => {
    const { store } = mk();
    const c = store.collection<{ tx: string }>({
      name: 'ledger',
      version: 1,
      parse: (r) => r as { tx: string },
    });
    const id = await lookupToken(
      await globalThis.crypto.subtle.importKey(
        'raw',
        new Uint8Array(32).fill(7),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      ),
      'ledger',
      '0x' + 'ab'.repeat(20),
    );
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    await c.put(id, { tx: '0x' + '11'.repeat(32) });
    expect((await c.get(id))?.tx).toBe('0x' + '11'.repeat(32));
  });
  it('rejects cycles, non-JSON, class instances, huge/deep values, non-finite numbers', async () => {
    const { store } = mk();
    const c = store.collection<unknown>({ name: 'loose', version: 1, parse: (r) => r });
    const cyc: Record<string, unknown> = {};
    cyc['a'] = cyc;
    const deep = Array.from({ length: 20 }).reduce<unknown>((a) => [a], 1);
    for (const v of [
      cyc,
      undefined,
      () => 1,
      1n,
      new Date(),
      NaN,
      Infinity,
      deep,
      Array.from({ length: 30_000 }, () => 1),
    ]) {
      expect(await code(c.put('r', v))).toBe('INVALID_VALUE');
    }
    const shared = { a: 1 };
    expect(await code(c.put('r', [shared, shared]))).toBe('no-throw');
    expect(
      await code(
        createStore({ backend: new MemoryBackend(), namespace: 'm' })
          .collection({ name: 'l', version: 1, parse: (r) => r }, { maxChars: 10 })
          .put('r', 'x'.repeat(50)),
      ),
    ).toBe('TOO_LARGE');
  });
});

describe('schema versions and migration (T-5)', () => {
  it('migrates v1 -> v2 on read and writes back', async () => {
    const { store, backend } = mk();
    await store.collection(rawV1).put('c1', { name: 'Carol' });
    expect(JSON.parse(backend.dump()['gp1:main:contacts:c1']!)).toEqual({ v: 1, d: { name: 'Carol' } });
    const c2 = store.collection(contactsV2);
    expect(await c2.get('c1')).toEqual({ label: 'Carol', note: '' });
    expect(JSON.parse(backend.dump()['gp1:main:contacts:c1']!)).toEqual({
      v: 2,
      d: { label: 'Carol', note: '' },
    });
  });
  it('list migrates too; write-back failure does not fail the read', async () => {
    const mem = new MemoryBackend();
    await createStore({ backend: mem, namespace: 'main' }).collection(rawV1).put('c1', { name: 'Carol' });
    let n = 0;
    const ro: KvBackend = {
      get: (k) => mem.get(k),
      keys: () => mem.keys(),
      remove: (k) => mem.remove(k),
      set: () => (++n, Promise.reject(new Error('ro'))),
    };
    const r = await createStore({ backend: ro, namespace: 'main' }).collection(contactsV2).list();
    expect(r.items[0]?.value.label).toBe('Carol');
    expect(n).toBe(1);
  });
  it('missing or throwing migration -> MIGRATION_FAILED and data untouched', async () => {
    const { store, backend } = mk();
    await store.collection(rawV1).put('c1', { name: 'Carol' });
    await backend.set('gp1:main:contacts:c2', JSON.stringify({ v: 1, d: { wrong: 1 } }));
    const before = backend.dump();
    expect(await code(store.collection({ ...contactsV2, migrations: {} }).get('c1'))).toBe(
      'MIGRATION_FAILED',
    );
    expect(await code(store.collection(contactsV2).get('c2'))).toBe('MIGRATION_FAILED');
    await backend.set('gp1:main:contacts:c3', JSON.stringify({ v: 1, d: { name: 'x' } }));
    const badOut: CollectionDef<Contact> = { ...contactsV2, migrations: { 1: () => ({ nope: 1 }) } };
    expect(await code(store.collection(badOut).get('c3'))).toBe('MIGRATION_FAILED');
    expect(backend.dump()['gp1:main:contacts:c1']).toBe(before['gp1:main:contacts:c1']);
  });
  it('future version: read fails, put refuses to overwrite', async () => {
    const { store, backend } = mk();
    const raw = JSON.stringify({ v: 9, d: { whatever: 1 } });
    await backend.set('gp1:main:contacts:f1', raw);
    const c = store.collection(contactsV2);
    expect(await code(c.get('f1'))).toBe('FUTURE_VERSION');
    expect(await code(c.put('f1', { label: 'x', note: '' }))).toBe('FUTURE_VERSION');
    expect(await backend.get('gp1:main:contacts:f1')).toBe(raw);
    const l = await c.list();
    expect(l.failed).toEqual([{ id: 'f1', code: 'FUTURE_VERSION' }]);
  });
  it('corrupt records are reported, other records unaffected, damaged ones may be replaced', async () => {
    const { store, backend } = mk();
    const c = store.collection(contactsV1);
    await c.put('good', { label: 'g', note: '' });
    const bad: Record<string, string> = {
      b1: 'not json',
      b2: '[]',
      b3: '{"v":0,"d":{}}',
      b4: '{"v":1}',
      b5: '{"v":1,"d":{"label":1,"note":""}}',
      b6: '{"v":1,"d":{},"x":1}',
      b7: '{"v":1.5,"d":{}}',
      b8: '{"v":1,"s":5}',
      b9: '{"v":1,"d":{"privateKey":"x"}}',
      b10: '{"v":1,"d":1,"s":"abc"}',
      b11: 'x'.repeat(600_000),
    };
    for (const [id, raw] of Object.entries(bad)) await backend.set(`gp1:main:contacts:${id}`, raw);
    for (const id of Object.keys(bad)) expect(await code(c.get(id))).toBe('CORRUPT');
    const l = await c.list();
    expect(l.items.map((i) => i.id)).toEqual(['good']);
    expect(l.failed).toHaveLength(Object.keys(bad).length);
    await c.put('b1', { label: 'fixed', note: '' });
    expect((await c.get('b1'))?.label).toBe('fixed');
  });
});

describe('quota and availability', () => {
  it('quota error maps to QUOTA_EXCEEDED and leaves old data intact', async () => {
    const { store, backend } = mk(400);
    const c = store.collection(contactsV1);
    await c.put('a', { label: 'a', note: '' });
    const before = backend.dump();
    expect(await code(c.put('b', { label: 'x'.repeat(1000), note: '' }))).toBe('QUOTA_EXCEEDED');
    expect(backend.dump()).toEqual(before);
    expect(storeErrorToAppCode('QUOTA_EXCEEDED')).toBe('STORAGE_QUOTA');
  });
  it('toStoreError classification never leaks message', () => {
    expect(
      toStoreError(Object.assign(new Error('secret https://x'), { name: 'QuotaExceededError' })).code,
    ).toBe('QUOTA_EXCEEDED');
    expect(toStoreError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }).code).toBe('QUOTA_EXCEEDED');
    expect(toStoreError({ code: 22 }).code).toBe('QUOTA_EXCEEDED');
    expect(toStoreError({ code: 1014 }).code).toBe('QUOTA_EXCEEDED');
    expect(toStoreError({ name: 'SecurityError' }).code).toBe('UNAVAILABLE');
    expect(toStoreError(new Error('boom https://x')).message).toBe('storage error');
    expect(toStoreError('str').code).toBe('IO_ERROR');
    expect(toStoreError(null).code).toBe('IO_ERROR');
    expect(
      toStoreError({
        get name(): string {
          throw new Error('x');
        },
      }).code,
    ).toBe('IO_ERROR');
    const se = new StoreError('CORRUPT');
    expect(toStoreError(se)).toBe(se);
  });
  it('app code mapping', () => {
    expect(storeErrorToAppCode('UNAVAILABLE')).toBe('STORAGE_BLOCKED');
    for (const c of ['CORRUPT', 'DECRYPT', 'FUTURE_VERSION', 'MIGRATION_FAILED'] as const)
      expect(storeErrorToAppCode(c)).toBe('STORAGE_CORRUPT');
    expect(storeErrorToAppCode('INVALID_ID')).toBeUndefined();
  });
  it('fromWebStorage adapts Storage and maps blocked accessors', async () => {
    const m = new Map<string, string>();
    const ws: WebStorageLike = {
      get length() {
        return m.size;
      },
      key: (i) => [...m.keys()][i] ?? null,
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
      removeItem: (k) => void m.delete(k),
    };
    const c = createStore({ backend: fromWebStorage(ws), namespace: 'main' }).collection(contactsV1);
    await c.put('a', { label: 'a', note: '' });
    expect(await c.count()).toBe(1);
    expect(m.has('gp1:main:contacts:a')).toBe(true);
    const sparse: WebStorageLike = { ...ws, length: 2, key: (i) => (i === 0 ? 'zzz' : null) };
    expect(await fromWebStorage(sparse).keys()).toEqual(['zzz']);
    const blocked: WebStorageLike = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw Object.assign(new Error('blocked'), { name: 'SecurityError' });
      },
      setItem: () => {
        throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      },
      removeItem: () => {
        throw new Error('x');
      },
    };
    const cb = createStore({ backend: fromWebStorage(blocked), namespace: 'main' }).collection(contactsV1);
    expect(await code(cb.get('a'))).toBe('UNAVAILABLE');
    expect(await code(cb.delete('a'))).toBe('IO_ERROR');
    const withSet = fromWebStorage({ ...blocked, getItem: () => null });
    expect(await code(withSet.set('k', 'v'))).toBe('QUOTA_EXCEEDED');
  });
});

describe('sealed collections (T-2, T-3, T-4)', () => {
  const rnd = (n: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(n));
  const sealerFor = async (vk: Uint8Array, name: string) =>
    createAesGcmSealer(await deriveSealKey(vk, new Uint8Array(16).fill(3), name), rnd);
  const vk = new Uint8Array(32).fill(9);

  it('round-trips and leaves no plaintext in the dump (T-4)', async () => {
    const { store, backend } = mk();
    const c = store.collection(contactsV1, { sealer: await sealerFor(vk, 'contacts') });
    await c.put('r1', { label: 'Alice Wonderland', note: '0x' + 'ab'.repeat(20) });
    expect((await c.get('r1'))?.label).toBe('Alice Wonderland');
    const dump = JSON.stringify(backend.dump());
    expect(dump).not.toContain('Alice');
    expect(dump).not.toContain('abab');
    expect(JSON.parse(backend.dump()['gp1:main:contacts:r1']!)).toMatchObject({ v: 1 });
  });
  it('fresh IV per record: same plaintext gives different ciphertext', async () => {
    const { store, backend } = mk();
    const c = store.collection(contactsV1, { sealer: await sealerFor(vk, 'contacts') });
    await c.put('r1', { label: 'same', note: '' });
    await c.put('r2', { label: 'same', note: '' });
    const d = backend.dump();
    expect(d['gp1:main:contacts:r1']).not.toBe(d['gp1:main:contacts:r2']);
  });
  it('flipped byte -> DECRYPT; other records unaffected (T-2)', async () => {
    const { store, backend } = mk();
    const c = store.collection(contactsV1, { sealer: await sealerFor(vk, 'contacts') });
    await c.put('r1', { label: 'a', note: '' });
    await c.put('r2', { label: 'b', note: '' });
    const env = JSON.parse(backend.dump()['gp1:main:contacts:r1']!) as { v: number; s: string };
    const flipped = env.s.slice(0, 20) + (env.s[20] === 'A' ? 'B' : 'A') + env.s.slice(21);
    await backend.set('gp1:main:contacts:r1', JSON.stringify({ v: 1, s: flipped }));
    expect(await code(c.get('r1'))).toBe('DECRYPT');
    expect((await c.get('r2'))?.label).toBe('b');
    expect((await c.list()).failed).toEqual([{ id: 'r1', code: 'DECRYPT' }]);
  });
  it('swapping ciphertext between records fails (T-3); version tamper fails; garbage fails', async () => {
    const { store, backend } = mk();
    const c = store.collection(contactsV1, { sealer: await sealerFor(vk, 'contacts') });
    await c.put('r1', { label: 'a', note: '' });
    await c.put('r2', { label: 'b', note: '' });
    const d = backend.dump();
    await backend.set('gp1:main:contacts:r1', d['gp1:main:contacts:r2']!);
    expect(await code(c.get('r1'))).toBe('DECRYPT');
    const env = JSON.parse(d['gp1:main:contacts:r2']!) as { s: string };
    const c2 = store.collection(
      { ...contactsV1, version: 2, migrations: { 1: (r) => r } },
      { sealer: await sealerFor(vk, 'contacts') },
    );
    await backend.set('gp1:main:contacts:r2', JSON.stringify({ v: 2, s: env.s }));
    expect(await code(c2.get('r2'))).toBe('DECRYPT');
    for (const s of ['', '***', 'AAAA', 'A'.repeat(100)]) {
      await backend.set('gp1:main:contacts:r3', JSON.stringify({ v: 1, s }));
      expect(await code(c.get('r3'))).toBe('DECRYPT');
    }
  });
  it('wrong viewing key and wrong collection key cannot decrypt', async () => {
    const { store } = mk();
    await store
      .collection(contactsV1, { sealer: await sealerFor(vk, 'contacts') })
      .put('r1', { label: 'a', note: '' });
    const wrong = store.collection(contactsV1, {
      sealer: await sealerFor(new Uint8Array(32).fill(8), 'contacts'),
    });
    expect(await code(wrong.get('r1'))).toBe('DECRYPT');
    const otherInfo = store.collection(contactsV1, { sealer: await sealerFor(vk, 'ledger') });
    expect(await code(otherInfo.get('r1'))).toBe('DECRYPT');
  });
  it('sealed record without sealer -> SEALER_REQUIRED', async () => {
    const { store } = mk();
    await store
      .collection(contactsV1, { sealer: await sealerFor(vk, 'contacts') })
      .put('r1', { label: 'a', note: '' });
    expect(await code(store.collection(contactsV1).get('r1'))).toBe('SEALER_REQUIRED');
  });
  it('sealed migration re-encrypts at new version', async () => {
    const { store, backend } = mk();
    const sealer = await sealerFor(vk, 'contacts');
    await store.collection(rawV1, { sealer }).put('c1', { name: 'Carol' });
    expect((await store.collection(contactsV2, { sealer }).get('c1'))?.label).toBe('Carol');
    expect(JSON.parse(backend.dump()['gp1:main:contacts:c1']!)).toMatchObject({ v: 2 });
    expect(JSON.stringify(backend.dump())).not.toContain('Carol');
  });
  it('sealed payload that decrypts to non-JSON or bad schema is CORRUPT', async () => {
    const { store, backend } = mk();
    const sealer = await sealerFor(vk, 'contacts');
    const aad = 'gp1|main|contacts|r1|1';
    await backend.set(
      'gp1:main:contacts:r1',
      JSON.stringify({ v: 1, s: await sealer.seal('not json', aad) }),
    );
    expect(await code(store.collection(contactsV1, { sealer }).get('r1'))).toBe('CORRUPT');
  });
  it('key derivation input checks and bad IV length', async () => {
    await expect(deriveSealKey(new Uint8Array(4), new Uint8Array(16), 'contacts')).rejects.toThrow(
      StoreError,
    );
    await expect(deriveSealKey(vk, new Uint8Array(4), 'contacts')).rejects.toThrow(StoreError);
    await expect(deriveSealKey(vk, new Uint8Array(16), 'Bad Name')).rejects.toThrow(StoreError);
    const key = await deriveSealKey(vk, new Uint8Array(16), 'contacts');
    await expect(createAesGcmSealer(key, () => new Uint8Array(3)).seal('x', 'a')).rejects.toThrow(StoreError);
    const s = createAesGcmSealer(key, rnd);
    expect(await s.open(await s.seal('héllo ✓', 'a'), 'a')).toBe('héllo ✓');
    await expect(s.open(await s.seal('x', 'a'), 'b')).rejects.toThrow(StoreError);
  });
  it('property: any JSON-safe value round-trips sealed', async () => {
    const { store } = mk();
    const c = store.collection<{ s: string; n: number }>(
      { name: 'prop', version: 1, parse: (r) => r as { s: string; n: number } },
      { sealer: await sealerFor(vk, 'prop') },
    );
    await fc.assert(
      fc.asyncProperty(fc.string({ unit: 'binary' }), fc.integer(), async (s, n) => {
        await c.put('p', { s: s.replace(/[\ud800-\udfff]/g, ''), n });
        expect((await c.get('p'))?.n).toBe(n);
      }),
      { numRuns: 40 },
    );
  });
});

describe('hasOnlyKeys', () => {
  it('rejects non-objects, arrays and extra keys', () => {
    expect(hasOnlyKeys({ a: 1 }, ['a', 'b'])).toBe(true);
    expect(hasOnlyKeys({ a: 1, z: 1 }, ['a'])).toBe(false);
    expect(hasOnlyKeys([], ['a'])).toBe(false);
    expect(hasOnlyKeys(null, ['a'])).toBe(false);
    expect(hasOnlyKeys('s', ['a'])).toBe(false);
  });
});
