import { createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ARCHIVE_MAGIC, MAX_ARCHIVE_RECORDS, decodeArchive, encodeArchive, exportArchive, previewArchiveImport, type ArchiveContents } from './tagArchive';
import { MemoryTagStore, TagVault, type EncryptedTagRecord, type ProfileMeta, type TagPayload, type TagSnapshotEntry } from './tags';

const N = 1 << 14; // tests only; production default is 2^17 (see the default-parameter test)
const PASS = 'correct horse battery staple 7';
const key = (n: number): Uint8Array => new Uint8Array(32).fill(n);
const addr = (i: number): string => `0x${i.toString(16).padStart(40, '0')}`;
const payload = (i: number, over: Partial<TagPayload> = {}): TagPayload => ({
  stealthAddress: addr(i + 1),
  announcementId: `0x${'ab'.repeat(32)}:${String(i)}`,
  logIndex: i,
  clientLabel: `Client number ${String(i)}`,
  ...over,
});

async function vaultWith(count: number, store = new MemoryTagStore(), clock = () => 1_700_000_000_000): Promise<TagVault> {
  const v = new TagVault(store, clock);
  await v.unlock(key(7));
  for (let i = 0; i < count; i++) await v.save(84532, payload(i));
  return v;
}

const entries = (n: number): TagSnapshotEntry[] => Array.from({ length: n }, (_, i) => ({ chainId: 84532, createdAt: 1, updatedAt: 2, payload: payload(i) }));
const contents = (records: readonly TagSnapshotEntry[], history: Record<string, string> = {}): ArchiveContents => ({ createdAt: 1_700_000_000_000, keyVersion: 1, records, history });

describe('archive round trip', () => {
  for (const count of [1, 1000]) {
    it(`exports and re-imports ${String(count)} tag(s) into a fresh profile`, async () => {
      const src = await vaultWith(count);
      const out = await exportArchive(src, key(7), PASS, { N, now: () => Date.UTC(2026, 0, 5) });
      expect(out.filename).toBe('ghostpay-tags-20260105.gpa');
      expect(out.recordCount).toBe(count);
      expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
      const dst = new TagVault(new MemoryTagStore());
      await dst.unlock(key(9)); // a different viewing key: the archive is passphrase-keyed, not view-key-keyed
      const preview = await previewArchiveImport(dst, out.bytes, PASS, 'merge');
      expect(preview.tags).toMatchObject({ total: count, added: count, updated: 0, keptLocal: 0, removed: 0 });
      expect(await dst.list()).toHaveLength(0); // preview wrote nothing
      await dst.applyImport(preview.tags);
      const got = await dst.list(84532);
      expect(got).toHaveLength(count);
      expect(await dst.find(84532, addr(1))).toEqual(payload(0));
    }, 60_000);
  }

  it('uses the production scrypt profile by default and records it in the header', async () => {
    const bytes = await encodeArchive(contents(entries(1)), PASS);
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe(ARCHIVE_MAGIC);
    expect([bytes[4], bytes[5], bytes[6], bytes[7]]).toEqual([1, 17, 8, 1]);
  }, 60_000);

  it('rejects weak passphrases and over-cap contents', async () => {
    await expect(encodeArchive(contents(entries(1)), 'short', { N })).rejects.toThrow(/at least/);
    await expect(encodeArchive(contents(entries(MAX_ARCHIVE_RECORDS + 1)), PASS, { N })).rejects.toThrow(/at most/);
  });

  it('carries scan-history vault texts in a combined backup', async () => {
    const hist = { '84532': 'opaque-encrypted-history-text' };
    const bytes = await encodeArchive(contents(entries(2), hist), PASS, { N });
    const back = await decodeArchive(bytes, PASS);
    expect(back.history).toEqual(hist);
    expect(back.records).toHaveLength(2);
    const v = await vaultWith(0);
    expect((await previewArchiveImport(v, bytes, PASS, 'merge')).historyChains).toEqual(['84532']);
  });

  it('matches an independent node:crypto implementation of the documented format', async () => {
    const bytes = await encodeArchive(contents(entries(3)), PASS, { N });
    const salt = bytes.subarray(8, 24); const iv = bytes.subarray(24, 36); const ctAndTag = bytes.subarray(36);
    const k = scryptSync(PASS.normalize('NFKC'), salt, 32, { N, r: 8, p: 1, maxmem: 2 ** 29 });
    const d = createDecipheriv('aes-256-gcm', k, iv);
    d.setAAD(bytes.subarray(0, 24));
    d.setAuthTag(ctAndTag.subarray(ctAndTag.length - 16));
    const plain = JSON.parse(Buffer.concat([d.update(ctAndTag.subarray(0, ctAndTag.length - 16)), d.final()]).toString('utf8')) as { version: number; records: unknown[] };
    expect(plain.version).toBe(1);
    expect(plain.records).toHaveLength(3);
    // and the reverse direction: an archive built by node decodes in the app
    const salt2 = Buffer.alloc(16, 5); const iv2 = Buffer.alloc(12, 6);
    const head = Buffer.concat([Buffer.from(ARCHIVE_MAGIC), Buffer.from([1, 14, 8, 1]), salt2]);
    const c = createCipheriv('aes-256-gcm', scryptSync(PASS, salt2, 32, { N, r: 8, p: 1, maxmem: 2 ** 29 }), iv2);
    c.setAAD(head);
    const body = JSON.stringify({ version: 1, createdAt: 5, keyVersion: 1, records: [{ chainId: 1, createdAt: 1, updatedAt: 2, payload: payload(0) }], history: {} });
    const ct = Buffer.concat([c.update(body, 'utf8'), c.final(), c.getAuthTag()]);
    const decoded = await decodeArchive(new Uint8Array(Buffer.concat([head, iv2, ct])), PASS);
    expect(decoded.records[0]?.payload.clientLabel).toBe('Client number 0');
  });
});

