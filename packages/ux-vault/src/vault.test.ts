import { describe, expect, it } from 'vitest';
import { backupFromText, backupToText, createBackup, decodeBackup } from './backup.js';
import { utf8Encode } from './bytes.js';
import { type CryptoDeps, defaultCryptoDeps } from './envelope.js';
import { VaultError } from './errors.js';
import { MemoryStorage, TEST_KDF, seededRng } from './memory.testutil.js';
import { addContact } from './contacts.js';
import { INDEX_KEY, MAX_PROFILES, type ProfileSession, createVault, profileKey } from './vault.js';

const PW = 'profile-password-1';
const PW2 = 'another-password-2';
const BK = 'backup-password-xyz';
const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';

function setup(seed = 11) {
  const storage = new MemoryStorage();
  let t = 1_700_000_000_000;
  const vault = createVault({ storage, now: () => t++, rng: seededRng(seed), kdf: TEST_KDF });
  return { storage, vault };
}
const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof VaultError ? `${e.code}|${e.message}` : 'other';
  }
};
const add = (s: ProfileSession, label: string, address: string, extra: object = {}) =>
  s.mutate((b, env) => {
    const r = addContact(b, { label, address, network: 'eth', ...extra }, env);
    return { book: r.book, result: r.contact };
  });

describe('profiles', () => {
  it('creates, persists only ciphertext + public index, and unlocks', async () => {
    const { storage, vault } = setup();
    const s = await vault.createProfile({ password: PW, publicLabel: ' Personal ' });
    await add(s, 'Alice Secret', A, { note: 'very private note' });
    expect(await vault.listProfiles()).toEqual([{ id: s.profileId, publicLabel: 'Personal' }]);
    // nothing in storage contains plaintext
    for (const [, v] of storage.data) {
      const text = new TextDecoder('latin1').decode(v);
      for (const secret of ['Alice', 'Secret', A.slice(2, 12), 'private', PW])
        expect(text).not.toContain(secret);
    }
    expect([...storage.data.keys()].sort()).toEqual([INDEX_KEY, profileKey(s.profileId)].sort());
    s.lock();
    const again = await vault.unlock(s.profileId, PW);
    expect(again.getBook().contacts[0]).toMatchObject({
      label: 'Alice Secret',
      address: A,
      note: 'very private note',
    });
  });

  it('wrong password, unknown profile, malformed id and tampered blob fail identically', async () => {
    const { storage, vault } = setup();
    const s = await vault.createProfile({ password: PW });
    const msgs = new Set<string>();
    msgs.add(await codeOf(vault.unlock(s.profileId, 'wrong-password-zz')));
    msgs.add(await codeOf(vault.unlock('f'.repeat(32), PW)));
    msgs.add(await codeOf(vault.unlock('../etc/passwd', PW)));
    const blob = storage.data.get(profileKey(s.profileId))!;
    blob[blob.length - 1] = (blob[blob.length - 1] ?? 0) ^ 1;
    msgs.add(await codeOf(vault.unlock(s.profileId, PW)));
    expect([...msgs]).toEqual(['UNLOCK_FAILED|unable to decrypt: wrong password or data was modified']);
    // empty password is an input error, not a distinguishing oracle for non-empty passwords
    expect(await codeOf(vault.unlock(s.profileId, ''))).toMatch(/^INVALID_INPUT/);
  });

  it('isolation: separate keys; blob swapped into another profile slot is rejected', async () => {
    const { storage, vault } = setup();
    const p1 = await vault.createProfile({ password: PW });
    const p2 = await vault.createProfile({ password: PW2 });
    await add(p1, 'OnlyInP1', A);
    expect(p2.getBook().contacts).toHaveLength(0);
    expect(await codeOf(vault.unlock(p2.profileId, PW))).toMatch(/^UNLOCK_FAILED/);
    expect(await codeOf(vault.unlock(p1.profileId, PW2))).toMatch(/^UNLOCK_FAILED/);
    // copy p1's blob over p2's slot, and make both passwords equal to rule out key difference
    storage.data.set(profileKey(p2.profileId), new Uint8Array(storage.data.get(profileKey(p1.profileId))!));
    expect(await codeOf(vault.unlock(p2.profileId, PW))).toMatch(/^UNLOCK_FAILED/);
  });

  it('same password in two profiles still yields different salts/ciphertext', async () => {
    const { storage, vault } = setup();
    const p1 = await vault.createProfile({ password: PW });
    const p2 = await vault.createProfile({ password: PW });
    const b1 = storage.data.get(profileKey(p1.profileId))!;
    const b2 = storage.data.get(profileKey(p2.profileId))!;
    expect(b1.slice(26, 42)).not.toEqual(b2.slice(26, 42));
  });

  it('lock drops access', async () => {
    const { vault } = setup();
    const s = await vault.createProfile({ password: PW });
    expect(s.isLocked).toBe(false);
    s.lock();
    expect(s.isLocked).toBe(true);
    expect(() => s.getBook()).toThrowError(expect.objectContaining({ code: 'LOCKED' }));
    await expect(add(s, 'x', A)).rejects.toMatchObject({ code: 'LOCKED' });
    await expect(s.exportBackup(BK)).rejects.toMatchObject({ code: 'LOCKED' });
    await expect(s.changePassword(PW, PW2)).rejects.toMatchObject({ code: 'LOCKED' });
    await expect(s.importBackup(new Uint8Array(100), BK, { mode: 'merge' })).rejects.toMatchObject({
      code: 'LOCKED',
    });
  });

  it('input validation, limits, delete', async () => {
    const { storage, vault } = setup();
    await expect(vault.createProfile({ password: 'short' })).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    await expect(vault.createProfile({ password: PW, publicLabel: 'x‮y' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(vault.createProfile({ password: PW, publicLabel: 'x'.repeat(41) })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    const ids: string[] = [];
    for (let i = 0; i < MAX_PROFILES; i++) ids.push((await vault.createProfile({ password: PW })).profileId);
    await expect(vault.createProfile({ password: PW })).rejects.toMatchObject({ code: 'LIMIT' });
    await vault.deleteProfile(ids[0]!);
    expect((await vault.listProfiles()).map((p) => p.id)).not.toContain(ids[0]);
    expect(storage.data.get(profileKey(ids[0]!))?.length).toBe(0);
    expect(await codeOf(vault.unlock(ids[0]!, PW))).toMatch(/^UNLOCK_FAILED/);
    await expect(vault.deleteProfile(ids[0]!)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(vault.deleteProfile('bad')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rng duplicate-id guard', async () => {
    const storage = new MemoryStorage();
    const vault = createVault({ storage, now: () => 1, rng: (n) => new Uint8Array(n), kdf: TEST_KDF });
    // 16 zero bytes: id ok, salt ok, but second profile collides on id; salt/nonce reuse is the rng's problem
    await vault.createProfile({ password: PW });
    await expect(vault.createProfile({ password: PW })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('storage failures surface as STORAGE and leave memory state untouched', async () => {
    const { storage, vault } = setup();
    const s = await vault.createProfile({ password: PW });
    await add(s, 'Keep', A);
    storage.failNext = 'put';
    await expect(add(s, 'Lost', B)).rejects.toMatchObject({ code: 'STORAGE' });
    expect(s.getBook().contacts.map((c) => c.label)).toEqual(['Keep']);
    storage.failNext = 'get';
    await expect(vault.listProfiles()).rejects.toMatchObject({ code: 'STORAGE' });
    // queue keeps working after a failure
    await add(s, 'After', B);
    expect(s.getBook().contacts).toHaveLength(2);
  });

  it('corrupt index / blob are reported as CORRUPT', async () => {
    const { storage, vault } = setup();
    const s = await vault.createProfile({ password: PW });
    const set = (k: string, v: string) => storage.data.set(k, utf8Encode(v));
    for (const bad of [
      '{',
      'null',
      '{"v":2,"profiles":[]}',
      '{"v":1,"profiles":{}}',
      '{"v":1,"profiles":[5]}',
      `{"v":1,"profiles":[{"id":"x","publicLabel":""}]}`,
      `{"v":1,"profiles":[{"id":"${'a'.repeat(32)}","publicLabel":"a\\u202eb"}]}`,
      `{"v":1,"profiles":[{"id":"${'a'.repeat(32)}","publicLabel":""},{"id":"${'a'.repeat(32)}","publicLabel":""}]}`,
      JSON.stringify({ v: 1, profiles: new Array(17).fill({ id: 'a'.repeat(32), publicLabel: '' }) }),
    ]) {
      set(INDEX_KEY, bad);
      await expect(vault.listProfiles()).rejects.toMatchObject({ code: 'CORRUPT' });
    }
    storage.data.set(INDEX_KEY, new Uint8Array([0xff, 0xfe]));
    await expect(vault.listProfiles()).rejects.toMatchObject({ code: 'CORRUPT' });
    storage.data.delete(INDEX_KEY);
    expect(await vault.listProfiles()).toEqual([]);
    storage.data.set(profileKey(s.profileId), new Uint8Array(80));
    expect(await codeOf(vault.unlock(s.profileId, PW))).toMatch(/^CORRUPT/);
  });

  it('authenticated payload that is invalid json/schema is CORRUPT/UNSUPPORTED on unlock', async () => {
    const { storage, vault } = setup();
    const s = await vault.createProfile({ password: PW });
    // Build a legitimately authenticated blob with a future schema via the backup-independent path:
    const { newKeyContext, seal } = await import('./envelope.js');
    const deps: CryptoDeps = { ...defaultCryptoDeps(TEST_KDF), rng: seededRng(99) };
    const ctx = await newKeyContext(deps, PW, s.profileId, 'profile');
    storage.data.set(
      profileKey(s.profileId),
      await seal(deps, ctx, utf8Encode('{"schema":9,"contacts":[]}')),
    );
    expect(await codeOf(vault.unlock(s.profileId, PW))).toMatch(/^UNSUPPORTED_VERSION/);
    // header id mismatching the slot
    const other = await newKeyContext(deps, PW, 'e'.repeat(32), 'profile');
    storage.data.set(
      profileKey(s.profileId),
      await seal(deps, other, utf8Encode('{"schema":2,"contacts":[]}')),
    );
    expect(await codeOf(vault.unlock(s.profileId, PW))).toMatch(/^UNLOCK_FAILED/);
  });

  it('changePassword requires the current password and re-salts', async () => {
    const { storage, vault } = setup();
    const s = await vault.createProfile({ password: PW });
    await add(s, 'Alice', A);
    const before = new Uint8Array(storage.data.get(profileKey(s.profileId))!);
    await expect(s.changePassword('not-the-password', PW2)).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
    await expect(s.changePassword(PW, 'short')).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    await s.changePassword(PW, PW2);
    const after = storage.data.get(profileKey(s.profileId))!;
    expect(after.slice(26, 42)).not.toEqual(before.slice(26, 42));
    await add(s, 'Bob', B); // session keeps working with the new key
    expect(await codeOf(vault.unlock(s.profileId, PW))).toMatch(/^UNLOCK_FAILED/);
    expect((await vault.unlock(s.profileId, PW2)).getBook().contacts).toHaveLength(2);
    storage.data.set(profileKey(s.profileId), new Uint8Array(0));
    await expect(s.changePassword(PW2, PW)).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
  });

  it('serialises concurrent mutations', async () => {
    const { vault } = setup();
    const s = await vault.createProfile({ password: PW });
    await Promise.all(Array.from({ length: 6 }, (_, i) => add(s, `N${i}`, `0x${String(i + 1).repeat(40)}`)));
    expect(s.getBook().contacts).toHaveLength(6);
    expect((await vault.unlock(s.profileId, PW)).getBook().contacts).toHaveLength(6);
  });

  it('invalid vault options fail fast; default rng works', async () => {
    expect(() =>
      createVault({ storage: new MemoryStorage(), now: () => 1, kdf: { iterations: 0, minIterations: 0 } }),
    ).toThrow();
    const v = createVault({ storage: new MemoryStorage(), now: () => 1, kdf: TEST_KDF });
    const s = await v.createProfile({ password: PW });
    expect(s.profileId).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('backup and import', () => {
  async function twoProfiles() {
    const { storage, vault } = setup(21);
    const src = await vault.createProfile({ password: PW, publicLabel: 'src' });
    await add(src, 'Alice', A, { tags: ['friends'] });
    await add(src, 'Bob', B);
    const dst = await vault.createProfile({ password: PW2, publicLabel: 'dst' });
    return { storage, vault, src, dst };
  }

  it('export -> import (merge) into another profile, persisted and re-unlockable', async () => {
    const { vault, src, dst } = await twoProfiles();
    const blob = await src.exportBackup(BK);
    expect(new TextDecoder('latin1').decode(blob)).not.toContain('Alice');
    const rep = await dst.importBackup(blob, BK, { mode: 'merge' });
    expect(rep.added).toHaveLength(2);
    expect(rep.migratedFrom).toBeUndefined();
    expect((await vault.unlock(dst.profileId, PW2)).getBook().contacts.map((c) => c.label)).toEqual([
      'Alice',
      'Bob',
    ]);
    const again = await dst.importBackup(blob, BK, { mode: 'merge' });
    expect(again).toMatchObject({ added: [], unchanged: rep.added });
  });

  it('replace import discards local contacts', async () => {
    const { dst, src } = await twoProfiles();
    await add(dst, 'Local', '0x' + '9'.repeat(40));
    const rep = await dst.importBackup(await src.exportBackup(BK), BK, { mode: 'replace' });
    expect(rep.removed).toHaveLength(1);
    expect(dst.getBook().contacts.map((c) => c.label)).toEqual(['Alice', 'Bob']);
  });

  it('failed import changes nothing', async () => {
    const { dst, src } = await twoProfiles();
    const blob = await src.exportBackup(BK);
    await expect(dst.importBackup(blob, 'wrong-backup-pw!', { mode: 'replace' })).rejects.toMatchObject({
      code: 'DECRYPT_FAILED',
    });
    expect(dst.getBook().contacts).toHaveLength(0);
  });

  it('backup password must be strong; profile password does not open a backup unless equal', async () => {
    const { src } = await twoProfiles();
    await expect(src.exportBackup('short')).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    const blob = await src.exportBackup(BK);
    const deps = { ...defaultCryptoDeps(TEST_KDF), rng: seededRng(1) };
    await expect(decodeBackup(deps, blob, PW)).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
  });

  it('tamper / truncate / extend / swap-purpose / re-label are detected', async () => {
    const { src, storage } = await twoProfiles();
    const blob = await src.exportBackup(BK);
    const deps = { ...defaultCryptoDeps(TEST_KDF), rng: seededRng(1) };
    const results = new Set<string>();
    for (const i of [10, 20, 30, 45, 54, 60, blob.length - 1]) {
      const t = new Uint8Array(blob);
      t[i] = (t[i] ?? 0) ^ 0x80;
      results.add(await codeOf(decodeBackup(deps, t, BK)));
    }
    expect([...results]).toEqual(['DECRYPT_FAILED|unable to decrypt: wrong password or data was modified']);
    expect(await codeOf(decodeBackup(deps, blob.slice(0, blob.length - 1), BK))).toMatch(/^DECRYPT_FAILED/);
    expect(await codeOf(decodeBackup(deps, new Uint8Array([...blob, 0]), BK))).toMatch(/^DECRYPT_FAILED/);
    expect(await codeOf(decodeBackup(deps, blob.slice(0, 30), BK))).toMatch(/^CORRUPT/);
    // a profile-at-rest blob can't be fed as a backup
    expect(await codeOf(decodeBackup(deps, storage.data.get(profileKey(src.profileId))!, PW))).toMatch(
      /^CORRUPT/,
    );
  });

  it('migrates a v1 backup on import', async () => {
    const { dst } = await twoProfiles();
    const deps = { ...defaultCryptoDeps(TEST_KDF), rng: seededRng(5) };
    const { newKeyContext, seal } = await import('./envelope.js');
    const ctx = await newKeyContext(deps, BK, 'c'.repeat(32), 'backup');
    const v1 = JSON.stringify({
      schema: 1,
      entries: [
        {
          id: '4'.repeat(32),
          name: 'Old Carol',
          address: '0x' + '4'.repeat(40),
          chain: 'eth',
          tag: 'legacy',
          ts: 123,
        },
      ],
    });
    const rep = await dst.importBackup(await seal(deps, ctx, utf8Encode(v1)), BK, { mode: 'merge' });
    expect(rep.migratedFrom).toBe(1);
    expect(dst.getBook().contacts[0]).toMatchObject({ label: 'Old Carol', tags: ['legacy'], createdAt: 123 });
  });

  it('authenticated but invalid / future payloads are rejected', async () => {
    const { dst } = await twoProfiles();
    const deps = { ...defaultCryptoDeps(TEST_KDF), rng: seededRng(5) };
    const { newKeyContext, seal } = await import('./envelope.js');
    const ctx = await newKeyContext(deps, BK, 'c'.repeat(32), 'backup');
    const mk = async (s: string) => seal(deps, ctx, utf8Encode(s));
    await expect(
      dst.importBackup(await mk('{"schema":3,"contacts":[]}'), BK, { mode: 'merge' }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_VERSION' });
    await expect(dst.importBackup(await mk('garbage'), BK, { mode: 'merge' })).rejects.toMatchObject({
      code: 'CORRUPT',
    });
    await expect(
      dst.importBackup(await mk('{"schema":2,"contacts":[{"id":"x"}]}'), BK, { mode: 'replace' }),
    ).rejects.toMatchObject({ code: 'CORRUPT' });
    const bad = new Uint8Array(await mk('{}'));
    await expect(dst.importBackup(bad, BK, { mode: 'merge' })).rejects.toMatchObject({ code: 'CORRUPT' });
    expect(dst.getBook().contacts).toHaveLength(0);
  });

  it('text form round-trips and rejects junk', async () => {
    const { src } = await twoProfiles();
    const blob = await src.exportBackup(BK);
    const text = backupToText(blob);
    expect(text.startsWith('GPVB1.')).toBe(true);
    expect(backupFromText(`\n ${text} \n`)).toEqual(blob);
    expect(() => backupFromText('hello')).toThrowError(expect.objectContaining({ code: 'CORRUPT' }));
    expect(() => backupFromText('GPVB1.@@@')).toThrowError(expect.objectContaining({ code: 'CORRUPT' }));
  });

  it('createBackup records export time and source profile', async () => {
    const deps = { ...defaultCryptoDeps(TEST_KDF), rng: seededRng(8) };
    const blob = await createBackup(deps, { contacts: [] }, 'd'.repeat(32), BK, 4242);
    const d = await decodeBackup(deps, blob, BK);
    expect(d).toMatchObject({ sourceProfileId: 'd'.repeat(32), exportedAt: 4242, migratedFrom: undefined });
    expect(d.book.contacts).toEqual([]);
  });
});
