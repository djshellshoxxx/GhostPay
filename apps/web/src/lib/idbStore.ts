import { UserFacingError } from './errors';
import { tagSnapshotsEqual } from './tags';
import type { EncryptedTagRecord, ProfileMeta, TagBatch, TagStore, TagStoreSnapshot } from './tags';

const DB_NAME = 'ghostpay-tags';
const RECORDS = 'records';
const META = 'meta';
const MAX_RECORDS = 100_000;

/** Native IndexedDB adapter. Every writer advances a persistent revision in the profile+records transaction. */
export class IdbTagStore implements TagStore {
  private dbPromise: Promise<IDBDatabase> | undefined;

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      // Upgrade in place, retaining all ciphertext. A v1 writer must close before v2 can open,
      // and cannot reopen afterwards, so stale pre-CAS code cannot revive wiped records.
      const open = indexedDB.open(DB_NAME, 2);
      let blocked = false;
      open.onupgradeneeded = (): void => {
        const db = open.result;
        if (!db.objectStoreNames.contains(RECORDS)) {
          const store = db.createObjectStore(RECORDS, { keyPath: 'recordId' });
          store.createIndex('lookup', ['chainId', 'lookupKey'], { unique: false });
        }
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      open.onblocked = (): void => {
        blocked = true;
        this.dbPromise = undefined;
        reject(new UserFacingError('Close older GhostPay tabs before opening the tag vault. Existing tags have been kept.'));
      };
      open.onsuccess = (): void => {
        if (blocked) { open.result.close(); return; }
        open.result.onversionchange = (): void => { open.result.close(); this.dbPromise = undefined; };
        resolve(open.result);
      };
      open.onerror = (): void => { reject(new Error('IndexedDB unavailable')); };
    });
    return this.dbPromise;
  }

  public async getSnapshot(): Promise<TagStoreSnapshot> {
    const db = await this.db();
    return new Promise<TagStoreSnapshot>((resolve, reject) => {
      const tx = db.transaction([RECORDS, META], 'readonly');
      const meta = tx.objectStore(META).get('profile');
      const revision = tx.objectStore(META).get('revision');
      const records = tx.objectStore(RECORDS).getAll(undefined, MAX_RECORDS + 1);
      tx.oncomplete = (): void => {
        const profile = meta.result as ProfileMeta | undefined;
        if (records.result.length > MAX_RECORDS) { reject(new UserFacingError('Too many stored tags to open safely. Existing tags have been kept.')); return; }
        resolve({ ...(profile === undefined ? {} : { meta: profile }), records: records.result as EncryptedTagRecord[], revision: (revision.result as number | undefined) ?? 0 });
      };
      tx.onabort = (): void => { reject(new Error('IndexedDB snapshot aborted')); };
      tx.onerror = (): void => { reject(new Error('IndexedDB snapshot failed')); };
    });
  }

  public async getMeta(): Promise<ProfileMeta | undefined> { return (await this.getSnapshot()).meta; }
  public async getAll(): Promise<readonly EncryptedTagRecord[]> { return (await this.getSnapshot()).records; }
  public async getByLookup(chainId: number, lookupKey: string): Promise<EncryptedTagRecord | undefined> {
    return (await this.getSnapshot()).records.find((r) => r.chainId === chainId && r.lookupKey === lookupKey);
  }
  public async setMeta(meta: ProfileMeta): Promise<void> { await this.applyBatch({ puts: [], deleteIds: [], meta }); }
  public async put(r: EncryptedTagRecord): Promise<void> { await this.applyBatch({ puts: [r], deleteIds: [] }); }
  public async delete(recordId: string): Promise<void> { await this.applyBatch({ puts: [], deleteIds: [recordId] }); }
  public async clear(): Promise<void> { await this.applyBatch({ puts: [], deleteIds: [], clear: true }); }

  /** CAS and lifetime guards run in request callbacks, without crypto awaits keeping a transaction alive. */
  public async applyBatch(b: TagBatch, expected?: TagStoreSnapshot, guard?: () => void): Promise<void> {
    guard?.();
    const db = await this.db();
    guard?.();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([RECORDS, META], 'readwrite');
      let failure: Error | undefined;
      const checked = (action: () => void): void => {
        try { guard?.(); action(); } catch (error) { failure = error instanceof Error ? error : new Error('IndexedDB batch guard failed'); tx.abort(); }
      };
      tx.oncomplete = (): void => { resolve(); };
      tx.onerror = (): void => { reject(failure ?? new Error('IndexedDB batch failed')); };
      tx.onabort = (): void => { reject(failure ?? new Error('IndexedDB batch aborted')); };
      const meta = tx.objectStore(META);
      const request = meta.get('revision');
      const profile = meta.get('profile');
      const currentRecords = tx.objectStore(RECORDS).getAll(undefined, MAX_RECORDS + 1);
      currentRecords.onsuccess = (): void => {
        checked(() => {
          const revision = (request.result as number | undefined) ?? 0;
          if (b.clear !== true && currentRecords.result.length > MAX_RECORDS) throw new UserFacingError('Too many stored tags to modify safely. Existing tags have been kept.');
          const currentMeta = profile.result as ProfileMeta | undefined;
          const current = { ...(currentMeta === undefined ? {} : { meta: currentMeta }), records: currentRecords.result as EncryptedTagRecord[], revision };
          if (expected !== undefined && !tagSnapshotsEqual(expected, current)) throw new UserFacingError('Tags changed since the preview or operation began. Preview the import again.');
          const nextIds = new Set(b.clear === true ? [] : current.records.map((r) => r.recordId));
          for (const id of b.deleteIds) nextIds.delete(id);
          for (const r of b.puts) nextIds.add(r.recordId);
          if (nextIds.size > MAX_RECORDS) throw new UserFacingError('Too many tags to store safely. Existing tags have been kept.');
          const records = tx.objectStore(RECORDS);
          if (b.clear === true) { records.clear(); meta.delete('profile'); }
          for (const id of b.deleteIds) records.delete(id);
          for (const r of b.puts) records.put(r);
          if (b.meta !== undefined) meta.put(b.meta, 'profile');
          // Wipe retains this tombstone so old snapshots can never match a new empty profile.
          const last = meta.put(revision + 1, 'revision');
          last.onsuccess = (): void => { checked(() => {}); };
        });
      };
    });
  }
}