describe('archive failure modes', () => {
  it('wrong passphrase fails with no write', async () => {
    const bytes = await encodeArchive(contents(entries(2)), PASS, { N });
    const store = new MemoryTagStore();
    const v = await vaultWith(1, store);
    const before = JSON.stringify(await store.getAll());
    await expect(previewArchiveImport(v, bytes, `${PASS} nope`, 'replace')).rejects.toThrow(/Wrong passphrase/);
    expect(JSON.stringify(await store.getAll())).toBe(before);
  });

  it('every byte of the file is authenticated or bounds-checked: flipping any single bit is rejected, with no partial write', async () => {
    const bytes = await encodeArchive(contents(entries(2)), PASS, { N });
    const store = new MemoryTagStore();
    const v = await vaultWith(1, store);
    const before = JSON.stringify(await store.getAll());
    // one bit in each field: magic, kdf id, log2N, r, p, salt, iv, first/middle/last ciphertext byte, tag byte
    const offsets = [0, 3, 4, 5, 6, 7, 8, 23, 24, 35, 36, 60, bytes.length - 17, bytes.length - 16, bytes.length - 1];
    for (const off of offsets) {
      const bad = bytes.slice();
      bad[off] = (bad[off] as number) ^ 0x01;
      await expect(previewArchiveImport(v, bad, PASS, 'merge'), `offset ${String(off)}`).rejects.toThrow();
    }
    expect(JSON.stringify(await store.getAll())).toBe(before);
  }, 60_000);

  it('rejects truncation, extension, empty input and oversize before any key derivation', async () => {
    const bytes = await encodeArchive(contents(entries(1)), PASS, { N });
    for (const bad of [new Uint8Array(0), bytes.slice(0, 10), bytes.slice(0, 40), bytes.slice(0, bytes.length - 1), new Uint8Array([...bytes, 0])]) {
      await expect(decodeArchive(bad, PASS)).rejects.toThrow();
    }
    await expect(decodeArchive(new Uint8Array(20 * 1024 * 1024 + 1), PASS)).rejects.toThrow(/not a valid/);
  });

  it('rejects hostile KDF parameters without allocating (N too large, r/p zero or huge)', async () => {
    const bytes = await encodeArchive(contents(entries(1)), PASS, { N });
    for (const [off, val] of [[5, 30], [5, 5], [6, 0], [6, 200], [7, 0], [7, 9], [4, 2]] as const) {
      const bad = bytes.slice(); bad[off] = val;
      const t = Date.now();
      await expect(decodeArchive(bad, PASS)).rejects.toThrow(/not a valid/);
      expect(Date.now() - t).toBeLessThan(500);
    }
  });

  it('fuzz: random and mutated inputs only ever fail with a user-facing error, never crash', async () => {
    const good = await encodeArchive(contents(entries(2)), PASS, { N });
    let seed = 12345;
    const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let i = 0; i < 150; i++) {
      const b = i % 3 === 0 ? Uint8Array.from({ length: rnd(300) }, () => rnd(256)) : good.slice();
      if (i % 3 !== 0) for (let k = 0; k < 1 + rnd(4); k++) { const at = 8 + rnd(b.length - 8); b[at] = (b[at] as number) ^ (1 + rnd(255)); }
      try {
        await decodeArchive(b, PASS);
        throw new Error('accepted a mutated archive');
      } catch (e) {
        expect((e as Error).name === 'UserFacingError' || (e as Error).constructor.name === 'UserFacingError', String((e as Error).message)).toBe(true);
      }
    }
  }, 120_000);

  it('strict schema: authentic archives with unknown fields or extra keys are rejected', async () => {
    const bad = contents([{ chainId: 1, createdAt: 1, updatedAt: 1, payload: { ...payload(0), extra: 'x' } as TagPayload }]);
    const bytes = await encodeArchive(bad, PASS, { N });
    await expect(decodeArchive(bytes, PASS)).rejects.toThrow(/not a valid/);
    const bad2 = contents([{ chainId: 1, createdAt: 1, updatedAt: 1, payload: payload(0, { stealthAddress: 'nope' }) }]);
    await expect(decodeArchive(await encodeArchive(bad2, PASS, { N }), PASS)).rejects.toThrow(/not a valid/);
  });
});

