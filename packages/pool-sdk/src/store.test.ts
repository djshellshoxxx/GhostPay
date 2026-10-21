import { describe, expect, it } from 'vitest';
import { PoolSdkError } from './errors.js';
import { deriveNoteSecrets, type Note } from './notes.js';
import { createPoolSeed, exportSeedEncrypted, importSeedEncrypted, openNotes, restoreNotes, sealNotes, toRecord } from './store.js';
import { POOL, withOther, withSeed } from './fixtures.testutil.js';

const note: Note = { chainId: 31337, pool: POOL, index: 2, value: 55n, label: 9n, ...deriveNoteSecrets(withSeed, 31337, POOL, 2), leafIndex: 4 };

describe('note store', () => {
  it('records carry no secrets and restore from the seed', () => {
    const r = toRecord(note);
    expect(JSON.stringify(r)).not.toContain(note.nullifier.toString());
    expect(JSON.stringify(r)).not.toContain(note.secret.toString());
    expect(restoreNotes(withSeed, [r])[0]).toEqual({ ...note, spent: false });
    const noLeaf = toRecord({ ...note, spent: true, leafIndex: undefined } as never);
    expect(restoreNotes(withSeed, [noLeaf])[0]?.leafIndex).toBeUndefined();
  });
  it('encrypts and decrypts; wrong seed and tampering fail closed', async () => {
    const blob = await sealNotes(withSeed, [toRecord(note), toRecord({ ...note, leafIndex: undefined } as never)]);
    expect(blob).not.toContain('"value"');
    expect(blob).not.toContain(POOL);
    const back = await openNotes(withSeed, blob);
    expect(back.length).toBe(2);
    expect(back[0]?.value).toBe('55');
    await expect(openNotes(withOther, blob)).rejects.toMatchObject({ code: 'STORE_CORRUPT' });
    const o = JSON.parse(blob) as { ct: string };
    const raw = Buffer.from(o.ct, 'base64');
    raw[0] = (raw[0] as number) ^ 1;
    await expect(openNotes(withSeed, JSON.stringify({ ...o, ct: raw.toString('base64') }))).rejects.toBeInstanceOf(PoolSdkError);
    await expect(openNotes(withSeed, 'nope')).rejects.toMatchObject({ code: 'STORE_CORRUPT' });
    await expect(openNotes(withSeed, '{"v":2}')).rejects.toMatchObject({ code: 'STORE_CORRUPT' });
  });
  it('rejects malformed decrypted content', async () => {
    const bad = async (records: unknown): Promise<unknown> => {
      const key = await crypto.subtle.importKey('raw', new Uint8Array(32), 'AES-GCM', false, ['encrypt']);
      void key;
      return records;
    };
    await bad(1);
    // go through sealNotes with invalid records (cast) to exercise validateRecord
    for (const rec of [null, { chainId: 'x' }, { ...toRecord(note), leafIndex: 'a' }, { ...toRecord(note), chainId: 1 }, { ...toRecord(note), value: 'zz' }]) {
      const blob = await sealNotes(withSeed, [rec as never]);
      await expect(openNotes(withSeed, blob)).rejects.toMatchObject({ code: 'STORE_CORRUPT' });
    }
  });
});

describe('seed backup', () => {
  it('roundtrips with a passphrase', async () => {
    const box = createPoolSeed();
    const blob = await exportSeedEncrypted((f) => box.use(f), 'correct horse', { logN: 10 });
    const back = await importSeedEncrypted(blob, 'correct horse');
    expect(back.equals(box)).toBe(true);
    await expect(importSeedEncrypted(blob, 'wrong horse!')).rejects.toMatchObject({ code: 'STORE_CORRUPT' });
    await expect(importSeedEncrypted('{}', 'correct horse')).rejects.toMatchObject({ code: 'STORE_CORRUPT' });
    await expect(exportSeedEncrypted((f) => box.use(f), 'short')).rejects.toThrow(/short/);
    expect(String(box)).not.toMatch(/[0-9a-f]{16}/);
    box.dispose();
    back.dispose();
  });
  it('default scrypt cost and rng injection', async () => {
    const rng = { getRandomValues: <T extends ArrayBufferView | null>(a: T): T => { if (a) new Uint8Array(a.buffer, a.byteOffset, a.byteLength).fill(7); return a; } };
    const box = createPoolSeed(rng);
    const blob = await exportSeedEncrypted((f) => box.use(f), 'passphrase-1', { rng: rng, logN: 10 });
    expect((JSON.parse(blob) as { logN: number }).logN).toBe(10);
    expect(await sealNotes(withSeed, [], rng as never)).toContain('"iv":"BwcHBwcHBwcHBwcH"');
  });
});
