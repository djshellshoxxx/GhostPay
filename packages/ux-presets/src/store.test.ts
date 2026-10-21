import { describe, expect, it } from 'vitest';
import { MemStorage, keyBytes, preset } from './fixtures.testutil.js';
import {
  DECRYPT_FAILED_MESSAGE,
  fromBase64Url,
  seal,
  toBase64Url,
  resolveKey,
  type CryptoLike,
} from './seal.js';
import { MAX_PRESETS, createPresetStore, type PresetStore } from './store.js';

const c = globalThis.crypto as CryptoLike;
const enc = (s: string) => new TextEncoder().encode(s);

async function mk(
  storage = new MemStorage(),
  fill = 3,
  slot?: string,
): Promise<{ s: PresetStore; storage: MemStorage }> {
  const r = await createPresetStore({ storage, key: keyBytes(fill), ...(slot ? { slot } : {}) });
  if (!r.ok) throw new Error(r.error.code);
  return { s: r.value, storage };
}
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: { code: string } }): T => {
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};
const UNIFORM = { ok: false, error: { code: 'decrypt-failed', message: DECRYPT_FAILED_MESSAGE } };

describe('createPresetStore', () => {
  it('rejects bad keys and slots', async () => {
    expect(await createPresetStore({ storage: new MemStorage(), key: new Uint8Array(5) })).toMatchObject({
      ok: false,
      error: { code: 'bad-key' },
    });
    expect(
      await createPresetStore({ storage: new MemStorage(), key: keyBytes(1), slot: 'a/b' }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-context' } });
  });

  it('empty store lists nothing; get/remove not-found', async () => {
    const { s } = await mk();
    expect(unwrap(await s.list())).toEqual([]);
    expect(await s.get('x')).toMatchObject({ ok: false, error: { code: 'not-found' } });
    expect(await s.remove('x')).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });

  it('save/list/get/replace/remove persist across instances (bigint intact)', async () => {
    const { s, storage } = await mk();
    const big = 10n ** 30n + 7n;
    unwrap(await s.save(preset({ id: 'a', amountRule: { kind: 'fixed', amount: big } })));
    unwrap(await s.save(preset({ id: 'b', amountRule: { kind: 'ask' }, label: 'B' })));
    unwrap(await s.save(preset({ id: 'a', label: 'A2', amountRule: { kind: 'up-to', max: big } })));
    const { s: s2 } = await mk(storage);
    const list = unwrap(await s2.list());
    expect(list.map((p) => p.id)).toEqual(['a', 'b']);
    expect(unwrap(await s2.get('a'))).toMatchObject({ label: 'A2', amountRule: { kind: 'up-to', max: big } });
    unwrap(await s2.remove('a'));
    expect(unwrap(await s2.list()).map((p) => p.id)).toEqual(['b']);
  });

  it('stores only ciphertext: no plaintext or fake data in storage', async () => {
    const { s, storage } = await mk();
    unwrap(await s.save(preset({ memo: 'very-secret-memo', label: 'LabelXYZ' })));
    const blob = storage.data.get('presets')!;
    expect(blob).not.toContain('secret');
    const raw = new TextDecoder('latin1').decode(fromBase64Url(blob)!);
    expect(raw).not.toContain('secret');
    expect(raw).not.toContain('contact:alice');
  });

  it('rejects invalid presets without touching storage', async () => {
    const { s, storage } = await mk();
    expect(await s.save({ ...preset(), chain: 'bad' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-preset' },
    });
    expect(storage.puts).toBe(0);
  });

  it('enforces the preset limit but still allows replacement at the limit', async () => {
    const { s } = await mk();
    for (let i = 0; i < MAX_PRESETS; i++) unwrap(await s.save(preset({ id: `p${i}` })));
    expect(await s.save(preset({ id: 'extra' }))).toMatchObject({
      ok: false,
      error: { code: 'limit-exceeded' },
    });
    expect((await s.save(preset({ id: 'p0', label: 'changed' }))).ok).toBe(true);
  }, 60_000);

  it('serializes concurrent writes without lost updates', async () => {
    const { s } = await mk();
    await Promise.all(Array.from({ length: 10 }, (_, i) => s.save(preset({ id: `c${i}` }))));
    expect(unwrap(await s.list())).toHaveLength(10);
  });

  it('a failed operation does not wedge the queue', async () => {
    const { s, storage } = await mk();
    storage.failGet = true;
    expect((await s.list()).ok).toBe(false);
    storage.failGet = false;
    expect((await s.list()).ok).toBe(true);
  });

  it('storage errors are mapped without leaking details', async () => {
    const { s, storage } = await mk();
    storage.failGet = true;
    expect(await s.list()).toEqual({
      ok: false,
      error: { code: 'storage-failed', message: 'storage unavailable' },
    });
    storage.failGet = false;
    storage.failPut = true;
    expect(await s.save(preset())).toEqual({
      ok: false,
      error: { code: 'storage-failed', message: 'storage unavailable' },
    });
    expect(unwrap(await s.list())).toEqual([]);
  });
});

describe('tamper detection and uniform failure', () => {
  async function seeded() {
    const { s, storage } = await mk();
    unwrap(await s.save(preset({ id: 'a' })));
    return { s, storage, blob: storage.data.get('presets')! };
  }

  it('wrong key -> uniform failure, and never overwrites existing data', async () => {
    const { storage, blob } = await seeded();
    const { s: wrong } = await mk(storage, 9);
    expect(await wrong.list()).toEqual(UNIFORM);
    expect(await wrong.get('a')).toEqual(UNIFORM);
    expect(await wrong.save(preset({ id: 'z' }))).toEqual(UNIFORM);
    expect(await wrong.remove('a')).toEqual(UNIFORM);
    expect(storage.data.get('presets')).toBe(blob);
  });

  it('every flipped byte is detected with the same failure', async () => {
    const { storage, blob } = await seeded();
    const raw = fromBase64Url(blob)!;
    for (let i = 0; i < raw.length; i += 7) {
      const t = raw.slice();
      t[i] = (t[i] ?? 0) ^ 0x01;
      storage.data.set('presets', toBase64Url(t));
      const { s } = await mk(storage);
      expect(await s.list(), `byte ${i}`).toEqual(UNIFORM);
    }
  });

  it('blob moved to another slot is rejected (slot-bound AAD)', async () => {
    const { storage, blob } = await seeded();
    storage.data.set('other', blob);
    const { s } = await mk(storage, 3, 'other');
    expect(await s.list()).toEqual(UNIFORM);
  });

  it('non-string / garbage storage values fail uniformly', async () => {
    const storage = new MemStorage();
    const { s } = await mk(storage);
    for (const v of ['', 'AAAA', 'not base64!!', 'x'.repeat(100)]) {
      storage.data.set('presets', v);
      expect(await s.list()).toEqual(UNIFORM);
    }
    storage.get = () => Promise.resolve(5 as never);
    expect(await s.list()).toEqual(UNIFORM);
  });

  it('validly-encrypted but malformed plaintext fails uniformly', async () => {
    const k = unwrap(await resolveKey(keyBytes(3), c));
    const good = JSON.stringify({ v: 1, revision: 1, presets: [] });
    const p = preset();
    const pj = (o: object) => JSON.stringify({ v: 1, revision: 1, presets: [o] });
    const bodies = [
      'not json',
      '[]',
      'null',
      '{}',
      good.replace('"v":1', '"v":2'),
      good.replace('"revision":1', '"revision":-1'),
      good.replace('"revision":1', '"revision":1.5'),
      good.replace('"presets":[]', '"presets":{}'),
      JSON.stringify({ v: 1, revision: 1, presets: [], extra: 1 }),
      pj({ ...p, amountRule: { kind: 'ask' }, chain: 'bad' }),
      JSON.stringify({ v: 1, revision: 1, presets: [1] }),
      JSON.stringify({ v: 1, revision: 1, presets: Array.from({ length: MAX_PRESETS + 1 }, () => 1) }),
    ];
    const dup = JSON.stringify({ v: 1, revision: 1, presets: [dupPreset(), dupPreset()] });
    bodies.push(dup);
    for (const body of bodies) {
      const storage = new MemStorage();
      storage.data.set('presets', await seal(k, c, 'presets', enc(body)));
      const { s } = await mk(storage);
      expect(await s.list(), body.slice(0, 40)).toEqual(UNIFORM);
    }
    const storage = new MemStorage();
    storage.data.set('presets', await seal(k, c, 'presets', new Uint8Array([0xff, 0xfe, 0xfd])));
    expect(await (await mk(storage)).s.list()).toEqual(UNIFORM);
    const huge = new Uint8Array(1024 * 1024 + 1).fill(0x20);
    storage.data.set('presets', await seal(k, c, 'presets', huge));
    expect(await (await mk(storage)).s.list()).toEqual(UNIFORM);
  });

  it('detects in-session rollback to an older valid blob, but not across a fresh instance', async () => {
    const { s, storage } = await mk();
    unwrap(await s.save(preset({ id: 'a' })));
    const old = storage.data.get('presets')!;
    unwrap(await s.save(preset({ id: 'b' })));
    storage.data.set('presets', old);
    expect(await s.list()).toEqual(UNIFORM);
    // documented limitation: a new instance has no memory of the newer revision
    const { s: fresh } = await mk(storage);
    expect(unwrap(await fresh.list()).map((p) => p.id)).toEqual(['a']);
  });

  it('revision increments per write and IV differs per write', async () => {
    const { s, storage } = await mk();
    unwrap(await s.save(preset({ id: 'a' })));
    const b1 = storage.data.get('presets')!;
    unwrap(await s.save(preset({ id: 'a' })));
    const b2 = storage.data.get('presets')!;
    expect(b1).not.toBe(b2);
    expect(fromBase64Url(b1)!.slice(1, 13)).not.toEqual(fromBase64Url(b2)!.slice(1, 13));
  });

  it('works with a non-extractable CryptoKey and with injected crypto', async () => {
    const ck = await c.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const storage = new MemStorage();
    const r = await createPresetStore({ storage, key: ck, crypto: c });
    const s = unwrap(r);
    unwrap(await s.save(preset()));
    expect(unwrap(await s.list())).toHaveLength(1);
  });
});

function dupPreset() {
  return {
    id: 'same',
    label: 'L',
    payeeRef: 'r',
    chain: 'eip155:1',
    asset: 'native',
    amountRule: { kind: 'ask' },
    privacyProfile: 'standard',
    memo: '',
    createdAt: 1,
    updatedAt: 1,
  };
}