describe('import semantics', () => {
  it('merge keeps the newest updatedAt and reports conflicts; replace makes the local set equal to the archive', async () => {
    let t = 1000;
    const v = await vaultWith(0, new MemoryTagStore(), () => t);
    await v.save(84532, payload(0, { clientLabel: 'local newer' })); // updatedAt 1000
    t = 5000; await v.save(84532, payload(1, { clientLabel: 'local newest' })); // 5000
    const archive: TagSnapshotEntry[] = [
      { chainId: 84532, createdAt: 1, updatedAt: 9000, payload: payload(0, { clientLabel: 'archive wins' }) },
      { chainId: 84532, createdAt: 1, updatedAt: 2000, payload: payload(1, { clientLabel: 'archive loses' }) },
      { chainId: 84532, createdAt: 1, updatedAt: 2000, payload: payload(2) },
    ];
    const bytes = await encodeArchive(contents(archive), PASS, { N });
    const merge = await previewArchiveImport(v, bytes, PASS, 'merge');
    expect(merge.tags).toMatchObject({ total: 3, added: 1, updated: 1, keptLocal: 1, removed: 0 });
    await v.applyImport(merge.tags);
    expect((await v.find(84532, addr(1)))?.clientLabel).toBe('archive wins');
    expect((await v.find(84532, addr(2)))?.clientLabel).toBe('local newest');
    expect(await v.list()).toHaveLength(3);

    await v.save(84532, payload(7)); // extra local tag
    const replace = await previewArchiveImport(v, bytes, PASS, 'replace');
    expect(replace.tags).toMatchObject({ total: 3, removed: 1, keptLocal: 0 });
    await v.applyImport(replace.tags);
    expect(await v.find(84532, addr(8))).toBeUndefined();
    expect((await v.find(84532, addr(2)))?.clientLabel).toBe('archive loses');
  });

  it('rejects a stale preview after any change, lock or second apply, and a forged preview object', async () => {
    const bytes = await encodeArchive(contents(entries(2)), PASS, { N });
    const v = await vaultWith(0);
    let p = await previewArchiveImport(v, bytes, PASS, 'merge');
    await v.save(84532, payload(50));
    await expect(v.applyImport(p.tags)).rejects.toThrow(/Preview the import again/);
    p = await previewArchiveImport(v, bytes, PASS, 'merge');
    v.lock(); await v.unlock(key(7));
    await expect(v.applyImport(p.tags)).rejects.toThrow(/Preview the import again/);
    p = await previewArchiveImport(v, bytes, PASS, 'merge');
    await v.applyImport(p.tags);
    await expect(v.applyImport(p.tags)).rejects.toThrow(/Preview the import again/);
    await expect(v.applyImport({ ...p.tags })).rejects.toThrow(/Preview the import again/);
  });

  it('a failing atomic commit leaves the store unchanged', async () => {
    class Failing extends MemoryTagStore {
      public fail = false;
      public override applyBatch(...args: Parameters<MemoryTagStore['applyBatch']>): Promise<void> {
        return this.fail ? Promise.reject(new Error('disk full')) : super.applyBatch(...args);
      }
    }
    const store = new Failing();
    const v = await vaultWith(1, store);
    store.fail = true;
    const before = JSON.stringify(await store.getAll());
    const p = await previewArchiveImport(v, await encodeArchive(contents(entries(3)), PASS, { N }), PASS, 'replace');
    await expect(v.applyImport(p.tags)).rejects.toThrow('disk full');
    expect(JSON.stringify(await store.getAll())).toBe(before);
  });
});

