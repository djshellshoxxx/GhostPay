import { afterEach, describe, expect, it } from 'vitest';
import { clearSession, generateSession, getSessionPublic, importSession, withSessionSecrets } from './session';
import {
  authorizeEncryptedVault,
  deleteEncryptedVault,
  MemoryKeyVaultStore,
  IndexedDbKeyVaultStore,
  readEncryptedVault,
  saveEncryptedVault,
  unlockEncryptedVault,
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
    await deleteEncryptedVault(store);
    expect(await readEncryptedVault(store)).toBeUndefined();
  });

  it('fails closed when IndexedDB is unavailable and handles an empty saved vault', async () => {
    const store = new IndexedDbKeyVaultStore();
    await expect(store.get()).rejects.toThrow(/storage is unavailable/);
    await expect(store.putIfEmpty('ciphertext')).rejects.toThrow(/storage is unavailable/);
    await expect(store.delete()).rejects.toThrow(/storage is unavailable/);
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

    const competing = new MemoryKeyVaultStore();
    const outcomes = await Promise.allSettled([
      saveEncryptedVault(PASS, { N: 1 << 14 }, competing),
      saveEncryptedVault(PASS, { N: 1 << 14 }, competing),
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
});
