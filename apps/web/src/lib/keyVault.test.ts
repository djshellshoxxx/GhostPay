import { afterEach, describe, expect, it } from 'vitest';
import { clearSession, generateSession, getSessionPublic, importSession, withSessionSecrets } from './session';
import {
  authorizeEncryptedVault,
  deleteEncryptedVault,
  MemoryKeyVaultStore,
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
});