describe('key rotation', () => {
  it('re-encrypts everything under a new salt and key version; tags stay readable; old lookup tokens are gone', async () => {
    const store = new MemoryTagStore();
    const v = await vaultWith(5, store);
    const oldMeta = await store.getMeta() as ProfileMeta;
    const oldRecords = await store.getAll();
    expect(await v.rotateKeys(key(7))).toBe(2);
    const meta = await store.getMeta() as ProfileMeta;
    expect(meta.salt).not.toBe(oldMeta.salt);
    expect(meta.keyVersion).toBe(2);
    const now = await store.getAll();
    expect(now).toHaveLength(5);
    for (const r of now) {
      const o = oldRecords.find((x) => x.recordId === r.recordId) as EncryptedTagRecord;
      expect(r.keyVersion).toBe(2);
      expect(r.lookupKey).not.toBe(o.lookupKey);
      expect(r.iv).not.toBe(o.iv);
      expect(r.ciphertext).not.toBe(o.ciphertext);
    }
    expect(await v.find(84532, addr(3))).toEqual(payload(2));
    // survives lock/unlock with the same viewing key (new salt is what unlock reads)
    v.lock(); await v.unlock(key(7));
    expect((await v.list()).length).toBe(5);
    await v.save(84532, payload(9));
    expect((await store.getAll()).every((r) => r.keyVersion === 2)).toBe(true);
  });

  it('a wrong viewing key or a locked vault refuses and changes nothing', async () => {
    const store = new MemoryTagStore();
    const v = await vaultWith(2, store);
    const before = JSON.stringify([await store.getMeta(), await store.getAll()]);
    await expect(v.rotateKeys(key(8))).rejects.toThrow(/not the viewing key/);
    v.lock();
    await expect(v.rotateKeys(key(7))).rejects.toThrow(/locked/);
    expect(JSON.stringify([await store.getMeta(), await store.getAll()])).toBe(before);
  });

  it('crash injection: failing the commit at the single atomic step leaves the old state intact and usable', async () => {
    class Crashy extends MemoryTagStore {
      public crash = false;
      public override applyBatch(...args: Parameters<MemoryTagStore['applyBatch']>): Promise<void> {
        return this.crash ? Promise.reject(new Error('crash')) : super.applyBatch(...args);
      }
    }
    const store = new Crashy();
    const v = await vaultWith(3, store);
    const before = JSON.stringify([await store.getMeta(), await store.getAll()]);
    store.crash = true;
    await expect(v.rotateKeys(key(7))).rejects.toThrow('crash');
    expect(JSON.stringify([await store.getMeta(), await store.getAll()])).toBe(before);
    // a fresh process (new vault object) can still unlock and read with the old key
    const again = new TagVault(store);
    await again.unlock(key(7));
    expect(await again.list()).toHaveLength(3);
    store.crash = false;
    expect(await again.rotateKeys(key(7))).toBe(2);
    expect(await again.list()).toHaveLength(3);
  });

  it('a damaged record aborts rotation before anything is written', async () => {
    const store = new MemoryTagStore();
    const v = await vaultWith(2, store);
    const r = (await store.getAll())[0] as EncryptedTagRecord;
    await store.put({ ...r, ciphertext: `${r.ciphertext.slice(0, -2)}00` });
    const before = JSON.stringify([await store.getMeta(), await store.getAll()]);
    await expect(v.rotateKeys(key(7))).rejects.toThrow(/could not be decrypted/);
    expect(JSON.stringify([await store.getMeta(), await store.getAll()])).toBe(before);
  });

  it('archives made before a rotation still import with their own passphrase', async () => {
    const v = await vaultWith(2);
    const old = await exportArchive(v, key(7), PASS, { N });
    await v.rotateKeys(key(7));
    const p = await previewArchiveImport(v, old.bytes, PASS, 'replace');
    await v.applyImport(p.tags);
    expect(await v.list()).toHaveLength(2);
  });
});

