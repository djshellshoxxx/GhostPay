import { describe, expect, it } from 'vitest';
import { MemStorage, keyBytes, preset } from './fixtures.testutil.js';
import { DECRYPT_FAILED_MESSAGE } from './seal.js';
import { createPresetStore, type PresetStore } from './store.js';

const FAILED_OPEN = {
  ok: false,
  error: { code: 'decrypt-failed', message: DECRYPT_FAILED_MESSAGE },
};

async function openStore(storage: MemStorage): Promise<PresetStore> {
  const result = await createPresetStore({ storage, key: keyBytes(3) });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe('preset store disappearing-ciphertext rollback', () => {
  it('refuses a missing blob after a successful write, without replacing prior presets', async () => {
    const storage = new MemStorage();
    const store = await openStore(storage);
    expect(await store.list()).toEqual({ ok: true, value: [] });
    expect((await store.save(preset({ id: 'saved' }))).ok).toBe(true);
    const original = storage.data.get('presets');
    expect(original).toBeDefined();
    const writes = storage.puts;

    storage.data.delete('presets');
    expect(await store.list()).toEqual(FAILED_OPEN);
    expect(await store.get('saved')).toEqual(FAILED_OPEN);
    expect(await store.save(preset({ id: 'replacement' }))).toEqual(FAILED_OPEN);
    expect(await store.remove('saved')).toEqual(FAILED_OPEN);
    expect(storage.puts).toBe(writes);
    expect(storage.data.has('presets')).toBe(false);

    storage.data.set('presets', original!);
    expect((await store.list())).toMatchObject({ ok: true, value: [{ id: 'saved' }] });
    expect((await store.save(preset({ id: 'next' }))).ok).toBe(true);
    expect((await store.list())).toMatchObject({ ok: true, value: [{ id: 'saved' }, { id: 'next' }] });
  });

  it('also refuses a missing blob after reading a populated store in a new instance', async () => {
    const storage = new MemStorage();
    const writer = await openStore(storage);
    expect((await writer.save(preset({ id: 'existing' }))).ok).toBe(true);
    const observer = await openStore(storage);
    expect((await observer.list())).toMatchObject({ ok: true, value: [{ id: 'existing' }] });
    storage.data.delete('presets');
    const writes = storage.puts;
    expect(await observer.list()).toEqual(FAILED_OPEN);
    expect(await observer.save(preset({ id: 'would-clobber' }))).toEqual(FAILED_OPEN);
    expect(storage.puts).toBe(writes);
  });
});
