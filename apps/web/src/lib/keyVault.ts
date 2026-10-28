import {
  armSessionVault,
  captureSessionGuard,
  captureSessionVersionGuard,
  exportKeystore,
  forgetSessionVaultCopy,
  getSessionBackup,
  getSessionPublic,
  importKeystore,
  sessionHasExternalCopy,
  sessionVaultRecord,
  verifyVaultForCurrentSession,
} from './session';
import { decryptKeystore, validateKeystoreEnvelope, type KeystoreOptions } from './keystore';
import { UserFacingError } from './errors';

/** Store interface kept deliberately small so the browser adapter can be replaced in tests. */
export interface KeyVaultStore {
  get(): Promise<string | undefined>;
  /**
   * Atomically adds the ciphertext only if no vault exists. `stillCurrent` throws once the initiating key session is
   * gone; adapters call it after any asynchronous wait and before the write can commit, and must not commit after it throws.
   */
  putIfEmpty(ciphertext: string, stillCurrent: () => void): Promise<void>;
  /** Deletes the vault only if the stored record still equals `expected`, atomically; otherwise rejects with VaultChangedError. */
  delete(expected: string): Promise<void>;
}

/** The stored vault is no longer the record the user confirmed deleting; nothing was deleted. */
export class VaultChangedError extends UserFacingError {
  public constructor() {
    super('The saved encrypted vault changed since you asked to delete it, so nothing was deleted. Review the current vault and try again.');
    this.name = 'VaultChangedError';
  }
}

const DB_NAME = 'ghostpay-encrypted-seller-vault';
const DB_VERSION = 1;
const STORE_NAME = 'vault';
const RECORD_KEY = 'current';

/** IndexedDB record values are the encrypted keystore text only; the stable key is stored out-of-line. */
export class IndexedDbKeyVaultStore implements KeyVaultStore {
  private dbPromise: Promise<IDBDatabase> | undefined;

  private db(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') return Promise.reject(new UserFacingError('Encrypted browser storage is unavailable.'));
    this.dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => { resolve(request.result); };
      request.onerror = () => { reject(new UserFacingError('Could not open encrypted browser storage.')); };
      request.onblocked = () => { reject(new UserFacingError('Encrypted browser storage is blocked by another tab.')); };
    });
    return this.dbPromise;
  }

  async get(): Promise<string | undefined> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      let result: string | undefined;
      let invalid = false;
      request.onsuccess = () => {
        if (request.result === undefined) result = undefined;
        else if (typeof request.result === 'string') result = request.result;
        else invalid = true;
      };
      request.onerror = () => { reject(new UserFacingError('Could not read encrypted browser storage.')); };
      tx.oncomplete = () => {
        if (invalid) reject(new UserFacingError('The saved encrypted vault record is invalid.'));
        else resolve(result);
      };
      tx.onerror = () => { reject(new UserFacingError('Could not read encrypted browser storage.')); };
      tx.onabort = () => { reject(new UserFacingError('Could not read encrypted browser storage.')); };
    });
  }

  async putIfEmpty(ciphertext: string, stillCurrent: () => void): Promise<void> {
    const db = await this.db();
    stillCurrent();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      let exists = false;
      let stale: Error | undefined;
      const request = tx.objectStore(STORE_NAME).add(ciphertext, RECORD_KEY);
      // Last point before the transaction can commit: abort it if the initiating session has been revoked meanwhile.
      request.onsuccess = () => {
        try { stillCurrent(); } catch (error) {
          stale = error instanceof Error ? error : new UserFacingError('Seller keys changed during this action. Try again.');
          tx.abort();
        }
      };
      request.onerror = () => { if (request.error?.name === 'ConstraintError') exists = true; };
      const failed = (): void => {
        reject(stale ?? new UserFacingError(exists ? 'A saved encrypted vault already exists. Delete it before saving a different key set.' : 'Could not save encrypted browser storage.'));
      };
      tx.oncomplete = () => { resolve(); };
      tx.onerror = failed;
      tx.onabort = failed;
    });
  }

  async delete(expected: string): Promise<void> {
    const db = await this.db();
    await new Promise<void>((resolve, reject) => {
      // Compare and delete inside one readwrite transaction so another tab cannot replace the record in between.
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(RECORD_KEY);
      let changed = false;
      request.onsuccess = () => {
        if (request.result === expected) store.delete(RECORD_KEY);
        else changed = true;
      };
      tx.oncomplete = () => { if (changed) reject(new VaultChangedError()); else resolve(); };
      tx.onerror = () => { reject(new UserFacingError('Could not delete encrypted browser storage.')); };
      tx.onabort = () => { reject(new UserFacingError('Could not delete encrypted browser storage.')); };
    });
  }
}

