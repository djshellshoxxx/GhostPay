import { afterEach, describe, expect, it } from 'vitest';
import { clearSession, exportKeystore, generateSession, getSessionBackup, importSession, markKeystoreDownloaded, captureSessionGuard, sessionVaultRecord, verifyCredentialForCurrentSession } from './session';
import { MemoryKeyVaultStore, readEncryptedVault, requireSecretExportAuthorization, saveEncryptedVault, type KeyVaultStore } from './keyVault';

const PASS = 'violet comet maple lantern';
const N = { N: 1 << 14 };
const SPEND = '11'.repeat(32);
const VIEW = '22'.repeat(32);
const SIGN = '33'.repeat(32);
const load = (): void => { importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: SIGN }); };

afterEach(() => { clearSession(); });

describe('requireSecretExportAuthorization (spec 18 re-authentication)', () => {
  it('refuses without a vault: having no vault is never success', async () => {
    load();
    await expect(requireSecretExportAuthorization({ kind: 'vault', passphrase: PASS }, undefined, new MemoryKeyVaultStore())).rejects.toThrow(/No encrypted vault for the loaded keys/);
    const unreadable: KeyVaultStore = { get: () => Promise.reject(new Error('blocked')), putIfEmpty: () => Promise.resolve(), delete: () => Promise.resolve() };
    await expect(requireSecretExportAuthorization({ kind: 'vault', passphrase: PASS }, undefined, unreadable)).rejects.toThrow(/No encrypted vault for the loaded keys/);
  });

  it('accepts the saved vault of the loaded keys with its passphrase and returns their guard', async () => {
    const store = new MemoryKeyVaultStore();
    load();
    await saveEncryptedVault(PASS, N, store);
    const guard = await requireSecretExportAuthorization({ kind: 'vault', passphrase: PASS }, undefined, store);
    expect(guard).toBeTypeOf('function');
    guard();
    importSession({ spendingKeyHex: '44'.repeat(32), viewingKeyHex: '55'.repeat(32), signingKeyHex: '66'.repeat(32) });
    expect(() => { guard(); }).toThrow(/changed during this action/);
  });

  it('finds a saved vault naming the loaded meta-address without changing what the session records', async () => {
    const store = new MemoryKeyVaultStore();
    load();
    await saveEncryptedVault(PASS, N, store);
    clearSession();
    load();
    expect(sessionVaultRecord()).toBeUndefined();
    const before = getSessionBackup();
    const guard = await requireSecretExportAuthorization({ kind: 'vault', passphrase: PASS }, undefined, store);
    guard();
    expect(sessionVaultRecord()).toBeUndefined();
    expect(getSessionBackup()).toBe(before);
  });

  it('refuses a wrong vault passphrase, an empty one and a vault that holds other keys', async () => {
    const store = new MemoryKeyVaultStore();
    load();
    await saveEncryptedVault(PASS, N, store);
    await expect(requireSecretExportAuthorization({ kind: 'vault', passphrase: 'wrong passphrase entirely' }, undefined, store)).rejects.toThrow(/Wrong passphrase/);
    await expect(requireSecretExportAuthorization({ kind: 'vault', passphrase: '' }, undefined, store)).rejects.toThrow(/Enter the passphrase of the encrypted vault/);
    clearSession();
    generateSession();
    // The saved vault names another meta-address: it is not these keys' vault, so it cannot authorize them.
    await expect(requireSecretExportAuthorization({ kind: 'vault', passphrase: PASS }, undefined, store)).rejects.toThrow(/No encrypted vault for the loaded keys/);
    // Same spending and viewing keys under another signing key: the vault names the meta-address but not these keys.
    clearSession();
    importSession({ spendingKeyHex: SPEND, viewingKeyHex: VIEW, signingKeyHex: '77'.repeat(32) });
    await expect(requireSecretExportAuthorization({ kind: 'vault', passphrase: PASS }, undefined, store)).rejects.toThrow(/does not match the loaded seller keys/);
  });

  it('checks the record the keys are tied to, also after it was deleted from storage', async () => {
    const store = new MemoryKeyVaultStore();
    load();
    await saveEncryptedVault(PASS, N, store);
    const record = await readEncryptedVault(store);
    expect(sessionVaultRecord()).toBe(record);
    await store.delete(record as string);
    const guard = await requireSecretExportAuthorization({ kind: 'vault', passphrase: PASS }, undefined, store);
    guard();
  });

  it('accepts a keystore backup file of exactly the loaded keys and records nothing (no backup verification)', async () => {
    load();
    const other = await exportKeystore(PASS, N);
    clearSession();
    generateSession();
    const file = await exportKeystore(PASS, N);
    // Downloaded but unverified (GP-PAGES-02): an export re-authentication with the file must not verify the backup.
    markKeystoreDownloaded(captureSessionGuard());
    const before = getSessionBackup();
    expect(before).toMatchObject({ backedUp: true, verified: false });
    const guard = await requireSecretExportAuthorization({ kind: 'keystore', text: file, passphrase: PASS });
    guard();
    expect(getSessionBackup()).toBe(before);
    await expect(requireSecretExportAuthorization({ kind: 'keystore', text: other, passphrase: PASS })).rejects.toThrow(/does not hold the loaded seller keys/);
    await expect(requireSecretExportAuthorization({ kind: 'keystore', text: file, passphrase: 'wrong passphrase entirely' })).rejects.toThrow(/Wrong passphrase/);
    await expect(requireSecretExportAuthorization({ kind: 'keystore', text: file, passphrase: '' })).rejects.toThrow(/Enter the passphrase of your keystore backup file/);
    await expect(requireSecretExportAuthorization({ kind: 'keystore', text: '{"v":1}', passphrase: PASS })).rejects.toThrow();
  });

  it('refuses and returns nothing when the keys are replaced while the passphrase is being checked', async () => {
    const store = new MemoryKeyVaultStore();
    load();
    await saveEncryptedVault(PASS, N, store);
    const file = await exportKeystore(PASS, N);
    const viaVault = requireSecretExportAuthorization({ kind: 'vault', passphrase: PASS }, undefined, store);
    clearSession();
    load();
    await expect(viaVault).rejects.toThrow(/changed during this action/);
    const viaFile = requireSecretExportAuthorization({ kind: 'keystore', text: file, passphrase: PASS });
    clearSession();
    await expect(viaFile).rejects.toThrow(/changed during this action|Load or generate seller keys first/);
  });

  it('refuses a cancelled operation and requires loaded keys', async () => {
    await expect(requireSecretExportAuthorization({ kind: 'vault', passphrase: PASS })).rejects.toThrow(/Load or generate seller keys first/);
    load();
    const file = await exportKeystore(PASS, N);
    const before = new AbortController();
    before.abort();
    await expect(requireSecretExportAuthorization({ kind: 'keystore', text: file, passphrase: PASS }, before.signal)).rejects.toThrow(/export was cancelled/);
    const during = new AbortController();
    const pending = requireSecretExportAuthorization({ kind: 'keystore', text: file, passphrase: PASS }, during.signal);
    during.abort();
    await expect(pending).rejects.toThrow(/export was cancelled/);
    const store = new MemoryKeyVaultStore();
    const slow: KeyVaultStore = { get: async () => { const value = await store.get(); stopped.abort(); return value; }, putIfEmpty: (c, s) => store.putIfEmpty(c, s), delete: (e) => store.delete(e) };
    const stopped = new AbortController();
    await expect(requireSecretExportAuthorization({ kind: 'vault', passphrase: PASS }, stopped.signal, slow)).rejects.toThrow(/export was cancelled/);
  });

  it('verifyCredentialForCurrentSession reports the vault and keystore mismatch apart', async () => {
    load();
    const mine = await exportKeystore(PASS, N);
    clearSession();
    generateSession();
    await expect(verifyCredentialForCurrentSession(mine, PASS, 'vault')).rejects.toThrow(/saved encrypted vault does not match/);
    await expect(verifyCredentialForCurrentSession(mine, PASS, 'keystore')).rejects.toThrow(/does not hold the loaded seller keys/);
  });
});
