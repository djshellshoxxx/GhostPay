import { captureSessionGuard, captureSessionVersionGuard, exportKeystore, importKeystore, verifyVaultForCurrentSession } from './session';
import type { KeystoreOptions } from './keystore';
import { UserFacingError } from './errors';

/** Store interface kept deliberately small so the browser adapter can be replaced in tests. */
export interface KeyVaultStore {
  get(): Promise<string | undefined>;
  putIfEmpty(ciphertext: string): Promise<void>;
  delete(): Promise<void>;
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

  async putIfEmpty(ciphertext: string): Promise<void> {
    const db = await this.db();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      let exists = false;
      const request = tx.objectStore(STORE_NAME).add(ciphertext, RECORD_KEY);
      request.onerror = () => { if (request.error?.name === 'ConstraintError') exists = true; };
      tx.oncomplete = () => { resolve(); };
      tx.onerror = () => {
        reject(new UserFacingError(exists ? 'A saved encrypted vault already exists. Delete it before saving a different key set.' : 'Could not save encrypted browser storage.'));
      };
      tx.onabort = () => {
        reject(new UserFacingError(exists ? 'A saved encrypted vault already exists. Delete it before saving a different key set.' : 'Could not save encrypted browser storage.'));
      };
    });
  }

  async delete(): Promise<void> {
    const db = await this.db();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(RECORD_KEY);
      tx.oncomplete = () => { resolve(); };
      tx.onerror = () => { reject(new UserFacingError('Could not delete encrypted browser storage.')); };
      tx.onabort = () => { reject(new UserFacingError('Could not delete encrypted browser storage.')); };
    });
  }
}

/** In-memory substitute used by tests; its value is always the encrypted keystore text. */
export class MemoryKeyVaultStore implements KeyVaultStore {
  private ciphertext: string | undefined;
  get(): Promise<string | undefined> { return Promise.resolve(this.ciphertext); }
  putIfEmpty(ciphertext: string): Promise<void> {
    if (this.ciphertext !== undefined) throw new UserFacingError('A saved encrypted vault already exists. Delete it before saving a different key set.');
    this.ciphertext = ciphertext;
    return Promise.resolve();
  }
  delete(): Promise<void> { this.ciphertext = undefined; return Promise.resolve(); }
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

export function readEncryptedVault(store: KeyVaultStore = activeStore()): Promise<string | undefined> {
  return store.get();
}

export async function saveEncryptedVault(passphrase: string, options: KeystoreOptions = {}, store: KeyVaultStore = activeStore()): Promise<void> {
  const unchanged = captureSessionGuard();
  const ciphertext = await exportKeystore(passphrase, options);
  unchanged();
  if (await store.get() !== undefined) throw new UserFacingError('A saved encrypted vault already exists. Delete it before saving a different key set.');
  unchanged();
  await store.putIfEmpty(ciphertext);
  unchanged();
}

export async function unlockEncryptedVault(passphrase: string, store: KeyVaultStore = activeStore()): Promise<void> {
  const unchanged = captureSessionVersionGuard();
  const ciphertext = await store.get();
  unchanged();
  if (ciphertext === undefined) throw new UserFacingError('No encrypted seller vault is saved in this browser.');
  await importKeystore(ciphertext, passphrase);
}

export async function authorizeEncryptedVault(passphrase: string, store: KeyVaultStore = activeStore()): Promise<(() => void) | undefined> {
  const unchanged = captureSessionVersionGuard();
  const ciphertext = await store.get();
  unchanged();
  if (ciphertext === undefined) return undefined;
  return verifyVaultForCurrentSession(ciphertext, passphrase);
}

export async function deleteEncryptedVault(store: KeyVaultStore = activeStore()): Promise<void> {
  await store.delete();
}