describe('locked vault and XSS-while-locked', () => {
  it('every read, export, import and rotation path refuses while locked', async () => {
    const v = await vaultWith(2);
    const bytes = await encodeArchive(contents(entries(1)), PASS, { N });
    v.lock();
    await expect(exportArchive(v, key(7), PASS, { N })).rejects.toThrow(/locked/);
    await expect(previewArchiveImport(v, bytes, PASS, 'merge')).rejects.toThrow(/locked/);
    await expect(v.snapshot()).rejects.toThrow(/locked/);
    await expect(v.list()).rejects.toThrow();
    await expect(v.find(84532, addr(1))).rejects.toThrow(/locked/);
    await expect(v.rotateKeys(key(7))).rejects.toThrow(/locked/);
  });

  it('script with full access to the vault object and the raw store while locked learns no plaintext or key material', async () => {
    const store = new MemoryTagStore();
    const marker = 'Secret Client <img src=x onerror=alert(1)> Ltd';
    const v = await vaultWith(0, store);
    await v.save(84532, payload(0, { clientLabel: marker, notes: 'private note xyz' }));
    v.lock();
    // what an XSS payload could read: the storage contents and every property reachable on the vault object
    const dump = JSON.stringify([await store.getMeta(), await store.getAll()]);
    for (const secret of [marker, 'private note xyz', addr(1), addr(1).slice(2), 'Secret Client']) expect(dump).not.toContain(secret);
    const reachable = Object.getOwnPropertyNames(v).map((k) => (v as unknown as Record<string, unknown>)[k]);
    expect(reachable.filter((x) => x instanceof Uint8Array || typeof x === 'string')).toEqual([]);
    expect(reachable.filter((x) => x !== undefined && typeof x === 'object' && 'type' in (x as object) && (x as CryptoKey).type === 'secret')).toEqual([]);
    expect(v.unlocked).toBe(false);
    // the hostile string is inert data after a round trip, and the stored form never carries it
    await v.unlock(key(7));
    const out = await exportArchive(v, key(7), PASS, { N });
    expect(new TextDecoder('latin1').decode(out.bytes)).not.toContain('Secret Client');
    expect((await v.find(84532, addr(1)))?.clientLabel).toBe(marker);
  });

  it('the stored IndexedDB-shaped dump contains no labels, notes or addresses', async () => {
    const store = new MemoryTagStore();
    await vaultWith(20, store);
    const dump = JSON.stringify([await store.getMeta(), await store.getAll()]);
    expect(dump).not.toMatch(/Client number/);
    expect(dump).not.toContain(addr(5).slice(2));
  });
});
