import type { EncryptedTagRecord, ProfileMeta, TagStore } from './tags';

const DB_NAME = 'ghostpay-tags';
const RECORDS = 'records';
const META = 'meta';

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = (): void => {
      resolve(req.result);
    };
    req.onerror = (): void => {
      reject(new Error('IndexedDB request failed'));
    };
  });
}

/** IndexedDB-backed `TagStore`. Only ciphertext, random ids, HMAC tokens and timestamps are written. */
export class IdbTagStore implements TagStore {
  private dbPromise: Promise<IDBDatabase> | undefined;

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = (): void => {
        const db = open.result;
        const store = db.createObjectStore(RECORDS, { keyPath: 'recordId' });
        store.createIndex('lookup', ['chainId', 'lookupKey'], { unique: false });
        db.createObjectStore(META);
      };
      open.onsuccess = (): void => {
        resolve(open.result);
      };
      open.onerror = (): void => {
        reject(new Error('IndexedDB unavailable'));
      };
    });
    return this.dbPromise;
  }

  private async store(name: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.db()).transaction(name, mode).objectStore(name);
  }

  public async getMeta(): Promise<ProfileMeta | undefined> {
    return (await wrap((await this.store(META, 'readonly')).get('profile'))) as ProfileMeta | undefined;
  }
  public async setMeta(m: ProfileMeta): Promise<void> {
    await wrap((await this.store(META, 'readwrite')).put(m, 'profile'));
  }
  public async put(r: EncryptedTagRecord): Promise<void> {
    await wrap((await this.store(RECORDS, 'readwrite')).put(r));
  }
  public async getByLookup(chainId: number, lookupKey: string): Promise<EncryptedTagRecord | undefined> {
    const idx = (await this.store(RECORDS, 'readonly')).index('lookup');
    return (await wrap(idx.get([chainId, lookupKey]))) as EncryptedTagRecord | undefined;
  }
  public async getAll(): Promise<readonly EncryptedTagRecord[]> {
    return (await wrap((await this.store(RECORDS, 'readonly')).getAll())) as EncryptedTagRecord[];
  }
  public async delete(recordId: string): Promise<void> {
    await wrap((await this.store(RECORDS, 'readwrite')).delete(recordId));
  }
  public async clear(): Promise<void> {
    await wrap((await this.store(RECORDS, 'readwrite')).clear());
    await wrap((await this.store(META, 'readwrite')).clear());
  }
}
