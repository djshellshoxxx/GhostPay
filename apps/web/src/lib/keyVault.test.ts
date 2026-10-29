import { afterEach, describe, expect, it } from 'vitest';
import { clearSession, exportKeystore, generateSession, getSessionBackup, getSessionPublic, importKeystore, importSession, markKeystoreDownloaded, captureSessionGuard, withSessionSecrets } from './session';
import {
  authorizeEncryptedVault,
  authorizeKeyExport,
  deleteEncryptedVault,
  loadedKeysRecoverable,
  MemoryKeyVaultStore,
  IndexedDbKeyVaultStore,
  type KeyVaultStore,
  readEncryptedVault,
  saveEncryptedVault,
  unlockEncryptedVault,
  vaultMetaAddress,
} from './keyVault';

const PASS = 'violet comet maple lantern';
const SPEND = '11'.repeat(32);
const VIEW = '22'.repeat(32);
const SIGN = '33'.repeat(32);

afterEach(() => { clearSession(); });

describe('encrypted seller vault', () => {
  it('stores only encrypted keystore text, never key bytes or the passphrase', async () => {
    const store = new MemoryKeyVaultStore();
    importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    await saveEncryptedVault(PASS, { N: 1 << 14 }, store);
    const value = await readEncryptedVault(store);
    expect(value).toBeDefined();
    expect(value).not.toContain(PASS);
    expect(value).not.toContain(SPEND);
    expect(value).not.toContain(VIEW);
    expect(value).not.toContain(SIGN);
    expect(JSON.parse(value as string)).toHaveProperty('ciphertext');
  });

  it('unlocks the same public identity after a simulated reload and rejects a wrong passphrase', async () => {
    const store = new MemoryKeyVaultStore();
    const original = importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    await saveEncryptedVault(PASS, { N: 1 << 14 }, store);
    clearSession();
    await expect(unlockEncryptedVault('wrong password entirely', store)).rejects.toThrow(/Wrong passphrase/);
    expect(getSessionPublic()).toBeUndefined();
    await unlockEncryptedVault(PASS, store);
    expect(getSessionPublic()).toEqual(original);
  });

  it('requires step-up against the same loaded keys and invalidates the guard when keys change', async () => {
    const store = new MemoryKeyVaultStore();
    const original = importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    await saveEncryptedVault(PASS, { N: 1 << 14 }, store);
    const guard = await authorizeEncryptedVault(PASS, store);
    expect(guard).toBeTypeOf('function');
    guard?.();
    const decryptedBytes: Uint8Array[] = [];
    withSessionSecrets((s) => { decryptedBytes.push(s.keys.spendingSecret); });
    expect(decryptedBytes[0]?.every((b) => b === 0)).toBe(true);
    importSession({ spendingKeyHex: '44'.repeat(32), viewingKeyHex: '55'.repeat(32), signingKeyHex: '66'.repeat(32) });
    expect(() => guard?.()).toThrow(/changed during this action/);
    await expect(authorizeEncryptedVault(PASS, store)).rejects.toThrow(/does not match/);
    expect(getSessionPublic()).not.toEqual(original);
  });

  it('rejects a key change that happens while storage is being read', async () => {
    const saved = new MemoryKeyVaultStore();
    importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    await saveEncryptedVault(PASS, { N: 1 << 14 }, saved);
    const ciphertext = await saved.get();
    let release: ((value: string | undefined) => void) | undefined;
    const delayedStore = {
      get: () => new Promise<string | undefined>((resolve) => { release = resolve; }),
      putIfEmpty: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    };
    const checking = authorizeEncryptedVault(PASS, delayedStore);
    importSession({ spendingKeyHex: '44'.repeat(32), viewingKeyHex: '55'.repeat(32), signingKeyHex: '66'.repeat(32) });
    release?.(ciphertext);
    await expect(checking).rejects.toThrow(/changed during this action/);
  });

  it('does not unlock stale ciphertext if the session changes while storage is being read', async () => {
    const saved = new MemoryKeyVaultStore();
    importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    await saveEncryptedVault(PASS, { N: 1 << 14 }, saved);
    const ciphertext = await saved.get();
    clearSession();
    let release: ((value: string | undefined) => void) | undefined;
    const delayedStore = {
      get: () => new Promise<string | undefined>((resolve) => { release = resolve; }),
      putIfEmpty: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    };
    const unlocking = unlockEncryptedVault(PASS, delayedStore);
    const replacement = generateSession();
    release?.(ciphertext);
    await expect(unlocking).rejects.toThrow(/changed during this action/);
    expect(getSessionPublic()).toBe(replacement);
  });

  it('deletes the only stored ciphertext on explicit request', async () => {
    const store = new MemoryKeyVaultStore();
    importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    await saveEncryptedVault(PASS, { N: 1 << 14 }, store);
    await deleteEncryptedVault((await readEncryptedVault(store))!, store, PASS);
    expect(await readEncryptedVault(store)).toBeUndefined();
  });

  it('deletes only the exact ciphertext that was confirmed and preserves a replacement', async () => {
    const store = new MemoryKeyVaultStore();
    importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    await saveEncryptedVault(PASS, { N: 1 << 14 }, store);
    const a = (await readEncryptedVault(store))!;
    await store.delete(a);
    await expect(deleteEncryptedVault(a, store, PASS)).rejects.toThrow(/changed since you asked to delete it/);
    importSession({ spendingKeyHex: '44'.repeat(32), viewingKeyHex: '55'.repeat(32), signingKeyHex: '66'.repeat(32) });
    await saveEncryptedVault(PASS, { N: 1 << 14 }, store);
    const b = (await readEncryptedVault(store))!;
    await expect(deleteEncryptedVault(a, store)).rejects.toThrow(/changed since you asked to delete it/);
    expect(await readEncryptedVault(store)).toBe(b);
  });

  it('fails closed when IndexedDB is unavailable and handles an empty saved vault', async () => {
    const store = new IndexedDbKeyVaultStore();
    await expect(store.get()).rejects.toThrow(/storage is unavailable/);
    await expect(store.putIfEmpty('ciphertext', () => undefined)).rejects.toThrow(/storage is unavailable/);
    await expect(store.delete('ciphertext')).rejects.toThrow(/storage is unavailable/);
    const empty = new MemoryKeyVaultStore();
    expect(await authorizeEncryptedVault(PASS, empty)).toBeUndefined();
    await expect(unlockEncryptedVault(PASS, empty)).rejects.toThrow(/No encrypted seller vault/);
  });

  it('never overwrites an existing ciphertext and rejects competing saves atomically', async () => {
    const store = new MemoryKeyVaultStore();
    importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    await saveEncryptedVault(PASS, { N: 1 << 14 }, store);
    const existing = await readEncryptedVault(store);
    await expect(saveEncryptedVault(`${PASS} other`, { N: 1 << 14 }, store)).rejects.toThrow(/already exists/);
    expect(await readEncryptedVault(store)).toBe(existing);

    // These keys are tied to the first vault now, so a second record needs that vault's passphrase (L1-02).
    const competing = new MemoryKeyVaultStore();
    const outcomes = await Promise.allSettled([
      saveEncryptedVault(PASS, { N: 1 << 14 }, competing, PASS),
      saveEncryptedVault(PASS, { N: 1 << 14 }, competing, PASS),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(await readEncryptedVault(competing)).toBeDefined();
  });

  it('refuses to persist ciphertext if the session changes while storage is being read', async () => {
    importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    let reachedRead!: () => void;
    let releaseRead!: (value: string | undefined) => void;
    let written: string | undefined;
    const readStarted = new Promise<void>((resolve) => { reachedRead = resolve; });
    const pendingRead = new Promise<string | undefined>((resolve) => { releaseRead = resolve; });
    const delayedStore = {
      get: () => { reachedRead(); return pendingRead; },
      putIfEmpty: (value: string) => { written = value; return Promise.resolve(); },
      delete: () => Promise.resolve(),
    };
    const saving = saveEncryptedVault(PASS, { N: 1 << 14 }, delayedStore);
    await readStarted;
    importSession({ spendingKeyHex: '44'.repeat(32), viewingKeyHex: '55'.repeat(32), signingKeyHex: '66'.repeat(32) });
    releaseRead(undefined);
    await expect(saving).rejects.toThrow(/changed during this action/);
    expect(written).toBeUndefined();
  });

  for (const revoke of ['clear', 'replace'] as const) {
    it(`does not commit ciphertext if the session is ${revoke === 'clear' ? 'cleared' : 'replaced'} while the PUT is pending`, async () => {
      importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
      const durable = new MemoryKeyVaultStore();
      let reachedPut!: () => void;
      let releasePut!: () => void;
      const putStarted = new Promise<void>((resolve) => { reachedPut = resolve; });
      const putGate = new Promise<void>((resolve) => { releasePut = resolve; });
      // Models the IndexedDB adapter: the write is queued behind an async DB open, then runs the real add-if-empty.
      const deferredPutStore: KeyVaultStore = {
        get: () => durable.get(),
        putIfEmpty: async (...args: Parameters<KeyVaultStore['putIfEmpty']>) => { reachedPut(); await putGate; return durable.putIfEmpty(...args); },
        delete: (...args: Parameters<KeyVaultStore['delete']>) => durable.delete(...args),
      };
      const saving = saveEncryptedVault(PASS, { N: 1 << 14 }, deferredPutStore);
      await putStarted;
      if (revoke === 'clear') clearSession();
      const replacement = revoke === 'replace' ? generateSession() : undefined;
      releasePut();
      await expect(saving).rejects.toThrow(/changed during this action/);
      expect(await durable.get()).toBeUndefined();
      expect(getSessionPublic()).toBe(replacement);
    });
  }
});

describe('L1-02: the vault step-up belongs to the session', () => {
  const OTHER = { spendingKeyHex: '44'.repeat(32), viewingKeyHex: '55'.repeat(32), signingKeyHex: '66'.repeat(32) };

  it('keeps the sweep step-up armed after the vault is deleted, with or without this tab', async () => {
    const store = new MemoryKeyVaultStore();
    importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    await saveEncryptedVault(PASS, { N: 1 << 14 }, store);
    await expect(authorizeEncryptedVault('', store)).rejects.toThrow(/Wrong passphrase/);
    await deleteEncryptedVault((await store.get())!, store, PASS);
    expect(await store.get()).toBeUndefined();
    await expect(authorizeEncryptedVault('', store)).rejects.toThrow(/Wrong passphrase/);
    expect(await authorizeEncryptedVault(PASS, store)).toBeTypeOf('function');
    // Keys unlocked from a vault stay guarded even if another tab or "clear site data" removes the record.
    clearSession();
    const saved = new MemoryKeyVaultStore();
    importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    await saveEncryptedVault(PASS, { N: 1 << 14 }, saved);
    const record = (await saved.get())!;
    clearSession();
    await unlockEncryptedVault(PASS, saved);
    await saved.delete(record);
    await expect(authorizeEncryptedVault('', saved)).rejects.toThrow(/Wrong passphrase/);
    expect(getSessionBackup()?.vaultStepUp).toBe(true);
  });

  it('deletes a vault holding the loaded keys only with its passphrase; another identity\'s vault shows its meta-address and needs none', async () => {
    const store = new MemoryKeyVaultStore();
    const loaded = importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    await saveEncryptedVault(PASS, { N: 1 << 14 }, store);
    const record = (await store.get())!;
    expect(vaultMetaAddress(record)).toBe(loaded.metaAddress);
    expect(vaultMetaAddress('{"not":"a keystore"}')).toBeUndefined();
    await expect(deleteEncryptedVault(record, store)).rejects.toThrow(/Enter its passphrase/);
    await expect(deleteEncryptedVault(record, store, 'wrong vault passphrase')).rejects.toThrow(/Wrong passphrase/);
    expect(await store.get()).toBe(record);
    importSession(OTHER);
    await deleteEncryptedVault(record, store);
    expect(await store.get()).toBeUndefined();
  });

  it('requires the vault passphrase to export keys tied to a vault, including a saved vault for the same meta-address', async () => {
    const store = new MemoryKeyVaultStore();
    importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    expect(await authorizeKeyExport('', store)).toBeUndefined();
    await saveEncryptedVault(PASS, { N: 1 << 14 }, store);
    await expect(authorizeKeyExport('attacker chosen phrase 42!', store)).rejects.toThrow(/Wrong passphrase/);
    expect(await authorizeKeyExport(PASS, store)).toBeTypeOf('function');
    // The same keys loaded from a keystore file (not armed yet) still meet the saved vault for their meta-address.
    const file = await exportKeystore('cedar orbit velvet lantern meadow', { N: 1 << 14 });
    clearSession();
    await importKeystore(file, 'cedar orbit velvet lantern meadow');
    await expect(authorizeKeyExport('', store)).rejects.toThrow(/tied to an encrypted vault/);
    const guard = await authorizeKeyExport(PASS, store);
    importSession(OTHER);
    expect(() => guard?.()).toThrow(/changed during this action/);
    expect(await authorizeKeyExport('', store)).toBeUndefined();
  });

  it('arms the step-up when a saved vault for exactly the loaded keys is read', async () => {
    const store = new MemoryKeyVaultStore();
    importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    await saveEncryptedVault(PASS, { N: 1 << 14 }, store);
    const record = (await store.get())!;
    clearSession();
    importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    expect(getSessionBackup()?.vaultStepUp).toBe(false);
    await readEncryptedVault(store);
    expect(getSessionBackup()?.vaultStepUp).toBe(true);
    await store.delete(record);
    await expect(authorizeEncryptedVault('', store)).rejects.toThrow(/Wrong passphrase/);
  });
});

describe('C-R2: a vault copy removed outside this tab is noticed when storage is read', () => {
  async function unlockedFromVault(store: MemoryKeyVaultStore): Promise<string> {
    generateSession();
    await saveEncryptedVault(PASS, { N: 1 << 14 }, store);
    const record = (await store.get())!;
    clearSession();
    await unlockEncryptedVault(PASS, store);
    expect(getSessionBackup()).toMatchObject({ backedUp: true, vaultStepUp: true });
    return record;
  }

  it('readEncryptedVault counts the keys as unsaved once their record is gone; the sweep step-up stays armed', async () => {
    const store = new MemoryKeyVaultStore();
    const record = await unlockedFromVault(store);
    await store.delete(record);                         // another tab, or cleared site data
    expect(await readEncryptedVault(store)).toBeUndefined();
    expect(getSessionBackup()).toMatchObject({ backedUp: false, vaultStepUp: true });
    await expect(authorizeEncryptedVault('', store)).rejects.toThrow(/Wrong passphrase/);
  });

  it('authorizeKeyExport does the same, but an unreadable store is not taken for a deletion', async () => {
    const store = new MemoryKeyVaultStore();
    const record = await unlockedFromVault(store);
    const unreadable: KeyVaultStore = { get: () => Promise.reject(new Error('blocked')), putIfEmpty: () => Promise.resolve(), delete: () => Promise.resolve() };
    expect(await authorizeKeyExport(PASS, unreadable)).toBeTypeOf('function');
    expect(getSessionBackup()?.backedUp).toBe(true);
    await store.delete(record);
    expect(await authorizeKeyExport(PASS, store)).toBeTypeOf('function');
    expect(getSessionBackup()).toMatchObject({ backedUp: false, vaultStepUp: true });
  });

  it('a read that began for other keys never forgets the vault the keys loaded now were saved to', async () => {
    const store = new MemoryKeyVaultStore();
    const record = await unlockedFromVault(store);
    let release!: (value: string | undefined) => void;
    const pending: KeyVaultStore = { get: () => new Promise((resolve) => { release = resolve; }), putIfEmpty: () => Promise.resolve(), delete: () => Promise.resolve() };
    const reading = readEncryptedVault(pending);
    await store.delete(record);
    generateSession();
    await saveEncryptedVault(PASS, { N: 1 << 14 }, store);
    release(undefined);                                 // what the read saw between the delete and the new save
    await reading;
    expect(getSessionBackup()).toMatchObject({ backedUp: true, vaultStepUp: true });
  });
});

describe('L1-01: only keys with a copy elsewhere may be wiped', () => {
  it('knows which loaded keys can be recovered after a wipe', async () => {
    const store = new MemoryKeyVaultStore();
    expect(await loadedKeysRecoverable(store)).toBe(false);
    generateSession();
    expect(await loadedKeysRecoverable(store)).toBe(false);
    markKeystoreDownloaded(captureSessionGuard());
    expect(await loadedKeysRecoverable(store)).toBe(true);
    generateSession();
    await saveEncryptedVault(PASS, { N: 1 << 14 }, store);
    expect(getSessionBackup()?.backedUp).toBe(true);
    expect(await loadedKeysRecoverable(store)).toBe(true);
    const record = (await store.get())!;
    await store.delete(record);                         // removed by another tab: the only copy is gone
    expect(await loadedKeysRecoverable(store)).toBe(false);
    await store.putIfEmpty(record);
    await deleteEncryptedVault(record, store, PASS);    // removed here: the keys count as unsaved again
    expect(getSessionBackup()?.backedUp).toBe(false);
    expect(await loadedKeysRecoverable(store)).toBe(false);
    importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    expect(await loadedKeysRecoverable(store)).toBe(true);
    // C-R6: without its signing key the import generates one that exists only in this tab, until a vault save.
    importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW });
    expect(await loadedKeysRecoverable(store)).toBe(false);
    await saveEncryptedVault(PASS, { N: 1 << 14 }, store);
    expect(await loadedKeysRecoverable(store)).toBe(true);
  });

  it('refuses to unlock a saved vault over keys that have no backup unless the user confirmed', async () => {
    const store = new MemoryKeyVaultStore();
    const saved = importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN });
    await saveEncryptedVault(PASS, { N: 1 << 14 }, store);
    const unsaved = generateSession();
    await expect(unlockEncryptedVault(PASS, store)).rejects.toThrow(/no backup/);
    expect(getSessionPublic()).toBe(unsaved);
    await unlockEncryptedVault(PASS, store, undefined, { replaceUnsavedKeys: true });
    expect(getSessionPublic()?.metaAddress).toBe(saved.metaAddress);
    expect(getSessionBackup()).toMatchObject({ backedUp: true, vaultStepUp: true });
  });
});