/** In-memory substitute used by tests; its value is always the encrypted keystore text. */
export class MemoryKeyVaultStore implements KeyVaultStore {
  private ciphertext: string | undefined;
  get(): Promise<string | undefined> { return Promise.resolve(this.ciphertext); }
  /** The guard is optional only so tests can seed a record directly; saveEncryptedVault always passes one. */
  putIfEmpty(ciphertext: string, stillCurrent?: () => void): Promise<void> {
    stillCurrent?.();
    if (this.ciphertext !== undefined) throw new UserFacingError('A saved encrypted vault already exists. Delete it before saving a different key set.');
    this.ciphertext = ciphertext;
    return Promise.resolve();
  }
  delete(expected: string): Promise<void> {
    if (this.ciphertext !== expected) return Promise.reject(new VaultChangedError());
    this.ciphertext = undefined;
    return Promise.resolve();
  }
}

const browserStore = new IndexedDbKeyVaultStore();
let testStore: KeyVaultStore | undefined;

/** Replaces the browser adapter for isolated UI tests. Production code does not call this. */
export function setKeyVaultStoreForTests(store: KeyVaultStore | undefined): void {
  testStore = store;
}

function activeStore(): KeyVaultStore {
  return testStore ?? browserStore;
}

/** The ciphertext was durably saved, but the loaded seller keys changed after the commit. */
export class VaultSavedForPreviousKeysError extends UserFacingError {
  public constructor() {
    super('The encrypted vault was saved for the seller keys that were loaded when you started, but the keys in memory changed afterward. Unlock or delete the saved vault before relying on it.');
    this.name = 'VaultSavedForPreviousKeysError';
  }
}

/** The public meta-address a vault record names, shown before it is deleted; undefined for a record that is not a keystore. */
export function vaultMetaAddress(record: string): string | undefined {
  try {
    return validateKeystoreEnvelope(record).meta.metaAddress;
  } catch {
    return undefined;
  }
}

/** True when `record` names exactly the loaded key set (meta-address and invoice signer). */
function holdsLoadedKeySet(record: string): boolean {
  const loaded = getSessionPublic();
  if (loaded === undefined) return false;
  try {
    const { meta } = validateKeystoreEnvelope(record);
    return meta.metaAddress === loaded.metaAddress && meta.signer === loaded.signerPublicKey;
  } catch {
    return false;
  }
}

/** Proves the user knows `record`'s passphrase without loading its keys; the decrypted bytes are wiped at once. */
async function provePassphrase(record: string, passphrase: string): Promise<void> {
  const secrets = await decryptKeystore(record, passphrase);
  secrets.spendingKey.fill(0);
  secrets.viewingKey.fill(0);
  secrets.signingKey.fill(0);
}

/** Reads the saved vault. A vault for the loaded keys arms their step-up for this session, so deleting it later changes nothing (L1-02). */
export async function readEncryptedVault(store: KeyVaultStore = activeStore()): Promise<string | undefined> {
  const record = await store.get();
  // Compared with the keys loaded when the read completes, so a key change during the read cannot arm the wrong keys.
  if (record !== undefined && holdsLoadedKeySet(record)) armSessionVault(record, () => undefined);
  return record;
}

/**
 * Step-up before the loaded keys leave this tab under a new passphrase (keystore download, a new vault record): when they
 * are tied to a vault (unlocked from or saved to it in this session, or a saved vault names the same meta-address) its
 * passphrase is required (L1-02). Resolves to a guard for the same keys, or to undefined when no vault is involved; a
 * store that cannot be read counts as no vault, because the record these keys were unlocked from is held in memory.
 */
export async function authorizeKeyExport(vaultPassphrase: string, store: KeyVaultStore = activeStore()): Promise<(() => void) | undefined> {
  const unchanged = captureSessionGuard();
  const loaded = getSessionPublic();
  let record = sessionVaultRecord();
  if (record === undefined) {
    const stored = await store.get().catch(() => undefined);
    unchanged();
    if (stored !== undefined && vaultMetaAddress(stored) === loaded?.metaAddress) record = stored;
  }
  if (record === undefined) return undefined;
  await provePassphrase(record, vaultPassphrase);
  unchanged();
  if (holdsLoadedKeySet(record)) armSessionVault(record, unchanged, { stored: (await store.get().catch(() => undefined)) === record });
  return unchanged;
}

/** Saves the loaded keys as the browser vault; keys already tied to a vault need that vault's passphrase first (L1-02). */
export async function saveEncryptedVault(passphrase: string, options: KeystoreOptions = {}, store: KeyVaultStore = activeStore(), vaultPassphrase = ''): Promise<void> {
  const unchanged = captureSessionGuard();
  if (await store.get() !== undefined) throw new UserFacingError('A saved encrypted vault already exists. Delete it before saving a different key set.');
  unchanged();
  if (sessionVaultRecord() !== undefined) {
    await authorizeKeyExport(vaultPassphrase, store);
    unchanged();
  }
  const ciphertext = await exportKeystore(passphrase, options);
  unchanged();
  if (await store.get() !== undefined) throw new UserFacingError('A saved encrypted vault already exists. Delete it before saving a different key set.');
  unchanged();
  await store.putIfEmpty(ciphertext, unchanged);
  // The write is durable now. Never roll it back; if the keys changed after the commit, say exactly what happened.
  try { unchanged(); } catch { throw new VaultSavedForPreviousKeysError(); }
  // These keys now have a copy in this browser, and its passphrase guards them from here on.
  armSessionVault(ciphertext, unchanged, { replace: true, stored: true });
}

/**
 * Unlocks the saved vault into memory. Loaded keys without any backup would be lost for good, so they are replaced only
 * when the caller passes `replaceUnsavedKeys` after the user confirmed (L1-01).
 */
export async function unlockEncryptedVault(passphrase: string, store: KeyVaultStore = activeStore(), signal?: AbortSignal, options: { readonly replaceUnsavedKeys?: boolean } = {}): Promise<void> {
  if (signal?.aborted === true) throw new UserFacingError('The keystore import was closed.');
  if (getSessionBackup()?.backedUp === false && options.replaceUnsavedKeys !== true) {
    throw new UserFacingError('The seller keys loaded now have no backup, and unlocking the vault would replace them. Back them up first, or confirm that they may be replaced.');
  }
  const unchanged = captureSessionVersionGuard();
  const ciphertext = await store.get();
  unchanged();
  if (ciphertext === undefined) throw new UserFacingError('No encrypted seller vault is saved in this browser.');
  await importKeystore(ciphertext, passphrase, signal, 'vault');
}

/**
 * Spending step-up for Sweep. Keys tied to a vault are always checked against that record, also after it was deleted or
 * replaced in storage (L1-02); otherwise any saved vault must hold the loaded keys and accept the passphrase.
 */
export async function authorizeEncryptedVault(passphrase: string, store: KeyVaultStore = activeStore()): Promise<(() => void) | undefined> {
  const unchanged = captureSessionVersionGuard();
  const armed = sessionVaultRecord();
  const ciphertext = armed ?? await store.get();
  unchanged();
  if (ciphertext === undefined) return undefined;
  const guard = await verifyVaultForCurrentSession(ciphertext, passphrase);
  if (armed === undefined) armSessionVault(ciphertext, guard, { stored: true });
  return guard;
}

/**
 * Whether the loaded keys survive a wipe (L1-01): the user holds a copy outside this browser, or the vault record they
 * were unlocked from or saved to is still the one saved here. Without keys, or when storage cannot be read, false. A vault
 * copy found missing (deleted in another tab, site data cleared) is recorded, so the keys count as unsaved again.
 */
export async function loadedKeysRecoverable(store: KeyVaultStore = activeStore()): Promise<boolean> {
  const backup = getSessionBackup();
  if (backup === undefined || !backup.backedUp) return false;
  if (sessionHasExternalCopy()) return true;
  const record = sessionVaultRecord();
  if (record === undefined) return false;
  let stored: string | undefined;
  try {
    stored = await store.get();
  } catch {
    return false;
  }
  if (stored === record) return true;
  forgetSessionVaultCopy(record);
  return false;
}

/**
 * Deletes the saved vault only if it is still exactly the `expected` ciphertext the user confirmed. A vault that names the
 * loaded meta-address is deleted only with its passphrase, so deleting it cannot switch the spending step-up off or wipe
 * the only copy of the loaded keys unnoticed (L1-02); any other record may go once the user saw its meta-address.
 */
export async function deleteEncryptedVault(expected: string, store: KeyVaultStore = activeStore(), passphrase?: string): Promise<void> {
  const unchanged = captureSessionVersionGuard();
  const loaded = getSessionPublic();
  if (loaded !== undefined && vaultMetaAddress(expected) === loaded.metaAddress) {
    if (passphrase === undefined || passphrase === '') throw new UserFacingError('This vault holds the seller keys loaded now. Enter its passphrase to delete it.');
    await provePassphrase(expected, passphrase);
  }
  unchanged();
  await store.delete(expected);
  forgetSessionVaultCopy(expected);
}
